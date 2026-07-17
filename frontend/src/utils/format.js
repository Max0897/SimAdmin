export function formatBytes(value, digits = 1) {
  const bytes = Number(value)
  if (!Number.isFinite(bytes) || bytes < 0) return '--'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let amount = bytes
  let index = 0
  while (amount >= 1024 && index < units.length - 1) {
    amount /= 1024
    index += 1
  }
  return `${amount.toFixed(index === 0 ? 0 : digits)} ${units[index]}`
}

export function formatRate(bytesPerSecond) {
  const value = Number(bytesPerSecond)
  if (!Number.isFinite(value)) return '--'
  return `${formatBytes(value)}/s`
}

export function formatDuration(seconds) {
  const total = Number(seconds)
  if (!Number.isFinite(total)) return '--'
  const days = Math.floor(total / 86400)
  const hours = Math.floor((total % 86400) / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  return [days ? `${days} 天` : '', hours ? `${hours} 小时` : '', `${minutes} 分钟`].filter(Boolean).join(' ')
}

export function display(value, fallback = '--') {
  return value === undefined || value === null || value === '' ? fallback : String(value)
}

export function errorMessage(error) {
  return error instanceof Error ? error.message : String(error)
}
