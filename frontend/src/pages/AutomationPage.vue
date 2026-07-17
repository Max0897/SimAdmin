<script setup>
import { computed, h, reactive, ref } from 'vue'
import {
  NAlert,
  NButton,
  NCard,
  NDataTable,
  NForm,
  NFormItem,
  NInput,
  NInputNumber,
  NModal,
  NPagination,
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
import { Bot, Eraser, Plus, Trash2 } from '@lucide/vue'
import { api } from '@/api/index.js'
import PageHeader from '@/components/PageHeader.vue'
import MetricCard from '@/components/MetricCard.vue'
import { errorMessage } from '@/utils/format.js'

const message = useMessage()
const dialog = useDialog()
const loading = ref(true)
const actionLoading = ref('')
const configSaving = ref('')
const tab = ref('tasks')
const config = ref({ enabled: true, tasks: [] })
const notificationConfig = ref(null)
const logs = ref([])
const logTotal = ref(0)
const logPage = ref(1)
const pageSize = 15
const filter = reactive({ type: '', status: '', start_date: '', end_date: '', q: '', limit: pageSize, offset: 0 })
const editorOpen = ref(false)
const editorIndex = ref(-1)
const editorSaving = ref(false)
const formError = ref('')
const form = reactive({
  id: '', name: '', enabled: true, triggerType: 'fixed', weekdays: [1, 2, 3, 4, 5, 6, 7], timesText: '04:00',
  intervalValue: 180, intervalUnit: 'days', actionType: 'restart_baseband', phoneNumber: '', content: '', delaySeconds: 5,
  randomDelaySeconds: 120, retryLimit: 3,
})
const cleanupOpen = ref(false)
const cleanupSaving = ref(false)
const cleanup = reactive({ retention_days_enabled: true, retention_days: 90, max_entries_enabled: true, max_entries: 10000 })
const advancedClearOpen = ref(false)
const clearForm = reactive({ type: '', status: '', start_date: '', end_date: '' })

const actionOptions = [
  { label: '重启基带', value: 'restart_baseband' },
  { label: '重启设备', value: 'reboot_device' },
  { label: '发送短信', value: 'send_sms' },
]
const triggerOptions = [{ label: '定点定时', value: 'fixed' }, { label: '时间间隔', value: 'interval' }]
const weekdayOptions = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'].map((label, index) => ({ label, value: index + 1 }))
const enabledTasks = computed(() => config.value.tasks.filter((task) => task.enabled).length)
const successLogs = computed(() => logs.value.filter((log) => log.status === 'success').length)
const failedLogs = computed(() => logs.value.filter((log) => log.status === 'failed').length)

const taskColumns = [
  { title: '任务', key: 'name', minWidth: 180 },
  { title: '触发器', key: 'trigger', minWidth: 180, render: (row) => triggerLabel(row.trigger) },
  { title: '动作', key: 'action', width: 130, render: (row) => actionOptions.find((item) => item.value === row.action?.type)?.label || row.action?.type },
  {
    title: '启用', key: 'enabled', width: 80,
    render: (row) => h(NSwitch, {
      value: row.enabled,
      loading: configSaving.value === `task-${row.id}`,
      disabled: Boolean(configSaving.value),
      onUpdateValue: (value) => setTaskEnabled(row, value),
    }),
  },
  {
    title: '操作', key: 'actions', width: 190,
    render: (row, index) => h(NSpace, { size: 6 }, { default: () => [
      h(NButton, { size: 'small', secondary: true, loading: actionLoading.value === row.id, onClick: () => testTask(row) }, { default: () => '执行' }),
      h(NButton, { size: 'small', disabled: Boolean(configSaving.value), onClick: () => openEditor(index) }, { default: () => '编辑' }),
      h(NButton, { size: 'small', quaternary: true, type: 'error', disabled: Boolean(configSaving.value), 'aria-label': '删除任务', onClick: () => deleteTask(row) }, { icon: () => h(Trash2, { size: 15 }) }),
    ] })
  },
]
const logColumns = [
  { title: '时间', key: 'created_at', minWidth: 180 },
  { title: '任务', key: 'task_name', minWidth: 180 },
  { title: '类型', key: 'task_type', width: 140 },
  { title: '状态', key: 'status', width: 100, render: (row) => h(NTag, { size: 'small', type: row.status === 'success' ? 'success' : 'error' }, { default: () => row.status }) },
  { title: '详情', key: 'detail', minWidth: 280 },
]

function triggerLabel(trigger) {
  if (trigger?.type === 'fixed') return `${trigger.config?.weekdays?.map((day) => weekdayOptions[day - 1]?.label).join('、') || '每天'} · ${trigger.config?.times?.join(', ') || '--'}`
  const unit = { mins: '分钟', minutes: '分钟', hours: '小时', days: '天' }[trigger?.config?.interval_unit] || trigger?.config?.interval_unit
  return `每 ${trigger?.config?.interval_value || '--'} ${unit || ''}`
}
async function load() {
  loading.value = true
  filter.offset = (logPage.value - 1) * pageSize
  const results = await Promise.allSettled([api.getAutomationConfig(), api.getAutomationLogs(filter), api.getNotificationConfig()])
  if (results[0].status === 'fulfilled') {
    const nextConfig = results[0].value.data
    if (Array.isArray(nextConfig?.tasks)) {
      config.value = { enabled: nextConfig.enabled ?? true, tasks: nextConfig.tasks }
    }
  }
  if (results[1].status === 'fulfilled') {
    logs.value = results[1].value.data?.logs || []
    logTotal.value = results[1].value.data?.total || 0
  }
  if (results[2].status === 'fulfilled') notificationConfig.value = results[2].value.data
  const failure = results.find((result) => result.status === 'rejected')
  if (failure && !config.value.tasks.length) message.error(errorMessage(failure.reason))
  loading.value = false
}
function queryLogs() {
  logPage.value = 1
  load()
}
function changeLogPage(page) {
  logPage.value = page
  load()
}
async function persistConfig(nextConfig, key, success) {
  if (configSaving.value) return false
  configSaving.value = key
  try {
    await api.setAutomationConfig(nextConfig)
    config.value = nextConfig
    message.success(success)
    return true
  } catch (saveError) {
    message.error(errorMessage(saveError))
    return false
  } finally {
    configSaving.value = ''
  }
}
function setAutomationEnabled(enabled) {
  persistConfig({ ...config.value, enabled }, 'automation', enabled ? '自动化已启用' : '自动化已暂停')
}
function setTaskEnabled(task, enabled) {
  const tasks = config.value.tasks.map((item) => item.id === task.id ? { ...item, enabled } : item)
  persistConfig({ ...config.value, tasks }, `task-${task.id}`, enabled ? '任务已启用' : '任务已停用')
}
function deleteTask(task) {
  dialog.warning({
    title: '删除自动化任务',
    content: `确定删除“${task.name}”吗？此操作无法撤销。`,
    positiveText: '删除', negativeText: '取消',
    async onPositiveClick() {
      const tasks = config.value.tasks.filter((item) => item.id !== task.id)
      const saved = await persistConfig({ ...config.value, tasks }, `delete-${task.id}`, '自动化任务已删除')
      return saved || false
    },
  })
}
function openEditor(index = -1) {
  editorIndex.value = index
  formError.value = ''
  const task = index >= 0 ? config.value.tasks[index] : null
  Object.assign(form, {
    id: task?.id || crypto.randomUUID(), name: task?.name || '', enabled: task?.enabled ?? true,
    triggerType: task?.trigger?.type || 'fixed', weekdays: task?.trigger?.config?.weekdays || [1, 2, 3, 4, 5, 6, 7],
    timesText: task?.trigger?.config?.times?.join(', ') || '04:00', intervalValue: task?.trigger?.config?.interval_value || 180,
    intervalUnit: task?.trigger?.config?.interval_unit === 'minutes' ? 'mins' : task?.trigger?.config?.interval_unit || 'days',
    actionType: task?.action?.type || 'restart_baseband', phoneNumber: task?.action?.config?.phone_number || '',
    content: task?.action?.config?.content || '', delaySeconds: task?.action?.config?.delay_seconds || 5,
    randomDelaySeconds: task?.action?.config?.random_delay_seconds ?? 120,
    retryLimit: task?.action?.config?.retry_limit ?? 3,
  })
  editorOpen.value = true
}
function toggleWeekday(day) {
  form.weekdays = form.weekdays.includes(day)
    ? form.weekdays.filter((item) => item !== day)
    : [...form.weekdays, day].sort((a, b) => a - b)
}
function insertSmsVariable(token) {
  form.content = `${form.content}${token}`
}
function normalizedTriggerTimes() {
  const values = form.timesText.replace(/：/g, ':').replace(/，/g, ',').split(',').map((value) => value.trim()).filter(Boolean)
  if (!values.length) throw new Error('请输入合法的触发时间（格式如 04:00，多个用逗号隔开）')
  return values.map((value) => {
    const match = value.match(/^(\d{1,2}):(\d{1,2})$/)
    const hour = Number(match?.[1])
    const minute = Number(match?.[2])
    if (!match || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
      throw new Error(`请输入合法的触发时间：“${value}”（格式如 04:00）`)
    }
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
  })
}
async function commitTask() {
  formError.value = ''
  if (!form.name.trim()) { formError.value = '请输入任务名称'; return }

  let actionConfig = null
  if (form.actionType === 'reboot_device') {
    actionConfig = { delay_seconds: Math.max(2, Math.min(60, Number(form.delaySeconds) || 5)) }
  }
  if (form.actionType === 'send_sms') {
    const phoneNumber = form.phoneNumber.trim()
    if (!phoneNumber) { formError.value = '请输入接收短信的手机号码'; return }
    if (!/^[0-9+]+$/.test(phoneNumber)) { formError.value = '接收号码格式不正确（只能包含数字和“+”号）'; return }
    actionConfig = {
      phone_number: phoneNumber,
      content: form.content,
      random_delay_seconds: Math.max(0, Number(form.randomDelaySeconds) || 0),
      retry_limit: Math.max(0, Number(form.retryLimit) || 0),
    }
  }

  let trigger
  try {
    trigger = form.triggerType === 'fixed'
      ? { type: 'fixed', config: { weekdays: [...form.weekdays], times: normalizedTriggerTimes() } }
      : { type: 'interval', config: { interval_value: Math.max(1, Number(form.intervalValue) || 1), interval_unit: form.intervalUnit } }
  } catch (validationError) {
    formError.value = validationError.message
    return
  }
  if (form.triggerType === 'fixed' && !form.weekdays.length) { formError.value = '请至少选择一个触发星期'; return }

  const task = { id: form.id, name: form.name.trim(), enabled: form.enabled, trigger, action: { type: form.actionType, config: actionConfig } }
  const tasks = editorIndex.value >= 0
    ? config.value.tasks.map((item, index) => index === editorIndex.value ? task : item)
    : [...config.value.tasks, task]
  const nextConfig = { ...config.value, tasks }
  editorSaving.value = true
  try {
    await api.setAutomationConfig(nextConfig)
    config.value = nextConfig
    editorOpen.value = false
    message.success(editorIndex.value >= 0 ? '自动化任务已更新' : '自动化任务已添加')
  } catch (saveError) {
    formError.value = errorMessage(saveError)
  } finally {
    editorSaving.value = false
  }
}
async function testTask(task) {
  actionLoading.value = task.id
  try { await api.testAutomationTask(task.id); message.success('任务执行已提交'); await load() }
  catch (testError) { message.error(errorMessage(testError)) }
  finally { actionLoading.value = '' }
}
async function clearLogs() {
  const filters = { type: filter.type, status: filter.status, start_date: filter.start_date, end_date: filter.end_date }
  try { await api.clearAutomationLogs(filters); message.success('当前筛选范围的执行日志已清空'); logPage.value = 1; await load() }
  catch (clearError) { message.error(errorMessage(clearError)) }
}
function openCleanup() {
  Object.assign(cleanup, {
    retention_days_enabled: notificationConfig.value?.log_cleanup?.retention_days_enabled ?? true,
    retention_days: notificationConfig.value?.log_cleanup?.retention_days || 90,
    max_entries_enabled: notificationConfig.value?.log_cleanup?.max_entries_enabled ?? true,
    max_entries: notificationConfig.value?.log_cleanup?.max_entries || 10000,
  })
  cleanupOpen.value = true
}
async function saveCleanup() {
  if (!notificationConfig.value) return
  cleanupSaving.value = true
  try {
    const next = { ...notificationConfig.value, log_cleanup: { ...cleanup } }
    await api.setNotificationConfig(next)
    notificationConfig.value = next
    cleanupOpen.value = false
    message.success('自动清理设置已保存')
  } catch (cleanupError) { message.error(errorMessage(cleanupError)) }
  finally { cleanupSaving.value = false }
}
function openAdvancedClear() {
  Object.assign(clearForm, { type: filter.type, status: filter.status, start_date: filter.start_date, end_date: filter.end_date })
  advancedClearOpen.value = true
}
async function runAdvancedClear() {
  try {
    const response = await api.clearAutomationLogs({ ...clearForm })
    advancedClearOpen.value = false
    logPage.value = 1
    message.success(`已清理 ${response.data?.deleted ?? 0} 条执行日志`)
    await load()
  } catch (clearError) { message.error(errorMessage(clearError)) }
}

load()
</script>

<template>
  <main class="page">
    <PageHeader title="自动化中心" description="按固定时间或循环间隔执行设备维护和短信任务" :loading="loading" @refresh="load">
      <template #actions><span class="status-line">自动化总开关 <NSwitch :value="config.enabled" :loading="configSaving === 'automation'" :disabled="Boolean(configSaving)" @update:value="setAutomationEnabled" /></span></template>
    </PageHeader>
    <div class="metric-grid">
      <MetricCard label="自动化状态" :value="config.enabled ? '运行中' : '已暂停'" detail="任务调度总开关" :icon="Bot" :tone="config.enabled ? 'success' : 'warning'" />
      <MetricCard label="启用任务" :value="enabledTasks" :detail="`共 ${config.tasks.length} 个任务`" :icon="Bot" />
      <MetricCard label="成功执行" :value="successLogs" :detail="`最近加载 ${logs.length} 条`" :icon="Bot" tone="success" />
      <MetricCard label="失败执行" :value="failedLogs" detail="需要检查的任务" :icon="Bot" :tone="failedLogs ? 'danger' : 'success'" />
    </div>
    <NTabs v-model:value="tab" type="line" animated>
      <NTabPane name="tasks" tab="任务">
        <NCard title="自动化任务">
          <template #header-extra><NButton type="primary" secondary :disabled="Boolean(configSaving)" @click="openEditor()"><template #icon><Plus :size="16" /></template>新建任务</NButton></template>
          <NDataTable :columns="taskColumns" :data="config.tasks" :loading="loading" :scroll-x="850" :row-key="row => row.id" />
        </NCard>
      </NTabPane>
      <NTabPane name="logs" :tab="`执行日志 (${logTotal})`">
        <NCard>
          <div class="toolbar">
            <div class="toolbar__group"><NSelect v-model:value="filter.type" clearable placeholder="任务类型" :options="actionOptions" style="width: 150px" /><NSelect v-model:value="filter.status" clearable placeholder="执行状态" :options="[{ label: '成功', value: 'success' }, { label: '失败', value: 'failed' }]" style="width: 130px" /><NInput v-model:value="filter.q" clearable placeholder="搜索任务或详情" style="width: 220px" @keyup.enter="queryLogs" /></div>
            <NSpace><NButton secondary @click="queryLogs">查询</NButton><NButton secondary @click="openCleanup">自动清理</NButton><NButton type="error" secondary @click="openAdvancedClear"><template #icon><Eraser :size="16" /></template>高级清理</NButton><NPopconfirm @positive-click="clearLogs"><template #trigger><NButton type="error" quaternary>清空当前</NButton></template>清空当前筛选范围的执行日志？</NPopconfirm></NSpace>
          </div>
          <NDataTable :columns="logColumns" :data="logs" :loading="loading" :scroll-x="900" :pagination="false" />
          <div class="pagination-bar"><span>{{ logTotal ? `${(logPage - 1) * pageSize + 1}-${Math.min(logPage * pageSize, logTotal)} / 共 ${logTotal} 条` : '共 0 条记录' }}</span><NPagination :page="logPage" :page-size="pageSize" :item-count="logTotal" show-quick-jumper @update:page="changeLogPage" /></div>
        </NCard>
      </NTabPane>
    </NTabs>

    <NModal v-model:show="editorOpen" preset="card" :title="editorIndex >= 0 ? '编辑自动化任务' : '添加自动化任务'" :closable="!editorSaving" :mask-closable="!editorSaving" style="width: min(680px, calc(100vw - 24px))">
      <NForm label-placement="top">
        <NAlert v-if="formError" type="error" closable style="margin-bottom: 14px" @close="formError = ''">{{ formError }}</NAlert>
        <div class="inline-form">
          <NFormItem label="任务名称" class="full"><NInput v-model:value="form.name" placeholder="例如：每日凌晨基带自动重启" /></NFormItem>
          <NFormItem label="执行动作" class="full"><NSelect v-model:value="form.actionType" :options="actionOptions" /></NFormItem>
          <NFormItem v-if="form.actionType === 'reboot_device'" label="重启延迟时间（秒）" class="full"><NInputNumber v-model:value="form.delaySeconds" :min="2" :max="60" style="width: 100%" /></NFormItem>
          <template v-if="form.actionType === 'send_sms'">
            <NFormItem label="接收号码" class="full"><NInput v-model:value="form.phoneNumber" placeholder="如：10010 或其他号码" /></NFormItem>
            <NFormItem label="短信内容" class="full">
              <div class="automation-sms-editor">
                <NSpace justify="end" size="small"><NButton size="tiny" secondary @click="insertSmsVariable('{{时间}}')">+ 时间</NButton><NButton size="tiny" secondary @click="insertSmsVariable('{{随机字符串}}')">+ 随机字符串</NButton></NSpace>
                <NInput v-model:value="form.content" type="textarea" :rows="3" placeholder="发送内容，如：开源项目 SimAdmin {{时间}}" />
              </div>
            </NFormItem>
            <NFormItem label="随机延迟范围（秒）"><NInputNumber v-model:value="form.randomDelaySeconds" :min="0" style="width: 100%" /></NFormItem>
            <NFormItem label="失败重试次数"><NInputNumber v-model:value="form.retryLimit" :min="0" style="width: 100%" /></NFormItem>
          </template>
          <NFormItem label="触发机制" class="full"><NSelect v-model:value="form.triggerType" :options="triggerOptions" /></NFormItem>
          <template v-if="form.triggerType === 'fixed'">
            <NFormItem label="重复星期" class="full">
              <NSpace size="small">
                <NButton v-for="day in weekdayOptions" :key="day.value" size="small" :type="form.weekdays.includes(day.value) ? 'primary' : 'default'" :secondary="!form.weekdays.includes(day.value)" @click="toggleWeekday(day.value)">{{ day.label.replace('周', '') }}</NButton>
              </NSpace>
            </NFormItem>
            <NFormItem label="触发时刻（HH:MM，多个用逗号隔开）" class="full"><NInput v-model:value="form.timesText" placeholder="例如：04:00, 12:00" /></NFormItem>
          </template>
          <template v-else>
            <NFormItem label="间隔时长"><NInputNumber v-model:value="form.intervalValue" :min="1" style="width: 100%" /></NFormItem>
            <NFormItem label="时间单位"><NSelect v-model:value="form.intervalUnit" :options="[{ label: '分钟', value: 'mins' }, { label: '小时', value: 'hours' }, { label: '天', value: 'days' }]" /></NFormItem>
          </template>
        </div>
        <NSpace justify="end"><NButton :disabled="editorSaving" @click="editorOpen = false">取消</NButton><NButton type="primary" :loading="editorSaving" @click="commitTask">保存</NButton></NSpace>
      </NForm>
    </NModal>

    <NModal v-model:show="cleanupOpen" preset="card" title="执行日志自动清理" style="width: min(520px, calc(100vw - 24px))">
      <NForm label-placement="top">
        <div class="action-list">
          <div class="action-row"><div class="action-row__copy"><strong>按保留天数清理</strong><span>删除超过指定天数的历史记录</span></div><NSwitch v-model:value="cleanup.retention_days_enabled" /></div>
          <NFormItem v-if="cleanup.retention_days_enabled" label="保留天数"><NInputNumber v-model:value="cleanup.retention_days" :min="1" style="width: 100%" /></NFormItem>
          <div class="action-row"><div class="action-row__copy"><strong>按最大条数清理</strong><span>仅保留最新的执行记录</span></div><NSwitch v-model:value="cleanup.max_entries_enabled" /></div>
          <NFormItem v-if="cleanup.max_entries_enabled" label="最大记录数"><NInputNumber v-model:value="cleanup.max_entries" :min="100" style="width: 100%" /></NFormItem>
        </div>
        <NSpace justify="end"><NButton @click="cleanupOpen = false">取消</NButton><NButton type="primary" :loading="cleanupSaving" @click="saveCleanup">保存</NButton></NSpace>
      </NForm>
    </NModal>

    <NModal v-model:show="advancedClearOpen" preset="card" title="高级清理执行日志" style="width: min(560px, calc(100vw - 24px))">
      <NAlert type="warning" style="margin-bottom: 14px">清理操作不可撤销。留空的条件不会参与筛选。</NAlert>
      <NForm label-placement="top">
        <div class="inline-form">
          <NFormItem label="任务类型"><NSelect v-model:value="clearForm.type" clearable :options="actionOptions" /></NFormItem>
          <NFormItem label="执行状态"><NSelect v-model:value="clearForm.status" clearable :options="[{ label: '成功', value: 'success' }, { label: '失败', value: 'failed' }]" /></NFormItem>
          <NFormItem label="开始日期"><NInput v-model:value="clearForm.start_date" placeholder="YYYY-MM-DD" /></NFormItem>
          <NFormItem label="结束日期"><NInput v-model:value="clearForm.end_date" placeholder="YYYY-MM-DD" /></NFormItem>
        </div>
        <NSpace justify="end"><NButton @click="advancedClearOpen = false">取消</NButton><NButton type="error" @click="runAdvancedClear">确认清理</NButton></NSpace>
      </NForm>
    </NModal>
  </main>
</template>
