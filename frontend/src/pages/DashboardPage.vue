<script setup>
import { computed, ref, watch } from 'vue'
import {
  NAlert,
  NButton,
  NCard,
  NIcon,
  NProgress,
  NSkeleton,
  NSpace,
  NSwitch,
  NTabPane,
  NTag,
  NTabs,
  NText,
  NTooltip,
  useMessage,
} from 'naive-ui'
import {
  Activity,
  ArrowDown,
  ArrowUp,
  Cpu,
  CreditCard,
  Eye,
  EyeOff,
  HardDrive,
  MemoryStick,
  RadioTower,
  Signal,
  Thermometer,
  Timer,
} from '@lucide/vue'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { LineChart } from 'echarts/charts'
import { GridComponent, TooltipComponent } from 'echarts/components'
import { api } from '@/api/index.js'
import { usePolling } from '@/composables/usePolling.js'
import MetricCard from '@/components/MetricCard.vue'
import PageHeader from '@/components/PageHeader.vue'
import { display, errorMessage, formatBytes, formatDuration, formatRate } from '@/utils/format.js'

use([CanvasRenderer, LineChart, GridComponent, TooltipComponent])

const message = useMessage()
const loading = ref(true)
const refreshing = ref(false)
const error = ref('')
const device = ref(null)
const sim = ref(null)
const network = ref(null)
const cells = ref(null)
const stats = ref(null)
const dataStatus = ref(false)
const airplane = ref(null)
const roaming = ref(null)
const connectivity = ref(null)
const addresses = ref({ ipv4: [], ipv6: [] })
const speedHistory = ref({})
const switchLoading = ref('')
const selectedInterface = ref('wlan0')
const showSimDetails = ref(false)
const showCellDetails = ref(false)

const networkInterfaces = computed(() => {
  const interfaces = [...(stats.value?.network_speed?.interfaces || [])]
  return interfaces.sort((a, b) => {
    if (a.interface === 'wlan0') return -1
    if (b.interface === 'wlan0') return 1
    return a.interface.localeCompare(b.interface)
  })
})
const selectedInterfaceData = computed(() => (
  networkInterfaces.value.find((item) => item.interface === selectedInterface.value)
  || networkInterfaces.value[0]
  || null
))
const selectedHistory = computed(() => (
  speedHistory.value[selectedInterfaceData.value?.interface] || { rx: [], tx: [] }
))
const hasTrafficHistory = computed(() => (
  Math.max(selectedHistory.value.rx.length, selectedHistory.value.tx.length) > 1
))
const temperatures = computed(() => stats.value?.temperature || [])
const cellRows = computed(() => cells.value?.cells || [])
const servingCell = computed(() => cells.value?.serving_cell || cellRows.value.find((item) => item.is_serving) || null)
const chartOption = computed(() => {
  const history = selectedHistory.value
  const sampleCount = Math.max(history.rx.length, history.tx.length)
  return {
    animation: false,
    tooltip: { trigger: 'axis', valueFormatter: (value) => formatRate(value) },
    grid: { top: 16, right: 12, bottom: 24, left: 68 },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: Array.from({ length: sampleCount }, (_, index) => index + 1),
      axisLabel: { show: false },
      axisTick: { show: false },
      axisLine: { lineStyle: { color: '#72808a' } },
    },
    yAxis: { type: 'value', axisLabel: { formatter: (value) => formatRate(value) }, splitLine: { lineStyle: { color: '#87929b22' } } },
    series: [
      {
        name: '下载',
        type: 'line',
        showSymbol: false,
        smooth: true,
        data: history.rx,
        lineStyle: { color: '#16845b', width: 2 },
        areaStyle: { color: '#16845b', opacity: 0.08 },
      },
      {
        name: '上传',
        type: 'line',
        showSymbol: false,
        smooth: true,
        data: history.tx,
        lineStyle: { color: '#0784b5', width: 2 },
        areaStyle: { color: '#0784b5', opacity: 0.06 },
      },
    ],
  }
})

