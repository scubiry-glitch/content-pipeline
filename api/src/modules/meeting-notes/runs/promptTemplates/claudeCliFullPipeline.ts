// runs/promptTemplates/claudeCliFullPipeline.ts
//
// 把整段转写 + 输出 schema spec + 专家 personas（按场景挑字段）+ 装饰指令 + few-shot
// 拼成一段 system+user prompt 字符串，喂给 spawn('claude', ['-p', '--output-format', 'json'])
// 的 stdin。一次生成 { meeting, participants, analysis, axes } 整个对象。
//
// 设计原则：
//   - 单次调用 · 不分块 · Claude 200K 上下文充裕
//   - 每位专家按对应轴只挑 ~3-5 个最相关字段，避免 prompt 稀释
//   - schema spec 尽量紧凑（trim 掉示例数据，保留 key + type + 取值约束注释）
//   - few-shot 给一个最小可用样例，让 Claude 模仿格式而不是模仿内容

import type {
  ExpertSnapshot,
  ExpertRoleAssignment,
  ExpertRoleId,
} from '../expertProfileLoader.js';
import { renderTaxonomyForPrompt } from '../../../content-library/wiki/wikiFrontmatter.js';

// ============================================================
// 入参类型
// ============================================================

export interface ClaudeCliPromptCtx {
  /** parseMeeting 出来的转写正文 + 参与者表 */
  meetingId: string;
  meetingTitle: string;
  meetingKind: string | null;
  participants: Array<{ localId: string; name: string }>;
  /** 转写已 cleaned 过的正文（按 segments 重组成 "name: text" 形式给 Claude 更易读） */
  transcript: string;

  /** Step 2 专家分配：people / projects / knowledge → expertId[] */
  expertRoles: ExpertRoleAssignment | null;
  /** 已经从 DB 拉好的 ExpertSnapshot，按 expertId 索引 */
  expertSnapshots: Map<string, ExpertSnapshot>;

  /** strategy 解析链结果（runEngine.enqueue 同款）：lite | standard | max */
  preset: 'lite' | 'standard' | 'max';
  /** 装饰器名字数组（例如 ['failure_check', 'emm_iterative', 'rubric_anchored_output', ...]） */
  decoratorChain: string[];

  /** scope 级 expert-config（仅 project/client/topic scope 才有；meeting scope 时 null） */
  scopeConfig: null | {
    preset: string;
    strategies?: string[];
    decorators?: string[];
  };
}

// ============================================================
// 装饰器 promptFragment 注册表
// 这里定义 axes/decoratorStack.ts 已有装饰器对应的"指令片段"。
// 与 runtime 的 applyDecoratorStack 互独立但语义对齐 —— 给 Claude 看的是简化版。
// ============================================================

const DECORATOR_FRAGMENTS: Record<string, string> = {
  failure_check:
    '在每个分析结论后, 显式写出"如果错了, 最可能错在哪一步"; 让结论自带反例。',
  emm_iterative:
    '迭代地校验每个判断的关键因子(critical factors)是否被覆盖, 缺漏要标注。',
  evidence_anchored:
    '所有结论必须能锚定到原文 moments(who:「quote」格式); 没有原文锚点的结论标注 [无原文证据]。',
  rubric_anchored_output:
    '按 schema 定义的字段 rubric 输出, 字段不要省略, 取值范围严格遵守(0-1 / A-D / 枚举)。',
  calibrated_confidence:
    '给每个判断附上 confidence 0-1; 不确定的字段宁可写 0.5 + null, 不要伪装高置信度。',
  signature_style:
    '在 summary / decision 等开放文本字段, 模仿被分配的专家的标志性表达(signature_phrases)。',
  track_record_verify:
    '同类历史案例对比一次, 看本次会议的判断和过去类似场景的产出是否一致。',
  debate:
    '在 tension / consensus.divergence / crossView.responses 字段, 必须明确呈现支持方与反对方的分歧矩阵; 不要单边描述。',
  mental_model_rotation:
    '至少调用 2 个不同的思维模型(framework)审视同一议题, 输出到 axes.knowledge.mentalModels。',
  single: '专家单视角输出, 不做内部多回合辩论。',
  heuristic_trigger_first:
    '先按启发式规则快速分类, 再针对性深挖每条; 适合短转写。',
};

