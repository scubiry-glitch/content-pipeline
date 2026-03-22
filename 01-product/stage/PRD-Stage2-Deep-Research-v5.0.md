# 产品需求文档: 阶段 2 - 深度研究详细设计 v5.0

**版本**: v5.0
**日期**: 2026-03-23
**状态**: 📝 详细设计文档
**对应阶段**: 阶段 2 - 深度研究
**依赖**: PRD-Production-Pipeline-v5.0.md

---

## 1. 深度研究流程概览

### 1.1 流程架构图

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         阶段 2: 深度研究流程                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────┐                                                            │
│  │  任务触发    │ ← 用户点击"开始研究" / 自动触发                            │
│  └──────┬──────┘                                                            │
│         ▼                                                                   │
│  ┌─────────────┐     ┌─────────────────────────────────────────────────┐   │
│  │ 步骤 1:     │     │ 输入: topicId, outline, researchConfig          │   │
│  │ 数据采集     │ →   │ 输出: rawData[] (原始数据)                       │   │
│  │             │     │ 来源: Web/RSS/Assets/News API                   │   │
│  └──────┬──────┘     └─────────────────────────────────────────────────┘   │
│         │                      │                                            │
│         │    ┌─────────────────┼─────────────────┐                         │
│         │    ▼                 ▼                 ▼                         │
│         │ ┌──────────┐  ┌──────────┐  ┌──────────┐                        │
│         │ │ Web搜索   │  │ RSS匹配   │  │ 素材库    │                        │
│         │ │ (Tavily) │  │ (数据库)  │  │ (向量检索)│                        │
│         │ └──────────┘  └──────────┘  └──────────┘                        │
│         │                                                                   │
│         ▼                                                                   │
│  ┌─────────────┐     ┌─────────────────────────────────────────────────┐   │
│  │ 步骤 2:     │     │ 输入: rawData[]                                  │   │
│  │ 数据清洗     │ →   │ 输出: cleanedData[] (清洗后数据)                 │   │
│  │             │     │ 处理: 去重/格式化/异常值处理/标准化              │   │
│  └──────┬──────┘     └─────────────────────────────────────────────────┘   │
│         │                                                                   │
│         │    ┌─────────────────┬─────────────────┐                         │
│         │    ▼                 ▼                 ▼                         │
│         │ ┌──────────┐  ┌──────────┐  ┌──────────┐                        │
│         │ │ 去重     │→ │ 格式化   │→ │ 标准化   │                        │
│         │ │ (SimHash)│  │ (统一格式)│  │ (单位/日期)│                       │
│         │ └──────────┘  └──────────┘  └──────────┘                        │
│         │                                                                   │
│         ▼                                                                   │
│  ┌─────────────┐     ┌─────────────────────────────────────────────────┐   │
│  │ 步骤 3:     │     │ 输入: cleanedData[]                              │   │
│  │ 数据分析     │ →   │ 输出: analysisResult (统计/趋势/关联分析)        │   │
│  │             │     │ 方法: 描述统计/时间序列/回归/聚类                │   │
│  └──────┬──────┘     └─────────────────────────────────────────────────┘   │
│         │                                                                   │
│         │    ┌─────────────────┬─────────────────┬─────────────────┐      │
│         │    ▼                 ▼                 ▼                 ▼      │
│         │ ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐        │
│         │ │ 描述统计  │  │ 趋势分析  │  │ 对比分析  │  │ 关联分析  │        │
│         │ │ (均值/方差)│ │ (时间序列)│ │ (同比环比)│ │ (相关性)  │        │
│         │ └──────────┘  └──────────┘  └──────────┘  └──────────┘        │
│         │                                                                   │
│         ▼                                                                   │
│  ┌─────────────┐     ┌─────────────────────────────────────────────────┐   │
│  │ 步骤 4:     │     │ 输入: analysisResult                             │   │
│  │ 洞察提炼     │ →   │ 输出: insights[] (洞察列表)                      │   │
│  │             │     │ 类型: 发现型/风险型/机会型/验证型                │   │
│  └──────┬──────┘     └─────────────────────────────────────────────────┘   │
│         │                                                                   │
│         ▼                                                                   │
│  ┌─────────────┐     ┌─────────────────────────────────────────────────┐   │
│  │ 步骤 5:     │     │ 存储: research_data / research_annotations      │   │
│  │ 保存结果     │ →   │ 更新: tasks.research_data                       │   │
│  └─────────────┘     └─────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 核心数据结构

