<script setup>
import { computed, h, reactive, ref } from 'vue'
import {
  NButton,
  NCard,
  NDataTable,
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
  useMessage,
} from 'naive-ui'
import { Bot, Eraser, Plus, Save, Trash2 } from '@lucide/vue'
import { api } from '@/api/index.js'
import PageHeader from '@/components/PageHeader.vue'
import MetricCard from '@/components/MetricCard.vue'
import { errorMessage } from '@/utils/format.js'

const message = useMessage()
const loading = ref(true)
const actionLoading = ref('')
const tab = ref('tasks')
const config = ref({ enabled: true, tasks: [] })
const logs = ref([])
const logTotal = ref(0)
const filter = reactive({ type: '', status: '', q: '', limit: 100 })
const editorOpen = ref(false)
const editorIndex = ref(-1)
const form = reactive({
  id: '', name: '', enabled: true, triggerType: 'interval', weekdays: [1, 2, 3, 4, 5], timesText: '03:00',
  intervalValue: 24, intervalUnit: 'hours', actionType: 'restart_baseband', phoneNumber: '', content: '', delaySeconds: 5,
})

const actionOptions = [
  { label: '重启基带', value: 'restart_baseband' },
  { label: '重启设备', value: 'reboot_device' },
  { label: '发送短信', value: 'send_sms' },
]
const triggerOptions = [{ label: '固定时间', value: 'fixed' }, { label: '循环间隔', value: 'interval' }]
const weekdayOptions = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'].map((label, index) => ({ label, value: index + 1 }))
const enabledTasks = computed(() => config.value.tasks.filter((task) => task.enabled).length)
const successLogs = computed(() => logs.value.filter((log) => log.status === 'success').length)
const failedLogs = computed(() => logs.value.filter((log) => log.status === 'failed').length)

