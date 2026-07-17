<script setup>
import { computed, h, reactive, ref } from 'vue'
import {
  NAlert,
  NButton,
  NCard,
  NCheckbox,
  NDataTable,
  NDivider,
  NForm,
  NFormItem,
  NInput,
  NInputNumber,
  NModal,
  NPopconfirm,
  NSelect,
  NSpace,
  NSwitch,
  NTabPane,
  NTabs,
  NTag,
  useDialog,
  useMessage,
} from 'naive-ui'
import { Bell, Eraser, Plus, RefreshCw, RotateCcw, Trash2 } from '@lucide/vue'
import { api } from '@/api/index.js'
import PageHeader from '@/components/PageHeader.vue'
import MetricCard from '@/components/MetricCard.vue'
import { errorMessage } from '@/utils/format.js'
import {
  allDeviceStatusItems,
  AUTOMATION_EVENT_GROUPS,
  createQuietSchedule,
  createRuleDraft,
  defaultAutomationEventCodes,
  defaultDeviceStatusItems,
  defaultRuleName,
  defaultSystemEventCodes,
  DEFAULT_TEMPLATES,
  DEFAULT_TITLE_TEMPLATES,
  DEVICE_STATUS_GROUPS,
  MATCHER_OPERATORS,
  MATCH_FIELDS,
  normalizeRuleDraft,
  SYSTEM_EVENT_GROUPS,
  TEMPLATE_VARIABLES,
  TITLE_TEMPLATE_VARIABLES,
  WEEKDAYS,
} from '@/utils/notificationRules.js'

const message = useMessage()
const dialog = useDialog()
const loading = ref(true)
const actionLoading = ref('')
const configSaving = ref('')
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
const ruleFormError = ref('')
const editor = reactive({
  id: '', name: '', type: 'webhook', enabled: true, config: {},
  rate_limit: { enabled: false, max_messages: 60, window_seconds: 60 },
  matcher: { field: 'summary', operator: 'always', value: '' },
  channel_ids: [], event_codes: [], title_template: '', template: '', quiet_hours: [],
  ddns_failure_threshold: 1, device_status_items: [],
  device_status_schedule: { mode: 'fixed', interval_minutes: 1440, weekdays: [], times: ['09:00'] },
  device_status_sms_period: 'last_24h',
})
const channelHeadersText = ref('')

