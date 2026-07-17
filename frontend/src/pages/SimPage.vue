<script setup>
import { computed, h, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
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
  NProgress,
  NSelect,
  NSkeleton,
  NSpace,
  NTabPane,
  NTabs,
  NTag,
  NText,
  NTooltip,
  useDialog,
  useMessage,
} from 'naive-ui'
import {
  Check,
  Download,
  Eye,
  EyeOff,
  Pencil,
  Plus,
  Power,
  RefreshCw,
  Trash2,
  Wrench,
  QrCode,
} from '@lucide/vue'
import jsQR from 'jsqr'
import { api } from '@/api/index.js'
import PageHeader from '@/components/PageHeader.vue'
import { useAppStore } from '@/stores/app.js'
import { display, errorMessage } from '@/utils/format.js'

const route = useRoute()
const router = useRouter()
const message = useMessage()
const dialog = useDialog()
const app = useAppStore()

const tab = ref(route.query.tab === 'esim' ? 'esim' : 'physical')
const sim = ref(null)
const simLoading = ref(true)
const simError = ref('')
const showSensitive = ref(false)
const detailsRefreshing = ref(false)
const autoDetailsIccid = ref('')
const cacheSaving = ref(false)
const cacheForm = reactive({ phone_number: '', sms_center: '' })

const euicc = ref(null)
const profiles = ref([])
const lpac = ref(null)
const esimLoading = ref(false)
const esimLoaded = ref(false)
const esimError = ref('')
const selectedProfileIccid = ref('')
const actionId = ref('')
const lpacRepairing = ref(false)
const lpacProxyPrefix = ref('https://gh-proxy.com/')

const memoryOpen = ref(false)
const memoryInput = ref(null)
const memorySaving = ref(false)

const downloadOpen = ref(false)
const downloadMode = ref('code')
const activationCode = ref('')
const qrInput = ref(null)
const qrLoading = ref(false)
const downloadStatus = ref('idle')
const downloadProgress = ref(0)
const downloadLogs = ref([])
const downloadForm = reactive({ smdp: '', matching_id: '', confirmation_code: '', imei: '' })

const deleteTarget = ref(null)
const deleteConfirmation = ref('')
const deleteLoading = ref(false)

const recoveryOpen = ref(false)
const recoveryRunning = ref(false)
const recoverySteps = ref([])
const recoveryRegistration = ref('')

let detailsTimer
let downloadTimer
let recoveryTimer

const pageLoading = computed(() => simLoading.value || esimLoading.value || app.workModeLoading)
const smsUsagePercent = computed(() => {
  const used = Number(sim.value?.sms_used)
  const total = Number(sim.value?.sms_total)
  if (!Number.isFinite(used) || !Number.isFinite(total) || total <= 0) return null
  return Math.min(100, Math.round((used / total) * 100))
})
const smsUsageText = computed(() => (
  smsUsagePercent.value === null ? '-- / -- 条' : `${sim.value.sms_used} / ${sim.value.sms_total} 条`
))
const selectedProfile = computed(() => (
  profiles.value.find((profile) => profile.iccid === selectedProfileIccid.value)
  || profiles.value[0]
  || null
))
const memoryTotal = computed(() => finiteNumber(euicc.value?.memory_total_kb))
const memoryAvailable = computed(() => finiteNumber(euicc.value?.memory_available_kb))
const memoryUsedPercent = computed(() => {
  if (memoryTotal.value === null || memoryAvailable.value === null || memoryTotal.value <= 0) return null
  return Math.max(0, Math.min(100, Math.round(((memoryTotal.value - memoryAvailable.value) / memoryTotal.value) * 100)))
})
const recoveryMessage = computed(() => {
  const failed = recoverySteps.value.find((step) => step.status === 'error')
  if (failed) return failed.detail || `${failed.step}失败`
  if (recoveryRunning.value) {
    const current = [...recoverySteps.value].reverse().find((step) => step.status === 'running')
    return current ? `正在进行：${current.step}` : '正在启动恢复程序'
  }
  return recoverySteps.value.length ? '网络恢复完成' : '等待恢复状态'
})

const lpacProxyOptions = [
  { label: 'gh-proxy.com', value: 'https://gh-proxy.com/' },
  { label: 'ghproxy.net', value: 'https://ghproxy.net/' },
  { label: 'githubproxy.cc', value: 'https://githubproxy.cc/' },
  { label: '直连', value: '' },
]

const profileColumns = computed(() => [
  {
    title: 'Profile', key: 'name', minWidth: 220,
    render: (row) => h('div', [
      h('div', { class: 'table-cell-main' }, row.name || row.provider || '未命名 Profile'),
      h('div', { class: 'table-cell-sub mono' }, row.iccid),
    ]),
  },
  { title: '运营商', key: 'provider', minWidth: 130, render: (row) => row.provider || '--' },
  {
    title: '状态', key: 'state', width: 100,
    render: (row) => h(NTag, { size: 'small', type: profileActive(row) ? 'success' : 'default' }, { default: () => profileStateLabel(row.state) }),
  },
  {
    title: '操作', key: 'actions', width: 190, fixed: 'right',
    render: (row) => h(NSpace, { size: 6, wrap: false }, {
      default: () => [
        h(NButton, {
          size: 'small',
          type: profileActive(row) ? 'default' : 'primary',
          disabled: profileActive(row) || !lpac.value?.usable,
          loading: actionId.value === `enable-${row.iccid}`,
          onClick: (event) => { event.stopPropagation(); enableProfile(row) },
        }, { default: () => '启用' }),
        iconTooltipButton('重命名', Pencil, () => renameProfile(row)),
        iconTooltipButton('删除', Trash2, () => openDeleteProfile(row), {
          type: 'error',
          disabled: profileActive(row) || row.delete_allowed === false,
        }),
      ],
    }),
  },
])

