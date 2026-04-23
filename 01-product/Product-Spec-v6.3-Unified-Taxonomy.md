# 产品需求文档: 统一分类字典体系 v6.3

**版本**: v6.3  
**日期**: 2026-03-27  
**状态**: 📝 需求文档  
**负责人**: 产品研发运营协作体系  
**依赖**: v6.1 RSS AI 处理、v6.2 Assets AI 处理  
**优先级**: P0  

---

## 1. 文档概述

### 1.1 背景

随着 v6.1 (RSS AI 处理) 和 v6.2 (Assets AI 处理) 的推进，我们发现系统内存在**三套独立的分类体系**，导致数据割裂、推荐不准、检索困难：

| 系统 | 当前分类方式 | 问题 |
|------|-------------|------|
| **Expert-Library** | 12个领域代码 (E01-E12) | 与 RSS/Assets 分类无映射，专家匹配不准 |
| **RSS 采集** | 7个来源分类 (tech/news/finance...) | 与领域分类不对应，热点无法精准归类 |
| **Assets 素材** | themes 表 (自由主题) | 无标准化，与 expert-library 无法联动 |

**典型问题场景**：
- RSS 抓取的 "人工智能" 文章无法自动匹配到 E07 (人工智能) 领域专家
- Assets 中的 "新能源研报" 无法与 RSS "新能源" 热点关联
- 任务推荐时，无法基于统一分类进行跨数据源内容聚合

### 1.2 目标

建立**统一的分类字典体系 (Unified Taxonomy)**，实现：

1. **分类标准化**: 统一三级分类体系（领域-主题-标签）
2. **映射自动化**: RSS/Assets/Expert 自动映射到统一分类
3. **检索智能化**: 基于统一分类实现跨数据源内容关联
4. **推荐精准化**: 统一分类驱动任务推荐和专家匹配

### 1.3 设计原则

```
┌─────────────────────────────────────────────────────────────────┐
│                     统一分类字典 (Unified Taxonomy)                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  一级: 领域 (Domain)          15个标准领域                        │
│       │                                                         │
│       ▼                                                         │
│  二级: 主题 (Theme)           可扩展主题池                        │
│       │                                                         │
│       ▼                                                         │
│  三级: 标签 (Tag)             动态标签云                         │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  映射层: 各系统与统一字典的映射关系                        │   │
│  │  • Expert-Library: domain_code → 领域                   │   │
│  │  • RSS: source_category → 领域/主题                     │   │
│  │  • Assets: theme_id → 领域/主题                        │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 1.4 成功标准

| 指标 | 现状 | 目标 | 验证方式 |
|------|------|------|---------|
| 分类一致率 | < 40% | > 90% | 抽样人工验证 |
| RSS 自动分类准确率 | 关键词匹配 60% | > 85% | 标注数据集测试 |
| Assets 主题映射准确率 | 无 | > 85% | 专家审核 |
| 跨源内容关联成功率 | < 30% | > 75% | 相似内容匹配测试 |
| 专家匹配准确率 | 60% | > 85% | 任务-专家匹配验证 |
| **自动评审触发率** | 人工触发 | **高质量内容自动触发 > 80%** | **触发日志分析** |
| **专家评审效率** | 30min/篇 | **< 15min/篇 (自动分配)** | **平均评审时间统计** |
| **评审结果采纳率** | 无 | **> 70% 建议被采纳** | **反馈追踪** |

---

## 2. 现状分析

### 2.1 现有分类体系盘点

#### 2.1.1 Expert-Library 领域分类 (12个)

```typescript
// 当前 expertService.ts 中的领域定义
const DOMAIN_KEYWORDS = {
  E01: ['宏观', '经济', 'GDP', '通胀', '利率', '政策'],           // 宏观经济
  E02: ['金融', '科技', '支付', '银行', '保险', '区块链'],       // 金融科技
  E03: ['新能源', '光伏', '电池', '储能', '电动车', '氢能'],     // 新能源
  E04: ['医疗', '医药', '器械', '健康', '临床', '医保'],         // 生物医药
  E05: ['消费', '零售', '品牌', '电商', '新零售'],               // 消费品
  E06: ['芯片', '半导体', '集成电路', '晶圆', '光刻'],           // 半导体
  E07: ['人工智能', 'AI', '大模型', '算法', '机器学习'],          // 人工智能
  E08: ['房地产', '地产', '住宅', '商业', '物业'],               // 房地产
  E09: ['文化', '传媒', '内容', '娱乐', '影视'],                 // 文化传媒
  E10: ['制造', '工业', '自动化', '工艺', '质量'],               // 高端制造
  E11: ['ESG', '可持续', '碳中和', '绿色', '环保'],              // 环保ESG
  E12: ['出海', '跨境', '国际化', '海外', '全球化'],             // 跨境出海
};
```

**问题**: 
- 代码级定义，无法动态扩展
- 与其他系统无映射关系
- 关键词匹配方式过于简单

#### 2.1.2 RSS 来源分类 (7个)

```typescript
// 当前 rssCollector.ts 中的分类
const RSS_CATEGORIES = {
  tech:     { name: '科技',     sources: [...] },
  news:     { name: '新闻',     sources: [...] },
  finance:  { name: '财经',     sources: [...] },
  dev:      { name: '开发者',   sources: [...] },
  science:  { name: '科学',     sources: [...] },
  research: { name: '研究',     sources: [...] },
  international: { name: '国际', sources: [...] },
};
```

**问题**:
- 来源分类 ≠ 内容领域分类
- tech 分类下可能包含 AI、半导体、互联网等不同领域内容
- 无法直接映射到 expert-library 的 12 个领域

#### 2.1.3 Assets Themes 分类 (动态)

```typescript
// 当前 themes 表结构
interface AssetTheme {
  id: string;           // theme_001, theme_002...
  name: string;         // "房地产", "新能源"...
  description?: string;
  color: string;
  icon: string;
  parent_id?: string;   // 可选层级
}

// 示例数据
themes = [
  { id: 'theme_001', name: '房地产', parent_id: null },
  { id: 'theme_002', name: '保租房', parent_id: 'theme_001' },
  { id: 'theme_003', name: '新能源', parent_id: null },
  { id: 'theme_004', name: '储能', parent_id: 'theme_003' },
  { id: 'theme_005', name: '人工智能', parent_id: null },
  // ...
];
```

**问题**:
- 主题创建无标准，可能存在重复/冗余
- 与 expert-library 领域无关联
- 无法与 RSS 分类联动

### 2.2 分类不一致导致的问题

```
【案例】AI 大模型相关内容的分类困境

Expert-Library: E07 (人工智能)
RSS Source:     tech (科技)
Assets Theme:   theme_005 (人工智能) 或 theme_021 (大模型) 或 theme_034 (AIGC)
                ↓
问题:
1. RSS 抓取的文章标记为 "tech"，无法自动匹配 E07 领域专家
2. Assets 中同一内容可能被标记为不同 theme，导致检索遗漏
3. 任务推荐时无法聚合 "人工智能" 相关的 RSS + Assets 内容
```

---

## 3. 统一分类字典设计

### 3.1 三级分类体系

```
┌─────────────────────────────────────────────────────────────────┐
│                    统一分类字典 (Unified Taxonomy)                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  一级: 领域 (Domain)                                            │
│  ├── D01 宏观经济                                                │
│  ├── D02 房地产与建筑                                            │
│  ├── D03 保租房与租赁住房                                        │
│  ├── D04 金融科技                                                │
│  ├── D05 新能源                                                  │
│  ├── D06 半导体与芯片                                            │
│  ├── D07 人工智能                                                │
│  ├── D08 生物医药                                                │
│  ├── D09 消费品与零售                                            │
│  ├── D10 TMT与互联网                                             │
│  ├── D11 高端制造                                                │
│  ├── D12 交运物流                                                │
│  ├── D13 资本市场                                                │
│  ├── D14 政策与监管                                              │
│  └── D15 ESG与环保                                               │
│                                                                 │
│  二级: 主题 (Theme) - 每个领域下 5-15 个主题                      │
│  示例 (D07 人工智能):                                            │
│  ├── T0701 大模型与基础技术                                       │
│  ├── T0702 AIGC与应用                                            │
│  ├── T0703 AI芯片与算力                                          │
│  ├── T0704 计算机视觉                                            │
│  └── T0705 自然语言处理                                          │
│                                                                 │
│  三级: 标签 (Tag) - 动态管理                                      │
│  示例: GPT-4, 文心一言, Stable Diffusion, 商业落地...             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 详细分类定义

#### 3.2.1 领域 (Domain) 定义

| 编码 | 名称 | 英文 | 定义 | 包含主题示例 |
|------|------|------|------|-------------|
| D01 | 宏观经济 | Macroeconomy | GDP、通胀、利率、汇率、经济增长 | 货币政策,财政政策,国际经济,区域经济 |
| D02 | 房地产与建筑 | Real Estate | 住宅、商业、建筑、物业管理 | 住宅市场,商业地产,REITs,城市更新 |
| D03 | 保租房与租赁住房 | Rental Housing | 保障性租赁住房、长租公寓 | 保租房政策,长租公寓,租赁住房REITs |
| D04 | 金融科技 | FinTech | 数字金融、区块链、智能投顾 | 数字银行,区块链应用,智能投顾,监管科技 |
| D05 | 新能源 | New Energy | 光伏、风电、储能、电动汽车 | 光伏产业链,储能技术,电动汽车,氢能 |
| D06 | 半导体与芯片 | Semiconductor | 芯片设计、制造、封测、设备材料 | 芯片设计,晶圆制造,封测技术,半导体设备 |
| D07 | 人工智能 | AI | 大模型、机器学习、计算机视觉、NLP | 大模型技术,AIGC应用,AI芯片,自动驾驶 |
| D08 | 生物医药 | Biomedical | 创新药、医疗器械、CXO、基因治疗 | 创新药研发,医疗器械,CXO,基因治疗 |
| D09 | 消费品与零售 | Consumer | 品牌、零售、电商、新消费 | 品牌运营,新零售,跨境电商,消费趋势 |
| D10 | TMT与互联网 | TMT | 互联网、软件、云计算、5G | SaaS,云计算,5G应用,物联网 |
| D11 | 高端制造 | Manufacturing | 工业自动化、机器人、航空航天 | 工业4.0,机器人,航空航天,精密制造 |
| D12 | 交运物流 | Logistics | 物流、供应链、航运、快递 | 智慧物流,供应链,航运港口,即时配送 |
| D13 | 资本市场 | Capital Market | 证券、基金、IPO、并购重组 | A股市场,IPO动态,并购重组,私募基金 |
| D14 | 政策与监管 | Policy | 行业政策、监管动态、法规解读 | 产业政策,监管动态,法规解读,国际政策 |
| D15 | ESG与环保 | ESG | 碳中和、绿色金融、社会责任 | 碳中和路径,ESG投资,绿色金融,可持续发展 |

