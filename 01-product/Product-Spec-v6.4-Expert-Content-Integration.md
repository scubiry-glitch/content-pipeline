# 产品需求文档: 专家与内容深度整合 v6.4

**版本**: v6.4  
**日期**: 2026-03-27  
**状态**: 📝 需求文档  
**负责人**: 产品研发运营协作体系  
**依赖**: v6.1-v6.3 (RSS/Assets AI处理、统一分类、自动评审)  
**优先级**: P0  

---

## 1. 文档概述

### 1.1 背景

当前系统存在专家体系与内容体系的割裂：

- **专家知识图谱** (`/expert-knowledge-graph`) 展示专家关系，但与 RSS/Assets 内容无直接关联
- **专家对比** (`/expert-comparison`) 基于固定话题，无法动态关联实时热点
- **专家网络** (`/expert-network`) 展示专家影响力，但缺乏与内容质量的关联分析
- **v6.3 自动专家评审** 产生大量评审数据，但未反哺专家画像和内容推荐

### 1.2 目标

建立**专家-内容双向增强体系**，实现：

1. **内容驱动专家洞察**: RSS/Assets 热点内容自动触发专家观点生成
2. **专家增强内容质量**: 专家评审数据反哺内容评分和推荐排序
3. **知识图谱融合**: 专家知识图谱与内容知识图谱统一
4. **动态专家匹配**: 基于实时内容和专家历史表现动态优化匹配

### 1.3 设计原则

```
┌─────────────────────────────────────────────────────────────────┐
│                  v6.4 专家-内容双向增强体系                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   ┌──────────────┐         内容驱动          ┌──────────────┐  │
│   │              │ ────────────────────────→ │              │  │
│   │  RSS/Assets  │                           │   专家体系    │  │
│   │   内容池     │ ←──────────────────────── │              │  │
│   │              │         专家增强          │              │  │
│   └──────────────┘                           └──────────────┘  │
│          │                                          │          │
│          │                                          │          │
│          ▼                                          ▼          │
│   ┌──────────────────────────────────────────────────────┐   │
│   │              统一知识图谱 (Knowledge Graph)             │   │
│   │  节点: 专家 | 内容 | 领域 | 话题 | 观点 | 实体          │   │
│   │  边:   创作 | 评审 | 引用 | 关联 | 影响 | 相似          │   │
│   └──────────────────────────────────────────────────────┘   │
│                                                                 │
│   应用场景:                                                      │
│   • 热点内容 → 自动匹配相关专家 → 生成专家观点                   │
│   • 专家评审 → 反馈优化内容评分 → 影响推荐排序                   │
│   • 内容浏览 → 展示相关专家网络 → 提供深度解读                   │
│   • 专家页面 → 展示专家内容足迹 → 量化专家价值                   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 1.4 成功标准

| 指标 | 现状 | 目标 | 验证方式 |
|------|------|------|---------|
| 内容-专家关联覆盖率 | < 20% | > 80% | 内容关联专家比例 |
| 专家观点生成自动化率 | 人工 100% | 自动 > 70% | 自动/人工观点比例 |
| 专家评审数据利用率 | 无 | > 90% | 评审数据反馈到内容评分 |
| 专家匹配准确率 | 60% | > 90% | 专家评审准确率统计 |
| 用户专家互动率 | < 5% | > 20% | 专家卡片点击率 |
| 内容通过专家审核率 | 无 | > 75% | 评审通过占比 |

---

## 2. 功能设计

### 2.1 内容驱动的专家洞察生成 (FR-6.4-001)

#### 2.1.1 功能概述

RSS/Assets 内容经 v6.3 统一分类后，自动匹配相关专家，生成专家观点和洞察。

```
┌─────────────────────────────────────────────────────────────────┐
│                    专家洞察自动生成流程                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   RSS/Assets 内容                                                │
│       │                                                         │
│       ▼                                                         │
│   v6.3 统一分类 (D07 人工智能)                                   │
│       │                                                         │
│       ▼                                                         │
│   ┌─────────────────┐                                           │
│   │  专家匹配引擎    │ ──→ 匹配 D07 领域专家                     │
│   │  (结合历史表现)  │                                           │
│   └─────────────────┘                                           │
│       │                                                         │
│       ▼                                                         │
│   ┌─────────────────┐                                           │
│   │  专家观点生成    │ ──→ 基于内容生成专家视角解读               │
│   │  (LLM + 专家人设)│                                           │
│   └─────────────────┘                                           │
│       │                                                         │
│       ▼                                                         │
│   ┌─────────────────┐                                           │
│   │  专家审核确认    │ ──→ 专家确认/修改/拒绝                     │
│   │  (异步流程)      │                                           │
│   └─────────────────┘                                           │
│       │                                                         │
│       ▼                                                         │
│   展示到: Dashboard / 内容详情页 / 热点话题页                      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

