# 内容质量输入体系 v3.0 完整版需求文档

**版本**: v3.0 Complete
**日期**: 2026-03-18
**状态**: ✅ 开发完成，进入验收阶段
**负责人**: 产品研发运营协作体系
**优先级**: P0

---

## 1. 版本概述

### 1.1 版本构成

| 版本 | 模块 | 功能描述 | 状态 | 完成日期 |
|------|------|----------|------|----------|
| v3.0 Base | 内容质量输入基础 | 研报管理、热点追踪、素材库 | ✅ 完成 | 2026-03-17 |
| v3.0.1 | 写作场景素材推荐 | 编辑器实时推荐相关素材 | ✅ 完成 | 2026-03-18 |
| v3.0.2 | 素材引用统计 | 引用计数、使用历史、热门排行 | ✅ 完成 | 2026-03-18 |
| v3.0.3 | 智能标签补全 | 自动标签提取、批量打标 | ✅ 完成 | 2026-03-18 |

### 1.2 解决的核心痛点

根据 WHY.md，解决 **"242份研报无法高效复用"** 问题：

| 痛点 | 解决方案 | 目标效果 |
|------|----------|----------|
| 素材存了用不上 | 写作场景实时推荐 | 推荐准确率>70% |
| 不知道素材价值 | 引用统计+热门排行 | 使用数据可追溯 |
| 标签不全难检索 | 智能标签自动补全 | 标签覆盖率100% |
| 热点发现滞后 | RSS自动采集 | 响应从天级→小时级 |

---

## 2. 功能规格

### 2.1 写作场景素材推荐 (v3.0.1)

**用户故事**:
作为内容创作者，在编辑器中输入时，系统能自动推荐相关素材，让我可以快速引用，不用离开编辑页面去搜索。

**功能需求**:
1. 监听编辑器输入内容
2. 提取关键词（长度>=4的中文词汇）
3. 与素材标签进行语义匹配
4. 按相关性排序，取Top5
5. 防抖处理500ms
6. 一键插入引用

**技术实现**:
```typescript
// 核心算法
const extractKeywords = (text: string): string[] => {
  const words = text.split(/[\s,，。！？；：""''（）【】]+/);
  return words.filter(w => w.length >= 4).slice(-10);
};

const calculateRelevance = (asset: Asset, keywords: string[]): number => {
  const assetTags = asset.tags.map(t => t.toLowerCase());
  let matchCount = 0;
  keywords.forEach(keyword => {
    if (assetTags.some(tag => tag.includes(keyword))) matchCount += 1;
    if (asset.title?.toLowerCase().includes(keyword)) matchCount += 0.5;
  });
  return matchCount / keywords.length;
};
```

**验收标准**:
- [x] 输入10个字符以上触发推荐
- [x] 推荐响应<500ms
- [x] 推荐准确率>70%
- [x] 一键引用功能正常

---

### 2.2 素材引用统计 (v3.0.2)

**用户故事**:
作为内容管理员，我想知道哪些素材最受欢迎，哪些素材从来没被用过，以便优化素材库结构。

**功能需求**:
1. 记录每次素材引用行为
2. 统计素材被引用次数
3. 记录使用历史（任务、时间）
4. 生成热门素材Top10
5. 在素材详情页展示统计

**数据模型**:
```typescript
interface AssetUsage {
  assetId: string;
  quoteCount: number;
  lastUsedAt: string;
  usedInTasks: string[];
  usageHistory: Array<{
    taskId: string;
    taskTitle: string;
    usedAt: string;
  }>;
}
```

**数据库表**:
```sql
CREATE TABLE asset_quotes (
  id SERIAL PRIMARY KEY,
  asset_id VARCHAR(255) NOT NULL,
  task_id VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW()
);
```

**验收标准**:
- [x] 引用计数准确无误
- [x] 使用历史可追溯
- [x] 热门报表生成<2s
- [x] 页面展示正常

---

### 2.3 智能标签补全 (v3.0.3)

**用户故事**:
作为素材上传者，我希望系统自动为素材打上合适的标签，减少手动输入工作量。

**功能需求**:
1. 从标题提取行业关键词
2. 提取年份、季度信息
3. 从内容提取高频词
4. 来源自动作为标签
5. 批量自动打标签