function iconTooltipButton(label, icon, onClick, props = {}) {
  return h(NTooltip, null, {
    trigger: () => h(NButton, {
      size: 'small',
      quaternary: true,
      'aria-label': label,
      ...props,
      onClick: (event) => { event.stopPropagation(); onClick() },
    }, { icon: () => h(icon, { size: 15 }) }),
    default: () => label,
  })
}

function finiteNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function formatSimType(simType, esimStatus) {
  if (simType === 'physical') return '物理 SIM 卡'
  if (simType === 'esim') return 'eSIM 卡'
  if (esimStatus && esimStatus !== 'unknown') return 'eSIM 卡'
  if (app.workMode === 'sim') return '物理 SIM 卡'
  if (app.workMode === 'esim') return 'eSIM 卡'
  return '未知'
}

function formatLockStatus(status) {
  const labels = {
    none: '未加锁',
    'sim-pin': 'PIN1 已锁定',
    'sim-pin2': 'PIN2 已锁定',
    'sim-puk': 'PIN1 已锁死，需 PUK1 解锁',
    'sim-puk2': 'PIN2 已锁死，需 PUK2 解锁',
  }
  return labels[status] || (status ? `已锁定（${status}）` : '未知')
}

function formatRetries() {
  const values = [
    ['PIN', sim.value?.pin1_retries],
    ['PUK', sim.value?.puk1_retries],
    ['PIN2', sim.value?.pin2_retries],
    ['PUK2', sim.value?.puk2_retries],
  ]
  if (values.every(([, value]) => value === undefined || value === null)) return '--'
  return values.map(([label, value]) => `${label} ${value ?? '-'}`).join(' · ')
}

function formatOperator(name, code) {
  if (name && code) return `${name}（${code}）`
  return name || code || '--'
}

function formatCapacityKb(value) {
  const amount = finiteNumber(value)
  if (amount === null) return '--'
  return amount >= 1024 ? `${(amount / 1024).toFixed(1)} MB` : `${Math.round(amount)} KB`
}

function profileActive(profile) {
  const state = String(profile?.state || '').toLowerCase()
  return ['active', 'enabled', '1'].includes(state)
}

function profileStateLabel(state) {
  const normalized = String(state || '').toLowerCase()
  if (['active', 'enabled', '1'].includes(normalized)) return '已启用'
  if (['inactive', 'disabled', '0'].includes(normalized)) return '已禁用'
  return state || '未知'
}

function profilePolicy(value) {
  if (value === true) return '允许'
  if (value === false) return '不允许'
  return '未知'
}

function ensureCommandSucceeded(command, fallback) {
  if (!command) return
  const status = String(command.status || '').toLowerCase()
  if (Number(command.code) !== 0 || (status && !['success', 'ok'].includes(status))) {
    throw new Error(command.msg || fallback)
  }
}

function translateEsimError(error) {
  const raw = errorMessage(error)
  const normalized = raw.toLowerCase()
  if (normalized.includes('matchingid is refused') || normalized.includes('matching id was refused')) return '激活码已被使用或失效'
  if (normalized.includes('es9p_initiate_authentication')) return '无法启动身份认证，请检查联网状态和激活码'
  if (normalized.includes('es10b_load_bound_profile_package')) return 'Profile 可能已存在，无法重复写入'
  if (normalized.includes('timeout') || normalized.includes('resolve') || normalized.includes('connect')) return '无法连接 SM-DP+ 服务器，请检查设备网络'
  return raw
}

async function loadSim(background = false) {
  if (!background) simLoading.value = true
  simError.value = ''
  try {
    const response = await api.getSimInfo()
    sim.value = response.data
    cacheForm.phone_number = sim.value?.phone_numbers?.[0] || ''
    cacheForm.sms_center = sim.value?.sms_center || ''

    const missingSlowFields = sim.value?.present && (
      !sim.value?.phone_numbers?.length
      || !sim.value?.sms_center
      || sim.value?.sms_total === undefined
      || sim.value?.sms_total === null
      || Number(sim.value?.sms_total) <= 0
    )
    if (missingSlowFields && sim.value?.iccid && autoDetailsIccid.value !== sim.value.iccid) {
      autoDetailsIccid.value = sim.value.iccid
      await refreshSimDetails(true)
    }
  } catch (loadError) {
    simError.value = errorMessage(loadError)
  } finally {
    simLoading.value = false
  }
}

async function refreshSimDetails(silent = false) {
  if (detailsRefreshing.value || !sim.value?.present) return
  detailsRefreshing.value = true
  try {
    await api.refreshSimDetails()
    if (!silent) message.success('SIM 详细信息刷新已开始')
    window.clearTimeout(detailsTimer)
    detailsTimer = window.setTimeout(() => loadSim(true), 2500)
  } catch (refreshError) {
    if (!silent) message.error(errorMessage(refreshError))
  } finally {
    detailsRefreshing.value = false
  }
}

