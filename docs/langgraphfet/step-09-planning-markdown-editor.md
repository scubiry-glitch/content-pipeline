# Step 9 阶段报告：Planning Markdown 三模式编辑器（P4）

**对应缺口：** Planning P4 — Markdown 编辑器（Edit/Preview/Split 三模式）

---

## 实施内容

将原本 JSON-only 的大纲编辑模式升级为支持 Markdown / JSON 双格式 + 编辑/分屏/预览三视图模式的完整编辑器。

### 文件改动

| 文件 | 变更类型 | 行数 |
|------|---------|------|
| `webapp/src/pages/lg-task-detail/LGPlanningTab.tsx` | 编辑 | +200 |

### 核心功能

#### 1. 双格式互转

新增两个工具函数：
- **`outlineToMarkdown(sections, title)`** — JSON 大纲 → Markdown 文本（递归遍历 subsections，使用 `#/##/###` 表示层级）
- **`markdownToOutline(md)`** — Markdown 文本 → JSON 大纲（基于 heading level 重建嵌套结构，自动清理空 subsections/content）

#### 2. 三视图模式

| 模式 | 布局 |
|------|------|
| **edit** 编辑 | 仅显示 textarea |
| **split** 分屏 | 左 textarea / 右预览（默认） |
| **preview** 预览 | 仅显示 MarkdownRenderer 渲染结果 |

#### 3. 格式切换器

顶部工具栏带两组按钮：
- **格式切换**：MARKDOWN / JSON（切换时自动转换文本内容）
- **视图切换**：编辑 / 分屏 / 预览（带图标）

#### 4. 提交转换

`handleConfirm()` 根据当前 `editorFormat` 自动选择解析方式：
- markdown → 用 `markdownToOutline()` 解析
- json → 用 `JSON.parse()` 解析

提交后构造 `{ sections, title }` 通过 `onResume` 传递给 humanOutlineNode。

#### 5. 智能预览

`previewMarkdown` 计算属性：
- markdown 模式：直接使用 textarea 内容
- json 模式：解析 JSON 后转换为 markdown，失败则显示「无效的 JSON 格式」

### 状态管理

新增状态：
```typescript
const [editorMode, setEditorMode] = useState<EditorMode>('split');
const [editorFormat, setEditorFormat] = useState<'json' | 'markdown'>('markdown');
```

默认进入 split + markdown 模式（最直观）。

---

## 验证

- ✅ TypeScript 类型检查通过
- 待手动验证：
  - 编辑大纲 → 预览实时更新
  - 切换 markdown ↔ json → 内容正确转换
  - 切换 edit/split/preview → 布局响应正确

---

## 下一步

Step 10: Planning P5 — 评论/反馈系统
