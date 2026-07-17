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
  NSelect,
  NSpace,
  NSwitch,
  NTabPane,
  NTabs,
  NTag,
  useDialog,
  useMessage,
} from 'naive-ui'
import { Cable, Eraser, Pencil, Play, RefreshCw, Router, Save, Wifi, WifiOff } from '@lucide/vue'
import { api } from '@/api/index.js'
import PageHeader from '@/components/PageHeader.vue'
import MetricCard from '@/components/MetricCard.vue'
import { errorMessage, formatBytes } from '@/utils/format.js'

const message = useMessage()
const dialog = useDialog()
const tab = ref('interfaces')
const loading = ref(true)
const actionLoading = ref('')
const error = ref('')
const interfaces = ref([])
const wlan = ref(null)
const dataActive = ref(false)
const networks = ref([])
const profiles = ref([])
const ddnsStatus = ref(null)
const ddnsLogs = ref([])
const ddns = reactive({
  enabled: false, provider: 'cloudflare', access_id: '', access_secret: '', interval_seconds: 300, ttl: 600,
  ipv4: { enabled: true, get_type: 'api', interface_name: '', urls: [], domains: [] },
  ipv6: { enabled: false, get_type: 'api', interface_name: '', urls: [], domains: [] },
})
const domainText = reactive({ ipv4: '', ipv6: '' })
const urlText = reactive({ ipv4: '', ipv6: '' })
const connectOpen = ref(false)
const connectForm = reactive({ ssid: '', password: '', auto_join: true })
const profileOpen = ref(false)
const profileForm = reactive({ connection_id: '', auto_join: true, ipv4_mode: 'auto', ipv4_address: '', ipv4_prefix: 24, ipv4_gateway: '' })
const wlanDisableOpen = ref(false)
const wlanDisableText = ref('')

const interfaceColumns = [
  {
    title: '接口', key: 'name', minWidth: 150,
    render: (row) => h('div', [h('div', { class: 'table-cell-main' }, row.name), h('div', { class: 'table-cell-sub mono' }, row.mac_address || '--')]),
  },
  { title: '类型', key: 'type', width: 100, render: (row) => row.is_cellular ? '蜂窝' : row.is_wireless ? '无线' : '有线' },
  { title: '状态', key: 'status', width: 100, render: (row) => h(NTag, { size: 'small', type: row.status === 'up' ? 'success' : 'default' }, { default: () => row.status }) },
  { title: 'IP 地址', key: 'ips', minWidth: 240, render: (row) => row.ip_addresses?.map((ip) => `${ip.address}/${ip.prefix_len}`).join(', ') || '--' },
  { title: '接收', key: 'rx_bytes', width: 110, render: (row) => formatBytes(row.rx_bytes) },
  { title: '发送', key: 'tx_bytes', width: 110, render: (row) => formatBytes(row.tx_bytes) },
]
const networkColumns = [
  { title: 'Wi-Fi', key: 'ssid', minWidth: 180, render: (row) => h('div', [h('div', { class: 'table-cell-main' }, row.ssid || '隐藏网络'), h('div', { class: 'table-cell-sub mono' }, row.bssid)]) },
  { title: '信号', key: 'signal', width: 100, render: (row) => `${row.signal}%` },
  { title: '安全', key: 'security', minWidth: 130 },
  { title: '状态', key: 'connected', width: 90, render: (row) => row.connected ? h(NTag, { size: 'small', type: 'success' }, { default: () => '已连接' }) : '--' },
  { title: '操作', key: 'action', width: 100, render: (row) => h(NButton, { size: 'small', type: 'primary', disabled: row.connected, onClick: () => openConnect(row) }, { default: () => '连接' }) },
]
const logColumns = [
  { title: '时间', key: 'timestamp', minWidth: 170 },
  { title: '类型', key: 'record_type', width: 80 },
  { title: '域名', key: 'domains', minWidth: 180, render: (row) => row.domains?.join(', ') || '--' },
  { title: '级别', key: 'level', width: 90, render: (row) => h(NTag, { size: 'small', type: row.level === 'error' ? 'error' : row.level === 'warning' ? 'warning' : 'default' }, { default: () => row.level }) },
  { title: '消息', key: 'message', minWidth: 260 },
]
const activeInterface = computed(() => interfaces.value.find((item) => item.is_default_ipv4) || interfaces.value.find((item) => item.status === 'up'))