const channelTypes = [
  ['Webhook', 'webhook'], ['Bark', 'bark'], ['PushPlus', 'pushplus'], ['企业微信应用', 'wecom_app'],
  ['企业微信机器人', 'wecom_robot'], ['钉钉机器人', 'dingtalk_robot'], ['钉钉应用', 'dingtalk_app'],
  ['飞书机器人', 'feishu_robot'], ['Telegram', 'telegram'], ['电子邮件', 'email'], ['Server酱³', 'serverchan3'],
].map(([label, value]) => ({ label, value }))
const channelFields = {
  webhook: [
    { key: 'url', label: 'Webhook URL' }, { key: 'secret', label: '签名密钥', password: true },
    { key: 'headers', label: '请求头', headers: true, multiline: true, placeholder: 'Content-Type: application/json' },
  ],
  bark: [
    { key: 'server_url', label: 'Server URL' }, { key: 'device_key', label: 'Device Key', password: true },
    { key: 'group', label: '分组' }, { key: 'sound', label: '铃声' },
    { key: 'level', label: '推送等级', options: ['', 'active', 'timeSensitive', 'passive'] },
    { key: 'icon', label: '图标 URL' }, { key: 'auto_copy', label: '自动复制', boolean: true },
    { key: 'save_history', label: '保存历史记录', boolean: true },
  ],
  pushplus: [
    { key: 'token', label: 'Token', password: true }, { key: 'topic', label: 'Topic' },
    { key: 'template', label: 'Template', options: ['', 'txt', 'html', 'markdown'] },
    { key: 'channel', label: 'Channel', options: ['', 'wechat', 'webhook', 'cp', 'mail', 'sms', 'bark', 'gotify'] },
    { key: 'option', label: 'Option' }, { key: 'callback_url', label: 'Callback URL' },
  ],
  wecom_app: [
    { key: 'corp_id', label: 'CorpID' }, { key: 'agent_id', label: 'AgentID' },
    { key: 'secret', label: 'Secret', password: true }, { key: 'to_user', label: 'ToUser' },
    { key: 'to_party', label: 'ToParty' }, { key: 'to_tag', label: 'ToTag' },
    { key: 'safe', label: '保密消息', boolean: true },
  ],
  wecom_robot: [
    { key: 'webhook_url', label: 'Webhook URL' }, { key: 'key', label: 'Webhook Key', password: true },
  ],
  dingtalk_robot: [
    { key: 'webhook_url', label: 'Webhook URL' }, { key: 'access_token', label: 'Access Token', password: true },
    { key: 'secret', label: '加签 Secret', password: true }, { key: 'at_mobiles', label: '@ 手机号' },
    { key: 'at_all', label: '@ 所有人', boolean: true },
  ],
  dingtalk_app: [
    { key: 'app_key', label: 'AppKey' }, { key: 'app_secret', label: 'AppSecret', password: true },
    { key: 'robot_code', label: 'RobotCode' }, { key: 'open_conversation_id', label: 'OpenConversationId' },
    { key: 'msg_key', label: 'MsgKey' },
  ],
  feishu_robot: [
    { key: 'webhook_url', label: 'Webhook URL' }, { key: 'token', label: 'Token', password: true },
    { key: 'secret', label: '加签 Secret', password: true },
  ],
  telegram: [
    { key: 'bot_token', label: 'Bot Token', password: true }, { key: 'chat_id', label: 'Chat ID' },
    { key: 'parse_mode', label: 'Parse Mode', options: ['', 'MarkdownV2', 'HTML'] },
    { key: 'disable_web_page_preview', label: '禁用链接预览', boolean: true },
  ],
  email: [
    { key: 'smtp_host', label: 'SMTP 服务器' }, { key: 'smtp_port', label: 'SMTP 端口', number: true, min: 1 },
    { key: 'smtp_security', label: '安全模式', options: ['implicit_tls', 'starttls', 'none'] },
    { key: 'allow_insecure_tls', label: '允许不安全证书', boolean: true },
    { key: 'username', label: '用户名' }, { key: 'password', label: '密码 / 授权码', password: true },
    { key: 'sender_address', label: '发件人邮箱' }, { key: 'sender_name', label: '发件人名称' },
    { key: 'receiver_addresses', label: '收件人邮箱', multiline: true, placeholder: '多个地址可分行填写' },
    { key: 'message_format', label: '消息格式', options: ['plain', 'html'] },
  ],
  serverchan3: [
    { key: 'send_key', label: 'SendKey', password: true }, { key: 'uid', label: 'UID（可选）' },
    { key: 'channel', label: '发送通道（可选）' }, { key: 'openid', label: 'OpenID / Group（可选）' },
  ],
}
const rateLimitDefaults = {
  webhook: [false, 60, 60], bark: [false, 60, 60], pushplus: [true, 5, 60],
  wecom_app: [true, 30, 60], wecom_robot: [true, 20, 60], dingtalk_robot: [true, 20, 60],
  dingtalk_app: [true, 1000, 60], feishu_robot: [true, 5, 1], telegram: [true, 20, 60],
  email: [true, 20, 60], serverchan3: [true, 5, 60],
}
const activeChannelFields = computed(() => channelFields[editor.type] || [])
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
const activeMatcherFields = computed(() => MATCH_FIELDS[editor.type] || [])
const ruleTitleVariables = computed(() => TITLE_TEMPLATE_VARIABLES[editor.type] || [])
const ruleBodyVariables = computed(() => TEMPLATE_VARIABLES[editor.type] || [])
const deviceStatusPeriodOptions = [
  { label: '今日', value: 'today' },
  { label: '最近 24 小时', value: 'last_24h' },
  { label: '最近 7 天', value: 'last_7d' },
  { label: '累计', value: 'all' },
]

