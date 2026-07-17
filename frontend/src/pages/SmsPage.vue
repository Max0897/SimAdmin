<script setup>
import { computed, ref, watch } from 'vue'
import {
  NAvatar,
  NButton,
  NCheckbox,
  NForm,
  NFormItem,
  NIcon,
  NInput,
  NModal,
  NPopconfirm,
  NSpace,
  NTag,
  useMessage,
} from 'naive-ui'
import { ArrowLeft, Eraser, ListChecks, MessageSquare, Plus, Search, Send, Trash2, UserRound, X } from '@lucide/vue'
import { api } from '@/api/index.js'
import PageHeader from '@/components/PageHeader.vue'
import { usePolling } from '@/composables/usePolling.js'
import { errorMessage } from '@/utils/format.js'

const message = useMessage()
const loading = ref(true)
const messages = ref([])
const stats = ref(null)
const selectedPhone = ref('')
const conversationMessages = ref([])
const conversationLoading = ref(false)
const search = ref('')
const draft = ref('')
const sending = ref(false)
const composeOpen = ref(false)
const composePhone = ref('')
const composeContent = ref('')
const batchMode = ref(false)
const selectedConversationPhones = ref(new Set())
const selectedMessageIds = ref(new Set())

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
const activeMessages = computed(() => [...conversationMessages.value]
  .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp)))
const batchCount = computed(() => selectedConversationPhones.value.size + selectedMessageIds.value.size)
const allConversationsSelected = computed(() => (
  conversations.value.length > 0
  && conversations.value.every((item) => selectedConversationPhones.value.has(item.phone))
))
const allMessagesSelected = computed(() => (
  activeMessages.value.length > 0
  && activeMessages.value.every((item) => selectedMessageIds.value.has(item.id))
))

async function load(background = false) {
  if (!background) loading.value = true
  try {
    const [listResponse, statsResponse] = await Promise.all([api.getSmsList({ limit: 1000, offset: 0 }), api.getSmsStats()])
    messages.value = listResponse.data?.messages || []
    stats.value = statsResponse.data
  } catch (loadError) {
    if (!background) message.error(errorMessage(loadError))
  } finally { loading.value = false }
}

async function loadConversation(phone = selectedPhone.value) {
  if (!phone) {
    conversationMessages.value = []
    return
  }
  conversationLoading.value = true
  try {
    const response = await api.getSmsConversation({ phone_number: phone, limit: 1000 })
    conversationMessages.value = response.data?.messages || []
  } catch {
    conversationMessages.value = messages.value.filter((item) => item.phone_number === phone)
  } finally {
    conversationLoading.value = false
  }
}

function selectConversation(phone) {
  if (batchMode.value) {
    toggleConversationSelection(phone)
    return
  }
  selectedPhone.value = phone
}

function toggleSet(source, value, checked) {
  const next = new Set(source.value)
  if (checked) next.add(value)
  else next.delete(value)
  source.value = next
}

function toggleConversationSelection(phone, checked = !selectedConversationPhones.value.has(phone)) {
  toggleSet(selectedConversationPhones, phone, checked)
}

function toggleMessageSelection(id, checked = !selectedMessageIds.value.has(id)) {
  toggleSet(selectedMessageIds, id, checked)
}

function toggleAllConversations() {
  selectedConversationPhones.value = allConversationsSelected.value
    ? new Set()
    : new Set(conversations.value.map((item) => item.phone))
}

function toggleAllMessages() {
  selectedMessageIds.value = allMessagesSelected.value
    ? new Set()
    : new Set(activeMessages.value.map((item) => item.id))
}

