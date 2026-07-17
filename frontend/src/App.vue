<script setup>
import { computed, onMounted } from 'vue'
import {
  darkTheme,
  dateZhCN,
  NConfigProvider,
  NDialogProvider,
  NGlobalStyle,
  NLoadingBarProvider,
  NMessageProvider,
  zhCN,
} from 'naive-ui'
import { useAppStore } from '@/stores/app.js'

const app = useAppStore()
const activeTheme = computed(() => (app.themeMode === 'dark' ? darkTheme : null))
const themeOverrides = computed(() => ({
  common: {
    primaryColor: app.themeMode === 'dark' ? '#38bdf8' : '#0784b5',
    primaryColorHover: app.themeMode === 'dark' ? '#7dd3fc' : '#0896c7',
    primaryColorPressed: app.themeMode === 'dark' ? '#0ea5e9' : '#066c95',
    borderRadius: '6px',
    borderRadiusSmall: '4px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  },
  Card: { borderRadius: '6px' },
  Button: { borderRadiusMedium: '6px' },
}))

onMounted(() => app.syncDocumentTheme())
</script>

<template>
  <NConfigProvider :theme="activeTheme" :theme-overrides="themeOverrides" :locale="zhCN" :date-locale="dateZhCN">
    <NGlobalStyle />
    <NLoadingBarProvider>
      <NDialogProvider>
        <NMessageProvider placement="top-right" :max="4">
          <RouterView />
        </NMessageProvider>
      </NDialogProvider>
    </NLoadingBarProvider>
  </NConfigProvider>
</template>
