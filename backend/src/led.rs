use axum::{
    extract::{Path as AxumPath, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::Mutex;
use tracing::warn;
use zbus::Connection;

use crate::config::{ConfigManager, LedConfig, LedMode, LedPolicy};
use crate::models::ApiResponse;
use crate::modem_manager::get_data_connection_status;

const LED_ROOT: &str = "/sys/class/leds";
const MIN_BLINK_MS: u32 = 100;
const MAX_BLINK_MS: u32 = 60_000;
const MAX_TEST_SECONDS: u64 = 30;

#[derive(Clone, Copy)]
struct LedDescriptor {
    id: &'static str,
    label: &'static str,
    color: &'static str,
    gpio: u16,
    sysfs_name: &'static str,
    auto_trigger: Option<&'static str>,
    auto_behavior: &'static str,
}

const LEDS: [LedDescriptor; 3] = [
    LedDescriptor {
        id: "wifi",
        label: "Wi-Fi 指示灯",
        color: "blue",
        gpio: 20,
        sysfs_name: "blue:wifi",
        auto_trigger: Some("phy0tx"),
        auto_behavior: "Wi-Fi 数据发送时闪烁",
    },
    LedDescriptor {
        id: "internet",
        label: "网络指示灯",
        color: "green",
        gpio: 21,
        sysfs_name: "green:internet",
        auto_trigger: None,
        auto_behavior: "蜂窝数据连接后常亮",
    },
    LedDescriptor {
        id: "system",
        label: "系统指示灯",
        color: "red",
        gpio: 22,
        sysfs_name: "red:os",
        auto_trigger: Some("heartbeat"),
        auto_behavior: "系统运行时心跳闪烁",
    },
];

#[derive(Debug, Default, Serialize)]
pub struct LedListResponse {
    pub leds: Vec<LedStatus>,
}

#[derive(Debug, Default, Serialize)]
pub struct LedStatus {
    pub id: String,
    pub label: String,
    pub color: String,
    pub gpio: u16,
    pub sysfs_name: String,
    pub available: bool,
    pub mode: LedMode,
    pub blink_on_ms: u32,
    pub blink_off_ms: u32,
    pub brightness: u32,
    pub trigger: String,
    pub testing: bool,
    pub auto_behavior: String,
}

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LedTestAction {
    On,
    Off,
    Blink,
}

#[derive(Debug, Deserialize)]
pub struct LedTestRequest {
    pub action: LedTestAction,
    #[serde(default = "default_test_seconds")]
    pub duration_seconds: u64,
}

fn default_test_seconds() -> u64 {
    5
}

#[derive(Default)]
struct RuntimeState {
    next_generation: u64,
    active_tests: HashMap<&'static str, u64>,
}

pub struct LedController {
    config_manager: Arc<ConfigManager>,
    root: PathBuf,
    internet_connected: AtomicBool,
    runtime: Mutex<RuntimeState>,
}

impl LedController {
    pub fn new(config_manager: Arc<ConfigManager>) -> Self {
        Self {
            config_manager,
            root: PathBuf::from(LED_ROOT),
            internet_connected: AtomicBool::new(false),
            runtime: Mutex::new(RuntimeState::default()),
        }
    }

    pub async fn statuses(&self) -> LedListResponse {
        let config = self.config_manager.get_led_config();
        let runtime = self.runtime.lock().await;
        let leds = LEDS
            .iter()
            .map(|descriptor| {
                let path = led_path(&self.root, descriptor);
                let policy = policy_for(&config, descriptor.id);
                LedStatus {
                    id: descriptor.id.to_string(),
                    label: descriptor.label.to_string(),
                    color: descriptor.color.to_string(),
                    gpio: descriptor.gpio,
                    sysfs_name: descriptor.sysfs_name.to_string(),
                    available: led_available(&path),
                    mode: policy.mode,
                    blink_on_ms: policy.blink_on_ms,
                    blink_off_ms: policy.blink_off_ms,
                    brightness: read_u32_attribute(&path, "brightness").unwrap_or(0),
                    trigger: read_attribute(&path, "trigger")
                        .and_then(|value| active_trigger(&value))
                        .unwrap_or_default(),
                    testing: runtime.active_tests.contains_key(descriptor.id),
                    auto_behavior: descriptor.auto_behavior.to_string(),
                }
            })
            .collect();
        LedListResponse { leds }
    }

    pub fn apply_all(&self) -> Result<(), String> {
        let config = self.config_manager.get_led_config();
        apply_config(
            &self.root,
            &config,
            self.internet_connected.load(Ordering::Relaxed),
        )
    }

    pub async fn update_policy(
        &self,
        id: &str,
        policy: LedPolicy,
    ) -> Result<LedListResponse, String> {
        validate_policy(&policy)?;
        let descriptor = descriptor(id).ok_or_else(|| format!("Unsupported LED: {id}"))?;
        ensure_available(&led_path(&self.root, descriptor))?;

        self.cancel_test(descriptor.id).await;
        let old_config = self.config_manager.get_led_config();
        let mut new_config = old_config.clone();
        *policy_for_mut(&mut new_config, descriptor.id) = policy.clone();

        apply_policy(
            &self.root,
            descriptor,
            &policy,
            self.internet_connected.load(Ordering::Relaxed),
        )?;

        if let Err(error) = self.config_manager.set_led_config(new_config) {
            let _ = apply_policy(
                &self.root,
                descriptor,
                policy_for(&old_config, descriptor.id),
                self.internet_connected.load(Ordering::Relaxed),
            );
            let _ = self.config_manager.set_led_config(old_config);
            return Err(error);
        }

        Ok(self.statuses().await)
    }

    pub async fn restore_defaults(&self) -> Result<LedListResponse, String> {
        let old_config = self.config_manager.get_led_config();
        let defaults = LedConfig::default();

        self.cancel_all_tests().await;
        if let Err(error) = apply_config(
            &self.root,
            &defaults,
            self.internet_connected.load(Ordering::Relaxed),
        ) {
            let _ = apply_config(
                &self.root,
                &old_config,
                self.internet_connected.load(Ordering::Relaxed),
            );
            return Err(error);
        }

        if let Err(error) = self.config_manager.set_led_config(defaults) {
            let _ = apply_config(
                &self.root,
                &old_config,
                self.internet_connected.load(Ordering::Relaxed),
            );
            let _ = self.config_manager.set_led_config(old_config);
            return Err(error);
        }

        Ok(self.statuses().await)
    }

    pub async fn test(
        self: &Arc<Self>,
        id: &str,
        request: LedTestRequest,
    ) -> Result<LedListResponse, String> {
        if request.duration_seconds == 0 || request.duration_seconds > MAX_TEST_SECONDS {
            return Err(format!(
                "Test duration must be between 1 and {MAX_TEST_SECONDS} seconds"
            ));
        }

        let descriptor = descriptor(id).ok_or_else(|| format!("Unsupported LED: {id}"))?;
        ensure_available(&led_path(&self.root, descriptor))?;
        let policy = match request.action {
            LedTestAction::On => LedPolicy {
                mode: LedMode::On,
                ..LedPolicy::default()
            },
            LedTestAction::Off => LedPolicy {
                mode: LedMode::Off,
                ..LedPolicy::default()
            },
            LedTestAction::Blink => LedPolicy {
                mode: LedMode::Blink,
                ..LedPolicy::default()
            },
        };

        let generation = {
            let mut runtime = self.runtime.lock().await;
            runtime.next_generation = runtime.next_generation.wrapping_add(1);
            let generation = runtime.next_generation;
            runtime.active_tests.insert(descriptor.id, generation);
            generation
        };

        if let Err(error) = apply_policy(
            &self.root,
            descriptor,
            &policy,
            self.internet_connected.load(Ordering::Relaxed),
        ) {
            self.finish_test(descriptor.id, generation).await;
            return Err(error);
        }

        let controller = Arc::clone(self);
        tokio::spawn(async move {
            tokio::time::sleep(Duration::from_secs(request.duration_seconds)).await;
            if controller.finish_test(descriptor.id, generation).await {
                if let Err(error) = controller.apply_configured_policy(descriptor) {
                    warn!(led = descriptor.id, error = %error, "Failed to restore LED policy after test");
                }
            }
        });

        Ok(self.statuses().await)
    }

    async fn set_internet_connected(&self, connected: bool) {
        let changed = self.internet_connected.swap(connected, Ordering::Relaxed) != connected;
        if !changed || self.is_testing("internet").await {
            return;
        }
        let policy = self.config_manager.get_led_config().internet;
        if policy.mode == LedMode::Auto {
            if let Some(descriptor) = descriptor("internet") {
                if led_available(&led_path(&self.root, descriptor)) {
                    if let Err(error) = apply_policy(&self.root, descriptor, &policy, connected) {
                        warn!(error = %error, "Failed to refresh internet LED");
                    }
                }
            }
        }
    }

    fn apply_configured_policy(&self, descriptor: &'static LedDescriptor) -> Result<(), String> {
        let config = self.config_manager.get_led_config();
        apply_policy(
            &self.root,
            descriptor,
            policy_for(&config, descriptor.id),
            self.internet_connected.load(Ordering::Relaxed),
        )
    }

    async fn cancel_test(&self, id: &'static str) {
        self.runtime.lock().await.active_tests.remove(id);
    }

    async fn cancel_all_tests(&self) {
        self.runtime.lock().await.active_tests.clear();
    }

    async fn is_testing(&self, id: &'static str) -> bool {
        self.runtime.lock().await.active_tests.contains_key(id)
    }

    async fn finish_test(&self, id: &'static str, generation: u64) -> bool {
        let mut runtime = self.runtime.lock().await;
        if runtime.active_tests.get(id) == Some(&generation) {
            runtime.active_tests.remove(id);
            true
        } else {
            false
        }
    }
}

pub fn spawn_internet_led_monitor(controller: Arc<LedController>, connection: Arc<Connection>) {
    tokio::spawn(async move {
        loop {
            match get_data_connection_status(connection.as_ref()).await {
                Ok(connected) => controller.set_internet_connected(connected).await,
                Err(error) => warn!(error = %error, "Failed to read data state for internet LED"),
            }
            tokio::time::sleep(Duration::from_secs(5)).await;
        }
    });
}

pub async fn get_leds_handler(State(controller): State<Arc<LedController>>) -> impl IntoResponse {
    (
        StatusCode::OK,
        Json(ApiResponse::success_with_message(
            "Success",
            controller.statuses().await,
        )),
    )
}

pub async fn update_led_handler(
    AxumPath(id): AxumPath<String>,
    State(controller): State<Arc<LedController>>,
    Json(policy): Json<LedPolicy>,
) -> impl IntoResponse {
    match controller.update_policy(&id, policy).await {
        Ok(response) => (
            StatusCode::OK,
            Json(ApiResponse::success_with_message(
                "LED policy updated",
                response,
            )),
        ),
        Err(error) => (
            StatusCode::BAD_REQUEST,
            Json(ApiResponse::<LedListResponse>::error(error)),
        ),
    }
}

pub async fn test_led_handler(
    AxumPath(id): AxumPath<String>,
    State(controller): State<Arc<LedController>>,
    Json(request): Json<LedTestRequest>,
) -> impl IntoResponse {
    match controller.test(&id, request).await {
        Ok(response) => (
            StatusCode::OK,
            Json(ApiResponse::success_with_message(
                "LED test started",
                response,
            )),
        ),
        Err(error) => (
            StatusCode::BAD_REQUEST,
            Json(ApiResponse::<LedListResponse>::error(error)),
        ),
    }
}

pub async fn restore_led_defaults_handler(
    State(controller): State<Arc<LedController>>,
) -> impl IntoResponse {
    match controller.restore_defaults().await {
        Ok(response) => (
            StatusCode::OK,
            Json(ApiResponse::success_with_message(
                "LED defaults restored",
                response,
            )),
        ),
        Err(error) => (
            StatusCode::BAD_REQUEST,
            Json(ApiResponse::<LedListResponse>::error(error)),
        ),
    }
}

fn descriptor(id: &str) -> Option<&'static LedDescriptor> {
    LEDS.iter().find(|descriptor| descriptor.id == id)
}

fn policy_for<'a>(config: &'a LedConfig, id: &str) -> &'a LedPolicy {
    match id {
        "wifi" => &config.wifi,
        "internet" => &config.internet,
        "system" => &config.system,
        _ => unreachable!("LED policy requested without a safe descriptor"),
    }
}

