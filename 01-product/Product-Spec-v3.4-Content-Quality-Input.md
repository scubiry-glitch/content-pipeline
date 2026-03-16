# 产品规格: 内容质量输入体系 v3.4

**版本**: v3.4
**日期**: 2026-03-17
**状态**: 📝 需求文档
**负责人**: 产品研发运营协作体系
**优先级**: P0

---

## 1. 需求价值（承接 WHY.md）

### 1.1 与 WHY.md 的关联

根据 [WHY.md](../WHY.md)，项目核心痛点是**242份研报无法高效复用**，导致：
1. 没有知识积累
2. 产出效率极低
3. 无法规模化

**v3.4 解决的关键痛点**：

| WHY.md 痛点 | v3.0 解决方案 | 价值量化 |
|------------|--------------|---------|
| "242份研报无法高效复用" | 研报自动解析 + 结构化存储 + 智能检索 | 研报复用率从 **5% → 80%** |
| "产出效率极低" | 智能匹配推荐相关内容 | 研究时间减少 **60%** |
| "无法规模化" | 热点追踪 + 自动关联 | 内容生产效率提升 **3倍** |
| 质量把控 | 质量评分筛选优质研报 | 内容质量提升 **40%** |

### 1.2 核心场景

**场景1：研报入库**
```
用户上传PDF研报 → AI自动解析
→ 提取：标题、作者、机构、摘要、关键观点、图表
→ 生成：标签、质量评分、关联热点
→ 存储：结构化入库，可检索复用
```

**场景2：智能推荐**
```
用户正在研究"新能源汽车"
→ 系统自动推荐：
  - 相关研报5篇（匹配度>80%）
  - 相关热点3个（热度上升中）
  - 相关素材8个（历史积累）
→ 一键引用到当前研究
```

**场景3：热点追踪**
```
系统自动监控：
- RSS源更新 → 提取热点话题
- 研报提及 → 关联行业趋势
- 情绪分析 → 识别市场热点
→ 推送：与在研内容相关的热点提醒
```

### 1.3 成功标准

| 指标 | 现状 | 目标 | 验证方式 |
|------|------|------|---------|
| 研报解析成功率 | 人工处理 | >95%自动解析 | 解析日志 |
| 研报复用率 | <5% | >80% | 引用统计 |
| 智能推荐准确率 | - | >70% | 用户采纳率 |
| 研究时间 | 2天 | <0.5天 | 计时统计 |
| 热点响应时间 | 手动发现 | <1小时自动推送 | 推送延迟 |

---

## 2. 功能清单

### 2.1 研报解析 (Report Parser)

**核心功能**：
- 📄 PDF/Word 研报上传
- 🤖 AI自动解析内容结构
- 🏷️ 自动提取标签和关键词
- ⭐ 质量评分与可信度评估
- 🔗 自动关联相关热点

**解析字段**：
| 字段 | 说明 | 提取方式 |
|------|------|---------|
| title | 研报标题 | AI提取+OCR |
| authors | 作者列表 | AI提取 |
| institution | 发布机构 | AI提取 |
| publishDate | 发布日期 | AI提取 |
| pageCount | 页数 | PDF元数据 |
| abstract | 摘要 | AI提取 |
| keyPoints | 核心观点（3-5条） | AI生成 |
| tags | 标签（行业、主题） | AI生成 |
| qualityScore | 质量评分（0-100） | AI评估 |
| sections | 章节结构 | AI解析 |

**质量评分维度**：
```
authority:      机构权威性（中信证券>不知名机构）
completeness:   内容完整度（结构是否完整）
logic:          逻辑严谨性（论证是否严密）
freshness:      时效性（发布时间）
citations:      引用规范性（数据来源是否标注）
```

### 2.2 智能匹配 (Smart Matching)

**匹配类型**：
| 类型 | 说明 | 匹配依据 |
|------|------|---------|
| 研报-热点 | 研报与热点话题关联 | 关键词、时间窗口 |
| 研报-素材 | 研报与历史素材关联 | 主题相似度 |
| 研报-研报 | 研报之间的引用关系 | 内容相似度 |
| 热点-素材 | 热点与可复用素材 | 标签匹配 |

