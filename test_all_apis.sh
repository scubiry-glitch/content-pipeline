#!/bin/bash
# 完整测试任务详情页面所有API交互

TASK_ID="task_1773766510348"
API_KEY="dev-api-key"
BASE_URL="http://localhost:3000/api/v1"

echo "=========================================="
echo "任务详情页面 - 完整API测试"
echo "任务ID: $TASK_ID"
echo "测试时间: $(date)"
echo "=========================================="
echo ""

# 颜色
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

PASS=0
FAIL=0

# 测试函数
test_api() {
    local method=$1
    local endpoint=$2
    local desc=$3
    local body=$4
    
    echo -e "${BLUE}▶ $desc${NC}"
    echo "  $method $endpoint"
    
    if [ -n "$body" ]; then
        resp=$(curl -s -w "\nHTTP_CODE:%{http_code}" -X $method \
            -H "X-API-Key: $API_KEY" \
            -H "Content-Type: application/json" \
            -d "$body" \
            "$BASE_URL$endpoint" 2>/dev/null)
    else
        resp=$(curl -s -w "\nHTTP_CODE:%{http_code}" -X $method \
            -H "X-API-Key: $API_KEY" \
            "$BASE_URL$endpoint" 2>/dev/null)
    fi
    
    code=$(echo "$resp" | grep "HTTP_CODE:" | cut -d: -f2)
    body=$(echo "$resp" | sed '/HTTP_CODE:/d')
    
    # 检查是否404（路由不存在）
    if [ "$code" = "404" ] && echo "$body" | grep -q "ROUTE_NOT_FOUND"; then
        echo -e "  ${RED}✗ 路由不存在 (404)${NC}"
        echo "  响应: $body"
        FAIL=$((FAIL + 1))
        return 1
    fi
    
    # 检查是否500（服务器错误）
    if [ "$code" = "500" ]; then
        echo -e "  ${RED}✗ 服务器错误 (500)${NC}"
        echo "  响应: $(echo $body | cut -c1-100)"
        FAIL=$((FAIL + 1))
        return 1
    fi
    
    # 2xx 表示API存在且有效
    if [ "$code" -ge 200 ] && [ "$code" -lt 300 ]; then
        echo -e "  ${GREEN}✓ 成功 ($code)${NC}"
        echo "  响应: $(echo $body | cut -c1-80)..."
        PASS=$((PASS + 1))
        return 0
    fi
    
    # 4xx 表示API存在但业务错误（也是有效调用）
    if [ "$code" -ge 400 ] && [ "$code" -lt 500 ]; then
        echo -e "  ${YELLOW}⚠ 业务错误 ($code) - API有效${NC}"
        echo "  响应: $(echo $body | cut -c1-80)"
        PASS=$((PASS + 1))
        return 0
    fi
    
    echo -e "  ${RED}✗ 异常 ($code)${NC}"
    echo "  响应: $body"
    FAIL=$((FAIL + 1))
    return 1
}

echo "【一、页面加载时调用的API】"
echo "=========================================="

test_api "GET" "/production/$TASK_ID" "1. 获取任务详情"
test_api "GET" "/production/$TASK_ID/reviews" "2. 获取蓝军评审"
test_api "GET" "/quality/hot-topics?limit=5" "3. 获取热点话题"
test_api "GET" "/quality/sentiment/stats" "4. 获取情感分析统计"
test_api "GET" "/assets" "5. 获取素材列表"
test_api "GET" "/orchestrator/rules" "6. 获取工作流规则"

echo ""
echo "【二、用户操作调用的API】"
echo "=========================================="

test_api "POST" "/production/$TASK_ID/outline/confirm" "7. 确认大纲" "{}"
test_api "POST" "/production/$TASK_ID/redo/planning" "8. 重做选题策划" "{}"
test_api "POST" "/production/$TASK_ID/redo/research" "9. 重做深度研究" "{}"
test_api "POST" "/production/$TASK_ID/redo/writing" "10. 重做文稿生成" "{}"
test_api "POST" "/production/$TASK_ID/redo/review" "11. 重做蓝军评审" "{}"
test_api "POST" "/production/$TASK_ID/approve" "12. 审批任务" '{"approved":true}'
test_api "POST" "/production/$TASK_ID/review-items/test-id/decide" "13. 提交评审决策" '{"decision":"accept"}'
test_api "POST" "/production/$TASK_ID/review-items/batch-decide" "14. 批量评审决策" '{"decisions":[]}'
test_api "POST" "/production/$TASK_ID/review-items/re-review" "15. 申请重新评审" '{"expertRole":"fact_checker"}'
test_api "DELETE" "/production/$TASK_ID" "16. 删除任务"
test_api "POST" "/production/$TASK_ID/hide" "17. 隐藏任务" "{}"

echo ""
echo "【三、研究相关API】"
echo "=========================================="

test_api "POST" "/research/$TASK_ID/collect" "18. 启动研究采集" "{}"
test_api "POST" "/research/$TASK_ID/config" "19. 保存研究配置" '{"autoCollect":true,"sources":["web"],"maxResults":10}'

echo ""
echo "【四、其他模块API】"
echo "=========================================="

test_api "POST" "/compliance/check" "20. 合规检查" '{"contentId":"test","content":"测试内容"}'

echo ""
echo "=========================================="
echo "测试汇总"
echo "=========================================="
echo -e "通过: ${GREEN}$PASS${NC}"
echo -e "失败: ${RED}$FAIL${NC}"
echo "总计: $((PASS + FAIL))"
echo "=========================================="

if [ $FAIL -eq 0 ]; then
    echo -e "${GREEN}✓ 所有API测试通过${NC}"
    exit 0
else
    echo -e "${RED}✗ 存在失败的API${NC}"
    exit 1
fi