#### 2.1.2 专家匹配策略

```typescript
interface ExpertInsightMatching {
  // 匹配维度
  dimensions: {
    // 1. 领域匹配 (权重 40%)
    domainMatch: {
      expertDomain: string;      // 专家领域 D07
      contentDomain: string;     // 内容分类 D07
      score: number;             // 1.0 = 完全匹配
    };
    
    // 2. 主题匹配 (权重 30%)
    themeMatch: {
      expertThemes: string[];    // 专家专长主题
      contentTheme: string;      // 内容主题
      score: number;
    };
    
    // 3. 历史表现 (权重 20%)
    historicalPerformance: {
      reviewAccuracy: number;    // 历史评审准确率
      acceptanceRate: number;    // 观点采纳率
      avgResponseTime: number;   // 平均响应时间
      score: number;
    };
    
    // 4. 实时负载 (权重 10%)
    workload: {
      pendingReviews: number;    // 待评审数
      recentActivity: number;    // 近期活跃度
      score: number;
    };
  };
  
  // 综合匹配分数
  matchScore: number;
  
  // 匹配理由
  reason: string;
}

// 专家匹配算法
function calculateExpertMatchScore(
  expert: Expert, 
  content: ClassifiedContent,
  history: ExpertHistory
): number {
  const weights = {
    domain: 0.4,
    theme: 0.3,
    performance: 0.2,
    workload: 0.1
  };
  
  // 领域匹配
  const domainScore = expert.unifiedDomainCode === content.domainCode ? 1.0 : 0.0;
  
  // 主题匹配 (Jaccard 相似度)
  const expertThemes = new Set(expert.unifiedThemeCodes || []);
  const contentTheme = new Set([content.themeCode]);
  const intersection = new Set([...expertThemes].filter(x => contentTheme.has(x)));
  const themeScore = intersection.size / Math.max(expertThemes.size, contentTheme.size);
  
  // 历史表现
  const performanceScore = (
    history.reviewAccuracy * 0.4 +
    history.acceptanceRate * 0.4 +
    Math.max(0, 1 - history.avgResponseTime / 24) * 0.2  // 响应时间越短越好
  );
  
  // 负载均衡 (待评审数越少越好)
  const workloadScore = Math.max(0, 1 - history.pendingReviews / 10);
  
  return (
    domainScore * weights.domain +
    themeScore * weights.theme +
    performanceScore * weights.performance +
    workloadScore * weights.workload
  );
}
```

#### 2.1.3 专家观点生成

```typescript
interface ExpertInsightGeneration {
  // 输入
  content: {
    title: string;
    summary: string;
    keyPoints: string[];
    domainCode: string;
    themeCode: string;
  };
  expert: Expert;
  
  // 输出
  insight: {
    id: string;
    contentId: string;
    expertId: string;
    
    // 观点内容
    opinion: string;           // 专家核心观点 (200-500字)
    keyTakeaways: string[];    // 关键要点 (3-5条)
    
    // 差异化视角
    uniqueAngle: string;       // 与其他专家的不同视角
    riskWarning?: string;      // 风险提示
    opportunity?: string;      // 机会点
    
    // 元数据
    confidence: number;        // AI 生成置信度
    generatedAt: string;
    expertConfirmed: boolean;  // 专家是否确认
    expertEdited: boolean;     // 专家是否修改
  };
}

// AI Prompt 模板
const EXPERT_INSIGHT_PROMPT = `
你是一位{expertName}，{expertProfile}。

你的核心观点风格：
{expertPhilosophy}

请基于以下热点内容，生成你的专业观点：

【热点内容】
标题: {contentTitle}
摘要: {contentSummary}
关键要点: {contentKeyPoints}

【输出要求】
1. 核心观点 (200-500字)
   - 基于你的专业视角解读该热点
   - 体现你的独特洞察
   - 语言风格符合你的人设

2. 关键要点 (3-5条)
   - 简明扼要的观点提炼

