#!/bin/bash
# 测试素材上传功能

API_KEY="dev-api-key-change-in-production"
BASE_URL="http://localhost:3000/api/v1"

echo "=== 测试素材上传 ==="

# 创建一个测试文本文件
echo "保租房REITs是近年来中国住房金融领域的重要创新。2022年，中国证监会和住建部联合发布《关于推进保障性租赁住房REITs试点工作的通知》，标志着保租房REITs正式进入试点阶段。

保租房REITs的核心优势在于：
1. 为保障性住房建设提供长期资金来源
2. 盘活存量资产，提高资金使用效率
3. 为投资者提供稳定的现金流回报

从国际经验来看，美国、新加坡等国家都有成熟的租赁住房REITs市场。美国的公寓REITs（Apartment REITs）是多家庭住宅市场的重要组成部分。" > /tmp/test-report.txt

# 上传文件
echo "上传测试文件..."
curl -s -X POST "$BASE_URL/assets" \
  -H "X-API-Key: $API_KEY" \
  -F "file=@/tmp/test-report.txt;type=text/plain" \
  -F "title=保租房REITs简介" \
  -F "source=测试数据" \
  -F "tags=保租房,REITs,政策"

echo ""
echo ""
echo "=== 搜索素材 ==="
curl -s "$BASE_URL/assets?q=REITs&limit=5" \
  -H "X-API-Key: $API_KEY" | head -100

echo ""
echo ""
echo "=== 获取所有素材 ==="
curl -s "$BASE_URL/assets?limit=5" \
  -H "X-API-Key: $API_KEY" | head -100

echo ""
echo "Done!"
