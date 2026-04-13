# Step 13 阶段报告：Reviews DocumentEditor + 流式更新（R1+R2）

**对应缺口：**
- R1 — DocumentEditor（带标注的富文本草稿编辑器）
- R2 — 实时流式更新

---

## 实施内容

### 设计取舍

完整版 DocumentEditor 包含 1500+ 行的复杂逻辑（高亮位置计算、连接线渲染、3-tab 系统）。这里采用 **轻量但实用的方案**：
- 文档主区 + 右侧标注侧边栏的 2:1 网格布局
- 双视图切换（预览 / 源码）
- 文档头部元信息条
- 可折叠

R2 流式更新的 SSE 基础设施已在 LGTaskDetailLayout 完成。这里在 Reviews Tab 增加 **可视化流式指示器**：
- 检测 progress 变化触发 pulse 动画
- "实时评审中" 横幅
- 显示当前节点和进度

### 文件改动

| 文件 | 变更类型 | 行数 |
|------|---------|------|
| `webapp/src/pages/lg-task-detail/LGReviewsTab.tsx` | 编辑 | +180 |

### R1 — DocumentEditor

#### UI 结构

```
┌─ 头部（带视图切换） ────────────────┐
│ [文档编辑器]      [预览 | 源码]      │
└─────────────────────────────────────┘
┌─ 文档主区 ──────────┬─ 标注侧边栏 ──┐
│ 元信息: 字数·轮数·标注  │              │
│ ─────────────────       │ Annotation   │
│                         │   List       │
│ Markdown 渲染 / 源码    │              │
│   (max-height: 600px)   │              │
└─────────────────────────┴──────────────┘
```

#### 关键特性

1. **2:1 响应式网格** — 当存在标注时显示侧边栏，否则全宽
2. **预览/源码切换按钮组** — 嵌入 section header 右侧
3. **预览模式** — 用 MarkdownRenderer 渲染
4. **源码模式** — pre 标签等宽字体显示原文
5. **Sticky 标注侧边栏** — 滚动时保持可见

### R2 — 流式更新可视化

#### Pulse 动画指示器

```typescript
const lastProgressRef = useRef<number>(-1);

useEffect(() => {
  if (lastProgressRef.current !== -1 && lastProgressRef.current !== currentProgress) {
    setStreamingPulse(true);
    const t = setTimeout(() => setStreamingPulse(false), 1500);
    return () => clearTimeout(t);
  }
  lastProgressRef.current = currentProgress;
}, [currentProgress]);
```

每当 SSE 推送的 progress 字段变化时：
- 触发 1.5s pulse 动画
- "正在更新" 文字标记

#### 实时评审横幅

仅在 `status === 'reviewing'` 时显示：
- 蓝色脉动圆点 + 外层圆环
- 标题「实时评审中」
- 副标题：进度 + 当前节点
- CSS keyframe 动画

### 状态管理

新增 4 个状态：
```typescript
const [showDocEditor, setShowDocEditor] = useState(false);
const [docViewMode, setDocViewMode] = useState<'preview' | 'source'>('preview');
const [streamingPulse, setStreamingPulse] = useState(false);
const lastProgressRef = useRef<number>(-1);
```

---

## 验证

- ✅ TypeScript 类型检查通过
- 待手动验证：
  - 评审中状态显示流式横幅
  - 进度变化触发 pulse
  - 切换预览/源码视图
  - 标注侧边栏与文档主区联动

---

## 下一步

Step 14: Reviews R7 — SequentialPanel（顺序评审面板）
