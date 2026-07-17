<script setup>
import { computed, h, reactive, ref } from 'vue'
import {
  NButton,
  NCard,
  NDataTable,
  NForm,
  NFormItem,
  NInput,
  NModal,
  NPopconfirm,
  NSelect,
  NSpace,
  NSwitch,
  NTabPane,
  NTabs,
  NTag,
  useMessage,
} from 'naive-ui'
import { Bell, Eraser, Plus, RefreshCw, RotateCcw, Save, Trash2 } from '@lucide/vue'
import { api } from '@/api/index.js'
import PageHeader from '@/components/PageHeader.vue'
import MetricCard from '@/components/MetricCard.vue'
import { errorMessage } from '@/utils/format.js'

const message = useMessage()
const loading = ref(true)
const actionLoading = ref('')
const tab = ref('channels')
const config = ref({ version: 1, channels: [], rules: [], log_cleanup: {} })
const logs = ref([])
const queue = ref([])
const logTotal = ref(0)
const queueTotal = ref(0)
const logFilter = reactive({ type: '', status: '', q: '', limit: 100 })
const editorOpen = ref(false)
const editorKind = ref('channel')
const editorIndex = ref(-1)
const editor = reactive({ id: '', name: '', type: 'webhook', enabled: true, payload: '{}' })

const channelTypes = [
  ['Webhook', 'webhook'], ['Bark', 'bark'], ['PushPlus', 'pushplus'], ['企业微信应用', 'wecom_app'],
  ['企业微信机器人', 'wecom_robot'], ['钉钉机器人', 'dingtalk_robot'], ['钉钉应用', 'dingtalk_app'],
  ['飞书机器人', 'feishu_robot'], ['Telegram', 'telegram'], ['电子邮件', 'email'], ['Server酱³', 'serverchan3'],
].map(([label, value]) => ({ label, value }))
const eventTypes = [
  { label: '短信', value: 'sms' }, { label: 'DDNS', value: 'ddns' }, { label: '版本更新', value: 'version_update' },
  { label: '系统事件', value: 'system_event' }, { label: '设备状态', value: 'device_status' }, { label: '自动化', value: 'automation' },
]
const statusOptions = [
  { label: '成功', value: 'success' }, { label: '失败', value: 'failed' }, { label: '无可用通道', value: 'no_available_channel' },
  { label: '静默时段', value: 'quiet_hours' }, { label: '未匹配', value: 'unmatched' },
]
const successLogs = computed(() => logs.value.filter((item) => item.status === 'success').length)
const failedLogs = computed(() => logs.value.filter((item) => item.status === 'failed').length)
const enabledChannels = computed(() => config.value.channels.filter((item) => item.enabled).length)

const channelColumns = [
  { title: '名称', key: 'name', minWidth: 160 },
  { title: '类型', key: 'type', width: 150, render: (row) => channelTypes.find((item) => item.value === row.type)?.label || row.type },
  { title: '限流', key: 'rate_limit', width: 150, render: (row) => row.rate_limit?.enabled ? `${row.rate_limit.max_messages} 条 / ${row.rate_limit.window_seconds} 秒` : '未启用' },
  { title: '启用', key: 'enabled', width: 80, render: (row, index) => h(NSwitch, { value: row.enabled, onUpdateValue: (value) => toggleItem('channel', index, value) }) },
  {
    title: '操作', key: 'actions', width: 190,
    render: (row, index) => h(NSpace, { size: 6 }, { default: () => [
      h(NButton, { size: 'small', secondary: true, loading: actionLoading.value === `test-${row.id}`, onClick: () => testChannel(row) }, { default: () => '测试' }),
      h(NButton, { size: 'small', onClick: () => openEditor('channel', index) }, { default: () => '编辑' }),
      h(NButton, { size: 'small', quaternary: true, type: 'error', onClick: () => removeItem('channel', index) }, { icon: () => h(Trash2, { size: 15 }) }),
    ] }),
  },
]
const ruleColumns = [
  { title: '规则名称', key: 'name', minWidth: 180 },
  { title: '事件', key: 'type', width: 120, render: (row) => eventTypes.find((item) => item.value === row.type)?.label || row.type },
  { title: '通道', key: 'channel_ids', minWidth: 180, render: (row) => row.channel_ids?.map((id) => config.value.channels.find((channel) => channel.id === id)?.name || id).join(', ') || '未配置' },
  { title: '启用', key: 'enabled', width: 80, render: (row, index) => h(NSwitch, { value: row.enabled, onUpdateValue: (value) => toggleItem('rule', index, value) }) },
  { title: '操作', key: 'actions', width: 130, render: (row, index) => h(NSpace, { size: 6 }, { default: () => [h(NButton, { size: 'small', onClick: () => openEditor('rule', index) }, { default: () => '编辑' }), h(NButton, { size: 'small', quaternary: true, type: 'error', onClick: () => removeItem('rule', index) }, { icon: () => h(Trash2, { size: 15 }) })] }) },
]
const logColumns = [
  { title: '时间', key: 'created_at', minWidth: 170 },
  { title: '事件', key: 'event_type', width: 110 },
  { title: '摘要', key: 'summary', minWidth: 220 },
  { title: '规则 / 通道', key: 'route', minWidth: 180, render: (row) => `${row.rule_name || '--'} / ${row.channel_name || '--'}` },
  { title: '状态', key: 'status', width: 120, render: (row) => h(NTag, { size: 'small', type: row.status === 'success' ? 'success' : row.status === 'failed' ? 'error' : 'warning' }, { default: () => row.status }) },
  { title: '消息', key: 'message', minWidth: 240 },
]
const queueColumns = [
  { title: '创建时间', key: 'created_at', minWidth: 170 },
  { title: '事件', key: 'event_label', width: 120 },
  { title: '摘要', key: 'summary', minWidth: 220 },
  { title: '通道', key: 'channel_name', minWidth: 140 },
  { title: '状态', key: 'status', width: 110, render: (row) => h(NTag, { size: 'small', type: row.status === 'failed' ? 'error' : 'warning' }, { default: () => row.status }) },
  { title: '重试', key: 'attempt_count', width: 90, render: (row) => `${row.attempt_count} / ${row.max_attempts}` },
  { title: '操作', key: 'actions', width: 120, render: (row) => h(NSpace, { size: 5 }, { default: () => [h(NButton, { size: 'small', quaternary: true, onClick: () => retryQueue(row.id) }, { icon: () => h(RotateCcw, { size: 15 }) }), h(NButton, { size: 'small', quaternary: true, type: 'error', onClick: () => deleteQueue(row.id) }, { icon: () => h(Trash2, { size: 15 }) })] }) },
]

