import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import { parse } from 'dotenv'
import { networkInterfaces } from 'os'
import { execSync } from 'child_process'

// 只读取 api/.env 里的 PORT / ADMIN_API_KEY 用于本地 dev server 代理
const apiEnvPath = resolve(__dirname, '../api/.env')
let apiPort = process.env.PORT || '3006'
let adminApiKey = 'dev-api-key'
if (existsSync(apiEnvPath)) {
  const parsed = parse(readFileSync(apiEnvPath, 'utf-8'))
  if (parsed.PORT) apiPort = parsed.PORT
  if (parsed.ADMIN_API_KEY) adminApiKey = parsed.ADMIN_API_KEY
}

// 在 macOS 上，Cursor / 其它 IDE 插件 host 偶尔会先抢占 127.0.0.1:<apiPort>，
// 而我们的 API 用 0.0.0.0 监听 — 这会导致 loopback 流量被 IDE 截走（返回 404）。
// 这里在启动 dev server 时探测：若 loopback 上同端口被别的进程占用，
// 就改用第一个非 loopback IPv4 直连真正的 API。可被 VITE_API_HOST 显式覆盖。
function pickApiHost(port: string): string {
  if (process.env.VITE_API_HOST) return process.env.VITE_API_HOST
  let loopbackOwner: string | null = null
  try {
    const out = execSync(`lsof -nP -iTCP:${port} -sTCP:LISTEN 2>/dev/null || true`, { encoding: 'utf-8' })
    const lines = out.split('\n').filter((l) => l.includes('LISTEN'))
    const isLoopbackTakenByNonNode = lines.some(
      (l) => /127\.0\.0\.1:|\[::1\]:/.test(l) && !/^node\b/.test(l.trim()),
    )
    if (isLoopbackTakenByNonNode) {
      loopbackOwner = lines.find((l) => /127\.0\.0\.1:/.test(l))?.split(/\s+/)[0] ?? 'unknown'
    }
  } catch { /* lsof 不存在或无权限 — 用默认 */ }
  if (!loopbackOwner) return 'localhost'
  for (const list of Object.values(networkInterfaces())) {
    for (const iface of list ?? []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        // eslint-disable-next-line no-console
        console.warn(`[vite] loopback :${port} occupied by '${loopbackOwner}', proxying via LAN IP ${iface.address}`)
        return iface.address
      }
    }
  }
  return 'localhost'
}

const API_URL = `http://${pickApiHost(apiPort)}:${apiPort}`

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
