#!/bin/bash
# 测试任务详情页面所有API

TASK_ID="task_1773766510348"
API_KEY="dev-api-key"
BASE_URL="http://localhost:3000/api/v1"

echo "=========================================="
echo "任务详情页面 API 测试"
echo "任务ID: $TASK_ID"
echo "=========================================="
echo ""

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 测试计数
PASSED=0
FAILED=0

# 测试函数
test_api() {
    local method=$1
    local endpoint=$2
    local description=$3
    local data=$4
    
    echo "----------------------------------------"
    echo "测试: $description"
    echo "方法: $method $endpoint"
    
    if [ -n "$data" ]; then
        echo "数据: $data"
        response=$(curl -s -w "\n%{http_code}" -X $method \
            -H "X-API-Key: $API_KEY" \
            -H "Content-Type: application/json" \
            -d "$data" \
            "$BASE_URL$endpoint" 2>/dev/null)
    else
        response=$(curl -s -w "\n%{http_code}" -X $method \
            -H "X-API-Key: $API_KEY" \
            "$BASE_URL$endpoint" 2>/dev/null)
    fi
    
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')
    
    if [ "$http_code" = "200" ] || [ "$http_code" = "201" ]; then
        echo -e "${GREEN}✓ 成功 (HTTP $http_code)${NC}"
        PASSED=$((PASSED + 1))
    else
        echo -e "${RED}✗ 失败 (HTTP $http_code)${NC}"
        echo "响应: $body"
        FAILED=$((FAILED + 1))
    fi
    echo ""
}

# ==================== tasksApi ====================
echo "=========================================="
echo "【1】tasksApi - 任务相关API"
echo "=========================================="

# 1.1 GET /production/:id - 获取任务详情
test_api "GET" "/production/$TASK_ID" "获取任务详情"

# 1.2 PUT /production/:id - 更新任务
test_api "PUT" "/production/$TASK_ID" "更新任务信息" '{"topic":"测试更新主题"}'

# 1.3 DELETE /production/:id - 删除任务（最后再测试）
# test_api "DELETE" "/production/$TASK_ID" "删除任务"

# 1.4 POST /production/:id/approve - 审批任务
test_api "POST" "/production/$TASK_ID/approve" "审批任务" '{"approved":false}'

# 1.5 POST /production/:id/confirm-outline - 确认大纲
test_api "POST" "/production/$TASK_ID/confirm-outline" "确认大纲" '{}'

# 1.6 POST /production/:id/redo/:stage - 重做阶段
test_api "POST" "/production/$TASK_ID/redo/planning" "重做选题策划" '{}'

# ==================== blueTeamApi ====================
echo "=========================================="
echo "【2】blueTeamApi - 蓝军评审API"
echo "=========================================="

# 2.1 GET /production/:taskId/reviews - 获取评审列表
test_api "GET" "/production/$TASK_ID/reviews" "获取蓝军评审列表"

# 2.2 POST /production/:taskId/review-items/:reviewId/decide - 提交决策
# 需要先获取reviewId，暂时跳过

echo "----------------------------------------"
echo "测试: 提交评审决策"
echo "方法: POST /production/$TASK_ID/review-items/test-review-id/decide"
echo -e "${YELLOW}⚠ 跳过 (需要真实reviewId)${NC}"
echo ""

# 2.3 POST /production/:taskId/reviews/batch-decide - 批量决策
test_api "POST" "/production/$TASK_ID/reviews/batch-decide" "批量处理评审" '{"decision":"accept"}'

# 2.4 POST /production/:taskId/review-items/re-review - 申请重新评审
test_api "POST" "/production/$TASK_ID/review-items/re-review" "申请重新评审" '{"expertRole":"fact_checker"}'

# ==================== 其他API ====================
echo "=========================================="
echo "【3】其他相关API"
echo "=========================================="

# 3.1 GET /quality/hot-topics - 热点话题
test_api "GET" "/quality/hot-topics?limit=5" "获取热点话题"

# 3.2 GET /quality/sentiment/stats - 情感分析统计
test_api "GET" "/quality/sentiment/stats" "获取情感分析统计"

# 3.3 GET /assets - 素材列表
test_api "GET" "/assets" "获取素材列表"

# 3.4 GET /orchestrator/rules - 工作流规则
test_api "GET" "/orchestrator/rules" "获取工作流规则"

# ==================== researchApi ====================
echo "=========================================="
echo "【4】researchApi - 研究相关API"
echo "=========================================="

# 4.1 POST /research/:taskId/collect - 启动研究采集
test_api "POST" "/research/$TASK_ID/collect" "启动研究采集" '{}'

# 4.2 POST /research/:taskId/config - 保存研究配置
test_api "POST" "/research/$TASK_ID/config" "保存研究配置" '{"autoCollect":true,"sources":["web","rss"],"maxResults":20,"minCredibility":0.5,"keywords":[],"excludeKeywords":[],"timeRange":"30d"}'

# ==================== complianceApi ====================
echo "=========================================="
echo "【5】complianceApi - 合规检查API"
echo "=========================================="

# 5.1 POST /compliance/check - 合规检查
test_api "POST" "/compliance/check" "检查内容合规性" '{"content":"这是一段测试内容"}'

# ==================== 汇总 ====================
echo "=========================================="
echo "测试结果汇总"
echo "=========================================="
echo -e "通过: ${GREEN}$PASSED${NC}"
echo -e "失败: ${RED}$FAILED${NC}"
echo "总计: $((PASSED + FAILED))"
echo "=========================================="

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}所有API测试通过!${NC}"
    exit 0
else
    echo -e "${RED}存在失败的API，请检查!${NC}"
    exit 1
fi
