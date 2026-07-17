<script setup>
import { computed, onBeforeUnmount, ref } from 'vue'
import {
  NAlert,
  NButton,
  NCard,
  NDropdown,
  NInputNumber,
  NSelect,
  NSkeleton,
  NTag,
  useDialog,
  useMessage,
} from 'naive-ui'
import { ChevronDown, Play, RotateCcw } from '@lucide/vue'
import PageHeader from '@/components/PageHeader.vue'
import { api } from '@/api/index.js'
import { usePolling } from '@/composables/usePolling.js'
import { errorMessage } from '@/utils/format.js'

const message = useMessage()
const dialog = useDialog()
const leds = ref([])
const loading = ref(false)
const saving = ref('')
const testing = ref('')
const restoring = ref(false)
const testTimers = new Set()
const blinkTimers = new Map()

const modeOptions = [
  { label: '自动', value: 'auto' },
  { label: '常亮', value: 'on' },
  { label: '熄灭', value: 'off' },
  { label: '闪烁', value: 'blink' },
]

const testOptions = [
  { label: '亮灯 5 秒', key: 'on' },
  { label: '熄灭 5 秒', key: 'off' },
  { label: '闪烁 5 秒', key: 'blink' },
]

const availableCount = computed(() => leds.value.filter((led) => led.available).length)

function applyResponse(data) {
  if (Array.isArray(data?.leds)) leds.value = data.leds
}

async function load(silent = false) {
  if (loading.value || saving.value || restoring.value || blinkTimers.size) return
  if (!silent) loading.value = true
  try {
    const response = await api.getLeds()
    applyResponse(response.data)
  } catch (error) {
    if (!silent) message.error(errorMessage(error))
  } finally {
    loading.value = false
  }
}

async function savePolicy(led, patch, successMessage) {
  if (!led.available || saving.value) return
  saving.value = led.id
  let failed = false
  try {
    const response = await api.updateLed(led.id, {
      mode: patch.mode ?? led.mode,
      blink_on_ms: patch.blink_on_ms ?? led.blink_on_ms,
      blink_off_ms: patch.blink_off_ms ?? led.blink_off_ms,
    })
    applyResponse(response.data)
    message.success(successMessage)
  } catch (error) {
    failed = true
    message.error(errorMessage(error))
  } finally {
    saving.value = ''
  }
  if (failed) await load(true)
}

function updateBlinkValue(led, key, value) {
  if (!Number.isFinite(value)) return
  led[key] = value
  scheduleBlinkSave(led)
}

function scheduleBlinkSave(led, delay = 500) {
  const current = blinkTimers.get(led.id)
  if (current) window.clearTimeout(current)
  const timer = window.setTimeout(async () => {
    blinkTimers.delete(led.id)
    if (saving.value) {
      scheduleBlinkSave(led, 250)
      return
    }
    await savePolicy(led, {}, `${led.label}闪烁参数已保存`)
  }, delay)
  blinkTimers.set(led.id, timer)
}

async function runTest(led, action) {
  if (!led.available || testing.value) return
  testing.value = led.id
  try {
    const response = await api.testLed(led.id, action, 5)
    applyResponse(response.data)
    message.success(`${led.label}测试已开始`)
    const timer = window.setTimeout(() => {
      testTimers.delete(timer)
      load(true)
    }, 5400)
    testTimers.add(timer)
  } catch (error) {
    message.error(errorMessage(error))
  } finally {
    testing.value = ''
  }
}

function restoreDefaults() {
  dialog.warning({
    title: '恢复默认策略',
    content: '蓝灯恢复 Wi-Fi 活动触发，绿灯恢复蜂窝联网状态，红灯恢复系统心跳。',
    positiveText: '恢复',
    negativeText: '取消',
    async onPositiveClick() {
      restoring.value = true
      try {
        const response = await api.restoreLedDefaults()
        applyResponse(response.data)
        message.success('LED 默认策略已恢复')
      } catch (error) {
        message.error(errorMessage(error))
        return false
      } finally {
        restoring.value = false
      }
      return true
    },
  })
}

function stateText(led) {
  if (!led.available) return '不可用'
  if (led.testing) return '测试中'
  if (led.trigger === 'timer') return '闪烁'
  if (led.trigger === 'heartbeat') return '心跳'
  if (led.trigger === 'phy0tx') return 'Wi-Fi 活动'
  return led.brightness > 0 ? '常亮' : '熄灭'
}

function stateType(led) {
  if (!led.available) return 'error'
  if (led.testing || led.trigger === 'timer') return 'warning'
  return led.brightness > 0 || ['heartbeat', 'phy0tx'].includes(led.trigger) ? 'success' : 'default'
}

usePolling(load)
onBeforeUnmount(() => {
  testTimers.forEach((timer) => window.clearTimeout(timer))
  blinkTimers.forEach((timer) => window.clearTimeout(timer))
})
</script>

