import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { api } from '@/api/index.js'

export const useAppStore = defineStore('app', () => {
  const themeMode = ref(localStorage.getItem('theme-mode') === 'dark' ? 'dark' : 'light')
  const refreshInterval = ref(Number(localStorage.getItem('refresh-interval')) || 3000)
  const refreshKey = ref(0)
  const workMode = ref('sim')
  const workerRunning = ref(false)
  const workModeLoading = ref(false)
  const dark = computed(() => themeMode.value === 'dark')

  function syncDocumentTheme() {
    document.documentElement.dataset.theme = themeMode.value
    document.documentElement.style.colorScheme = themeMode.value
    document.querySelector('meta[name="theme-color"]')?.setAttribute(
      'content',
      dark.value ? '#101418' : '#f4f7f9',
    )
  }

  function toggleTheme() {
    themeMode.value = dark.value ? 'light' : 'dark'
    localStorage.setItem('theme-mode', themeMode.value)
    syncDocumentTheme()
  }

  function setRefreshInterval(value) {
    refreshInterval.value = Number(value)
    localStorage.setItem('refresh-interval', String(value))
  }

  function requestRefresh() {
    refreshKey.value += 1
  }

  async function refreshWorkMode() {
    workModeLoading.value = true
    try {
      const response = await api.getWorkMode()
      workMode.value = response.data?.mode || 'sim'
      workerRunning.value = Boolean(response.data?.worker_running)
    } finally {
      workModeLoading.value = false
    }
  }

  return {
    themeMode,
    dark,
    refreshInterval,
    refreshKey,
    workMode,
    workerRunning,
    workModeLoading,
    syncDocumentTheme,
    toggleTheme,
    setRefreshInterval,
    requestRefresh,
    refreshWorkMode,
  }
})
