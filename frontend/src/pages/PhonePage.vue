<script setup>
import { h, ref } from 'vue'
import {
  NButton,
  NCard,
  NDataTable,
  NInput,
  NPopconfirm,
  NSpace,
  NSwitch,
  NTag,
  useMessage,
} from 'naive-ui'
import { PhoneCall, PhoneIncoming, PhoneOff, Trash2 } from '@lucide/vue'
import { api } from '@/api/index.js'
import PageHeader from '@/components/PageHeader.vue'
import MetricCard from '@/components/MetricCard.vue'
import { usePolling } from '@/composables/usePolling.js'
import { errorMessage, formatDuration } from '@/utils/format.js'

const message = useMessage()
const loading = ref(true)
const actionLoading = ref('')
const phoneNumber = ref('')
const calls = ref([])
const history = ref([])
const stats = ref(null)
const callWaiting = ref(false)

const callColumns = [
  { title: '号码', key: 'phone_number', minWidth: 150 },
  { title: '方向', key: 'direction', width: 90, render: (row) => row.direction === 'incoming' ? '呼入' : '呼出' },
  { title: '状态', key: 'state', width: 110, render: (row) => h(NTag, { size: 'small', type: row.state === 'active' ? 'success' : 'warning' }, { default: () => row.state }) },
  { title: '开始时间', key: 'start_time', minWidth: 170 },
  {
    title: '操作', key: 'actions', width: 160,
    render: (row) => h(NSpace, { size: 6 }, { default: () => [
      row.direction === 'incoming' && row.state !== 'active' ? h(NButton, { size: 'small', type: 'primary', onClick: () => answer(row.path) }, { default: () => '接听' }) : null,
      h(NButton, { size: 'small', type: 'error', secondary: true, onClick: () => hangup(row.path) }, { default: () => '挂断' }),
    ] }),
  },
]
const historyColumns = [
  { title: '号码', key: 'phone_number', minWidth: 150 },
  { title: '方向', key: 'direction', width: 90, render: (row) => row.direction === 'incoming' ? '呼入' : '呼出' },
  { title: '结果', key: 'answered', width: 90, render: (row) => h(NTag, { size: 'small', type: row.answered ? 'success' : 'error' }, { default: () => row.answered ? '已接听' : '未接听' }) },
  { title: '时长', key: 'duration', width: 110, render: (row) => formatDuration(row.duration) },
  { title: '时间', key: 'start_time', minWidth: 180 },
  { title: '操作', key: 'action', width: 70, render: (row) => h(NButton, { quaternary: true, circle: true, type: 'error', onClick: () => removeHistory(row.id) }, { icon: () => h(Trash2, { size: 16 }) }) },
]

async function load(background = false) {
  if (!background) loading.value = true
  const results = await Promise.allSettled([api.getCalls(), api.getCallHistory({ limit: 100 }), api.getCallSettings()])
  if (results[0].status === 'fulfilled') calls.value = results[0].value.data?.calls || []
  if (results[1].status === 'fulfilled') {
    history.value = results[1].value.data?.records || []
    stats.value = results[1].value.data?.stats
  }
  if (results[2].status === 'fulfilled') callWaiting.value = results[2].value.data?.voice_call_waiting === 'enabled'
  const failure = results.find((result) => result.status === 'rejected')
  if (failure && !background) message.error(errorMessage(failure.reason))
  loading.value = false
}
async function action(name, operation, success) {
  actionLoading.value = name
  try { await operation(); message.success(success); await load(true) }
  catch (actionError) { message.error(errorMessage(actionError)) }
  finally { actionLoading.value = '' }
}
function dial() {
  if (!phoneNumber.value.trim()) return
  action('dial', () => api.dialCall(phoneNumber.value.trim()), '已发起呼叫')
}
function answer(path) { action('answer', () => api.answerCall(path), '通话已接听') }
function hangup(path) { action('hangup', () => api.hangupCall(path), '通话已挂断') }
function hangupAll() { action('hangup-all', () => api.hangupAllCalls(), '所有通话已挂断') }
function removeHistory(id) { action('delete', () => api.deleteCallRecord(id), '记录已删除') }
function setWaiting(value) { action('waiting', () => api.setCallWaiting(value), '呼叫等待已更新') }
function clearHistory() { action('clear', () => api.clearCallHistory(), '通话记录已清空') }

usePolling(load)
</script>

<template>
  <main class="page">
    <PageHeader title="电话管理" description="发起和控制语音通话，查看设备通话记录" :loading="loading" @refresh="load(false)" />
    <div class="metric-grid">
      <MetricCard label="当前通话" :value="calls.length" detail="活动与等待中的通话" :icon="PhoneCall" :tone="calls.length ? 'success' : 'primary'" />
      <MetricCard label="全部记录" :value="stats?.total || 0" detail="设备通话历史" :icon="PhoneIncoming" />
      <MetricCard label="未接来电" :value="stats?.missed || 0" detail="需要关注的呼入" :icon="PhoneOff" :tone="stats?.missed ? 'warning' : 'success'" />
      <MetricCard label="累计时长" :value="formatDuration(stats?.total_duration || 0)" detail="已接听通话" :icon="PhoneCall" />
    </div>
    <div class="panel-grid">
      <NCard class="section-card panel--full" title="拨号">
        <div class="toolbar">
          <NInput v-model:value="phoneNumber" placeholder="输入电话号码" style="max-width: 420px" @keyup.enter="dial" />
          <NSpace><span class="status-line">呼叫等待 <NSwitch :value="callWaiting" :loading="actionLoading === 'waiting'" @update:value="setWaiting" /></span><NButton type="primary" :loading="actionLoading === 'dial'" @click="dial"><template #icon><PhoneCall :size="16" /></template>拨号</NButton></NSpace>
        </div>
      </NCard>
      <NCard class="section-card panel--full" title="当前通话">
        <template #header-extra>
          <NPopconfirm v-if="calls.length" @positive-click="hangupAll">
            <template #trigger><NButton type="error" secondary :loading="actionLoading === 'hangup-all'">挂断全部</NButton></template>
            确定挂断当前全部通话？
          </NPopconfirm>
        </template>
        <NDataTable :columns="callColumns" :data="calls" :loading="loading" :scroll-x="780" />
      </NCard>
      <NCard class="section-card panel--full" title="通话记录">
        <template #header-extra><NPopconfirm @positive-click="clearHistory"><template #trigger><NButton quaternary type="error">清空记录</NButton></template>确定清空全部通话记录？</NPopconfirm></template>
        <NDataTable :columns="historyColumns" :data="history" :loading="loading" :scroll-x="850" :pagination="{ pageSize: 15 }" />
      </NCard>
    </div>
  </main>
</template>