<template>
  <main class="page">
    <PageHeader title="LED 管理" :loading="loading" @refresh="load(false)">
      <template #actions>
        <NButton secondary :loading="restoring" :disabled="loading || Boolean(saving)" @click="restoreDefaults">
          <template #icon><RotateCcw :size="16" /></template>
          恢复默认
        </NButton>
      </template>
    </PageHeader>

    <NAlert v-if="leds.length && availableCount < leds.length" type="warning" style="margin-bottom: 12px">
      {{ availableCount }} / {{ leds.length }} 个板载指示灯可用
    </NAlert>

    <NCard class="section-card" title="板载指示灯">
      <template #header-extra>
        <NTag size="small" :type="availableCount === leds.length ? 'success' : 'warning'">
          {{ availableCount }} / {{ leds.length }} 可用
        </NTag>
      </template>

      <div v-if="loading && !leds.length" class="led-loading">
        <NSkeleton v-for="index in 3" :key="index" height="72px" />
      </div>

      <div v-else class="led-table">
        <div class="led-table__head">
          <span>指示灯</span>
          <span>当前状态</span>
          <span>工作模式</span>
          <span>模式参数</span>
          <span>操作</span>
        </div>

        <div v-for="led in leds" :key="led.id" class="led-row">
          <div class="led-identity">
            <span class="led-indicator" :class="[`led-indicator--${led.color}`, { 'led-indicator--active': led.brightness > 0 || led.testing || ['heartbeat', 'phy0tx', 'timer'].includes(led.trigger) }]" />
            <div>
              <strong>{{ led.label }}</strong>
              <span>GPIO{{ led.gpio }} · {{ led.sysfs_name }}</span>
            </div>
          </div>

          <div class="led-state">
            <NTag size="small" :type="stateType(led)">{{ stateText(led) }}</NTag>
            <span v-if="led.trigger" class="mono">{{ led.trigger }}</span>
          </div>

          <NSelect
            :value="led.mode"
            :options="modeOptions"
            :disabled="!led.available || Boolean(saving) || led.testing"
            :loading="saving === led.id"
            @update:value="mode => savePolicy(led, { mode }, `${led.label}策略已更新`)"
          />

          <div class="led-parameters">
            <template v-if="led.mode === 'blink'">
              <label>
                <span>亮</span>
                <NInputNumber
                  :value="led.blink_on_ms"
                  :min="100"
                  :max="60000"
                  :step="100"
                  :disabled="saving === led.id"
                  @update:value="value => updateBlinkValue(led, 'blink_on_ms', value)"
                >
                  <template #suffix>ms</template>
                </NInputNumber>
              </label>
              <label>
                <span>灭</span>
                <NInputNumber
                  :value="led.blink_off_ms"
                  :min="100"
                  :max="60000"
                  :step="100"
                  :disabled="saving === led.id"
                  @update:value="value => updateBlinkValue(led, 'blink_off_ms', value)"
                >
                  <template #suffix>ms</template>
                </NInputNumber>
              </label>
            </template>
            <span v-else-if="led.mode === 'auto'">{{ led.auto_behavior }}</span>
            <span v-else>{{ led.mode === 'on' ? '保持常亮' : '保持熄灭' }}</span>
          </div>

          <NDropdown
            trigger="click"
            :options="testOptions"
            :disabled="!led.available || Boolean(testing) || Boolean(saving)"
            @select="action => runTest(led, action)"
          >
            <NButton class="led-test-button" secondary :loading="testing === led.id" :disabled="!led.available || Boolean(testing) || Boolean(saving)">
              <template #icon><Play :size="15" /></template>
              测试
              <ChevronDown :size="14" />
            </NButton>
          </NDropdown>
        </div>
      </div>
    </NCard>
  </main>
</template>

<style scoped>
.led-loading { display: grid; gap: 8px; }
.led-table { overflow: hidden; border: 1px solid var(--line); border-radius: 5px; }
.led-table__head,
.led-row {
  display: grid;
  grid-template-columns: minmax(190px, 1.35fr) 118px 142px minmax(220px, 1fr) 106px;
  align-items: center;
  gap: 12px;
  padding: 11px 12px;
}
.led-table__head { color: var(--muted); background: var(--panel-subtle); font-size: 10px; }
.led-row { min-height: 76px; border-top: 1px solid var(--line); }
.led-identity { display: flex; min-width: 0; align-items: center; gap: 11px; }
.led-identity > div { min-width: 0; }
.led-identity strong,
.led-identity span { display: block; }
.led-identity strong { color: var(--text); font-size: 13px; font-weight: 620; }
.led-identity div > span { margin-top: 4px; overflow: hidden; color: var(--muted); font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
.led-indicator { width: 14px; height: 14px; flex: 0 0 auto; border: 1px solid color-mix(in srgb, currentColor 55%, transparent); border-radius: 50%; background: color-mix(in srgb, currentColor 18%, transparent); }
.led-indicator--blue { color: #1687c9; }
.led-indicator--green { color: #1b9664; }
.led-indicator--red { color: #d04455; }
.led-indicator--active { background: currentColor; box-shadow: 0 0 0 4px color-mix(in srgb, currentColor 16%, transparent); }
.led-state { display: grid; justify-items: start; gap: 5px; }
.led-state .mono { color: var(--muted); font-size: 9px; }
.led-parameters { display: flex; min-width: 0; align-items: center; gap: 8px; color: var(--muted); font-size: 11px; line-height: 1.45; }
.led-parameters label { display: grid; min-width: 0; grid-template-columns: auto minmax(78px, 1fr); align-items: center; gap: 5px; }
.led-parameters label > span { white-space: nowrap; }

@media (max-width: 900px) {
  .led-table__head { display: none; }
  .led-row { grid-template-columns: minmax(180px, 1fr) 120px 140px; }
  .led-parameters { grid-column: 1 / 3; }
}

@media (max-width: 620px) {
  .led-row { grid-template-columns: minmax(0, 1fr) auto; gap: 12px; }
  .led-state { justify-items: end; }
  .led-row > .n-select { grid-column: 1 / -1; }
  .led-parameters { grid-column: 1 / -1; }
  .led-test-button { justify-self: end; }
}
</style>