3. 风险提示 (如适用)
   - 该热点的潜在风险

4. 机会点 (如适用)
   - 值得关注的投资/商业机会

【输出格式】
{
  "opinion": "核心观点文本",
  "keyTakeaways": ["要点1", "要点2", "要点3"],
  "riskWarning": "风险提示文本",
  "opportunity": "机会点文本"
}
`;
```

#### 2.1.4 数据模型

```sql
-- ============================================
-- 专家洞察表
-- ============================================
CREATE TABLE expert_insights (
  id VARCHAR(50) PRIMARY KEY,
  
  -- 关联内容
  source_type VARCHAR(20) NOT NULL,  -- rss/asset
  source_id VARCHAR(50) NOT NULL,
  
  -- 关联专家
  expert_id VARCHAR(50) NOT NULL REFERENCES experts(id),
  
  -- 统一分类
  unified_domain_code VARCHAR(10) REFERENCES unified_domains(code),
  unified_theme_code VARCHAR(10) REFERENCES unified_themes(code),
  
  -- 洞察内容
  opinion TEXT NOT NULL,
  key_takeaways TEXT[] DEFAULT '{}',
  unique_angle TEXT,
  risk_warning TEXT,
  opportunity TEXT,
  
  -- 生成信息
  generation_method VARCHAR(20) DEFAULT 'ai',  -- ai/expert/hybrid
  ai_confidence DECIMAL(3,2),
  generated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- 专家确认
  expert_confirmed BOOLEAN DEFAULT FALSE,
  expert_edited BOOLEAN DEFAULT FALSE,
  confirmed_at TIMESTAMP WITH TIME ZONE,
  
  -- 反馈统计
  view_count INTEGER DEFAULT 0,
  like_count INTEGER DEFAULT 0,
  quote_count INTEGER DEFAULT 0,
  
  -- 状态
  status VARCHAR(20) DEFAULT 'pending',  -- pending/confirmed/rejected/published
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_ei_source ON expert_insights(source_type, source_id);
CREATE INDEX idx_ei_expert ON expert_insights(expert_id);
CREATE INDEX idx_ei_domain ON expert_insights(unified_domain_code);
CREATE INDEX idx_ei_status ON expert_insights(status);
CREATE INDEX idx_ei_created ON expert_insights(created_at DESC);

-- ============================================
-- 专家-内容关联表 (用于知识图谱)
-- ============================================
CREATE TABLE expert_content_relations (
  id SERIAL PRIMARY KEY,
  expert_id VARCHAR(50) NOT NULL REFERENCES experts(id),
  content_type VARCHAR(20) NOT NULL,  -- rss/asset
  content_id VARCHAR(50) NOT NULL,
  
  -- 关联类型
  relation_type VARCHAR(20) NOT NULL,  -- insight/review/quote/mention
  
  -- 关联强度
  strength DECIMAL(3,2),  // 0-1
  
  -- 统一分类
  unified_domain_code VARCHAR(10),
  
  -- 元数据
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(expert_id, content_type, content_id, relation_type)
);

CREATE INDEX idx_ecr_expert ON expert_content_relations(expert_id);
CREATE INDEX idx_ecr_content ON expert_content_relations(content_type, content_id);
CREATE INDEX idx_ecr_type ON expert_content_relations(relation_type);
```

---

### 2.2 专家评审数据反馈体系 (FR-6.4-002)

#### 2.2.1 功能概述

将 v6.3 自动专家评审的数据反馈到内容评分、专家画像、推荐排序中。

```
┌─────────────────────────────────────────────────────────────────┐
│                   专家评审数据反馈体系                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   专家评审结果                                                   │
│       │                                                         │
│       ├──→ 内容质量评分调整                                      │
│       │       ├── 原始 AI 评分                                   │
│       │       ├── 专家评审分数                                   │
│       │       └── 加权综合评分                                   │
│       │                                                         │
│       ├──→ 专家画像更新                                          │
│       │       ├── 评审准确率                                     │
│       │       ├── 领域专业度                                     │
│       │       └── 观点采纳率                                     │
│       │                                                         │
│       ├──→ 推荐排序优化                                          │
│       │       ├── 高质量内容优先                                 │
│       │       ├── 专家认可内容加权                               │
│       │       └── 低质量内容降权                                 │
│       │                                                         │
│       └──→ 知识图谱边权重更新                                    │
│               ├── 专家-内容关联强度                              │
│               └── 内容-内容相似度                                │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

#### 2.2.2 内容质量评分调整

```typescript
interface ContentQualityAdjustment {
  // 原始评分
  originalScore: {
    aiQualityScore: number;      // v6.1/v6.2 AI 评分
    hotScore: number;            // 热度分数
  };
  