// ============================================================
// 字段-轴-场景映射: renderExpertContextForAxis
// 每个轴/角色挑 ExpertSnapshot 里相关度最高的字段,渲染成紧凑 markdown bullet
// 详见 plan §E.3 字段-轴-场景映射表
// ============================================================

const ROLE_LABEL: Record<ExpertRoleId, string> = {
  people: '人物轴 · people',
  projects: '项目轴 · projects',
  knowledge: '知识轴 · knowledge / meta / tension',
};

function take<T>(arr: T[] | undefined, n: number): T[] {
  return Array.isArray(arr) ? arr.slice(0, n) : [];
}

function trunc(s: string | undefined, n: number): string {
  if (!s) return '';
  const t = s.trim();
  return t.length > n ? t.slice(0, n) + '…' : t;
}

/**
 * 按角色(对应一组轴)从专家 ExpertSnapshot 里挑字段,渲染成"该专家会盯紧什么"的紧凑列表。
 * 输出已经是 markdown bullet,直接拼到 system prompt 即可。
 */
function renderExpertContextByRole(snap: ExpertSnapshot, role: ExpertRoleId): string {
  const lines: string[] = [];
  const head = snap.domain ? `${snap.name}（${snap.domain}）` : snap.name;
  lines.push(`▸ 由 ${snap.expertId} · ${head} 的视角分析`);

  // 方法论 (METHODOLOGY)
  const methodLines: string[] = [];
  if (role === 'projects') {
    if (snap.method.frameworks && snap.method.frameworks.length) {
      methodLines.push(`框架: ${take(snap.method.frameworks, 4).join(' · ')}`);
    }
    if (snap.method.evidenceStandard) {
      methodLines.push(`证据标准: ${trunc(snap.method.evidenceStandard, 120)}`);
    }
    if (snap.method.reviewLens?.deepDive?.length) {
      methodLines.push(`深挖维度: ${take(snap.method.reviewLens.deepDive, 4).join(' / ')}`);
    }
  } else if (role === 'knowledge') {
    if (snap.method.frameworks && snap.method.frameworks.length) {
      methodLines.push(`思维模型库: ${take(snap.method.frameworks, 5).join(' / ')}`);
    }
    if (snap.method.reasoning) {
      methodLines.push(`推理风格: ${trunc(snap.method.reasoning, 150)}`);
    }
    if (snap.method.dataPreference) {
      methodLines.push(`数据偏好: ${trunc(snap.method.dataPreference, 100)}`);
    }
    if (snap.method.evidenceStandard) {
      methodLines.push(`证据标准: ${trunc(snap.method.evidenceStandard, 100)}`);
    }
  } else {
    // people: 偏个性/语气而不是方法论
    if (snap.method.reviewLens?.firstGlance) {
      methodLines.push(`一眼看出: ${trunc(snap.method.reviewLens.firstGlance, 120)}`);
    }
    if (snap.method.reviewLens?.killShot) {
      methodLines.push(`杀手级提问: "${trunc(snap.method.reviewLens.killShot, 100)}"`);
    }
  }
  if (methodLines.length) {
    lines.push('  方法论:');
    for (const l of methodLines) lines.push(`    • ${l}`);
  }

  // EMM 门控
  const emmLines: string[] = [];
  if (snap.emm.critical_factors?.length) {
    emmLines.push(`关键因子: ${take(snap.emm.critical_factors, 5).join('、')}`);
  }
  if (role !== 'people' && snap.emm.veto_rules?.length) {
    emmLines.push(`一票否决: ${take(snap.emm.veto_rules, 3).join('；')}`);
  }
  if (role === 'projects' && snap.emm.factor_hierarchy && Object.keys(snap.emm.factor_hierarchy).length) {
    const top = Object.entries(snap.emm.factor_hierarchy)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 4)
      .map(([k, v]) => `${k}=${v}`)
      .join(', ');
    emmLines.push(`因子权重: ${top}`);
  }
  if (role === 'knowledge' && snap.emm.aggregation_logic) {
    emmLines.push(`聚合逻辑: ${snap.emm.aggregation_logic}`);
  }
  if (emmLines.length) {
    lines.push('  EMM 门控:');
    for (const l of emmLines) lines.push(`    • ${l}`);
  }

  // BRAND & SIGNATURE
  const brandLines: string[] = [];
  if (snap.signaturePhrases?.length) {
    brandLines.push(`习惯说: ${take(snap.signaturePhrases, 3).map((q) => `"${trunc(q, 80)}"`).join('、')}`);
  } else if (snap.philosophyQuotes?.length) {
    brandLines.push(`哲学引用: ${take(snap.philosophyQuotes, 2).map((q) => `"${trunc(q, 80)}"`).join('、')}`);
  }
  if (snap.style) {
    brandLines.push(`风格: ${trunc(snap.style, 100)}`);
  }
  if (role === 'knowledge' && snap.core?.length) {
    brandLines.push(`内核: ${take(snap.core, 3).join(' / ')}`);
  }
  if (brandLines.length) {
    lines.push('  品牌 / 标志性:');
    for (const l of brandLines) lines.push(`    • ${l}`);
  }

  // anti-patterns（反向约束）
  if (snap.antiPatterns?.length && (role === 'projects' || role === 'knowledge')) {
    lines.push(`  反模式（避免）: ${take(snap.antiPatterns, 3).join('、')}`);
  }

  return lines.join('\n');
}

