import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import { parse } from 'dotenv'

// 只读取 api/.env 里的 PORT 用于本地 dev server 代理，避免把其中的 VITE_* 注入 process.env
// （否则会覆盖 webapp/.env，生产构建把 localhost 打进包里，触发「公网页访问 loopback」被浏览器拦截）
const apiEnvPath = resolve(__dirname, '../api/.env')
let apiPort = process.env.PORT || '3006'
if (existsSync(apiEnvPath)) {
  const parsed = parse(readFileSync(apiEnvPath, 'utf-8'))
  if (parsed.PORT) apiPort = parsed.PORT
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