#### ResearchConfig - 研究配置

```typescript
interface ResearchConfig {
  autoCollect: boolean;              // 是否自动采集
  sources: ('web' | 'rss' | 'asset' | 'news')[];  // 数据源
  maxResults: number;                // 最大结果数
  minCredibility: number;            // 最小可信度
  keywords: string[];                // 关键词列表
  excludeKeywords: string[];         // 排除关键词
  timeRange: '1d' | '7d' | '30d' | '90d' | 'all';  // 时间范围
  analysisMethods: string[];         // 分析方法
}
```

#### RawData - 原始数据

```typescript
interface RawData {
  id: string;
  sourceType: 'web' | 'rss' | 'asset' | 'news';
  source: string;                    // 来源名称
  title: string;
  url?: string;
  content?: string;
  summary: string;
  credibility: number;               // 可信度 0-1
  relevanceScore: number;            // 相关度 0-1
  publishedAt?: Date;
  tags: string[];
  metadata?: Record<string, any>;    // 元数据
}
```

#### CleanedData - 清洗后数据

```typescript
interface CleanedData extends RawData {
  cleanedAt: Date;
  cleaningRules: string[];           // 应用的清洗规则
  isValid: boolean;                  // 是否有效
  validationErrors?: string[];       // 验证错误
}
```

#### AnalysisResult - 分析结果

```typescript
interface AnalysisResult {
  descriptive: DescriptiveStats;     // 描述统计
  trends: TrendAnalysis;             // 趋势分析
  comparisons: ComparisonAnalysis;   // 对比分析
  correlations: CorrelationAnalysis; // 关联分析
  clusters: ClusterResult[];         // 聚类结果
}

interface DescriptiveStats {
  count: number;
  mean: number;
  median: number;
  stdDev: number;
  min: number;
  max: number;
  quartiles: [number, number, number];
}
```

#### Insight - 洞察

```typescript
interface Insight {
  id: string;
  type: 'discovery' | 'risk' | 'opportunity' | 'validation';
  title: string;
  description: string;
  confidence: number;                // 置信度 0-1
  supportingData: string[];          // 支撑数据ID
  relatedTopics: string[];           // 相关话题
  suggestedActions?: string[];       // 建议行动
}
```

---

## 2. 详细步骤设计

### 步骤 1: 数据采集

**详细设计参考**: [PRD-Data-Collection-Detail-v5.0.md](./PRD-Data-Collection-Detail-v5.0.md)

简要流程:
1. 提取关键词 (从 outline)
2. Web 搜索采集 (Tavily/Serper API)
3. RSS 采集 (数据库匹配)
4. 素材库采集 (向量检索)
5. 结果合并

---

### 步骤 2: 数据清洗

#### 功能规格

| 项目 | 规格 |
|------|------|
| 输入 | RawData[] |
| 输出 | CleanedData[] |
| 处理链 | 去重 → 格式化 → 异常值检测 → 标准化 |
| 优先级 | P0 |

#### 清洗流程

```typescript
async function cleanData(rawData: RawData[]): Promise<CleanedData[]> {
  // 1. 去重
  const deduped = deduplicateData(rawData);
  
  // 2. 格式化
  const formatted = formatData(deduped);
  
  // 3. 异常值检测
  const validated = validateData(formatted);
  
  // 4. 标准化
  const normalized = normalizeData(validated);
  
  return normalized.map(data => ({
    ...data,
    cleanedAt: new Date(),
    cleaningRules: ['dedup', 'format', 'validate', 'normalize'],
    isValid: true,
  }));
}
```

#### 去重逻辑 (SimHash)