// ============================================================
// Schema specs (inline, compact)
// ============================================================

const ANALYSIS_SCHEMA_SPEC = `
{
  // —— summary 段 —— action items + decision + risks
  summary: {
    decision: string,                                       // 1-2 句话, 主决议
    actionItems: [{
      id: 'A1' | 'A2' | ...,                                // 局部 ID
      who: 'p1' | 'p2' | ...,                               // 必须用 participants 数组里的 localId
      what: string,                                         // 行动内容
      due: string                                           // 'YYYY-MM-DD' 或 '—'
    }],
    risks: string[]                                         // 5-10 条, 每条用 'R1 · 短描述 — 原话引用' 形式更佳
  },

  // —— tension —— 张力(未解的推拉, 不是冲突)
  // 数量下限: ≥5 条 (除非会议特别短/平淡, 否则不应少于 5)
  tension: [{
    id: 'T1' | 'T2' | ...,
    between: string[],                                      // ['p1', 'p3'] 等参与人 localId
    topic: string,                                          // 张力主题, 形如 '简单包入 vs 下游改造太多'
    intensity: number,                                      // 0-1
    summary: string,                                        // ≥250 字, 必须分段呈现至少两方立场, 含原文短引用穿插
    moments: string[]                                       // ≥4 条原文锚点, 'pX:「完整原话」' 格式; 不可意译, 必须照抄转写
  }],

  // —— newCognition —— 信念更新(谁的认知发生了变化)
  // 数量下限: ≥6 条 (覆盖每个主要议题至少 1 条 cognition shift)
  newCognition: [{
    id: 'N1' | ...,
    who: 'p1' | ...,
    before: string,                                         // 会前/初始信念, 完整一句话
    after: string,                                          // 会后/更新后信念, 完整一句话, 与 before 形成强对比
    trigger: string                                         // 触发更新的事件/数据/论点, 必须含原话引用 'pX:「...」'
  }],

  // —— focusMap —— 各人物关注主题
  focusMap: [{
    who: 'p1' | ...,
    themes: string[],                                       // 4-6 个 keyword 短语
    returnsTo: number                                       // 该人物多次回到这些主题的累计次数(粗估)
  }],

  // —— consensus / divergence —— 共识与分歧
  // 数量下限: 合计 ≥10 条 (consensus + divergence 加起来), 每条都要有 supportedBy
  consensus: [
    { id: 'C1', kind: 'consensus', text: string, supportedBy: string[], sides: [] },
    { id: 'D1', kind: 'divergence', text: string, supportedBy: [], sides: [
      { stance: '需要/支持/...', reason: string, by: string[] },
      { stance: '不需要/反对/...', reason: string, by: string[] }
    ]}
  ],

  // —— crossView —— 跨人物的主张回应链
  crossView: [{
    id: 'V1' | ...,
    claimBy: 'p1' | ...,
    claim: string,
    responses: [{ who: 'p2', stance: 'support' | 'partial' | 'against', text: string }]
  }]
}
`;

