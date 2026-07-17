<script setup>
import { computed, h, onBeforeUnmount, onMounted, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import {
  NAvatar,
  NButton,
  NDivider,
  NDrawer,
  NDrawerContent,
  NDropdown,
  NIcon,
  NLayout,
  NLayoutContent,
  NLayoutHeader,
  NLayoutSider,
  NMenu,
  NSelect,
  NTag,
  NTooltip,
  useDialog,
  useMessage,
} from 'naive-ui'
import {
  Bell,
  Bot,
  ChevronLeft,
  CreditCard,
  Gauge,
  LogOut,
  Menu,
  MessageSquareText,
  Moon,
  Network,
  PhoneCall,
  RefreshCw,
  Router,
  Settings,
  ShieldCheck,
  Signal,
  Sun,
  UploadCloud,
  UserRound,
} from '@lucide/vue'
import { api } from '@/api/index.js'
import { clearAuthCache } from '@/router/index.js'
import { useAppStore } from '@/stores/app.js'

const route = useRoute()
const router = useRouter()
const message = useMessage()
const dialog = useDialog()
const app = useAppStore()
const appVersion = __APP_VERSION__
const gitBranch = __GIT_BRANCH__
const gitCommit = __GIT_COMMIT__
const collapsed = ref(localStorage.getItem('sidebar-collapsed') === 'true')
const mobileOpen = ref(false)
const compact = ref(window.innerWidth < 760)
let idleTimer

const icon = (component) => () => h(NIcon, null, { default: () => h(component) })
const link = (label, path) => () => h(RouterLink, { to: path }, { default: () => label })

const menuOptions = [
  { label: link('仪表盘', '/'), key: '/', icon: icon(Gauge) },
  { label: link('SIM 卡', '/sim'), key: '/sim', icon: icon(CreditCard) },
  { label: link('短信管理', '/sms'), key: '/sms', icon: icon(MessageSquareText) },
  {
    label: '网络', key: 'network-group', icon: icon(Network),
    children: [
      { label: link('蜂窝网络', '/network'), key: '/network', icon: icon(Signal) },
      { label: link('设备网络', '/device-network'), key: '/device-network', icon: icon(Router) },
    ],
  },
  {
    label: '自动化与通知', key: 'automation-group', icon: icon(Bot),
    children: [
      { label: link('自动化中心', '/automation'), key: '/automation', icon: icon(Bot) },
      { label: link('通知中心', '/notifications'), key: '/notifications', icon: icon(Bell) },
      { label: link('电话管理', '/phone'), key: '/phone', icon: icon(PhoneCall) },
    ],
  },
  {
    label: '系统', key: 'system-group', icon: icon(Settings),
    children: [
      { label: link('基本配置', '/config'), key: '/config', icon: icon(Settings) },
      { label: link('安全性', '/config/security'), key: '/config/security', icon: icon(ShieldCheck) },
      { label: link('OTA 更新', '/ota'), key: '/ota', icon: icon(UploadCloud) },
    ],
  },
]

const activeKey = computed(() => {
  if (route.path === '/config/security') return route.path
  return route.path || '/'
})
const pageTitle = computed(() => route.meta.title || 'SimAdmin')
const refreshOptions = [
  { label: '关闭轮询', value: 0 },
  { label: '每 3 秒', value: 3000 },
  { label: '每 5 秒', value: 5000 },
  { label: '每 10 秒', value: 10_000 },
  { label: '每 30 秒', value: 30_000 },
]
const accountOptions = [
  { label: '退出登录', key: 'logout', icon: icon(LogOut) },
]

function toggleSidebar() {
  if (compact.value) mobileOpen.value = !mobileOpen.value
  else {
    collapsed.value = !collapsed.value
    localStorage.setItem('sidebar-collapsed', String(collapsed.value))
  }
}

function handleResize() {
  compact.value = window.innerWidth < 760
  if (!compact.value) mobileOpen.value = false
}

async function logout() {
  try {
    await api.logout()
  } finally {
    clearAuthCache()
    await router.replace('/login')
  }
}

function handleAccount(key) {
  if (key !== 'logout') return
  dialog.warning({
    title: '退出登录',
    content: '确定要结束当前管理会话吗？',
    positiveText: '退出',
    negativeText: '取消',
    onPositiveClick: logout,
  })
}

function resetIdleTimer(seconds) {
  if (idleTimer) window.clearTimeout(idleTimer)
  if (seconds > 0) idleTimer = window.setTimeout(logout, seconds * 1000)
}

async function initializeSession() {
  try {
    const [status] = await Promise.all([api.getAuthStatus(), app.refreshWorkMode()])
    const seconds = status.data?.settings?.password_protection_enabled
      ? status.data?.settings?.idle_timeout_seconds || 0
      : 0
    if (seconds > 0) {
      const reset = () => resetIdleTimer(seconds)
      ;['pointerdown', 'keydown', 'scroll', 'touchstart'].forEach((event) => window.addEventListener(event, reset, { passive: true }))
      resetIdleTimer(seconds)
    }
  } catch (error) {
    message.error(error.message)
  }
}

onMounted(() => {
  window.addEventListener('resize', handleResize)
  initializeSession()
})
onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
  if (idleTimer) window.clearTimeout(idleTimer)
})
</script>