```typescript
function deduplicateData(data: RawData[]): RawData[] {
  const seen = new Map<string, string>(); // simhash -> id
  
  return data.filter(item => {
    // 基于内容的 SimHash
    const content = item.title + ' ' + item.summary;
    const hash = calculateSimHash(content);
    
    // 检查相似度
    for (const [existingHash, existingId] of seen) {
      const similarity = calculateHammingDistance(hash, existingHash);
      if (similarity > 0.9) {
        return false; // 重复
      }
    }
    
    seen.set(hash, item.id);
    return true;
  });
}
```

#### 格式化规则

```typescript
function formatData(data: RawData[]): RawData[] {
  return data.map(item => ({
    ...item,
    // 日期格式统一
    publishedAt: item.publishedAt 
      ? new Date(item.publishedAt).toISOString()
      : null,
    // 去除多余空格
    title: item.title.trim().replace(/\s+/g, ' '),
    summary: item.summary.trim().replace(/\s+/g, ' '),
    // 标签统一小写
    tags: item.tags.map(t => t.toLowerCase()),
  }));
}
```

#### 标准化规则

```typescript
function normalizeData(data: RawData[]): RawData[] {
  return data.map(item => {
    let content = item.summary;
    
    // 货币单位统一: 亿元/万元/元
    content = content.replace(/(\d+)亿/g, '$100000000');
    content = content.replace(/(\d+)万/g, '$10000');
    
    // 日期格式统一: YYYY-MM-DD
    content = content.replace(/(\d{4})年(\d{1,2})月(\d{1,2})日/g, '$1-$2-$3');
    
    // 百分比统一
    content = content.replace(/(\d+)%/g, '$1 percent');
    
    return { ...item, summary: content };
  });
}
```

---

### 步骤 3: 数据分析

#### 功能规格

| 项目 | 规格 |
|------|------|
| 输入 | CleanedData[] |
| 输出 | AnalysisResult |
| 方法 | 统计/趋势/对比/关联分析 |
| 优先级 | P0 |

#### 描述统计

```typescript
function descriptiveAnalysis(data: CleanedData[]): DescriptiveStats {
  const numbers = extractNumericValues(data);
  
  const sorted = numbers.sort((a, b) => a - b);
  const count = sorted.length;
  const sum = sorted.reduce((a, b) => a + b, 0);
  const mean = sum / count;
  
  // 中位数
  const median = count % 2 === 0
    ? (sorted[count / 2 - 1] + sorted[count / 2]) / 2
    : sorted[Math.floor(count / 2)];
  
  // 标准差
  const variance = sorted.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / count;
  const stdDev = Math.sqrt(variance);
  
  // 四分位数
  const q1 = sorted[Math.floor(count * 0.25)];
  const q2 = median;
  const q3 = sorted[Math.floor(count * 0.75)];
  
  return {
    count,
    mean: round(mean, 2),
    median: round(q2, 2),
    stdDev: round(stdDev, 2),
    min: sorted[0],
    max: sorted[count - 1],
    quartiles: [q1, q2, q3],
  };
}
```

#### 趋势分析

```typescript
function trendAnalysis(data: CleanedData[]): TrendAnalysis {
  // 按时间分组
  const timeSeries = groupByTime(data, 'day');
  
  // 计算移动平均
  const ma7 = calculateMovingAverage(timeSeries, 7);
  const ma30 = calculateMovingAverage(timeSeries, 30);
  
  // 趋势判断
  const recent = timeSeries.slice(-7);
  const slope = calculateLinearRegressionSlope(recent);
  
  let trend: 'up' | 'down' | 'stable';
  if (slope > 0.1) trend = 'up';
  else if (slope < -0.1) trend = 'down';
  else trend = 'stable';
  
  // 预测
  const forecast = forecastTrend(timeSeries, 7);
  
  return {
    timeSeries,
    movingAverage: { ma7, ma30 },
    trend,
    slope: round(slope, 4),
    forecast,
  };
}
```

#### 对比分析

```typescript
function comparisonAnalysis(
  current: CleanedData[],
  previous: CleanedData[]
): ComparisonAnalysis {
  const currentStats = descriptiveAnalysis(current);
  const previousStats = descriptiveAnalysis(previous);
  
  // 同比
  const yoyChange = calculatePercentageChange(
    previousStats.mean,
    currentStats.mean
  );
  
  // 环比
  const momChange = calculatePercentageChange(
    previousStats.mean,
    currentStats.mean
  );
  
  return {
    current: currentStats,
    previous: previousStats,
    yoyChange: round(yoyChange, 2),
    momChange: round(momChange, 2),
    significant: Math.abs(yoyChange) > 20, // 变化 > 20% 为显著
  };
}
```