  // 专家评审评分
  expertReviewScore: {
    overall: number;             // 综合评分
    dimensions: Record<string, number>;  // 各维度评分
    confidence: number;          // 评审置信度
  };
  
  // 调整后评分
  adjustedScore: {
    final: number;               // 最终评分
    formula: string;             // 计算公式
    
    // 评分权重配置
    weights: {
      aiQuality: number;         // AI 评分权重 (默认 0.4)
      expertReview: number;      // 专家评审权重 (默认 0.5)
      hotScore: number;          // 热度权重 (默认 0.1)
    };
  };
}

// 评分计算公式
function calculateAdjustedQualityScore(
  aiScore: number,
  expertScore: number,
  hotScore: number,
  config: ScoreConfig
): number {
  // 如果专家评审置信度高，增加专家权重
  const expertWeight = config.expertConfidence > 0.8 
    ? config.weights.expertReview * 1.2 
    : config.weights.expertReview;
  
  const aiWeight = config.weights.aiQuality;
  const hotWeight = config.weights.hotScore;
  
  // 归一化权重
  const totalWeight = aiWeight + expertWeight + hotWeight;
  
  return Math.round(
    (aiScore * aiWeight + 
     expertScore * expertWeight + 
     hotScore * hotWeight) / totalWeight
  );
}
```

#### 2.2.3 专家画像更新

```typescript
interface ExpertProfileUpdate {
  expertId: string;
  
  // 评审历史统计
  reviewStats: {
    totalReviews: number;           // 总评审数
    avgReviewScore: number;         // 平均评分
    reviewAccuracy: number;         // 评审准确率 (与其他专家一致性)
    
    // 领域专业度
    domainProficiency: Record<string, {
      domainCode: string;
      reviewCount: number;
      avgScore: number;
      accuracy: number;
    }>;
    
    // 观点采纳率
    insightStats: {
      totalInsights: number;
      confirmedInsights: number;    // 专家确认的观点
      adoptedInsights: number;      // 被内容引用的观点
      avgLikes: number;             // 平均点赞数
    };
    
    // 响应速度
    responseTimeStats: {
      avgAcceptanceTime: number;    // 平均接受评审时间 (小时)
      avgCompletionTime: number;    // 平均完成评审时间 (小时)
    };
  };
  
  // 更新后专家标签
  updatedTags: string[];
  
  // 专家等级调整建议
  levelAdjustment?: {
    currentLevel: string;
    suggestedLevel: string;
    reason: string;
  };
}
```

---

### 2.3 融合知识图谱 (FR-6.4-003)

#### 2.3.1 功能概述

将专家知识图谱与内容知识图谱融合，构建统一的知识图谱。

```typescript
// 统一知识图谱节点类型
interface KnowledgeGraphNode {
  id: string;
  type: 'expert' | 'content' | 'domain' | 'theme' | 'concept' | 'entity';
  label: string;
  
  // 类型-specific 属性
  properties: {
    // Expert 节点
    expertLevel?: string;
    domainCode?: string;
    acceptanceRate?: number;
    
    // Content 节点
    contentType?: 'rss' | 'asset';
    qualityScore?: number;
    hotScore?: number;
    publishedAt?: string;
    
    // Domain/Theme 节点
    code?: string;
    description?: string;
    
    // Concept/Entity 节点
    entityType?: string;
    aliases?: string[];
  };
  
  // 可视化属性
  visual: {
    size: number;
    color: string;
    icon?: string;
  };
}

// 统一知识图谱边类型
interface KnowledgeGraphEdge {
  id: string;
  source: string;      // 源节点 ID
  target: string;      // 目标节点 ID
  type: 'reviewed' | 'generated_insight' | 'belongs_to' | 'related_to' | 'quoted' | 'similar_to';
  
  properties: {
    weight: number;    // 边权重 0-1
    timestamp?: string;
    metadata?: any;
  };
}

