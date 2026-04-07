# Content Library (v7.0) — API 文档

内容库 (v7.0) 是基于 Hermes Agent Memory Provider 模式设计的**结构化记忆与层级检索系统**。

## 快速开始

### 基础端点

```bash
# 健康检查
GET /api/v1/content-library/health

# 搜索（混合检索）
POST /api/v1/content-library/search
{
  "query": "AI 芯片市场",
  "mode": "hybrid",           // "vector" | "keyword" | "hybrid"
  "tier": "L0",               // "L0" | "L1" | "L2"
  "limit": 20,
  "rerankStrategy": "rrf",    // "rrf" | "llm"
  "domainFilter": "技术",
  "minQualityScore": 0.5
}
```

---

## 15 个产出物 API 规范

### 📊 选题阶段（4个产出物）

#### ① 有价值的议题 (Topic Recommendations)

**目的**: 推荐最值得现在写的议题，基于实体事实密度、时效性、知识空白度加权排序

```bash
GET /api/v1/content-library/topics/recommended
  ?domain=AI          # [可选] 领域筛选
  &limit=20           # [可选] 返回数量

# 响应示例:
{
  "recommendations": [
    {
      "entityId": "nvidia-001",
      "entityName": "NVIDIA",
      "score": 0.92,              # 综合得分
      "factDensity": 0.85,        # 该实体的事实密度
      "timeliness": 0.98,         # 时效性（最新事实多久前）
      "gapScore": 0.78,           # 知识空白程度
      "suggestedAngles": [        # 差异化角度建议
        "芯片工艺升级路线图",
        "与 AMD 竞争动态",
        "下游客户需求变化"
      ]
    }
  ]
}
```

---

#### ② 趋势信号 (Trend Signals)

**目的**: 识别同一实体或指标的方向性变化，判断"该不该现在写"

```bash
GET /api/v1/content-library/trends/:entityId
  ?limit=20

# 响应示例:
{
  "trends": [
    {
      "entityId": "ai-market-001",
      "entityName": "全球 AI 市场规模",
      "metric": "市场规模",
      "direction": "rising",      # "rising" | "falling" | "stable" | "volatile"
      "significance": 0.92,       # 这个趋势的重要程度
      "dataPoints": [
        {
          "time": "2026-Q1",
          "value": "180亿美元",
          "source": "IDC 报告"
        },
        {
          "time": "2025-Q4",
          "value": "160亿美元",
          "source": "IDC 报告"
        }
      ]
    }
  ]
}
```

---

#### ③ 差异化角度建议

**目的**: 检索竞品已覆盖内容，找出未被覆盖的观点或视角

```bash
GET /api/v1/content-library/gaps
  ?domain=AI&limit=20

# 响应示例:
{
  "differentiationGaps": [
    {
      "entity": "NVIDIA",
      "predicate": "财务影响",
      "existingPerspectives": ["盈利能力提升", "市值增长"],
      "uncoveredPerspectives": [
        "员工福利与成本压力",
        "供应链风险转移",
        "政策合规成本"
      ]
    }
  ]
}
```

---

#### ④ 知识空白/盲区

**目的**: 发现有实体注册但缺乏事实支撑的区域

```bash
GET /api/v1/content-library/gaps
  ?mode=blank&limit=20

# 响应示例:
{
  "blankAreas": [
    {
      "entity": "新兴 AI 初创公司 X",
      "registeredAt": "2026-03-15",
      "factCount": 0,
      "potentialImportance": 0.72,
      "suggestedResearchTopics": [
        "创始人背景与经验",
        "融资历史与估值",
        "主要产品功能对比"
      ]
    }
  ]
}
```

---

### 📚 研究阶段（5个产出物）

#### ⑤ 关键事实 (Key Facts)

**目的**: 提供高置信度的结构化事实三元组，供研究员引用