**匹配算法**：
```
相似度 = 关键词重叠度 * 0.4 + 语义相似度 * 0.4 + 时间衰减 * 0.2

匹配阈值：
- >85分：强相关（直接推荐）
- 70-85分：相关（间接推荐）
- <70分：弱相关（不展示）
```

### 2.3 热点追踪 (Hot Topic Tracker)

**数据源**：
- RSS订阅源（36氪、虎嗅、财经网等）
- 研报提及热点
- 用户自定义关注

**热点属性**：
| 属性 | 说明 |
|------|------|
| title | 热点标题 |
| source | 来源平台 |
| hotScore | 热度分数（0-100）|
| trend | 趋势（上升/平稳/下降）|
| relatedReports | 关联研报数量 |
| sentiment | 情绪倾向 |

**追踪功能**：
- 实时热点列表
- 热度趋势图
- 关联研报展示
- 订阅推送提醒

### 2.4 素材库 (Asset Library)

**素材类型**：
| 类型 | 说明 | 来源 |
|------|------|------|
| 数据图表 | 可视化数据 | 研报提取 |
| 核心观点 | 关键结论 | AI提取 |
| 引用素材 | 权威数据 | 研报提取 |
| 历史文章 | 已发布内容 | 系统生成 |

**素材属性**：
```
id: 唯一标识
type: 素材类型
title: 标题
content: 内容
source: 来源（研报/热点/原创）
tags: 标签
qualityScore: 质量分
usageCount: 被引用次数
createdAt: 创建时间
```

---

## 3. 页面交互原型