const taskColumns = [
  { title: '任务', key: 'name', minWidth: 180 },
  { title: '触发器', key: 'trigger', minWidth: 180, render: (row) => triggerLabel(row.trigger) },
  { title: '动作', key: 'action', width: 130, render: (row) => actionOptions.find((item) => item.value === row.action?.type)?.label || row.action?.type },
  { title: '启用', key: 'enabled', width: 80, render: (row, index) => h(NSwitch, { value: row.enabled, onUpdateValue: (value) => { config.value.tasks[index].enabled = value } }) },
  {
    title: '操作', key: 'actions', width: 190,
    render: (row, index) => h(NSpace, { size: 6 }, { default: () => [
      h(NButton, { size: 'small', secondary: true, loading: actionLoading.value === row.id, onClick: () => testTask(row) }, { default: () => '执行' }),
      h(NButton, { size: 'small', onClick: () => openEditor(index) }, { default: () => '编辑' }),
      h(NButton, { size: 'small', quaternary: true, type: 'error', onClick: () => config.value.tasks.splice(index, 1) }, { icon: () => h(Trash2, { size: 15 }) }),
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
  const unit = { minutes: '分钟', hours: '小时', days: '天' }[trigger?.config?.interval_unit] || trigger?.config?.interval_unit
  return `每 ${trigger?.config?.interval_value || '--'} ${unit || ''}`
}
async function load() {
  loading.value = true
  const results = await Promise.allSettled([api.getAutomationConfig(), api.getAutomationLogs(filter)])
  if (results[0].status === 'fulfilled') config.value = results[0].value.data || config.value
  if (results[1].status === 'fulfilled') {
    logs.value = results[1].value.data?.logs || []
    logTotal.value = results[1].value.data?.total || 0
  }
  const failure = results.find((result) => result.status === 'rejected')
  if (failure && !config.value.tasks.length) message.error(errorMessage(failure.reason))
  loading.value = false
}
async function save() {
  actionLoading.value = 'save'
  try { await api.setAutomationConfig(config.value); message.success('自动化配置已保存'); await load() }
  catch (saveError) { message.error(errorMessage(saveError)) }
  finally { actionLoading.value = '' }
}
function openEditor(index = -1) {
  editorIndex.value = index
  const task = index >= 0 ? config.value.tasks[index] : null
  Object.assign(form, {
    id: task?.id || crypto.randomUUID(), name: task?.name || '', enabled: task?.enabled ?? true,
    triggerType: task?.trigger?.type || 'interval', weekdays: task?.trigger?.config?.weekdays || [1, 2, 3, 4, 5],
    timesText: task?.trigger?.config?.times?.join(', ') || '03:00', intervalValue: task?.trigger?.config?.interval_value || 24,
    intervalUnit: task?.trigger?.config?.interval_unit || 'hours', actionType: task?.action?.type || 'restart_baseband',
    phoneNumber: task?.action?.config?.phone_number || '', content: task?.action?.config?.content || '', delaySeconds: task?.action?.config?.delay_seconds || 5,
  })
  editorOpen.value = true
}
function commitTask() {
  if (!form.name.trim()) { message.warning('请输入任务名称'); return }
  const trigger = form.triggerType === 'fixed'
    ? { type: 'fixed', config: { weekdays: form.weekdays, times: form.timesText.split(',').map((value) => value.trim()).filter(Boolean) } }
    : { type: 'interval', config: { interval_value: form.intervalValue, interval_unit: form.intervalUnit } }
  let actionConfig = {}
  if (form.actionType === 'reboot_device') actionConfig = { delay_seconds: form.delaySeconds }
  if (form.actionType === 'send_sms') actionConfig = { phone_number: form.phoneNumber, content: form.content }
  const task = { id: form.id, name: form.name.trim(), enabled: form.enabled, trigger, action: { type: form.actionType, config: actionConfig } }
  if (editorIndex.value >= 0) config.value.tasks[editorIndex.value] = task
  else config.value.tasks.push(task)
  editorOpen.value = false
}
async function testTask(task) {
  actionLoading.value = task.id
  try { await api.testAutomationTask(task.id); message.success('任务执行已提交'); await load() }
  catch (testError) { message.error(errorMessage(testError)) }
  finally { actionLoading.value = '' }
}
async function clearLogs() {
  try { await api.clearAutomationLogs(filter); message.success('执行日志已清空'); await load() }
  catch (clearError) { message.error(errorMessage(clearError)) }
}

load()
</script>

<template>
  <main class="page">
    <PageHeader title="自动化中心" description="按固定时间或循环间隔执行设备维护和短信任务" :loading="loading" @refresh="load">
      <template #actions><NSpace align="center"><span class="status-line">总开关 <NSwitch v-model:value="config.enabled" /></span><NButton type="primary" :loading="actionLoading === 'save'" @click="save"><template #icon><Save :size="16" /></template>保存配置</NButton></NSpace></template>
    </PageHeader>
    <div class="metric-grid">
      <MetricCard label="自动化状态" :value="config.enabled ? '运行中' : '已暂停'" detail="任务调度总开关" :icon="Bot" :tone="config.enabled ? 'success' : 'warning'" />
      <MetricCard label="启用任务" :value="enabledTasks" :detail="`共 ${config.tasks.length} 个任务`" :icon="Bot" />
      <MetricCard label="成功执行" :value="successLogs" :detail="`最近加载 ${logs.length} 条`" :icon="Bot" tone="success" />
      <MetricCard label="失败执行" :value="failedLogs" detail="需要检查的任务" :icon="Bot" :tone="failedLogs ? 'danger' : 'success'" />
    </div>
    <NTabs v-model:value="tab" type="line" animated>
      <NTabPane name="tasks" tab="任务">
        <NCard>
          <template #header-extra><NButton type="primary" secondary @click="openEditor()"><template #icon><Plus :size="16" /></template>新建任务</NButton></template>
          <NDataTable :columns="taskColumns" :data="config.tasks" :loading="loading" :scroll-x="850" :row-key="row => row.id" />
        </NCard>
      </NTabPane>
      <NTabPane name="logs" :tab="`执行日志 (${logTotal})`">
        <NCard>
          <div class="toolbar">
            <div class="toolbar__group"><NSelect v-model:value="filter.type" clearable placeholder="任务类型" :options="actionOptions" style="width: 150px" /><NSelect v-model:value="filter.status" clearable placeholder="执行状态" :options="[{ label: '成功', value: 'success' }, { label: '失败', value: 'failed' }]" style="width: 130px" /><NInput v-model:value="filter.q" clearable placeholder="搜索任务或详情" style="width: 220px" @keyup.enter="load" /></div>
            <NSpace><NButton secondary @click="load">查询</NButton><NPopconfirm @positive-click="clearLogs"><template #trigger><NButton type="error" secondary><template #icon><Eraser :size="16" /></template>清空</NButton></template>清空当前筛选范围的执行日志？</NPopconfirm></NSpace>
          </div>
          <NDataTable :columns="logColumns" :data="logs" :loading="loading" :scroll-x="900" :pagination="{ pageSize: 15 }" />
        </NCard>
      </NTabPane>
    </NTabs>

    <NModal v-model:show="editorOpen" preset="card" :title="editorIndex >= 0 ? '编辑任务' : '新建任务'" style="width: min(640px, calc(100vw - 24px))">
      <NForm label-placement="top">
        <div class="inline-form">
          <NFormItem label="任务名称" class="full"><NInput v-model:value="form.name" /></NFormItem>
          <NFormItem label="启用"><NSwitch v-model:value="form.enabled" /></NFormItem>
          <NFormItem label="触发方式"><NSelect v-model:value="form.triggerType" :options="triggerOptions" /></NFormItem>
          <template v-if="form.triggerType === 'fixed'">
            <NFormItem label="星期"><NSelect v-model:value="form.weekdays" multiple :options="weekdayOptions" /></NFormItem>
            <NFormItem label="执行时间"><NInput v-model:value="form.timesText" placeholder="03:00, 15:00" /></NFormItem>
          </template>
          <template v-else>
            <NFormItem label="间隔数值"><NInputNumber v-model:value="form.intervalValue" :min="1" style="width: 100%" /></NFormItem>
            <NFormItem label="间隔单位"><NSelect v-model:value="form.intervalUnit" :options="[{ label: '分钟', value: 'minutes' }, { label: '小时', value: 'hours' }, { label: '天', value: 'days' }]" /></NFormItem>
          </template>
          <NFormItem label="执行动作" class="full"><NSelect v-model:value="form.actionType" :options="actionOptions" /></NFormItem>
          <template v-if="form.actionType === 'send_sms'">
            <NFormItem label="电话号码"><NInput v-model:value="form.phoneNumber" /></NFormItem>
            <NFormItem label="短信内容"><NInput v-model:value="form.content" type="textarea" :rows="4" /></NFormItem>
          </template>
          <NFormItem v-if="form.actionType === 'reboot_device'" label="重启延迟（秒）"><NInputNumber v-model:value="form.delaySeconds" :min="0" style="width: 100%" /></NFormItem>
        </div>
        <NSpace justify="end"><NButton @click="editorOpen = false">取消</NButton><NButton type="primary" @click="commitTask">完成</NButton></NSpace>
      </NForm>
    </NModal>
  </main>
</template>
