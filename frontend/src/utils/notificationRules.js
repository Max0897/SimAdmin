export const WEEKDAYS = [
  { value: 1, label: '一' },
  { value: 2, label: '二' },
  { value: 3, label: '三' },
  { value: 4, label: '四' },
  { value: 5, label: '五' },
  { value: 6, label: '六' },
  { value: 7, label: '日' },
]

export const MATCHER_OPERATORS = [
  { value: 'always', label: '全部匹配' },
  { value: 'contains', label: '包含' },
  { value: 'not_contains', label: '不包含' },
  { value: 'equals', label: '等于' },
  { value: 'regex', label: '正则' },
]

export const MATCH_FIELDS = {
  sms: [
    { value: 'summary', label: '内容摘要' },
    { value: 'phone_number', label: '发送方号码' },
    { value: 'content', label: '短信内容' },
    { value: 'verification_code', label: '验证码' },
    { value: 'own_number', label: '本机号码' },
  ],
  ddns: [
    { value: 'summary', label: '内容摘要' },
    { value: 'domains', label: '域名' },
    { value: 'provider', label: '服务商' },
    { value: 'record_type', label: '记录类型' },
    { value: 'status', label: '状态' },
    { value: 'message', label: '消息' },
    { value: 'failure_count', label: '失败次数' },
  ],
  version_update: [
    { value: 'summary', label: '内容摘要' },
    { value: 'version', label: '版本号' },
    { value: 'asset_name', label: '固件包' },
  ],
  system_event: [],
  device_status: [],
  automation: [],
}

export const SYSTEM_EVENT_GROUPS = [
  {
    key: 'baseband', label: '基带',
    events: [
      ['baseband.modem_missing_threshold', 'Modem 丢失达到阈值（连续 5 次）', true],
      ['baseband.modemmanager_restarted', 'watchdog 重启 ModemManager', true],
      ['baseband.modemmanager_restart_failed', 'ModemManager 重启失败', true],
      ['baseband.modem_recovered', 'Modem 恢复成功', true],
      ['baseband.scan_modems_triggered', '触发 mmcli 扫描 Modem（连续 3 次未找到 Modem）', false],
    ],
  },
  {
    key: 'device_network', label: '设备网络',
    events: [
      ['device_network.wlan_connected', 'WLAN 连接', false],
      ['device_network.wlan_disconnected', 'WLAN 断开', false],
      ['device_network.wlan_ssid_changed', 'SSID 变化', false],
      ['device_network.wlan_connect_failed', 'WLAN 连接失败', true],
    ],
  },
  {
    key: 'cellular', label: '蜂窝网络',
    events: [
      ['cellular.searching_threshold', '长时间 searching（连续 4 次）', true],
      ['cellular.auto_register_triggered', '自动驻网触发（searching 连续 4 次）', true],
      ['cellular.radio_cycle_triggered', '射频循环触发（searching 8 次/状态卡住 6 次）', true],
      ['cellular.activation_failed', '拨号/连接激活失败', true],
      ['cellular.connection_recovered', '蜂窝连接恢复', true],
      ['cellular.roaming_allowed_changed', '允许漫游开关变化', true],
      ['cellular.airplane_mode_changed', '飞行模式开关变化', true],
      ['cellular.data_enabled_changed', '数据开关变化', true],
    ],
  },
  {
    key: 'esim', label: 'SIM/eSIM',
    events: [
      ['esim.work_mode_changed', '工作模式切换', true],
      ['esim.lpac_repair_succeeded', 'lpac 修复成功', false],
      ['esim.lpac_repair_failed', 'lpac 修复失败', true],
      ['esim.profile_enable_succeeded', 'Profile 启用成功', false],
      ['esim.profile_enable_failed', 'Profile 启用失败', true],
      ['esim.profile_deleted', 'Profile 删除', true],
      ['esim.profile_switch_baseband_recovery_failed', 'Profile 切换后基带恢复失败', true],
    ],
  },
  {
    key: 'system_service', label: '系统/服务',
    events: [
      ['system_service.system_reboot_requested', '用户触发系统重启', true],
      ['system_service.simadmin_restart_requested', 'SimAdmin 服务重启请求', true],
      ['system_service.service_started', '服务启动完成', false],
      ['system_service.reboot_prep_failed', '系统重启预处理失败', true],
    ],
  },
  {
    key: 'security', label: '安全审计',
    events: [
      ['security.password_changed', '修改密码', true],
      ['security.password_protection_disabled', '关闭密码保护', true],
      ['security.policy_changed', '安全策略变更', true],
      ['security.login_failed_threshold', '连续登录失败达到阈值（5 分钟内 5 次）', true],
    ],
  },
  {
    key: 'resource', label: '资源告警',
    events: [
      ['resource.temperature_high', '高温（>=75°C）', true],
      ['resource.temperature_recovered', '温度恢复（<=65°C 连续 2 次）', true],
      ['resource.disk_low', '磁盘空间不足（<=10% 或 <=500MB）', true],
      ['resource.disk_recovered', '磁盘空间恢复（>=15% 且 >=2GB）', true],
      ['resource.memory_high', '内存持续高占用（>=90% 持续 5 分钟）', true],
      ['resource.memory_recovered', '内存恢复（<=80% 持续 2 分钟）', true],
      ['resource.cpu_high', 'CPU 持续高负载（>=90% 持续 5 分钟）', true],
      ['resource.cpu_recovered', 'CPU 负载恢复（<=75% 持续 2 分钟）', true],
      ['resource.interface_errors_increased', '网络接口错误包增长（连续 3 次）', false],
      ['resource.interface_errors_recovered', '网络接口错误包恢复（连续 2 次）', false],
      ['resource.ipv4_connectivity_failed', 'IPv4 连通性失败（连续 3 次）', true],
      ['resource.ipv4_connectivity_recovered', 'IPv4 连通性恢复（连续 2 次）', true],
      ['resource.ipv6_connectivity_failed', 'IPv6 连通性失败（连续 3 次）', false],
      ['resource.ipv6_connectivity_recovered', 'IPv6 连通性恢复（连续 2 次）', false],
    ],
  },
].map((group) => ({
  ...group,
  events: group.events.map(([code, label, defaultEnabled]) => ({ code, label, defaultEnabled })),
}))

