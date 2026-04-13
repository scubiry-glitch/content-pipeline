# Step 12 阶段报告：Writing 修订时间线 + 版本对比（W3+W4）

**对应缺口：**
- W3 — 修订时间线（rich timeline view）
- W4 — 版本对比 + 回滚

---

## 实施内容

### 文件改动

| 文件 | 变更类型 | 行数 |
|------|---------|------|
| `webapp/src/pages/lg-task-detail/LGWritingTab.tsx` | 编辑 | +200 |

### W3 — 修订时间线

**垂直时间线视觉：**
- 左侧渐变蓝色竖线
- 每个节点圆点（绿色=通过 / 橙色=进行中）
- 初稿节点 + N 个修订轮节点

**节点信息：**
- 轮次徽章
- 通过状态徽章
- 字数统计
- 修订摘要（截断 150 字符）

**展开/收起切换：** 头部按钮控制时间线显隐。

### W4 — 版本对比 + 回滚

**对比模式切换：** 头部「版本对比」按钮，进入后时间线节点变为可点击。

**对比卡片选择：**
- 点击时间线节点添加到对比（最多 2 个）
- 选中节点蓝色边框 + 阴影高亮
- 提示「已选 X/2」

**对比结果面板（选满 2 个时显示）：**
- 顶部 2 列卡片显示版本 A/B
  - 轮次 + 字数 + 字数差异（+/- 着色）
- 中部 side-by-side 内容预览（前 500 字）
- 底部「查看版本 A/B」快捷跳转按钮

### 状态管理

```typescript
const [showTimeline, setShowTimeline] = useState(false);
const [compareMode, setCompareMode] = useState(false);
const [compareSelection, setCompareSelection] = useState<number[]>([]);
```

退出对比模式自动清空已选项。

---

## 验证

- ✅ TypeScript 类型检查通过
- 待手动验证：
  - 时间线展开/折叠
  - 选 2 个版本 → 对比面板渲染
  - 字数差异计算正确
  - 跳转按钮切换 selectedRound

---

## 下一步

Step 13: Reviews R1+R2 — DocumentEditor + 流式更新