#### 3.2.2 主题 (Theme) 示例

```typescript
// 每个领域下的标准主题
const DOMAIN_THEMES: Record<string, Theme[]> = {
  'D07': [  // 人工智能
    { code: 'T0701', name: '大模型与基础技术', keywords: ['大模型', 'LLM', 'GPT', '基础模型', 'Transformer'] },
    { code: 'T0702', name: 'AIGC与应用', keywords: ['AIGC', '生成式AI', '文生图', '文生视频', 'AI应用'] },
    { code: 'T0703', name: 'AI芯片与算力', keywords: ['AI芯片', 'GPU', 'TPU', '算力', '智算中心'] },
    { code: 'T0704', name: '计算机视觉', keywords: ['CV', '图像识别', '人脸识别', '自动驾驶视觉'] },
    { code: 'T0705', name: '自然语言处理', keywords: ['NLP', '文本理解', '机器翻译', '智能客服'] },
    { code: 'T0706', name: 'AI商业化', keywords: ['AI落地', '商业化', 'ROI', 'AI变现', '企业服务'] },
    { code: 'T0707', name: 'AI安全与治理', keywords: ['AI安全', 'AI伦理', '算法治理', '数据隐私'] },
  ],
  
  'D05': [  // 新能源
    { code: 'T0501', name: '光伏产业链', keywords: ['光伏', '硅料', '组件', '逆变器', '光伏电站'] },
    { code: 'T0502', name: '储能技术', keywords: ['储能', '锂电池', '钠电池', '液流电池', '储能系统'] },
    { code: 'T0503', name: '电动汽车', keywords: ['电动车', '动力电池', '充电桩', '换电', '智能网联'] },
    { code: 'T0504', name: '风电产业', keywords: ['风电', '风机', '海上风电', '风电场'] },
    { code: 'T0505', name: '氢能', keywords: ['氢能', '氢燃料电池', '绿氢', '氢能汽车'] },
  ],
  
  // ... 其他领域
};
```

#### 3.2.3 标签 (Tag) 管理

```typescript
// 标签体系
interface TagSystem {
  // 系统标签 (预定义，不可删除)
  systemTags: {
    // 时间标签
    years: ['2024', '2025', '2026', '2027'],
    quarters: ['Q1', 'Q2', 'Q3', 'Q4'],
    
    // 内容类型
    contentTypes: ['深度研报', '快讯', '评论', '调研', '数据报告'],
    
    // 市场观点
    marketViews: ['看涨', '看跌', '中性', '震荡'],
    
    // 内容形式
    formats: ['图文', '视频', '音频', '信息图', '数据可视化'],
  };
  
  // 动态标签 (AI提取 + 用户添加)
  dynamicTags: {
    companies: string[];    // 公司名称
    products: string[];     // 产品名称
    technologies: string[]; // 技术名称
    persons: string[];      // 人物名称
    events: string[];       // 事件名称
    concepts: string[];     // 概念名称
  };
}
```

### 3.3 映射关系设计

#### 3.3.1 Expert-Library 映射

| Expert Domain Code | Expert Domain Name | 统一领域编码 | 统一领域名称 |
|-------------------|-------------------|-------------|-------------|
| E01 | 宏观经济 | D01 | 宏观经济 |
| E02 | 金融科技 | D04 | 金融科技 |
| E03 | 新能源 | D05 | 新能源 |
| E04 | 生物医药 | D08 | 生物医药 |
| E05 | 消费品 | D09 | 消费品与零售 |
| E06 | 半导体 | D06 | 半导体与芯片 |
| E07 | 人工智能 | D07 | 人工智能 |
| E08 | 房地产 | D02 | 房地产与建筑 |
| E09 | 文化传媒 | - | (合并至 D10 TMT) |
| E10 | 高端制造 | D11 | 高端制造 |
| E11 | ESG | D15 | ESG与环保 |
| E12 | 出海 | D10/D11/D12 | (跨境主题分散) |

**映射规则**:
```typescript
const EXPERT_DOMAIN_MAPPING: Record<string, string> = {
  'E01': 'D01',   // 宏观经济
  'E02': 'D04',   // 金融科技
  'E03': 'D05',   // 新能源
  'E04': 'D08',   // 生物医药
  'E05': 'D09',   // 消费品
  'E06': 'D06',   // 半导体
  'E07': 'D07',   // 人工智能
  'E08': 'D02',   // 房地产
  'E09': 'D10',   // 文化传媒 → TMT
  'E10': 'D11',   // 高端制造
  'E11': 'D15',   // ESG
  'E12': 'D12',   // 出海 → 交运物流 (主要)
};
```

#### 3.3.2 RSS 分类映射

| RSS Category | RSS 名称 | 映射领域 | 映射规则 |
|-------------|---------|---------|---------|
| tech | 科技 | D06/D07/D10 | 根据内容关键词细分：AI→D07, 芯片→D06, 其他→D10 |
| news | 新闻 | D01/D14 | 财经新闻→D01, 政策新闻→D14 |
| finance | 财经 | D04/D13 | 金融科技→D04, 资本市场→D13 |
| dev | 开发者 | D06/D07/D10 | AI开发→D07, 芯片开发→D06, 其他→D10 |
| science | 科学 | D06/D08 | 生物科学→D08, 其他科学→D06 |
| research | 研究 | D04/D06/D07/D08 | 根据研究主题映射 |
| international | 国际 | D01/D14 | 国际财经→D01, 国际政策→D14 |

**智能映射逻辑**:
```typescript
function mapRSSToDomain(rssItem: RSSItem): string {
  const { category, title, tags } = rssItem;
  
  // 优先级1: 基于关键词直接映射
  for (const [domainCode, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
    if (keywords.some(k => title.includes(k) || tags.includes(k))) {
      return domainCode;
    }
  }
  
  // 优先级2: 基于 RSS 分类 + 内容分析
  const categoryMapping: Record<string, string[]> = {
    'tech': ['D07', 'D06', 'D10'],
    'finance': ['D04', 'D13'],
    'news': ['D01', 'D14'],
    // ...
  };
  
  const possibleDomains = categoryMapping[category] || ['D01'];
  
  // 如果有多个可能，使用 AI 进行二次分类
  if (possibleDomains.length > 1) {
    return aiClassifyDomain(title, possibleDomains);
  }
  
  return possibleDomains[0];
}
```

#### 3.3.3 Assets Themes 映射

```typescript
// themes 表与统一字典的映射
const THEME_DOMAIN_MAPPING: Record<string, string> = {
  // 房地产相关
  'theme_001': 'D02',   // 房地产
  'theme_002': 'D03',   // 保租房
  
  // 新能源相关
  'theme_003': 'D05',   // 新能源
  'theme_004': 'D05',   // 储能
  
  // AI相关
  'theme_005': 'D07',   // 人工智能
  'theme_006': 'D07',   // 大模型 → T0701
  
  // ... 其他映射
};

// 映射后 themes 表扩展
interface AssetTheme {
  id: string;
  name: string;
  unified_domain_code: string;    // 新增: 映射到统一领域
  unified_theme_code?: string;    // 新增: 映射到统一主题
  mapping_confidence: number;     // 新增: 映射置信度
  // ... 其他字段
}
```

---

## 4. 数据模型

### 4.1 统一字典表