async function saveCache() {
  const phone = cacheForm.phone_number.trim()
  const smsc = cacheForm.sms_center.trim()
  const phonePattern = /^\+?\d+$/
  if (phone && !phonePattern.test(phone)) {
    message.warning('本机号码只能包含数字和开头的 +')
    return
  }
  if (smsc && !phonePattern.test(smsc)) {
    message.warning('短信中心只能包含数字和开头的 +')
    return
  }
  const payload = {
    ...(phone ? { phone_number: phone } : {}),
    ...(smsc ? { sms_center: smsc } : {}),
  }
  if (!Object.keys(payload).length) {
    message.warning('请至少填写一项信息')
    return
  }
  cacheSaving.value = true
  try {
    await api.updateSimCache(payload)
    message.success('SIM 本地信息已保存')
    await loadSim(true)
  } catch (saveError) {
    message.error(errorMessage(saveError))
  } finally {
    cacheSaving.value = false
  }
}

async function loadEsim(forceLive = false) {
  esimLoading.value = true
  esimError.value = ''
  try {
    if (!forceLive && !profiles.value.length) {
      try {
        const cached = await api.getCachedEsimProfiles()
        profiles.value = cached.data?.profiles || []
      } catch {
        // Cached profiles are optional; live data remains authoritative.
      }
    }

    const statusResponse = await api.getEsimLpacStatus()
    lpac.value = statusResponse.data
    esimLoaded.value = true
    if (!lpac.value?.usable) {
      profiles.value = []
      euicc.value = null
      selectedProfileIccid.value = ''
      return
    }

    const [profilesResult, euiccResult] = await Promise.allSettled([
      forceLive || !profiles.value.length ? api.getEsimProfiles() : Promise.resolve(null),
      api.getEsimEuicc(forceLive),
    ])
    if (profilesResult.status === 'fulfilled' && profilesResult.value) {
      profiles.value = profilesResult.value.data?.profiles || []
    }
    if (euiccResult.status === 'fulfilled') euicc.value = euiccResult.value.data
    const failure = [profilesResult, euiccResult].find((result) => result.status === 'rejected')
    if (failure) esimError.value = errorMessage(failure.reason)
  } catch (loadError) {
    esimError.value = errorMessage(loadError)
    esimLoaded.value = true
  } finally {
    esimLoading.value = false
  }
}

async function refreshProfiles() {
  await loadEsim(true)
  if (!esimError.value) message.success('eSIM 信息已刷新')
}

async function repairLpac() {
  lpacRepairing.value = true
  try {
    const response = await api.repairEsimLpac({
      proxy_prefix: lpacProxyPrefix.value || undefined,
    })
    message.success(response.data?.message || 'LPAC 安装或修复完成')
    await loadEsim(true)
  } catch (repairError) {
    message.error(errorMessage(repairError))
  } finally {
    lpacRepairing.value = false
  }
}

function openMemoryConfig() {
  memoryInput.value = memoryTotal.value ? Math.round(memoryTotal.value) : null
  memoryOpen.value = true
}

async function saveMemoryConfig() {
  if (!Number.isInteger(memoryInput.value) || memoryInput.value <= 0) {
    message.warning('请输入有效的正整数容量')
    return
  }
  memorySaving.value = true
  try {
    const response = await api.getEsimConfig()
    await api.setEsimConfig({
      ...(response.data || {}),
      custom_memory_total_kb: memoryInput.value,
    })
    memoryOpen.value = false
    message.success('eUICC 总容量已更新')
    await loadEsim(true)
  } catch (saveError) {
    message.error(errorMessage(saveError))
  } finally {
    memorySaving.value = false
  }
}

function profileRowProps(row) {
  return {
    class: row.iccid === selectedProfile.value?.iccid ? 'profile-row--selected' : '',
    onClick: () => { selectedProfileIccid.value = row.iccid },
  }
}

function enableProfile(row) {
  if (profileActive(row)) return
  dialog.warning({
    title: '启用 eSIM Profile',
    content: `启用 ${row.name || row.iccid} 会切换 SIM 并恢复基带，蜂窝连接将短暂中断。`,
    positiveText: '确认启用',
    negativeText: '取消',
    async onPositiveClick() {
      actionId.value = `enable-${row.iccid}`
      try {
        const response = await api.enableEsimProfile(row.iccid)
        ensureCommandSucceeded(response.data, 'Profile 启用失败')
        profiles.value = profiles.value.map((profile) => ({
          ...profile,
          state: profile.iccid === row.iccid ? 'enabled' : profileActive(profile) ? 'disabled' : profile.state,
        }))
        selectedProfileIccid.value = row.iccid
        message.success('Profile 启用任务已开始')
        startRecoveryPolling()
      } catch (actionError) {
        message.error(translateEsimError(actionError))
        return false
      } finally {
        actionId.value = ''
      }
      return true
    },
  })
}

function renameProfile(row) {
  let name = row.name || ''
  dialog.info({
    title: '重命名 Profile',
    content: () => h(NInput, {
      value: name,
      placeholder: 'Profile 名称',
      onUpdateValue: (value) => { name = value },
    }),
    positiveText: '保存',
    negativeText: '取消',
    async onPositiveClick() {
      if (!name.trim()) return false
      try {
        const response = await api.renameEsimProfile(row.iccid, name.trim())
        ensureCommandSucceeded(response.data, 'Profile 重命名失败')
        profiles.value = profiles.value.map((profile) => (
          profile.iccid === row.iccid ? { ...profile, name: name.trim() } : profile
        ))
        message.success('Profile 名称已更新')
      } catch (renameError) {
        message.error(translateEsimError(renameError))
        return false
      }
      return true
    },
  })
}

