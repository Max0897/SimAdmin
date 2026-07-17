import { onBeforeUnmount, onMounted, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app.js'

export function usePolling(load) {
  const app = useAppStore()
  const { refreshInterval, refreshKey } = storeToRefs(app)
  let timer

  function resetTimer() {
    if (timer) window.clearInterval(timer)
    if (refreshInterval.value > 0) timer = window.setInterval(() => load(true), refreshInterval.value)
  }

  watch(refreshInterval, resetTimer)
  watch(refreshKey, () => load(false))
  onMounted(() => {
    load(false)
    resetTimer()
  })
  onBeforeUnmount(() => {
    if (timer) window.clearInterval(timer)
  })
}
