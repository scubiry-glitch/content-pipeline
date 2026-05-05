const dotenv = require('dotenv');
const path = require('path');

// 加载 API 目录下的 .env 文件
// override:true · 强制覆盖 pm2 daemon 已存在的旧 env 值。
// 否则 `pm2 restart --update-env` 不会真的重新读 .env，旧值长期残留（参见 2026-05 修 V4-Flash 那次踩坑）。
dotenv.config({ path: path.join(__dirname, 'api', '.env'), override: true });

module.exports = {
  apps: [
    {
      name: 'content-pipeline-api',
      script: './api/src/server.ts',
      interpreter: './api/node_modules/.bin/tsx',
      instances: 1,
      exec_mode: 'fork',
      cwd: __dirname,
      env: {
        NODE_ENV: 'development',
        KIMI_API_KEY: process.env.KIMI_API_KEY,
        KIMI_BASE_URL: process.env.KIMI_BASE_URL,
        DATABASE_URL: process.env.DATABASE_URL,
        DASHBOARD_LLM_API_KEY: process.env.DASHBOARD_LLM_API_KEY,
        DASHBOARD_LLM_BASE_URL: process.env.DASHBOARD_LLM_BASE_URL,
        TAVILY_API_KEY: process.env.TAVILY_API_KEY,
        MN_MIN_TRANSCRIPT_CHARS: process.env.MN_MIN_TRANSCRIPT_CHARS,
      },
      env_production: {
        NODE_ENV: 'production',
      },
      log_file: './api/logs/combined.log',
      out_file: './api/logs/out.log',
      error_file: './api/logs/err.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      watch: false,
      max_memory_restart: '1G',
      restart_delay: 3000,
      max_restarts: 10,
      min_uptime: '10s',
    },
  ],
};
