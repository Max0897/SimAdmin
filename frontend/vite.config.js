import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

function getVersionInfo() {
  try {
    return {
      version: readFileSync('../VERSION', 'utf8').trim(),
      gitBranch: execSync('git rev-parse --abbrev-ref HEAD').toString().trim(),
      gitCommit: execSync('git rev-parse --short HEAD').toString().trim(),
    }
  } catch {
    return { version: '3.0.0', gitBranch: 'unknown', gitCommit: 'unknown' }
  }
}

const { version, gitBranch, gitCommit } = getVersionInfo()

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(version),
    __GIT_BRANCH__: JSON.stringify(gitBranch),
    __GIT_COMMIT__: JSON.stringify(gitCommit),
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.VITE_API_TARGET || 'http://192.168.68.1:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/node_modules/echarts/') || id.includes('/node_modules/vue-echarts/')) return 'vendor-charts'
          if (id.includes('/node_modules/naive-ui/')) return 'vendor-naive'
          if (
            id.includes('/node_modules/vue/') ||
            id.includes('/node_modules/vue-router/') ||
            id.includes('/node_modules/pinia/')
          ) return 'vendor-vue'
          return undefined
        },
      },
    },
  },
})