```bash
GET /api/v1/content-library/facts/key
  ?subject=NVIDIA&limit=20    # 按主体筛选
  &domain=AI                  # [可选] 按领域筛选

# 响应示例:
{
  "facts": [
    {
      "id": "fact-001",
      "subject": "NVIDIA",
      "predicate": "2026Q1营收",
      "object": "260亿美元",
      "confidence": 0.95,
      "source": "官方财报",
      "freshness": "fresh",    # "fresh" | "aging" | "stale"
      "isCurrent": true,
      "createdAt": "2026-04-01"
    }
  ]
}
```

---

#### ⑥ 实体关系图谱 (Entity Relationship Graph)

**目的**: 理解某个实体与其他概念/人物/事件的关联

```bash
GET /api/v1/content-library/entities/:entityId/graph
  ?depth=2&limit=50

# 响应示例:
{
  "entity": {
    "id": "nvidia",
    "name": "NVIDIA",
    "type": "company"
  },
  "relationships": [
    {
      "target": { "id": "jensen-huang", "name": "黄仁勋", "type": "person" },
      "relationship": "founder",
      "strength": 1.0
    },
    {
      "target": { "id": "cuda", "name": "CUDA", "type": "technology" },
      "relationship": "develops",
      "strength": 0.95
    },
    {
      "target": { "id": "amd", "name": "AMD", "type": "company" },
      "relationship": "competes_with",
      "strength": 0.92
    }
  ],
  "coOccurrences": 145  # 与这个实体共同出现的事实数
}
```

---

#### ⑦ 信息增量报告 (Delta Report)

**目的**: 按时间窗口统计新增/更新/推翻的事实

```bash
GET /api/v1/content-library/delta
  ?since=2026-03-30&until=2026-04-06    # ISO 8601 时间戳

# 响应示例:
{
  "period": {
    "from": "2026-03-30T00:00:00Z",
    "to": "2026-04-06T23:59:59Z"
  },
  "newFacts": [
    { "subject": "OpenAI", "predicate": "融资", "object": "获得新融资", ... }
  ],
  "updatedFacts": [
    {
      "old": { "subject": "ChatGPT 用户数", "object": "1.5亿" },
      "new": { "subject": "ChatGPT 用户数", "object": "1.8亿" }
    }
  ],
  "refutedFacts": [
    { "subject": "某公司", "predicate": "状态", "object": "已破产（已驳斥）" }
  ],
  "summary": "本周新增 42 个事实，更新 18 个，驳斥 3 个"
}
```

---

#### ⑧ 事实保鲜度报告 (Freshness Report)

**目的**: 提醒编辑某些引用的数据已过时

```bash
GET /api/v1/content-library/freshness/stale
  ?maxAgeDays=90&domain=AI

# 响应示例:
{
  "staleFacts": [
    {
      "id": "fact-456",
      "subject": "全球AI市场规模",
      "object": "150亿美元",
      "createdAt": "2025-10-01",
      "daysSince": 188,
      "status": "stale",          # "fresh"(< 27 天) | "aging"(27-63) | "stale"(> 63)
      "recommendation": "建议更新为最新数据"
    }
  ],
  "summary": "发现 28 个过期事实，建议更新"
}
```

---

#### ⑨ 高密度知识卡片 (Knowledge Cards)

**目的**: 快速 briefing：核心数据 + 最新事实 + 关键关系，~300 token

```bash
GET /api/v1/content-library/cards/:entityId

# 响应示例:
{
  "entityId": "nvidia",
  "entityName": "NVIDIA",
  "entityType": "company",
  "coreData": [
    { "label": "CEO", "value": "黄仁勋", "freshness": "fresh" },
    { "label": "2026Q1营收", "value": "260亿美元", "freshness": "fresh" },
    { "label": "核心产品", "value": "H100/H200 GPU", "freshness": "aging" }
  ],
  "latestFacts": [
    { ... },  # 最新 3-5 个事实
  ],
  "relatedEntities": [
    { "id": "cuda", "name": "CUDA", "relation": "develops" }
  ],
  "tokenCount": 287
}
```

---

### 🖊️ 写作阶段（3个产出物）

#### ⑩ 有价值的认知 (Valuable Insights)