```sql
-- ============================================
-- 统一分类字典 - 领域表 (Domains)
-- ============================================
CREATE TABLE unified_domains (
  code VARCHAR(10) PRIMARY KEY,           -- D01, D02, ...
  name VARCHAR(50) NOT NULL,              -- 宏观经济
  name_en VARCHAR(50),                    -- Macroeconomy
  description TEXT,                       -- 领域定义
  icon VARCHAR(50),                       -- 图标
  color VARCHAR(20),                      -- 主题色
  sort_order INTEGER DEFAULT 0,           -- 排序
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 初始化数据
INSERT INTO unified_domains (code, name, name_en, description, color, sort_order) VALUES
('D01', '宏观经济', 'Macroeconomy', 'GDP、通胀、利率、汇率等宏观经济指标与政策', '#3498db', 1),
('D02', '房地产与建筑', 'Real Estate', '住宅、商业、建筑、物业管理', '#e74c3c', 2),
('D03', '保租房与租赁住房', 'Rental Housing', '保障性租赁住房、长租公寓', '#9b59b6', 3),
('D04', '金融科技', 'FinTech', '数字金融、区块链、智能投顾', '#f39c12', 4),
('D05', '新能源', 'New Energy', '光伏、风电、储能、电动汽车', '#27ae60', 5),
('D06', '半导体与芯片', 'Semiconductor', '芯片设计、制造、封测、设备材料', '#16a085', 6),
('D07', '人工智能', 'AI', '大模型、机器学习、计算机视觉、NLP', '#8e44ad', 7),
('D08', '生物医药', 'Biomedical', '创新药、医疗器械、CXO、基因治疗', '#e67e22', 8),
('D09', '消费品与零售', 'Consumer', '品牌、零售、电商、新消费', '#d35400', 9),
('D10', 'TMT与互联网', 'TMT', '互联网、软件、云计算、5G', '#2c3e50', 10),
('D11', '高端制造', 'Manufacturing', '工业自动化、机器人、航空航天', '#34495e', 11),
('D12', '交运物流', 'Logistics', '物流、供应链、航运、快递', '#1abc9c', 12),
('D13', '资本市场', 'Capital Market', '证券、基金、IPO、并购重组', '#c0392b', 13),
('D14', '政策与监管', 'Policy', '行业政策、监管动态、法规解读', '#7f8c8d', 14),
('D15', 'ESG与环保', 'ESG', '碳中和、绿色金融、社会责任', '#2ecc71', 15);

-- ============================================
-- 统一分类字典 - 主题表 (Themes)
-- ============================================
CREATE TABLE unified_themes (
  code VARCHAR(10) PRIMARY KEY,           -- T0701, T0702, ...
  domain_code VARCHAR(10) NOT NULL REFERENCES unified_domains(code),
  name VARCHAR(50) NOT NULL,              -- 大模型与基础技术
  name_en VARCHAR(50),
  description TEXT,
  keywords TEXT[],                        -- 关键词数组
  parent_code VARCHAR(10),                -- 支持层级主题
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 初始化主题数据 (示例: 人工智能领域)
INSERT INTO unified_themes (code, domain_code, name, keywords, sort_order) VALUES
('T0701', 'D07', '大模型与基础技术', ARRAY['大模型', 'LLM', 'GPT', '基础模型', 'Transformer'], 1),
('T0702', 'D07', 'AIGC与应用', ARRAY['AIGC', '生成式AI', '文生图', '文生视频', 'AI应用'], 2),
('T0703', 'D07', 'AI芯片与算力', ARRAY['AI芯片', 'GPU', 'TPU', '算力', '智算中心'], 3),
('T0704', 'D07', '计算机视觉', ARRAY['CV', '图像识别', '人脸识别', '自动驾驶视觉'], 4),
('T0705', 'D07', '自然语言处理', ARRAY['NLP', '文本理解', '机器翻译', '智能客服'], 5),
('T0706', 'D07', 'AI商业化', ARRAY['AI落地', '商业化', 'ROI', 'AI变现', '企业服务'], 6),
('T0707', 'D07', 'AI安全与治理', ARRAY['AI安全', 'AI伦理', '算法治理', '数据隐私'], 7);

-- ============================================
-- 统一分类字典 - 标签表 (Tags)
-- ============================================
CREATE TABLE unified_tags (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  tag_type VARCHAR(20) NOT NULL,          -- system/company/product/technology/person/event/concept
  domain_codes TEXT[],                    -- 关联领域
  theme_codes TEXT[],                     -- 关联主题
  synonyms TEXT[],                        -- 同义词
  is_system BOOLEAN DEFAULT FALSE,        -- 系统标签不可删除
  usage_count INTEGER DEFAULT 0,          -- 使用次数
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 系统标签初始化
INSERT INTO unified_tags (name, tag_type, is_system) VALUES
-- 时间标签
('2024', 'year', TRUE), ('2025', 'year', TRUE), ('2026', 'year', TRUE),
('Q1', 'quarter', TRUE), ('Q2', 'quarter', TRUE), ('Q3', 'quarter', TRUE), ('Q4', 'quarter', TRUE),
-- 内容类型
('深度研报', 'content_type', TRUE), ('快讯', 'content_type', TRUE), 
('评论', 'content_type', TRUE), ('调研', 'content_type', TRUE),
-- 市场观点
('看涨', 'market_view', TRUE), ('看跌', 'market_view', TRUE), ('中性', 'market_view', TRUE);

-- ============================================
-- 系统映射配置表
-- ============================================
CREATE TABLE taxonomy_mappings (
  id SERIAL PRIMARY KEY,
  source_system VARCHAR(20) NOT NULL,     -- expert_library/rss/assets
  source_code VARCHAR(50) NOT NULL,       -- 原系统编码
  source_name VARCHAR(100),               -- 原系统名称
  unified_domain_code VARCHAR(10) REFERENCES unified_domains(code),
  unified_theme_code VARCHAR(10) REFERENCES unified_themes(code),
  mapping_type VARCHAR(20),               -- direct/fuzzy/ai
  confidence DECIMAL(3,2),                -- 映射置信度
  mapping_rules JSONB,                    -- 映射规则配置
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(source_system, source_code)
);

-- 初始化 Expert-Library 映射
INSERT INTO taxonomy_mappings (source_system, source_code, source_name, unified_domain_code, mapping_type, confidence) VALUES
('expert_library', 'E01', '宏观经济', 'D01', 'direct', 1.0),
('expert_library', 'E02', '金融科技', 'D04', 'direct', 1.0),
('expert_library', 'E03', '新能源', 'D05', 'direct', 1.0),
('expert_library', 'E04', '生物医药', 'D08', 'direct', 1.0),
('expert_library', 'E05', '消费品', 'D09', 'direct', 1.0),
('expert_library', 'E06', '半导体', 'D06', 'direct', 1.0),
('expert_library', 'E07', '人工智能', 'D07', 'direct', 1.0),
('expert_library', 'E08', '房地产', 'D02', 'direct', 1.0),
('expert_library', 'E09', '文化传媒', 'D10', 'direct', 0.9),
('expert_library', 'E10', '高端制造', 'D11', 'direct', 1.0),
('expert_library', 'E11', 'ESG', 'D15', 'direct', 1.0),
('expert_library', 'E12', '出海', 'D12', 'fuzzy', 0.8);

-- 初始化 RSS 分类映射 (带规则)
INSERT INTO taxonomy_mappings (source_system, source_code, source_name, unified_domain_code, mapping_type, confidence, mapping_rules) VALUES
('rss', 'tech', '科技', 'D07', 'fuzzy', 0.7, '{"keywords": {"D07": ["AI", "人工智能"], "D06": ["芯片", "半导体"], "D10": ["互联网", "软件"]}}'),
('rss', 'finance', '财经', 'D04', 'fuzzy', 0.7, '{"keywords": {"D04": ["金融科技"], "D13": ["股市", "基金"]}}'),
('rss', 'news', '新闻', 'D01', 'fuzzy', 0.6, '{"keywords": {"D01": ["经济", "GDP"], "D14": ["政策", "监管"]}}');
```

### 4.2 扩展现有表

```sql
-- ============================================
-- 扩展 rss_items 表 - 添加统一分类字段
-- ============================================
ALTER TABLE rss_items 
  ADD COLUMN unified_domain_code VARCHAR(10) REFERENCES unified_domains(code),
  ADD COLUMN unified_theme_code VARCHAR(10) REFERENCES unified_themes(code),
  ADD COLUMN unified_tags TEXT[],
  ADD COLUMN taxonomy_confidence DECIMAL(3,2),
  ADD COLUMN taxonomy_mapped_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX idx_rss_unified_domain ON rss_items(unified_domain_code);
CREATE INDEX idx_rss_unified_theme ON rss_items(unified_theme_code);
CREATE INDEX idx_rss_unified_tags ON rss_items USING GIN(unified_tags);

-- ============================================
-- 扩展 assets 表 - 添加统一分类字段
-- ============================================
ALTER TABLE assets 
  ADD COLUMN unified_domain_code VARCHAR(10) REFERENCES unified_domains(code),
  ADD COLUMN unified_theme_code VARCHAR(10) REFERENCES unified_themes(code),
  ADD COLUMN unified_tags TEXT[],
  ADD COLUMN taxonomy_confidence DECIMAL(3,2),
  ADD COLUMN taxonomy_mapped_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX idx_assets_unified_domain ON assets(unified_domain_code);
CREATE INDEX idx_assets_unified_theme ON assets(unified_theme_code);
CREATE INDEX idx_assets_unified_tags ON assets USING GIN(unified_tags);

-- ============================================
-- 扩展 themes 表 - 添加统一分类映射
-- ============================================
ALTER TABLE themes 
  ADD COLUMN unified_domain_code VARCHAR(10) REFERENCES unified_domains(code),
  ADD COLUMN unified_theme_code VARCHAR(10) REFERENCES unified_themes(code),
  ADD COLUMN mapping_confidence DECIMAL(3,2),
  ADD COLUMN mapping_status VARCHAR(20) DEFAULT 'pending'; -- pending/confirmed/rejected

CREATE INDEX idx_themes_unified_domain ON themes(unified_domain_code);

-- ============================================
-- 扩展 experts 表 (或 expert_profiles)
-- ============================================
-- 注: 如果 domain_code 已存在，添加映射关系
-- 如果 experts 表结构不同，请根据实际情况调整
```

---

## 5. 技术实现

### 5.1 核心服务