function exitBatchMode() {
  batchMode.value = false
  selectedConversationPhones.value = new Set()
  selectedMessageIds.value = new Set()
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
async function deleteMessage(id) {
  try {
    await api.deleteSmsMessage(id)
    await Promise.all([load(true), loadConversation()])
    message.success('短信已删除')
  } catch (deleteError) { message.error(errorMessage(deleteError)) }
}
async function deleteBatch() {
  if (!batchCount.value) return
  const removedCurrentConversation = selectedConversationPhones.value.has(selectedPhone.value)
  try {
    await api.deleteSmsBatch({
      ids: [...selectedMessageIds.value],
      phone_numbers: [...selectedConversationPhones.value],
    })
    exitBatchMode()
    if (removedCurrentConversation) selectedPhone.value = ''
    await load(true)
    if (selectedPhone.value) await loadConversation()
    message.success('已删除所选短信')
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

watch(selectedPhone, (phone) => {
  selectedMessageIds.value = new Set()
  loadConversation(phone)
})

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
          <div class="conversation-list__actions">
            <template v-if="batchMode">
              <NButton size="small" secondary @click="toggleAllConversations">{{ allConversationsSelected ? '取消全选' : '全选会话' }}</NButton>
              <NPopconfirm :disabled="!batchCount" @positive-click="deleteBatch">
                <template #trigger><NButton size="small" type="error" secondary :disabled="!batchCount">删除所选 {{ batchCount || '' }}</NButton></template>
                删除当前选中的会话和短信？
              </NPopconfirm>
              <NButton size="small" quaternary circle aria-label="退出批量管理" @click="exitBatchMode"><template #icon><X :size="16" /></template></NButton>
            </template>
            <NButton v-else size="small" secondary @click="batchMode = true"><template #icon><ListChecks :size="16" /></template>批量管理</NButton>
          </div>
        </div>
        <div
          v-for="conversation in conversations"
          :key="conversation.phone"
          class="conversation-item"
          :class="{ 'conversation-item--active': selectedPhone === conversation.phone }"
          @click="selectConversation(conversation.phone)"
        >
          <NCheckbox
            v-if="batchMode"
            :checked="selectedConversationPhones.has(conversation.phone)"
            aria-label="选择会话"
            @click.stop
            @update:checked="toggleConversationSelection(conversation.phone, $event)"
          />
          <NAvatar round><UserRound :size="18" /></NAvatar>
          <div class="conversation-item__body">
            <div class="conversation-item__head"><strong>{{ conversation.phone }}</strong></div>
            <div class="conversation-item__preview">{{ conversation.latest.content }}</div>
            <div class="conversation-item__time">{{ conversation.latest.timestamp }}</div>
          </div>
          <span class="conversation-item__count">{{ Math.min(conversation.messages.length, 99) }}{{ conversation.messages.length > 99 ? '+' : '' }}</span>
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
            <NSpace align="center">
              <NCheckbox v-if="batchMode" :checked="allMessagesSelected" @update:checked="toggleAllMessages">全选短信</NCheckbox>
              <NPopconfirm @positive-click="deleteConversation"><template #trigger><NButton quaternary type="error" circle aria-label="删除会话"><template #icon><Trash2 :size="18" /></template></NButton></template>删除与该号码的所有短信？</NPopconfirm>
            </NSpace>
          </div>
          <div class="message-list" :class="{ 'message-list--loading': conversationLoading }">
            <div v-for="item in activeMessages" :key="item.id" class="message-row" :class="{ 'message-row--sent': item.direction === 'outgoing' }">
              <NCheckbox v-if="batchMode" :checked="selectedMessageIds.has(item.id)" aria-label="选择短信" @update:checked="toggleMessageSelection(item.id, $event)" />
              <article class="message-bubble" :class="{ 'message-bubble--sent': item.direction === 'outgoing' }">
                {{ item.content }}
                <div class="message-bubble__meta">{{ item.timestamp }} · {{ item.status }}</div>
              </article>
              <NPopconfirm @positive-click="deleteMessage(item.id)">
                <template #trigger><NButton quaternary circle size="tiny" type="error" aria-label="删除短信"><template #icon><Trash2 :size="14" /></template></NButton></template>
                删除这条短信？
              </NPopconfirm>
            </div>
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
