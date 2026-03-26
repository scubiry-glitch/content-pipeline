module.exports = {
  apps: [{
    name: 'content-pipeline-api',
    script: 'npx',
    args: 'tsx src/server.ts',
    cwd: '/Users/scubiry/Documents/Scubiry/lab/pipeline/api',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'development',
      PORT: 3006
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 3006
    },
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    time: true,
    exec_mode: 'fork',
    interpreter: 'none'
  }]
};