const AXES_SCHEMA_SPEC = `
{
  people: {
    axis: 'people',
    commitments: [{
      id: 'K-XXXX-A1', who: 'p1', meeting: '<meetingId 短形>', what: string,
      due: 'YYYY-MM-DD', state: 'on-track' | 'at-risk' | 'done' | 'slipped',
      progress: number   // 0-1
    }],
    peopleStats: [{
      who: 'p1', fulfillment: number, avgLatency: '+2.4d' | '-0.3d' | '—',
      claims: number, followThroughGrade: 'A+' | 'A' | 'A-' | 'B+' | 'B' | ... ,
      roleTrajectory: [{ m: 'M-2025-11', role: '提出者' | '质疑者' | '决策者' | '执行者' | '旁观者' }],
      speechHighEntropy: number,    // 0-1, 高质量发言占比
      beingFollowedUp: number,
      silentOnTopics: string[]
    }]
  },

  knowledge: {
    axis: 'knowledge',
    reusableJudgments: [{
      id: 'J-01', text: string, abstractedFrom: string,
      generalityScore: number,  // 0-1
      reuseCount: number, linkedMeetings: string[],
      domain: string, author: string  // 'EXX-XX 专家提炼'
    }],
    mentalModels: [{
      id: 'MM-01', name: string,    // '二阶效应 · Second-order thinking' 等
      invokedBy: 'p1' | 'p2' | '—',
      invokedCount: number,
      correctly: boolean | null,
      outcome: string,
      expert: string                 // 关联的 expertId
    }],
    evidenceGrades: [
      { grade: 'A · 硬数据', count: number, examples: string[] },
      { grade: 'B · 类比 / 案例', count: number, examples: string[] },
      { grade: 'C · 直觉 / 口述', count: number, examples: string[] },
      { grade: 'D · 道听途说', count: number, examples: string[] }
    ],
    cognitiveBiases: [{
      id: 'B-01', name: '锚定效应' | '过度自信' | '确认偏误' | '幸存者偏差' | '沉没成本' | ...,
      where: string,
      by: ['p1'],
      severity: 'low' | 'med' | 'high',
      mitigated: boolean,
      mitigation?: string
    }],
    counterfactuals: [{
      id: 'CF-01', path: string,           // "rejected path"
      rejectedAt: string,
      rejectedBy: ['p5'],
      trackingNote: string,
      validityCheckAt: 'YYYY-MM-DD'
    }]
  },

  meta: {
    axis: 'meta',
    decisionQuality: {
      overall: number,    // 0-1
      dims: [
        { id: 'clarity', label: '清晰度', score: number, note: string },
        { id: 'actionable', label: '可执行', score: number, note: string },
        { id: 'traceable', label: '可追溯', score: number, note: string },
        { id: 'falsifiable', label: '可证伪', score: number, note: string },
        { id: 'aligned', label: '对齐度', score: number, note: string }
      ]
    },
    necessity: {
      verdict: '可缩减至 60 分钟' | '现行时长合理' | ...,
      score: number,                // 0-1
      reasons: [{ k: '只读汇报段', t: string }, ...]
    },
    emotionCurve: [
      { t: 0, v: 0.2, i: 0.3, tag: '开场 · 平和' },
      { t: 30, v: 0.2, i: 0.5 },
      { t: 42, v: -0.55, i: 0.92, tag: '最激烈' }
      // t = 分钟, v = -1..1 valence, i = 0..1 intensity
    ]
  },

  projects: {
    project: { id, name, status, meetings: number, decisions: number, openItems: number },
    decisionChain: [{
      id: 'D-01', at: string, title: string, who: 'p1', basedOn: string,
      confidence: number, superseded: boolean, supersededBy?: 'D-02', current?: boolean
    }],
    assumptions: [{
      id: 'AS-01', text: string, underpins: ['D-06', 'D-07'],
      introducedAt: string, by: 'p2',
      evidenceGrade: 'A' | 'B' | 'C' | 'D',
      verificationState: '已验证' | '测试中' | '未验证' | '观察中' | '未验证 · 高风险',
      verifier: 'p4' | '—',
      verifyDue: 'YYYY-MM-DD' | '持续' | '—',
      confidence: number
    }],
    openQuestions: [{
      id: 'Q-01', text: string, raisedAt: string, by: 'p3',
      timesRaised: number, lastRaised: string,
      category: 'strategic' | 'analytical' | 'governance' | 'operational',
      status: 'open' | 'assigned' | 'chronic' | 'resolved',
      owner: 'p4' | '—', due?: 'YYYY-MM-DD', resolvedAt?: string, note?: string
    }],
    risks: [{
      id: 'R-01', text: string, mentions: number, hasAction: boolean,
      action?: string, severity: 'low' | 'med' | 'high',
      heat: number, meetings: number,
      trend: 'up' | 'flat' | 'down'
    }]
  },

  tension: [/* 同 analysis.tension, 但项级 id 用 'T-01' 之类全局形式 */ ]
}
`;

