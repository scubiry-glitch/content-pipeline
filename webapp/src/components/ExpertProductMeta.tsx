// 专家体系产出物元数据
// 15 个产出物的上游来源、下游引用、页面路由、所属阶段
// 与 ContentLibraryProductMeta 对称，供 /expert-library/panorama 消费

export interface ExpertProductMetaDef {
  id: string;          // ① ② ③ ...
  name: string;
  upstream: string[];
  downstream: string[];
  page?: string;
  /** 所属阶段 */
  phase?: '档案' | '匹配' | '产出' | '协作' | '沉淀';
}

export const EXPERT_PRODUCT_META: Record<string, ExpertProductMetaDef> = {
  // 档案阶段 ①-④
  profile: {
    id: '①', name: '专家档案',
    upstream: [
      '内置 seed 专家 (17+ 份 persona/method/EMM)',
      '研究生成: 6-agent research-generate 管线',
      'expert_profiles 表 (display_metadata/level/domain)',
    ],
    downstream: ['所有调用入口 (invoke/chat/review-outline)', '专家匹配 ⑤', '心智模型构建 ③'],
    page: '/expert-library', phase: '档案',
  },
  knowledge: {
    id: '②', name: '知识源索引',
    upstream: [
      '用户上传 (会议纪要/PPT/PDF/访谈)',
      'LLM 抽取 key_insights',
      'pgvector 向量化 content_embedding',
    ],
    downstream: ['调用时语义检索 (top-k)', '对话上下文注入', '专家档案富化'],
    page: '/expert-knowledge-graph', phase: '档案',
  },
  mentalModels: {
    id: '③', name: '心智模型图谱',
    upstream: ['所有活跃专家的 persona.cognition.mentalModels', '领域共享模型推断'],
    downstream: ['辩论引擎模型激活', '专家网络可视化', '模型检索'],
    page: '/mental-models', phase: '档案',
  },
  heuristics: {
    id: '④', name: '决策启发规则',
    upstream: ['profile.method.heuristics (IF-THEN 列表)', '历史调用中被激活的规则'],
    downstream: ['每次调用前 heuristicsMatcher 匹配 ≤3 条', 'prompt 注入'],
    page: '/expert-library', phase: '档案',
  },

  // 匹配阶段 ⑤-⑦
  match: {
    id: '⑤', name: '专家匹配',
    upstream: ['ExpertMatcher 评分 (domain/tier/expertise/availability)', '任务上下文'],
    downstream: ['任务调度自动分配', '大纲评审分发', '辩论参与者推荐'],
    page: '/expert-library', phase: '匹配',
  },
  workload: {
    id: '⑥', name: '工作量视图',
    upstream: ['expert_task_assignments (status/deadline)', '活跃任务 + 已完成任务计数'],
    downstream: ['任务调度负载均衡', '管理员监控'],
    page: '/expert-scheduling', phase: '匹配',
  },
  availability: {
    id: '⑦', name: '可用性状态',
    upstream: ['专家手动标注的 availability', '当前活跃任务数衍生'],
    downstream: ['任务分配优先级', '匹配结果过滤'],
    page: '/expert-scheduling', phase: '匹配',
  },

  // 产出阶段 ⑧-⑪
  analysis: {
    id: '⑧', name: '专业分析',
    upstream: ['POST /invoke (task_type=analysis)', '知识源 + 心智模型 + EMM 门控'],
    downstream: ['任务研究阶段素材', '任务卡洞察沉淀', '复用缓存'],
    page: '/expert-chat', phase: '产出',
  },
  evaluation: {
    id: '⑨', name: '评估判定',
    upstream: ['POST /invoke (task_type=evaluation)', 'Analyze-then-Judge 三层析判', 'Rubric 量表'],
    downstream: ['蓝军评审意见', '草稿质量打分', 'rubric_scores 存档'],
    page: '/expert-chat', phase: '产出',
  },
  generation: {
    id: '⑩', name: '生成输出',
    upstream: ['POST /invoke (task_type=generation)', '专家表达 DNA linter'],
    downstream: ['写作辅助 (段落建议)', '任务 Writing 阶段'],
    page: '/expert-chat', phase: '产出',
  },
  outlineReview: {
    id: '⑪', name: '大纲评审',
    upstream: ['POST /review-outline', 'OutlineExpertReviewer 分节评审 + 修订版生成'],
    downstream: ['任务规划阶段修订大纲', '结构性风险提示'],
    page: '/tasks', phase: '产出',
  },

  // 协作阶段 ⑫-⑭
  debate: {
    id: '⑫', name: '多专家辩论',
    upstream: [
      '3 轮辩论 (独立 → 交叉质疑 → 综合裁决)',
      'expert_invocations task_type=debate',
      '心智模型激活',
    ],
    downstream: ['辩论历史查询', '共识与分歧提炼', '决策支持'],
    page: '/expert-debate', phase: '协作',
  },
  hotTopic: {
    id: '⑬', name: '热点观点',
    upstream: ['热点话题匹配相关专家', 'HotTopicExpertService 生成', 'expert_invocations 缓存'],
    downstream: ['热点洞察页专家栏', '选题会参考'],
    page: '/hot-topics', phase: '协作',
  },
  assetAnnotation: {
    id: '⑭', name: '素材标注/可信度',
    upstream: ['素材元数据 + 专家匹配', 'AssetExpertService', 'expert_invocations 缓存'],
    downstream: ['素材库可信度标签', '写作时专家背书提示', '风控素材过滤'],
    page: '/assets', phase: '协作',
  },

  // 沉淀阶段 ⑮
  feedback: {
    id: '⑮', name: '绩效与反馈闭环',
    upstream: [
      'expert_feedback (human_score + rubric_scores + actual_outcome)',
      '调用历史聚合',
      'FeedbackLoop weight 校准',
    ],
    downstream: ['EMM weight 动态调整', '专家档案校准', '管理员监控看板'],
    page: '/expert-library', phase: '沉淀',
  },
};
