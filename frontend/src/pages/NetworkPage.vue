<script setup>
import { computed, h, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
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
  NSelect,
  NSpace,
  NTabPane,
  NTabs,
  NTag,
  useDialog,
  useMessage,
} from 'naive-ui'
import { Copy, LockKeyhole, RadioTower, RotateCcw, Search, Settings2, Unlock } from '@lucide/vue'
import { api } from '@/api/index.js'
import PageHeader from '@/components/PageHeader.vue'
import MetricCard from '@/components/MetricCard.vue'
import { usePolling } from '@/composables/usePolling.js'
import { display, errorMessage } from '@/utils/format.js'

const message = useMessage()
const dialog = useDialog()
const loading = ref(true)
const error = ref('')
const tab = ref('overview')
const network = ref(null)
const cells = ref([])
const signal = ref(null)
const radioMode = ref(null)
const bandStatus = ref(null)
const cellLock = ref(null)
const apns = ref([])
const operators = ref([])
const cellLocation = ref(null)
const connectivity = ref(null)
const actionLoading = ref('')
const apnOpen = ref(false)
const apnForm = reactive({ context_path: '', apn: '', protocol: 'ipv4v6', username: '', password: '', auth_method: 'none' })
const cellForm = reactive({ rat: 4, enable: true, lock_type: 1, pci: null, arfcn: null })
const selectedBands = reactive({ lte_fdd_bands: [], lte_tdd_bands: [], nr_fdd_bands: [], nr_tdd_bands: [] })

const cellColumns = [
  { title: '角色', key: 'is_serving', width: 90, render: (row) => h(NTag, { size: 'small', type: row.is_serving ? 'success' : 'default' }, { default: () => row.is_serving ? '服务小区' : '邻区' }) },
  { title: '制式', key: 'tech', width: 90 },
  { title: '频段', key: 'band', width: 90 },
  { title: 'ARFCN', key: 'arfcn', minWidth: 100 },
  { title: 'PCI', key: 'pci', width: 80 },
  { title: 'RSRP', key: 'rsrp', minWidth: 100 },
  { title: 'RSRQ', key: 'rsrq', minWidth: 100 },
  { title: 'SINR', key: 'sinr', minWidth: 100 },
  { title: 'Cell ID', key: 'cell_id', minWidth: 120, render: (row) => row.cell_id ?? '--' },
  {
    title: '操作', key: 'action', width: 90,
    render: (row) => h(NButton, {
      size: 'small', secondary: true,
      disabled: cellArfcn(row) === null || row.pci === undefined || row.pci === null,
      loading: actionLoading.value === `cell-${rowKey(row)}`,
      onClick: () => lockFromCell(row),
    }, { default: () => '锁定' }),
  },
]
const apnColumns = [
  { title: '名称', key: 'name', minWidth: 130 },
  { title: 'APN', key: 'apn', minWidth: 150 },
  { title: '协议', key: 'protocol', width: 110 },
  { title: '状态', key: 'active', width: 90, render: (row) => h(NTag, { size: 'small', type: row.active ? 'success' : 'default' }, { default: () => row.active ? '活动' : '未使用' }) },
  { title: '操作', key: 'actions', width: 90, render: (row) => h(NButton, { size: 'small', secondary: true, onClick: () => editApn(row) }, { default: () => '编辑' }) },
]
const operatorColumns = [
  { title: '运营商', key: 'name', minWidth: 160 },
  { title: '代码', key: 'code', width: 110, render: (row) => `${row.mcc || ''}${row.mnc || ''}` },
  { title: '制式', key: 'technologies', minWidth: 160, render: (row) => row.technologies?.join(' / ') || '--' },
  { title: '状态', key: 'status', width: 110 },
  { title: '操作', key: 'action', width: 110, render: (row) => h(NButton, { size: 'small', type: 'primary', disabled: row.status === 'current', onClick: () => registerOperator(`${row.mcc}${row.mnc}`) }, { default: () => '注册' }) },
]
const bandGroups = computed(() => [
  ['LTE FDD', 'lte_fdd_bands', bandStatus.value?.supported_lte_fdd_bands || []],
  ['LTE TDD', 'lte_tdd_bands', bandStatus.value?.supported_lte_tdd_bands || []],
  ['NR FDD', 'nr_fdd_bands', bandStatus.value?.supported_nr_fdd_bands || []],
  ['NR TDD', 'nr_tdd_bands', bandStatus.value?.supported_nr_tdd_bands || []],
])
const locationCells = computed(() => {
  if (cellLocation.value?.cells?.length) return cellLocation.value.cells
  const items = []
  if (cellLocation.value?.cell_info) items.push(cellLocation.value.cell_info)
  return [...items, ...(cellLocation.value?.neighbor_cells || [])]
})

