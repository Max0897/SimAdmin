<script setup>
import { computed, ref } from 'vue'
import {
  NAlert,
  NButton,
  NCard,
  NProgress,
  NSpace,
  NTag,
  useDialog,
  useMessage,
} from 'naive-ui'
import { CheckCircle2, DownloadCloud, FileArchive, RefreshCw, Upload, XCircle } from '@lucide/vue'
import { api } from '@/api/index.js'
import PageHeader from '@/components/PageHeader.vue'
import MetricCard from '@/components/MetricCard.vue'
import { errorMessage, formatBytes } from '@/utils/format.js'

const message = useMessage()
const dialog = useDialog()
const fileInput = ref(null)
const loading = ref(true)
const actionLoading = ref('')
const status = ref(null)
const latest = ref(null)
const prepared = ref(null)
const selectedFile = ref(null)
const proxyPrefix = ref('')
const uploadProgress = ref(0)
const appVersion = __APP_VERSION__
const gitCommit = __GIT_COMMIT__
const releaseAsset = computed(() => latest.value?.assets?.find((asset) => asset.name.endsWith('.tar.gz') || asset.name.endsWith('.zip')) || latest.value?.assets?.[0])

async function load() {
  loading.value = true
  try {
    const response = await api.getOtaStatus()
    status.value = response.data
  } catch (loadError) { message.error(errorMessage(loadError)) }
  finally { loading.value = false }
}
async function getLatest() {
  actionLoading.value = 'latest'
  try {
    const response = await api.getLatestOtaRelease({ proxy_prefix: proxyPrefix.value || undefined })
    latest.value = response.data
    message.success('已获取最新版本')
  } catch (latestError) { message.error(errorMessage(latestError)) }
  finally { actionLoading.value = '' }
}
function selectFile(event) {
  selectedFile.value = event.target.files?.[0] || null
}
async function uploadFile() {
  if (!selectedFile.value) return
  actionLoading.value = 'upload'
  uploadProgress.value = 30
  try {
    const response = await api.uploadOta(selectedFile.value)
    uploadProgress.value = 100
    prepared.value = response.data
    message.success('OTA 包已上传并完成校验')
    await load()
  } catch (uploadError) {
    uploadProgress.value = 0
    message.error(errorMessage(uploadError))
  } finally { actionLoading.value = '' }
}
async function prepareOnline() {
  actionLoading.value = 'prepare'
  uploadProgress.value = 25
  try {
    const response = await api.prepareOnlineOta({ proxy_prefix: proxyPrefix.value || undefined })
    prepared.value = response.data
    uploadProgress.value = 100
    message.success('在线更新包已准备完成')
    await load()
  } catch (prepareError) {
    uploadProgress.value = 0
    message.error(errorMessage(prepareError))
  } finally { actionLoading.value = '' }
}
function applyUpdate(restartNow) {
  dialog.warning({
    title: '应用 OTA 更新',
    content: restartNow ? '更新完成后设备将立即重启。' : '更新将写入设备，服务会暂时不可用。',
    positiveText: restartNow ? '更新并重启' : '应用更新', negativeText: '取消',
    async onPositiveClick() {
      actionLoading.value = 'apply'
      try { await api.applyOta(restartNow); message.success('OTA 更新已开始') }
      catch (applyError) { message.error(errorMessage(applyError)) }
      finally { actionLoading.value = '' }
    },
  })
}
async function cancelUpdate() {
  actionLoading.value = 'cancel'
  try { await api.cancelOta(); prepared.value = null; selectedFile.value = null; uploadProgress.value = 0; await load(); message.success('待更新包已清除') }
  catch (cancelError) { message.error(errorMessage(cancelError)) }
  finally { actionLoading.value = '' }
}

load()
</script>