async function load() {
  loading.value = true
  const results = await Promise.allSettled([
    api.getNetworkInterfaces(), api.getWlanStatus(), api.getWlanProfiles(),
    api.getDdnsConfig(), api.getDdnsStatus(), api.getDdnsLogs(), api.getDataStatus(),
  ])
  if (results[0].status === 'fulfilled') interfaces.value = results[0].value.data?.interfaces || []
  if (results[1].status === 'fulfilled') wlan.value = results[1].value.data
  if (results[2].status === 'fulfilled') profiles.value = results[2].value.data?.profiles || []
  if (results[3].status === 'fulfilled' && results[3].value.data) {
    Object.assign(ddns, results[3].value.data)
    domainText.ipv4 = ddns.ipv4?.domains?.join('\n') || ''
    domainText.ipv6 = ddns.ipv6?.domains?.join('\n') || ''
    urlText.ipv4 = ddns.ipv4?.urls?.join('\n') || ''
    urlText.ipv6 = ddns.ipv6?.urls?.join('\n') || ''
  }
  if (results[4].status === 'fulfilled') ddnsStatus.value = results[4].value.data
  if (results[5].status === 'fulfilled') ddnsLogs.value = results[5].value.data?.entries || []
  if (results[6].status === 'fulfilled') dataActive.value = Boolean(results[6].value.data?.active)
  const failure = results.find((item) => item.status === 'rejected')
  if (failure && !interfaces.value.length) error.value = errorMessage(failure.reason)
  loading.value = false
}

async function runAction(name, action, success, refresh = true) {
  actionLoading.value = name
  try {
    await action()
    message.success(success)
    if (refresh) await load()
  } catch (actionError) {
    message.error(errorMessage(actionError))
  } finally { actionLoading.value = '' }
}

async function scanWifi() {
  actionLoading.value = 'scan'
  try {
    const response = await api.scanWlan()
    networks.value = response.data?.networks || []
  } catch (scanError) {
    message.error(errorMessage(scanError))
  } finally { actionLoading.value = '' }
}
function openConnect(row) {
  connectForm.ssid = row.ssid
  connectForm.password = ''
  connectForm.auto_join = true
  connectOpen.value = true
}
async function connectWifi() {
  await runAction('connect', () => api.connectWlan({ ...connectForm }), 'Wi-Fi 已连接')
  connectOpen.value = false
}
function disconnectWifi() {
  runAction('disconnect', () => api.disconnectWlan(), 'Wi-Fi 已断开')
}
function requestToggleWifi(value) {
  if (value) {
    runAction('wifi', () => api.setWlanEnabled(true), 'Wi-Fi 已启用')
    return
  }
  wlanDisableText.value = ''
  wlanDisableOpen.value = true
}
async function confirmDisableWifi() {
  if (wlanDisableText.value !== '确认关闭 WLAN') return
  await runAction('wifi', () => api.setWlanEnabled(false), 'Wi-Fi 已关闭')
  wlanDisableOpen.value = false
  networks.value = []
}
function forgetProfile(profile) {
  dialog.warning({ title: '忘记网络', content: `删除已保存的网络 ${profile.ssid}？`, positiveText: '删除', negativeText: '取消', onPositiveClick: () => runAction('forget', () => api.forgetWlan({ uuid: profile.uuid, connection_id: profile.id }), '网络配置已删除') })
}
function connectSavedProfile(profile) {
  runAction('connect-saved', () => api.connectWlan({ ssid: profile.ssid || profile.id, auto_join: profile.auto_join }), `已连接 ${profile.ssid || profile.id}`)
}
function openProfileEditor(profile) {
  const address = wlan.value?.ipv4_addresses?.[0] || ''
  const [ipv4Address, prefix] = address.split('/')
  Object.assign(profileForm, {
    connection_id: profile?.id || wlan.value?.connection_id || '',
    auto_join: profile?.auto_join ?? true,
    ipv4_mode: 'auto',
    ipv4_address: ipv4Address || '',
    ipv4_prefix: Number(prefix) || 24,
    ipv4_gateway: wlan.value?.ipv4_gateway || '',
  })
  profileOpen.value = true
}
async function saveProfile() {
  if (!profileForm.connection_id) return
  if (profileForm.ipv4_mode === 'manual' && (!profileForm.ipv4_address || !profileForm.ipv4_gateway)) {
    message.warning('手动 IPv4 模式需要填写地址和网关')
    return
  }
  const payload = {
    connection_id: profileForm.connection_id,
    auto_join: profileForm.auto_join,
    ipv4_mode: profileForm.ipv4_mode,
    ...(profileForm.ipv4_mode === 'manual' ? {
      ipv4_address: profileForm.ipv4_address,
      ipv4_prefix: profileForm.ipv4_prefix,
      ipv4_gateway: profileForm.ipv4_gateway,
    } : {}),
  }
  await runAction('profile-save', () => api.saveWlanProfile(payload), 'WLAN 配置已保存')
  profileOpen.value = false
}
function lines(value) { return value.split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean) }
function saveDdns() {
  const payload = JSON.parse(JSON.stringify(ddns))
  payload.ipv4.domains = lines(domainText.ipv4)
  payload.ipv6.domains = lines(domainText.ipv6)
  payload.ipv4.urls = lines(urlText.ipv4)
  payload.ipv6.urls = lines(urlText.ipv6)
  runAction('ddns-save', () => api.setDdnsConfig(payload), 'DDNS 配置已保存')
}
function syncDdns() { runAction('ddns-sync', () => api.syncDdnsNow(), 'DDNS 同步已执行') }
function clearLogs() { runAction('clear-logs', () => api.clearDdnsLogs(), 'DDNS 日志已清空') }