function cellArfcn(row) {
  const value = row?.arfcn ?? row?.earfcn ?? row?.nrarfcn
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function rowKey(row) {
  return `${row.tech || 'cell'}-${cellArfcn(row) ?? 'na'}-${row.pci ?? 'na'}`
}

async function load(background = false) {
  if (!background) loading.value = true
  const calls = await Promise.allSettled([
    api.getNetworkInfo(), api.getCellsInfo(), api.getSignalStrength(), api.getRadioMode(),
    api.getBandLockStatus(), api.getCellLockStatus(), api.getApnList(), api.getConnectivity(),
    api.getCellLocationInfo(), api.getOperators(),
  ])
  const assign = (index, setter) => { if (calls[index].status === 'fulfilled') setter(calls[index].value.data) }
  assign(0, (value) => { network.value = value })
  assign(1, (value) => { cells.value = value?.cells || [] })
  assign(2, (value) => { signal.value = value })
  assign(3, (value) => { radioMode.value = value })
  assign(4, (value) => {
    bandStatus.value = value
    Object.keys(selectedBands).forEach((key) => { selectedBands[key] = [...(value?.[key] || [])] })
  })
  assign(5, (value) => { cellLock.value = value })
  assign(6, (value) => { apns.value = value?.contexts || [] })
  assign(7, (value) => { connectivity.value = value })
  assign(8, (value) => { cellLocation.value = value })
  assign(9, (value) => { if (!operators.value.length) operators.value = value?.operators || [] })
  const failure = calls.find((result) => result.status === 'rejected')
  if (failure && !network.value && !background) error.value = errorMessage(failure.reason)
  loading.value = false
}

async function runAction(name, action, success) {
  actionLoading.value = name
  try {
    await action()
    message.success(success)
    await load(true)
  } catch (actionError) {
    message.error(errorMessage(actionError))
  } finally {
    actionLoading.value = ''
  }
}

function setMode(mode) {
  runAction('mode', () => api.setRadioMode(mode), '网络制式已更新')
}
function editApn(row) {
  Object.assign(apnForm, {
    context_path: row.path,
    apn: row.apn || '', protocol: row.protocol || 'ipv4v6', username: row.username || '',
    password: row.password || '', auth_method: row.auth_method || 'none',
  })
  apnOpen.value = true
}
async function saveApn() {
  await runAction('apn', () => api.setApn({ ...apnForm }), 'APN 已保存')
  apnOpen.value = false
}
async function scanOperators() {
  actionLoading.value = 'scan'
  try {
    const response = await api.scanOperators()
    operators.value = response.data?.operators || []
  } catch (scanError) {
    message.error(errorMessage(scanError))
  } finally { actionLoading.value = '' }
}
function registerOperator(code) {
  runAction('register', () => api.registerOperatorManual(code), '已提交运营商注册')
}
function registerAuto() {
  runAction('register', () => api.registerOperatorAuto(), '已恢复自动注册')
}
function saveBands() {
  runAction('bands', () => api.setBandLock({ ...selectedBands }), '频段锁定已更新')
}
function saveCellLock() {
  runAction('cell', () => api.setCellLock({ ...cellForm }), '小区锁定已更新')
}
function lockFromCell(row) {
  const arfcn = cellArfcn(row)
  const pci = Number(row.pci)
  if (arfcn === null || !Number.isFinite(pci)) return
  const rat = String(row.tech || '').toLowerCase().includes('nr') ? 6 : 4
  runAction(`cell-${rowKey(row)}`, () => api.setCellLock({ rat, enable: true, lock_type: 1, pci, arfcn }), `已锁定 ${row.tech || ''} 小区`)
}
function unlockCells() {
  dialog.warning({
    title: '解除所有小区锁定', content: '设备将恢复自动选择服务小区。', positiveText: '解除锁定', negativeText: '取消',
    onPositiveClick: () => runAction('cell', () => api.unlockAllCells(), '所有小区锁定已解除'),
  })
}

async function copyCellLocation() {
  if (!locationCells.value.length) return
  try {
    await navigator.clipboard.writeText(JSON.stringify(locationCells.value[0], null, 2))
    message.success('基站定位参数已复制')
  } catch (copyError) {
    message.error(errorMessage(copyError))
  }
}

onMounted(async () => {
  try {
    await api.startCellMonitor()
  } catch (monitorError) {
    message.warning(`小区监控启动失败：${errorMessage(monitorError)}`)
  }
})
usePolling(load)
onBeforeUnmount(() => api.stopCellMonitor().catch(() => {}))
</script>

<template>
  <main class="page">
    <PageHeader title="蜂窝网络" description="查看注册状态、服务小区，并配置 APN、制式和锁频参数" :loading="loading" @refresh="load(false)" />
    <NAlert v-if="error" type="error" style="margin-bottom: 12px">{{ error }}</NAlert>
    <div class="metric-grid">
      <MetricCard label="运营商" :value="network?.operator_name || '未注册'" :detail="display(network?.registration_status)" :icon="RadioTower" :tone="network?.registration_status === 'registered' ? 'success' : 'warning'" />
      <MetricCard label="信号强度" :value="`${signal?.strength ?? network?.signal_strength ?? 0}%`" detail="综合信号质量" :icon="RadioTower" />
      <MetricCard label="首选制式" :value="display(network?.technology_preference)" :detail="`当前模式：${display(radioMode?.mode)}`" :icon="Settings2" />
      <MetricCard label="外网连通" :value="connectivity?.ipv4?.success || connectivity?.ipv6?.success ? '正常' : '不可用'" :detail="`IPv4 ${connectivity?.ipv4?.latency_ms || '--'} ms · IPv6 ${connectivity?.ipv6?.latency_ms || '--'} ms`" :icon="RadioTower" :tone="connectivity?.ipv4?.success ? 'success' : 'warning'" />
    </div>

    <NTabs v-model:value="tab" type="line" animated>
      <NTabPane name="overview" tab="小区状态">
        <div class="panel-grid">
          <NCard class="section-card panel--wide" title="小区列表">
            <NDataTable :columns="cellColumns" :data="cells" :loading="loading" :scroll-x="1070" :pagination="{ pageSize: 12 }" />
          </NCard>
          <NCard class="section-card panel--narrow" title="基站定位参数">
            <template #header-extra><NButton quaternary circle aria-label="复制基站定位参数" :disabled="!locationCells.length" @click="copyCellLocation"><template #icon><Copy :size="16" /></template></NButton></template>
            <div v-if="locationCells.length" class="description-grid">
              <div class="description-item"><span>MCC / MNC</span><strong>{{ locationCells[0].mcc }} / {{ locationCells[0].mnc }}</strong></div>
              <div class="description-item"><span>制式</span><strong>{{ locationCells[0].radio_type || '--' }}</strong></div>
              <div class="description-item"><span>LAC / TAC</span><strong>{{ locationCells[0].lac ?? '--' }}</strong></div>
              <div class="description-item"><span>Cell ID</span><strong>{{ locationCells[0].cid ?? '--' }}</strong></div>
              <div class="description-item"><span>ARFCN / PCI</span><strong>{{ locationCells[0].arfcn ?? '--' }} / {{ locationCells[0].pci ?? '--' }}</strong></div>
              <div class="description-item"><span>信号</span><strong>{{ locationCells[0].signal_strength ?? '--' }}</strong></div>
            </div>
            <div v-else class="empty-state">暂无基站定位数据</div>
          </NCard>
        </div>
      </NTabPane>
      <NTabPane name="apn" tab="APN">
        <NCard class="section-card">
          <NDataTable :columns="apnColumns" :data="apns" :loading="loading" :scroll-x="680" />
        </NCard>
      </NTabPane>
      <NTabPane name="operators" tab="运营商">
        <NCard class="section-card">
          <div class="toolbar">
            <span>扫描附近可注册的运营商</span>
            <NSpace><NButton secondary @click="registerAuto"><template #icon><RotateCcw :size="16" /></template>自动注册</NButton><NButton type="primary" :loading="actionLoading === 'scan'" @click="scanOperators"><template #icon><Search :size="16" /></template>扫描</NButton></NSpace>
          </div>
          <NDataTable :columns="operatorColumns" :data="operators" :scroll-x="700" />
        </NCard>
      </NTabPane>
      <NTabPane name="mode" tab="制式与频段">
        <div class="panel-grid">
          <NCard class="section-card panel--narrow" title="网络制式">
            <NSelect :value="radioMode?.mode || 'auto'" :options="[{ label: '自动', value: 'auto' }, { label: '仅 LTE', value: 'lte' }, { label: '仅 NR', value: 'nr' }]" :loading="actionLoading === 'mode'" @update:value="setMode" />
          </NCard>
          <NCard class="section-card panel--wide" title="频段锁定">
            <div class="inline-form">
              <NFormItem v-for="[label, key, bands] in bandGroups" :key="key" :label="label">
                <NSelect v-model:value="selectedBands[key]" multiple filterable :options="bands.map(value => ({ label: `B${value}`, value }))" :placeholder="`选择 ${label} 频段`" />
              </NFormItem>
            </div>
            <NSpace justify="end"><NButton type="primary" :loading="actionLoading === 'bands'" @click="saveBands"><template #icon><LockKeyhole :size="16" /></template>应用频段</NButton></NSpace>
          </NCard>
        </div>
      </NTabPane>
      <NTabPane name="cell-lock" tab="小区锁定">
        <NCard class="section-card" title="锁定参数">
          <NForm label-placement="top" class="inline-form">
            <NFormItem label="网络制式"><NSelect v-model:value="cellForm.rat" :options="[{ label: 'LTE', value: 4 }, { label: 'NR5G', value: 6 }]" /></NFormItem>
            <NFormItem label="锁定类型"><NSelect v-model:value="cellForm.lock_type" :options="[{ label: 'PCI + ARFCN', value: 1 }, { label: '仅 ARFCN', value: 2 }]" /></NFormItem>
            <NFormItem label="PCI"><NInputNumber v-model:value="cellForm.pci" :min="0" style="width: 100%" /></NFormItem>
            <NFormItem label="ARFCN"><NInputNumber v-model:value="cellForm.arfcn" :min="0" style="width: 100%" /></NFormItem>
          </NForm>
          <NSpace justify="space-between">
            <NTag :type="cellLock?.any_locked ? 'warning' : 'default'">{{ cellLock?.any_locked ? '存在锁定' : '未锁定' }}</NTag>
            <NSpace><NButton type="error" secondary @click="unlockCells"><template #icon><Unlock :size="16" /></template>全部解锁</NButton><NButton type="primary" :loading="actionLoading === 'cell'" @click="saveCellLock">应用锁定</NButton></NSpace>
          </NSpace>
        </NCard>
      </NTabPane>
    </NTabs>

    <NModal v-model:show="apnOpen" preset="card" title="编辑 APN" style="width: min(560px, calc(100vw - 24px))">
      <NForm label-placement="top" class="inline-form">
        <NFormItem label="APN" class="full"><NInput v-model:value="apnForm.apn" /></NFormItem>
        <NFormItem label="协议"><NSelect v-model:value="apnForm.protocol" :options="['ipv4', 'ipv6', 'ipv4v6'].map(value => ({ label: value.toUpperCase(), value }))" /></NFormItem>
        <NFormItem label="认证"><NSelect v-model:value="apnForm.auth_method" :options="['none', 'pap', 'chap'].map(value => ({ label: value.toUpperCase(), value }))" /></NFormItem>
        <NFormItem label="用户名"><NInput v-model:value="apnForm.username" /></NFormItem>
        <NFormItem label="密码"><NInput v-model:value="apnForm.password" type="password" show-password-on="click" /></NFormItem>
      </NForm>
      <NSpace justify="end"><NButton @click="apnOpen = false">取消</NButton><NButton type="primary" :loading="actionLoading === 'apn'" @click="saveApn">保存</NButton></NSpace>
    </NModal>
  </main>
</template>