watch(networkInterfaces, (interfaces) => {
  if (!interfaces.some((item) => item.interface === selectedInterface.value)) {
    selectedInterface.value = interfaces[0]?.interface || ''
  }
})

function updateHistory(interfaces = []) {
  const next = { ...speedHistory.value }
  interfaces.forEach((item) => {
    const current = next[item.interface] || { rx: [], tx: [] }
    next[item.interface] = {
      rx: [...current.rx, item.rx_bytes_per_sec].slice(-30),
      tx: [...current.tx, item.tx_bytes_per_sec].slice(-30),
    }
  })
  speedHistory.value = next
}

async function load(background = false) {
  if (!background) refreshing.value = true
  const requests = [
    ['device', api.getDeviceInfo()],
    ['sim', api.getSimInfo()],
    ['network', api.getNetworkInfo()],
    ['cells', api.getCellsInfo()],
    ['stats', api.getSystemStats()],
    ['data', api.getDataStatus()],
    ['airplane', api.getAirplaneMode()],
    ['roaming', api.getRoamingStatus()],
    ['connectivity', api.getConnectivity()],
    ['addresses', api.getNetworkConnectionAddresses()],
  ]
  const results = await Promise.allSettled(requests.map(([, promise]) => promise))
  const failures = []
  results.forEach((result, index) => {
    const key = requests[index][0]
    if (result.status === 'rejected') {
      failures.push(`${key}: ${errorMessage(result.reason)}`)
      return
    }
    const value = result.value?.data
    if (key === 'device') device.value = value
    if (key === 'sim') sim.value = value
    if (key === 'network') network.value = value
    if (key === 'cells') cells.value = value
    if (key === 'stats') {
      stats.value = value
      updateHistory(value?.network_speed?.interfaces)
    }
    if (key === 'data') dataStatus.value = Boolean(value?.active)
    if (key === 'airplane') airplane.value = value
    if (key === 'roaming') roaming.value = value
    if (key === 'connectivity') connectivity.value = value
    if (key === 'addresses') addresses.value = value || { ipv4: [], ipv6: [] }
  })
  error.value = failures.length && !background ? failures[0] : ''
  loading.value = false
  refreshing.value = false
}

async function toggle(kind, value) {
  switchLoading.value = kind
  try {
    if (kind === 'data') {
      await api.setDataStatus(value)
      dataStatus.value = value
    } else if (kind === 'airplane') {
      const response = await api.setAirplaneMode(value)
      airplane.value = response.data
    } else if (kind === 'roaming') {
      const response = await api.setRoamingAllowed(value)
      roaming.value = response.data
    }
    message.success('设置已更新')
  } catch (toggleError) {
    message.error(errorMessage(toggleError))
  } finally {
    switchLoading.value = ''
  }
}

usePolling(load)
</script>