#### 关联分析

```typescript
function correlationAnalysis(data: CleanedData[]): CorrelationAnalysis {
  const variables = extractVariables(data);
  const correlations: Correlation[] = [];
  
  for (let i = 0; i < variables.length; i++) {
    for (let j = i + 1; j < variables.length; j++) {
      const corr = calculatePearsonCorrelation(
        variables[i].values,
        variables[j].values
      );
      
      if (Math.abs(corr) > 0.5) { // 只保留强相关
        correlations.push({
          var1: variables[i].name,
          var2: variables[j].name,
          coefficient: round(corr, 2),
          strength: Math.abs(corr) > 0.8 ? 'strong' : 'moderate',
          direction: corr > 0 ? 'positive' : 'negative',
        });
      }
    }
  }
  
  return { correlations };
}
```

---

### 步骤 4: 洞察提炼

#### 功能规格

| 项目 | 规格 |
|------|------|
| 输入 | AnalysisResult |
| 输出 | Insight[] |
| 方法 | AI + 规则引擎 |
| 优先级 | P0 |

#### 洞察类型

```typescript
const insightTypes = {
  discovery: {
    icon: '🔍',
    description: '从数据中发现新模式、新趋势',
    example: '发现 Q3 新能源汽车销量同比增长 45%，超出市场预期',
  },
  risk: {
    icon: '⚠️',
    description: '识别潜在风险和警示信号',
    example: '原材料价格波动幅度达 30%，对利润率构成压力',
  },
  opportunity: {
    icon: '💡',
    description: '发现市场机会和投资价值',
    example: '下沉市场渗透率仅 15%，存在巨大增长空间',
  },
  validation: {
    icon: '✅',
    description: '验证或证伪既有假设',
    example: '验证了"政策刺激与销量正相关"的假设',
  },
};
```

#### 洞察生成流程

```typescript
async function extractInsights(
  analysis: AnalysisResult,
  context: ResearchContext
): Promise<Insight[]> {
  const insights: Insight[] = [];
  
  // 1. 基于统计的洞察 (规则引擎)
  insights.push(...extractStatisticalInsights(analysis.descriptive));
  insights.push(...extractTrendInsights(analysis.trends));
  insights.push(...extractComparisonInsights(analysis.comparisons));
  insights.push(...extractCorrelationInsights(analysis.correlations));
  
  // 2. AI 辅助洞察
  const aiInsights = await generateAIInsights(analysis, context);
  insights.push(...aiInsights);
  
  // 3. 去重和排序
  return deduplicateAndRankInsights(insights);
}
```

#### 统计洞察规则

```typescript
function extractStatisticalInsights(stats: DescriptiveStats): Insight[] {
  const insights: Insight[] = [];
  
  // 异常高值
  if (stats.max > stats.mean + 3 * stats.stdDev) {
    insights.push({
      id: generateId(),
      type: 'discovery',
      title: '发现异常高值',
      description: `数据中存在显著高于平均值的异常点，最大值 ${stats.max} 超出均值 3 个标准差`,
      confidence: 0.9,
      supportingData: [],
      relatedTopics: ['异常检测'],
    });
  }
  
  // 高波动性
  const cv = stats.stdDev / stats.mean; // 变异系数
  if (cv > 0.5) {
    insights.push({
      id: generateId(),
      type: 'risk',
      title: '数据波动性较高',
      description: `变异系数为 ${round(cv, 2)}，表明数据波动较大，需谨慎解读`,
      confidence: 0.85,
      supportingData: [],
      relatedTopics: ['风险评估'],
    });
  }
  
  return insights;
}
```

#### AI 洞察生成

```typescript
async function generateAIInsights(
  analysis: AnalysisResult,
  context: ResearchContext
): Promise<Insight[]> {
  const prompt = `
基于以下数据分析结果，生成 3-5 个关键洞察：

分析结果：
${JSON.stringify(analysis, null, 2)}