load()
</script>

<template>
  <main class="page">
    <PageHeader title="设备网络" description="管理物理网络接口、WLAN 客户端和动态域名解析" :loading="loading" @refresh="load" />
    <NAlert v-if="error" type="error" style="margin-bottom: 12px">{{ error }}</NAlert>
    <div class="metric-grid">
      <MetricCard label="活动接口" :value="activeInterface?.name || '--'" :detail="activeInterface?.status || '无活动接口'" :icon="Cable" :tone="activeInterface ? 'success' : 'warning'" />
      <MetricCard label="WLAN" :value="wlan?.connected ? wlan.ssid : (wlan?.enabled ? '已启用' : '已关闭')" :detail="wlan?.interface_name || '无线客户端'" :icon="Wifi" :tone="wlan?.connected ? 'success' : 'warning'" />
      <MetricCard label="IPv4" :value="wlan?.ipv4_addresses?.[0] || activeInterface?.ip_addresses?.find(ip => ip.ip_type === 'ipv4')?.address || '--'" :detail="wlan?.ipv4_gateway ? `网关 ${wlan.ipv4_gateway}` : '设备地址'" :icon="Router" />
      <MetricCard label="DDNS" :value="ddnsStatus?.running ? '运行中' : (ddnsStatus?.enabled ? '等待同步' : '已关闭')" :detail="ddnsStatus?.last_message || ddnsStatus?.provider || '动态域名解析'" :icon="RefreshCw" :tone="ddnsStatus?.running ? 'success' : 'warning'" />
    </div>

    <NTabs v-model:value="tab" type="line" animated>
      <NTabPane name="interfaces" tab="网络接口">
        <NCard><NDataTable :columns="interfaceColumns" :data="interfaces" :loading="loading" :scroll-x="900" /></NCard>
      </NTabPane>
      <NTabPane name="wlan" tab="WLAN">
        <div class="panel-grid">
          <NCard class="section-card panel--full" title="无线客户端">
            <template #header-extra><NSwitch :value="wlan?.enabled" :loading="actionLoading === 'wifi'" @update:value="requestToggleWifi" /></template>
            <div class="toolbar">
              <div class="status-line"><span class="status-dot" :class="{ 'status-dot--online': wlan?.connected }" />{{ wlan?.connected ? `已连接 ${wlan.ssid}` : '未连接' }}</div>
              <NSpace><NButton v-if="wlan?.connected" secondary @click="openProfileEditor(profiles.find(profile => profile.active))"><template #icon><Pencil :size="16" /></template>属性</NButton><NButton v-if="wlan?.connected" secondary @click="disconnectWifi"><template #icon><WifiOff :size="16" /></template>断开</NButton><NButton type="primary" :loading="actionLoading === 'scan'" @click="scanWifi"><template #icon><RefreshCw :size="16" /></template>扫描网络</NButton></NSpace>
            </div>
            <NDataTable :columns="networkColumns" :data="networks" :scroll-x="720" />
          </NCard>
          <NCard class="section-card panel--full" title="已保存网络">
            <div class="action-list">
              <div v-for="profile in profiles" :key="profile.uuid" class="action-row">
                <div class="action-row__copy"><strong>{{ profile.ssid }}</strong><span>{{ profile.auto_join ? '自动连接' : '手动连接' }} · {{ profile.interface_name || '任意接口' }}</span></div>
                <div class="action-row__control"><NTag v-if="profile.active" type="success">活动</NTag><NButton v-if="!profile.active" size="small" secondary :loading="actionLoading === 'connect-saved'" @click="connectSavedProfile(profile)">连接</NButton><NButton quaternary circle aria-label="编辑网络属性" @click="openProfileEditor(profile)"><template #icon><Pencil :size="17" /></template></NButton><NButton quaternary type="error" circle aria-label="忘记网络" @click="forgetProfile(profile)"><template #icon><Eraser :size="17" /></template></NButton></div>
              </div>
              <div v-if="!profiles.length" class="empty-state">暂无已保存网络</div>
            </div>
          </NCard>
        </div>
      </NTabPane>
      <NTabPane name="ddns" tab="DDNS">
        <div class="panel-grid">
          <NCard class="section-card panel--full" title="动态域名解析">
            <NForm label-placement="top">
              <div class="inline-form">
                <NFormItem label="启用 DDNS"><NSwitch v-model:value="ddns.enabled" /></NFormItem>
                <NFormItem label="服务商"><NSelect v-model:value="ddns.provider" :options="[{ label: 'Cloudflare', value: 'cloudflare' }, { label: '阿里云 DNS', value: 'alidns' }, { label: '腾讯云 DNSPod', value: 'tencentcloud' }]" /></NFormItem>
                <NFormItem label="Access ID"><NInput v-model:value="ddns.access_id" /></NFormItem>
                <NFormItem label="Access Secret"><NInput v-model:value="ddns.access_secret" type="password" show-password-on="click" :placeholder="ddns.access_secret_set ? '已保存，留空则不修改' : '请输入密钥'" /></NFormItem>
                <NFormItem label="同步间隔（秒）"><NInputNumber v-model:value="ddns.interval_seconds" :min="30" style="width: 100%" /></NFormItem>
                <NFormItem label="TTL（秒）"><NInputNumber v-model:value="ddns.ttl" :min="60" style="width: 100%" /></NFormItem>
              </div>
              <NTabs type="segment" animated>
                <NTabPane v-for="version in ['ipv4', 'ipv6']" :key="version" :name="version" :tab="version.toUpperCase()">
                  <div class="inline-form">
                    <NFormItem label="启用"><NSwitch v-model:value="ddns[version].enabled" /></NFormItem>
                    <NFormItem label="地址来源"><NSelect v-model:value="ddns[version].get_type" :options="[{ label: '外部 API', value: 'api' }, { label: '指定接口', value: 'interface' }]" /></NFormItem>
                    <NFormItem v-if="ddns[version].get_type === 'interface'" label="接口名称"><NInput v-model:value="ddns[version].interface_name" /></NFormItem>
                    <NFormItem label="域名（每行一个）"><NInput v-model:value="domainText[version]" type="textarea" :rows="3" /></NFormItem>
                    <NFormItem v-if="ddns[version].get_type === 'api'" label="查询 URL（每行一个）"><NInput v-model:value="urlText[version]" type="textarea" :rows="3" /></NFormItem>
                  </div>
                </NTabPane>
              </NTabs>
            </NForm>
            <NSpace justify="end"><NButton secondary :loading="actionLoading === 'ddns-sync'" @click="syncDdns"><template #icon><Play :size="16" /></template>立即同步</NButton><NButton type="primary" :loading="actionLoading === 'ddns-save'" @click="saveDdns"><template #icon><Save :size="16" /></template>保存</NButton></NSpace>
          </NCard>
          <NCard class="section-card panel--full" title="同步日志">
            <template #header-extra><NButton quaternary type="error" @click="clearLogs"><template #icon><Eraser :size="16" /></template>清空</NButton></template>
            <NDataTable :columns="logColumns" :data="ddnsLogs" :scroll-x="900" :pagination="{ pageSize: 10 }" />
          </NCard>
        </div>
      </NTabPane>
    </NTabs>

    <NModal v-model:show="connectOpen" preset="card" title="连接 Wi-Fi" style="width: min(480px, calc(100vw - 24px))">
      <NForm label-placement="top">
        <NFormItem label="SSID"><NInput v-model:value="connectForm.ssid" /></NFormItem>
        <NFormItem label="密码"><NInput v-model:value="connectForm.password" type="password" show-password-on="click" /></NFormItem>
        <NFormItem label="自动连接"><NSwitch v-model:value="connectForm.auto_join" /></NFormItem>
        <NSpace justify="end"><NButton @click="connectOpen = false">取消</NButton><NButton type="primary" :loading="actionLoading === 'connect'" @click="connectWifi">连接</NButton></NSpace>
      </NForm>
    </NModal>

    <NModal v-model:show="profileOpen" preset="card" title="WLAN 属性" style="width: min(520px, calc(100vw - 24px))">
      <NForm label-placement="top">
        <NFormItem label="连接配置"><NInput v-model:value="profileForm.connection_id" disabled /></NFormItem>
        <NFormItem label="自动加入"><NSwitch v-model:value="profileForm.auto_join" /></NFormItem>
        <NFormItem label="IPv4 配置"><NSelect v-model:value="profileForm.ipv4_mode" :options="[{ label: '自动（DHCP）', value: 'auto' }, { label: '手动', value: 'manual' }]" /></NFormItem>
        <template v-if="profileForm.ipv4_mode === 'manual'">
          <div class="inline-form">
            <NFormItem label="IP 地址"><NInput v-model:value="profileForm.ipv4_address" placeholder="192.168.1.10" /></NFormItem>
            <NFormItem label="前缀长度"><NInputNumber v-model:value="profileForm.ipv4_prefix" :min="1" :max="32" style="width: 100%" /></NFormItem>
            <NFormItem label="网关" class="full"><NInput v-model:value="profileForm.ipv4_gateway" placeholder="192.168.1.1" /></NFormItem>
          </div>
        </template>
        <NSpace justify="end"><NButton @click="profileOpen = false">取消</NButton><NButton type="primary" :loading="actionLoading === 'profile-save'" @click="saveProfile"><template #icon><Save :size="16" /></template>保存</NButton></NSpace>
      </NForm>
    </NModal>

    <NModal v-model:show="wlanDisableOpen" preset="card" title="关闭 WLAN" style="width: min(500px, calc(100vw - 24px))">
      <NAlert :type="dataActive ? 'warning' : 'error'" style="margin-bottom: 14px">
        {{ dataActive ? '蜂窝数据已开启，关闭 WLAN 后仍可通过蜂窝网络管理设备。' : '蜂窝数据未开启，关闭 WLAN 后可能无法远程访问设备。' }}
      </NAlert>
      <NFormItem label="输入“确认关闭 WLAN”继续"><NInput v-model:value="wlanDisableText" :disabled="actionLoading === 'wifi'" /></NFormItem>
      <NSpace justify="end"><NButton :disabled="actionLoading === 'wifi'" @click="wlanDisableOpen = false">取消</NButton><NButton type="error" :loading="actionLoading === 'wifi'" :disabled="wlanDisableText !== '确认关闭 WLAN'" @click="confirmDisableWifi">确认关闭</NButton></NSpace>
    </NModal>
  </main>
</template>