function openDeleteProfile(row) {
  if (profileActive(row) || row.delete_allowed === false) return
  deleteTarget.value = row
  deleteConfirmation.value = ''
}

async function confirmDeleteProfile() {
  if (!deleteTarget.value || deleteConfirmation.value !== '确认删除') return
  deleteLoading.value = true
  try {
    const response = await api.deleteEsimProfile(deleteTarget.value.iccid)
    ensureCommandSucceeded(response.data, 'Profile 删除失败')
    profiles.value = profiles.value.filter((profile) => profile.iccid !== deleteTarget.value.iccid)
    deleteTarget.value = null
    deleteConfirmation.value = ''
    message.success('Profile 已删除')
  } catch (deleteError) {
    message.error(translateEsimError(deleteError))
  } finally {
    deleteLoading.value = false
  }
}

function openDownloadProfile() {
  downloadOpen.value = true
  downloadMode.value = 'code'
  activationCode.value = ''
  downloadStatus.value = 'idle'
  downloadProgress.value = 0
  downloadLogs.value = []
  Object.assign(downloadForm, { smdp: '', matching_id: '', confirmation_code: '', imei: '' })
}

function parseActivationCode(notify = true) {
  const match = activationCode.value.trim().match(/^LPA:1\$([^$]+)\$([^$]+)(?:\$([^$]+))?$/i)
  if (!match) {
    if (notify) message.warning('激活码格式无效')
    return false
  }
  Object.assign(downloadForm, {
    smdp: match[1],
    matching_id: match[2],
    confirmation_code: match[3] || '',
  })
  if (notify) message.success('激活码已解析')
  return true
}

function readImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('无法读取二维码图片'))
    reader.onload = () => {
      const image = new Image()
      image.onerror = () => reject(new Error('无法加载二维码图片'))
      image.onload = () => resolve(image)
      image.src = reader.result
    }
    reader.readAsDataURL(file)
  })
}

async function decodeQrImage(event) {
  const file = event.target.files?.[0]
  if (!file) return
  qrLoading.value = true
  try {
    const image = await readImage(file)
    const canvas = document.createElement('canvas')
    canvas.width = image.naturalWidth || image.width
    canvas.height = image.naturalHeight || image.height
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) throw new Error('浏览器无法解析图片')
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height)
    const result = jsQR(imageData.data, imageData.width, imageData.height)
    if (!result?.data) throw new Error('未在图片中检测到有效二维码')
    activationCode.value = result.data.trim()
    if (!parseActivationCode(false)) throw new Error('二维码不是有效的 eSIM LPA 激活码')
    message.success('二维码已识别并填充激活参数')
  } catch (qrError) {
    message.error(errorMessage(qrError))
  } finally {
    qrLoading.value = false
    event.target.value = ''
  }
}

function addDownloadLog(text, type = 'info') {
  const timestamp = new Date().toLocaleTimeString('zh-CN', { hour12: false })
  downloadLogs.value.push({ timestamp, text, type })
}

async function downloadProfile() {
  if (downloadMode.value === 'code' && (!downloadForm.smdp || !downloadForm.matching_id)) {
    if (!parseActivationCode(false)) {
      message.warning('请填写有效的 LPA 激活码')
      return
    }
  }
  if (!downloadForm.smdp.trim() || !downloadForm.matching_id.trim()) {
    message.warning('请填写 SM-DP+ 地址和 Matching ID')
    return
  }

  downloadStatus.value = 'writing'
  downloadProgress.value = 8
  downloadLogs.value = []
  addDownloadLog('正在连接 eUICC 与 SM-DP+ 服务')
  window.clearInterval(downloadTimer)
  downloadTimer = window.setInterval(() => {
    downloadProgress.value = Math.min(92, downloadProgress.value + 4)
  }, 700)

  try {
    const response = await api.downloadEsimProfile({
      smdp: downloadForm.smdp.trim(),
      matching_id: downloadForm.matching_id.trim(),
      confirmation_code: downloadForm.confirmation_code.trim() || undefined,
      imei: downloadForm.imei.trim() || undefined,
    })
    ensureCommandSucceeded(response.data, 'Profile 下载失败')
    window.clearInterval(downloadTimer)
    downloadProgress.value = 100
    downloadStatus.value = 'success'
    addDownloadLog('Profile 已写入 eUICC', 'success')
    message.success('Profile 下载完成')
    await loadEsim(true)
  } catch (downloadError) {
    window.clearInterval(downloadTimer)
    downloadStatus.value = 'error'
    addDownloadLog(translateEsimError(downloadError), 'error')
    message.error(translateEsimError(downloadError))
  }
}

