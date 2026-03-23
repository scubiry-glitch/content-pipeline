// Components - 统一组件导出

// 文档编辑
export { DocumentEditor } from './DocumentEditor';
export type { 
  DocumentEditorProps, 
  CommentItem, 
  HistoryItem, 
  TaskItem, 
  CommentTab 
} from './DocumentEditor';

// 内容组件
export { LivePreviewMarkdown } from './content/LivePreviewMarkdown';
export type { LivePreviewMarkdownProps } from './content/LivePreviewMarkdown';

export { InlineAnnotationArea } from './content/InlineAnnotationArea';
export type { 
  InlineAnnotationAreaProps, 
  Annotation, 
  AnnotationSeverity 
} from './content/InlineAnnotationArea';

export { VersionTimeline } from './content/VersionTimeline';
export type { VersionTimelineProps, Version } from './content/VersionTimeline';

// Markdown
export { MarkdownRenderer } from './MarkdownRenderer';

// 其他
export { SequentialReviewStatus, SequentialReviewQueueDetail } from './SequentialReviewStatus';
export { ReviewConfigPanel } from './ReviewConfigPanel';
export type { ReviewConfigPanelProps } from './ReviewConfigPanel';
