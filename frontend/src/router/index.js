import { createRouter, createWebHistory } from 'vue-router'
import { api } from '@/api/index.js'

const routes = [
  { path: '/login', name: 'login', component: () => import('@/pages/LoginPage.vue'), meta: { public: true } },
  {
    path: '/',
    component: () => import('@/components/AppLayout.vue'),
    children: [
      { path: '', name: 'dashboard', component: () => import('@/pages/DashboardPage.vue'), meta: { title: '仪表盘' } },
      { path: 'sim', name: 'sim', component: () => import('@/pages/SimPage.vue'), meta: { title: 'SIM 卡' } },
      { path: 'esim', redirect: '/sim?tab=esim' },
      { path: 'network', name: 'network', component: () => import('@/pages/NetworkPage.vue'), meta: { title: '蜂窝网络' } },
      { path: 'device-network', name: 'device-network', component: () => import('@/pages/DeviceNetworkPage.vue'), meta: { title: '设备网络' } },
      { path: 'leds', name: 'leds', component: () => import('@/pages/LedPage.vue'), meta: { title: 'LED 管理' } },
      { path: 'sms', name: 'sms', component: () => import('@/pages/SmsPage.vue'), meta: { title: '短信管理' } },
      { path: 'notifications', name: 'notifications', component: () => import('@/pages/NotificationsPage.vue'), meta: { title: '通知中心' } },
      { path: 'automation', name: 'automation', component: () => import('@/pages/AutomationPage.vue'), meta: { title: '自动化中心' } },
      { path: 'phone', name: 'phone', component: () => import('@/pages/PhonePage.vue'), meta: { title: '电话管理' } },
      { path: 'config', name: 'config', component: () => import('@/pages/ConfigurationPage.vue'), meta: { title: '基本配置' } },
      { path: 'config/security', name: 'security', component: () => import('@/pages/ConfigurationPage.vue'), meta: { title: '安全性', tab: 'security' } },
      { path: 'ota', name: 'ota', component: () => import('@/pages/OtaPage.vue'), meta: { title: 'OTA 更新' } },
      { path: 'network-interfaces', redirect: '/network' },
      { path: 'band-lock', redirect: '/network' },
    ],
  },
  { path: '/:pathMatch(.*)*', redirect: '/' },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 }),
})

let lastAuthCheck = 0
let authenticated = false

router.beforeEach(async (to) => {
  if (to.meta.public) return true
  const now = Date.now()
  if (now - lastAuthCheck > 10_000) {
    try {
      const response = await api.getAuthStatus()
      authenticated = response.data?.authenticated === true
    } catch {
      authenticated = false
    }
    lastAuthCheck = now
  }
  if (authenticated) return true
  return { name: 'login', query: to.fullPath === '/' ? {} : { next: to.fullPath } }
})

export function clearAuthCache() {
  authenticated = false
  lastAuthCheck = 0
}

export default router