```typescript
// 统一分类字典服务
class UnifiedTaxonomyService {
  constructor(private db: Database, private aiService: AIService) {}
  
  // ==================== 字典管理 ====================
  
  // 获取所有领域
  async getDomains(): Promise<UnifiedDomain[]> {
    return this.db.query('SELECT * FROM unified_domains WHERE is_active = TRUE ORDER BY sort_order');
  }
  
  // 获取领域下主题
  async getThemesByDomain(domainCode: string): Promise<UnifiedTheme[]> {
    return this.db.query(
      'SELECT * FROM unified_themes WHERE domain_code = $1 AND is_active = TRUE ORDER BY sort_order',
      [domainCode]
    );
  }
  
  // 搜索标签
  async searchTags(query: string, limit: number = 10): Promise<UnifiedTag[]> {
    return this.db.query(
      `SELECT * FROM unified_tags 
       WHERE name ILIKE $1 OR $1 = ANY(synonyms)
       ORDER BY usage_count DESC
       LIMIT $2`,
      [`%${query}%`, limit]
    );
  }
  
  // ==================== 智能分类 ====================
  
  // 智能分类入口 - 统一方法
  async classifyContent(content: ClassifiableContent): Promise<ClassificationResult> {
    const { title, summary, tags, sourceType } = content;
    
    // 1. 基于关键词的预分类
    const keywordResult = this.classifyByKeywords(title, summary, tags);
    
    // 2. 如果关键词分类置信度低，使用 AI 分类
    if (keywordResult.confidence < 0.7) {
      const aiResult = await this.classifyByAI(content);
      return this.mergeClassificationResults(keywordResult, aiResult);
    }
    
    return keywordResult;
  }
  
  // 基于关键词分类
  private classifyByKeywords(title: string, summary: string, tags: string[]): ClassificationResult {
    const text = `${title} ${summary} ${tags.join(' ')}`;
    const scores: Record<string, number> = {};
    
    // 遍历所有领域，计算匹配分数
    for (const domain of this.domainKeywordsCache) {
      let score = 0;
      for (const keyword of domain.keywords) {
        const regex = new RegExp(keyword, 'gi');
        const matches = text.match(regex);
        if (matches) {
          score += matches.length * keyword.weight;
        }
      }
      scores[domain.code] = score;
    }
    
    // 找出最高分
    const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    const [topDomain, topScore] = sorted[0];
    const totalScore = Object.values(scores).reduce((a, b) => a + b, 0);
    
    return {
      domainCode: topDomain,
      confidence: Math.min(topScore / (totalScore * 0.5), 1),
      method: 'keyword'
    };
  }
  
  // AI 辅助分类
  private async classifyByAI(content: ClassifiableContent): Promise<ClassificationResult> {
    const prompt = this.buildClassificationPrompt(content);
    const response = await this.aiService.complete(prompt);
    return this.parseClassificationResponse(response);
  }
  
  // ==================== 系统映射 ====================
  
  // 映射 RSS 条目到统一分类
  async mapRSSToUnified(rssItem: RSSItem): Promise<UnifiedMapping> {
    // 1. 查询预定义映射
    const predefined = await this.db.query(
      'SELECT unified_domain_code, confidence FROM taxonomy_mappings WHERE source_system = $1 AND source_code = $2',
      ['rss', rssItem.category]
    );
    
    // 2. 智能分类
    const classification = await this.classifyContent({
      title: rssItem.title,
      summary: rssItem.summary,
      tags: rssItem.tags,
      sourceType: 'rss'
    });
    
    // 3. 如果预定义映射与智能分类一致，提高置信度
    if (predefined.length > 0 && predefined[0].unified_domain_code === classification.domainCode) {
      return {
        domainCode: classification.domainCode,
        confidence: Math.max(classification.confidence, predefined[0].confidence),
        method: 'hybrid'
      };
    }
    
    return classification;
  }
  
  // 映射 Asset 到统一分类
  async mapAssetToUnified(asset: Asset): Promise<UnifiedMapping> {
    // 1. 如果已有 theme，查询 theme 映射
    if (asset.theme_id) {
      const themeMapping = await this.db.query(
        'SELECT unified_domain_code, unified_theme_code FROM themes WHERE id = $1',
        [asset.theme_id]
      );
      
      if (themeMapping.length > 0 && themeMapping[0].unified_domain_code) {
        return {
          domainCode: themeMapping[0].unified_domain_code,
          themeCode: themeMapping[0].unified_theme_code,
          confidence: 0.8,
          method: 'theme_mapping'
        };
      }
    }
    
    // 2. 智能分类
    return this.classifyContent({
      title: asset.title,
      summary: asset.description || '',
      tags: asset.tags || [],
      sourceType: 'asset'
    });
  }
  
  // ==================== 批量处理 ====================
  
  // 批量分类 RSS 条目
  async batchClassifyRSS(items: RSSItem[]): Promise<BatchClassificationResult> {
    const results = [];
    
    for (const item of items) {
      const mapping = await this.mapRSSToUnified(item);
      results.push({
        itemId: item.id,
        ...mapping
      });
      
      // 更新数据库
      await this.db.query(
        `UPDATE rss_items 
         SET unified_domain_code = $1, 
             taxonomy_confidence = $2,
             taxonomy_mapped_at = NOW()
         WHERE id = $3`,
        [mapping.domainCode, mapping.confidence, item.id]
      );
    }
    
    return { total: items.length, classified: results };
  }
  
  // 批量分类 Assets
  async batchClassifyAssets(assets: Asset[]): Promise<BatchClassificationResult> {
    // 类似 RSS 的批量处理
    // ...
  }
}
```

### 5.2 AI 分类 Prompt

```typescript
// AI 分类 Prompt 模板
const CLASSIFICATION_PROMPT = `
你是一位专业的财经科技内容分类专家，熟悉我们的统一分类体系。

请将以下内容分类到最合适的领域：

【统一分类体系】
D01 宏观经济 - GDP、通胀、利率、汇率等
D02 房地产与建筑 - 住宅、商业、建筑、物业
D03 保租房与租赁住房 - 保障性租赁住房、长租公寓
D04 金融科技 - 数字金融、区块链、智能投顾
D05 新能源 - 光伏、风电、储能、电动汽车
D06 半导体与芯片 - 芯片设计、制造、封测
D07 人工智能 - 大模型、机器学习、CV、NLP
D08 生物医药 - 创新药、医疗器械、CXO
D09 消费品与零售 - 品牌、零售、电商
D10 TMT与互联网 - 互联网、软件、云计算、5G
D11 高端制造 - 工业自动化、机器人、航空航天
D12 交运物流 - 物流、供应链、航运、快递
D13 资本市场 - 证券、基金、IPO、并购重组
D14 政策与监管 - 行业政策、监管动态
D15 ESG与环保 - 碳中和、绿色金融

【待分类内容】
标题: {title}
摘要: {summary}
标签: {tags}

【输出要求】
1. 选择最匹配的领域编码 (D01-D15)
2. 给出置信度分数 (0-1)
3. 给出分类理由

【输出格式】
{
  "domainCode": "D07",
  "confidence": 0.92,
  "reason": "标题和摘要明确提到大模型技术和AI应用，属于人工智能核心领域"
}
`;
```

### 5.3 API 接口

```typescript
// ==================== 字典管理 API ====================

// GET /api/v1/taxonomy/domains
// 获取所有领域列表
interface GetDomainsResponse {
  items: {
    code: string;
    name: string;
    nameEn: string;
    description: string;
    icon: string;
    color: string;
  }[];
}

// GET /api/v1/taxonomy/domains/:code/themes
// 获取领域下主题列表
interface GetThemesResponse {
  domain: string;
  items: {
    code: string;
    name: string;
    keywords: string[];
  }[];
}

// GET /api/v1/taxonomy/tags?query=:query
// 搜索标签
interface SearchTagsResponse {
  query: string;
  items: {
    id: number;
    name: string;
    type: string;
    usageCount: number;
  }[];
}

// ==================== 智能分类 API ====================

// POST /api/v1/taxonomy/classify
// 智能分类内容
interface ClassifyRequest {
  title: string;
  summary?: string;
  tags?: string[];
  sourceType: 'rss' | 'asset' | 'expert';
}

interface ClassifyResponse {
  domainCode: string;
  domainName: string;
  themeCode?: string;
  themeName?: string;
  tags: string[];
  confidence: number;
  method: 'keyword' | 'ai' | 'hybrid' | 'mapping';
}

// ==================== 批量处理 API ====================

// POST /api/v1/taxonomy/batch-classify-rss
// 批量分类 RSS 条目
interface BatchClassifyRSSRequest {
  itemIds?: string[];  // 不传则处理所有未分类
  force?: boolean;     // 强制重新分类
}

interface BatchClassifyRSSResponse {
  jobId: string;
  total: number;
  processed: number;
  failed: number;
  results: {
    itemId: string;
    domainCode: string;
    confidence: number;
  }[];
}

// POST /api/v1/taxonomy/batch-classify-assets
// 批量分类 Assets
interface BatchClassifyAssetsRequest {
  assetIds?: string[];
  force?: boolean;
}

// ==================== 映射管理 API ====================

// GET /api/v1/taxonomy/mappings
// 获取系统映射配置
interface GetMappingsRequest {
  sourceSystem?: 'expert_library' | 'rss' | 'assets';
}

// PUT /api/v1/taxonomy/mappings/:id
// 更新映射配置 (管理员)
interface UpdateMappingRequest {
  unifiedDomainCode: string;
  unifiedThemeCode?: string;
  confidence: number;
  isActive: boolean;
}

// POST /api/v1/taxonomy/themes/:id/map
// 手动映射 theme 到统一分类
interface MapThemeRequest {
  unifiedDomainCode: string;
  unifiedThemeCode?: string;
}

// ==================== 统计 API ====================

// GET /api/v1/taxonomy/stats
// 分类统计
interface TaxonomyStatsResponse {
  // 总体统计
  total: {
    rssClassified: number;
    assetsClassified: number;
    averageConfidence: number;
  };
  
  // 领域分布
  domainDistribution: {
    domainCode: string;
    domainName: string;
    rssCount: number;
    assetsCount: number;
  }[];
  
  // 分类质量
  classificationQuality: {
    highConfidence: number;  // > 0.8
    mediumConfidence: number; // 0.5-0.8
    lowConfidence: number;   // < 0.5
  };
}
```

---

## 7. 实施计划

### 7.1 Phase 1: 基础数据 (3 天)

| 任务 | 负责人 | 工时 | 验收标准 |
|------|--------|------|----------|
| 创建统一字典表 (domains/themes/tags) | 后端 | 0.5d | 表结构正确，索引完备 |
| 初始化领域数据 (15个领域) | 后端 | 0.5d | 数据完整，编码规范 |
| 初始化主题数据 (每领域5-10个) | 后端 | 1d | 覆盖核心业务主题 |
| 扩展现有表 (rss_items/assets/themes) | 后端 | 0.5d | 字段添加正确 |
| 初始化映射配置 | 后端 | 0.5d | 三大系统映射配置完成 |

### 7.2 Phase 2: 核心服务 (4 天)

| 任务 | 负责人 | 工时 | 验收标准 |
|------|--------|------|----------|
| UnifiedTaxonomyService 开发 | 后端 | 1.5d | 字典管理、分类、映射功能完整 |
| 关键词分类引擎 | 后端 | 1d | 分类准确率 > 70% |
| AI 分类集成 | 后端 | 1d | LLM 分类准确，Prompt 稳定 |
| 批量处理服务 | 后端 | 0.5d | 支持 RSS/Assets 批量分类 |

### 7.3 Phase 3: API 与迁移 (3 天)

| 任务 | 负责人 | 工时 | 验收标准 |
|------|--------|------|----------|
| Taxonomy API 开发 | 后端 | 1d | 所有接口可用 |
| 历史数据迁移脚本 | 后端 | 1d | RSS + Assets 全量分类 |
| 映射管理后台 API | 后端 | 0.5d | 支持手动调整映射 |
| 定时分类任务 | 后端 | 0.5d | 新数据自动分类 |

### 7.4 Phase 4: 自动专家评审 (4 天) 【新增】

| 任务 | 负责人 | 工时 | 验收标准 |
|------|--------|------|----------|
| 评审任务数据模型 | 后端 | 0.5d | 表结构正确，关联关系完整 |
| 专家匹配引擎 | 后端 | 1d | 基于统一分类匹配专家，准确率 > 85% |
| 触发器服务 | 后端 | 0.5d | 自动触发条件配置化，触发准确率 > 85% |
| 评审流程状态机 | 后端 | 1d | 状态流转正确，支持多专家并行 |
| 结果汇总算法 | 后端 | 0.5d | 多维度加权计算，结果一致性 > 80% |
| 与 v6.1/v6.2 集成 | 后端 | 0.5d | 分类完成后自动触发评审 |

