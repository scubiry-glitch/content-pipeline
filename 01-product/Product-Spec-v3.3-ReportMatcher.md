# 产品规格: 研报自动关联系统 v3.3

**版本**: v3.3
**日期**: 2026-03-16
**状态**: 📝 需求文档
**负责人**: 产品研发运营协作体系
**优先级**: 1 (最后)

---

## 1. 版本概述

### 1.1 背景
v3.0-v3.2实现了内容质量输入体系（RSS聚合、智能推荐、情感分析）和API开放接口。但研报（研究分析报告）与实时资讯的关联仍依赖人工操作，效率低下。

### 1.2 目标
构建研报自动关联系统，实现：
- 研报内容自动解析与结构化
- 研报与RSS热点话题的自动匹配
- 研报与素材库的关联推荐
- 研报质量评估与标签提取

### 1.3 成功标准

| 指标 | 目标 |
|------|------|
| 研报解析准确率 | >95% |
| 关联推荐准确率 | >80% |
| 标签提取F1值 | >0.85 |
| 处理速度 | <5秒/篇 |

---

## 2. 功能清单

### 2.1 研报解析 (ReportParser)

**功能**:
- ✅ PDF研报文本提取
- ✅ 标题/作者/机构/日期元数据识别
- ✅ 目录结构解析
- ✅ 图表识别与提取
- ✅ 核心观点摘要生成

**输入**: PDF/DOC/网页研报
**输出**: 结构化研报数据

```typescript
interface ParsedReport {
  id: string;
  title: string;
  authors: string[];
  institution: string;
  publishDate: Date;
  pageCount: number;
  sections: ReportSection[];
  keyPoints: string[];
  charts: Chart[];
  tags: string[];
}
```

---

### 2.2 智能关联 (ReportMatcher)

**功能**:
- ✅ 研报与RSS热点话题匹配
- ✅ 研报与素材库文档相似度计算
- ✅ 产业链上下游关联分析
- ✅ 时间序列相关性分析

**核心算法**:
```typescript
// 语义相似度 + 关键词匹配 + 时间衰减
matchScore = (
  semanticSimilarity * 0.4 +
  keywordOverlap * 0.3 +
  industryMatch * 0.2 +
  timeDecay * 0.1
) * 100
```

---

### 2.3 标签提取 (TagExtractor)

**功能**:
- ✅ 行业标签自动提取
- ✅ 概念标签识别
- ✅ 地域标签提取
- ✅ 情感倾向分析

**标签体系**:
| 类型 | 示例 |
|------|------|
| 行业 | 新能源、半导体、医药 |
| 概念 | AI、碳中和、元宇宙 |
| 地域 | 中国、美国、欧洲 |
| 情感 | 看好、中性、谨慎 |

---

### 2.4 质量评估 (ReportQuality)

**功能**:
- ✅ 研报可信度评分
- ✅ 数据来源标注检测
- ✅ 逻辑一致性检查
- ✅ 与历史报告对比

**评分维度**:
| 维度 | 权重 | 说明 |
|------|------|------|
| 机构权威性 | 30% | 券商/咨询机构知名度 |
| 数据完整性 | 25% | 数据来源、图表完整性 |
| 逻辑严谨性 | 25% | 论证逻辑、前后一致性 |
| 时效性 | 20% | 发布时间、数据新鲜度 |

---

## 3. API 接口

### 3.1 REST API

| 端点 | 方法 | 描述 |
|------|------|------|
| `/api/v3/reports/upload` | POST | 上传研报 |
| `/api/v3/reports/:id` | GET | 获取研报详情 |
| `/api/v3/reports/:id/parse` | POST | 解析研报 |
| `/api/v3/reports/:id/matches` | GET | 获取关联推荐 |
| `/api/v3/reports/:id/tags` | GET | 获取提取标签 |
| `/api/v3/reports/:id/quality` | GET | 获取质量评分 |
| `/api/v3/reports/search` | GET | 研报搜索 |

---

## 4. 数据库 Schema

```sql
-- 研报表
CREATE TABLE reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title VARCHAR(500) NOT NULL,
  authors TEXT[],
  institution VARCHAR(200),
  publish_date DATE,
  page_count INTEGER,
  file_url VARCHAR(500),
  content TEXT,
  key_points TEXT[],
  tags TEXT[],
  quality_score INTEGER,
  status VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW()
);

-- 研报关联表
CREATE TABLE report_matches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  report_id UUID REFERENCES reports(id),
  match_type VARCHAR(50), -- 'rss', 'asset', 'topic'
  match_id VARCHAR(200),
  match_score FLOAT,
  match_reason TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

## 5. 文件结构

```
api/src/
├── services/
│   ├── reportParser.ts      # 研报解析服务
│   ├── reportMatcher.ts     # 关联匹配服务
│   ├── tagExtractor.ts      # 标签提取服务
│   └── reportQuality.ts     # 质量评估服务
├── routes/
│   └── reports.ts           # 研报路由
└── tests/
    └── report-matcher.test.ts  # 测试文件
```

---

## 6. 测试计划

| 模块 | 测试数 | 说明 |
|------|--------|------|
| ReportParser | 8 | 解析准确率测试 |
| ReportMatcher | 10 | 关联准确性测试 |
| TagExtractor | 6 | 标签提取测试 |
| ReportQuality | 6 | 质量评估测试 |
| API Integration | 8 | 接口集成测试 |
| **总计** | **38** | |

---

**状态**: 需求冻结中
**下一步**: 架构设计 → 开发实现 → 测试验证
