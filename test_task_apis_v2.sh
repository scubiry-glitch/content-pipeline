#!/bin/bash
# 测试任务详情页面所有API - 修正版

TASK_ID="task_1773766510348"
API_KEY="dev-api-key"
BASE_URL="http://localhost:3000/api/v1"

echo "=========================================="
echo "任务详情页面 API 真实有效性测试"
echo "任务ID: $TASK_ID"
echo "=========================================="
echo ""

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# 测试计数
VALID=0
INVALID=0
SKIP=0

# 测试函数 - 检查API是否真实存在并返回有效数据
test_api() {
    local method=$1
    local endpoint=$2
    local description=$3
    local data=$4
    local expect_error=$5  # 是否预期会返回业务错误
    
    echo "----------------------------------------"
    echo -e "${BLUE}测试: $description${NC}"
    echo "方法: $method $endpoint"
    
    if [ -n "$data" ]; then
        echo "请求数据: $data"
        response=$(curl -s -w "\nHTTP_CODE:%{http_code}" -X $method \
            -H "X-API-Key: $API_KEY" \
            -H "Content-Type: application/json" \
            -d "$data" \
            "$BASE_URL$endpoint" 2>/dev/null)
    else
        response=$(curl -s -w "\nHTTP_CODE:%{http_code}" -X $method \
            -H "X-API-Key: $API_KEY" \
            "$BASE_URL$endpoint" 2>/dev/null)
    fi
    
    http_code=$(echo "$response" | grep "HTTP_CODE:" | cut -d: -f2)
    body=$(echo "$response" | sed '/HTTP_CODE:/d')
    
    # 判断API是否真实存在且有效
    if [ "$http_code" = "404" ] && echo "$body" | grep -q "ROUTE_NOT_FOUND"; then
        echo -e "${RED}✗ API不存在 (HTTP $http_code)${NC}"
        echo "响应: $body"
        INVALID=$((INVALID + 1))
    elif [ "$http_code" = "200" ] || [ "$http_code" = "201" ]; then
        echo -e "${GREEN}✓ 有效调用 (HTTP $http_code)${NC}"
        echo "响应预览: $(echo "$body" | head -c 100)..."
        VALID=$((VALID + 1))
    elif [ "$expect_error" = "true" ]; then
        echo -e "${YELLOW}⚠ 业务错误但API有效 (HTTP $http_code)${NC}"
        echo "响应: $body"
        VALID=$((VALID + 1))
    elif echo "$body" | grep -q "error\|Error"; then
        echo -e "${RED}✗ 错误响应 (HTTP $http_code)${NC}"
        echo "响应: $body"
        INVALID=$((INVALID + 1))
    else
        echo -e "${GREEN}✓ 有效调用 (HTTP $http_code)${NC}"
        echo "响应: $body"
        VALID=$((VALID + 1))
    fi
    echo ""
}

# ==================== tasksApi ====================
echo "=========================================="
echo "【1】tasksApi - 任务相关API"
echo "=========================================="

# 1.1 GET /production/:id - 获取任务详情
test_api "GET" "/production/$TASK_ID" "获取任务详情"

# 1.2 PUT /production/:id - 更新任务信息
test_api "PUT" "/production/$TASK_ID" "更新任务信息" '{"topic":"测试更新主题"}'

# 1.3 POST /production/:id/approve - 审批任务 (预期业务错误，因为任务状态不对)
test_api "POST" "/production/$TASK_ID/approve" "审批任务" '{"approved":false}' "true"

# 1.4 POST /production/:id/confirm-outline - 确认大纲
test_api "POST" "/production/$TASK_ID/confirm-outline" "确认大纲" '{}'

# 1.5 POST /production/:id/redo/:stage - 重做阶段
test_api "POST" "/production/$TASK_ID/redo/planning" "重做选题策划" '{}'

# ==================== blueTeamApi ====================
echo "=========================================="
echo "【2】blueTeamApi - 蓝军评审API"
echo "=========================================="

# 2.1 GET /production/:taskId/reviews - 获取评审列表
test_api "GET" "/production/$TASK_ID/reviews" "获取蓝军评审列表"

# 2.2 POST /production/:taskId/reviews/batch-decide - 批量决策
test_api "POST" "/production/$TASK_ID/reviews/batch-decide" "批量处理评审" '{"decision":"accept"}'

# 2.3 POST /production/:taskId/review-items/re-review - 申请重新评审
test_api "POST" "/production/$TASK_ID/review-items/re-review" "申请重新评审" '{"expertRole":"fact_checker"}' "true"

# ==================== 质量分析API ====================
echo "=========================================="
echo "【3】质量分析相关API"
echo "=========================================="

# 3.1 GET /quality/hot-topics - 热点话题
test_api "GET" "/quality/hot-topics?limit=5" "获取热点话题"

# 3.2 GET /quality/sentiment/stats - 情感分析统计
test_api "GET" "/quality/sentiment/stats" "获取情感分析统计"

# ==================== 资产API ====================
echo "=========================================="
echo "【4】资产相关API"
echo "=========================================="

# 4.1 GET /assets - 素材列表
test_api "GET" "/assets" "获取素材列表"

# ==================== 编排器API ====================
echo "=========================================="
echo "【5】编排器相关API"
echo "=========================================="

# 5.1 GET /orchestrator/rules - 工作流规则
test_api "GET" "/orchestrator/rules" "获取工作流规则"

# ==================== researchApi ====================
echo "=========================================="
echo "【6】researchApi - 研究相关API"
echo "=========================================="

# 6.1 POST /research/:taskId/collect - 启动研究采集
test_api "POST" "/research/$TASK_ID/collect" "启动研究采集" '{}'

# 6.2 POST /research/:taskId/config - 保存研究配置
test_api "POST" "/research/$TASK_ID/config" "保存研究配置" '{"autoCollect":true,"sources":["web","rss"],"maxResults":20,"minCredibility":0.5,"keywords":[],"excludeKeywords":[],"timeRange":"30d"}'

# ==================== complianceApi ====================
echo "=========================================="
echo "【7】complianceApi - 合规检查API"
echo "=========================================="

# 7.1 POST /compliance/check - 合规检查 (需要contentId)
test_api "POST" "/compliance/check" "检查内容合规性" '{"contentId":"test","content":"这是一段测试内容"}' "true"

# ==================== 汇总 ====================
echo "=========================================="
echo "测试结果汇总"
echo "=========================================="
echo -e "有效API: ${GREEN}$VALID${NC}"
echo -e "无效/不存在: ${RED}$INVALID${NC}"
echo -e "跳过: ${YELLOW}$SKIP${NC}"
echo "总计: $((VALID + INVALID + SKIP))"
echo "=========================================="

if [ $INVALID -eq 0 ]; then
    echo -e "${GREEN}所有API测试完成，均可调用!${NC}"
    exit 0
else
    echo -e "${RED}存在 $INVALID 个无效API，请检查后端路由配置!${NC}"
    exit 1
fi