fn policy_for_mut<'a>(config: &'a mut LedConfig, id: &str) -> &'a mut LedPolicy {
    match id {
        "wifi" => &mut config.wifi,
        "internet" => &mut config.internet,
        "system" => &mut config.system,
        _ => unreachable!("LED policy requested without a safe descriptor"),
    }
}

fn validate_policy(policy: &LedPolicy) -> Result<(), String> {
    if policy.mode == LedMode::Blink
        && (!(MIN_BLINK_MS..=MAX_BLINK_MS).contains(&policy.blink_on_ms)
            || !(MIN_BLINK_MS..=MAX_BLINK_MS).contains(&policy.blink_off_ms))
    {
        return Err(format!(
            "Blink intervals must be between {MIN_BLINK_MS} and {MAX_BLINK_MS} ms"
        ));
    }
    Ok(())
}

fn apply_config(root: &Path, config: &LedConfig, internet_connected: bool) -> Result<(), String> {
    let mut errors = Vec::new();
    for descriptor in &LEDS {
        if !led_available(&led_path(root, descriptor)) {
            continue;
        }
        if let Err(error) = apply_policy(
            root,
            descriptor,
            policy_for(config, descriptor.id),
            internet_connected,
        ) {
            errors.push(error);
        }
    }
    if errors.is_empty() {
        Ok(())
    } else {
        Err(errors.join("; "))
    }
}