### 3.1 研报管理页面

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  📚 研报库 - 内容质量输入体系 v3.0                                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  [+ 上传研报] [📁 批量导入]    搜索: [输入关键词...] [🔍]                   │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │  筛选: [全部类型 ▼] [全部机构 ▼] [全部时间 ▼]  排序: [质量分 ▼]        │ │
│  │                                                                       │ │
│  │  共 242 篇研报  |  已解析: 238  |  解析中: 3  |  待处理: 1            │ │
│  │                                                                       │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │  📄 新能源汽车行业深度研究                                            │ │
│  │  ──────────────────────────────────────────────────────────────────   │ │
│  │  机构: 中信证券  |  作者: 张三, 李四  |  日期: 2024-03-15            │ │
│  │  页数: 45页  |  质量分: ⭐ 92分                                      │ │
│  │                                                                       │ │
│  │  🏷️ 标签: 新能源 汽车 研报 深度研究                                   │ │
│  │                                                                       │ │
│  │  💡 核心观点:                                                         │ │
│  │     • 2024年Q1销量增长35%，超出市场预期                              │ │
│  │     • 动力电池成本下降20%，产业链利润重塑                            │ │
│  │     • 政策红利持续释放，长期看好                                      │ │
│  │                                                                       │ │
│  │  🔗 关联: 3个热点  |  5个素材  |  被引用 8次                          │ │
│  │                                                                       │ │
│  │  [👁️ 查看详情] [📥 下载PDF] [🔗 复制引用] [🏷️ 编辑标签]              │ │
│  │                                                                       │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │  📄 AI芯片行业研究                                                    │ │
│  │  ──────────────────────────────────────────────────────────────────   │ │
│  │  机构: 华泰证券  |  作者: 王五  |  日期: 2024-03-10                   │ │
│  │  页数: 32页  |  质量分: ⭐ 85分                                      │ │
│  │                                                                       │ │
│  │  ...                                                                  │ │
│  │                                                                       │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  [< 上一页]  1  2  3  4  5  ...  24  [下一页 >]                            │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 研报详情页面

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  📄 研报详情                                                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  [< 返回研报库]                                                           │
│                                                                             │
│  新能源汽车行业深度研究                                                   │
│  ─────────────────────────────────────────────────────────────────────    │
│                                                                             │
│  ┌─────────────────────┐  ┌─────────────────────────────────────────────┐  │
│  │  📊 质量评分        │  │  📋 基本信息                                │  │
│  │                     │  │                                             │  │
│  │  ⭐ 92分            │  │  机构: 中信证券                             │  │
│  │  优质研报           │  │  作者: 张三, 李四                           │  │
│  │                     │  │  发布日期: 2024-03-15                       │  │
│  │  维度评分:          │  │  页数: 45页                                 │  │
│  │  权威性 ████████░░  │  │  文件大小: 2.3MB                            │  │
│  │  完整度 █████████░  │  │                                             │  │
│  │  逻辑性 █████████░  │  │  🏷️ 标签:                                   │  │
│  │  时效性 ████████░░  │  │  新能源 汽车 研报 深度研究 产业链          │  │
│  │  引用规范 ████████░░│  │                                             │  │
│  │                     │  │  [+ 添加标签]                               │  │
│  └─────────────────────┘  └─────────────────────────────────────────────┘  │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │  💡 核心观点                                                           │ │
│  │                                                                       │ │
│  │  1. 2024年Q1销量增长35%，超出市场预期                                  │ │
│  │     └─ 数据来源: 中汽协  |  [📊 查看原图]                              │ │
│  │                                                                       │ │
│  │  2. 动力电池成本下降20%，产业链利润重塑                                │ │
│  │     └─ 涉及公司: 宁德时代、比亚迪  |  [📈 查看图表]                    │ │
│  │                                                                       │ │
│  │  3. 政策红利持续释放，长期看好                                         │ │
│  │     └─ 相关政策: 新能源汽车产业发展规划  |  [📄 查看政策]              │ │
│  │                                                                       │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │  🔗 智能匹配                                                           │ │
│  │                                                                       │ │
│  │  关联热点 (3):                                                        │ │
│  │  • 🔥 新能源汽车销量创新高  |  热度: 85  |  [查看]                    │ │
│  │  • 🔥 宁德时代发布新技术  |  热度: 78  |  [查看]                      │ │
│  │  • 新能源政策解读  |  热度: 65  |  [查看]                              │ │
│  │                                                                       │ │
│  │  可复用素材 (5):                                                      │ │
│  │  • 📊 销量趋势图  |  质量: 90  |  [一键引用]                          │ │
│  │  • 📊 产业链图谱  |  质量: 88  |  [一键引用]                          │ │
│  │  • 💬 专家观点摘要  |  质量: 85  |  [一键引用]                        │ │
│  │                                                                       │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  [📥 下载PDF] [📋 复制引用格式] [🔗 分享] [🗑️ 删除]                        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.3 热点追踪页面

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  🔥 热点追踪                                                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  [🔥 全部热点] [⭐ 我的关注] [📈 趋势上升] [📰 RSS源管理]                  │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │  实时热点榜                                                            │ │
│  │                                                                       │ │
│  │  排名 │ 热点话题                    │ 热度 │ 趋势  │ 来源  │ 操作   │ │
│  │  ─────┼─────────────────────────────┼──────┼───────┼───────┼─────── │ │
│  │   1   │ 🔥 新能源汽车销量创新高      │  95  │ ↑ 15% │ 36氪  │ [关注] │ │
│  │   2   │ 🔥 央行降准0.5个百分点       │  92  │ ↑ 28% │ 财新  │ [关注] │ │
│  │   3   │ AI芯片巨头发布新一代产品     │  88  │ ↑ 8%  │ 虎嗅  │ [关注] │ │
│  │   4   │ 房地产市场新政解读           │  85  │ → 0%  │ 雪球  │ [关注] │ │
│  │   5   │ 消费市场回暖信号             │  78  │ ↓ 5%  │ 界面  │ [关注] │ │
│  │                                                                       │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │  与我相关的热点                                                        │ │
│  │                                                                       │ │
│  │  🔔 "新能源汽车销量创新高" 与您正在研究的 "新能源产业链" 高度相关      │ │
│  │     └─ 匹配度: 87%  |  相关研报: 5篇  |  [立即查看] [一键引用]        │ │
│  │                                                                       │ │
│  │  🔔 "AI芯片巨头发布新品" 与素材库中的 "芯片行业研究" 相关             │ │
│  │     └─ 匹配度: 72%  |  可复用素材: 3个  |  [查看素材]                  │ │
│  │                                                                       │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │  热点趋势图                                                            │ │
│  │                                                                       │ │
│  │  热度                                                                  │ │
│  │   100 ┤                                           ╭─╮                 │ │
│  │    80 ┤                              ╭─╮         ╭─╯                 │ │
│  │    60 ┤              ╭─╮            ╭─╯╰─╮   ╭───╯                   │ │
│  │    40 ┤    ╭─╮      ╭─╯╰─╮      ╭──╯    ╰───╯                       │ │
│  │    20 ┤╭───╯╰──────╯    ╰──────╯                                    │ │
│  │     0 ┼───────────────────────────────────────────────               │ │
│  │        周一    周二    周三    周四    周五    周六                   │ │
│  │                                                                       │ │
│  │        ─── 新能源汽车  ─── 央行降准  ─── AI芯片                       │ │
│  │                                                                       │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.4 素材库页面

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  🎨 素材库                                                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  [+ 新建素材] [📁 从研报提取] [🏷️ 标签管理]                                 │
│                                                                             │
│  筛选: [全部 ▼] [数据来源 ▼] [质量分 ▼]    视图: [列表 ☐] [卡片 ☑]        │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │  📊 数据图表                                                          │ │
│  │                                                                       │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                │ │
│  │  │ 📈          │  │ 📊          │  │ 📉          │                │ │
│  │  │             │  │             │  │             │                │ │
│  │  │ 销量趋势图  │  │ 市场份额饼图│  │ 成本变化图  │                │ │
│  │  │             │  │             │  │             │                │ │
│  │  │ ⭐ 90分     │  │ ⭐ 88分     │  │ ⭐ 85分     │                │ │
│  │  │ 引用: 12次  │  │ 引用: 8次   │  │ 引用: 5次   │                │ │
│  │  │             │  │             │  │             │                │ │
│  │  │ [一键引用]  │  │ [一键引用]  │  │ [一键引用]  │                │ │
│  │  └──────────────┘  └──────────────┘  └──────────────┘                │ │
│  │                                                                       │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │  💬 核心观点                                                          │ │
│  │                                                                       │ │
│  │  ┌─────────────────────────────────────────────────────────────────┐  │ │
│  │  │ "新能源汽车产业正处于从政策驱动向市场驱动转变的关键期"          │  │ │
│  │  │ ─────────────────────────────────────────────────────────────   │  │ │
│  │  │ 来源: 中信证券研报  |  质量: ⭐ 92分  |  引用: 15次              │  │ │
│  │  │ 标签: 新能源 产业趋势 政策解读                                    │  │ │
│  │  │ [一键引用] [查看原文] [复制]                                    │  │ │
│  │  └─────────────────────────────────────────────────────────────────┘  │ │
│  │                                                                       │ │
│  │  ┌─────────────────────────────────────────────────────────────────┐  │ │
│  │  │ "动力电池成本下降将重塑整个产业链的利润分配格局"                │  │ │
│  │  │ ─────────────────────────────────────────────────────────────   │  │ │
│  │  │ 来源: 华泰证券研报  |  质量: ⭐ 88分  |  引用: 9次               │  │ │
│  │  │ [一键引用] [查看原文] [复制]                                    │  │ │
│  │  └─────────────────────────────────────────────────────────────────┘  │ │
│  │                                                                       │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. 技术架构