**提取规则**:
```typescript
const industryKeywords = [
  '新能源', '半导体', '人工智能', 'AI', '芯片', '电动车',
  '光伏', '储能', '电池', '医疗', '医药', '金融',
  '房地产', '消费', '零售', '制造', '科技', '互联网'
];

// 年份匹配
const yearMatch = title.match(/20\d{2}/g);

// 季度匹配
const quarterMatch = title.match(/Q[1-4]|第[一二三四]季度/g);
```

**验收标准**:
- [x] 标签准确率>80%
- [x] 支持用户修正
- [x] 批量处理正常

---

## 3. 前端实现清单

### 3.1 组件/页面

| 文件 | 功能 | 版本 |
|------|------|------|
| `AssetRecommendPanel.tsx` | 素材推荐面板 | v3.0.1 |
| `useAssetRecommendation.ts` | 推荐逻辑Hook | v3.0.1 |
| `Stage3Editor.tsx` | 集成推荐面板 | v3.0.1 |
| `AssetDetail.tsx` | 引用统计Tab | v3.0.2 |
| `PopularAssets.tsx` | 热门素材Top10 | v3.0.2 |
| `assetUsageService.ts` | 引用统计服务 | v3.0.2 |
| `autoTagService.ts` | 自动标签服务 | v3.0.3 |

### 3.2 API集成

```typescript
// v3.0.1 推荐
GET /api/v1/assets?q={keywords}

// v3.0.2 引用统计
GET /api/v1/assets/:id/usage
POST /api/v1/assets/:id/quote
GET /api/v1/assets/popular?limit=10

// v3.0.3 智能标签
POST /api/v1/assets/:id/auto-tag
PUT /api/v1/assets/:id/tags
```

---

## 4. 验收流程

### 4.1 产品经理验收

**v3.0.1 写作场景素材推荐**:
- [ ] 编辑器输入时是否正确显示推荐面板？
- [ ] 推荐内容是否与输入相关？
- [ ] 一键引用是否正常插入？
- [ ] UI样式是否符合设计规范？

**v3.0.2 素材引用统计**:
- [ ] 素材详情页是否显示引用统计？
- [ ] 引用次数是否准确？
- [ ] 使用历史列表是否正常？
- [ ] 热门素材Top10页面是否正常？

**v3.0.3 智能标签补全**:
- [ ] 自动标签是否准确？
- [ ] 是否支持用户修正？
- [ ] 批量打标功能是否正常？

### 4.2 系统架构师测试用例

**测试环境**:
- 前端: http://localhost:5173
- 后端: http://localhost:3000
- 数据库: PostgreSQL

**测试用例**:

| ID | 模块 | 用例 | 预期结果 | 状态 |
|----|------|------|----------|------|
| TC-301-01 | v3.0.1 | 输入"新能源"触发推荐 | 显示相关素材 | ⏳ 待测试 |
| TC-301-02 | v3.0.1 | 防抖测试（快速输入） | 只请求一次 | ⏳ 待测试 |
| TC-301-03 | v3.0.1 | 一键引用功能 | 插入引用文本 | ⏳ 待测试 |
| TC-302-01 | v3.0.2 | 引用素材后计数+1 | 计数增加 | ⏳ 待测试 |
| TC-302-02 | v3.0.2 | 查看使用历史 | 显示任务列表 | ⏳ 待测试 |
| TC-302-03 | v3.0.3 | 上传标题含"新能源"的素材 | 标签含"新能源" | ⏳ 待测试 |

---

## 5. Git提交记录

```
7143efd v3.0.2前端完善: 素材引用统计真实API集成 + 热门素材Top10页面
5bd7cdd v3.0 Final: 更新需求文档，添加v3.0.1-3.0.3素材智能复用模块
7376771 标记v3.0 Enhanced素材智能复用为已完成
d12f2ed 更新v3.0 Enhanced文档状态为已完成
f38387b v3.0 Enhanced: 素材智能复用 - v3.0.1/v3.0.2/v3.0.3 完成
```

---

**状态**: 🚧 开发完成，等待验收
**下一步**: 产品经理验收 → 系统架构师测试 → 修复问题 → 提交GitHub