fn apply_policy(
    root: &Path,
    descriptor: &LedDescriptor,
    policy: &LedPolicy,
    internet_connected: bool,
) -> Result<(), String> {
    validate_policy(policy)?;
    let path = led_path(root, descriptor);
    ensure_available(&path)?;

    match policy.mode {
        LedMode::Auto => {
            if let Some(trigger) = descriptor.auto_trigger {
                set_trigger(&path, trigger)
            } else {
                set_trigger(&path, "none")?;
                write_attribute(
                    &path,
                    "brightness",
                    if internet_connected { "1" } else { "0" },
                )
            }
        }
        LedMode::On => {
            set_trigger(&path, "none")?;
            write_attribute(&path, "brightness", "1")
        }
        LedMode::Off => {
            set_trigger(&path, "none")?;
            write_attribute(&path, "brightness", "0")
        }
        LedMode::Blink => {
            set_trigger(&path, "timer")?;
            write_attribute(&path, "delay_on", &policy.blink_on_ms.to_string())?;
            write_attribute(&path, "delay_off", &policy.blink_off_ms.to_string())
        }
    }
}

fn led_path(root: &Path, descriptor: &LedDescriptor) -> PathBuf {
    root.join(descriptor.sysfs_name)
}

fn led_available(path: &Path) -> bool {
    path.is_dir() && path.join("brightness").is_file() && path.join("trigger").is_file()
}

