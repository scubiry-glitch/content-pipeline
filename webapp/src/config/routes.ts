// 路由常量 — 全局唯一的路径来源
// 新增/修改路径时统一在此处更新，避免散落的字符串

export const ROUTES = {
  dashboard: '/',

  tasks: {
    list: '/tasks',
    langGraph: '/lg-tasks',
  },

  assets: {
    library: '/assets',
    reports: '/assets/reports',
    popular: '/assets/popular',
    rss: '/assets/rss',
    bindings: '/assets/bindings',
  },

  expert: {
    library: '/expert-library',
    chat: '/expert-chat',
    comparison: '/expert-comparison',
    debate: '/expert-debate',
    debateDetail: (id: string) => `/expert-debate/${id}`,
    network: '/expert-network',
    scheduling: '/expert-scheduling',
    knowledgeGraph: '/expert-knowledge-graph',
    admin: (expertId: string) => `/expert-admin/${expertId}`,
    legacy: '/experts',
  },

  mentalModels: '/mental-models',

  contentLibrary: {
    overview: '/content-library',
    topics: '/content-library/topics',
    trends: '/content-library/trends',
    facts: '/content-library/facts',
    entities: '/content-library/entities',
    delta: '/content-library/delta',
    freshness: '/content-library/freshness',
    cards: '/content-library/cards',
    synthesis: '/content-library/synthesis',
    materials: '/content-library/materials',
    consensus: '/content-library/consensus',
    contradictions: '/content-library/contradictions',
    beliefs: '/content-library/beliefs',
    crossDomain: '/content-library/cross-domain',
    wiki: '/content-library/wiki',
    batchOps: '/content-library/batch-ops',
    pipeline: '/content-library/pipeline',
  },

  hotTopics: {
    list: '/hot-topics',
    insights: '/hot-topics/insights',
    insightDetail: (topicId: string) => `/hot-topics/insights/${topicId}`,
    detail: (id: string) => `/hot-topics/${id}`,
  },

  aiRecommendations: '/ai-task-recommendations',

  system: {
    settings: '/settings',
    notifications: '/notifications',
    copilot: '/copilot',
    compliance: '/compliance',
    i18n: '/i18n',
  },
} as const;
