<script setup>
import { computed, ref } from 'vue'
import {
  NAlert,
  NCard,
  NIcon,
  NProgress,
  NSkeleton,
  NSpace,
  NSwitch,
  NTag,
  NText,
  useMessage,
} from 'naive-ui'
import {
  Activity,
  ArrowDown,
  ArrowUp,
  Cpu,
  CreditCard,
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
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components'
import { api } from '@/api/index.js'
import { usePolling } from '@/composables/usePolling.js'
import MetricCard from '@/components/MetricCard.vue'
import PageHeader from '@/components/PageHeader.vue'
import { display, errorMessage, formatBytes, formatDuration, formatRate } from '@/utils/format.js'

use([CanvasRenderer, LineChart, GridComponent, LegendComponent, TooltipComponent])

const message = useMessage()
const loading = ref(true)
const refreshing = ref(false)
const error = ref('')
const device = ref(null)
const sim = ref(null)
const network = ref(null)
const stats = ref(null)
const dataStatus = ref(false)
const airplane = ref(null)
const roaming = ref(null)
const connectivity = ref(null)
const addresses = ref({ ipv4: [], ipv6: [] })
const speedHistory = ref({})
const switchLoading = ref('')

const primaryInterface = computed(() => stats.value?.network_speed?.interfaces?.[0] || null)
const temperatures = computed(() => stats.value?.temperature || [])
const chartOption = computed(() => {
  const interfaces = Object.entries(speedHistory.value)
  const palette = ['#0784b5', '#16845b', '#c87916', '#a8558d', '#6b7280', '#ce3e4f']
  const series = []
  const legend = []
  interfaces.forEach(([name, history], index) => {
    legend.push(`${name} 下载`, `${name} 上传`)
    series.push(
      { name: `${name} 下载`, type: 'line', showSymbol: false, smooth: true, data: history.rx, lineStyle: { color: palette[(index * 2) % palette.length], width: 2 } },
      { name: `${name} 上传`, type: 'line', showSymbol: false, smooth: true, data: history.tx, lineStyle: { color: palette[(index * 2 + 1) % palette.length], width: 2, type: 'dashed' } },
    )
  })
  return {
    animation: false,
    color: palette,
    tooltip: { trigger: 'axis', valueFormatter: (value) => formatRate(value) },
    legend: { type: 'scroll', bottom: 0, data: legend, textStyle: { color: 'var(--muted)' } },
    grid: { top: 18, right: 12, bottom: 42, left: 68 },
    xAxis: { type: 'category', boundaryGap: false, axisLabel: { show: false }, axisLine: { lineStyle: { color: '#72808a' } } },
    yAxis: { type: 'value', axisLabel: { formatter: (value) => formatRate(value) }, splitLine: { lineStyle: { color: '#87929b22' } } },
    series,
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
        <MetricCard label="下载速率" :value="formatRate(primaryInterface?.rx_bytes_per_sec)" :detail="primaryInterface?.interface || '无活动接口'" :icon="ArrowDown" />
        <MetricCard label="上传速率" :value="formatRate(primaryInterface?.tx_bytes_per_sec)" :detail="primaryInterface?.interface || '无活动接口'" :icon="ArrowUp" tone="success" />
      </div>

      <div class="panel-grid">
        <NCard class="section-card panel--wide" title="实时流量">
          <template #header-extra><NTag size="small" :bordered="false">最近 30 个采样点</NTag></template>
          <VChart v-if="Object.keys(speedHistory).length" class="chart" :option="chartOption" autoresize />
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
          <template #header-extra><NIcon :size="19"><CreditCard /></NIcon></template>
          <div class="description-grid">
            <div class="description-item"><span>状态</span><strong>{{ sim?.present ? '已插入' : '未检测到' }}</strong></div>
            <div class="description-item"><span>类型</span><strong>{{ display(sim?.sim_type) }}</strong></div>
            <div class="description-item"><span>号码</span><strong>{{ sim?.phone_numbers?.join(' / ') || '--' }}</strong></div>
            <div class="description-item"><span>ICCID</span><strong class="mono">{{ display(sim?.iccid) }}</strong></div>
          </div>
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