async function load() {
  loading.value = true
  const results = await Promise.allSettled([api.getNotificationConfig(), api.getNotificationLogs(logFilter), api.getNotificationQueue({ limit: 100 })])
  if (results[0].status === 'fulfilled') config.value = results[0].value.data || config.value
  if (results[1].status === 'fulfilled') {
    logs.value = results[1].value.data?.logs || []
    logTotal.value = results[1].value.data?.total || 0
  }
  if (results[2].status === 'fulfilled') {
    queue.value = results[2].value.data?.items || []
    queueTotal.value = results[2].value.data?.total || 0
  }
  const failure = results.find((result) => result.status === 'rejected')
  if (failure && !config.value.channels.length) message.error(errorMessage(failure.reason))
  loading.value = false
}
async function saveConfig() {
  actionLoading.value = 'save'
  try { await api.setNotificationConfig(config.value); message.success('通知配置已保存'); await load() }
  catch (saveError) { message.error(errorMessage(saveError)) }
  finally { actionLoading.value = '' }
}
function toggleItem(kind, index, value) {
  const key = kind === 'channel' ? 'channels' : 'rules'
  config.value[key][index].enabled = value
}
function openEditor(kind, index = -1) {
  editorKind.value = kind
  editorIndex.value = index
  const item = index >= 0 ? config.value[kind === 'channel' ? 'channels' : 'rules'][index] : null
  editor.id = item?.id || crypto.randomUUID()
  editor.name = item?.name || ''
  editor.type = item?.type || (kind === 'channel' ? 'webhook' : 'sms')
  editor.enabled = item?.enabled ?? true
  const payload = item ? { ...item } : {}
  delete payload.id; delete payload.name; delete payload.type; delete payload.enabled
  editor.payload = JSON.stringify(payload, null, 2)
  editorOpen.value = true
}
function commitEditor() {
  let payload
  try { payload = JSON.parse(editor.payload || '{}') }
  catch { message.error('JSON 配置格式不正确'); return }
  const item = { id: editor.id, name: editor.name, type: editor.type, enabled: editor.enabled, ...payload }
  const key = editorKind.value === 'channel' ? 'channels' : 'rules'
  if (editorIndex.value >= 0) config.value[key][editorIndex.value] = item
  else config.value[key].push(item)
  editorOpen.value = false
}
function removeItem(kind, index) {
  const key = kind === 'channel' ? 'channels' : 'rules'
  config.value[key].splice(index, 1)
}
async function testChannel(row) {
  actionLoading.value = `test-${row.id}`
  try { await api.testNotificationChannel(row.id); message.success('测试通知已发送') }
  catch (testError) { message.error(errorMessage(testError)) }
  finally { actionLoading.value = '' }
}
async function retryQueue(id) { try { await api.retryNotificationQueueItem(id); message.success('已加入重试'); await load() } catch (error) { message.error(errorMessage(error)) } }
async function deleteQueue(id) { try { await api.deleteNotificationQueueItem(id); await load() } catch (error) { message.error(errorMessage(error)) } }
async function queueAction(action, success) { try { await action(); message.success(success); await load() } catch (error) { message.error(errorMessage(error)) } }
async function clearLogs() { await queueAction(() => api.clearNotificationLogs(logFilter), '通知日志已清空') }

load()
</script>