<template>
  <main class="page page--narrow">
    <PageHeader title="OTA 更新" description="检查在线版本或上传离线更新包，并在校验通过后应用到设备" :loading="loading" @refresh="load" />
    <div class="metric-grid">
      <MetricCard label="当前版本" :value="status?.current_version || appVersion" :detail="status?.current_commit || gitCommit" :icon="RefreshCw" />
      <MetricCard label="待更新包" :value="status?.pending_update ? '已准备' : '无'" :detail="status?.pending_meta?.version || '设备处于当前版本'" :icon="FileArchive" :tone="status?.pending_update ? 'warning' : 'success'" />
      <MetricCard label="最新版本" :value="latest?.tag_name || '未检查'" :detail="latest?.published_at || '检查在线发布'" :icon="DownloadCloud" />
      <MetricCard label="校验状态" :value="prepared?.validation?.valid ? '通过' : (prepared ? '未通过' : '--')" :detail="prepared?.meta?.arch || status?.pending_meta?.arch || '目标架构'" :icon="prepared?.validation?.valid ? CheckCircle2 : XCircle" :tone="prepared?.validation?.valid ? 'success' : prepared ? 'danger' : 'primary'" />
    </div>

    <div class="panel-grid">
      <NCard class="section-card panel--full" title="在线更新">
        <div class="toolbar">
          <div>
            <strong>{{ latest?.name || latest?.tag_name || 'GitHub Release' }}</strong>
            <div class="table-cell-sub">{{ releaseAsset ? `${releaseAsset.name} · ${formatBytes(releaseAsset.size)}` : '尚未检查在线版本' }}</div>
          </div>
          <NSpace><NButton secondary :loading="actionLoading === 'latest'" @click="getLatest"><template #icon><RefreshCw :size="16" /></template>检查更新</NButton><NButton type="primary" :disabled="!latest" :loading="actionLoading === 'prepare'" @click="prepareOnline"><template #icon><DownloadCloud :size="16" /></template>下载并校验</NButton></NSpace>
        </div>
      </NCard>

      <NCard class="section-card panel--full" title="离线更新包">
        <input ref="fileInput" hidden type="file" accept=".zip,.gz,.tgz,application/octet-stream" @change="selectFile" />
        <div class="toolbar">
          <div><strong>{{ selectedFile?.name || '未选择文件' }}</strong><div class="table-cell-sub">{{ selectedFile ? formatBytes(selectedFile.size) : '选择 SimAdmin OTA 包' }}</div></div>
          <NSpace><NButton secondary @click="fileInput.click()"><template #icon><FileArchive :size="16" /></template>选择文件</NButton><NButton type="primary" :disabled="!selectedFile" :loading="actionLoading === 'upload'" @click="uploadFile"><template #icon><Upload :size="16" /></template>上传并校验</NButton></NSpace>
        </div>
        <NProgress v-if="uploadProgress" :percentage="uploadProgress" :status="uploadProgress === 100 ? 'success' : 'default'" :height="7" />
      </NCard>

      <NCard v-if="prepared || status?.pending_update" class="section-card panel--full" title="更新校验">
        <template #header-extra><NTag :type="(prepared?.validation?.valid ?? true) ? 'success' : 'error'">{{ (prepared?.validation?.valid ?? true) ? '可以应用' : '校验失败' }}</NTag></template>
        <NAlert v-if="prepared?.validation && !prepared.validation.valid" type="error" style="margin-bottom: 14px">{{ prepared.validation.error || '更新包与当前设备不兼容' }}</NAlert>
        <div class="description-grid">
          <div class="description-item"><span>版本</span><strong>{{ prepared?.meta?.version || status?.pending_meta?.version || '--' }}</strong></div>
          <div class="description-item"><span>Commit</span><strong class="mono">{{ prepared?.meta?.commit || status?.pending_meta?.commit || '--' }}</strong></div>
          <div class="description-item"><span>架构</span><strong>{{ prepared?.meta?.arch || status?.pending_meta?.arch || '--' }}</strong></div>
          <div class="description-item"><span>构建时间</span><strong>{{ prepared?.meta?.build_time || status?.pending_meta?.build_time || '--' }}</strong></div>
        </div>
        <NSpace justify="end" style="margin-top: 16px"><NButton type="error" secondary :loading="actionLoading === 'cancel'" @click="cancelUpdate">清除更新包</NButton><NButton secondary :loading="actionLoading === 'apply'" @click="applyUpdate(false)">应用更新</NButton><NButton type="primary" :loading="actionLoading === 'apply'" @click="applyUpdate(true)">更新并重启</NButton></NSpace>
      </NCard>
    </div>
  </main>
</template>
