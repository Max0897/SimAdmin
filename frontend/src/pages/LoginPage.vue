<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  NButton,
  NForm,
  NFormItem,
  NInput,
  NPopover,
  NProgress,
  NText,
  useMessage,
} from 'naive-ui'
import { ArrowRight } from '@lucide/vue'
import { api } from '@/api/index.js'
import { clearAuthCache } from '@/router/index.js'

const route = useRoute()
const router = useRouter()
const message = useMessage()
const checking = ref(true)
const loading = ref(false)
const mode = ref('login')
const password = ref('')
const confirmPassword = ref('')
const settings = ref({ password_min_length: 8 })
const appVersion = __APP_VERSION__
const gitCommit = __GIT_COMMIT__

const nextPath = computed(() => {
  const next = typeof route.query.next === 'string' ? route.query.next : '/'
  return next.startsWith('/') && !next.startsWith('/login') ? next : '/'
})
const score = computed(() => {
  let value = Math.min(password.value.length * 6, 48)
  if (/[a-z]/i.test(password.value)) value += 15
  if (/\d/.test(password.value)) value += 15
  if (/[^a-z\d]/i.test(password.value)) value += 22
  return Math.min(value, 100)
})
const scoreStatus = computed(() => (score.value >= 75 ? 'success' : score.value >= 45 ? 'warning' : 'error'))

async function loadStatus() {
  checking.value = true
  try {
    const response = await api.getAuthStatus()
    if (response.data?.authenticated) {
      await router.replace(nextPath.value)
      return
    }
    mode.value = response.data?.configured === false ? 'setup' : 'login'
    if (response.data?.settings) settings.value = response.data.settings
  } catch {
    mode.value = 'login'
  } finally {
    checking.value = false
  }
}

async function submit() {
  if (!password.value) {
    message.error('请输入管理员密码')
    return
  }
  if (mode.value === 'setup') {
    if (password.value.length < (settings.value.password_min_length || 8)) {
      message.error(`密码至少需要 ${settings.value.password_min_length || 8} 个字符`)
      return
    }
    if (password.value !== confirmPassword.value) {
      message.error('两次输入的密码不一致')
      return
    }
  }

  loading.value = true
  try {
    if (mode.value === 'setup') await api.setupAdminPassword(password.value)
    else await api.login(password.value)
    clearAuthCache()
    message.success(mode.value === 'setup' ? '管理员密码已创建' : '登录成功')
    await router.replace(nextPath.value)
  } catch (submitError) {
    message.error(submitError.message || '登录失败')
  } finally {
    loading.value = false
  }
}

onMounted(loadStatus)
</script>

<template>
  <main class="login-page">
    <section class="login-panel">
      <header class="login-brand">
        <img src="/simadmin-logo.svg" alt="SimAdmin" />
        <strong>SimAdmin</strong>
      </header>

      <div class="login-form">
        <h1>{{ mode === 'setup' ? '初始化管理员' : '登录' }}</h1>
        <p class="login-form__intro">{{ mode === 'setup' ? '首次使用，请创建管理密码' : '使用管理员密码继续' }}</p>
        <NForm :show-label="true" @submit.prevent="submit">
          <NFormItem label="管理员密码">
            <NInput
              v-model:value="password"
              type="password"
              size="large"
              show-password-on="click"
              :disabled="checking || loading"
              placeholder="请输入密码"
              autofocus
              @keyup.enter="submit"
            />
          </NFormItem>
          <template v-if="mode === 'setup'">
            <NProgress :percentage="score" :status="scoreStatus" :show-indicator="false" :height="5" style="margin: -8px 0 14px" />
            <NFormItem label="确认密码">
              <NInput
                v-model:value="confirmPassword"
                type="password"
                size="large"
                show-password-on="click"
                :disabled="loading"
                placeholder="再次输入密码"
                @keyup.enter="submit"
              />
            </NFormItem>
          </template>
          <NButton type="primary" size="large" block :loading="checking || loading" @click="submit">
            {{ mode === 'setup' ? '创建并进入' : '登录' }}
            <template #icon><ArrowRight :size="18" /></template>
          </NButton>
        </NForm>

        <div class="login-help">
          <NPopover trigger="click" placement="bottom">
            <template #trigger><NButton text size="small">无法登录？</NButton></template>
            <div class="login-help__popover">
              <NText depth="2">通过设备终端重置管理员密码</NText>
              <code class="login-help__command">simadmin auth reset-password</code>
            </div>
          </NPopover>
          <NText depth="3">v{{ appVersion }} · {{ gitCommit }}</NText>
        </div>
      </div>
    </section>
  </main>
</template>