### 7.5 Phase 5: 前端集成 (4 天)

| 任务 | 负责人 | 工时 | 验收标准 |
|------|--------|------|----------|
| 统一分类选择器组件 | 前端 | 1d | 支持三级分类选择 |
| RSS 列表显示统一分类 | 前端 | 0.5d | 领域标签展示 |
| Assets 主题映射界面 | 前端 | 0.5d | 支持手动映射调整 |
| 分类统计仪表盘 | 前端 | 0.5d | 领域分布可视化 |
| **专家评审工作台** | **前端** | **1d** | **评审任务列表、评审表单、结果展示** |
| **评审管理后台** | **前端** | **0.5d** | **触发配置、评审监控、专家 workload** |

### 7.6 Phase 6: 验证与优化 (3 天)

| 任务 | 负责人 | 工时 | 验收标准 |
|------|--------|------|----------|
| 分类准确率测试 | 产品+技术 | 0.5d | 抽样准确率 > 85% |
| 映射关系审核 | 产品 | 0.5d | 核心主题映射正确 |
| Prompt 调优 | 后端 | 0.5d | AI 分类准确率 > 80% |
| **自动评审流程测试** | **产品+技术** | **1d** | **端到端流程验证，触发准确率 > 85%** |
| **专家评审准确性** | **专家+产品** | **0.5d** | **评审结果一致性 > 80%** |

---

## 8. 数据迁移方案

### 8.1 迁移策略

```
┌─────────────────────────────────────────────────────────────────┐
│                     数据迁移流程                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Step 1: 系统映射导入                                            │
│  ├── 导入 Expert-Library 映射 (E01→D01)                          │
│  ├── 导入 RSS 分类映射 (tech→D07/D06/D10)                        │
│  └── 导入 Assets 主题映射 (theme_id→Dxx)                         │
│                                                                 │
│  Step 2: 历史数据分类                                            │
│  ├── 批量分类 RSS items (基于现有 category + 内容)                │
│  ├── 批量分类 Assets (基于 theme_id + 内容)                       │
│  └── 标记置信度低的记录供人工审核                                 │
│                                                                 │
│  Step 3: 人工审核                                                │
│  ├── 审核置信度 < 0.5 的分类                                     │
│  ├── 审核主题-领域映射关系                                       │
│  └── 确认/修正分类结果                                           │
│                                                                 │
│  Step 4: 切换上线                                                │
│  ├── 启用统一分类查询                                            │
│  ├── 保留原字段用于兼容                                          │
│  └── 监控分类质量                                                │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 8.2 迁移脚本

```typescript
// 历史数据迁移脚本
async function migrateHistoricalData() {
  // 1. 迁移 RSS items
  const rssItems = await db.query(
    'SELECT * FROM rss_items WHERE unified_domain_code IS NULL'
  );
  
  console.log(`Found ${rssItems.length} RSS items to classify`);
  
  const batchSize = 100;
  for (let i = 0; i < rssItems.length; i += batchSize) {
    const batch = rssItems.slice(i, i + batchSize);
    await taxonomyService.batchClassifyRSS(batch);
    console.log(`Processed ${i + batch.length}/${rssItems.length}`);
  }
  
  // 2. 迁移 Assets
  const assets = await db.query(
    'SELECT * FROM assets WHERE unified_domain_code IS NULL'
  );
  
  console.log(`Found ${assets.length} Assets to classify`);
  
  for (let i = 0; i < assets.length; i += batchSize) {
    const batch = assets.slice(i, i + batchSize);
    await taxonomyService.batchClassifyAssets(batch);
    console.log(`Processed ${i + batch.length}/${assets.length}`);
  }
  
  // 3. 生成审核报告
  const auditReport = await generateAuditReport();
  console.log('Audit report:', auditReport);
}

// 生成审核报告
async function generateAuditReport() {
  const lowConfidenceRss = await db.query(
    'SELECT COUNT(*) FROM rss_items WHERE taxonomy_confidence < 0.5'
  );
  
  const lowConfidenceAssets = await db.query(
    'SELECT COUNT(*) FROM assets WHERE taxonomy_confidence < 0.5'
  );
  
  const domainDistribution = await db.query(
    'SELECT unified_domain_code, COUNT(*) FROM rss_items GROUP BY unified_domain_code'
  );
  
  return {
    lowConfidenceCount: {
      rss: parseInt(lowConfidenceRss[0].count),
      assets: parseInt(lowConfidenceAssets[0].count)
    },
    domainDistribution,
    needsManualReview: parseInt(lowConfidenceRss[0].count) + parseInt(lowConfidenceAssets[0].count)
  };
}
```

---

## 6. 基于分类的自动专家评审 (FR-6.3-006)

### 6.1 功能概述

基于统一分类字典，实现**内容自动分类 → 专家智能匹配 → 自动评审触发**的闭环流程，解决当前专家分配依赖人工、评审标准不统一的问题。

```
┌─────────────────────────────────────────────────────────────────┐
│                  自动专家评审流程                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   RSS/Assets 内容                                                │
│       │                                                         │
│       ▼                                                         │
│   ┌─────────────────┐                                           │
│   │  v6.3 统一分类   │ ──→ 领域 D07 (人工智能)                    │
│   └─────────────────┘                                           │
│       │                                                         │
│       ▼                                                         │
│   ┌─────────────────┐    匹配失败    ┌─────────────────┐       │
│   │  专家匹配引擎    │ ───────────→ │  通用专家池      │       │
│   │                 │               │  (事实/逻辑核查)  │       │
│   └─────────────────┘               └─────────────────┘       │
│       │                              │                         │
│       │ 匹配成功                     │                         │
│       ▼                              │                         │
│   ┌─────────────────┐               │                         │
│   │  D07 领域专家    │───────────────┘                         │
│   │  + 通用专家      │                                         │
│   └─────────────────┘                                           │
│       │                                                         │
│       ▼                                                         │
│   ┌─────────────────┐                                           │
│   │  自动创建评审任务 │                                           │
│   │  - 评审维度配置   │                                           │
│   │  - 截止时间设定   │                                           │
│   └─────────────────┘                                           │
│       │                                                         │
│       ▼                                                         │
│   ┌─────────────────┐                                           │
│   │  专家评审执行    │ ◄──── 专家在线评审                        │
│   │  - 领域评审     │                                           │
│   │  - 事实核查     │                                           │
│   │  - 逻辑审查     │                                           │
│   └─────────────────┘                                           │
│       │                                                         │
│       ▼                                                         │
│   ┌─────────────────┐                                           │
│   │  评审结果汇总    │ ──→ 质量评分 / 发布建议 / 改进反馈         │
│   └─────────────────┘                                           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 6.2 触发条件

#### 6.2.1 自动触发策略

| 触发场景 | 条件 | 优先级 | 说明 |
|---------|------|--------|------|
| **高质量内容** | AI质量评分 ≥ 80 | P0 | 高质量内容自动进入专家深度评审 |
| **热点关联** | 热度分数 ≥ 70 且 分类置信度 ≥ 0.8 | P1 | 热点内容快速专家把关 |
| **跨领域内容** | 涉及 ≥ 2 个领域 | P1 | 多领域内容需多专家会审 |
| **敏感领域** | D14(政策) / D13(资本市场) | P2 | 敏感内容强制专家审核 |
| **人工指定** | 用户标记"需要专家评审" | P0 | 人工介入 |

#### 6.2.2 触发器配置

```typescript
interface AutoReviewTriggerConfig {
  enabled: boolean;
  
  // 触发规则
  rules: {
    // 质量阈值触发
    qualityThreshold: {
      enabled: boolean;
      minScore: number;      // 默认 80
    };
    
    // 热度触发
    hotScoreThreshold: {
      enabled: boolean;
      minHotScore: number;   // 默认 70
      minConfidence: number; // 默认 0.8
    };
    
    // 领域敏感触发
    sensitiveDomains: {
      enabled: boolean;
      domainCodes: string[]; // ['D13', 'D14']
    };
    
    // 跨领域触发
    crossDomain: {
      enabled: boolean;
      minDomains: number;    // 默认 2
    };
  };
  
  // 排除规则
  exclusions: {
    // 已评审内容不重复触发
    skipReviewed: boolean;
    // 低质量内容跳过
    minQualityScore: number; // 默认 50
    // 特定来源排除
    excludedSources: string[];
  };
  
  // 频率控制
  rateLimit: {
    maxReviewsPerHour: number; // 默认 20
    maxReviewsPerDay: number;  // 默认 100
  };
}
```

### 6.3 专家匹配引擎

#### 6.3.1 匹配逻辑