// ============================================================
// Few-shot 极简样例（trim 自 sh-ai-meeting-01__analysis.ts）
// ============================================================

const FEW_SHOT_ANALYSIS = `
// 一个真实输出的 analysis 半边样例（trim 后）:
{
  "summary": {
    "decision": "将 2026 年定位为「上海汇聚 AI 元年」: 9 个月内分阶段把 AI 嵌入管理与一线作业。",
    "actionItems": [
      { "id": "A1", "who": "p2", "what": "汇总本轮抛出的所有 AI 应用方向, 形成清单", "due": "2026-04-20" }
    ],
    "risks": [
      "R1 · 集团法务/合规对摄像头/录音方案大概率不批 — 永邦原话:「这风口浪尖的时候, 谁敢...」"
    ]
  },
  "tension": [{
    "id": "T1",
    "between": ["p1", "p3"],
    "topic": "销售型岗位是否需要 AI 行程强管控",
    "intensity": 0.72,
    "summary": "永邦希望「看清楚每个末端的人此刻在做什么」; 王丽明确反对...",
    "moments": [
      "永邦:「客户经理现在此时此刻正在带看的, 正在带看的有多少个你也不知道。」",
      "王丽:「一旦涉及到销售维度, 我没有那么建议说现在就上什么 AI...」"
    ]
  }],
  "newCognition": [{
    "id": "N1", "who": "p1",
    "before": "AI 是高大上的东西, 我们团队接不住",
    "after": "我要的 AI 都是很 low 的 AI — 已经能秒杀全国 99% 的城市",
    "trigger": "现场用豆包做 5 秒出图表演示, 永邦立刻代入「我要的就这样」"
  }],
  "focusMap": [
    { "who": "p1", "themes": ["AI 私人助理", "末端体检报告", "看清一套房 (三指数)"], "returnsTo": 12 }
  ],
  "consensus": [
    { "id": "C1", "kind": "consensus", "text": "2026 = 上海汇聚 AI 元年", "supportedBy": ["p1","p2","p3"], "sides": [] },
    { "id": "D1", "kind": "divergence", "text": "销售型岗位是否需要 AI 强行程管控?", "supportedBy": [], "sides": [
      { "stance": "需要", "reason": "末端可见性差", "by": ["p1"] },
      { "stance": "不需要", "reason": "销售有自然淘汰", "by": ["p3"] }
    ]}
  ],
  "crossView": [{
    "id": "V1", "claimBy": "p1",
    "claim": "我的 B 点画面就是要一个 AI 私人助理...",
    "responses": [
      { "who": "p2", "stance": "support", "text": "大模型本身就是干这个的..." }
    ]
  }]
}
`;

// ============================================================
// 主入口: buildFullPrompt
// ============================================================