// 知识图谱构建服务
class UnifiedKnowledgeGraphService {
  // 构建完整知识图谱
  async buildGraph(options: GraphBuildOptions): Promise<KnowledgeGraph> {
    const nodes: KnowledgeGraphNode[] = [];
    const edges: KnowledgeGraphEdge[] = [];
    
    // 1. 添加领域/主题节点
    const domains = await this.getUnifiedDomains();
    nodes.push(...domains.map(d => this.createDomainNode(d)));
    
    // 2. 添加专家节点
    const experts = await this.getExperts();
    nodes.push(...experts.map(e => this.createExpertNode(e)));
    
    // 3. 添加内容节点
    const contents = await this.getContents(options);
    nodes.push(...contents.map(c => this.createContentNode(c)));
    
    // 4. 添加概念/实体节点 (从内容中提取)
    const entities = await this.extractEntities(contents);
    nodes.push(...entities.map(e => this.createEntityNode(e)));
    
    // 5. 构建边关系
    edges.push(...await this.buildExpertDomainEdges(experts, domains));
    edges.push(...await this.buildExpertContentEdges(experts, contents));
    edges.push(...await this.buildContentDomainEdges(contents, domains));
    edges.push(...await this.buildContentEntityEdges(contents, entities));
    edges.push(...await this.buildSimilarityEdges(contents));
    
    return { nodes, edges };
  }
  
  // 计算节点中心性 (用于影响力分析)
  async calculateCentrality(nodeId: string): Promise<CentralityMetrics> {
    // PageRank 算法
    const pageRank = await this.calculatePageRank(nodeId);
    
    // 度中心性
    const degree = await this.calculateDegreeCentrality(nodeId);
    
    // 中介中心性
    const betweenness = await this.calculateBetweennessCentrality(nodeId);
    
    return { pageRank, degree, betweenness };
  }
}
```

#### 2.3.2 可视化设计

```typescript
// 知识图谱可视化配置
interface GraphVisualizationConfig {
  // 布局算法
  layout: {
    type: 'force' | 'circular' | 'hierarchical' | 'domain-clustered';
    options: {
      nodeSpacing?: number;
      edgeLength?: number;
      gravity?: number;
    };
  };
  
  // 节点样式
  nodeStyles: {
    expert: {
      shape: 'circle';
      sizeRange: [20, 60];  // 基于影响力
      colorBy: 'domain' | 'level' | 'accuracy';
    };
    content: {
      shape: 'rect';
      sizeRange: [15, 40];  // 基于质量+热度
      colorBy: 'domain' | 'quality' | 'type';
    };
    domain: {
      shape: 'hexagon';
      size: 50;
      fixedColor: string;
    };
  };
  
  // 交互配置
  interactions: {
    click: 'focus' | 'detail-panel' | 'navigate';
    hover: 'highlight' | 'tooltip';
    drag: 'pan' | 'node-move';
    zoom: boolean;
  };
  
  // 过滤配置
  filters: {
    domains: string[];
    expertLevels: string[];
    contentTypes: string[];
    dateRange: [Date, Date];
    minQualityScore: number;
  };
}
```

---

### 2.4 动态专家匹配优化 (FR-6.4-004)

#### 2.4.1 功能概述

基于专家历史表现和内容特征，动态优化 v6.3 的自动专家评审匹配。

```typescript
interface DynamicExpertMatching {
  // 实时匹配优化
  async optimizeMatching(
    content: ClassifiedContent,
    candidateExperts: Expert[]
  ): Promise<OptimizedMatch[]> {
    
    // 1. 基础匹配分数 (v6.3 逻辑)
    const baseScores = await this.calculateBaseScores(content, candidateExperts);
    
    // 2. 历史表现加权
    const performanceWeighted = await this.applyPerformanceWeight(
      baseScores, 
      content.domainCode
    );
    
    // 3. 实时负载均衡
    const loadBalanced = await this.applyLoadBalancing(performanceWeighted);
    
    // 4. 多样性优化 (避免总是匹配同一批专家)
    const diversified = await this.applyDiversityOptimization(
      loadBalanced,
      content.id
    );
    
    // 5. A/B 测试支持
    const abTestVariant = await this.getABTestVariant('expert_matching');
    if (abTestVariant === 'exploration') {
      // 探索模式：引入部分新专家
      return this.addExplorationExperts(diversified, 0.2);
    }
    
    return diversified;
  }
  
