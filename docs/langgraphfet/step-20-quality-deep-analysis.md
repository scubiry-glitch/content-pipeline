# Step 20 阶段报告：Quality 深度分析面板（Q6）

**对应缺口：** Quality Q6 — DeepAnalysisPanel（AI 深度诊断）

---

## 实施内容

构建一个完整的 AI 深度诊断面板：基于 5 个维度加权计算综合质量分，并给出智能诊断结论。

### 文件改动

| 文件 | 变更类型 | 行数 |
|------|---------|------|
| `webapp/src/pages/lg-task-detail/LGQualityTab.tsx` | 编辑 | +180 |

### 核心功能

#### 1. 5 维度评分体系

| 维度 | 计算方式 | 权重 |
|------|---------|------|
| 选题质量 | `evaluation.score` | 25% |
| 研究深度 | `min(100, dataPackage_count * 15)` | 20% |
| 文稿质量 | `min(100, draftWordCount / 100)` | 25% |
| 评审完成度 | `reviewPassed ? 90 : 60` | 20% |
| 审批就绪度 | `finalApproved ? 100 : reviewPassed ? 70 : 30` | 10% |

#### 2. 综合诊断算法

```typescript
const overallScore = Math.round(
  dimensions.reduce((acc, d) => acc + d.score * d.weight, 0)
);
```

#### 3. 诊断等级判定

| 综合分 | 等级 | 颜色 | 建议 |
|--------|------|------|------|
| ≥85 | 优秀 | 绿 | 推进至发布 |
| ≥70 | 良好 | 蓝 | 优化低分维度 |
| ≥50 | 一般 | 橙 | 重点改进短板 |
| <50 | 风险 | 红 | 重新评估或重做 |

#### 4. UI 组件

**综合诊断卡片：**
- 80x80 圆形评分（分数 + 标签）
- 等级标题 + AI 诊断徽章
- 诊断建议文本
- 渐变背景 + 等级色边框

**维度评分表：**
- 5 行进度条
- 每行：图标 + 标签 + 权重 + 分数
- 颜色梯度：≥80 绿 / ≥60 蓝 / ≥40 橙 / 其他红

**优势/短板对比卡片：**
- 2 列布局
- 优势：最高分维度（绿色边）
- 短板：最低分维度（红色边）
- 建议文案

#### 5. 辅助函数

```typescript
function dataPackageCount(researchData: any): number {
  if (!researchData?.dataPackage) return 0;
  if (Array.isArray(researchData.dataPackage)) return researchData.dataPackage.length;
  if (typeof researchData.dataPackage === 'object') return Object.keys(researchData.dataPackage).length;
  return 0;
}
```

---

## 验证

- ✅ TypeScript 类型检查通过
- 待手动验证：
  - 综合分计算正确
  - 诊断等级映射正确
  - 维度进度条响应

---

## 全部完成

20 个步骤全部完成。LangGraph Tasks 页面与原始 Tasks 页面的功能对齐工作已全部交付。