export const AUTOMATION_EVENT_GROUPS = [
  { key: 'restart_baseband', label: '重启基带', events: [['restart_baseband:success', '执行成功'], ['restart_baseband:failed', '执行失败']] },
  { key: 'reboot_device', label: '重启设备', events: [['reboot_device:success', '执行成功'], ['reboot_device:failed', '执行失败']] },
  { key: 'send_sms', label: '发送短信', events: [['send_sms:success', '发送成功'], ['send_sms:failed', '发送失败']] },
].map((group) => ({ ...group, events: group.events.map(([code, label]) => ({ code, label })) }))

export const DEVICE_STATUS_GROUPS = [
  { key: 'device', label: '设备概览', items: [['device_power', '设备在线/上电状态', true], ['device_model', '设备型号/厂商', true], ['system_version', '系统版本/架构', true], ['uptime', '运行时长', true]] },
  { key: 'sim', label: 'SIM/eSIM', items: [['work_mode', '当前工作模式', true], ['sim_present', 'SIM 是否存在', true], ['sim_operator', '运营商 MCC/MNC', true], ['phone_number', '当前号码', false], ['sim_identifiers', 'ICCID/IMSI 脱敏摘要', false]] },
  { key: 'cellular', label: '蜂窝网络', items: [['cellular_registration', '注册状态', true], ['cellular_operator', '当前运营商', true], ['cellular_technology', '网络制式/技术偏好', true], ['signal_strength', '信号强度', true], ['data_connection', '数据连接状态', true], ['airplane_mode', '飞行模式', true], ['roaming', '漫游状态', true], ['cell_summary', '小区摘要', false]] },
  { key: 'wlan', label: 'WLAN', items: [['wlan_enabled', 'WLAN 可用/启用状态', true], ['wlan_connected', 'WLAN 连接状态', true], ['wlan_ssid', '当前 SSID', true], ['wlan_ip', 'WLAN 网关/IP 摘要', false], ['key_interfaces', '关键接口状态', true], ['cellular_traffic', '蜂窝流量', true], ['wifi_traffic', 'Wi-Fi 流量', false]] },
  { key: 'connectivity', label: 'IP 与连通性', items: [['ipv4_connectivity', 'IPv4 连通性', true], ['ipv6_connectivity', 'IPv6 连通性', true], ['default_route', '默认出口接口', true], ['default_ip', '默认出口 IP', true]] },
  { key: 'resource', label: '系统资源', items: [['cpu_usage', 'CPU 使用率', true], ['memory_usage', '内存使用率', true], ['root_disk', '根分区可用空间', true], ['top_temperatures', '双高温度', true]] },
  { key: 'service', label: '服务状态', items: [['service_version', 'SimAdmin 服务/版本', true], ['ddns_status', 'DDNS 状态', true], ['ota_status', 'OTA 更新状态', true]] },
  { key: 'forwarding', label: '转发状态', items: [['sms_forwarding_stats', '短信转发统计', true], ['forwarding_channels', '转发通道数量', true], ['forwarding_rules', '转发规则数量', true]] },
  { key: 'stats', label: '通讯统计', items: [['sms_stats', '短信统计', true]] },
  { key: 'security', label: '安全摘要', items: [['security_password', '密码保护状态', false], ['security_session', '会话/空闲超时', false]] },
].map((group) => ({
  ...group,
  items: group.items.map(([key, label, defaultEnabled]) => ({ key, label, defaultEnabled })),
}))

