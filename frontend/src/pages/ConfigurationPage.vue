<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  NAlert,
  NButton,
  NCard,
  NForm,
  NFormItem,
  NInput,
  NInputNumber,
  NSelect,
  NSpace,
  NSwitch,
  NTabPane,
  NTabs,
  NTag,
  useDialog,
  useMessage,
} from 'naive-ui'
import { KeyRound, Power, Radio, RefreshCw, Save } from '@lucide/vue'
import { api } from '@/api/index.js'
import PageHeader from '@/components/PageHeader.vue'
import MetricCard from '@/components/MetricCard.vue'
import { useAppStore } from '@/stores/app.js'
import { errorMessage } from '@/utils/format.js'

const route = useRoute()
const router = useRouter()
const app = useAppStore()
const message = useMessage()
const dialog = useDialog()
const loading = ref(true)
const actionLoading = ref('')
const tab = ref(route.meta.tab === 'security' ? 'security' : 'general')
const health = ref(null)
const dataActive = ref(false)
const airplane = ref(null)
const authConfigured = ref(false)
const security = reactive({
  password_protection_enabled: true, password_min_length: 8, password_require_letters: true,
  password_require_digits: true, password_require_symbols: false, session_ttl_seconds: 86400, idle_timeout_seconds: 1800,
})
const passwords = reactive({ value: '', confirm: '' })
const sessionOptions = [
  { label: '1 小时', value: 3600 }, { label: '8 小时', value: 28800 }, { label: '24 小时', value: 86400 }, { label: '7 天', value: 604800 },
]
const idleOptions = [
  { label: '不自动退出', value: 0 }, { label: '5 分钟', value: 300 }, { label: '15 分钟', value: 900 }, { label: '30 分钟', value: 1800 }, { label: '1 小时', value: 3600 },
]
const securityScore = computed(() => [security.password_require_letters, security.password_require_digits, security.password_require_symbols].filter(Boolean).length)

watch(tab, (value) => {
  const path = value === 'security' ? '/config/security' : '/config'
  if (route.path !== path) router.replace(path)
})

async function load() {
  loading.value = true
  const results = await Promise.allSettled([api.health(), api.getDataStatus(), api.getAirplaneMode(), api.getAuthSettings(), app.refreshWorkMode()])
  if (results[0].status === 'fulfilled') health.value = results[0].value
  if (results[1].status === 'fulfilled') dataActive.value = Boolean(results[1].value.data?.active)
  if (results[2].status === 'fulfilled') airplane.value = results[2].value.data
  if (results[3].status === 'fulfilled') {
    authConfigured.value = Boolean(results[3].value.data?.configured)
    if (results[3].value.data?.settings) Object.assign(security, results[3].value.data.settings)
  }
  const failure = results.find((result) => result.status === 'rejected')
  if (failure && !health.value) message.error(errorMessage(failure.reason))
  loading.value = false
}
async function action(name, operation, success, refresh = true) {
  actionLoading.value = name
  try { await operation(); message.success(success); if (refresh) await load() }
  catch (actionError) { message.error(errorMessage(actionError)) }
  finally { actionLoading.value = '' }
}
function setWorkMode(mode) {
  if (mode === app.workMode) return
  dialog.warning({ title: '切换 SIM 工作模式', content: '切换期间蜂窝连接会暂时中断。', positiveText: '切换', negativeText: '取消', onPositiveClick: () => action('mode', () => api.setWorkMode(mode), '工作模式已切换') })
}
function toggleData(value) { action('data', () => api.setDataStatus(value), '移动数据已更新') }
function toggleAirplane(value) { action('airplane', () => api.setAirplaneMode(value), '飞行模式已更新') }
function saveSecurity() {
  if (security.password_min_length < 4 || security.password_min_length > 64) { message.warning('密码最小长度应为 4 到 64'); return }
  action('security', () => api.setAuthSettings({ ...security }), '安全设置已保存')
}
async function updatePassword() {
  if (passwords.value.length < security.password_min_length) { message.warning(`密码至少需要 ${security.password_min_length} 个字符`); return }
  if (passwords.value !== passwords.confirm) { message.warning('两次输入的密码不一致'); return }
  await action('password', () => authConfigured.value ? api.changeAdminPassword(passwords.value) : api.setupAdminPassword(passwords.value), '管理员密码已更新')
  passwords.value = ''; passwords.confirm = ''
}
function confirmSystemAction(kind) {
  const definitions = {
    baseband: ['重启基带', '蜂窝连接将暂时中断。', () => api.restartBaseband()],
    service: ['重启后台服务', '当前页面可能在数秒内无法连接。', () => api.restartService()],
    reboot: ['重启设备', '所有服务和网络连接将中断。', () => api.rebootSystem(1)],
  }
  const [title, content, operation] = definitions[kind]
  dialog.warning({ title, content, positiveText: '确认执行', negativeText: '取消', onPositiveClick: () => action(kind, operation, `${title}命令已提交`, false) })
}

load()
</script>