const channelColumns = [
  { title: '名称', key: 'name', minWidth: 160 },
  { title: '类型', key: 'type', width: 150, render: (row) => channelTypes.find((item) => item.value === row.type)?.label || row.type },
  { title: '限流', key: 'rate_limit', width: 150, render: (row) => row.rate_limit?.enabled ? `${row.rate_limit.max_messages} 条 / ${row.rate_limit.window_seconds} 秒` : '未启用' },
  {
    title: '启用', key: 'enabled', width: 80,
    render: (row) => h(NSwitch, {
      value: row.enabled,
      loading: configSaving.value === `channel-${row.id}`,
      disabled: Boolean(configSaving.value),
      onUpdateValue: (value) => toggleItem('channel', row, value),
    }),
  },
  {
    title: '操作', key: 'actions', width: 190,
    render: (row, index) => h(NSpace, { size: 6 }, { default: () => [
      h(NButton, { size: 'small', secondary: true, disabled: Boolean(configSaving.value), loading: actionLoading.value === `test-${row.id}`, onClick: () => testChannel(row) }, { default: () => '测试' }),
      h(NButton, { size: 'small', disabled: Boolean(configSaving.value), onClick: () => openEditor('channel', index) }, { default: () => '编辑' }),
      h(NButton, { size: 'small', quaternary: true, type: 'error', disabled: Boolean(configSaving.value), onClick: () => removeItem('channel', row) }, { icon: () => h(Trash2, { size: 15 }) }),
    ] }),
  },
]
const ruleColumns = [
  { title: '规则名称', key: 'name', minWidth: 180 },
  { title: '事件', key: 'type', width: 120, render: (row) => eventTypes.find((item) => item.value === row.type)?.label || row.type },
  { title: '通道', key: 'channel_ids', minWidth: 180, render: (row) => row.channel_ids?.map((id) => config.value.channels.find((channel) => channel.id === id)?.name || id).join(', ') || '未配置' },
  {
    title: '启用', key: 'enabled', width: 80,
    render: (row) => h(NSwitch, {
      value: row.enabled,
      loading: configSaving.value === `rule-${row.id}`,
      disabled: Boolean(configSaving.value),
      onUpdateValue: (value) => toggleItem('rule', row, value),
    }),
  },
  { title: '操作', key: 'actions', width: 130, render: (row, index) => h(NSpace, { size: 6 }, { default: () => [h(NButton, { size: 'small', disabled: Boolean(configSaving.value), onClick: () => openEditor('rule', index) }, { default: () => '编辑' }), h(NButton, { size: 'small', quaternary: true, type: 'error', disabled: Boolean(configSaving.value), onClick: () => removeItem('rule', row) }, { icon: () => h(Trash2, { size: 15 }) })] }) },
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
async function persistConfig(nextConfig, savingKey, successMessage) {
  if (configSaving.value) return false
  configSaving.value = savingKey
  try {
    await api.setNotificationConfig(nextConfig)
    config.value = nextConfig
    message.success(successMessage)
    return true
  } catch (saveError) {
    message.error(errorMessage(saveError))
    return false
  } finally {
    configSaving.value = ''
  }
}
function toggleItem(kind, item, value) {
  const key = kind === 'channel' ? 'channels' : 'rules'
  const items = config.value[key].map((current) => current.id === item.id ? { ...current, enabled: value } : current)
  const itemLabel = kind === 'channel' ? '通知通道' : '通知规则'
  return persistConfig({ ...config.value, [key]: items }, `${kind}-${item.id}`, `${itemLabel}已${value ? '启用' : '停用'}`)
}
function openEditor(kind, index = -1) {
  editorKind.value = kind
  editorIndex.value = index
  ruleFormError.value = ''
  const item = index >= 0 ? config.value[kind === 'channel' ? 'channels' : 'rules'][index] : null
  if (kind === 'channel') {
    editor.id = item?.id || crypto.randomUUID()
    editor.name = item?.name || ''
    editor.type = item?.type || 'webhook'
    editor.enabled = item?.enabled ?? true
    editor.config = { ...defaultChannelConfig(editor.type), ...(item?.config || {}) }
    editor.rate_limit = { ...defaultRateLimit(editor.type), ...(item?.rate_limit || {}) }
    channelHeadersText.value = headersToText(editor.config.headers)
  } else {
    const enabledChannelIds = config.value.channels.filter((channel) => channel.enabled).map((channel) => channel.id)
    Object.assign(editor, item
      ? normalizeRuleDraft(item, eventTypes)
      : createRuleDraft('sms', enabledChannelIds, eventTypes))
  }
  editorOpen.value = true
}
function defaultRateLimit(type) {
  const [enabled, maxMessages, windowSeconds] = rateLimitDefaults[type] || [true, 20, 60]
  return { enabled, max_messages: maxMessages, window_seconds: windowSeconds }
}
function defaultChannelConfig(type) {
  const defaults = {
    webhook: { url: '', secret: '', headers: {} },
    bark: { server_url: 'https://api.day.app', device_key: '', group: '', sound: '', level: '', icon: '', auto_copy: true, save_history: true },
    pushplus: { token: '', topic: '', template: 'txt', channel: '', option: '', callback_url: '' },
    wecom_app: { corp_id: '', agent_id: '', secret: '', to_user: '@all', to_party: '', to_tag: '', safe: false },
    wecom_robot: { webhook_url: '', key: '' },
    dingtalk_robot: { webhook_url: '', access_token: '', secret: '', at_mobiles: '', at_all: false },
    dingtalk_app: { app_key: '', app_secret: '', robot_code: '', open_conversation_id: '', msg_key: 'sampleText' },
    feishu_robot: { webhook_url: '', token: '', secret: '' },
    telegram: { bot_token: '', chat_id: '', parse_mode: '', disable_web_page_preview: true },
    email: { smtp_host: '', smtp_port: 465, smtp_security: 'implicit_tls', allow_insecure_tls: false, username: '', password: '', sender_address: '', sender_name: '', receiver_addresses: '', message_format: 'plain' },
    serverchan3: { send_key: '', uid: '', channel: '', openid: '' },
  }
  return { ...(defaults[type] || {}) }
}
function changeEditorType(type) {
  const previousType = editor.type
  if (editorKind.value === 'channel') {
    editor.type = type
    editor.config = defaultChannelConfig(type)
    editor.rate_limit = defaultRateLimit(type)
    channelHeadersText.value = ''
    return
  }
  const enabledChannelIds = config.value.channels.filter((channel) => channel.enabled).map((channel) => channel.id)
  const next = createRuleDraft(type, enabledChannelIds, eventTypes, editor.id)
  next.enabled = editor.enabled
  if (editor.name && editor.name !== defaultRuleName(previousType, eventTypes)) next.name = editor.name
  Object.assign(editor, next)
  ruleFormError.value = ''
}
function headersToText(headers) {
  if (!headers || typeof headers !== 'object' || Array.isArray(headers)) return ''
  return Object.entries(headers).map(([key, value]) => `${key}: ${value}`).join('\n')
}
function updateHeaders(value) {
  channelHeadersText.value = value
  const headers = {}
  value.split(/\r?\n/).forEach((line) => {
    const index = line.indexOf(':')
    if (index < 1) return
    const key = line.slice(0, index).trim()
    const headerValue = line.slice(index + 1).trim()
    if (key && headerValue) headers[key] = headerValue
  })
  editor.config.headers = headers
}
async function commitEditor() {
  ruleFormError.value = ''
  if (!editor.name.trim()) {
    if (editorKind.value === 'rule') ruleFormError.value = '请输入规则名称'
    else message.warning('请输入名称')
    return
  }
  let item
  if (editorKind.value === 'channel') {
    item = {
      id: editor.id, name: editor.name.trim(), type: editor.type, enabled: editor.enabled,
      rate_limit: { ...editor.rate_limit }, config: { ...editor.config },
    }
  } else {
    item = {
      id: editor.id,
      name: editor.name.trim(),
      type: editor.type,
      enabled: editor.enabled,
      matcher: { ...editor.matcher },
      channel_ids: [...editor.channel_ids],
      event_codes: [...editor.event_codes],
      title_template: editor.title_template,
      template: editor.template,
      quiet_hours: editor.quiet_hours.map((schedule) => ({ ...schedule, weekdays: [...schedule.weekdays] })),
      ddns_failure_threshold: Math.max(1, Math.trunc(Number(editor.ddns_failure_threshold) || 1)),
      device_status_items: [...editor.device_status_items],
      device_status_schedule: {
        ...editor.device_status_schedule,
        interval_minutes: Math.max(30, Math.trunc(Number(editor.device_status_schedule.interval_minutes) || 1440)),
        weekdays: [...editor.device_status_schedule.weekdays],
        times: [...editor.device_status_schedule.times],
      },
      device_status_sms_period: editor.device_status_sms_period,
    }
  }
  const key = editorKind.value === 'channel' ? 'channels' : 'rules'
  const items = editorIndex.value >= 0
    ? config.value[key].map((current, index) => index === editorIndex.value ? item : current)
    : [...config.value[key], item]
  const itemLabel = editorKind.value === 'channel' ? '通知通道' : '通知规则'
  const saved = await persistConfig(
    { ...config.value, [key]: items },
    'editor',
    `${itemLabel}已${editorIndex.value >= 0 ? '更新' : '添加'}`,
  )
  if (saved) editorOpen.value = false
}
function toggleRuleList(field, value, checked) {
  const values = new Set(editor[field])
  if (checked) values.add(value)
  else values.delete(value)
  editor[field] = [...values]
}
function toggleRuleGroup(field, values, checked) {
  const selected = new Set(editor[field])
  values.forEach((value) => checked ? selected.add(value) : selected.delete(value))
  editor[field] = [...selected]
}
function toggleWeekday(schedule, day) {
  schedule.weekdays = schedule.weekdays.includes(day)
    ? schedule.weekdays.filter((value) => value !== day)
    : [...schedule.weekdays, day].sort((a, b) => a - b)
}
function insertRuleToken(field, token) {
  editor[field] = `${editor[field] || ''}${token}`
}
function addQuietHours() {
  editor.quiet_hours.push(createQuietSchedule())
}
function removeQuietHours(index) {
  editor.quiet_hours.splice(index, 1)
}
function removeItem(kind, item) {
  const key = kind === 'channel' ? 'channels' : 'rules'
  const itemLabel = kind === 'channel' ? '通知通道' : '通知规则'
  dialog.warning({
    title: `删除${itemLabel}`,
    content: `确定删除“${item.name}”吗？此操作无法撤销。`,
    positiveText: '删除',
    negativeText: '取消',
    async onPositiveClick() {
      const items = config.value[key].filter((current) => current.id !== item.id)
      const saved = await persistConfig(
        { ...config.value, [key]: items },
        `delete-${kind}-${item.id}`,
        `${itemLabel}已删除`,
      )
      return saved || false
    },
  })
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
    <PageHeader title="通知中心" description="配置消息通道与事件规则，查看投递日志和重试队列" :loading="loading" @refresh="load" />
    <div class="metric-grid">
      <MetricCard label="启用通道" :value="enabledChannels" :detail="`共 ${config.channels.length} 个通道`" :icon="Bell" :tone="enabledChannels ? 'success' : 'warning'" />
      <MetricCard label="通知规则" :value="config.rules.length" :detail="`${config.rules.filter(item => item.enabled).length} 条已启用`" :icon="Bell" />
      <MetricCard label="成功投递" :value="successLogs" :detail="`当前加载 ${logs.length} 条`" :icon="Bell" tone="success" />
      <MetricCard label="失败 / 队列" :value="`${failedLogs} / ${queueTotal}`" detail="需要检查的通知" :icon="Bell" :tone="failedLogs || queueTotal ? 'warning' : 'success'" />
    </div>

    <NTabs v-model:value="tab" type="line" animated>
      <NTabPane name="channels" tab="通知通道">
        <NCard title="转发通道">
          <template #header-extra><NButton type="primary" secondary :disabled="Boolean(configSaving)" @click="openEditor('channel')"><template #icon><Plus :size="16" /></template>添加通道</NButton></template>
          <NDataTable :columns="channelColumns" :data="config.channels" :loading="loading" :scroll-x="850" :row-key="row => row.id" />
        </NCard>
      </NTabPane>
      <NTabPane name="rules" tab="通知规则">
        <NCard title="转发规则">
          <template #header-extra><NButton type="primary" secondary :disabled="Boolean(configSaving)" @click="openEditor('rule')"><template #icon><Plus :size="16" /></template>添加规则</NButton></template>
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

    <NModal
      v-model:show="editorOpen"
      preset="card"
      :title="`${editorIndex >= 0 ? '编辑' : '添加'}${editorKind === 'channel' ? '通知通道' : '通知规则'}`"
      :closable="configSaving !== 'editor'"
      :mask-closable="configSaving !== 'editor'"
      :style="{ width: editorKind === 'rule' ? 'min(980px, calc(100vw - 24px))' : 'min(680px, calc(100vw - 24px))' }"
      content-style="max-height: calc(100vh - 170px); overflow-y: auto"
    >
      <NForm label-placement="top">
        <div class="inline-form">
          <NFormItem label="名称"><NInput v-model:value="editor.name" /></NFormItem>
          <NFormItem :label="editorKind === 'channel' ? '通道类型' : '事件类型'"><NSelect :value="editor.type" :options="editorKind === 'channel' ? channelTypes : eventTypes" @update:value="changeEditorType" /></NFormItem>
          <NFormItem label="启用"><NSwitch v-model:value="editor.enabled" /></NFormItem>
          <template v-if="editorKind === 'channel'">
            <NFormItem v-for="field in activeChannelFields" :key="field.key" :label="field.label" :class="{ full: field.multiline || field.headers }">
              <NSwitch v-if="field.boolean" v-model:value="editor.config[field.key]" />
              <NInputNumber v-else-if="field.number" v-model:value="editor.config[field.key]" :min="field.min || 0" style="width: 100%" />
              <NSelect v-else-if="field.options" v-model:value="editor.config[field.key]" :options="field.options.map(value => ({ label: value || '默认', value }))" />
              <NInput v-else-if="field.headers" :value="channelHeadersText" type="textarea" :rows="4" :placeholder="field.placeholder" @update:value="updateHeaders" />
              <NInput v-else v-model:value="editor.config[field.key]" :type="field.password ? 'password' : field.multiline ? 'textarea' : 'text'" :rows="field.multiline ? 4 : undefined" :show-password-on="field.password ? 'click' : undefined" :placeholder="field.placeholder" />
            </NFormItem>
            <div class="form-section full">
              <div class="form-section__header"><div><strong>队列保护</strong><span>超过平台频率时排队重试，避免消息丢失</span></div><NSwitch v-model:value="editor.rate_limit.enabled" /></div>
              <div v-if="editor.rate_limit.enabled" class="inline-form" style="margin-top: 12px">
                <NFormItem label="统计周期（秒）"><NInputNumber v-model:value="editor.rate_limit.window_seconds" :min="1" style="width: 100%" /></NFormItem>
                <NFormItem label="最多发送条数"><NInputNumber v-model:value="editor.rate_limit.max_messages" :min="1" style="width: 100%" /></NFormItem>
              </div>
            </div>
          </template>
          <div v-else class="rule-form full">
            <NAlert v-if="ruleFormError" type="error" :show-icon="false">{{ ruleFormError }}</NAlert>

            <template v-if="!['system_event', 'device_status', 'automation'].includes(editor.type)">
              <NDivider title-placement="left">匹配条件</NDivider>
              <div class="rule-match-grid">
                <NFormItem label="匹配字段">
                  <NSelect v-model:value="editor.matcher.field" :options="activeMatcherFields" />
                </NFormItem>
                <NFormItem label="匹配方式">
                  <NSelect v-model:value="editor.matcher.operator" :options="MATCHER_OPERATORS" />
                </NFormItem>
                <NFormItem label="匹配内容">
                  <NInput v-model:value="editor.matcher.value" :disabled="editor.matcher.operator === 'always'" />
                </NFormItem>
              </div>
            </template>

            <template v-if="editor.type === 'ddns'">
              <NDivider title-placement="left">发送策略</NDivider>
              <div class="rule-policy-row">
                <NFormItem label="连续失败推送阈值">
                  <NInputNumber v-model:value="editor.ddns_failure_threshold" :min="1" :precision="0" style="width: 100%" />
                </NFormItem>
                <span>达到阈值后推送；持续失败时按该次数间隔再次推送。</span>
              </div>
            </template>

            <template v-if="editor.type === 'system_event'">
              <NDivider title-placement="left">系统事件</NDivider>
              <div class="rule-section-actions">
                <NButton size="small" secondary @click="editor.event_codes = defaultSystemEventCodes()">恢复默认</NButton>
                <NButton size="small" secondary @click="editor.event_codes = SYSTEM_EVENT_GROUPS.flatMap(group => group.events.map(item => item.code))">全选</NButton>
                <NButton size="small" secondary @click="editor.event_codes = []">清空</NButton>
              </div>
              <div class="rule-option-groups">
                <section v-for="group in SYSTEM_EVENT_GROUPS" :key="group.key" class="rule-option-group" :class="{ 'rule-option-group--wide': group.key === 'resource' }">
                  <div class="rule-option-group__header">
                    <strong>{{ group.label }}</strong>
                    <NCheckbox
                      :checked="group.events.every(item => editor.event_codes.includes(item.code))"
                      :indeterminate="group.events.some(item => editor.event_codes.includes(item.code)) && !group.events.every(item => editor.event_codes.includes(item.code))"
                      @update:checked="toggleRuleGroup('event_codes', group.events.map(item => item.code), $event)"
                    >
                      {{ group.events.filter(item => editor.event_codes.includes(item.code)).length }}/{{ group.events.length }}
                    </NCheckbox>
                  </div>
                  <div class="rule-option-list">
                    <NCheckbox
                      v-for="item in group.events"
                      :key="item.code"
                      :checked="editor.event_codes.includes(item.code)"
                      @update:checked="toggleRuleList('event_codes', item.code, $event)"
                    >
                      {{ item.label }}
                    </NCheckbox>
                  </div>
                </section>
              </div>
            </template>

            <template v-if="editor.type === 'automation'">
              <NDivider title-placement="left">自动化事件类型</NDivider>
              <div class="rule-section-actions">
                <NButton size="small" secondary @click="editor.event_codes = defaultAutomationEventCodes()">恢复默认</NButton>
                <NButton size="small" secondary @click="editor.event_codes = AUTOMATION_EVENT_GROUPS.flatMap(group => group.events.map(item => item.code))">全选</NButton>
                <NButton size="small" secondary @click="editor.event_codes = []">清空</NButton>
              </div>
              <div class="rule-option-groups rule-option-groups--three">
                <section v-for="group in AUTOMATION_EVENT_GROUPS" :key="group.key" class="rule-option-group">
                  <div class="rule-option-group__header">
                    <strong>{{ group.label }}</strong>
                    <NCheckbox
                      :checked="group.events.every(item => editor.event_codes.includes(item.code))"
                      :indeterminate="group.events.some(item => editor.event_codes.includes(item.code)) && !group.events.every(item => editor.event_codes.includes(item.code))"
                      @update:checked="toggleRuleGroup('event_codes', group.events.map(item => item.code), $event)"
                    >
                      {{ group.events.filter(item => editor.event_codes.includes(item.code)).length }}/{{ group.events.length }}
                    </NCheckbox>
                  </div>
                  <div class="rule-option-list">
                    <NCheckbox
                      v-for="item in group.events"
                      :key="item.code"
                      :checked="editor.event_codes.includes(item.code)"
                      @update:checked="toggleRuleList('event_codes', item.code, $event)"
                    >
                      {{ item.label }}
                    </NCheckbox>
                  </div>
                </section>
              </div>
            </template>

            <template v-if="editor.type === 'device_status'">
              <NDivider title-placement="left">推送计划</NDivider>
              <div class="device-status-schedule">
                <NFormItem label="推送方式">
                  <NSelect v-model:value="editor.device_status_schedule.mode" :options="[{ label: '定时', value: 'fixed' }, { label: '间隔', value: 'interval' }]" />
                </NFormItem>
                <NFormItem v-if="editor.device_status_schedule.mode === 'interval'" label="间隔分钟">
                  <NInputNumber v-model:value="editor.device_status_schedule.interval_minutes" :min="30" :step="30" :precision="0" style="width: 100%" />
                </NFormItem>
                <div v-else class="device-status-fixed">
                  <label class="rule-field-label">推送时间<input v-model="editor.device_status_schedule.times[0]" class="rule-time-input" type="time"></label>
                  <div class="weekday-buttons">
                    <NButton
                      v-for="day in WEEKDAYS"
                      :key="day.value"
                      size="small"
                      :type="editor.device_status_schedule.weekdays.includes(day.value) ? 'primary' : 'default'"
                      :secondary="!editor.device_status_schedule.weekdays.includes(day.value)"
                      @click="toggleWeekday(editor.device_status_schedule, day.value)"
                    >
                      {{ day.label }}
                    </NButton>
                  </div>
                </div>
              </div>

              <NDivider title-placement="left">状态内容</NDivider>
              <div class="rule-section-actions">
                <NButton size="small" secondary @click="editor.device_status_items = defaultDeviceStatusItems()">恢复默认</NButton>
                <NButton size="small" secondary @click="editor.device_status_items = allDeviceStatusItems()">全选</NButton>
                <NButton size="small" secondary @click="editor.device_status_items = []">清空</NButton>
              </div>
              <div class="rule-option-groups">
                <section v-for="group in DEVICE_STATUS_GROUPS" :key="group.key" class="rule-option-group">
                  <div class="rule-option-group__header">
                    <strong>{{ group.label }}</strong>
                    <NCheckbox
                      :checked="group.items.every(item => editor.device_status_items.includes(item.key))"
                      :indeterminate="group.items.some(item => editor.device_status_items.includes(item.key)) && !group.items.every(item => editor.device_status_items.includes(item.key))"
                      @update:checked="toggleRuleGroup('device_status_items', group.items.map(item => item.key), $event)"
                    >
                      {{ group.items.filter(item => editor.device_status_items.includes(item.key)).length }}/{{ group.items.length }}
                    </NCheckbox>
                  </div>
                  <div class="rule-option-list">
                    <div v-for="item in group.items" :key="item.key" class="rule-option-item">
                      <NCheckbox
                        :checked="editor.device_status_items.includes(item.key)"
                        @update:checked="toggleRuleList('device_status_items', item.key, $event)"
                      >
                        {{ item.label }}
                      </NCheckbox>
                      <NSelect
                        v-if="item.key === 'sms_forwarding_stats' && editor.device_status_items.includes(item.key)"
                        v-model:value="editor.device_status_sms_period"
                        size="small"
                        :options="deviceStatusPeriodOptions"
                        style="width: 140px"
                      />
                    </div>
                  </div>
                </section>
              </div>
            </template>

            <NDivider title-placement="left">发送通道</NDivider>
            <div v-if="config.channels.length" class="rule-channel-options">
              <div v-for="channel in config.channels" :key="channel.id" class="rule-channel-option" :class="{ 'rule-channel-option--selected': editor.channel_ids.includes(channel.id) }">
                <NCheckbox
                  :checked="editor.channel_ids.includes(channel.id)"
                  @update:checked="toggleRuleList('channel_ids', channel.id, $event)"
                />
                <span>{{ channel.name }}<small v-if="!channel.enabled">已停用</small></span>
              </div>
            </div>
            <span v-else class="rule-empty-copy">请先创建转发通道</span>

            <NDivider title-placement="left">标题模板</NDivider>
            <div class="rule-template-actions">
              <NButton v-for="variable in ruleTitleVariables" :key="variable.token" size="tiny" secondary @click="insertRuleToken('title_template', variable.token)">{{ variable.label }}</NButton>
            </div>
            <NInput v-model:value="editor.title_template" />
            <NButton size="tiny" text type="primary" @click="editor.title_template = DEFAULT_TITLE_TEMPLATES[editor.type]">恢复默认标题</NButton>

            <NDivider title-placement="left">文本模板</NDivider>
            <div class="rule-template-actions">
              <NButton v-for="variable in ruleBodyVariables" :key="variable.token" size="tiny" secondary @click="insertRuleToken('template', variable.token)">{{ variable.label }}</NButton>
            </div>
            <NInput v-model:value="editor.template" type="textarea" :rows="6" />
            <NButton size="tiny" text type="primary" @click="editor.template = DEFAULT_TEMPLATES[editor.type]">恢复默认模板</NButton>

            <NDivider title-placement="left">免打扰时间段</NDivider>
            <div class="rule-section-actions rule-section-actions--end">
              <NButton size="small" secondary @click="addQuietHours"><template #icon><Plus :size="15" /></template>添加时间段</NButton>
            </div>
            <span v-if="!editor.quiet_hours.length" class="rule-empty-copy">未配置免打扰</span>
            <div v-for="(schedule, index) in editor.quiet_hours" :key="`${editor.id}-${index}`" class="quiet-hours-row">
              <div class="weekday-buttons">
                <NButton
                  v-for="day in WEEKDAYS"
                  :key="day.value"
                  size="small"
                  :type="schedule.weekdays.includes(day.value) ? 'primary' : 'default'"
                  :secondary="!schedule.weekdays.includes(day.value)"
                  @click="toggleWeekday(schedule, day.value)"
                >
                  {{ day.label }}
                </NButton>
              </div>
              <label class="rule-field-label">开始<input v-model="schedule.start" class="rule-time-input" type="time"></label>
              <label class="rule-field-label">结束<input v-model="schedule.end" class="rule-time-input" type="time"></label>
              <NSwitch v-model:value="schedule.enabled" />
              <NButton quaternary circle type="error" aria-label="删除免打扰时间段" @click="removeQuietHours(index)"><template #icon><Trash2 :size="16" /></template></NButton>
            </div>
          </div>
        </div>
        <NSpace class="notification-editor-actions" justify="end"><NButton :disabled="configSaving === 'editor'" @click="editorOpen = false">取消</NButton><NButton type="primary" :loading="configSaving === 'editor'" @click="commitEditor">保存</NButton></NSpace>
      </NForm>
    </NModal>
  </main>
</template>