<template>
  <main class="page">
    <PageHeader title="仪表盘" description="设备、蜂窝链路与系统资源的实时概览" :loading="refreshing" @refresh="load(false)" />
    <NAlert v-if="error" type="error" closable style="margin-bottom: 12px" @close="error = ''">{{ error }}</NAlert>

    <div v-if="loading" class="metric-grid">
      <NCard v-for="i in 4" :key="i"><NSkeleton text :repeat="3" /></NCard>
    </div>
    <template v-else>
      <div class="metric-grid">
        <MetricCard label="蜂窝网络" :value="network?.operator_name || sim?.registered_operator_name || '未注册'" :detail="`${display(network?.registration_status)} · ${display(network?.technology_preference)}`" :icon="Signal" :tone="network?.registration_status === 'registered' ? 'success' : 'warning'" />
        <MetricCard label="信号强度" :value="`${network?.signal_strength ?? 0}%`" :detail="sim?.registered_operator_code || '等待网络信息'" :icon="RadioTower" :tone="(network?.signal_strength || 0) > 40 ? 'success' : 'warning'" />
        <MetricCard label="下载速率" :value="formatRate(selectedInterfaceData?.rx_bytes_per_sec)" :detail="selectedInterfaceData?.interface || '无活动接口'" :icon="ArrowDown" />
        <MetricCard label="上传速率" :value="formatRate(selectedInterfaceData?.tx_bytes_per_sec)" :detail="selectedInterfaceData?.interface || '无活动接口'" :icon="ArrowUp" tone="success" />
      </div>

      <div class="panel-grid">
        <NCard class="section-card panel--wide traffic-card" title="实时流量">
          <template #header-extra>
            <NTabs
              v-if="networkInterfaces.length"
              v-model:value="selectedInterface"
              class="interface-tabs interface-tabs--header"
              type="segment"
              size="small"
              :pane-style="{ display: 'none' }"
            >
              <NTabPane
                v-for="item in networkInterfaces"
                :key="item.interface"
                :name="item.interface"
                :tab="item.interface"
              />
            </NTabs>
          </template>
          <div v-if="networkInterfaces.length" class="traffic-panel">
            <div class="traffic-summary">
              <div class="traffic-summary__rates">
                <div class="traffic-rate traffic-rate--download">
                  <NIcon :size="16"><ArrowDown /></NIcon>
                  <span>下载</span>
                  <strong>{{ formatRate(selectedInterfaceData?.rx_bytes_per_sec) }}</strong>
                </div>
                <div class="traffic-rate traffic-rate--upload">
                  <NIcon :size="16"><ArrowUp /></NIcon>
                  <span>上传</span>
                  <strong>{{ formatRate(selectedInterfaceData?.tx_bytes_per_sec) }}</strong>
                </div>
              </div>
              <NText depth="3" class="traffic-summary__total">
                累计下载 {{ formatBytes(selectedInterfaceData?.total_rx_bytes) }} · 上传 {{ formatBytes(selectedInterfaceData?.total_tx_bytes) }}
              </NText>
            </div>

            <VChart v-if="hasTrafficHistory" class="chart traffic-chart" :option="chartOption" autoresize />
            <div v-else class="empty-state traffic-empty"><div><Activity :size="30" />正在采集趋势数据</div></div>
          </div>
          <div v-else class="empty-state"><div><Activity :size="30" />暂无流量数据</div></div>
        </NCard>

        <NCard class="section-card panel--narrow" title="快速控制">
          <div class="action-list">
            <div class="action-row">
              <div class="action-row__copy"><strong>移动数据</strong><span>蜂窝数据连接</span></div>
              <NSwitch :value="dataStatus" :loading="switchLoading === 'data'" @update:value="toggle('data', $event)" />
            </div>
            <div class="action-row">
              <div class="action-row__copy"><strong>飞行模式</strong><span>关闭蜂窝射频</span></div>
              <NSwitch :value="airplane?.enabled" :loading="switchLoading === 'airplane'" @update:value="toggle('airplane', $event)" />
            </div>
            <div class="action-row">
              <div class="action-row__copy"><strong>数据漫游</strong><span>{{ roaming?.is_roaming ? '当前正在漫游' : '当前非漫游网络' }}</span></div>
              <NSwitch :value="roaming?.roaming_allowed" :loading="switchLoading === 'roaming'" @update:value="toggle('roaming', $event)" />
            </div>
          </div>
        </NCard>

        <NCard class="section-card" title="设备信息">
          <template #header-extra><NTag size="small" :type="device?.online ? 'success' : 'warning'">{{ device?.online ? '在线' : '离线' }}</NTag></template>
          <div class="description-grid">
            <div class="description-item"><span>厂商</span><strong>{{ display(device?.manufacturer) }}</strong></div>
            <div class="description-item"><span>型号</span><strong>{{ display(device?.model) }}</strong></div>
            <div class="description-item"><span>IMEI</span><strong class="mono">{{ display(device?.imei) }}</strong></div>
            <div class="description-item"><span>固件版本</span><strong>{{ display(device?.revision) }}</strong></div>
          </div>
        </NCard>

        <NCard class="section-card" title="SIM 状态">
          <template #header-extra>
            <NSpace :size="4" align="center">
              <NIcon :size="19"><CreditCard /></NIcon>
              <NTooltip>
                <template #trigger>
                  <NButton quaternary circle size="small" :aria-label="showSimDetails ? '隐藏 SIM 信息' : '显示 SIM 信息'" @click="showSimDetails = !showSimDetails">
                    <template #icon><EyeOff v-if="showSimDetails" :size="16" /><Eye v-else :size="16" /></template>
                  </NButton>
                </template>
                {{ showSimDetails ? '隐藏 SIM 信息' : '显示 SIM 信息' }}
              </NTooltip>
            </NSpace>
          </template>
          <div class="description-grid">
            <div class="description-item"><span>状态</span><strong>{{ sim?.present ? '已插入' : '未检测到' }}</strong></div>
            <div class="description-item"><span>类型</span><strong>{{ display(sim?.sim_type) }}</strong></div>
            <div class="description-item"><span>号码</span><strong class="sensitive-value" :class="{ 'sensitive-value--hidden': !showSimDetails }">{{ sim?.phone_numbers?.join(' / ') || '--' }}</strong></div>
            <div class="description-item"><span>ICCID</span><strong class="mono sensitive-value" :class="{ 'sensitive-value--hidden': !showSimDetails }">{{ display(sim?.iccid) }}</strong></div>
          </div>
        </NCard>

        <NCard class="section-card panel--full" title="小区信息">
          <template #header-extra>
            <NSpace :size="6" align="center">
              <NTag size="small" :type="cellRows.length ? 'success' : 'default'">{{ cellRows.length }} 个小区</NTag>
              <NTooltip>
                <template #trigger><NButton quaternary circle size="small" :aria-label="showCellDetails ? '隐藏小区标识' : '显示小区标识'" @click="showCellDetails = !showCellDetails"><template #icon><EyeOff v-if="showCellDetails" :size="16" /><Eye v-else :size="16" /></template></NButton></template>
                {{ showCellDetails ? '隐藏小区标识' : '显示小区标识' }}
              </NTooltip>
            </NSpace>
          </template>
          <div v-if="servingCell" class="description-grid" style="margin-bottom: 14px">
            <div class="description-item"><span>服务制式</span><strong>{{ display(servingCell.tech) }}</strong></div>
            <div class="description-item"><span>频段</span><strong>{{ display(servingCell.band) }}</strong></div>
            <div class="description-item"><span>Cell ID</span><strong class="mono sensitive-value" :class="{ 'sensitive-value--hidden': !showCellDetails }">{{ servingCell.cell_id ?? '--' }}</strong></div>
            <div class="description-item"><span>TAC</span><strong class="mono sensitive-value" :class="{ 'sensitive-value--hidden': !showCellDetails }">{{ servingCell.tac ?? '--' }}</strong></div>
          </div>
          <div v-if="cellRows.length" class="compact-table">
            <div class="compact-table__head"><span>角色</span><span>频段</span><span>ARFCN / PCI</span><span>RSRP / RSRQ / SINR</span></div>
            <div v-for="(cell, index) in cellRows" :key="`${cell.arfcn}-${cell.pci}-${index}`" class="compact-table__row">
              <span><small>角色</small><NTag size="small" :type="cell.is_serving ? 'success' : 'default'">{{ cell.is_serving ? '服务小区' : '邻区' }}</NTag></span>
              <strong><small>频段</small>{{ cell.band || '--' }}</strong>
              <span class="mono"><small>ARFCN / PCI</small>{{ cell.arfcn ?? '--' }} / {{ cell.pci ?? '--' }}</span>
              <span class="mono"><small>RSRP / RSRQ / SINR</small>{{ cell.rsrp ?? '--' }} / {{ cell.rsrq ?? '--' }} / {{ cell.sinr ?? '--' }}</span>
            </div>
          </div>
          <div v-else class="empty-state"><div><RadioTower :size="30" />暂无小区数据</div></div>
        </NCard>

        <NCard class="section-card panel--full" title="系统资源">
          <div class="metric-grid" style="margin: 0">
            <MetricCard label="CPU 负载" :value="`${Math.round(stats?.cpu_load?.load_percent || 0)}%`" :detail="`${stats?.cpu_load?.core_count || 0} 核 · ${stats?.cpu_load?.load_1min || 0} / ${stats?.cpu_load?.load_5min || 0}`" :icon="Cpu" />
            <MetricCard label="内存使用" :value="`${Math.round(stats?.memory?.used_percent || 0)}%`" :detail="`${formatBytes(stats?.memory?.used_bytes)} / ${formatBytes(stats?.memory?.total_bytes)}`" :icon="MemoryStick" tone="success" />
            <MetricCard label="设备温度" :value="temperatures.length ? `${Math.round(Math.max(...temperatures.map(item => item.temperature)))}°C` : '--'" :detail="temperatures.map(item => item.label || item.type).slice(0, 2).join(' · ') || '无温度传感器'" :icon="Thermometer" tone="warning" />
            <MetricCard label="运行时间" :value="formatDuration(stats?.uptime?.uptime_seconds)" :detail="stats?.system_info?.nodename || '设备主机'" :icon="Timer" />
          </div>
          <NSpace vertical style="margin-top: 16px">
            <div v-for="disk in stats?.disk || []" :key="disk.mount_point">
              <div class="status-line" style="justify-content: space-between; margin-bottom: 5px">
                <NText><HardDrive :size="14" style="vertical-align: -2px" /> {{ disk.mount_point }}</NText>
                <NText depth="3">{{ formatBytes(disk.used_bytes) }} / {{ formatBytes(disk.total_bytes) }}</NText>
              </div>
              <NProgress type="line" :percentage="Math.round(disk.used_percent)" :status="disk.used_percent > 85 ? 'error' : 'success'" :height="7" />
            </div>
          </NSpace>
          <div v-if="temperatures.length" class="temperature-list">
            <div v-for="(sensor, index) in temperatures" :key="`${sensor.type}-${index}`" class="temperature-row">
              <span>{{ sensor.label || sensor.type }}</span>
              <NProgress type="line" :percentage="Math.max(0, Math.min(100, Math.round(sensor.temperature)))" :show-indicator="false" :status="sensor.temperature >= 80 ? 'error' : sensor.temperature >= 65 ? 'warning' : 'success'" :height="6" />
              <strong class="mono">{{ Number(sensor.temperature).toFixed(1) }}°C</strong>
            </div>
          </div>
        </NCard>

        <NCard class="section-card panel--full" title="连接状态">
          <div class="description-grid">
            <div class="description-item"><span>IPv4 地址</span><strong class="mono">{{ addresses?.ipv4?.join(', ') || '--' }}</strong></div>
            <div class="description-item"><span>IPv6 地址</span><strong class="mono">{{ addresses?.ipv6?.join(', ') || '--' }}</strong></div>
            <div class="description-item"><span>IPv4 连通性</span><strong>{{ connectivity?.ipv4?.success ? `正常 · ${connectivity.ipv4.latency_ms || 0} ms` : '不可用' }}</strong></div>
            <div class="description-item"><span>IPv6 连通性</span><strong>{{ connectivity?.ipv6?.success ? `正常 · ${connectivity.ipv6.latency_ms || 0} ms` : '不可用' }}</strong></div>
          </div>
        </NCard>
      </div>
    </template>
  </main>
</template>