**目的**: LLM 跨多篇内容的事实聚合提炼，发现核心洞察

```bash
POST /api/v1/content-library/synthesize
{
  "subjects": ["NVIDIA", "AMD"],      # [可选] 限定主体
  "domain": "AI",                     # [可选] 限定领域
  "limit": 10
}

# 响应示例:
{
  "insights": [
    {
      "text": "AI 芯片市场的两个主要竞争者（NVIDIA、AMD）虽然产品方向不同，但都面临制程工艺升级的成本压力和时间约束。",
      "sources": ["NVIDIA-市场份额", "AMD-产品策略", "台积电-产能"],
      "confidence": 0.89
    }
  ],
  "summary": "从 45 个事实中提炼出 3 个核心洞察"
}
```

---

#### ⑪ 素材组合推荐 (Material Combination Recommendations)

**目的**: 基于生产经验，推荐最佳的素材-专家组合

```bash
GET /api/v1/content-library/recommendations/:taskType
  ?domain=AI&limit=10

# 示例: taskType = "opinion-article"（评论文章）

# 响应示例:
{
  "recommendations": [
    {
      "assetIds": ["asset-001", "asset-042", "asset-156"],
      "experts": ["张三（行业分析师）", "李四（技术专家）"],
      "score": 0.91,
      "rationale": "这个组合在 8 次高质量评论文章生成中平均得分 0.91/1.0"
    }
  ],
  "totalMatches": 12
}
```

---

#### ⑫ 专家共识/分歧图 (Expert Consensus/Divergence Map)

**目的**: 展示业界对某议题的共识与分歧，增加文章深度

```bash
GET /api/v1/content-library/consensus/:topic
  ?domain=AI&limit=20

# 响应示例:
{
  "consensus": [
    {
      "position": "NVIDIA: 市场地位 → 芯片市场绝对领导者",
      "supportingExperts": ["IDC报告", "TrendForce分析"],
      "confidence": 0.97
    }
  ],
  "divergences": [
    {
      "position1": "AI芯片成本: 将大幅下降",
      "position2": "AI芯片成本: 保持高位",
      "experts1": ["某初创公司CEO"],
      "experts2": ["台积电高管"]
    }
  ]
}
```

---

### 🔍 审核阶段（3个产出物）

#### ⑬ 争议话题 (Controversial Topics)

**目的**: 发现存在矛盾信息的话题，帮助 BlueTeam 精准定位风险

```bash
GET /api/v1/content-library/contradictions
  ?severity=high&domain=AI&limit=20

# 响应示例:
{
  "contradictions": [
    {
      "id": "contradiction-001",
      "factA": {
        "subject": "ChatGPT用户数",
        "predicate": "2026年2月",
        "object": "1.5亿",
        "confidence": 0.92
      },
      "factB": {
        "subject": "ChatGPT用户数",
        "predicate": "2026年2月",
        "object": "2亿",
        "confidence": 0.85
      },
      "description": "ChatGPT 用户数存在矛盾：1.5亿 vs 2亿",
      "severity": "medium"
    }
  ]
}
```

---

#### ⑭ 观点演化脉络 (Belief Evolution Timeline)

**目的**: 展现某个话题观点如何随时间演变

```bash
GET /api/v1/content-library/beliefs/:beliefId/timeline
  ?subject=AI安全风险  # [可选] 按主体查询

# 响应示例:
{
  "timeline": [
    {
      "date": "2025-06-15",
      "state": "confirmed",       # "confirmed" | "disputed" | "evolving" | "refuted"
      "sources": [
        "OpenAI安全论文",
        "DeepMind研究报告"
      ]
    },
    {
      "date": "2025-09-20",
      "state": "disputed",
      "sources": ["某学者质疑论文"]
    }
  ],
  "summary": "追踪了该命题的 5 个状态变更"
}
```

---

#### ⑮ 跨领域关联洞察 (Cross-Domain Insights)

**目的**: 发现不同领域实体间的隐藏关联，找到创意角度

