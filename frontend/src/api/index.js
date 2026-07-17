const API_BASE = '/api'

function redirectToLogin() {
  if (window.location.pathname === '/login') return
  const current = `${window.location.pathname}${window.location.search}`
  window.location.assign(current === '/' ? '/login' : `/login?next=${encodeURIComponent(current)}`)
}

function statusMessage(status) {
  const messages = {
    400: '请求参数有误',
    401: '请先登录',
    403: '没有权限执行此操作',
    404: '请求的接口不存在',
    408: '请求超时',
    413: '上传内容过大',
  }
  if (messages[status]) return messages[status]
  return status >= 500 ? '服务器处理失败' : `请求失败，状态码 ${status}`
}

async function request(path, options = {}) {
  const { timeoutMs, skipAuthRedirect, returnText, ...fetchOptions } = options
  const controller = timeoutMs ? new AbortController() : null
  const timer = controller ? window.setTimeout(() => controller.abort(), timeoutMs) : null
  let response
  try {
    response = await fetch(`${API_BASE}${path}`, {
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', ...fetchOptions.headers },
      ...fetchOptions,
      signal: controller?.signal || fetchOptions.signal,
    })
  } catch (error) {
    if (controller?.signal.aborted) throw new Error(`请求超时（${Math.round(timeoutMs / 1000)} 秒）`)
    throw error
  } finally {
    if (timer) window.clearTimeout(timer)
  }

  if (!response.ok) {
    if (response.status === 401 && !skipAuthRedirect) redirectToLogin()
    let message
    try {
      message = (await response.json())?.message
    } catch {
      // Use the HTTP status message when the response has no JSON body.
    }
    throw new Error(message || statusMessage(response.status))
  }
  if (returnText) return response.text()
  if (response.status === 204) return null
  const result = await response.json()
  if (result?.status === 'error') throw new Error(result.message || '请求失败')
  return result
}

const json = (method, body, options = {}) => ({
  method,
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  ...options,
})

const queryPath = (path, params = {}) => {
  const search = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value))
  })
  return search.size ? `${path}?${search}` : path
}