### 4.1 系统架构图

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              前端 (React + TypeScript)                       │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐          │
│  │  研报管理页面     │  │  热点追踪页面     │  │  素材库页面       │          │
│  │  - 研报列表       │  │  - 热点榜单       │  │  - 素材卡片       │          │
│  │  - 研报详情       │  │  - 趋势图表       │  │  - 快速引用       │          │
│  │  - 上传组件       │  │  - 关注管理       │  │  - 标签筛选       │          │
│  └────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘          │
└───────────┼─────────────────────┼─────────────────────┼────────────────────┘
            │                     │                     │
            └─────────────────────┼─────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           API 层 (Fastify)                                   │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐          │
│  │ /reports         │  │ /hot-topics      │  │ /assets          │          │
│  │ - CRUD           │  │  - 列表/详情      │  │  - CRUD          │          │
│  │  - 上传/解析      │  │  - 关注/取消      │  │  - 引用          │          │
│  │  - 搜索/筛选      │  │  - 趋势数据       │  │  - 标签管理       │          │
│  └────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘          │
└───────────┼─────────────────────┼─────────────────────┼────────────────────┘
            │                     │                     │
            └─────────────────────┼─────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           服务层 (Services)                                  │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐          │
│  │ ReportService    │  │ HotTopicService  │  │ AssetService     │          │
│  │ - 研报CRUD       │  │  - 热点追踪       │  │  - 素材管理       │          │
│  │  - PDF解析       │  │  - RSS抓取        │  │  - 引用统计       │          │
│  │  - 质量评分      │  │  - 趋势分析       │  │  - 标签系统       │          │
│  └────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘          │
└───────────┼─────────────────────┼─────────────────────┼────────────────────┘
            │                     │                     │
            └─────────────────────┼─────────────────────┘
                                  │
            ┌─────────────────────┴─────────────────────┐
            │                                           │
            ▼                                           ▼
