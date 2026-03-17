# Product Spec - v2.2 情感分析增强 (Sentiment Analysis Enhancement)

**版本**: v2.2
**日期**: 2026-03-17
**状态**: 已完成
**标签**: SA-001, SA-002, SA-003, SA-004, SA-005

---

## 1. 需求概述

为内容生产流水线增加情感分析能力，自动识别和分析内容的情感倾向，为内容决策提供数据支持。

### 1.1 目标
- 自动分析内容的情感极性（正面/负面/中性）
- 计算情感强度和市场情绪指数 (MSI)
- 监控情感异常并提供预警
- 追踪情感趋势变化

### 1.2 Why
理解内容的情感倾向有助于：
- 把握市场情绪和热点趋势
- 识别潜在的舆论风险
- 优化内容策略和发布时间

---

## 2. 功能规格

### SA-001: 单条内容情感分析
**优先级**: P0
**状态**: ✅ 已完成

#### 功能描述
对单条文本进行情感分析，返回情感极性、强度、置信度和关键词。

#### API
```
POST /api/v1/sentiment/analyze

Request:
{
  "text": "string"  // 需要分析的文本
}

Response:
{
  "success": true,
  "data": {
    "polarity": "positive" | "negative" | "neutral",
    "intensity": 0-100,      // 情感强度
    "confidence": 0-1,       // 置信度
    "keywords": ["string"],  // 识别出的情感关键词
    "aspects": {}            // 细粒度情感分析 (预留)
  }
}
```

#### 情感词典
- **正向词**: 利好、上涨、增长、突破、创新高、强劲、乐观、看好、推荐、买入、positive、growth、profit
- **负向词**: 利空、下跌、下滑、跌破、创新低、疲软、悲观、看空、减持、卖出、negative、loss、decline
- **强化词**: 大幅、剧烈、严重、极度、非常、明显、显著
- **弱化词**: 略微、轻微、稍有、小幅、略有

---

### SA-002: 批量情感分析
**优先级**: P1
**状态**: ✅ 已完成

#### 功能描述
批量分析多条内容的情感，并将结果保存到数据库。

#### API
```
POST /api/v1/sentiment/batch-analyze

Request:
{
  "items": [
    { "id": "string", "text": "string", "source": "string" }
  ]
}

Response:
{
  "success": true,
  "data": {
    "itemId1": { /* SentimentResult */ },
    "itemId2": { /* SentimentResult */ }
  }
}
```

---

### SA-003: 市场情绪指数 (MSI)
**优先级**: P1
**状态**: ✅ 已完成

#### 功能描述
计算市场情绪指数 (Market Sentiment Index)，取值范围 0-100，50为中性。

#### MSI 等级划分
| 数值范围 | 等级 | 说明 |
|---------|------|------|
| 0-20 | extreme_fear | 极度恐惧 |
| 21-40 | fear | 恐惧 |
| 41-60 | neutral | 中性 |
| 61-80 | greed | 贪婪 |
| 81-100 | extreme_greed | 极度贪婪 |

#### API
```
GET /api/v1/sentiment/msi

Response:
{
  "success": true,
  "data": {
    "value": 65,
    "level": "greed",
    "change24h": 5,
    "change7d": -3,
    "components": {
      "newsSentiment": 68,
      "socialSentiment": 50,  // 预留
      "expertSentiment": 50   // 预留
    },
    "calculatedAt": "2026-03-17T10:00:00Z"
  }
}
```

#### API - 话题情感分析
```
GET /api/v1/sentiment/topic/:topicId

Response:
{
  "success": true,
  "data": {
    "topicId": "string",
    "topicTitle": "string",
    "overall": -45,  // -100 to 100
    "confidence": 0.85,
    "distribution": {
      "positive": 20,
      "neutral": 30,
      "negative": 50
    },
    "trend": "rising" | "stable" | "falling",
    "sourceCount": 150,
    "analyzedAt": "2026-03-17T10:00:00Z"
  }
}
```

---

### SA-004: 情感异常预警
**优先级**: P2
**状态**: ✅ 已完成

#### 功能描述
监控话题情感，当出现极端情绪或突变时发出预警。

#### 预警类型
| 类型 | 触发条件 | 严重级别 |
|------|---------|---------|
| extreme_positive | 情感强度 >= 70 | medium |
| extreme_negative | 情感强度 <= -70 | high |
| sudden_change | 24小时内情感变化 > 30 | high |

#### API
```
GET /api/v1/sentiment/alerts

Response:
{
  "success": true,
  "data": [
    {
      "topicId": "string",
      "topicTitle": "string",
      "alertType": "extreme_negative",
      "severity": "high",
      "message": "话题\"XXX\"出现极度悲观情绪 (强度: 75)"
    }
  ]
}
```

---

### SA-005: 情感趋势追踪
**优先级**: P2
**状态**: ✅ 已完成

#### 功能描述
追踪话题的情感变化趋势，支持按天统计。

#### API
```
GET /api/v1/sentiment/trend/:topicId?days=7

Response:
{
  "success": true,
  "data": [
    {
      "date": "2026-03-10",
      "positive": 25,
      "negative": 15,
      "neutral": 10,
      "overall": 20
    }
  ]
}
```

---

## 3. 数据库表结构

### sentiment_analysis 表
```sql
CREATE TABLE sentiment_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id VARCHAR(100) NOT NULL,
  topic_id VARCHAR(50),
  source_type VARCHAR(50) NOT NULL,
  polarity VARCHAR(20) NOT NULL CHECK (polarity IN ('positive', 'negative', 'neutral')),
  intensity INTEGER DEFAULT 0 CHECK (intensity >= 0 AND intensity <= 100),
  confidence DECIMAL(3,2) DEFAULT 0,
  keywords JSONB DEFAULT '[]',
  analyzed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(content_id)
);
```

### hot_topics 表
```sql
CREATE TABLE hot_topics (
  id VARCHAR(50) PRIMARY KEY,
  title VARCHAR(500) NOT NULL,
  category VARCHAR(100),
  sentiment_score DECIMAL(5,2) DEFAULT 0,
  mention_count INTEGER DEFAULT 0,
  trend_direction VARCHAR(20) DEFAULT 'stable',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

---

## 4. 技术实现

### 4.1 核心算法
```typescript
// 情感分析算法
function analyzeSentiment(text: string): SentimentResult {
  // 1. 分词并匹配情感词典
  // 2. 统计正负向词数量
  // 3. 应用强化/弱化词倍数
  // 4. 计算极性、强度、置信度
}
```

### 4.2 MSI 计算
```typescript
// MSI = 50 + (平均情感分数 * 0.5)
// 平均情感分数 = 正向强度 - 负向强度
// 结果范围: 0-100, 50为中性
```

---

## 5. 测试用例

### 5.1 单元测试
- [ ] 正向情感识别
- [ ] 负向情感识别
- [ ] 中性文本处理
- [ ] 强化词倍数计算
- [ ] 弱化词倍数计算
- [ ] 空文本处理

### 5.2 API 测试
- [ ] POST /analyze 正常请求
- [ ] POST /analyze 空文本
- [ ] POST /batch-analyze 批量处理
- [ ] GET /msi 返回正确格式
- [ ] GET /topic/:topicId 话题分析
- [ ] GET /alerts 异常检测
- [ ] GET /trend/:topicId 趋势数据

---

## 6. 变更日志

| 日期 | 版本 | 变更内容 |
|------|------|---------|
| 2026-03-17 | v2.2.0 | 初始版本，完成 SA-001~SA-005 |
