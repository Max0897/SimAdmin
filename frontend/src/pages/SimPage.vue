<script setup>
import { computed, h, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  NAlert,
  NButton,
  NCard,
  NDataTable,
  NForm,
  NFormItem,
  NInput,
  NModal,
  NSkeleton,
  NSpace,
  NTabPane,
  NTabs,
  NTag,
  useDialog,
  useMessage,
} from 'naive-ui'
import { Download, Pencil, Plus, Power, RefreshCw, Trash2 } from '@lucide/vue'
import { api } from '@/api/index.js'
import PageHeader from '@/components/PageHeader.vue'
import { useAppStore } from '@/stores/app.js'
import { display, errorMessage } from '@/utils/format.js'

const route = useRoute()
const router = useRouter()
const message = useMessage()
const dialog = useDialog()
const app = useAppStore()
const loading = ref(true)
const error = ref('')
const tab = ref(route.query.tab === 'esim' ? 'esim' : 'physical')
const sim = ref(null)
const euicc = ref(null)
const profiles = ref([])
const lpac = ref(null)
const saving = ref(false)
const actionId = ref('')
const cacheForm = reactive({ phone_number: '', sms_center: '' })
const downloadOpen = ref(false)
const downloadForm = reactive({ smdp: '', matching_id: '', confirmation_code: '', imei: '' })

watch(tab, (value) => router.replace({ query: value === 'esim' ? { tab: 'esim' } : {} }))

const profileColumns = computed(() => [
  {
    title: 'Profile', key: 'name', minWidth: 210,
    render: (row) => h('div', [
      h('div', { class: 'table-cell-main' }, row.name || row.provider || '未命名 Profile'),
      h('div', { class: 'table-cell-sub mono' }, row.iccid),
    ]),
  },
  { title: '运营商', key: 'provider', minWidth: 130, render: (row) => row.provider || '--' },
  { title: 'IMSI', key: 'imsi', minWidth: 150, render: (row) => row.imsi || '--' },
  {
    title: '状态', key: 'state', width: 100,
    render: (row) => h(NTag, { size: 'small', type: row.state === 'enabled' ? 'success' : 'default' }, { default: () => row.state || '--' }),
  },
  {
    title: '操作', key: 'actions', width: 190, fixed: 'right',
    render: (row) => h(NSpace, { size: 6 }, {
      default: () => [
        h(NButton, { size: 'small', type: row.state === 'enabled' ? 'default' : 'primary', disabled: row.state === 'enabled', loading: actionId.value === `enable-${row.iccid}`, onClick: () => enableProfile(row) }, { default: () => '启用' }),
        h(NButton, { size: 'small', quaternary: true, onClick: () => renameProfile(row) }, { icon: () => h(Pencil, { size: 15 }) }),
        h(NButton, { size: 'small', quaternary: true, type: 'error', disabled: row.delete_allowed === false, onClick: () => deleteProfile(row) }, { icon: () => h(Trash2, { size: 15 }) }),
      ],
    }),
  },
])

async function load() {
  loading.value = true
  error.value = ''
  const results = await Promise.allSettled([
    api.getSimInfo(),
    api.getCachedEsimProfiles(),
    api.getEsimEuicc(),
    api.getEsimLpacStatus(),
    app.refreshWorkMode(),
  ])
  if (results[0].status === 'fulfilled') {
    sim.value = results[0].value.data
    cacheForm.phone_number = sim.value?.phone_numbers?.[0] || ''
    cacheForm.sms_center = sim.value?.sms_center || ''
  }
  if (results[1].status === 'fulfilled') profiles.value = results[1].value.data?.profiles || []
  if (results[2].status === 'fulfilled') euicc.value = results[2].value.data
  if (results[3].status === 'fulfilled') lpac.value = results[3].value.data
  const firstFailure = results.find((result) => result.status === 'rejected')
  if (firstFailure && !sim.value) error.value = errorMessage(firstFailure.reason)
  loading.value = false
}

async function refreshProfiles() {
  loading.value = true
  try {
    const [profileResponse, euiccResponse] = await Promise.all([api.getEsimProfiles(), api.getEsimEuicc(true)])
    profiles.value = profileResponse.data?.profiles || []
    euicc.value = euiccResponse.data
  } catch (refreshError) {
    message.error(errorMessage(refreshError))
  } finally {
    loading.value = false
  }
}