┌──────────────────────┐                    ┌──────────────────────┐
│   LLM Provider       │                    │   Matching Engine    │
│   - Claude API       │                    │   - 相似度计算       │
│   - Kimi API         │                    │   - 关联推荐         │
│   - OpenAI API       │                    │   - 智能排序         │
│                      │                    │                      │
│   功能:              │                    │   功能:              │
│   - 研报解析         │                    │   - 内容匹配         │
│   - 质量评估         │                    │   - 热点关联         │
│   - 标签生成         │                    │   - 素材推荐         │
└──────────────────────┘                    └──────────────────────┘
            │                                           │
            └─────────────────────┬─────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              数据层                                          │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐          │
│  │  PostgreSQL      │  │  Redis           │  │  File Storage    │          │
│  │  - reports       │  │  - 热点缓存       │  │  - PDF文件        │          │
│  │  - assets        │  │  - 搜索结果       │  │  - 图片资源       │          │
│  │  - hot_topics    │  │  - 会话状态       │  │                  │          │
│  │  - tags          │  │                  │  │                  │          │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘          │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 核心模块设计

```typescript
// 研报服务
class ReportService {
  // 上传并解析研报
  async uploadAndParse(file: File): Promise<ParseResult>;

  // 获取研报列表
  async getReports(filters: ReportFilters): Promise<ReportList>;

  // 获取研报详情
  async getReport(id: string): Promise<ReportDetail>;

  // 更新研报信息
  async updateReport(id: string, data: UpdateReportDTO): Promise<Report>;

  // 删除研报
  async deleteReport(id: string): Promise<void>;

  // 搜索研报
  async searchReports(query: string): Promise<Report[]>;

  // 获取关联内容
  async getRelatedContent(id: string): Promise<RelatedContent>;
}

// 研报解析器
class ReportParser {
  // 解析PDF文件
  async parsePDF(buffer: Buffer): Promise<ParsedContent>;

  // 提取结构化信息
  async extractStructure(content: string): Promise<ReportStructure>;

  // 生成标签
  async generateTags(content: string): Promise<string[]>;

  // 质量评分
  async calculateQuality(structure: ReportStructure): Promise<QualityScore>;
}

// 热点追踪服务
class HotTopicService {
  // 获取热点列表
  async getHotTopics(filters: HotTopicFilters): Promise<HotTopic[]>;

  // 关注热点
  async followTopic(id: string): Promise<void>;

  // 取消关注
  async unfollowTopic(id: string): Promise<void>;

  // 获取趋势数据
  async getTrendData(id: string, days: number): Promise<TrendData>;

  // RSS抓取任务
  async crawlRSS(): Promise<void>;
}

// 素材服务
class AssetService {
  // 创建素材
  async createAsset(data: CreateAssetDTO): Promise<Asset>;

  // 从研报提取素材
  async extractFromReport(reportId: string, selections: Selection[]): Promise<Asset[]>;

  // 获取素材列表
  async getAssets(filters: AssetFilters): Promise<AssetList>;

  // 一键引用
  async quickQuote(id: string): Promise<QuoteResult>;

  // 更新引用计数
  async incrementUsage(id: string): Promise<void>;
}

// 智能匹配引擎
class MatchingEngine {
  // 计算内容相似度
  calculateSimilarity(content1: string, content2: string): number;

  // 查找相关研报
  async findRelatedReports(topic: string, threshold: number): Promise<Report[]>;

  // 查找相关热点
  async findRelatedHotTopics(reportId: string): Promise<HotTopic[]>;

  // 推荐素材
  async recommendAssets(context: string): Promise<Asset[]>;
}
```

### 4.3 数据模型

