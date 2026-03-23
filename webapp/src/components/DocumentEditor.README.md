# DocumentEditor 组件

统一的文档编辑器组件，结合 code.html 和 EditorPipeline.html 的设计优点。

## 设计参考

- **code.html**: 8:4 网格布局，左侧正文带高亮标注，右侧评论面板
- **EditorPipeline.html**: 固定右侧边栏，Comments/History/Tasks 标签页

## 特性

- 📄 **左侧文档区域**: Markdown 渲染，支持文本高亮
- 💬 **右侧评论面板**: 三标签页设计（Comments/History/Tasks）
- ✅ **评论操作**: Accept/Ignore 按钮
- 📊 **质量指标**: Readability、Fact-Check 显示
- 🎨 **专家标识**: 不同角色不同图标和颜色

## 使用示例

```tsx
import { DocumentEditor } from './components';
import type { CommentItem, HistoryItem } from './components';

// 评论数据
const comments: CommentItem[] = [
  {
    id: '1',
    content: 'This claim needs a citation',
    author: 'AI Challenger',
    authorType: 'ai',
    authorRole: 'challenger',
    severity: 'warning',
    timestamp: '2024-01-15T10:30:00Z',
    location: 'Para 2',
    suggestion: 'Add source reference',
    status: 'pending',
  },
];

// 历史版本
const history: HistoryItem[] = [
  {
    id: 'v1',
    version: 'v1.0',
    title: 'Initial Draft',
    timestamp: '2024-01-15T09:00:00Z',
    author: 'System',
  },
];

// 使用
<DocumentEditor
  title="Document Title"
  content={markdownContent}
  version="1.0"
  comments={comments}
  history={history}
  metrics={{
    readability: 84,
    factCheck: 91,
    wordCount: 1240,
  }}
  onCommentAccept={(id) => console.log('Accept:', id)}
  onCommentIgnore={(id) => console.log('Ignore:', id)}
  onHistorySelect={(item) => console.log('Select:', item)}
/>
```

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| title | string | 'Document' | 文档标题 |
| content | string | required | Markdown 内容 |
| version | string | - | 版本号 |
| comments | CommentItem[] | [] | 评论列表 |
| history | HistoryItem[] | [] | 历史版本 |
| tasks | TaskItem[] | [] | 任务列表 |
| highlights | Highlight[] | [] | 文本高亮配置 |
| metrics | Metrics | - | 质量指标 |
| onCommentAccept | (id) => void | - | 接受评论回调 |
| onCommentIgnore | (id) => void | - | 忽略评论回调 |
| onHistorySelect | (item) => void | - | 选择历史版本回调 |

## 类型定义

```tsx
interface CommentItem {
  id: string;
  content: string;
  author: string;
  authorType: 'ai' | 'human';
  authorRole?: string;
  severity: 'critical' | 'warning' | 'info' | 'praise';
  timestamp: string;
  location?: string;
  suggestion?: string;
  status: 'pending' | 'accepted' | 'ignored';
}

interface HistoryItem {
  id: string;
  version: string;
  title: string;
  timestamp: string;
  author?: string;
}

interface TaskItem {
  id: string;
  title: string;
  status: 'pending' | 'in_progress' | 'completed';
  assignee?: string;
}
```

## 在 ReviewsTab 中使用

ReviewsTab 已集成 DocumentEditor，自动将 BlueTeamReview 转换为 CommentItem 格式显示。

## 样式参考

- 左侧正文区域: `lg:col-span-8`, 白色背景，prose 样式
- 右侧面板: `lg:col-span-4`, slate-50 背景
- 评论卡片: 左侧彩色边框区分严重程度
- 标签页: 底部边框激活状态
