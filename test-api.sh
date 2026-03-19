#!/bin/bash

echo "=== 测试 RSS API ==="

# 测试获取 RSS 源列表
echo ""
echo "1. 测试 GET /api/v1/quality/rss-sources"
curl -s -H "X-API-Key: dev-api-key" http://localhost:3000/api/v1/quality/rss-sources | head -500

echo ""
echo ""
echo "2. 测试 GET /api/v1/quality/items"
curl -s -H "X-API-Key: dev-api-key" "http://localhost:3000/api/v1/quality/items?limit=5&offset=0" | head -500

echo ""
echo ""
echo "3. 测试 GET /api/v1/quality/stats"
curl -s -H "X-API-Key: dev-api-key" http://localhost:3000/api/v1/quality/stats | head -500

echo ""
echo ""
echo "=== 测试完成 ==="