```typescript
// 研报模型
interface Report {
  id: string;
  title: string;
  authors: string[];
  institution: string;
  publishDate: Date;
  pageCount: number;
  abstract: string;
  keyPoints: string[];
  tags: string[];
  qualityScore: QualityScore;
  fileUrl: string;
  parsedContent: string;
  sections: Section[];
  relatedHotTopics: string[];
  usageCount: number;
  createdAt: Date;
  updatedAt: Date;
}

interface QualityScore {
  overall: number;
  authority: number;
  completeness: number;
  logic: number;
  freshness: number;
  citations: number;
}

// 热点模型
interface HotTopic {
  id: string;
  title: string;
  source: string;
  sourceUrl: string;
  hotScore: number;
  trend: 'up' | 'stable' | 'down';
  sentiment: 'positive' | 'neutral' | 'negative';
  relatedReports: string[];
  publishedAt: Date;
  createdAt: Date;
}

// 素材模型
interface Asset {
  id: string;
  type: 'chart' | 'quote' | 'data' | 'insight';
  title: string;
  content: string;
  source: string;
  sourceId: string;
  tags: string[];
  qualityScore: number;
  usageCount: number;
  metadata: Record<string, any>;
  createdAt: Date;
}
```

---

## 5. API 接口

### 5.1 研报接口

| 端点 | 方法 | 描述 |
|------|------|------|
| `/api/v1/reports` | GET | 获取研报列表 |
| `/api/v1/reports` | POST | 创建研报记录 |
| `/api/v1/reports/:id` | GET | 获取研报详情 |
| `/api/v1/reports/:id` | PUT | 更新研报信息 |
| `/api/v1/reports/:id` | DELETE | 删除研报 |
| `/api/v1/reports/upload` | POST | 上传并解析研报 |
| `/api/v1/reports/:id/parse` | POST | 触发解析 |
| `/api/v1/reports/:id/related` | GET | 获取关联内容 |
| `/api/v1/reports/search` | GET | 搜索研报 |

### 5.2 热点接口

| 端点 | 方法 | 描述 |
|------|------|------|
| `/api/v1/hot-topics` | GET | 获取热点列表 |
| `/api/v1/hot-topics/:id` | GET | 获取热点详情 |
| `/api/v1/hot-topics/:id/follow` | POST | 关注热点 |
| `/api/v1/hot-topics/:id/unfollow` | POST | 取消关注 |
| `/api/v1/hot-topics/:id/trend` | GET | 获取趋势数据 |
| `/api/v1/hot-topics/crawl` | POST | 触发RSS抓取 |

### 5.3 素材接口

| 端点 | 方法 | 描述 |
|------|------|------|
| `/api/v1/assets` | GET | 获取素材列表 |
| `/api/v1/assets` | POST | 创建素材 |
| `/api/v1/assets/:id` | GET | 获取素材详情 |
| `/api/v1/assets/:id` | PUT | 更新素材 |
| `/api/v1/assets/:id` | DELETE | 删除素材 |
| `/api/v1/assets/extract` | POST | 从研报提取素材 |
| `/api/v1/assets/:id/quote` | POST | 一键引用 |

---

## 6. 数据库 Schema

```sql
-- 研报表
CREATE TABLE reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title VARCHAR(500) NOT NULL,
  authors JSONB NOT NULL DEFAULT '[]',
  institution VARCHAR(200),
  publish_date DATE,
  page_count INTEGER,
  abstract TEXT,
  key_points JSONB DEFAULT '[]',
  tags JSONB DEFAULT '[]',
  quality_score_overall INTEGER,
  quality_score_authority INTEGER,
  quality_score_completeness INTEGER,
  quality_score_logic INTEGER,
  quality_score_freshness INTEGER,
  quality_score_citations INTEGER,
  file_url VARCHAR(500),
  parsed_content TEXT,
  sections JSONB DEFAULT '[]',
  usage_count INTEGER DEFAULT 0,
  status VARCHAR(50) DEFAULT 'pending', -- pending, parsing, parsed, error
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 热点表
CREATE TABLE hot_topics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title VARCHAR(500) NOT NULL,
  source VARCHAR(200),
  source_url TEXT,
  hot_score INTEGER,
  trend VARCHAR(20), -- up, stable, down
  sentiment VARCHAR(20), -- positive, neutral, negative
  published_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 研报-热点关联表
CREATE TABLE report_hot_topic_relations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  report_id UUID REFERENCES reports(id),
  hot_topic_id UUID REFERENCES hot_topics(id),
  match_score INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 素材表
CREATE TABLE assets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type VARCHAR(50) NOT NULL, -- chart, quote, data, insight
  title VARCHAR(500),
  content TEXT NOT NULL,
  source VARCHAR(200),
  source_id UUID REFERENCES reports(id),
  tags JSONB DEFAULT '[]',
  quality_score INTEGER,
  usage_count INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 用户关注热点表
CREATE TABLE user_hot_topic_follows (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id VARCHAR(100) NOT NULL,
  hot_topic_id UUID REFERENCES hot_topics(id),
  created_at TIMESTAMP DEFAULT NOW()
);

-- RSS源配置表
CREATE TABLE rss_sources (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(200) NOT NULL,
  url VARCHAR(500) NOT NULL,
  category VARCHAR(100),
  is_active BOOLEAN DEFAULT true,
  last_crawled_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 创建索引
CREATE INDEX idx_reports_tags ON reports USING GIN (tags);
CREATE INDEX idx_reports_institution ON reports (institution);
CREATE INDEX idx_reports_quality_score ON reports (quality_score_overall);
CREATE INDEX idx_hot_topics_hot_score ON hot_topics (hot_score DESC);
CREATE INDEX idx_assets_type ON assets (type);
CREATE INDEX idx_assets_tags ON assets USING GIN (tags);
```

