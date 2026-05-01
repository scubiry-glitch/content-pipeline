// _axisDisplayTabs.ts — R4 · UI 视角的 7/6/8 tab 配置
//
// 与 _axisRegistry.ts 的 AXIS_REGISTRY/AXIS_SUBDIMS 解耦：
//   - AXIS_REGISTRY/AXIS_SUBDIMS = 后端 runEngine 视角（哪些 computer 能跑）
//   - AXIS_DISPLAY_TABS         = 前端 UI 视角（每个 axis 显示哪些 tab）
//
// 这层引入后：
//   - 老 mn_runs 的 axis/sub_dim 取值全部仍可执行（runEngine 不动）
//   - UI tab 可以跨轴搬家（如 cognitive_biases 知识→人物的"盲区档案"）
//   - 跨模块复用（如 阵型 调 ceo war-room API；信念轨迹 调 longitudinal API）
//   - 多源合并 tab（如 心智模型 = mental_models + model_hitrate）
//
// 不在这里：
//   - tab 内部组件实现（在 AxisXxx.tsx 里）
//   - 数据 fetch 实现（在 webapp/src/api/meetingNotes.ts 里）

export type DisplayTabSourceType =
  | 'mn-table'        // 直读 mn_* 表（通过现有 list/get endpoint）
  | 'mn-axis-subdim'  // 引用 axes/registry 的某 sub_dim（仍走 runEngine）
  | 'ceo-room-api'    // 跨模块：调 /api/v1/ceo/<room>/<endpoint>
  | 'composite';      // 多源合并 tab，refs 列出所有上游

export interface DisplayTab {
  id: string;
  label: string;
  /** mono 字体的副标题（图标行下面那行小字） */
  sub: string;
  /** 数据来源声明 — 用于面板右侧"数据源"指示条 + 文档化 */
  source: { type: DisplayTabSourceType; refs: string[] };
  /** 占位状态（v1 lite 标记，待真实数据/组件接入） */
  pending?: boolean;
}

// ============================================================
// 人物轴 · 7 业务 tab + 1 管理 tab = 8
// ============================================================
export const PEOPLE_TABS: DisplayTab[] = [
  {
    id: 'commitments',
    label: '承诺与兑现',
    sub: '说到做到率 · 跨会议承诺 ledger',
    source: { type: 'mn-table', refs: ['mn_commitments'] },
  },
  {
    id: 'trajectory',
    label: '角色画像演化',
    sub: '功能角色的漂移 · 提出者 / 质疑者 / 执行者',
    source: { type: 'mn-table', refs: ['mn_role_trajectory_points'] },
  },
  {
    id: 'speech',
    label: '发言质量',
    sub: '信息熵 · 被追问率 · 引用率',
    source: { type: 'mn-table', refs: ['mn_speech_quality'] },
  },
  {
    id: 'silence',
    label: '沉默信号 + RASIC',
    sub: '反常沉默 + (人 × 议题) 角色矩阵',
    source: { type: 'composite', refs: ['mn_silence_signals', 'mn_commitments'] },
  },
  // R4 · 跨模块下沉：信念轨迹从 longitudinal 移过来
  {
    id: 'belief',
    label: '信念轨迹',
    sub: '同一议题上同一人随时间的判断变化',
    source: { type: 'mn-table', refs: ['mn_belief_drift_series'] },
  },
  // R4 · 跨模块下沉：阵型从 CEO War Room 移过来
  {
    id: 'formation',
    label: '阵型',
    sub: 'CEO War Room · 团队战术编队',
    source: { type: 'ceo-room-api', refs: ['/api/v1/ceo/war-room/formation'] },
  },
  // R4 · 跨轴搬家：cognitive_biases 知识 → 人物的盲区档案
  {
    id: 'blind_spots',
    label: '盲区档案',
    sub: '认知偏差 + 自认矛盾',
    source: { type: 'composite', refs: ['mn_cognitive_biases', 'mn_belief_drift_series'] },
  },
  // 保留：人物管理（R4 设计原则 #2）
  {
    id: 'manage',
    label: '人物管理',
    sub: '改名 · alias 历史映射',
    source: { type: 'mn-table', refs: ['mn_people'] },
  },
];

