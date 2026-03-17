# 内容质量输入体系 v3.0 增强版 - 素材智能复用

**版本**: v3.0 Enhanced
**日期**: 2026-03-18
**目标**: 解决"素材存了但用不上"的核心痛点
**状态**: 🚧 开发中

---

## 1. 核心问题

**现状**: 242份研报、500+素材已入库，但：
- 用户写作时想不起来有哪些素材可用
- 素材和写作场景割裂
- 引用统计缺失，不知道哪些素材有价值

**v3.0 Enhanced 解决**: 写作时自动推荐相关素材，一键引用

---

## 2. 功能模块

### 2.1 写作场景素材推荐 (v3.0.1)

**功能**: 用户在编辑器输入时，实时推荐相关素材

**实现**:
```typescript
// 输入监听 + 语义匹配
function recommendAssets(inputText: string): Asset[] {
  const keywords = extractKeywords(inputText);
  return assets.filter(asset =>
    semanticMatch(asset.tags, keywords) > 0.7
  ).sort(byRelevance).slice(0, 5);
}
```

**产品形态**:
- 编辑器侧边栏显示"📎 相关素材"
- 输入"新能源"时自动显示相关研报/数据/观点

**验收标准**:
- [ ] 推荐响应 < 500ms
- [ ] 推荐准确率 > 70%
- [ ] 支持一键插入引用

---

### 2.2 素材引用统计 (v3.0.2)

**功能**: 追踪素材被使用情况，生成影响力报告

**实现**:
```typescript
interface AssetUsage {
  assetId: string;
  quoteCount: number;      // 被引用次数
  lastUsedAt: string;      // 最后使用时间
  usedInTasks: string[];   // 使用在哪些任务
}
```

**产品形态**:
- 素材库显示"被引用X次"
- 素材详情页显示使用历史
- 报表：最热素材Top10

**验收标准**:
- [ ] 引用计数准确
- [ ] 使用历史可追溯
- [ ] 报表生成 < 2s

---

### 2.3 智能标签补全 (v3.0.3)

**功能**: 自动为素材打标签，解决标签缺失问题

**实现**:
```typescript
function autoTagAsset(asset: Asset): string[] {
  const tags = [];
  // 从标题提取
  tags.push(...extractDomainKeywords(asset.title));
  // 从内容提取
  tags.push(...extractEntities(asset.content));
  // 从来源提取
  tags.push(asset.source);
  return [...new Set(tags)];
}
```

**产品形态**:
- 上传素材后自动推荐标签
- 素材库支持标签筛选

**验收标准**:
- [ ] 标签准确率 > 80%
- [ ] 支持用户修正
- [ ] 标签覆盖率 100%

---

## 3. 迭代计划

| 版本 | 功能 | 工时 | 状态 |
|------|------|------|------|
| v3.0.1 | 写作场景素材推荐 | 2天 | 🚧 |
| v3.0.2 | 素材引用统计 | 2天 | ⏳ |
| v3.0.3 | 智能标签补全 | 1天 | ⏳ |

**预计完成**: 2026-03-21
**总工作量**: 5天

---

## 4. 实现文件

**新增/修改**:
- `webapp/src/components/AssetRecommendPanel.tsx` - 推荐面板
- `webapp/src/hooks/useAssetRecommendation.ts` - 推荐Hook
- `webapp/src/services/assetUsageService.ts` - 引用统计
- `webapp/src/services/autoTagService.ts` - 自动标签
- `api/src/routes/assetUsage.ts` - 引用统计API

---

**状态**: 开发中