研究主题：${context.topic}

请生成洞察，每个洞察包含：
1. 类型 (discovery/risk/opportunity/validation)
2. 标题
3. 详细描述
4. 置信度 (0-1)
5. 支撑数据点

格式要求：JSON 数组
`;

  const response = await llm.generate(prompt);
  return JSON.parse(response.content);
}
```

---

### 步骤 5: 保存结果

#### 功能规格

| 项目 | 规格 |
|------|------|
| 输入 | CleanedData[], AnalysisResult, Insight[] |
| 输出 | void |
| 存储表 | research_data, research_annotations |
| 优先级 | P0 |

#### 存储逻辑

```typescript
async function saveResearchResults(
  taskId: string,
  cleanedData: CleanedData[],
  analysis: AnalysisResult,
  insights: Insight[]
): Promise<void> {
  // 1. 保存清洗后数据
  await saveCleanedData(taskId, cleanedData);
  
  // 2. 保存分析结果
  await saveAnalysisResult(taskId, analysis);
  
  // 3. 保存洞察
  await saveInsights(taskId, insights);
  
  // 4. 更新任务状态
  await updateTaskResearchData(taskId, {
    totalCollected: cleanedData.length,
    analysisCompleted: true,
    insightsCount: insights.length,
    completedAt: new Date(),
  });
}
```

---

## 3. 数据库存储设计

### 3.1 表结构

#### research_data (研究数据表)

```sql
CREATE TABLE research_data (
  id SERIAL PRIMARY KEY,
  task_id VARCHAR(50) NOT NULL REFERENCES tasks(id),
  data_type VARCHAR(50) NOT NULL, -- 'raw' | 'cleaned' | 'analysis' | 'insight'
  content JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_research_data_task ON research_data(task_id);
CREATE INDEX idx_research_data_type ON research_data(data_type);
```

#### research_annotations (研究标注表)

```sql
CREATE TABLE research_annotations (
  id SERIAL PRIMARY KEY,
  task_id VARCHAR(50) NOT NULL REFERENCES tasks(id),
  type VARCHAR(20) NOT NULL, -- 'url' | 'asset'
  url TEXT NOT NULL,
  title VARCHAR(500),
  credibility JSONB,
  content TEXT,
  analysis JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(task_id, url)
);

CREATE INDEX idx_research_annotations_task ON research_annotations(task_id);
```

#### insights (洞察表)

```sql
CREATE TABLE insights (
  id VARCHAR(50) PRIMARY KEY,
  task_id VARCHAR(50) NOT NULL REFERENCES tasks(id),
  type VARCHAR(20) NOT NULL,
  title VARCHAR(500),
  description TEXT,
  confidence DECIMAL(3,2),
  supporting_data JSONB,
  related_topics JSONB,
  suggested_actions JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_insights_task ON insights(task_id);
CREATE INDEX idx_insights_type ON insights(type);
```

---

## 4. 接口设计

```yaml
# 数据采集
POST   /api/v1/research/:taskId/collect
GET    /api/v1/research/:taskId/collected

# 数据清洗
POST   /api/v1/research/:taskId/clean
GET    /api/v1/research/:taskId/cleaned

# 数据分析
POST   /api/v1/research/:taskId/analyze
GET    /api/v1/research/:taskId/analysis

# 洞察管理
GET    /api/v1/research/:taskId/insights
POST   /api/v1/research/:taskId/insights/:id/approve

# 研究配置
GET    /api/v1/research/:taskId/config
POST   /api/v1/research/:taskId/config
```

---

## 5. 性能与限制

| 指标 | 目标值 |
|------|--------|
| 数据采集 | < 30秒 |
| 数据清洗 | < 10秒 (1000条) |
| 数据分析 | < 20秒 |
| 洞察生成 | < 30秒 |
| 最大处理数据量 | 10000条 |

---

## 6. 相关文档

- [PRD-Data-Collection-Detail-v5.0.md](./PRD-Data-Collection-Detail-v5.0.md)
- [PRD-Production-Pipeline-v5.0.md](./PRD-Production-Pipeline-v5.0.md)

**文档维护**: 产品研发运营协作体系
**更新频率**: 每迭代更新
