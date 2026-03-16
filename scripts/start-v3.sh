#!/bin/bash
# v3.0-alpha 开发环境启动脚本

set -e

echo "🚀 Content Pipeline v3.0-alpha"
echo "=============================="

# 检查环境变量
if [ -z "$ANTHROPIC_API_KEY" ]; then
    echo "⚠️  Warning: ANTHROPIC_API_KEY not set"
    echo "   LLM features will use fallback mode"
    echo ""
fi

# 启动服务
echo "📦 Starting infrastructure..."
docker-compose -f docker-compose.v3.yml up -d postgres redis

echo "⏳ Waiting for PostgreSQL..."
sleep 3

echo "🔧 Starting API server..."
docker-compose -f docker-compose.v3.yml up -d api

echo "⚡ Starting queue workers..."
docker-compose -f docker-compose.v3.yml up -d worker

echo "📊 Starting Bull Dashboard..."
docker-compose -f docker-compose.v3.yml up -d bull-dashboard

echo ""
echo "✅ v3.0-alpha is ready!"
echo ""
echo "Services:"
echo "  API:          http://localhost:3001"
echo "  Queue UI:     http://localhost:3002"
echo "  PostgreSQL:   localhost:5433"
echo "  Redis:        localhost:6380"
echo ""
echo "Commands:"
echo "  Logs:   docker-compose -f docker-compose.v3.yml logs -f"
echo "  Stop:   docker-compose -f docker-compose.v3.yml down"
echo "  Reset:  docker-compose -f docker-compose.v3.yml down -v"
echo ""