<template>
  <main class="page page--narrow">
    <PageHeader title="系统配置" description="调整设备工作模式、数据连接、安全策略和维护操作" :loading="loading" @refresh="load" />
    <NTabs v-model:value="tab" type="line" animated>
      <NTabPane name="general" tab="基本配置">
        <div class="metric-grid">
          <MetricCard label="后台服务" :value="health?.status === 'ok' ? '正常' : '异常'" :detail="health?.version ? `版本 ${health.version}` : health?.message || '--'" :icon="RefreshCw" :tone="health?.status === 'ok' ? 'success' : 'danger'" />
          <MetricCard label="工作模式" :value="app.workMode === 'esim' ? 'eSIM' : '实体 SIM'" :detail="app.workerRunning ? '后台任务运行中' : '模式稳定'" :icon="Radio" />
          <MetricCard label="移动数据" :value="dataActive ? '已启用' : '已关闭'" detail="蜂窝数据连接" :icon="Radio" :tone="dataActive ? 'success' : 'warning'" />
          <MetricCard label="飞行模式" :value="airplane?.enabled ? '已开启' : '已关闭'" :detail="`射频 ${airplane?.online ? '在线' : '离线'}`" :icon="Power" :tone="airplane?.enabled ? 'warning' : 'success'" />
        </div>
        <div class="panel-grid">
          <NCard class="section-card panel--full" title="设备模式">
            <div class="action-list">
              <div class="action-row"><div class="action-row__copy"><strong>SIM 工作模式</strong><span>选择实体 SIM 或设备 eUICC</span></div><div class="action-row__control"><NSelect :value="app.workMode" :options="[{ label: '实体 SIM', value: 'sim' }, { label: 'eSIM', value: 'esim' }]" :loading="actionLoading === 'mode'" style="width: 130px" @update:value="setWorkMode" /></div></div>
              <div class="action-row"><div class="action-row__copy"><strong>移动数据</strong><span>允许设备建立蜂窝数据连接</span></div><div class="action-row__control"><NSwitch :value="dataActive" :loading="actionLoading === 'data'" @update:value="toggleData" /></div></div>
              <div class="action-row"><div class="action-row__copy"><strong>飞行模式</strong><span>关闭 Modem 射频与网络注册</span></div><div class="action-row__control"><NSwitch :value="airplane?.enabled" :loading="actionLoading === 'airplane'" @update:value="toggleAirplane" /></div></div>
            </div>
          </NCard>
          <NCard class="section-card panel--full" title="维护操作">
            <div class="action-list">
              <div class="action-row"><div class="action-row__copy"><strong>重启基带</strong><span>重新初始化 Modem 与蜂窝连接</span></div><NButton secondary :loading="actionLoading === 'baseband'" @click="confirmSystemAction('baseband')">执行</NButton></div>
              <div class="action-row"><div class="action-row__copy"><strong>重启后台服务</strong><span>重新启动 SimAdmin 服务进程</span></div><NButton secondary :loading="actionLoading === 'service'" @click="confirmSystemAction('service')">执行</NButton></div>
              <div class="action-row"><div class="action-row__copy"><strong>重启设备</strong><span>重新启动整个操作系统</span></div><NButton type="error" secondary :loading="actionLoading === 'reboot'" @click="confirmSystemAction('reboot')">重启</NButton></div>
            </div>
          </NCard>
        </div>
      </NTabPane>

      <NTabPane name="security" tab="安全性">
        <div class="panel-grid">
          <NCard class="section-card panel--full" title="登录保护">
            <template #header-extra><NTag :type="security.password_protection_enabled ? 'success' : 'warning'">{{ security.password_protection_enabled ? '已启用' : '已关闭' }}</NTag></template>
            <div class="action-list">
              <div class="action-row"><div class="action-row__copy"><strong>密码保护</strong><span>访问管理页面时验证管理员身份</span></div><NSwitch v-model:value="security.password_protection_enabled" /></div>
            </div>
            <NForm label-placement="top" style="margin-top: 16px">
              <div class="inline-form">
                <NFormItem label="密码最小长度"><NInputNumber v-model:value="security.password_min_length" :min="4" :max="64" style="width: 100%" /></NFormItem>
                <NFormItem label="会话有效期"><NSelect v-model:value="security.session_ttl_seconds" :options="sessionOptions" /></NFormItem>
                <NFormItem label="空闲超时"><NSelect v-model:value="security.idle_timeout_seconds" :options="idleOptions" /></NFormItem>
                <NFormItem label="密码复杂度"><NSpace><NSwitch v-model:value="security.password_require_letters" />字母 <NSwitch v-model:value="security.password_require_digits" />数字 <NSwitch v-model:value="security.password_require_symbols" />符号</NSpace></NFormItem>
              </div>
              <NSpace justify="end"><NButton type="primary" :loading="actionLoading === 'security'" @click="saveSecurity"><template #icon><Save :size="16" /></template>保存安全设置</NButton></NSpace>
            </NForm>
          </NCard>
          <NCard class="section-card panel--full" title="管理员密码">
            <NAlert type="info" style="margin-bottom: 14px">当前复杂度要求：至少 {{ security.password_min_length }} 个字符，启用 {{ securityScore }} 类字符检查。</NAlert>
            <NForm label-placement="top" class="inline-form">
              <NFormItem label="新密码"><NInput v-model:value="passwords.value" type="password" show-password-on="click" /></NFormItem>
              <NFormItem label="确认新密码"><NInput v-model:value="passwords.confirm" type="password" show-password-on="click" /></NFormItem>
            </NForm>
            <NSpace justify="end"><NButton type="primary" :loading="actionLoading === 'password'" @click="updatePassword"><template #icon><KeyRound :size="16" /></template>更新密码</NButton></NSpace>
          </NCard>
        </div>
      </NTabPane>
    </NTabs>
  </main>
</template>
