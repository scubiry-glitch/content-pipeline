# TaskDetail 验收报告

**验收日期**: 2026-03-17
**验收范围**: `/Users/行业研究/demo-project/content-pipeline/webapp/src/pages/TaskDetail.tsx`
**代码行数**: 约 1627 行
**状态**: ⚠️ 有条件通过 - 发现若干问题需修复

---

## 一、功能完整性评估

### 1.1 已实现功能 ✅

| 功能模块 | 实现状态 | 备注 |
|---------|---------|------|
| 流程可视化 (Stage Pipeline) | ✅ | 4阶段流水线 + 子步骤展示 |
| 选题策划 4维度评分 | ✅ | 数据可得性/新颖性/时效性/专业匹配 |
| 竞品分析面板 | ✅ | 相似报告列表 + 市场空白点 |
| 知识库洞见 | ✅ | 趋势延续/研究空白/观点演变 |
| 大纲展示与编辑 | ✅ | 预览模式 + 编辑模式 |
| 深度研究操作按钮 | ✅ | 启动采集/重做/添加外部链接 |
| 研究洞察展示 | ✅ | 数据/趋势/案例/专家分类 |
| 信源分级展示 | ✅ | A/B/C/D 四级可信度 |
| 文稿生成操作 | ✅ | 重做文稿生成按钮 |
| 蓝军评审统计 | ✅ | 严重/警告/亮点统计卡片 |
| 评审进度条 | ✅ | 已接受/已忽略/待处理 |
| 专家评审分工 | ✅ | 4种专家角色展示 |
| 批量决策按钮 | ✅ | 全部接受/全部忽略 |
| 素材关联弹窗 | ✅ | 资产选择模态框 |
| 添加外部链接弹窗 | ✅ | 标题+URL 表单 |

### 1.2 与原系统对比

**已对齐的功能**:
- 选题策划 Tab 操作按钮 (确认大纲、重做)
- 深度研究 Tab 操作按钮 (启动采集、添加链接、重做)
- 文稿生成 Tab 操作按钮 (重做)
- 蓝军评审界面完整版 (决策按钮、专家分工)
- 搜索统计显示 (网页来源、素材来源)

**仍缺失的 P2 功能** (已记录):
- 数据清洗界面
- 交叉验证结果展示
- 采集进度实时显示
- 大纲版本对比
- 大纲段落重新生成

---

## 二、发现的问题

### 2.1 🔴 严重问题 (必须修复)

#### 问题 1: 类型不匹配 - `writing_data` 不存在

**位置**: `TaskDetail.tsx:1471`

```typescript
// 当前代码
{task.writing_data ? (...) : (...)}
```

**问题**: `Task` 类型中没有定义 `writing_data` 字段，这会导致 TypeScript 编译错误。

**建议**: 确认后端实际返回的字段名，或添加类型定义：
```typescript
// types/index.ts 中添加
interface WritingData {
  draft?: string;
  version?: number;
  status?: string;
}

// Task 接口中添加
writing_data?: WritingData;
```

---

#### 问题 2: 类型不匹配 - `outline_pending` 状态不存在

**位置**: `TaskDetail.tsx:714`

```typescript
{task.status === 'outline_pending' && (...)}
```

**问题**: `TaskStatus` 类型中没有 `'outline_pending'` 状态。

**建议**: 确认正确的状态值，可能是 `'planning'` 或其他。

---

#### 问题 3: 除以零风险

**位置**: `TaskDetail.tsx:1514, 1521, 1528`

```typescript
// 情感分析分布计算
width: `${(sentiment.positive / (sentiment.positive + sentiment.negative + sentiment.neutral)) * 100}%`
```

**问题**: 如果所有值都为 0，会导致除以零，产生 `NaN`。

**建议**: 添加保护：
```typescript
const total = sentiment.positive + sentiment.negative + sentiment.neutral;
const positivePercent = total > 0 ? (sentiment.positive / total) * 100 : 0;
```

---

#### 问题 4: 情感分析数据结构不匹配

**位置**: `TaskDetail.tsx:1496-1533`

代码中使用的字段：
- `sentiment.msiIndex`
- `sentiment.trendDirection`
- `sentiment.positive/negative/neutral`

但类型定义 `SentimentStats` 中的字段：
- `msiIndex`
- `trendDirection`
- `positive/negative/neutral`

**问题**: 代码中使用的是嵌套结构，但类型定义是扁平结构。需要确认实际 API 返回格式。

---

#### 问题 5: 热点话题数据结构不匹配

**位置**: `TaskDetail.tsx:1537-1551`

```typescript
// 代码中使用
topic.name
topic.heat

// 但类型定义是
title: string;
score: number;
source: string;
```

**问题**: 字段名不匹配。

**建议**: 统一字段名或使用映射：
```typescript
<span className="topic-name">{topic.title || topic.name}</span>
<span className="topic-heat">{(topic.score || topic.heat || 0)}°</span>
```

---

#### 问题 6: `potentialImpact` 字段不存在

**位置**: `TaskDetail.tsx:811`

```typescript
<span className={`impact-badge ${angle.potentialImpact}`}>
```

**问题**: `NovelAngle` 类型中没有 `potentialImpact` 字段，只有 `differentiation_score`。

**建议**: 修复字段名或类型定义。

---