  // 历史表现加权
  private async applyPerformanceWeight(
    matches: ExpertMatch[],
    domainCode: string
  ): Promise<ExpertMatch[]> {
    return Promise.all(
      matches.map(async match => {
        const performance = await this.getExpertDomainPerformance(
          match.expertId, 
          domainCode
        );
        
        // 表现好的专家获得分数加成
        const performanceBonus = performance.accuracy * 0.2;
        
        return {
          ...match,
          score: match.score * (1 + performanceBonus),
          performanceMetrics: performance
        };
      })
    );
  }
  
  // 多样性优化
  private async applyDiversityOptimization(
    matches: ExpertMatch[],
    contentId: string
  ): Promise<ExpertMatch[]> {
    // 获取该内容近期匹配过的专家
    const recentlyMatched = await this.getRecentlyMatchedExperts(contentId, 7);
    
    // 降低近期匹配过的专家的分数
    return matches.map(match => {
      const daysSinceLastMatch = recentlyMatched[match.expertId];
      if (daysSinceLastMatch !== undefined) {
        const recencyPenalty = Math.max(0, 1 - daysSinceLastMatch / 7) * 0.3;
        return { ...match, score: match.score * (1 - recencyPenalty) };
      }
      return match;
    });
  }
}
```

---

## 3. 与现有页面整合

### 3.1 ExpertKnowledgeGraph 增强

```typescript
// 增强后的知识图谱页面
interface EnhancedKnowledgeGraphPage {
  // 视图模式
  viewModes: {
    'expert-only': '仅展示专家网络 (原功能)';
    'content-only': '仅展示内容网络';
    'unified': '统一知识图谱 (专家+内容)';
    'domain-cluster': '按领域聚类';
    'time-evolution': '时间演化视图';
  };
  
  // 新增功能
  features: {
    // 点击专家节点 → 展示专家洞察列表
    expertInsightsPanel: {
      enabled: boolean;
      showRecentInsights: number;  // 显示最近 N 条洞察
      showReviewHistory: boolean;
    };
    
    // 点击内容节点 → 展示内容关联专家
    contentExpertsPanel: {
      enabled: boolean;
      showMatchedExperts: boolean;
      showGeneratedInsights: boolean;
    };
    
    // 实时热点模式
    hotTopicsMode: {
      enabled: boolean;
      autoRefreshInterval: number;  // 秒
      highlightThreshold: number;   // 热度阈值
    };
    
    // 路径发现
    pathFinder: {
      enabled: boolean;
      findPaths: (from: string, to: string) => PathResult;
    };
  };
}
```

### 3.2 ExpertComparison 增强

```typescript
// 增强后的专家对比页面
interface EnhancedExpertComparisonPage {
  // 话题来源增强
  topicSources: {
    'preset': '预设话题 (原功能)';
    'hot-rss': 'RSS 热点自动提取';
    'hot-assets': 'Assets 热点自动提取';
    'custom': '用户自定义话题';
    'ai-suggested': 'AI 推荐话题 (基于当前热点)';
  };
  
  // 对比维度增强
  comparisonDimensions: {
    // 原有维度
    opinion: '观点对比';
    style: '风格对比';
    stats: '统计数据对比';
    
    // 新增维度
    contentOverlap: '内容覆盖度对比 (都评审过哪些内容)';
    agreementRate: '观点一致率对比 (在相同内容上的观点一致性)';
    complementary: '互补性分析 (在哪些领域可以互补)';
    influence: '影响力对比 (知识图谱中心性)';
  };
  
  // 智能推荐
  smartRecommendations: {
    // 推荐对比专家组合
    suggestExpertPairs: (topic: string) => Promise<ExpertPairSuggestion[]>;
    
    // 推荐对比话题
    suggestTopics: (expertIds: string[]) => Promise<TopicSuggestion[]>;
  };
}
```

### 3.3 ExpertNetwork 增强

```typescript
// 增强后的专家网络页面
interface EnhancedExpertNetworkPage {
  // 网络视图增强
  networkViews: {
    'collaboration': '协作网络 (原功能)';
    'influence': '影响力网络';
    'knowledge-flow': '知识流动网络 (观点如何在专家间传播)';
    'content-driven': '内容驱动网络 (基于共同评审内容)';
  };
  
  // 节点大小维度选项
  nodeSizeMetrics: {
    'acceptance-rate': '采纳率 (原功能)';
    'review-count': '评审数量';
    'insight-count': '洞察生成数量';
    'pagerank': 'PageRank 中心性';
    'domain-coverage': '领域覆盖度';
  };
  