async function saveCache() {
  saving.value = true
  try {
    await api.updateSimCache(cacheForm)
    message.success('SIM 信息已保存')
    await load()
  } catch (saveError) {
    message.error(errorMessage(saveError))
  } finally {
    saving.value = false
  }
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
        message.success('工作模式已切换')
        await load()
      } catch (switchError) {
        message.error(errorMessage(switchError))
      }
    },
  })
}

async function enableProfile(row) {
  actionId.value = `enable-${row.iccid}`
  try {
    await api.enableEsimProfile(row.iccid)
    message.success('Profile 已启用')
    await refreshProfiles()
  } catch (actionError) {
    message.error(errorMessage(actionError))
  } finally {
    actionId.value = ''
  }
}

function renameProfile(row) {
  let name = row.name || ''
  dialog.info({
    title: '重命名 Profile',
    content: () => h(NInput, { value: name, placeholder: 'Profile 名称', onUpdateValue: (value) => { name = value } }),
    positiveText: '保存', negativeText: '取消',
    async onPositiveClick() {
      if (!name.trim()) return false
      try {
        await api.renameEsimProfile(row.iccid, name.trim())
        await refreshProfiles()
        message.success('名称已更新')
      } catch (renameError) {
        message.error(errorMessage(renameError))
        return false
      }
      return true
    },
  })
}

function deleteProfile(row) {
  dialog.error({
    title: '删除 eSIM Profile',
    content: `确定永久删除 ${row.name || row.iccid}？此操作不可撤销。`,
    positiveText: '删除', negativeText: '取消',
    async onPositiveClick() {
      try {
        await api.deleteEsimProfile(row.iccid)
        message.success('Profile 已删除')
        await refreshProfiles()
      } catch (deleteError) {
        message.error(errorMessage(deleteError))
      }
    },
  })
}

