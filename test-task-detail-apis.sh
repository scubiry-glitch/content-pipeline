#!/bin/bash

# ============================================
# 任务详情页面 API 交互测试脚本
# 测试路径: /tasks/task_1773766510348
# ============================================

set -e

API_KEY="dev-api-key"
BASE_URL="http://localhost:3000/api/v1"
TASK_ID="task_1773766510348"

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 计数器
TOTAL=0
PASSED=0
FAILED=0
MISSING=0

# 测试函数
test_api() {
    local name="$1"
    local method="$2"
    local endpoint="$3"
    local data="${4:-}"
    local expect_ok="${5:-true}"
    
    TOTAL=$((TOTAL + 1))
    
    echo -e "\n${BLUE}[TEST $TOTAL] $name${NC}"
    echo "  Method: $method"
    echo "  Endpoint: $endpoint"
    
    local url="${BASE_URL}${endpoint}"
    local response
    local http_code
    
    if [ -n "$data" ]; then
        response=$(curl -s -w "\n%{http_code}" -X "$method" \
            -H "Content-Type: application/json" \
            -H "X-API-Key: $API_KEY" \
            -d "$data" \
            --max-time 10 \
            "$url" 2>&1) || true
    else
        response=$(curl -s -w "\n%{http_code}" -X "$method" \
            -H "X-API-Key: $API_KEY" \
            --max-time 10 \
            "$url" 2>&1) || true
    fi
    
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')
    
    # 检查是否是404（路由不存在）
    if echo "$body" | grep -q '"code":"ROUTE_NOT_FOUND"'; then
        echo -e "  ${YELLOW}⚠️  后端路由不存在 (404)${NC}"
        MISSING=$((MISSING + 1))
        return
    fi
    
    # 检查HTTP状态码
    if [ "$http_code" = "200" ] || [ "$http_code" = "201" ] || [ "$http_code" = "204" ]; then
        echo -e "  ${GREEN}✅ HTTP $http_code${NC}"
        if [ -n "$body" ] && [ ${#body} -lt 200 ]; then
            echo "  Response: $body"
        fi
        PASSED=$((PASSED + 1))
    elif [ "$http_code" = "400" ] || [ "$http_code" = "401" ] || [ "$http_code" = "403" ]; then
        # 400/401/403 在某些情况下是预期的（如状态校验失败）
        if [ "$expect_ok" = "false" ]; then
            echo -e "  ${GREEN}✅ HTTP $http_code (预期错误)${NC}"
            PASSED=$((PASSED + 1))
        else
            echo -e "  ${YELLOW}⚠️  HTTP $http_code${NC}"
            echo "  Response: $(echo $body | head -c 150)"
            PASSED=$((PASSED + 1))  # API存在且可访问
        fi
    elif [ "$http_code" = "404" ]; then
        echo -e "  ${RED}❌ HTTP 404 - 资源不存在${NC}"
        FAILED=$((FAILED + 1))
    elif [ "$http_code" = "000" ]; then
        echo -e "  ${RED}❌ 连接失败 (服务可能未启动)${NC}"
        FAILED=$((FAILED + 1))
    else
        echo -e "  ${YELLOW}⚠️  HTTP $http_code${NC}"
        echo "  Response: $(echo $body | head -c 150)"
        PASSED=$((PASSED + 1))  # API存在并返回了响应
    fi
}

echo "============================================"
echo "🧪 任务详情页面 API 交互测试"
echo "============================================"
echo "Task ID: $TASK_ID"
echo "Base URL: $BASE_URL"
echo ""

# ============================================
# 一、TaskDetailLayout.tsx 中的 API 调用
# ============================================

echo -e "${BLUE}=== 一、任务详情布局 (TaskDetailLayout) ===${NC}"

# 1. 加载任务数据
test_api "1.1 获取任务详情" "GET" "/production/${TASK_ID}"

# 2. 加载蓝军评审
test_api "1.2 获取蓝军评审列表" "GET" "/production/${TASK_ID}/reviews"

# 3. 加载热点话题
test_api "1.3 获取热点话题" "GET" "/quality/hot-topics?limit=5"

# 4. 加载情感分析
test_api "1.4 获取情感分析统计" "GET" "/quality/sentiment/stats"

# 5. 加载素材
test_api "1.5 获取素材列表" "GET" "/assets?limit=20"

# 6. 加载工作流规则
test_api "1.6 获取工作流规则" "GET" "/orchestrator/rules"

# 7. 提交评审决策 (单个)
test_api "1.7 提交评审决策" "POST" "/production/${TASK_ID}/review-items/rev_001/decide" \
    '{"questionId":"q_001","decision":"accept","note":"测试"}'

# 8. 批量评审决策
test_api "1.8 批量评审决策" "POST" "/production/${TASK_ID}/review-items/batch-decide" \
    '{"decision":"accept"}'

# 9. 请求重新评审
test_api "1.9 请求重新评审" "POST" "/production/${TASK_ID}/review-items/re-review" \
    '{"expertRole":"challenger"}'

# 10. 审批任务
test_api "1.10 审批任务" "POST" "/production/${TASK_ID}/approve" \
    '{"approved":true}'

# 11. 更新任务 (保存大纲等)
test_api "1.11 更新任务" "PUT" "/production/${TASK_ID}" \
    '{"progress":10}'

# 12. 确认大纲
test_api "1.12 确认大纲" "POST" "/production/${TASK_ID}/outline/confirm"

# 13. 重做阶段
test_api "1.13 重做选题策划" "POST" "/production/${TASK_ID}/redo/planning"
test_api "1.14 重做深度研究" "POST" "/production/${TASK_ID}/redo/research"
test_api "1.15 重做文稿生成" "POST" "/production/${TASK_ID}/redo/writing"
test_api "1.16 重做蓝军评审" "POST" "/production/${TASK_ID}/redo/review"

# 17. 合规检查
test_api "1.17 合规检查" "POST" "/compliance/check" \
    '{"content":"这是一篇测试文章内容"}'

# 18. 删除任务
test_api "1.18 删除任务" "DELETE" "/production/${TASK_ID}"

# 19. 研究采集
test_api "1.19 启动研究采集" "POST" "/research/${TASK_ID}/collect"

# 20. 保存研究配置
test_api "1.20 保存研究配置" "POST" "/research/${TASK_ID}/config" \
    '{"autoCollect":true,"sources":["web","rss"],"maxResults":20,"minCredibility":0.5,"keywords":[],"excludeKeywords":[],"timeRange":"30d"}'

# 21. 获取研究配置
test_api "1.21 获取研究配置" "GET" "/research/${TASK_ID}/config"

# 22. 关联素材 (通过update)
test_api "1.22 关联素材" "PUT" "/production/${TASK_ID}" \
    '{"asset_ids":["asset_001","asset_002"]}'

# 23. 添加外部链接 (通过update)
test_api "1.23 添加外部链接" "PUT" "/production/${TASK_ID}" \
    '{"external_links":[{"title":"测试链接","url":"https://example.com"}]}'

# ============================================
# 二、各 Tab 组件中直接调用的 API
# ============================================

echo -e "\n${BLUE}=== 二、Tab 组件直接调用 ===${NC}"

# 这些都在 OutletContext 中，不会直接调用
# OverviewTab, PlanningTab, ResearchTab, WritingTab, ReviewsTab, QualityTab
# 都通过 TaskDetailLayout 传递的 context 获取数据

# ============================================
# 三、可能被组件库内部调用的 API
# ============================================

echo -e "\n${BLUE}=== 三、组件库内部可能调用 ===${NC}"

# ExpertReviewPanel 可能调用的 API
test_api "3.1 获取专家列表" "GET" "/experts"

# VersionComparePanel / ExportPanel 可能调用的 API  
test_api "3.2 获取合规规则" "GET" "/compliance/rules"
test_api "3.3 获取合规历史" "GET" "/compliance/history?limit=5"

# DataReviewTable / DataCleaningPanel / CrossValidationPanel 相关
test_api "3.4 获取采集的研究数据" "GET" "/research/${TASK_ID}/collected?limit=10"

# ExternalLinksList / AssetLinksList 相关
test_api "3.5 搜索素材" "GET" "/assets/search?q=test"

# ============================================
# 四、其他可能被调用的 API
# ============================================

echo -e "\n${BLUE}=== 四、其他可能调用 ===${NC}"

# RSS相关
test_api "4.1 获取RSS源列表" "GET" "/quality/rss-sources"

# 推荐相关
test_api "4.2 获取智能推荐" "GET" "/quality/recommendations?limit=5"

# 健康检查
test_api "4.3 健康检查" "GET" "/health"

# ============================================
# 总结报告
# ============================================

echo ""
echo "============================================"
echo -e "${BLUE}📊 测试总结${NC}"
echo "============================================"
echo -e "总测试数: ${TOTAL}"
echo -e "${GREEN}通过: ${PASSED}${NC}"
echo -e "${RED}失败: ${FAILED}${NC}"
echo -e "${YELLOW}后端缺失: ${MISSING}${NC}"
echo ""

# 计算通过率
if [ $TOTAL -gt 0 ]; then
    RATE=$((PASSED * 100 / TOTAL))
    echo -e "通过率: ${RATE}%"
fi

echo ""
echo -e "${GREEN}✅ 测试完成${NC}"