#### 问题 7: `competitorAnalysis.summary` 可能不存在

**位置**: `TaskDetail.tsx:693-706`

```typescript
{competitorAnalysis.summary?.marketPosition && (...)}
{competitorAnalysis.summary?.gaps.map(...)}
```

虽然使用了可选链，但如果 `summary` 不存在，整个竞品摘要区域不会显示。需要确认这是否是预期行为。

---

### 2.2 🟡 中等问题 (建议修复)

#### 问题 8: 快捷操作按钮缺少加载状态

**位置**: `TaskDetail.tsx:1310-1318`

```typescript
<button onClick={() => tasksApi.confirmOutline(id!)}>
<button onClick={() => tasksApi.redoStage(id!, 'planning')}>
```

**问题**: 这些按钮没有 loading 状态处理，用户可能重复点击。

---

#### 问题 9: `asset_ids` 属性未定义

**位置**: `TaskDetail.tsx:1296, 1197`

```typescript
{task.asset_ids && task.asset_ids.length > 0 && (...)}
```

**问题**: `Task` 类型中没有 `asset_ids` 字段定义。

---

#### 问题 10: 空数组检查不够严格

**位置**: 多处使用 `array?.length > 0`

**建议**: 虽然这在 JavaScript 中工作，但更严格的检查是 `array && array.length > 0` 或 `!!array?.length`。

---

### 2.3 🟢 轻微问题 (可选优化)

#### 问题 11: 魔法数字

**位置**: `TaskDetail.tsx:583`

```typescript
const evaluation = task.evaluation;
const score = evaluation?.score || 0;
const circumference = 2 * Math.PI * 52;
const offset = circumference - (score / 100) * circumference;
```

**建议**: 将 `52` 提取为常量 `RADIUS`。

---

#### 问题 12: `any` 类型使用

**位置**: 多处使用 `any` 类型

```typescript
section: any
insight: any
source: any
```

**建议**: 使用正确的类型定义以提高类型安全。

---

#### 问题 13: 未使用的导入

需要检查是否有未使用的导入或变量。

---

## 三、API 核对

### 3.1 已实现的 API 调用

| API | 方法 | 状态 | 备注 |
|-----|------|------|------|
| `GET /production/:id` | tasksApi.getById | ✅ | 获取任务详情 |
| `POST /production/:id/confirm-outline` | tasksApi.confirmOutline | ✅ | 确认大纲 |
| `POST /production/:id/redo/:stage` | tasksApi.redoStage | ✅ | 重做阶段 |
| `POST /production/:id/approve` | tasksApi.approve | ✅ | 审批任务 |
| `GET /production/:id/reviews` | tasksApi.getReviews | ✅ | 获取评审 |
| `PUT /production/:id` | tasksApi.update | ✅ | 更新任务(添加链接) |
| `GET /assets` | assetsApi.getAll | ✅ | 获取素材列表 |
| `GET /dashboard/analyze` | dashboardApi.analyzeContent | ✅ | 内容分析 |

### 3.2 需要后端确认的 API

| API | 用途 | 状态 |
|-----|------|------|
| `POST /production/:id/research/collect` | 触发研究采集 | ❓ 需确认 |
| `GET /production/:id/sentiment` | 获取情感分析 | ❓ 需确认 |
| `GET /production/:id/hot-topics` | 获取热点话题 | ❓ 需确认 |

---

## 四、验收结论

### 4.1 总体评估

| 维度 | 评分 | 说明 |
|------|------|------|
| 功能完整性 | 85/100 | P0/P1 功能基本完成，P2 功能待决策 |
| 代码质量 | 75/100 | 类型安全有待加强，存在若干类型不匹配 |
| 用户体验 | 80/100 | 加载状态处理基本完善，部分按钮缺少反馈 |
| API 一致性 | 70/100 | 需要确认前后端数据结构的匹配 |

### 4.2 建议处理方案

**必须修复 (上线前)**:
1. 修复类型定义不匹配问题 (问题 1, 2, 5, 6, 9)
2. 添加除以零保护 (问题 3)
3. 确认情感分析数据结构 (问题 4)

**建议修复 (本周内)**:
4. 添加快捷操作按钮加载状态 (问题 8)
5. 减少 `any` 类型使用 (问题 12)

**可选优化**:
6. 提取魔法数字为常量
7. 代码清理和格式化

### 4.3 P2 功能决策建议

建议**暂缓**以下 P2 功能开发，优先确保基础功能稳定：
- 数据清洗界面 (需后端提供清洗状态 API)
- 交叉验证结果展示
- 采集进度实时显示 (需 WebSocket)
- 大纲版本对比
- 大纲段落重新生成

---

## 五、修复清单

```markdown
- [ ] 添加 `writing_data` 到 Task 类型定义
- [ ] 确认并修复 `outline_pending` 状态值
- [ ] 修复情感分析数据结构匹配问题
- [ ] 修复热点话题字段名不匹配 (name vs title, heat vs score)
- [ ] 修复 `potentialImpact` 字段不存在问题
- [ ] 添加 `asset_ids` 到 Task 类型定义
- [ ] 添加除以零保护 (sentiment 分布计算)
- [ ] 为快捷操作按钮添加加载状态
- [ ] 确认后端 API 是否支持情感分析和热点话题获取
```

---

**验收人**: Claude Code
**下次复查**: 问题修复后