---

## 7. 配置选项

```typescript
interface ContentQualityConfig {
  // 研报解析
  parsing: {
    enabled: boolean;
    autoParse: boolean;        // 上传后自动解析
    supportedFormats: string[]; // ['pdf', 'doc', 'docx']
    maxFileSize: number;       // 最大文件大小(MB)
  };

  // 质量评分
  qualityScoring: {
    enabled: boolean;
    minQualityThreshold: number; // 最低质量分(0-100)
    autoFilterLowQuality: boolean;
    weights: {
      authority: number;
      completeness: number;
      logic: number;
      freshness: number;
      citations: number;
    };
  };

  // 智能匹配
  matching: {
    enabled: boolean;
    similarityThreshold: number; // 相似度阈值(0-100)
    maxRecommendations: number;  // 最大推荐数量
    timeDecayFactor: number;     // 时间衰减因子
  };

  // 热点追踪
  hotTopicTracking: {
    enabled: boolean;
    crawlInterval: number;       // RSS抓取间隔(分钟)
    hotScoreThreshold: number;   // 热点分数阈值
    autoNotify: boolean;         // 自动通知相关热点
  };

  // 素材库
  assetLibrary: {
    enabled: boolean;
    autoExtract: boolean;        // 自动从研报提取素材
    supportedAssetTypes: string[]; // ['chart', 'quote', 'data', 'insight']
  };
}

// 默认配置
const defaultConfig: ContentQualityConfig = {
  parsing: {
    enabled: true,
    autoParse: true,
    supportedFormats: ['pdf', 'doc', 'docx'],
    maxFileSize: 50,
  },
  qualityScoring: {
    enabled: true,
    minQualityThreshold: 60,
    autoFilterLowQuality: false,
    weights: {
      authority: 0.25,
      completeness: 0.20,
      logic: 0.20,
      freshness: 0.20,
      citations: 0.15,
    },
  },
  matching: {
    enabled: true,
    similarityThreshold: 70,
    maxRecommendations: 10,
    timeDecayFactor: 0.95,
  },
  hotTopicTracking: {
    enabled: true,
    crawlInterval: 30,
    hotScoreThreshold: 60,
    autoNotify: true,
  },
  assetLibrary: {
    enabled: true,
    autoExtract: true,
    supportedAssetTypes: ['chart', 'quote', 'data', 'insight'],
  },
};
```

---

## 8. 测试计划

| 模块 | 测试数 | 说明 |
|------|--------|------|
| 研报上传 | 8 | PDF解析、格式支持、大小限制 |
| 研报解析 | 12 | 字段提取、标签生成、质量评分 |
| 研报搜索 | 6 | 关键词搜索、标签筛选、排序 |
| 热点追踪 | 10 | RSS抓取、热点计算、趋势分析 |
| 智能匹配 | 8 | 相似度计算、推荐准确性 |
| 素材管理 | 8 | 创建、提取、引用、统计 |
| 集成测试 | 8 | 端到端流程 |
| **总计** | **60** | |

---

**状态**: 需求文档完成 ✅
**依赖**: 基于 v3.3 ReportMatcher 扩展
**下一步**: 架构设计