<template>
  <NLayout class="app-shell" has-sider>
    <NLayoutSider
      v-if="!compact"
      bordered
      collapse-mode="width"
      :collapsed-width="64"
      :width="224"
      :collapsed="collapsed"
      :native-scrollbar="false"
      class="app-sider"
    >
      <div class="brand" :class="{ 'brand--compact': collapsed }">
        <img src="/simadmin-logo.svg" alt="SimAdmin" />
        <div v-if="!collapsed" class="brand__copy">
          <strong>SimAdmin</strong>
          <span>设备管理平台</span>
        </div>
      </div>
      <NMenu
        :value="activeKey"
        :options="menuOptions"
        :collapsed="collapsed"
        :collapsed-width="64"
        :collapsed-icon-size="20"
      />
      <div class="sider-footer" :class="{ 'sider-footer--compact': collapsed }">
        <NTag size="small" :bordered="false">v{{ appVersion }}</NTag>
        <span v-if="!collapsed">{{ gitBranch }} · {{ gitCommit }}</span>
      </div>
    </NLayoutSider>

    <NDrawer v-model:show="mobileOpen" placement="left" :width="268">
      <NDrawerContent body-content-style="padding: 0" closable>
        <div class="brand">
          <img src="/simadmin-logo.svg" alt="SimAdmin" />
          <div class="brand__copy"><strong>SimAdmin</strong><span>设备管理平台</span></div>
        </div>
        <NMenu :value="activeKey" :options="menuOptions" @update:value="mobileOpen = false" />
      </NDrawerContent>
    </NDrawer>

    <NLayout>
      <NLayoutHeader bordered class="topbar">
        <div class="topbar__start">
          <NTooltip trigger="hover">
            <template #trigger>
              <NButton quaternary circle :aria-label="compact ? '打开导航' : '收起导航'" @click="toggleSidebar">
                <template #icon><Menu v-if="compact" :size="20" /><ChevronLeft v-else :size="20" :class="{ rotated: collapsed }" /></template>
              </NButton>
            </template>
            {{ compact ? '打开导航' : (collapsed ? '展开导航' : '收起导航') }}
          </NTooltip>
          <NDivider vertical />
          <strong class="topbar__title">{{ pageTitle }}</strong>
        </div>

        <div class="topbar__actions">
          <NTag v-if="!compact" size="small" :type="app.workMode === 'esim' ? 'info' : 'success'" :bordered="false">
            {{ app.workMode === 'esim' ? 'eSIM 模式' : 'SIM 模式' }}
          </NTag>
          <NSelect
            v-if="!compact"
            size="small"
            :value="app.refreshInterval"
            :options="refreshOptions"
            style="width: 112px"
            @update:value="app.setRefreshInterval"
          />
          <NTooltip trigger="hover">
            <template #trigger>
              <NButton quaternary circle aria-label="立即刷新" @click="app.requestRefresh">
                <template #icon><RefreshCw :size="18" /></template>
              </NButton>
            </template>
            立即刷新
          </NTooltip>
          <NTooltip trigger="hover">
            <template #trigger>
              <NButton quaternary circle aria-label="切换主题" @click="app.toggleTheme">
                <template #icon><Sun v-if="app.dark" :size="18" /><Moon v-else :size="18" /></template>
              </NButton>
            </template>
            切换主题
          </NTooltip>
          <NDropdown :options="accountOptions" trigger="click" @select="handleAccount">
            <NButton quaternary circle aria-label="账户菜单"><NAvatar round :size="30"><UserRound :size="17" /></NAvatar></NButton>
          </NDropdown>
        </div>
      </NLayoutHeader>

      <NLayoutContent class="app-content" :native-scrollbar="false">
        <RouterView />
      </NLayoutContent>
    </NLayout>
  </NLayout>
</template>