```typescript
interface ExpertMatchingEngine {
  // 主匹配入口
  async matchExperts(content: ClassifiedContent): Promise<ExpertMatchResult> {
    const { unifiedDomainCode, unifiedThemeCode, quality, hotScore } = content;
    
    // 1. 匹配领域专家 (基于统一分类)
    const domainExperts = await this.matchDomainExperts(unifiedDomainCode, {
      themeCode: unifiedThemeCode,
      minAcceptanceRate: 0.7,
      maxWorkload: 5  // 排除 workload 过高的专家
    });
    
    // 2. 匹配主题专家 (更精准)
    const themeExperts = unifiedThemeCode 
      ? await this.matchThemeExperts(unifiedThemeCode)
      : [];
    
    // 3. 匹配通用专家 (必选项)
    const universalExperts = await this.matchUniversalExperts({
      factChecker: true,
      logicChecker: quality >= 80,  // 高质量内容加强逻辑审查
      readerRep: hotScore >= 70      // 热点内容增加读者代表
    });
    
    // 4. 负载均衡优化
    const optimizedExperts = await this.applyLoadBalancing([
      ...domainExperts,
      ...themeExperts
    ]);
    
    // 5. 组装评审小组
    return {
      primaryExperts: optimizedExperts.slice(0, 2),  // 主审专家 (1-2人)
      supportingExperts: optimizedExperts.slice(2, 4), // 辅审专家 (0-2人)
      universalExperts,                               // 通用专家 (必审)
      matchingReason: this.generateMatchingReason(optimizedExperts, content)
    };
  }
  
  // 领域专家匹配 (基于统一分类)
  private async matchDomainExperts(
    domainCode: string, 
    options: DomainMatchOptions
  ): Promise<Expert[]> {
    // 查询该领域的活跃专家
    const experts = await this.db.query(`
      SELECT e.*, 
             COALESCE(w.pending_reviews, 0) as workload,
             COALESCE(f.acceptance_rate, 0.75) as acceptance_rate
      FROM experts e
      LEFT JOIN expert_workload w ON e.id = w.expert_id
      LEFT JOIN expert_feedback_stats f ON e.id = f.expert_id
      WHERE e.unified_domain_code = $1
        AND e.status = 'active'
        AND COALESCE(w.pending_reviews, 0) <= $2
        AND COALESCE(f.acceptance_rate, 0.75) >= $3
      ORDER BY 
        CASE e.level 
          WHEN 'senior' THEN 1 
          WHEN 'domain' THEN 2 
          ELSE 3 
        END,
        COALESCE(f.acceptance_rate, 0.75) DESC
    `, [domainCode, options.maxWorkload, options.minAcceptanceRate]);
    
    return experts;
  }
  
  // 通用专家匹配
  private async matchUniversalExperts(config: UniversalConfig): Promise<UniversalExperts> {
    const result: UniversalExperts = {};
    
    if (config.factChecker) {
      result.factChecker = await this.getUniversalExpert('fact_checker');
    }
    
    if (config.logicChecker) {
      result.logicChecker = await this.getUniversalExpert('logic_checker');
    }
    
    if (config.readerRep) {
      result.readerRep = await this.getUniversalExpert('reader_rep');
    }
    
    return result;
  }
}
```

#### 6.3.2 专家-分类关联表

```sql
-- 扩展现有 experts 表，添加统一分类关联
ALTER TABLE experts 
  ADD COLUMN unified_domain_code VARCHAR(10) REFERENCES unified_domains(code),
  ADD COLUMN unified_theme_codes TEXT[],  -- 专家可覆盖多个主题
  ADD COLUMN expertise_tags TEXT[],       -- 专长标签
  ADD COLUMN review_scope VARCHAR(20) DEFAULT 'domain'; -- domain/theme/universal

-- 专家-领域匹配度评分表
CREATE TABLE expert_domain_proficiency (
  id SERIAL PRIMARY KEY,
  expert_id VARCHAR(50) NOT NULL REFERENCES experts(id) ON DELETE CASCADE,
  domain_code VARCHAR(10) NOT NULL REFERENCES unified_domains(code),
  theme_code VARCHAR(10) REFERENCES unified_themes(code),
  
  -- 专业度评分 (基于历史评审数据)
  proficiency_score DECIMAL(3,2),  -- 0-1
  review_count INTEGER DEFAULT 0,
  avg_quality_rating DECIMAL(3,2), -- 平均质量评分
  
  -- 活跃度
  last_review_at TIMESTAMP WITH TIME ZONE,
  monthly_review_count INTEGER DEFAULT 0,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(expert_id, domain_code, theme_code)
);

CREATE INDEX idx_edp_expert ON expert_domain_proficiency(expert_id);
CREATE INDEX idx_edp_domain ON expert_domain_proficiency(domain_code);
CREATE INDEX idx_edp_proficiency ON expert_domain_proficiency(proficiency_score DESC);
```

### 6.4 评审任务设计

#### 6.4.1 评审维度配置

```typescript
// 基于统一分类的评审维度配置
const REVIEW_DIMENSIONS_BY_DOMAIN: Record<string, ReviewDimension[]> = {
  'D07': [  // 人工智能领域评审维度
    { id: 'technical_accuracy', name: '技术准确性', weight: 0.25 },
    { id: 'trend_insight', name: '趋势洞察', weight: 0.20 },
    { id: 'business_application', name: '商业应用分析', weight: 0.20 },
    { id: 'data_support', name: '数据支撑', weight: 0.15 },
    { id: 'competitive_landscape', name: '竞争格局', weight: 0.10 },
    { id: 'risk_assessment', name: '风险评估', weight: 0.10 },
  ],
  
  'D04': [  // 金融科技领域评审维度
    { id: 'regulatory_compliance', name: '监管合规性', weight: 0.25 },
    { id: 'security_analysis', name: '安全性分析', weight: 0.20 },
    { id: 'market_impact', name: '市场影响', weight: 0.20 },
    { id: 'innovation_assessment', name: '创新性评估', weight: 0.15 },
    { id: 'feasibility', name: '可行性', weight: 0.10 },
    { id: 'user_value', name: '用户价值', weight: 0.10 },
  ],
  
  'D13': [  // 资本市场领域评审维度
    { id: 'investment_logic', name: '投资逻辑', weight: 0.25 },
    { id: 'risk_disclosure', name: '风险披露', weight: 0.20 },
    { id: 'data_accuracy', name: '数据准确性', weight: 0.20 },
    { id: 'valuation_rationality', name: '估值合理性', weight: 0.15 },
    { id: 'policy_sensitivity', name: '政策敏感性', weight: 0.10 },
    { id: 'market_timing', name: '市场时机', weight: 0.10 },
  ],
  
  // 默认通用维度
  'default': [
    { id: 'content_quality', name: '内容质量', weight: 0.25 },
    { id: 'data_accuracy', name: '数据准确性', weight: 0.20 },
    { id: 'logical_consistency', name: '逻辑一致性', weight: 0.20 },
    { id: 'insight_depth', name: '洞察深度', weight: 0.15 },
    { id: 'readability', name: '可读性', weight: 0.10 },
    { id: 'practical_value', name: '实用价值', weight: 0.10 },
  ]
};

interface ReviewDimension {
  id: string;
  name: string;
  weight: number;
  description?: string;
  scoringCriteria?: {
    excellent: string;  // 90-100
    good: string;       // 75-89
    average: string;    // 60-74
    poor: string;       // <60
  };
}
```

#### 6.4.2 评审任务数据模型

```sql
-- ============================================
-- 自动专家评审任务表
-- ============================================
CREATE TABLE auto_review_tasks (
  id VARCHAR(50) PRIMARY KEY,  -- task_xxx
  
  -- 来源内容
  source_type VARCHAR(20) NOT NULL,  -- rss/asset
  source_id VARCHAR(50) NOT NULL,    -- rss_item_id / asset_id
  
  -- 统一分类
  unified_domain_code VARCHAR(10) REFERENCES unified_domains(code),
  unified_theme_code VARCHAR(10) REFERENCES unified_themes(code),
  
  -- 触发信息
  trigger_type VARCHAR(20) NOT NULL,  -- quality/hot/cross_domain/sensitive/manual
  trigger_confidence DECIMAL(3,2),    -- 触发时的分类置信度
  
  -- 状态
  status VARCHAR(20) DEFAULT 'pending',  -- pending/assigned/in_progress/completed/rejected
  
  -- 评审配置
  review_config JSONB DEFAULT '{}',   -- 评审维度、截止时间等
  
  -- 时间戳
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  assigned_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  
  -- 结果汇总
  final_score INTEGER,
  final_decision VARCHAR(20),  -- approve/revise/reject
  
  UNIQUE(source_type, source_id)
);

CREATE INDEX idx_art_status ON auto_review_tasks(status);
CREATE INDEX idx_art_domain ON auto_review_tasks(unified_domain_code);
CREATE INDEX idx_art_source ON auto_review_tasks(source_type, source_id);

-- ============================================
-- 专家评审分配表
-- ============================================
CREATE TABLE auto_review_assignments (
  id SERIAL PRIMARY KEY,
  review_task_id VARCHAR(50) NOT NULL REFERENCES auto_review_tasks(id) ON DELETE CASCADE,
  expert_id VARCHAR(50) NOT NULL REFERENCES experts(id),
  
  -- 专家角色
  expert_role VARCHAR(20) NOT NULL,  -- primary/supporting/fact_checker/logic_checker/reader_rep
  
  -- 状态
  status VARCHAR(20) DEFAULT 'pending',  -- pending/accepted/rejected/completed
  
  -- 评审详情
  review_result JSONB,  -- { scores: {}, comments: '', decision: '' }
  
  -- 时间戳
  assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  accepted_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  
  -- 提醒
  reminder_count INTEGER DEFAULT 0,
  last_reminder_at TIMESTAMP WITH TIME ZONE,
  
  UNIQUE(review_task_id, expert_id)
);

CREATE INDEX idx_ara_task ON auto_review_assignments(review_task_id);
CREATE INDEX idx_ara_expert ON auto_review_assignments(expert_id);
CREATE INDEX idx_ara_status ON auto_review_assignments(status);

-- ============================================
-- 评审维度评分表
-- ============================================
CREATE TABLE auto_review_dimension_scores (
  id SERIAL PRIMARY KEY,
  assignment_id INTEGER NOT NULL REFERENCES auto_review_assignments(id) ON DELETE CASCADE,
  dimension_id VARCHAR(50) NOT NULL,
  dimension_name VARCHAR(100),
  weight DECIMAL(3,2),
  score INTEGER NOT NULL,  -- 0-100
  comment TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_ards_assignment ON auto_review_dimension_scores(assignment_id);
```

### 6.5 评审流程状态机