// ============================================================
// 项目轴 · 6 tabs
// ============================================================
export const PROJECTS_TABS: DisplayTab[] = [
  // R4 · 合并：决策溯源链 + 决策树同 tab 内两段
  {
    id: 'provenance',
    label: '决策溯源',
    sub: '链 + 树 · 决策如何一步步走到这里',
    source: { type: 'composite', refs: ['mn_decisions', 'mn_decision_tree_snapshots'] },
  },
  {
    id: 'assumptions',
    label: '假设清单',
    sub: '每个决策背后的未验证假设',
    source: { type: 'mn-table', refs: ['mn_assumptions'] },
  },
  {
    id: 'questions',
    label: '未解问题',
    sub: '跨会议追踪',
    source: { type: 'mn-table', refs: ['mn_open_questions'] },
  },
  {
    id: 'risks',
    label: '风险与收益',
    sub: '风险热度 + 收益散点',
    source: { type: 'composite', refs: ['mn_risks'] },
  },
  // R4 · 跨模块下沉：责任盘点从 CEO Tower 移过来
  {
    id: 'responsibility',
    label: '责任盘点',
    sub: '承诺 × 清晰度 × 兑现率',
    source: { type: 'composite', refs: ['mn_commitments', 'ceo_attention_alloc'] },
  },
  // R4 · 跨模块下沉：对外影响从 CEO Situation 移过来
  {
    id: 'stakeholders',
    label: '对外影响',
    sub: '利益相关方热力图',
    source: { type: 'ceo-room-api', refs: ['/api/v1/ceo/situation/stakeholders'] },
  },
];

// ============================================================
// 知识轴 · 8 tabs（后端 sub_dim 仍 10 个，UI 合并 / 移除）
// ============================================================
export const KNOWLEDGE_TABS: DisplayTab[] = [
  // R4 · 合并：reusable_judgments + 新认知摘要同 tab
  {
    id: 'cognition',
    label: '认知沉淀',
    sub: '可复用判断 + 本场新认知',
    source: { type: 'composite', refs: ['mn_judgments'] },
  },
  // R4 · 合并：mental_models 激活 + model_hitrate 命中率同 tab
  {
    id: 'mental_models',
    label: '心智模型',
    sub: '激活 + 6 个月命中率',
    source: { type: 'composite', refs: ['mn_mental_model_invocations', 'mn_mental_model_hit_stats'] },
  },
  {
    id: 'evidence',
    label: '证据层级',
    sub: 'A/B/C/D 分级统计',
    source: { type: 'mn-table', refs: ['mn_evidence_grades'] },
  },
  {
    id: 'counterfactuals',
    label: '反事实 / 未走的路',
    sub: '被否决的路径持续追踪',
    source: { type: 'mn-table', refs: ['mn_counterfactuals'] },
  },
  // R3-A 新增：保留为独立 tab
  {
    id: 'consensus',
    label: '共识与分歧',
    sub: '一个 topic 的多场表态',
    source: { type: 'mn-table', refs: ['mn_consensus_tracks'] },
  },
  // R4 · 升级标签（concept_drift → 概念辨析）
  {
    id: 'concept',
    label: '概念辨析',
    sub: '同词不同义诊断',
    source: { type: 'mn-table', refs: ['mn_concept_drifts'] },
    pending: true,
  },
  // R4 · 合并：topic_lineage + rehash 指数
  {
    id: 'lineage',
    label: '议题谱系与健康',
    sub: '出生 / 健康 / 濒危 + rehash 指数',
    source: { type: 'composite', refs: ['mn_topic_lineage'] },
    pending: true,
  },
  // R3-A 新增：独立 tab
  {
    id: 'external',
    label: '外脑批注',
    sub: '引用源 + 事后准确度',
    source: { type: 'mn-table', refs: ['mn_external_experts'] },
    pending: true,
  },
  // R4 · 移除：cognitive_biases 不再做独立 tab，移到人物的盲区档案
  // 后端 mn_cognitive_biases 表 + sub_dim 'cognitive_biases' 保留可执行
];

// ============================================================
// 统一查询 API
// ============================================================
export const AXIS_DISPLAY_TABS: Record<string, DisplayTab[]> = {
  people: PEOPLE_TABS,
  projects: PROJECTS_TABS,
  knowledge: KNOWLEDGE_TABS,
};

/** 在某个 axis 下根据 tab id 查 tab 配置；未命中返回 undefined */
export function findDisplayTab(axis: string, tabId: string): DisplayTab | undefined {
  return AXIS_DISPLAY_TABS[axis]?.find((t) => t.id === tabId);
}
