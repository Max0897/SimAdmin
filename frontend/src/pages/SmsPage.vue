<script setup>
import { computed, ref } from 'vue'
import {
  NAvatar,
  NBadge,
  NButton,
  NForm,
  NFormItem,
  NIcon,
  NInput,
  NModal,
  NPopconfirm,
  NSpace,
  NTag,
  NText,
  useMessage,
} from 'naive-ui'
import { ArrowLeft, Eraser, MessageSquare, Plus, Search, Send, Trash2, UserRound } from '@lucide/vue'
import { api } from '@/api/index.js'
import PageHeader from '@/components/PageHeader.vue'
import { usePolling } from '@/composables/usePolling.js'
import { errorMessage } from '@/utils/format.js'

const message = useMessage()
const loading = ref(true)
const messages = ref([])
const stats = ref(null)
const selectedPhone = ref('')
const search = ref('')
const draft = ref('')
const sending = ref(false)
const composeOpen = ref(false)
const composePhone = ref('')
const composeContent = ref('')

const conversations = computed(() => {
  const groups = new Map()
  messages.value.forEach((item) => {
    const current = groups.get(item.phone_number) || { phone: item.phone_number, messages: [], latest: item }
    current.messages.push(item)
    if (new Date(item.timestamp) > new Date(current.latest.timestamp)) current.latest = item
    groups.set(item.phone_number, current)
  })
  return [...groups.values()]
    .filter((item) => !search.value || item.phone.includes(search.value) || item.latest.content.toLowerCase().includes(search.value.toLowerCase()))
    .sort((a, b) => new Date(b.latest.timestamp) - new Date(a.latest.timestamp))
})
const activeMessages = computed(() => messages.value
  .filter((item) => item.phone_number === selectedPhone.value)
  .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp)))

async function load(background = false) {
  if (!background) loading.value = true
  try {
    const [listResponse, statsResponse] = await Promise.all([api.getSmsList({ limit: 500 }), api.getSmsStats()])
    messages.value = listResponse.data?.messages || []
    stats.value = statsResponse.data
  } catch (loadError) {
    if (!background) message.error(errorMessage(loadError))
  } finally { loading.value = false }
}

async function send() {
  if (!selectedPhone.value || !draft.value.trim()) return
  sending.value = true
  try {
    await api.sendSms(selectedPhone.value, draft.value.trim())
    draft.value = ''
    message.success('短信已发送')
    await load(true)
  } catch (sendError) {
    message.error(errorMessage(sendError))
  } finally { sending.value = false }
}

async function sendNew() {
  if (!composePhone.value.trim() || !composeContent.value.trim()) return
  sending.value = true
  try {
    await api.sendSms(composePhone.value.trim(), composeContent.value.trim())
    selectedPhone.value = composePhone.value.trim()
    composeContent.value = ''
    composeOpen.value = false
    message.success('短信已发送')
    await load(true)
  } catch (sendError) {
    message.error(errorMessage(sendError))
  } finally { sending.value = false }
}

async function deleteConversation() {
  try {
    await api.deleteSmsConversation(selectedPhone.value)
    selectedPhone.value = ''
    await load(true)
    message.success('会话已删除')
  } catch (deleteError) { message.error(errorMessage(deleteError)) }
}
async function clearAll() {
  try {
    await api.clearAllSms()
    selectedPhone.value = ''
    await load(true)
    message.success('短信记录已清空')
  } catch (clearError) { message.error(errorMessage(clearError)) }
}

usePolling(load)
</script>

