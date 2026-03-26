import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// 从 api/.env 加载配置
import { config } from 'dotenv'
config({ path: resolve(__dirname, '../api/.env') })

const API_PORT = process.env.PORT || '3006'
const API_URL = `http://localhost:${API_PORT}`

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    include: ['echarts', 'echarts-for-react'],
    force: true
  },
  server: {
    hmr: {
      overlay: false
    },
    proxy: {
      // SSE streaming endpoints — must not buffer responses
      '/api/v1/streaming': {
        target: API_URL,
        changeOrigin: true,
        secure: false,
        headers: {
          'Connection': 'keep-alive',
          'Cache-Control': 'no-cache'
        }
      },
      '/api': {
        target: API_URL,
        changeOrigin: true,
        secure: false
      }
    }
  }
})