export const DEFAULT_TITLE_TEMPLATES = {
  sms: '{{发送方号码}}：验证码{{验证码}}',
  ddns: 'DDNS通知：{{本机号码}}',
  version_update: '版本更新通知：{{本机号码}}',
  system_event: '{{分类}}事件：{{本机号码}}',
  device_status: '设备状态：{{本机号码}}',
  automation: '{{任务类型}}：{{本机号码}}',
}

export const DEFAULT_TEMPLATES = {
  sms: '📱 短信通知\n号码: {{发送方号码}}\n内容: {{短信内容}}\n时间: {{时间}}\n来源: {{本机号码}}',
  ddns: 'DDNS 通知\n域名: {{域名}}\nIP 类型: {{IP类型}}\n新 IP: {{新IP}}\n旧 IP: {{旧IP}}\n服务商: {{服务商}}\n记录类型: {{记录类型}}\n状态: {{状态}}\n消息: {{消息}}\n更新时间: {{更新时间}}',
  version_update: '🚀 SimAdmin 发现新版本\n固件包: {{固件包}}\n版本号: {{版本号}}\n时间: {{时间}}\n来源: {{本机号码}}',
  system_event: '系统事件通知\n分类: {{分类}}\n事件: {{事件}}\n等级: {{等级}}\n状态: {{状态}}\n对象: {{对象}}\n消息: {{消息}}\n时间: {{时间}}',
  device_status: '设备状态报告\n【{{状态分类}}】\n{{状态内容}}\n\n时间: {{时间}}',
  automation: '🤖 自动化事件通知\n任务名称: {{任务名称}}\n任务类型: {{任务类型}}\n执行状态: {{任务状态}}\n详情: {{任务详情}}\n时间: {{触发时间}}\n来源: {{本机号码}}',
}

const commonVariables = [
  ['本机号码', '{{本机号码}}'],
  ['运营商', '{{运营商}}'],
]

function variables(values) {
  return values.map(([label, token]) => ({ label, token }))
}

export const TITLE_TEMPLATE_VARIABLES = {
  sms: variables([['发送方号码', '{{发送方号码}}'], ['验证码', '{{验证码}}'], ...commonVariables]),
  ddns: variables(commonVariables),
  version_update: variables(commonVariables),
  system_event: variables([['分类', '{{分类}}'], ['事件', '{{事件}}'], ...commonVariables]),
  device_status: variables(commonVariables),
  automation: variables([['任务名称', '{{任务名称}}'], ['任务类型', '{{任务类型}}'], ...commonVariables]),
}

export const TEMPLATE_VARIABLES = {
  sms: variables([['发送方号码', '{{发送方号码}}'], ['本机号码', '{{本机号码}}'], ['短信内容', '{{短信内容}}'], ['验证码', '{{验证码}}'], ['时间', '{{时间}}'], ['运营商', '{{运营商}}'], ['短信方向', '{{短信方向}}'], ['短信状态', '{{短信状态}}']]),
  ddns: variables([['域名', '{{域名}}'], ['IP 类型', '{{IP类型}}'], ['新 IP', '{{新IP}}'], ['旧 IP', '{{旧IP}}'], ['服务商', '{{服务商}}'], ['记录类型', '{{记录类型}}'], ['状态', '{{状态}}'], ['消息', '{{消息}}'], ['失败次数', '{{失败次数}}'], ['更新时间', '{{更新时间}}'], ...commonVariables]),
  version_update: variables([['固件包', '{{固件包}}'], ['版本号', '{{版本号}}'], ['时间', '{{时间}}'], ...commonVariables]),
  system_event: variables([['分类', '{{分类}}'], ['事件', '{{事件}}'], ['等级', '{{等级}}'], ['状态', '{{状态}}'], ['对象', '{{对象}}'], ['消息', '{{消息}}'], ['时间', '{{时间}}'], ...commonVariables]),
  device_status: variables([['状态分类', '{{状态分类}}'], ['状态内容', '{{状态内容}}'], ['时间', '{{时间}}'], ...commonVariables]),
  automation: variables([['任务名称', '{{任务名称}}'], ['任务类型', '{{任务类型}}'], ['任务状态', '{{任务状态}}'], ['任务详情', '{{任务详情}}'], ['触发时间', '{{触发时间}}'], ...commonVariables]),
}