<template>
  <main class="page">
    <PageHeader title="通知中心" description="配置消息通道与事件规则，查看投递日志和重试队列" :loading="loading" @refresh="load">
      <template #actions><NButton type="primary" :loading="actionLoading === 'save'" @click="saveConfig"><template #icon><Save :size="16" /></template>保存配置</NButton></template>
    </PageHeader>
    <div class="metric-grid">
      <MetricCard label="启用通道" :value="enabledChannels" :detail="`共 ${config.channels.length} 个通道`" :icon="Bell" :tone="enabledChannels ? 'success' : 'warning'" />
      <MetricCard label="通知规则" :value="config.rules.length" :detail="`${config.rules.filter(item => item.enabled).length} 条已启用`" :icon="Bell" />
      <MetricCard label="成功投递" :value="successLogs" :detail="`当前加载 ${logs.length} 条`" :icon="Bell" tone="success" />
      <MetricCard label="失败 / 队列" :value="`${failedLogs} / ${queueTotal}`" detail="需要检查的通知" :icon="Bell" :tone="failedLogs || queueTotal ? 'warning' : 'success'" />
    </div>

    <NTabs v-model:value="tab" type="line" animated>
      <NTabPane name="channels" tab="通知通道">
        <NCard>
          <template #header-extra><NButton type="primary" secondary @click="openEditor('channel')"><template #icon><Plus :size="16" /></template>添加通道</NButton></template>
          <NDataTable :columns="channelColumns" :data="config.channels" :loading="loading" :scroll-x="850" :row-key="row => row.id" />
        </NCard>
      </NTabPane>
      <NTabPane name="rules" tab="通知规则">
        <NCard>
          <template #header-extra><NButton type="primary" secondary @click="openEditor('rule')"><template #icon><Plus :size="16" /></template>添加规则</NButton></template>
          <NDataTable :columns="ruleColumns" :data="config.rules" :loading="loading" :scroll-x="800" :row-key="row => row.id" />
        </NCard>
      </NTabPane>
      <NTabPane name="logs" :tab="`投递日志 (${logTotal})`">
        <NCard>
          <div class="toolbar">
            <div class="toolbar__group"><NSelect v-model:value="logFilter.type" clearable placeholder="事件类型" :options="eventTypes" style="width: 140px" /><NSelect v-model:value="logFilter.status" clearable placeholder="投递状态" :options="statusOptions" style="width: 150px" /><NInput v-model:value="logFilter.q" clearable placeholder="搜索摘要或消息" style="width: 220px" @keyup.enter="load" /></div>
            <NSpace><NButton secondary @click="load"><template #icon><RefreshCw :size="16" /></template>查询</NButton><NPopconfirm @positive-click="clearLogs"><template #trigger><NButton type="error" secondary><template #icon><Eraser :size="16" /></template>清空</NButton></template>清空当前筛选范围的通知日志？</NPopconfirm></NSpace>
          </div>
          <NDataTable :columns="logColumns" :data="logs" :loading="loading" :scroll-x="1100" :pagination="{ pageSize: 15 }" />
        </NCard>
      </NTabPane>
      <NTabPane name="queue" :tab="`重试队列 (${queueTotal})`">
        <NCard>
          <div class="toolbar"><span>待发送、重试中和失败的通知</span><NSpace><NButton secondary @click="queueAction(() => api.retryAllNotificationQueue(), '已重试全部队列项')"><template #icon><RotateCcw :size="16" /></template>全部重试</NButton><NButton type="error" secondary @click="queueAction(() => api.clearNotificationQueue(), '队列已清空')"><template #icon><Eraser :size="16" /></template>清空队列</NButton></NSpace></div>
          <NDataTable :columns="queueColumns" :data="queue" :loading="loading" :scroll-x="1100" :pagination="{ pageSize: 15 }" />
        </NCard>
      </NTabPane>
    </NTabs>

    <NModal v-model:show="editorOpen" preset="card" :title="`${editorIndex >= 0 ? '编辑' : '添加'}${editorKind === 'channel' ? '通知通道' : '通知规则'}`" style="width: min(680px, calc(100vw - 24px))">
      <NForm label-placement="top">
        <div class="inline-form">
          <NFormItem label="名称"><NInput v-model:value="editor.name" /></NFormItem>
          <NFormItem :label="editorKind === 'channel' ? '通道类型' : '事件类型'"><NSelect v-model:value="editor.type" :options="editorKind === 'channel' ? channelTypes : eventTypes" /></NFormItem>
          <NFormItem label="启用"><NSwitch v-model:value="editor.enabled" /></NFormItem>
          <NFormItem label="ID"><NInput v-model:value="editor.id" class="mono" /></NFormItem>
          <NFormItem label="配置 JSON" class="full json-editor"><NInput v-model:value="editor.payload" type="textarea" :rows="16" /></NFormItem>
        </div>
        <NSpace justify="end"><NButton @click="editorOpen = false">取消</NButton><NButton type="primary" @click="commitEditor">完成</NButton></NSpace>
      </NForm>
    </NModal>
  </main>
</template>