  // 实时数据
  realTimeStats: {
    activeExperts: number;      // 当前活跃专家数
    reviewsToday: number;       // 今日评审数
    insightsGenerated: number;  // 今日洞察生成数
    avgResponseTime: number;    // 平均响应时间
  };
}
```

---

## 4. 技术实现

### 4.1 核心服务

```typescript
// 专家-内容整合服务
class ExpertContentIntegrationService {
  constructor(
    private knowledgeGraph: UnifiedKnowledgeGraphService,
    private expertInsight: ExpertInsightService,
    private reviewFeedback: ReviewFeedbackService,
    private dynamicMatching: DynamicExpertMatchingService
  ) {}
  
  // 主流程：内容分类后调用
  async onContentClassified(content: ClassifiedContent): Promise<void> {
    // 1. 匹配专家并生成洞察
    await this.expertInsight.generateAndAssignInsight(content);
    
    // 2. 更新知识图谱
    await this.knowledgeGraph.addContentNode(content);
    
    // 3. 触发自动评审 (v6.3)
    // (已在 v6.3 中实现)
  }
  
  // 评审完成后调用
  async onReviewCompleted(review: ExpertReview): Promise<void> {
    // 1. 更新内容评分
    await this.reviewFeedback.adjustContentScore(review);
    
    // 2. 更新专家画像
    await this.reviewFeedback.updateExpertProfile(review);
    
    // 3. 更新知识图谱边权重
    await this.knowledgeGraph.updateEdgeWeight(
      review.expertId,
      review.contentId,
      review.score
    );
    
    // 4. 重新计算专家中心性
    await this.knowledgeGraph.recalculateCentrality(review.expertId);
  }
}
```

### 4.2 API 接口

```typescript
// ==================== 专家洞察 API ====================

// GET /api/v1/expert-insights
// 获取专家洞察列表
interface ListExpertInsightsRequest {
  sourceType?: 'rss' | 'asset';
  domainCode?: string;
  expertId?: string;
  status?: 'pending' | 'confirmed' | 'published';
  limit?: number;
}

// POST /api/v1/expert-insights/generate
// 为指定内容生成专家洞察
interface GenerateInsightRequest {
  sourceType: 'rss' | 'asset';
  sourceId: string;
  expertIds?: string[];  // 指定专家，不传则自动匹配
}

// POST /api/v1/expert-insights/:id/confirm
// 专家确认洞察
interface ConfirmInsightRequest {
  confirmed: boolean;
  editedContent?: string;  // 修改后的内容
}

// ==================== 知识图谱 API ====================

// GET /api/v1/knowledge-graph
// 获取统一知识图谱
interface GetKnowledgeGraphRequest {
  viewMode: 'unified' | 'expert-only' | 'content-only';
  domains?: string[];
  dateRange?: [string, string];
  minQualityScore?: number;
}

interface GetKnowledgeGraphResponse {
  nodes: KnowledgeGraphNode[];
  edges: KnowledgeGraphEdge[];
  stats: {
    nodeCount: number;
    edgeCount: number;
    domainDistribution: Record<string, number>;
  };
}

// GET /api/v1/knowledge-graph/nodes/:id/related
// 获取相关节点

// GET /api/v1/knowledge-graph/shortest-path
// 计算最短路径
interface ShortestPathRequest {
  from: string;  // 节点 ID
  to: string;
}

// ==================== 专家-内容关联 API ====================

// GET /api/v1/experts/:id/contents
// 获取专家关联的内容
interface GetExpertContentsRequest {
  relationType?: 'insight' | 'review' | 'all';
  limit?: number;
}

// GET /api/v1/contents/:id/experts
// 获取内容关联的专家

// ==================== 智能推荐 API ====================

