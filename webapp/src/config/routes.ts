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
    meetingNoteSources: '/meeting-note-sources',
  },

  expert: {
    library: '/expert-library',
    panorama: '/expert-panorama',
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

  admin: {
    taxonomy: '/admin/taxonomy',
  },

  // CEO 应用 — 双模主壳 (外部世界 / 内部世界) + 六房间 + Panorama + 外脑图书馆
  ceo: {
    shell: '/ceo',
    external: {
      meetings: '/ceo/external/meetings',
      library: '/ceo/external/library',
    },
    internal: {
      home: '/ceo/internal/ceo',
      panorama: '/ceo/internal/ceo/panorama',
      compass: '/ceo/internal/ceo/compass',
      boardroom: '/ceo/internal/ceo/boardroom',
      tower: '/ceo/internal/ceo/tower',
      warRoom: '/ceo/internal/ceo/war-room',
      situation: '/ceo/internal/ceo/situation',
      balcony: '/ceo/internal/ceo/balcony',
    },
    brain: {
      home: '/ceo/internal/brain',
      tasks: '/ceo/internal/brain/tasks',
      contentLibrary: '/ceo/internal/brain/content-library',
      expertLibrary: '/ceo/internal/brain/expert-library',
      assets: '/ceo/internal/brain/assets',
      hotTopics: '/ceo/internal/brain/hot-topics',
    },
  },
} as const;