export const api = {
  getAuthStatus: () => request('/auth/status', { skipAuthRedirect: true, timeoutMs: 5000 }),
  setupAdminPassword: (password) => request('/auth/setup', json('POST', { password }, { skipAuthRedirect: true })),
  login: (password) => request('/auth/login', json('POST', { password }, { skipAuthRedirect: true })),
  changeAdminPassword: (newPassword) => request('/auth/password', json('POST', { new_password: newPassword })),
  getAuthSettings: () => request('/auth/settings'),
  setAuthSettings: (settings) => request('/auth/settings', json('POST', settings)),
  logout: () => request('/auth/logout', json('POST', {}, { skipAuthRedirect: true })),
  health: () => request('/health'),
  getWorkMode: () => request('/work-mode'),
  setWorkMode: (mode) => request('/work-mode', json('POST', { mode, confirm: true }, { timeoutMs: 10_000 })),

  getDeviceInfo: () => request('/device'),
  getSimInfo: () => request('/sim', { timeoutMs: 2500 }),
  refreshSimDetails: () => request('/sim/details/refresh', json('POST', {}, { timeoutMs: 2500 })),
  updateSimCache: (data) => request('/sim/cache', json('POST', data)),
  getNetworkInfo: () => request('/network'),
  getCellsInfo: () => request('/cells'),
  startCellMonitor: () => request('/cell-monitor/start', json('POST', {})),
  stopCellMonitor: () => request('/cell-monitor/stop', json('POST', {})),
  getDataStatus: () => request('/data'),
  setDataStatus: (active) => request('/data', json('POST', { active })),
  getRoamingStatus: () => request('/roaming'),
  setRoamingAllowed: (allowed) => request('/roaming', json('POST', { allowed })),
  getAirplaneMode: () => request('/airplane-mode'),
  setAirplaneMode: (enabled) => request('/airplane-mode', json('POST', { enabled })),
  getSystemStats: () => request('/stats', { timeoutMs: 2500 }),
  getNetworkInterfaces: () => request('/network/interfaces'),
  getNetworkConnectionAddresses: () => request('/network/connection-addresses'),
  getSignalStrength: () => request('/network/signal-strength'),
  getCellLocationInfo: () => request('/location/cell-info'),
  getConnectivity: () => request('/connectivity'),
  restartBaseband: () => request('/baseband/restart', json('POST', {})),
  getBasebandRestartStatus: () => request('/baseband/restart/status'),
  restartService: () => request('/service/restart', json('POST', {})),
  rebootSystem: (delaySeconds = 1) => request('/system/reboot', json('POST', { delay_seconds: delaySeconds })),

  getEsimConfig: () => request('/esim/config'),
  setEsimConfig: (config) => request('/esim/config', json('POST', config)),
  getEsimEuicc: (live = false) => request(live ? '/esim/euicc?live=1' : '/esim/euicc', { timeoutMs: 30_000 }),
  getEsimProfiles: () => request('/esim/profiles', { timeoutMs: 30_000 }),
  getCachedEsimProfiles: () => request('/esim/profiles?cached=1', { timeoutMs: 5000 }),
  getEsimLpacStatus: () => request('/esim/lpac/status', { timeoutMs: 15_000 }),
  repairEsimLpac: (config) => request('/esim/lpac/repair', json('POST', config, { timeoutMs: 120_000 })),
  enableEsimProfile: (iccid) => request(`/esim/profiles/${encodeURIComponent(iccid)}/enable`, json('POST', {}, { timeoutMs: 10_000 })),
  renameEsimProfile: (iccid, name) => request(`/esim/profiles/${encodeURIComponent(iccid)}/rename`, json('POST', { name }, { timeoutMs: 60_000 })),
  deleteEsimProfile: (iccid) => request(`/esim/profiles/${encodeURIComponent(iccid)}`, { method: 'DELETE', timeoutMs: 60_000 }),
  downloadEsimProfile: (data) => request('/esim/profiles', json('POST', data, { timeoutMs: 180_000 })),

  getOperators: () => request('/network/operators'),
  scanOperators: () => request('/network/operators/scan'),
  registerOperatorManual: (mccmnc) => request('/network/register-manual', json('POST', { mccmnc })),
  registerOperatorAuto: () => request('/network/register-auto', json('POST', {})),
  getApnList: () => request('/apn'),
  setApn: (config) => request('/apn', json('POST', config)),
  getRadioMode: () => request('/radio-mode'),
  setRadioMode: (mode) => request('/radio-mode', json('POST', { mode })),
  getBandLockStatus: () => request('/band-lock'),
  setBandLock: (config) => request('/band-lock', json('POST', config)),
  getCellLockStatus: () => request('/cell-lock'),
  setCellLock: (config) => request('/cell-lock', json('POST', config)),
  unlockAllCells: () => request('/cell-lock/unlock-all', json('POST', {})),

  getDdnsConfig: () => request('/device-network/ddns/config'),
  setDdnsConfig: (config) => request('/device-network/ddns/config', json('POST', config)),
  getDdnsStatus: () => request('/device-network/ddns/status'),
  syncDdnsNow: () => request('/device-network/ddns/sync', json('POST', {})),
  getDdnsLogs: () => request('/device-network/ddns/logs'),
  clearDdnsLogs: () => request('/device-network/ddns/logs/clear', json('POST', {})),
  getWlanStatus: () => request('/device-network/wlan/status'),
  setWlanEnabled: (enabled) => request('/device-network/wlan/enabled', json('POST', { enabled })),
  scanWlan: () => request('/device-network/wlan/scan', json('POST', {})),
  getWlanProfiles: () => request('/device-network/wlan/profiles'),
  forgetWlan: (config) => request('/device-network/wlan/forget', json('POST', config)),
  connectWlan: (config) => request('/device-network/wlan/connect', json('POST', config)),
  disconnectWlan: () => request('/device-network/wlan/disconnect', json('POST', {})),
  saveWlanProfile: (config) => request('/device-network/wlan/profile', json('POST', config)),

  sendSms: (phoneNumber, content) => request('/sms/send', json('POST', { phone_number: phoneNumber, content })),
  getSmsList: (params) => request(queryPath('/sms/list', params)),
  getSmsConversation: (params) => request(queryPath('/sms/conversation', params)),
  getSmsStats: () => request('/sms/stats'),
  clearAllSms: () => request('/sms/clear', { method: 'POST' }),
  deleteSmsMessage: (id) => request(`/sms/message/${id}`, { method: 'DELETE' }),
  deleteSmsConversation: (phone) => request(`/sms/conversation/${encodeURIComponent(phone)}`, { method: 'DELETE' }),
  deleteSmsBatch: (payload) => request('/sms/batch-delete', json('POST', payload)),

  getCalls: () => request('/calls'),
  dialCall: (phoneNumber) => request('/call/dial', json('POST', { phone_number: phoneNumber })),
  hangupCall: (path) => request('/call/hangup', json('POST', { path })),
  hangupAllCalls: () => request('/call/hangup-all', json('POST', {})),
  answerCall: (path) => request('/call/answer', json('POST', { path })),
  getCallHistory: (params) => request(queryPath('/call/history', params)),
  deleteCallRecord: (id) => request(`/call/history/${id}`, { method: 'DELETE' }),
  clearCallHistory: () => request('/call/history/clear', { method: 'POST' }),
  getCallSettings: () => request('/call/settings'),
  setCallWaiting: (enabled) => request('/call/settings', json('POST', { property: 'VoiceCallWaiting', value: enabled ? 'enabled' : 'disabled' })),

  getNotificationConfig: () => request('/notifications/config'),
  setNotificationConfig: (config) => request('/notifications/config', json('POST', config)),
  testNotificationChannel: (channel) => request(`/notifications/test/${channel}`, { method: 'POST' }),
  getNotificationLogs: (params) => request(queryPath('/notifications/logs', params)),
  clearNotificationLogs: (filters) => request('/notifications/logs/clear', json('POST', filters || {})),
  getNotificationQueue: (params) => request(queryPath('/notifications/queue', params)),
  retryNotificationQueueItem: (id) => request(`/notifications/queue/${id}/retry`, { method: 'POST' }),
  deleteNotificationQueueItem: (id) => request(`/notifications/queue/${id}`, { method: 'DELETE' }),
  retryAllNotificationQueue: () => request('/notifications/queue/retry-all', { method: 'POST' }),
  clearNotificationQueue: () => request('/notifications/queue/clear', { method: 'POST' }),

  getOtaStatus: () => request('/ota/status'),
  async uploadOta(file) {
    const response = await fetch(`${API_BASE}/ota/upload`, {
      method: 'POST',
      body: file,
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/octet-stream' },
    })
    if (!response.ok) {
      if (response.status === 401) redirectToLogin()
      throw new Error(statusMessage(response.status))
    }
    return response.json()
  },
  prepareOnlineOta: (config) => request('/ota/online-prepare', json('POST', config)),
  getLatestOtaRelease: (config) => request('/ota/latest-release', json('POST', config)),
  applyOta: (restartNow = false) => request('/ota/apply', json('POST', { restart_now: restartNow })),
  cancelOta: () => request('/ota/cancel', { method: 'POST' }),

  getAutomationConfig: () => request('/automation/config'),
  setAutomationConfig: (config) => request('/automation/config', json('POST', config)),
  testAutomationTask: (id) => request(`/automation/test/${encodeURIComponent(id)}`, { method: 'POST' }),
  getAutomationLogs: (params) => request(queryPath('/automation/logs', params)),
  clearAutomationLogs: (filters) => request('/automation/logs/clear', json('POST', filters || {})),
}

export { request }