export function buildFullPrompt(ctx: ClaudeCliPromptCtx): string {
  const sections: string[] = [];

  // ── 1. Role ─────────────────────────────────────────────────────────────
  sections.push(`=== ROLE ===
你是会议纪要分析专家。读完整段转写后, 按下面给定的 JSON Schema 一次性输出
「会议纪要 + 多轴分析」单一 JSON 对象, 不要包含任何 prose、markdown 代码栅栏、解释性文本。
输出会被 JSON.parse 直接消费, 任何非法内容都会导致整个 run 失败。`);

  // ── 2. Expert Personas ─────────────────────────────────────────────────
  if (ctx.expertRoles && ctx.expertSnapshots.size > 0) {
    const personaSection: string[] = ['=== EXPERT PERSONAS ==='];
    const roles: ExpertRoleId[] = ['people', 'projects', 'knowledge'];
    for (const role of roles) {
      const ids = ctx.expertRoles[role] ?? [];
      if (ids.length === 0) continue;
      personaSection.push('');
      personaSection.push(`[${ROLE_LABEL[role]}]`);
      for (const id of ids) {
        const snap = ctx.expertSnapshots.get(id);
        if (!snap) continue;
        personaSection.push(renderExpertContextByRole(snap, role));
      }
    }
    if (ctx.expertSnapshots.size > 1) {
      personaSection.push(
        '\n要求: 以上各位专家在自己负责的轴上独立判断; 你需要在输出中体现他们的口径与差异。',
      );
    } else {
      personaSection.push(
        '\n要求: 以这位专家的视角与判断口径输出, 保留其风格与典型表达方式。',
      );
    }
    sections.push(personaSection.join('\n'));
  }

  // ── 3. Analytical Decorators ───────────────────────────────────────────
  if (ctx.decoratorChain.length > 0) {
    const decLines: string[] = ['=== ANALYTICAL DECORATORS ==='];
    decLines.push('本次分析必须按下面的顺序应用以下分析装饰器:');
    ctx.decoratorChain.forEach((d, i) => {
      const fragment = DECORATOR_FRAGMENTS[d];
      if (fragment) {
        decLines.push(`  ${i + 1}. ${d} — ${fragment}`);
      } else {
        decLines.push(`  ${i + 1}. ${d}`);
      }
    });
    sections.push(decLines.join('\n'));
  }

  // ── 4. Scope Config ─────────────────────────────────────────────────────
  if (ctx.scopeConfig) {
    const scopeLines: string[] = ['=== SCOPE CONFIG ==='];
    scopeLines.push(`当前会议绑定的 scope (project/client/topic) 有以下额外配置:`);
    scopeLines.push(`  preset: ${ctx.scopeConfig.preset}`);
    if (ctx.scopeConfig.strategies && ctx.scopeConfig.strategies.length) {
      scopeLines.push(`  额外策略: ${ctx.scopeConfig.strategies.join(', ')}`);
    }
    if (ctx.scopeConfig.decorators && ctx.scopeConfig.decorators.length) {
      scopeLines.push(`  额外装饰器: ${ctx.scopeConfig.decorators.join(' | ')}`);
    }
    sections.push(scopeLines.join('\n'));
  }

  // ── 5. Output Discipline ────────────────────────────────────────────────
  sections.push(`=== OUTPUT DISCIPLINE ===
1. 严格 JSON, UTF-8, 能被 JSON.parse 直接吃。不要任何 markdown 代码块。
2. 数字 / 专有名词 / 引用原文 一律保留, 不做"行话化"包装; 分数保留 2 位小数。
3. 人物 id 严格用 p1/p2/p3..., 与下方 participants 数组的 localId 一致, 任何引用人物处都用这些 id, 不要写名字。
4. 日期 ISO 8601 (YYYY-MM-DD 或带 T 时间); 未知用 "—"。

5. 输出密度硬性最低 (除非会议明显短/平淡, 任何"内容不够"的偷懒都视为低质):
   - tension: ≥5 条; 每条 moments ≥4 句原话 (照抄不许意译); summary ≥250 字, 分段写出至少两方立场, 内嵌引语
   - newCognition: ≥6 条; before/after 必须形成强对比, trigger 必须含 'pX:「原话」'
   - consensus + divergence 合计 ≥10 条; 每条都要 supportedBy 至少 1 人
   - crossView: ≥4 条; 每条 responses ≥2 个不同立场的人
   - axes.knowledge.cognitiveBiases: ≥6 条; 每条要 where 引用原文短句 + by 具体人物
   - axes.knowledge.mentalModels: ≥5 条; 每条要 invokedBy 具体人物 + 是否 correctlyUsed
   - axes.knowledge.reusableJudgments: ≥6 条; 每条 generalityScore + 是否 reuseCount
   - axes.knowledge.counterfactuals: ≥3 条
   - axes.projects.decisionChain: ≥3 条 (即使本场没拍板, 也要列出"在某假设下若如何则如何"的潜在决策)
   - axes.projects.assumptions: ≥4 条
   - axes.projects.openQuestions: ≥4 条
   - axes.projects.risks: ≥6 条
   - facts (SPO 三元组): ≥10 条; **每条必填 taxonomy_code** (从 ADDITIONAL OUTPUT BLOCKS 给的 84 个 L2 候选中挑一个)
   - wikiMarkdown.entityUpdates: ≥participants.length + 5 条 (覆盖每个参与者 person + 至少 5 个核心 concept)
   - wikiMarkdown.sourceEntry 必须 9 段齐全:
     一、决议 / 二、张力 / 三、共识 / 四、决策链 (≥3) / 五、关键判断 (≥4) /
     六、假设 (≥3)+待决 (≥3) / 七、心智模型 (≥3) / 八、认知偏误 (≥2) / 九、反事实 (≥2)
     + 引用关键人物 + Wiki 实体引用

6. 任何"事件类"字段必须给原文 moments / quotes / where 锚点, "<pX>:「完整原话」" 格式;
   引文必须是转写里能逐字找到的字符串, 不可改写、不可省略主语、不可拼接。

7. 不要编造数据。转写里没明确出现的字段填 null 或空数组。
   但: 如果 6 个张力议题里只能挑出 4 条具备充分原文支撑的, 宁可少一条也不要"凑"; 数量下限是常态指标, 不是硬性凑数指标。`);

  // ── 6. Output Schema ────────────────────────────────────────────────────
  sections.push(`=== OUTPUT SCHEMA · analysis 半边 ===\n${ANALYSIS_SCHEMA_SPEC}`);
  sections.push(`=== OUTPUT SCHEMA · axes 半边 ===\n${AXES_SCHEMA_SPEC}`);

  // ── 6.5. Additional Output Blocks: facts (SPO 三元组) + wikiMarkdown ─
  // Phase H: facts 加 taxonomy_code 必填; sourceEntry 9 段富格式;
  // entityUpdates 改契约为 type/subtype/canonicalName/initialContent/blockContent
  sections.push(`=== ADDITIONAL OUTPUT BLOCKS ===
除了 analysis + axes 之外, 还需输出两块给 wiki 模块用：

facts: SPO 三元组数组, 用来落 content_facts 表 (跨会议知识图谱用)。
  每条形态:
  {
    subject: string,        // "永邦" / "AI 私人助理" / "上海惠居" 等具体实体或概念
    predicate: string,      // 动词性短语: 倡导/反对/提出/质疑/依赖/替代/类比 等
    object: string,         // 如 "末端体检报告" / "强 AI 行程管控"
    confidence: number,     // 0-1, 直接引用 0.9+, 间接推断 0.6-
    taxonomy_code: string,  // 必填! 从下方 84 个候选中挑一个最贴合的 L2 code
    context: { quote: string }   // 原文引用, 与 analysis.tension.moments 同密度
  }
  约束:
    - subject / object 必须是会议中明确出现的具体实体或概念 (避免"团队"这种 vague 主语)
    - 至少给 10 条; 上限不限
    - 每条要有 quote, 否则 wiki 拿到没法可信引用
    - taxonomy_code 必须从下方 84 个 L2 候选中挑, 不许编造未列出的 code; 实在判断不出给 'E99.OTHER'

可用 taxonomy_code (L2 级, 共 84 条):
${renderTaxonomyForPrompt()}

wikiMarkdown: 给 data/content-wiki/default/ 直接写文件用的 markdown 内容。
  形态:
  {
    sourceEntry: string,    // sources/<meetingId>.md 全文 markdown, 见下方 9 段模板
    entityUpdates: Array<{
      type: 'entity' | 'concept',                  // entity = 具体事物 / concept = 抽象
      subtype: 'person' | 'org' | 'product' | 'project' | 'event'
             | 'mental-model' | 'judgment' | 'bias' | 'counterfactual',
      canonicalName: string,                       // 与 mn_* 表 / content_entities canonical_name 对齐
      aliases?: string[],
      initialContent?: string,                     // 文件不存在时的 baseline body (1-2 段简介);
                                                   // 不要带 frontmatter 三段杠 (后端拼接); 不要带 ## Claude CLI · meeting 标题
      blockContent: string,                        // 必填: 本次会议的更新块 (不带 <!-- block:xxx --> 包装, 不带顶部 ## 标题)
    }>
  }

  ─── sourceEntry 9 段模板 (claude 必须填全, 严格按下方 frontmatter + 9 个 ## 节标题) ───
  ---
  type: source
  subtype: meeting
  meetingId: <id>
  date: <YYYY-MM-DD>
  title: <title>
  participants: [<name1>, <name2>, ...]
  app: meeting-notes
  generatedBy: claude-cli
  lastEditedAt: <ISO>
  ---

  ## 一、决议
  (来自 analysis.summary.decision · 2-4 段长文)

  ## 二、主要张力 · Tensions
  (来自 analysis.tension · 每条 ### T<n> · <topic> 子节, 含当事人 + 强度 + summary 250+ 字 + ≥4 条 moments)

  ## 三、共识 · Consensus
  (来自 analysis.consensus · 每条 - C<n> · <text> · 支持: [[<name1>]] / [[<name2>]])

  ## 四、决策链 · Decision Chain
  (来自 axes.projects.decisionChain · ≥3 条 · 每条 ### D<n> · <title>, 含 提出/基于/承接)

  ## 五、关键判断 · Reusable Judgments
  (来自 axes.knowledge.reusableJudgments · ≥4 条 · 每条 - [[<name>]] · <text> (通用度 0.85) — by [[<author>]])

  ## 六、假设 + 待决问题
  (来自 axes.projects.{assumptions, openQuestions})
  **假设**:
  - A1 · <text> · 证据等级 B
  **待决**:
  - Q1 · <text> · 类别: strategic · 状态: chronic
  各≥3 条

  ## 七、心智模型 · Mental Models
  (来自 axes.knowledge.mentalModels · ≥3 条 · 每条 - [[<model>]] · invoked by [[<person>]] · 正确使用: ✓/✗)

  ## 八、认知偏误 · Cognitive Biases
  (来自 axes.knowledge.cognitiveBiases · ≥2 条 · 每条 - [[<bias_type>]] · severity: med · 处: <where_excerpt> · by [[<person>]])

  ## 九、反事实 · Counterfactuals
  (来自 axes.knowledge.counterfactuals · ≥2 条 · 每条 - [[<slug>]] · 拒绝: <rejected_path> · 跟踪: <tracking_note>)

  ## 引用关键人物
  - [[<name1>]]
  - [[<name2>]]

  ## Wiki 实体引用
  - [[<entity1>]] · 在 fact #1, #5 中提及

  ─── entityUpdates 约束 ───
    - 数量下限: participants.length + 5 (覆盖每个参与者 + 至少 5 个核心概念)
    - canonicalName 要稳定 (同一个人/概念在多场会议中名字一致, 别"王丽""王老师"乱混)
    - person 类必填 initialContent (用于首次创建的骨架); concept 类初次出现时也建议给
    - blockContent 内容形如:
      "在本场会议\\n(speaking_pct=33% · 主导话题: 招租定金)\\n\\n本次承诺\\n- ..."
      不要带 ## Claude CLI · meeting 标题 (后端自动包 <!-- block:meeting-xxx --> 注释 + 顶部 ## 标题)`);

  // ── 7. Few-shot ─────────────────────────────────────────────────────────
  sections.push(`=== FEW-SHOT (analysis 半边样例, 仅参考形态) ===\n${FEW_SHOT_ANALYSIS}`);

  // ── 8. Task context ─────────────────────────────────────────────────────
  const taskLines: string[] = ['=== TASK ==='];
  taskLines.push(`meetingId: ${ctx.meetingId}`);
  taskLines.push(`meetingTitle: ${ctx.meetingTitle}`);
  if (ctx.meetingKind) taskLines.push(`meetingKind: ${ctx.meetingKind}`);
  taskLines.push('');
  taskLines.push('participants (localId → name 映射, 输出中所有人物 id 必须用这些 localId):');
  for (const p of ctx.participants) {
    taskLines.push(`  ${p.localId} = ${p.name}`);
  }
  sections.push(taskLines.join('\n'));

  // ── 9. Final wrap + transcript ──────────────────────────────────────────
  sections.push(`=== TRANSCRIPT (cleaned) ===
\`\`\`
${ctx.transcript}
\`\`\`

=== OUTPUT ===
请输出单一 JSON 对象, 顶层 key 为:
{
  "meeting": { id, title, date, duration, room?, source?, tokens? },
  "participants": [{ id: 'p1', name, role, initials, tone: 'neutral'|'warm'|'cool', speakingPct: number }],
  "analysis": <按 schema · analysis 半边>,
  "axes": <按 schema · axes 半边>,
  "facts": [<按 ADDITIONAL OUTPUT BLOCKS · facts 数组>],
  "wikiMarkdown": <按 ADDITIONAL OUTPUT BLOCKS · wikiMarkdown 对象>
}
注意: meeting.id 必须等于 ${ctx.meetingId}。
现在开始输出 JSON:`);

  return sections.join('\n\n');
}