async function pollRecoveryStatus() {
  try {
    const response = await api.getBasebandRestartStatus()
    const data = response.data || {}
    recoverySteps.value = data.steps || []
    recoveryRegistration.value = data.current_registration || ''
    if (!data.running) {
      recoveryRunning.value = false
      window.clearInterval(recoveryTimer)
      const failed = recoverySteps.value.some((step) => step.status === 'error')
      if (failed) message.error('基带恢复失败，请检查恢复步骤')
      else if (recoverySteps.value.length) message.success('基带和蜂窝网络已恢复')
      await loadEsim(true)
    }
  } catch {
    // Keep polling through transient recovery status failures.
  }
}

function startRecoveryPolling() {
  recoveryOpen.value = true
  recoveryRunning.value = true
  recoverySteps.value = []
  recoveryRegistration.value = ''
  window.clearInterval(recoveryTimer)
  pollRecoveryStatus()
  recoveryTimer = window.setInterval(pollRecoveryStatus, 1000)
}

function switchMode(mode) {
  if (mode === app.workMode) return
  dialog.warning({
    title: mode === 'esim' ? '切换到 eSIM 模式' : '切换到实体 SIM 模式',
    content: '切换工作模式会重启相关 Modem 服务，当前蜂窝连接将短暂中断。',
    positiveText: '确认切换',
    negativeText: '取消',
    async onPositiveClick() {
      try {
        await api.setWorkMode(mode)
        await app.refreshWorkMode()
        tab.value = mode === 'esim' ? 'esim' : 'physical'
        if (mode === 'esim') await loadEsim(true)
        message.success('工作模式已切换')
      } catch (switchError) {
        message.error(errorMessage(switchError))
        return false
      }
      return true
    },
  })
}

watch(tab, async (value) => {
  await router.replace({ query: value === 'esim' ? { tab: 'esim' } : {} })
  if (value === 'esim' && app.workMode === 'esim' && !esimLoaded.value) await loadEsim()
})

watch(profiles, (items) => {
  if (!items.some((profile) => profile.iccid === selectedProfileIccid.value)) {
    selectedProfileIccid.value = items.find(profileActive)?.iccid || items[0]?.iccid || ''
  }
})

onMounted(async () => {
  await Promise.allSettled([loadSim(), app.refreshWorkMode()])
  if (app.workMode !== 'esim' && tab.value === 'esim') tab.value = 'physical'
  if (app.workMode === 'esim' && tab.value === 'esim') await loadEsim()
})

onBeforeUnmount(() => {
  window.clearTimeout(detailsTimer)
  window.clearInterval(downloadTimer)
  window.clearInterval(recoveryTimer)
})
</script>