// GET /api/v1/expert-insights/recommendations
// 获取推荐洞察 (用于 Dashboard)
interface GetRecommendedInsightsResponse {
  items: {
    insight: ExpertInsight;
    content: ContentSummary;
    expert: ExpertSummary;
    relevanceScore: number;
  }[];
}
```

---

## 5. 实施计划

### 5.1 Phase 1: 数据基础 (3 天)

| 任务 | 负责人 | 工时 | 验收标准 |
|------|--------|------|----------|
| 创建 expert_insights 表 | 后端 | 0.5d | 表结构正确 |
| 创建 expert_content_relations 表 | 后端 | 0.5d | 支持多种关联类型 |
| 扩展现有知识图谱表 | 后端 | 0.5d | 支持统一节点/边类型 |
| 数据迁移脚本 | 后端 | 1d | 历史数据正确迁移 |
| 专家画像初始化 | 后端 | 0.5d | 基于历史评审数据 |

### 5.2 Phase 2: 核心服务 (5 天)

| 任务 | 负责人 | 工时 | 验收标准 |
|------|--------|------|----------|
| ExpertInsightService | 后端 | 1.5d | 匹配+生成+确认流程完整 |
| ReviewFeedbackService | 后端 | 1d | 评分调整+画像更新正确 |
| UnifiedKnowledgeGraphService | 后端 | 1.5d | 图谱构建+中心性计算 |
| DynamicExpertMatching | 后端 | 1d | 动态优化策略生效 |

### 5.3 Phase 3: API 与集成 (3 天)

| 任务 | 负责人 | 工时 | 验收标准 |
|------|--------|------|----------|
| 洞察生成 API | 后端 | 0.5d | 支持自动/手动触发 |
| 知识图谱 API | 后端 | 1d | 支持多种视图模式 |
| 与 v6.1/v6.2/v6.3 集成 | 后端 | 1d | 流程打通 |
| 定时任务 | 后端 | 0.5d | 热点内容自动触发 |

### 5.4 Phase 4: 前端增强 (5 天)

| 任务 | 负责人 | 工时 | 验收标准 |
|------|--------|------|----------|
| ExpertKnowledgeGraph 增强 | 前端 | 2d | 统一图谱视图+交互 |
| ExpertComparison 增强 | 前端 | 1.5d | 动态话题+新对比维度 |
| ExpertNetwork 增强 | 前端 | 1.5d | 新网络视图+实时数据 |

### 5.5 Phase 5: 验证优化 (2 天)

| 任务 | 负责人 | 工时 | 验收标准 |
|------|--------|------|----------|
| 洞察质量评估 | 产品+专家 | 1d | 专家满意度 > 80% |
| 图谱准确性验证 | 产品 | 0.5d | 关联准确率 > 85% |
| 性能优化 | 后端 | 0.5d | 图谱加载 < 2s |

---

## 6. 验证标准

### 6.1 功能验收

| 功能点 | 验收标准 | 测试方法 |
|--------|----------|----------|
| 专家洞察生成 | 自动匹配准确率 > 85% | 抽样专家确认 |
| 洞察质量 | 专家满意度 > 80% | 问卷调查 |
| 评审数据反馈 | 内容评分调整合理 | 对比实验 |
| 知识图谱融合 | 节点关联准确率 > 85% | 人工验证 |
| 动态匹配优化 | 匹配效果提升 > 20% | A/B 测试 |

### 6.2 性能指标

| 指标 | 目标 | 测试方法 |
|------|------|----------|
| 洞察生成延迟 | < 3s (AI) | API 测试 |
| 知识图谱加载 | < 2s (< 1000 节点) | 性能测试 |
| 专家匹配延迟 | < 500ms | API 测试 |
| 图谱更新延迟 | < 1s | 实时性测试 |

---

## 7. 附录

### 7.1 与 v6.1-v6.3 的关系

```
v6.1: RSS AI              v6.2: Assets AI           v6.3: 统一分类+自动评审
     │                         │                            │
     └─────────────────────────┼────────────────────────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │    v6.4 专家-内容整合  │
                    │  • 内容驱动专家洞察    │
                    │  • 评审数据反馈       │
                    │  • 融合知识图谱       │
                    │  • 动态匹配优化       │
                    └──────────────────────┘
                               │
          ┌────────────────────┼────────────────────┐
          │                    │                    │
          ▼                    ▼                    ▼
  /expert-knowledge-graph  /expert-comparison  /expert-network
  (统一知识图谱)           (智能话题推荐)      (影响力分析)
```

### 7.2 相关文档

- [v6.1 RSS AI 批量处理](./Product-Spec-v6.1-AI-Batch-Processing.md)
- [v6.2 Assets AI 批量处理](./Product-Spec-v6.2-AI-Assets-Processing.md)
- [v6.3 统一分类字典](./Product-Spec-v6.3-Unified-Taxonomy.md)
- [ExpertKnowledgeGraph 页面](../webapp/src/pages/ExpertKnowledgeGraph.tsx)
- [ExpertComparison 页面](../webapp/src/pages/ExpertComparison.tsx)
- [ExpertNetwork 页面](../webapp/src/pages/ExpertNetwork.tsx)