export function defaultSystemEventCodes() {
  return SYSTEM_EVENT_GROUPS.flatMap((group) => group.events).filter((event) => event.defaultEnabled).map((event) => event.code)
}

export function defaultAutomationEventCodes() {
  return ['restart_baseband:success', 'restart_baseband:failed', 'send_sms:success', 'send_sms:failed']
}

export function defaultDeviceStatusItems() {
  return DEVICE_STATUS_GROUPS.flatMap((group) => group.items).filter((item) => item.defaultEnabled).map((item) => item.key)
}

export function allDeviceStatusItems() {
  return DEVICE_STATUS_GROUPS.flatMap((group) => group.items.map((item) => item.key))
}

export function defaultRuleName(type, eventTypes) {
  return `默认${eventTypes.find((item) => item.value === type)?.label || type}规则`
}

export function createRuleDraft(type, channelIds, eventTypes, id = crypto.randomUUID()) {
  return {
    id,
    type,
    name: defaultRuleName(type, eventTypes),
    enabled: true,
    matcher: { field: 'summary', operator: 'always', value: '' },
    channel_ids: [...channelIds],
    event_codes: type === 'system_event' ? defaultSystemEventCodes() : type === 'automation' ? defaultAutomationEventCodes() : [],
    title_template: DEFAULT_TITLE_TEMPLATES[type],
    template: DEFAULT_TEMPLATES[type],
    quiet_hours: [],
    ddns_failure_threshold: 1,
    device_status_items: type === 'device_status' ? defaultDeviceStatusItems() : [],
    device_status_schedule: { mode: 'fixed', interval_minutes: 1440, weekdays: [1, 2, 3, 4, 5, 6, 7], times: ['09:00'] },
    device_status_sms_period: 'last_24h',
  }
}

export function normalizeRuleDraft(rule, eventTypes) {
  const type = rule?.type || 'sms'
  const defaults = createRuleDraft(type, [], eventTypes, rule?.id || crypto.randomUUID())
  const threshold = Number(rule?.ddns_failure_threshold)
  return {
    ...defaults,
    ...rule,
    matcher: { ...defaults.matcher, ...(rule?.matcher || {}) },
    channel_ids: Array.isArray(rule?.channel_ids) ? [...rule.channel_ids] : [],
    event_codes: Array.isArray(rule?.event_codes) ? [...rule.event_codes] : defaults.event_codes,
    title_template: typeof rule?.title_template === 'string' && rule.title_template.trim() ? rule.title_template : defaults.title_template,
    template: typeof rule?.template === 'string' && rule.template.trim() ? rule.template : defaults.template,
    quiet_hours: Array.isArray(rule?.quiet_hours) ? rule.quiet_hours.map((schedule) => ({ ...schedule, weekdays: [...(schedule.weekdays || [])] })) : [],
    ddns_failure_threshold: Number.isFinite(threshold) && threshold > 0 ? Math.trunc(threshold) : 1,
    device_status_items: Array.isArray(rule?.device_status_items) ? [...rule.device_status_items] : defaults.device_status_items,
    device_status_schedule: {
      ...defaults.device_status_schedule,
      ...(rule?.device_status_schedule || {}),
      weekdays: Array.isArray(rule?.device_status_schedule?.weekdays) ? [...rule.device_status_schedule.weekdays] : defaults.device_status_schedule.weekdays,
      times: Array.isArray(rule?.device_status_schedule?.times) && rule.device_status_schedule.times.length ? [...rule.device_status_schedule.times] : defaults.device_status_schedule.times,
    },
    device_status_sms_period: ['today', 'last_24h', 'last_7d', 'all'].includes(rule?.device_status_sms_period) ? rule.device_status_sms_period : 'last_24h',
  }
}

export function createQuietSchedule() {
  return { enabled: true, weekdays: [1, 2, 3, 4, 5, 6, 7], start: '22:00', end: '08:00' }
}