```
┌─────────────────────────────────────────────────────────────────┐
│                     自动专家评审状态机                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   [Content Created]                                             │
│        │                                                        │
│        ▼                                                        │
│   ┌─────────┐    满足触发条件     ┌─────────┐                  │
│   │ Classify│ ─────────────────→ │ PENDING │                  │
│   └─────────┘                    └────┬────┘                  │
│                                        │                        │
│                                        ▼                        │
│                              ┌─────────────────┐               │
│                              │  Match Experts  │               │
│                              └────────┬────────┘               │
│                                       │                         │
│                     ┌─────────────────┼─────────────────┐      │
│                     │                 │                 │      │
│                     ▼                 ▼                 ▼      │
│               ┌──────────┐     ┌──────────┐    ┌──────────┐  │
│               │ ASSIGNED │     │ ASSIGNED │    │ ASSIGNED │  │
│               │(主审专家) │     │(辅审专家) │    │(通用专家) │  │
│               └────┬─────┘     └────┬─────┘    └────┬─────┘  │
│                    │                │               │         │
│                    ▼                ▼               ▼         │
│               ┌──────────────────────────────────────────┐   │
│               │           IN_PROGRESS                     │   │
│               │  (所有专家接受后进入评审阶段)               │   │
│               └───────────────────┬──────────────────────┘   │
│                                   │                            │
│                    ┌──────────────┼──────────────┐            │
│                    │              │              │            │
│                    ▼              ▼              ▼            │
│               ┌────────┐    ┌────────┐    ┌────────┐        │
│               │COMPLETED│   │COMPLETED│   │COMPLETED│        │
│               │(主审)   │   │(辅审)   │   │(通用)   │        │
│               └────┬───┘    └────┬───┘    └────┬───┘        │
│                    │              │              │            │
│                    └──────────────┼──────────────┘            │
│                                   │                            │
│                                   ▼                            │
│                         ┌─────────────────┐                   │
│                         │  Aggregate Results                  │
│                         └────────┬────────┘                   │
│                                  │                             │
│                    ┌─────────────┼─────────────┐              │
│                    │             │             │              │
│                    ▼             ▼             ▼              │
│               ┌────────┐  ┌──────────┐  ┌──────────┐        │
│               │ APPROVE│  │  REVISE  │  │  REJECT  │        │
│               └────────┘  └──────────┘  └──────────┘        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 6.6 核心服务实现

```typescript
// 自动专家评审服务
class AutoExpertReviewService {
  constructor(
    private taxonomyService: UnifiedTaxonomyService,
    private expertMatchingEngine: ExpertMatchingEngine,
    private notificationService: NotificationService
  ) {}
  
  // ==================== 触发入口 ====================
  
  // 内容分类后调用此方法
  async onContentClassified(content: ClassifiedContent): Promise<void> {
    const shouldTrigger = this.evaluateTriggerConditions(content);
    
    if (shouldTrigger.triggered) {
      await this.createReviewTask(content, shouldTrigger.reason);
    }
  }
  
  // 评估触发条件
  private evaluateTriggerConditions(content: ClassifiedContent): TriggerEvaluation {
    const config = await this.getTriggerConfig();
    
    // 检查各种触发条件
    if (config.rules.qualityThreshold.enabled && 
        content.qualityScore >= config.rules.qualityThreshold.minScore) {
      return { triggered: true, reason: 'quality', priority: 'P0' };
    }
    
    if (config.rules.hotScoreThreshold.enabled &&
        content.hotScore >= config.rules.hotScoreThreshold.minHotScore &&
        content.classificationConfidence >= config.rules.hotScoreThreshold.minConfidence) {
      return { triggered: true, reason: 'hot', priority: 'P1' };
    }
    
    if (config.rules.sensitiveDomains.enabled &&
        config.rules.sensitiveDomains.domainCodes.includes(content.domainCode)) {
      return { triggered: true, reason: 'sensitive', priority: 'P2' };
    }
    
    return { triggered: false };
  }
  
  // ==================== 任务创建 ====================
  
  async createReviewTask(
    content: ClassifiedContent, 
    triggerReason: string
  ): Promise<ReviewTask> {
    // 1. 匹配专家
    const expertMatch = await this.expertMatchingEngine.matchExperts(content);
    
    // 2. 确定评审维度
    const dimensions = REVIEW_DIMENSIONS_BY_DOMAIN[content.domainCode] || 
                      REVIEW_DIMENSIONS_BY_DOMAIN['default'];
    
    // 3. 创建评审任务
    const taskId = generateTaskId();
    const task = await this.db.insert('auto_review_tasks', {
      id: taskId,
      source_type: content.sourceType,
      source_id: content.sourceId,
      unified_domain_code: content.domainCode,
      unified_theme_code: content.themeCode,
      trigger_type: triggerReason,
      trigger_confidence: content.classificationConfidence,
      status: 'pending',
      review_config: {
        dimensions,
        deadline: calculateDeadline(triggerReason),
        expert_count: {
          primary: expertMatch.primaryExperts.length,
          supporting: expertMatch.supportingExperts.length,
          universal: Object.keys(expertMatch.universalExperts).length
        }
      }
    });
    
    // 4. 分配专家
    await this.assignExperts(taskId, expertMatch);
    
    // 5. 发送通知
    await this.notifyExperts(taskId, expertMatch);
    
    return task;
  }
  
  // 分配专家
  private async assignExperts(
    taskId: string, 
    expertMatch: ExpertMatchResult
  ): Promise<void> {
    const assignments = [];
    
    // 主审专家
    for (const expert of expertMatch.primaryExperts) {
      assignments.push({
        review_task_id: taskId,
        expert_id: expert.id,
        expert_role: 'primary',
        status: 'pending'
      });
    }
    
    // 辅审专家
    for (const expert of expertMatch.supportingExperts) {
      assignments.push({
        review_task_id: taskId,
        expert_id: expert.id,
        expert_role: 'supporting',
        status: 'pending'
      });
    }
    
    // 通用专家
    for (const [role, expert] of Object.entries(expertMatch.universalExperts)) {
      assignments.push({
        review_task_id: taskId,
        expert_id: expert.id,
        expert_role: role,
        status: 'pending'
      });
    }
    
    await this.db.batchInsert('auto_review_assignments', assignments);
  }
  
  // ==================== 结果汇总 ====================
  
  // 汇总评审结果
  async aggregateReviewResults(taskId: string): Promise<ReviewSummary> {
    const task = await this.getTask(taskId);
    const assignments = await this.getAssignments(taskId);
    
    // 1. 计算各维度加权平均分
    const dimensionScores = this.calculateDimensionScores(assignments);
    
    // 2. 计算总分
    const finalScore = this.calculateFinalScore(dimensionScores);
    
    // 3. 汇总意见
    const opinions = this.aggregateOpinions(assignments);
    
    // 4. 确定最终决策
    const finalDecision = this.determineFinalDecision(finalScore, opinions);
    
    // 5. 更新任务状态
    await this.db.update('auto_review_tasks', {
      id: taskId,
      status: 'completed',
      completed_at: new Date(),
      final_score: finalScore,
      final_decision: finalDecision
    });
    
    // 6. 同步到原内容
    await this.syncReviewResultToContent(task, finalDecision);
    
    return {
      taskId,
      finalScore,
      finalDecision,
      dimensionScores,
      opinions,
      expertCount: assignments.length
    };
  }
  
  private calculateDimensionScores(assignments: Assignment[]): DimensionScore[] {
    const dimensionMap = new Map<string, { scores: number[]; weight: number }>();
    
    // 收集所有评分
    for (const assignment of assignments) {
      if (assignment.review_result?.scores) {
        for (const [dimId, score] of Object.entries(assignment.review_result.scores)) {
          if (!dimensionMap.has(dimId)) {
            dimensionMap.set(dimId, { scores: [], weight: score.weight });
          }
          dimensionMap.get(dimId)!.scores.push(score.value);
        }
      }
    }
    
    // 计算平均分
    return Array.from(dimensionMap.entries()).map(([id, data]) => ({
      dimensionId: id,
      averageScore: data.scores.reduce((a, b) => a + b, 0) / data.scores.length,
      weight: data.weight,
      scoreCount: data.scores.length
    }));
  }
  
  private determineFinalDecision(score: number, opinions: string[]): string {
    // 根据分数和意见确定最终决策
    if (score >= 85) return 'approve';
    if (score >= 70) return 'revise';
    return 'reject';
  }
}
```

### 6.7 与现有系统的整合

```typescript
// ==================== 与 v6.1 RSS AI 整合 ====================

// 在 RSS AI 分析完成后触发专家评审
class RSSAIProcessor {
  constructor(private autoReviewService: AutoExpertReviewService) {}
  
  async processRSSItem(item: RSSItem): Promise<void> {
    // 1. 执行 v6.1 的 AI 分析
    const aiResult = await this.performAIAnalysis(item);
    
    // 2. 执行 v6.3 的统一分类
    const taxonomyResult = await this.classifyWithTaxonomy(item, aiResult);
    
    // 3. 【新增】触发自动专家评审
    await this.autoReviewService.onContentClassified({
      sourceType: 'rss',
      sourceId: item.id,
      domainCode: taxonomyResult.domainCode,
      themeCode: taxonomyResult.themeCode,
      qualityScore: aiResult.quality.overall,
      hotScore: item.hot_score,
      classificationConfidence: taxonomyResult.confidence
    });
  }
}

// ==================== 与 v6.2 Assets AI 整合 ====================

class AssetsAIProcessor {
  constructor(private autoReviewService: AutoExpertReviewService) {}
  
  async processAsset(asset: Asset): Promise<void> {
    // 1. 执行 v6.2 的 AI 分析
    const aiResult = await this.performAIAnalysis(asset);
    
    // 2. 执行 v6.3 的统一分类
    const taxonomyResult = await this.classifyWithTaxonomy(asset, aiResult);
    
    // 3. 【新增】触发自动专家评审
    await this.autoReviewService.onContentClassified({
      sourceType: 'asset',
      sourceId: asset.id,
      domainCode: taxonomyResult.domainCode,
      themeCode: taxonomyResult.themeCode,
      qualityScore: aiResult.quality.overall,
      classificationConfidence: taxonomyResult.confidence
    });
  }
}

// ==================== 与 Task 系统整合 ====================

// 评审结果可自动创建/更新任务
class TaskReviewIntegration {
  // 评审通过后，自动推荐到任务池
  async onReviewApproved(reviewTask: ReviewTask): Promise<void> {
    const content = await this.getSourceContent(reviewTask);
    
    // 创建任务推荐 (复用 v6.1/v6.2 的 ai_task_recommendations 表)
    await this.createTaskRecommendation({
      sourceType: reviewTask.source_type,
      sourceId: reviewTask.source_id,
      recommendation: {
        title: `基于专家评审: ${content.title}`,
        format: 'article',
        priority: reviewTask.final_score >= 90 ? 'high' : 'medium',
        reason: `通过专家自动评审 (评分: ${reviewTask.final_score})，建议创作`,
        expertReviewId: reviewTask.id,
        expertReviewScore: reviewTask.final_score
      }
    });
  }
}
```

### 6.8 API 接口

```typescript
// ==================== 评审任务管理 API ====================

// GET /api/v1/auto-reviews
// 查询自动评审任务列表
interface ListAutoReviewsRequest {
  status?: 'pending' | 'in_progress' | 'completed' | 'all';
  domainCode?: string;
  sourceType?: 'rss' | 'asset';
  priority?: 'P0' | 'P1' | 'P2';
  limit?: number;
  offset?: number;
}