<template>
  <main class="page">
    <PageHeader title="SIM 卡" description="查看实体 SIM 信息，并管理 eUICC 与 eSIM Profiles" :loading="pageLoading" @refresh="tab === 'esim' ? refreshProfiles() : loadSim()">
      <template #actions>
        <NButton secondary :loading="app.workModeLoading" @click="switchMode(app.workMode === 'sim' ? 'esim' : 'sim')">
          <template #icon><Power :size="17" /></template>
          切换到 {{ app.workMode === 'sim' ? 'eSIM' : 'SIM' }}
        </NButton>
      </template>
    </PageHeader>

    <NAlert type="info" :show-icon="true" style="margin-bottom: 12px">
      当前工作模式：<strong>{{ app.workMode === 'esim' ? 'eSIM' : '实体 SIM' }}</strong>
      <span v-if="app.workerRunning">，后台切换任务正在执行</span>
    </NAlert>

    <NTabs v-model:value="tab" type="line" animated>
      <NTabPane name="physical" tab="实体 SIM">
        <NAlert v-if="simError" type="error" closable style="margin-bottom: 12px" @close="simError = ''">{{ simError }}</NAlert>
        <div v-if="simLoading && !sim"><NSkeleton text :repeat="10" /></div>
        <div v-else class="panel-grid">
          <NCard class="section-card" title="SIM 卡基本标识">
            <template #header-extra>
              <NSpace :size="4">
                <NTooltip>
                  <template #trigger>
                    <NButton quaternary circle size="small" aria-label="刷新 SIM 详细信息" :loading="detailsRefreshing" :disabled="!sim?.present" @click="refreshSimDetails(false)">
                      <template #icon><RefreshCw :size="16" /></template>
                    </NButton>
                  </template>
                  刷新 SIM 详细信息
                </NTooltip>
                <NTooltip>
                  <template #trigger>
                    <NButton quaternary circle size="small" :aria-label="showSensitive ? '隐藏敏感信息' : '显示完整信息'" @click="showSensitive = !showSensitive">
                      <template #icon><EyeOff v-if="showSensitive" :size="16" /><Eye v-else :size="16" /></template>
                    </NButton>
                  </template>
                  {{ showSensitive ? '隐藏敏感信息' : '显示完整信息' }}
                </NTooltip>
              </NSpace>
            </template>
            <div class="description-grid">
              <div class="description-item"><span>SIM 状态</span><strong><NTag size="small" :type="sim?.present ? 'success' : 'error'">{{ sim?.present ? '已插入' : '未插入' }}</NTag></strong></div>
              <div class="description-item"><span>SIM 卡类型</span><strong>{{ formatSimType(sim?.sim_type, sim?.esim_status) }}</strong></div>
              <div class="description-item"><span>手机号</span><strong class="sensitive-value" :class="{ 'sensitive-value--hidden': !showSensitive }">{{ sim?.phone_numbers?.join(' / ') || '--' }}</strong></div>
              <div class="description-item"><span>短信中心号码</span><strong class="sensitive-value" :class="{ 'sensitive-value--hidden': !showSensitive }">{{ display(sim?.sms_center) }}</strong></div>
              <div class="description-item"><span>ICCID</span><strong class="mono sensitive-value" :class="{ 'sensitive-value--hidden': !showSensitive }">{{ display(sim?.iccid) }}</strong></div>
              <div class="description-item"><span>IMSI</span><strong class="mono sensitive-value" :class="{ 'sensitive-value--hidden': !showSensitive }">{{ display(sim?.imsi) }}</strong></div>
            </div>
          </NCard>

          <NCard class="section-card" title="运营商与网络信息">
            <div class="description-grid">
              <div class="description-item"><span>SIM 归属运营商</span><strong>{{ formatOperator(sim?.operator_name, sim?.mcc ? `${sim.mcc}${sim.mnc}` : '') }}</strong></div>
              <div class="description-item"><span>当前注册网络</span><strong>{{ formatOperator(sim?.registered_operator_name, sim?.registered_operator_code) }}</strong></div>
              <div class="description-item"><span>运营商配置文件</span><strong>{{ sim?.carrier_config || 'Default' }}</strong></div>
              <div class="description-item"><span>配置文件版本</span><strong>{{ display(sim?.carrier_config_revision) }}</strong></div>
            </div>
          </NCard>

          <NCard class="section-card" title="安全与锁卡状态">
            <template #header-extra><NTag v-if="sim?.lock_status && !['none', 'unknown'].includes(sim.lock_status)" type="warning" size="small">有锁</NTag></template>
            <div class="description-grid">
              <div class="description-item"><span>锁卡状态</span><strong>{{ formatLockStatus(sim?.lock_status) }}</strong></div>
              <div class="description-item"><span>解锁剩余重试次数</span><strong>{{ formatRetries() }}</strong></div>
            </div>
          </NCard>

          <NCard class="section-card" title="短信存储与系统信息">
            <div class="sim-storage">
              <div class="status-line sim-storage__head">
                <NText>SIM 卡短信容量</NText>
                <NText depth="3">{{ smsUsageText }}</NText>
              </div>
              <NProgress v-if="smsUsagePercent !== null" type="line" :percentage="smsUsagePercent" :status="smsUsagePercent >= 100 ? 'error' : smsUsagePercent > 80 ? 'warning' : 'success'" :height="7" />
              <NProgress v-else type="line" :percentage="0" :show-indicator="false" :height="7" />
            </div>
            <div class="description-grid">
              <div class="description-item"><span>SIM 路径</span><strong class="mono">{{ display(sim?.sim_path) }}</strong></div>
              <div class="description-item"><span>Modem 路径</span><strong class="mono">{{ display(sim?.modem_path) }}</strong></div>
            </div>
          </NCard>

          <NCard class="section-card panel--full" title="本地信息修正">
            <NForm class="sim-cache-form" label-placement="top">
              <NFormItem label="本机号码"><NInput v-model:value="cacheForm.phone_number" placeholder="+86..." /></NFormItem>
              <NFormItem label="短信中心"><NInput v-model:value="cacheForm.sms_center" placeholder="+86..." /></NFormItem>
              <NButton type="primary" :loading="cacheSaving" @click="saveCache">保存</NButton>
            </NForm>
          </NCard>
        </div>
      </NTabPane>

      <NTabPane v-if="app.workMode === 'esim'" name="esim" tab="eSIM 管理">
        <NAlert v-if="esimError" type="error" closable style="margin-bottom: 12px" @close="esimError = ''">{{ esimError }}</NAlert>
        <div v-if="esimLoading && !esimLoaded"><NSkeleton text :repeat="10" /></div>
        <template v-else>
          <NAlert v-if="lpac && !lpac.usable" type="warning" style="margin-bottom: 12px">
            {{ lpac.message || '未检测到可用的 LPAC' }}
          </NAlert>

          <NCard v-if="lpac && !lpac.usable" class="section-card lpac-repair-card" title="LPAC 运行环境">
            <div class="description-grid" style="margin-bottom: 14px">
              <div class="description-item"><span>架构</span><strong>{{ display(lpac.arch) }}</strong></div>
              <div class="description-item"><span>glibc</span><strong>{{ display(lpac.glibc_version) }}</strong></div>
              <div class="description-item"><span>目标文件</span><strong class="mono">{{ display(lpac.asset_name) }}</strong></div>
              <div class="description-item"><span>安装路径</span><strong class="mono">{{ display(lpac.path) }}</strong></div>
            </div>
            <div class="lpac-repair-actions">
              <NSelect v-model:value="lpacProxyPrefix" :options="lpacProxyOptions" style="width: min(240px, 100%)" />
              <NButton type="primary" :loading="lpacRepairing" :disabled="!lpac.asset_name" @click="repairLpac">
                <template #icon><Wrench :size="16" /></template>
                安装或修复 LPAC
              </NButton>
            </div>
          </NCard>

          <div v-if="lpac?.usable" class="panel-grid">
            <NCard class="section-card panel--full" title="eUICC 芯片">
              <template #header-extra>
                <NSpace align="center">
                  <NTag :type="euicc?.status === 'ok' ? 'success' : 'default'">{{ euicc?.status || '未知状态' }}</NTag>
                  <NTooltip>
                    <template #trigger>
                      <NButton quaternary circle size="small" aria-label="刷新 eUICC" :loading="esimLoading" @click="refreshProfiles">
                        <template #icon><RefreshCw :size="16" /></template>
                      </NButton>
                    </template>
                    刷新 eUICC
                  </NTooltip>
                </NSpace>
              </template>
              <div class="description-grid">
                <div class="description-item"><span>EID</span><strong class="mono">{{ display(euicc?.eid) }}</strong></div>
                <div class="description-item"><span>制造商</span><strong>{{ display(euicc?.manufacturer) }}</strong></div>
                <div class="description-item"><span>LPAC 环境</span><strong>{{ display(lpac.arch) }} · glibc {{ display(lpac.glibc_version) }}</strong></div>
                <div class="description-item"><span>安装来源</span><strong>{{ display(lpac.source) }}</strong></div>
              </div>
              <div class="euicc-memory">
                <div class="euicc-memory__head">
                  <div><span>芯片存储</span><strong>{{ memoryUsedPercent === null ? '--' : `${memoryUsedPercent}%` }}</strong></div>
                  <div class="status-line">
                    <NText depth="3">可用 {{ formatCapacityKb(memoryAvailable) }} / 总计 {{ formatCapacityKb(memoryTotal) }}</NText>
                    <NTooltip v-if="euicc?.memory_total_customizable">
                      <template #trigger>
                        <NButton quaternary circle size="tiny" aria-label="自定义芯片总容量" @click="openMemoryConfig"><template #icon><Pencil :size="14" /></template></NButton>
                      </template>
                      自定义芯片总容量
                    </NTooltip>
                  </div>
                </div>
                <NProgress type="line" :percentage="memoryUsedPercent || 0" :show-indicator="false" :height="7" />
              </div>
            </NCard>

            <NCard class="section-card panel--full profile-card" title="eSIM Profiles">
              <template #header-extra>
                <NSpace>
                  <NButton secondary :loading="esimLoading" @click="refreshProfiles"><template #icon><RefreshCw :size="16" /></template>刷新</NButton>
                  <NButton type="primary" :disabled="!lpac?.usable" @click="openDownloadProfile"><template #icon><Plus :size="16" /></template>下载 Profile</NButton>
                </NSpace>
              </template>
              <NDataTable
                class="profile-table"
                :columns="profileColumns"
                :data="profiles"
                :loading="esimLoading"
                :scroll-x="720"
                :row-key="row => row.iccid"
                :row-props="profileRowProps"
              />
            </NCard>

            <NCard v-if="selectedProfile" class="section-card panel--full" title="Profile 详情">
              <template #header-extra><NTag :type="profileActive(selectedProfile) ? 'success' : 'default'">{{ profileStateLabel(selectedProfile.state) }}</NTag></template>
              <div class="description-grid profile-details">
                <div class="description-item"><span>名称</span><strong>{{ selectedProfile.name || '未命名 Profile' }}</strong></div>
                <div class="description-item"><span>运营商</span><strong>{{ display(selectedProfile.provider) }}</strong></div>
                <div class="description-item"><span>ICCID</span><strong class="mono">{{ display(selectedProfile.iccid) }}</strong></div>
                <div class="description-item"><span>IMSI</span><strong class="mono">{{ display(selectedProfile.imsi) }}</strong></div>
                <div class="description-item"><span>本机号码（MSISDN）</span><strong class="mono">{{ display(selectedProfile.msisdn) }}</strong></div>
                <div class="description-item"><span>短信中心（SMSC）</span><strong class="mono">{{ display(selectedProfile.smsc) }}</strong></div>
                <div class="description-item"><span>MCC / MNC</span><strong>{{ display(selectedProfile.mcc) }} / {{ display(selectedProfile.mnc) }}</strong></div>
                <div class="description-item"><span>Profile Class</span><strong>{{ display(selectedProfile.class) }}</strong></div>
                <div class="description-item"><span>SM-DP+ 服务器</span><strong class="mono">{{ display(selectedProfile.smdp) }}</strong></div>
                <div class="description-item"><span>Matching ID</span><strong class="mono">{{ display(selectedProfile.matching_id) }}</strong></div>
                <div class="description-item"><span>ISDP-AID</span><strong class="mono">{{ display(selectedProfile.isdp_aid) }}</strong></div>
                <div class="description-item"><span>策略权限</span><strong>删除：{{ profilePolicy(selectedProfile.delete_allowed) }} · 禁用：{{ profilePolicy(selectedProfile.disable_allowed) }}</strong></div>
              </div>
            </NCard>
          </div>
        </template>
      </NTabPane>
    </NTabs>

    <NModal v-model:show="memoryOpen" preset="card" title="自定义 eUICC 总容量" style="width: min(440px, calc(100vw - 24px))">
      <NForm label-placement="top">
        <NFormItem label="芯片总容量（KB）" required>
          <NInputNumber v-model:value="memoryInput" :min="1" :precision="0" style="width: 100%" />
        </NFormItem>
        <NSpace justify="end"><NButton @click="memoryOpen = false">取消</NButton><NButton type="primary" :loading="memorySaving" @click="saveMemoryConfig">保存</NButton></NSpace>
      </NForm>
    </NModal>

    <NModal
      v-model:show="downloadOpen"
      preset="card"
      title="下载 eSIM Profile"
      :closable="downloadStatus !== 'writing'"
      :mask-closable="downloadStatus !== 'writing'"
      style="width: min(620px, calc(100vw - 24px))"
    >
      <NTabs v-model:value="downloadMode" type="segment" size="small">
        <NTabPane name="code" tab="LPA 激活码">
          <input ref="qrInput" hidden type="file" accept="image/*" @change="decodeQrImage" />
          <NFormItem label="激活码">
            <NInput v-model:value="activationCode" type="textarea" :autosize="{ minRows: 2, maxRows: 4 }" placeholder="LPA:1$..." :disabled="downloadStatus === 'writing'" />
          </NFormItem>
          <NSpace>
            <NButton secondary :disabled="downloadStatus === 'writing'" @click="parseActivationCode(true)">解析激活码</NButton>
            <NButton secondary :loading="qrLoading" :disabled="downloadStatus === 'writing'" @click="qrInput.click()"><template #icon><QrCode :size="16" /></template>识别二维码图片</NButton>
          </NSpace>
          <div v-if="downloadForm.smdp && downloadForm.matching_id" class="activation-result">
            <div><span>SM-DP+</span><strong class="mono">{{ downloadForm.smdp }}</strong></div>
            <div><span>Matching ID</span><strong class="mono">{{ downloadForm.matching_id }}</strong></div>
          </div>
        </NTabPane>
        <NTabPane name="manual" tab="手动填写">
          <NForm label-placement="top">
            <NFormItem label="SM-DP+ 地址" required><NInput v-model:value="downloadForm.smdp" :disabled="downloadStatus === 'writing'" /></NFormItem>
            <NFormItem label="Matching ID" required><NInput v-model:value="downloadForm.matching_id" :disabled="downloadStatus === 'writing'" /></NFormItem>
            <NFormItem label="确认码"><NInput v-model:value="downloadForm.confirmation_code" type="password" show-password-on="click" :disabled="downloadStatus === 'writing'" /></NFormItem>
            <NFormItem label="绑定 IMEI"><NInput v-model:value="downloadForm.imei" :disabled="downloadStatus === 'writing'" /></NFormItem>
          </NForm>
        </NTabPane>
      </NTabs>

      <div v-if="downloadStatus !== 'idle'" class="download-progress">
        <NProgress type="line" :percentage="downloadProgress" :status="downloadStatus === 'error' ? 'error' : downloadStatus === 'success' ? 'success' : 'default'" />
        <div class="operation-log">
          <div v-for="(entry, index) in downloadLogs" :key="`${entry.timestamp}-${index}`" :class="`operation-log__line operation-log__line--${entry.type}`">
            <span>{{ entry.timestamp }}</span>{{ entry.text }}
          </div>
        </div>
      </div>

      <template #footer>
        <NSpace justify="end">
          <NButton :disabled="downloadStatus === 'writing'" @click="downloadOpen = false">关闭</NButton>
          <NButton type="primary" :loading="downloadStatus === 'writing'" :disabled="downloadStatus === 'success'" @click="downloadProfile">
            <template #icon><Download :size="16" /></template>
            下载并写入
          </NButton>
        </NSpace>
      </template>
    </NModal>

    <NModal :show="Boolean(deleteTarget)" preset="card" title="删除 eSIM Profile" style="width: min(480px, calc(100vw - 24px))" @update:show="!$event && (deleteTarget = null)">
      <NAlert type="error" style="margin-bottom: 14px">删除 {{ deleteTarget?.name || deleteTarget?.iccid }} 后无法恢复。</NAlert>
      <NFormItem label="输入“确认删除”继续">
        <NInput v-model:value="deleteConfirmation" :disabled="deleteLoading" />
      </NFormItem>
      <NSpace justify="end">
        <NButton :disabled="deleteLoading" @click="deleteTarget = null">取消</NButton>
        <NButton type="error" :loading="deleteLoading" :disabled="deleteConfirmation !== '确认删除'" @click="confirmDeleteProfile">
          <template #icon><Trash2 :size="16" /></template>
          确认删除
        </NButton>
      </NSpace>
    </NModal>

    <NModal v-model:show="recoveryOpen" preset="card" title="eSIM 切卡恢复" :mask-closable="!recoveryRunning" :closable="!recoveryRunning" style="width: min(520px, calc(100vw - 24px))">
      <NProgress type="line" :percentage="recoveryRunning ? 65 : 100" :status="recoverySteps.some(step => step.status === 'error') ? 'error' : recoveryRunning ? 'default' : 'success'" :show-indicator="false" />
      <strong class="recovery-message">{{ recoveryMessage }}</strong>
      <div class="recovery-steps">
        <div v-for="step in recoverySteps" :key="step.step" class="recovery-step">
          <Check v-if="step.status === 'ok'" :size="16" class="recovery-step__success" />
          <RefreshCw v-else-if="step.status === 'running'" :size="16" class="recovery-step__running" />
          <span v-else class="recovery-step__error">!</span>
          <div><strong>{{ step.step }}</strong><span v-if="step.detail">{{ step.detail }}</span></div>
        </div>
      </div>
      <NText v-if="recoveryRegistration" depth="3">当前注册状态：{{ recoveryRegistration }}</NText>
      <template #footer><NSpace justify="end"><NButton :disabled="recoveryRunning" @click="recoveryOpen = false">关闭</NButton></NSpace></template>
    </NModal>
  </main>
</template>