<template>
  <main class="page">
    <PageHeader title="短信管理" description="按联系人查看收发记录，并直接通过当前 SIM 发送短信" :loading="loading" @refresh="load(false)">
      <template #actions>
        <NButton type="primary" @click="composeOpen = true"><template #icon><Plus :size="16" /></template>新短信</NButton>
        <NPopconfirm @positive-click="clearAll"><template #trigger><NButton class="desktop-action" secondary type="error"><template #icon><Eraser :size="16" /></template>清空记录</NButton></template>确定清空所有短信记录？</NPopconfirm>
      </template>
    </PageHeader>

    <div class="toolbar">
      <NSpace>
        <NTag :bordered="false">全部 {{ stats?.total || 0 }}</NTag>
        <NTag type="info" :bordered="false">接收 {{ stats?.incoming || 0 }}</NTag>
        <NTag type="success" :bordered="false">发送 {{ stats?.outgoing || 0 }}</NTag>
      </NSpace>
    </div>

    <section class="conversation-layout" :class="{ 'has-selection': selectedPhone }">
      <aside class="conversation-list">
        <div class="conversation-list__header">
          <NInput v-model:value="search" placeholder="搜索号码或内容" clearable>
            <template #prefix><NIcon><Search /></NIcon></template>
          </NInput>
        </div>
        <div
          v-for="conversation in conversations"
          :key="conversation.phone"
          class="conversation-item"
          :class="{ 'conversation-item--active': selectedPhone === conversation.phone }"
          @click="selectedPhone = conversation.phone"
        >
          <NAvatar round><UserRound :size="18" /></NAvatar>
          <div class="conversation-item__body">
            <div class="conversation-item__head"><strong>{{ conversation.phone }}</strong><NText depth="3">{{ conversation.latest.timestamp }}</NText></div>
            <div class="conversation-item__preview">{{ conversation.latest.content }}</div>
          </div>
          <NBadge :value="conversation.messages.length" :max="99" />
        </div>
        <div v-if="!conversations.length" class="empty-state"><div><MessageSquare :size="30" />暂无短信</div></div>
      </aside>

      <div class="message-pane">
        <template v-if="selectedPhone">
          <div class="message-pane__header">
            <NSpace align="center">
              <NButton class="mobile-only" quaternary circle aria-label="返回会话列表" @click="selectedPhone = ''"><template #icon><ArrowLeft :size="18" /></template></NButton>
              <div><strong>{{ selectedPhone }}</strong><div class="table-cell-sub">{{ activeMessages.length }} 条记录</div></div>
            </NSpace>
            <NPopconfirm @positive-click="deleteConversation"><template #trigger><NButton quaternary type="error" circle aria-label="删除会话"><template #icon><Trash2 :size="18" /></template></NButton></template>删除与该号码的所有短信？</NPopconfirm>
          </div>
          <div class="message-list">
            <article v-for="item in activeMessages" :key="item.id" class="message-bubble" :class="{ 'message-bubble--sent': item.direction === 'outgoing' }">
              {{ item.content }}
              <div class="message-bubble__meta">{{ item.timestamp }} · {{ item.status }}</div>
            </article>
          </div>
          <div class="message-composer">
            <NInput v-model:value="draft" type="textarea" :autosize="{ minRows: 2, maxRows: 5 }" placeholder="输入短信内容" @keydown.ctrl.enter.prevent="send" />
            <NButton type="primary" circle :loading="sending" :disabled="!draft.trim()" aria-label="发送短信" @click="send"><template #icon><Send :size="18" /></template></NButton>
          </div>
        </template>
        <div v-else class="empty-state"><div><MessageSquare :size="34" />从左侧选择一个会话</div></div>
      </div>
    </section>

    <NModal v-model:show="composeOpen" preset="card" title="新短信" style="width: min(500px, calc(100vw - 24px))">
      <NForm label-placement="top">
        <NFormItem label="电话号码"><NInput v-model:value="composePhone" placeholder="接收号码" /></NFormItem>
        <NFormItem label="短信内容"><NInput v-model:value="composeContent" type="textarea" :rows="5" /></NFormItem>
        <NSpace justify="end"><NButton @click="composeOpen = false">取消</NButton><NButton type="primary" :loading="sending" :disabled="!composePhone.trim() || !composeContent.trim()" @click="sendNew"><template #icon><Send :size="16" /></template>发送</NButton></NSpace>
      </NForm>
    </NModal>
  </main>
</template>
