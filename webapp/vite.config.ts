import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import { parse } from 'dotenv'

// 只读取 api/.env 里的 PORT / ADMIN_API_KEY 用于本地 dev server 代理
const apiEnvPath = resolve(__dirname, '../api/.env')
let apiPort = process.env.PORT || '3006'
let adminApiKey = 'dev-api-key'
if (existsSync(apiEnvPath)) {
  const parsed = parse(readFileSync(apiEnvPath, 'utf-8'))
  if (parsed.PORT) apiPort = parsed.PORT
  if (parsed.ADMIN_API_KEY) adminApiKey = parsed.ADMIN_API_KEY
}
const API_URL = `http://localhost:${apiPort}`

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    include: ['echarts', 'echarts-for-react'],
    force: true
  },
  server: {
    allowedHosts: ['pipeline.meizu.life'],
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
        secure: false,
        headers: {
          'x-api-key': adminApiKey
        }
      }
    }
  }
})
