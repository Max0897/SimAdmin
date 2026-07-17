<script setup>
import { NButton, NIcon, NSpin } from 'naive-ui'
import { RefreshCw } from '@lucide/vue'

defineProps({
  title: { type: String, required: true },
  description: { type: String, default: '' },
  loading: Boolean,
})
defineEmits(['refresh'])
</script>

<template>
  <header class="page-header">
    <div>
      <h1>{{ title }}</h1>
      <p v-if="description">{{ description }}</p>
    </div>
    <div class="page-header__actions">
      <slot name="actions" />
      <NButton secondary circle :disabled="loading" aria-label="刷新" @click="$emit('refresh')">
        <template #icon><NSpin v-if="loading" :size="16" /><NIcon v-else><RefreshCw /></NIcon></template>
      </NButton>
    </div>
  </header>
</template>