async function downloadProfile() {
  if (!downloadForm.smdp || !downloadForm.matching_id) {
    message.warning('请填写 SM-DP+ 地址和 Matching ID')
    return
  }
  saving.value = true
  try {
    await api.downloadEsimProfile({ ...downloadForm })
    downloadOpen.value = false
    message.success('Profile 下载完成')
    await refreshProfiles()
  } catch (downloadError) {
    message.error(errorMessage(downloadError))
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>

<template>
  <main class="page">
    <PageHeader title="SIM 卡" description="查看实体 SIM 信息，并管理 eUICC 与 eSIM Profiles" :loading="loading" @refresh="load">
      <template #actions>
        <NButton secondary @click="switchMode(app.workMode === 'sim' ? 'esim' : 'sim')">
          <template #icon><Power :size="17" /></template>
          切换到 {{ app.workMode === 'sim' ? 'eSIM' : 'SIM' }}
        </NButton>
      </template>
    </PageHeader>
    <NAlert v-if="error" type="error" style="margin-bottom: 12px">{{ error }}</NAlert>
    <NAlert type="info" :show-icon="true" style="margin-bottom: 12px">
      当前工作模式：<strong>{{ app.workMode === 'esim' ? 'eSIM' : '实体 SIM' }}</strong>
      <span v-if="app.workerRunning">，后台切换任务正在执行</span>
    </NAlert>

    <NTabs v-model:value="tab" type="line" animated>
      <NTabPane name="physical" tab="实体 SIM">
        <div v-if="loading && !sim"><NSkeleton text :repeat="8" /></div>
        <div v-else class="panel-grid">
          <NCard class="section-card panel--wide" title="卡片信息">
            <template #header-extra><NTag :type="sim?.present ? 'success' : 'warning'">{{ sim?.present ? '已插入' : '未检测到' }}</NTag></template>
            <div class="description-grid">
              <div class="description-item"><span>运营商</span><strong>{{ display(sim?.operator_name || sim?.registered_operator_name) }}</strong></div>
              <div class="description-item"><span>号码</span><strong>{{ sim?.phone_numbers?.join(' / ') || '--' }}</strong></div>
              <div class="description-item"><span>ICCID</span><strong class="mono">{{ display(sim?.iccid) }}</strong></div>
              <div class="description-item"><span>IMSI</span><strong class="mono">{{ display(sim?.imsi) }}</strong></div>
              <div class="description-item"><span>MCC / MNC</span><strong>{{ display(sim?.mcc) }} / {{ display(sim?.mnc) }}</strong></div>
              <div class="description-item"><span>锁定状态</span><strong>{{ display(sim?.lock_status) }}</strong></div>
              <div class="description-item"><span>短信中心</span><strong>{{ display(sim?.sms_center) }}</strong></div>
              <div class="description-item"><span>短信存储</span><strong>{{ sim?.sms_used ?? '--' }} / {{ sim?.sms_total ?? '--' }}</strong></div>
            </div>
          </NCard>
          <NCard class="section-card panel--narrow" title="本地信息修正">
            <NForm label-placement="top">
              <NFormItem label="本机号码"><NInput v-model:value="cacheForm.phone_number" placeholder="电话号码" /></NFormItem>
              <NFormItem label="短信中心"><NInput v-model:value="cacheForm.sms_center" placeholder="SMSC 号码" /></NFormItem>
              <NButton type="primary" :loading="saving" block @click="saveCache">保存</NButton>
            </NForm>
          </NCard>
        </div>
      </NTabPane>

      <NTabPane name="esim" tab="eSIM Profiles">
        <div class="panel-grid">
          <NCard class="section-card panel--full" title="eUICC">
            <template #header-extra><NTag :type="euicc?.status === 'ok' ? 'success' : 'default'">{{ euicc?.status || '未知状态' }}</NTag></template>
            <div class="description-grid">
              <div class="description-item"><span>EID</span><strong class="mono">{{ display(euicc?.eid) }}</strong></div>
              <div class="description-item"><span>制造商</span><strong>{{ display(euicc?.manufacturer) }}</strong></div>
              <div class="description-item"><span>总容量</span><strong>{{ euicc?.memory_total_kb ? `${euicc.memory_total_kb} KB` : '--' }}</strong></div>
              <div class="description-item"><span>可用容量</span><strong>{{ euicc?.memory_available_kb ? `${euicc.memory_available_kb} KB` : '--' }}</strong></div>
              <div class="description-item"><span>LPAC</span><strong>{{ lpac?.usable ? '可用' : lpac?.message || '不可用' }}</strong></div>
              <div class="description-item"><span>架构</span><strong>{{ display(lpac?.arch) }}</strong></div>
            </div>
          </NCard>
          <NCard class="section-card panel--full" title="Profiles">
            <template #header-extra>
              <NSpace>
                <NButton secondary :loading="loading" @click="refreshProfiles"><template #icon><RefreshCw :size="16" /></template>刷新</NButton>
                <NButton type="primary" @click="downloadOpen = true"><template #icon><Plus :size="16" /></template>下载 Profile</NButton>
              </NSpace>
            </template>
            <NDataTable :columns="profileColumns" :data="profiles" :loading="loading" :scroll-x="820" :row-key="row => row.iccid" />
          </NCard>
        </div>
      </NTabPane>
    </NTabs>

    <NModal v-model:show="downloadOpen" preset="card" title="下载 eSIM Profile" style="width: min(520px, calc(100vw - 24px))">
      <NForm label-placement="top">
        <NFormItem label="SM-DP+ 地址" required><NInput v-model:value="downloadForm.smdp" placeholder="例如 rsp.example.com" /></NFormItem>
        <NFormItem label="Matching ID" required><NInput v-model:value="downloadForm.matching_id" /></NFormItem>
        <NFormItem label="确认码"><NInput v-model:value="downloadForm.confirmation_code" type="password" show-password-on="click" /></NFormItem>
        <NFormItem label="IMEI（可选）"><NInput v-model:value="downloadForm.imei" /></NFormItem>
        <NSpace justify="end"><NButton @click="downloadOpen = false">取消</NButton><NButton type="primary" :loading="saving" @click="downloadProfile"><template #icon><Download :size="16" /></template>下载</NButton></NSpace>
      </NForm>
    </NModal>
  </main>
</template>
