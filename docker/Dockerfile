# Content Pipeline API - Docker 镜像 (轻量版)
FROM node:20-alpine

WORKDIR /app

# 只安装运行时依赖
RUN apk add --no-cache curl

# 复制依赖文件
COPY api/package*.json ./

# 安装 Node 依赖 (使用精简安装)
RUN npm ci --only=production --no-audit --no-fund

# 复制应用代码
COPY api/src ./src
COPY api/tsconfig.json ./

# 暴露端口
EXPOSE 3000

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:3000/api/v1/health || exit 1

# 启动命令
CMD ["npm", "run", "start"]