fn ensure_available(path: &Path) -> Result<(), String> {
    if led_available(path) {
        Ok(())
    } else {
        Err(format!("LED is unavailable: {}", path.display()))
    }
}

fn set_trigger(path: &Path, trigger: &str) -> Result<(), String> {
    let supported = read_attribute(path, "trigger")
        .ok_or_else(|| format!("Failed to read LED triggers: {}", path.display()))?;
    if !available_triggers(&supported)
        .iter()
        .any(|value| value == trigger)
    {
        return Err(format!("LED trigger is unavailable: {trigger}"));
    }
    write_attribute(path, "trigger", trigger)
}

fn write_attribute(path: &Path, attribute: &str, value: &str) -> Result<(), String> {
    fs::write(path.join(attribute), value).map_err(|error| {
        format!(
            "Failed to write {} for {}: {}",
            attribute,
            path.display(),
            error
        )
    })
}

fn read_attribute(path: &Path, attribute: &str) -> Option<String> {
    fs::read_to_string(path.join(attribute)).ok()
}

fn read_u32_attribute(path: &Path, attribute: &str) -> Option<u32> {
    read_attribute(path, attribute)?.trim().parse().ok()
}

fn available_triggers(value: &str) -> Vec<String> {
    value
        .split_whitespace()
        .map(|trigger| trigger.trim_matches(['[', ']']).to_string())
        .collect()
}