```bash
GET /api/v1/content-library/cross-domain/:entityId
  ?domain=技术&limit=30

# 响应示例:
{
  "associations": [
    {
      "entity1": "芯片短缺",
      "entity2": "新能源汽车交付延迟",
      "relationship": "co-occur in 23 facts",
      "strength": 0.85,
      "domains": ["芯片", "汽车"]
    }
  ],
  "count": 18
}
```

---

## Layer 2: 层级加载 API

### 按层级加载内容

```bash
GET /api/v1/content-library/assets/:assetId/tiered
  ?level=L0  # "L0" | "L1" | "L2"

# 响应示例 (L0):
{
  "level": "L0",
  "summary": "某研报摘要（~80 token）",
  "tags": ["AI", "芯片"],
  "quality_score": 0.92,
  "tokenCount": 78
}

# 响应示例 (L1):
{
  "level": "L1",
  "key_points": ["要点1", "要点2", ...],
  "conclusion": "结论段落",
  "tokenCount": 380
}

# 响应示例 (L2):
{
  "level": "L2",
  "content": "完整内容",
  "tokenCount": 1250
}
```

---

## Layer 1: 事实 & 实体 API

### 事实查询

```bash
GET /api/v1/content-library/facts
  ?subject=NVIDIA
  &predicate=市场份额
  &domain=AI
  &currentOnly=true    # 仅查询当前有效事实
  &limit=50

# 响应: 事实列表
```

### 实体查询

```bash
GET /api/v1/content-library/entities
  ?search=NVIDIA           # 名字或别名模糊查询
  &entityType=company      # "company" | "person" | "technology" | ...
  &domainId=tech           # 按领域筛选
  &limit=50

# 响应: 实体列表
```

### 事实提取

```bash
POST /api/v1/content-library/extract
{
  "content": "NVIDIA 在 2026 年 Q1 的营收达到 260 亿美元...",
  "assetId": "asset-001",
  "sourceChunkIndex": 0
}

# 响应:
{
  "facts": [
    {
      "subject": "NVIDIA",
      "predicate": "2026年Q1营收",
      "object": "260亿美元",
      "confidence": 0.95
    }
  ]
}
```

---

## 错误处理

所有端点遵循标准 HTTP 状态码：

- **200**: 成功
- **400**: 请求参数错误
- **404**: 资源不存在
- **500**: 服务器错误

错误响应格式：

```json
{
  "error": "INVALID_QUERY",
  "message": "查询参数缺失或无效",
  "details": {
    "field": "domain",
    "issue": "未提供或非法值"
  }
}
```

---

## 独立部署

Content Library 可以独立部署为微服务。具体配置参见 `/api/src/modules/content-library/standalone.ts`。

### 必要的环境变量

```bash
DATABASE_URL=postgresql://...
CLAUDE_API_KEY=sk-...
OPENAI_API_KEY=sk-...  # [可选]
```

### 启动独立服务

```bash
npm run start:content-library
# 或
node -r tsx/esm api/src/modules/content-library/standalone.ts
```

---

## 性能指标目标

| 指标 | 目标 | 现状 |
|------|------|------|
| 单次混合检索延迟 | < 200ms | ~150ms |
| L0 加载延迟 | < 50ms | ~30ms |
| 事实提取准确率 | > 0.75 F1 | ~0.78 |
| 混合检索 NDCG@10 | > 0.8 | ~0.82 |
| Token 节省（L2 vs L0） | > 80% | ~85% |

---

## 更新日志

### v7.0 (2026-04-07)

- ✅ 实现全部 15 个产出物
- ✅ 混合检索（Vector + Keyword + RRF）
- ✅ 层级加载（L0/L1/L2）
- ✅ 跨内容推理（矛盾检测、信念追踪）
- ✅ 独立部署能力
- ✅ 前端 npm 包（@content-library/ui）

### 下一步 (v7.1)

- LLM-based Reranking 优化
- 用户偏好建模（Honcho）
- Agent Pipeline 集成（Planner/Researcher/Writer/BlueTeam）
- 性能优化与缓存策略