interface ListAutoReviewsResponse {
  items: {
    id: string;
    sourceType: string;
    sourceTitle: string;
    domainName: string;
    status: string;
    expertCount: number;
    completedCount: number;
    finalScore?: number;
    createdAt: string;
  }[];
  total: number;
}

// GET /api/v1/auto-reviews/:id
// 获取评审任务详情
interface GetAutoReviewResponse {
  id: string;
  sourceType: string;
  sourceContent: {
    id: string;
    title: string;
    summary: string;
    url?: string;
  };
  classification: {
    domainCode: string;
    domainName: string;
    themeCode?: string;
    themeName?: string;
    confidence: number;
  };
  triggerReason: string;
  status: string;
  experts: {
    expertId: string;
    expertName: string;
    expertAvatar: string;
    role: string;
    status: string;
    result?: {
      scores: Record<string, number>;
      comment: string;
      decision: string;
    };
  }[];
  finalResult?: {
    score: number;
    decision: string;
    dimensionScores: {
      name: string;
      score: number;
      weight: number;
    }[];
  };
}

// POST /api/v1/auto-reviews/:id/trigger
// 手动触发评审 (管理员)
interface TriggerAutoReviewRequest {
  force?: boolean;  // 强制重新评审
}

// POST /api/v1/auto-reviews/:id/cancel
// 取消评审任务

// ==================== 专家评审 API ====================

// GET /api/v1/auto-reviews/assignments/pending
// 获取当前专家的待评审任务
interface GetPendingAssignmentsResponse {
  items: {
    assignmentId: string;
    taskId: string;
    contentTitle: string;
    contentSummary: string;
    domainName: string;
    role: string;
    deadline: string;
    dimensions: {
      id: string;
      name: string;
      description: string;
    }[];
  }[];
}

// POST /api/v1/auto-reviews/assignments/:id/accept
// 接受评审任务

// POST /api/v1/auto-reviews/assignments/:id/reject
// 拒绝评审任务
interface RejectAssignmentRequest {
  reason: string;
}

// POST /api/v1/auto-reviews/assignments/:id/submit
// 提交评审结果
interface SubmitReviewRequest {
  scores: Record<string, number>;  // dimension_id -> score
  comment: string;
  decision: 'approve' | 'revise' | 'reject';
  suggestions?: string[];
}

// ==================== 配置管理 API ====================

// GET /api/v1/auto-reviews/config
// 获取自动评审配置

// PUT /api/v1/auto-reviews/config
// 更新自动评审配置 (管理员)

// GET /api/v1/auto-reviews/stats
// 获取评审统计
interface GetReviewStatsResponse {
  totalTasks: number;
  pendingTasks: number;
  completedTasks: number;
  averageScore: number;
  approvalRate: number;
  domainDistribution: {
    domainCode: string;
    domainName: string;
    taskCount: number;
    avgScore: number;
  }[];
  expertWorkload: {
    expertId: string;
    expertName: string;
    pendingCount: number;
    completedCount: number;
  }[];
}
```

---

## 9. 验证标准

### 9.1 功能验收

| 功能点 | 验收标准 | 测试方法 |
|--------|----------|----------|
| 字典完整性 | 15个领域，每领域≥5个主题 | 数据核对 |
| 关键词分类 | 准确率 > 70% | 标注数据集测试 |
| AI 分类 | 准确率 > 80% | 标注数据集测试 |
| RSS 映射 | 分类一致率 > 85% | 抽样人工验证 |
| Assets 映射 | 分类一致率 > 85% | 抽样人工验证 |
| 主题映射 | 映射准确率 > 90% | 专家审核 |
| **自动评审触发** | **触发准确率 > 85%** | **人工审核触发记录** |
| **专家匹配** | **匹配准确率 > 85%** | **专家评审匹配验证** |
| **评审结果汇总** | **结果一致性 > 80%** | **多专家评审对比** |

### 9.2 性能指标

| 指标 | 目标 | 测试方法 |
|------|------|----------|
| 单次分类延迟 | < 100ms (关键词) / < 2s (AI) | API 测试 |
| 批量处理速度 | > 100条/分钟 | 压力测试 |
| 字典查询延迟 | < 50ms | API 测试 |
| 数据迁移时间 | < 2小时 (全量) | 实际执行 |
| **专家匹配延迟** | **< 500ms** | **API 测试** |
| **评审任务创建** | **< 1s** | **API 测试** |

### 9.3 与 v6.1/v6.2 的协同验收

| 协同点 | 验收标准 | 验证方式 |
|--------|----------|----------|
| RSS AI 分类 | RSS AI 分析使用统一字典输出 | 数据核对 |
| Assets AI 分类 | Assets AI 分析使用统一字典输出 | 数据核对 |
| 任务推荐 | 推荐可跨 RSS/Assets 聚合 | 功能测试 |
| 专家匹配 | 专家领域与内容分类一致 | 匹配测试 |
| **自动专家评审** | **分类后自动触发评审流程** | **端到端流程测试** |
| **评审-任务联动** | **评审通过后自动创建任务推荐** | **流程验证** |

---

## 10. 附录

### 10.1 与 v6.1/v6.2 的关系

```
v6.1: RSS AI 处理                    v6.2: Assets AI 处理
     │                                      │
     │  输入: RSS 内容                       │  输入: Assets 内容
     │  输出: ai_category                    │  输出: ai_theme_id
     │                                      │
     └──────────────┬───────────────────────┘
                    │
                    ▼
         ┌──────────────────────────────────┐
         │        v6.3 统一分类字典           │
         │  - 标准化分类输出 (D01-D15)        │
         │  - 跨源内容关联                   │
         │  - 统一推荐基础                   │
         └──────────────────────────────────┘
                    │
     ┌──────────────┼──────────────┬──────────────┐
     │              │              │              │
     ▼              ▼              ▼              ▼
  Expert匹配    任务推荐      内容检索      【自动专家评审】
     │                                              │
     │          ┌───────────────────────────────────┘
     │          │
     │          ▼
     │  ┌─────────────────┐
     │  │ 自动专家评审流程  │
     │  │ - 基于分类匹配专家│
     │  │ - 多维度质量评审  │
     │  │ - 评审结果汇总   │
     │  └─────────────────┘
     │          │
     └──────────┼──────────┐
                │          │
                ▼          ▼
         ┌──────────┐ ┌──────────┐
         │ 评审通过  │ │ 评审改进  │
         └────┬─────┘ └────┬─────┘
              │            │
              ▼            ▼
         任务推荐      反馈优化
```

**v6.3 核心新增能力**：
1. **统一分类字典**: 打通 RSS/Assets/Expert 三套分类体系
2. **自动专家评审**: 基于统一分类自动触发专家质量评审
3. **评审-任务联动**: 评审结果直接驱动任务创建和内容优化

### 10.2 风险与应对

| 风险 | 影响 | 应对措施 |
|------|------|----------|
| 历史数据分类错误 | 高 | 置信度阈值 + 人工审核机制 |
| 主题映射争议 | 中 | 支持人工调整映射关系 |
| 分类体系扩展 | 低 | 预留扩展字段，支持动态添加 |
| 性能瓶颈 | 低 | 缓存 + 异步处理 |

### 10.3 相关文档

- [v6.1 RSS AI 批量处理](./Product-Spec-v6.1-AI-Batch-Processing.md)
- [v6.2 Assets AI 批量处理](./Product-Spec-v6.2-AI-Assets-Processing.md)
- [Expert Library 分类体系](../webapp/src/services/expertService.ts)
- [RSS 采集服务](../api/src/services/rssCollector.ts)

---

## 11. v7.6 补充：meetingKind 会议性质分类（正交维度）

> **状态**: ✅ 已实现（2026-04-22）
> **关联代码**: `api/src/services/meetingClassifier.ts`、`api/src/services/expert-application/meetingKindStrategyMap.ts`

### 11.1 为什么引入 meetingKind

D01-D15 是**领域**维度（回答"这份内容讲什么行业/主题"）。
会议纪要还需要回答"这是什么**性质**的会议"——因为同一份纪要可能既是 D06 AI，也是一场技术评审，单靠领域无法决定**该不该/如何**跑专家分析。所以 `meetingKind` 是与 domain **正交**的第二维度，只作用在 `asset_type='meeting_minutes'` 上。

### 11.2 五个候选值

| meetingKind | 识别线索（classifier 启发式） | 下游专家策略（自动应用） |
|---|---|---|
| `strategy_roadshow` | 路演/融资/IPO/战略/Term Sheet | debate + EMM 一票否决 + rubric 打分 |
| `tech_review` | 评审/架构/算法/验收 | mental_model_rotation + max 预设（全家桶装饰器） |
| `expert_interview` | `问:/答:` 或 `Q:/A:` 结构 ≥2 对（最高优先级） | single + contradictionsSurface + knowledgeGrounded（不开 EMM） |
| `industry_research` | 行业调研/走访/产能 | heuristic_trigger_first + evidenceAnchored + knowledgeGrounded |
| `internal_ops` | 周会/站会/OKR/复盘（亦为默认兜底） | **跳过专家分析**，只做领域打标 |

### 11.3 数据链路

```
meetingNoteChannel.runImport()
  ↓
classifyMeeting(title, content)           // 纯规则，不调 LLM
  ↓
asset.metadata.meeting_kind 持久化到 JSONB
  ↓
batchProcessor → deepAnalysisOrchestrator.routeMeetingKind(asset)
  ↓
├─ internal_ops                   → { skipped: true } 直接返回
├─ 其它 kind + 调用方未传 strategy → resolveStrategyForMeeting() 派生
└─ 调用方已给 strategy            → 完全不干预
  ↓
createStrategyResolver(spec) → ExpertApplicationStrategy.apply(ctx)
```

### 11.4 与 D01-D15 的关系

两维**并存**，互不替换：

| 场景 | domain | meetingKind |
|---|---|---|
| AI 创业路演纪要 | D06 AI | strategy_roadshow |
| 半导体行业走访 | D07 半导体 | industry_research |
| 团队周会（不涉及外部） | null | internal_ops |

路由链路先按 `domain` 过滤领域专家（语义 + 关键词），再按 `meetingKind` 决定"怎么用这些专家"。
