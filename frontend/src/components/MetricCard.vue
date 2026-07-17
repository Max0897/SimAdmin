<script setup>
import { NCard, NIcon, NText } from 'naive-ui'

defineProps({
  label: { type: String, required: true },
  value: { type: [String, Number], default: '--' },
  detail: { type: String, default: '' },
  tone: { type: String, default: 'primary' },
  icon: { type: [Object, Function], default: null },
})
</script>

<template>
  <NCard size="small" class="metric-card" :class="`metric-card--${tone}`">
    <div class="metric-card__head">
      <NText depth="3">{{ label }}</NText>
      <NIcon v-if="icon" :component="icon" :size="19" />
    </div>
    <strong class="metric-card__value">{{ value ?? '--' }}</strong>
    <NText v-if="detail" depth="3" class="metric-card__detail">{{ detail }}</NText>
  </NCard>
</template>