fn active_trigger(value: &str) -> Option<String> {
    value
        .split_whitespace()
        .find(|trigger| trigger.starts_with('[') && trigger.ends_with(']'))
        .map(|trigger| trigger.trim_matches(['[', ']']).to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};

    static NEXT_TEMP_ID: AtomicU64 = AtomicU64::new(0);

    fn fake_led_root() -> PathBuf {
        let root = std::env::temp_dir().join(format!(
            "simadmin-led-test-{}-{}",
            std::process::id(),
            NEXT_TEMP_ID.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir_all(&root).expect("create LED test root");
        root
    }

    fn create_fake_led(root: &Path, descriptor: &LedDescriptor) -> PathBuf {
        let path = led_path(root, descriptor);
        fs::create_dir_all(&path).expect("create fake LED");
        fs::write(path.join("brightness"), "0\n").expect("write brightness");
        fs::write(path.join("trigger"), "[none] timer heartbeat phy0tx\n").expect("write triggers");
        fs::write(path.join("delay_on"), "0\n").expect("write delay_on");
        fs::write(path.join("delay_off"), "0\n").expect("write delay_off");
        path
    }

    #[test]
    fn exposes_only_safe_indicator_leds() {
        let ids: Vec<_> = LEDS.iter().map(|led| led.id).collect();
        assert_eq!(ids, vec!["wifi", "internet", "system"]);
        assert!(LEDS.iter().all(|led| !led.sysfs_name.starts_with("sim:")));
        assert!(descriptor("sim:sel").is_none());
    }

    #[test]
    fn parses_active_and_available_triggers() {
        let value = "none timer [heartbeat] phy0tx";
        assert_eq!(active_trigger(value).as_deref(), Some("heartbeat"));
        assert_eq!(
            available_triggers(value),
            vec!["none", "timer", "heartbeat", "phy0tx"]
        );
    }

    #[test]
    fn validates_blink_intervals() {
        assert!(validate_policy(&LedPolicy {
            mode: LedMode::Blink,
            blink_on_ms: MIN_BLINK_MS,
            blink_off_ms: MAX_BLINK_MS,
        })
        .is_ok());
        assert!(validate_policy(&LedPolicy {
            mode: LedMode::Blink,
            blink_on_ms: MIN_BLINK_MS - 1,
            blink_off_ms: 500,
        })
        .is_err());
    }

    #[test]
    fn applies_timer_policy_to_the_whitelisted_path() {
        let root = fake_led_root();
        let descriptor = descriptor("wifi").expect("wifi descriptor");
        let path = create_fake_led(&root, descriptor);
        let policy = LedPolicy {
            mode: LedMode::Blink,
            blink_on_ms: 250,
            blink_off_ms: 750,
        };

        apply_policy(&root, descriptor, &policy, false).expect("apply blink policy");

        assert_eq!(fs::read_to_string(path.join("trigger")).unwrap(), "timer");
        assert_eq!(fs::read_to_string(path.join("delay_on")).unwrap(), "250");
        assert_eq!(fs::read_to_string(path.join("delay_off")).unwrap(), "750");
        fs::remove_dir_all(root).expect("remove LED test root");
    }

    #[test]
    fn applies_available_leds_when_other_board_leds_are_missing() {
        let root = fake_led_root();
        let descriptor = descriptor("system").expect("system descriptor");
        let path = create_fake_led(&root, descriptor);

        apply_config(&root, &LedConfig::default(), false).expect("apply available LEDs");

        assert_eq!(
            fs::read_to_string(path.join("trigger")).unwrap(),
            "heartbeat"
        );
        fs::remove_dir_all(root).expect("remove LED test root");
    }
}
