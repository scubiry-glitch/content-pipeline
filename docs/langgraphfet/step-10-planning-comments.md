# Step 10 阶段报告：Planning 评论系统（P5）

**对应缺口：** Planning P5 — 评论/反馈系统（CRUD）

---

## 实施内容

由于 LG 后端没有评论 API，使用 localStorage 客户端持久化实现完整的评论 CRUD 系统。

### 文件改动

| 文件 | 变更类型 | 行数 |
|------|---------|------|
| `webapp/src/pages/lg-task-detail/LGPlanningTab.tsx` | 编辑 | +130 |

### 核心功能

#### 1. 数据模型

```typescript
interface OutlineComment {
  id: string;
  sectionTitle: string;  // 关联章节（可为空）
  author: string;
  content: string;
  createdAt: string;
}
```

#### 2. CRUD 操作

- **Create**: `addComment()` — 添加新评论
- **Read**: 自动从 localStorage 加载
- **Delete**: `deleteComment(id)` — 单条删除
- **Persist**: `saveComments(threadId, comments)` — 按 threadId 隔离

#### 3. UI 组件

**评论表单：**
- 章节选择下拉框（自动收集 outline 中所有 section title，支持嵌套递归）
- 评论文本框
- 发布按钮

**评论列表：**
- 作者 / 时间戳 / 章节徽章
- 评论正文
- 删除按钮（hover 显示）
- 空状态提示

#### 4. 关联章节

新增 `sectionTitles[]` 数组，递归收集 outline 所有 sections 和 subsections 的标题，作为评论的下拉选项。

### 状态管理

```typescript
const [comments, setComments] = useState<OutlineComment[]>([]);
const [newCommentText, setNewCommentText] = useState('');
const [newCommentSection, setNewCommentSection] = useState<string>('');
```

---

## 验证

- ✅ TypeScript 类型检查通过
- 待手动验证：
  - 添加评论 → 列表更新 → 刷新页面后保留
  - 关联章节徽章正确
  - 删除评论后从列表移除

---

## 下一步

Step 11: Research Re1 — 多源引擎配置 UI
