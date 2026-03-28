// 深度问题分析面板 - Deep Analysis Panel
// 基于第一性原理，从文章内容 + 专家评审中提炼根本问题、专家讨论、差异化洞察

import { useState, useEffect, useMemo } from 'react';
import type { Task, BlueTeamReview, ReviewQuestion } from '../types';

// ============================================================
//  Types
// ============================================================

interface DeepAnalysisPanelProps {
  task: Task;
  reviews: BlueTeamReview[];
  draftContent: string | null;
}

/** 根因问题 */
interface RootProblem {
  id: string;
  /** 表面现象（来自评审） */
  surfaceIssues: string[];
  /** 第一性原理追问 */
  whyChain: string[];
  /** 根本问题（一句话） */
  rootCause: string;
  /** 影响层级: structural(结构性) | methodological(方法论) | presentational(表达层) */
  level: 'structural' | 'methodological' | 'presentational';
  severity: 'high' | 'medium' | 'low';
  /** 来源专家角色列表 */
  sourceExperts: string[];
  /** 频次 */
  frequency: number;
}

/** 专家参与者 */
interface ExpertParticipant {
  id: string;
  name: string;
  profile: string;
  color: string;
  avatar: string; // 首字符
}

/** 讨论发言 */
interface DiscussionEntry {
  expertId: string;
  expertName: string;
  content: string;
  stance: 'support' | 'challenge' | 'extend';
  referenceProblemId?: string;
}

/** 讨论轮次 */
interface DiscussionRound {
  round: number;
  theme: string;
  entries: DiscussionEntry[];
}

/** 投票结果 */
interface VoteResult {
  problemId: string;
  problemSummary: string;
  votes: { expertName: string; reason: string }[];
  totalVotes: number;
}

/** 差异化维度 */
interface DifferentiationPoint {
  dimension: string;
  description: string;
  evidence: string;
  type: 'strength' | 'unique' | 'blindspot';
}

// ============================================================
//  Constants
// ============================================================

const EXPERT_COLORS = [
  '#7c3aed', '#0891b2', '#059669', '#d97706', '#dc2626', '#2563eb',
];

const ROLE_LABELS: Record<string, string> = {
  fact_checker: '事实核查员',
  logic_checker: '逻辑检察官',
  domain_expert: '行业专家',
  reader_rep: '读者代表',
  challenger: '批判者',
  expander: '拓展者',
  synthesizer: '提炼者',
};

const LEVEL_LABELS: Record<string, { label: string; color: string; icon: string }> = {
  structural: { label: '结构性问题', color: 'text-red-700 bg-red-50 border-red-200', icon: 'foundation' },
  methodological: { label: '方法论问题', color: 'text-amber-700 bg-amber-50 border-amber-200', icon: 'psychology' },
  presentational: { label: '表达层问题', color: 'text-blue-700 bg-blue-50 border-blue-200', icon: 'edit_note' },
};

const DEFAULT_EXPERTS: ExpertParticipant[] = [
  { id: 'S-01', name: '张一鸣', profile: '数据驱动思维，追求延迟满足，关注长期价值和执行效率', color: EXPERT_COLORS[0], avatar: '张' },
  { id: 'S-02', name: '雷军', profile: '极致性价比思维，关注用户体验、效率提升和口碑传播', color: EXPERT_COLORS[1], avatar: '雷' },
  { id: 'S-03', name: '黄仁勋', profile: 'AI算力先驱，关注技术前沿、生态系统和长期技术赌注', color: EXPERT_COLORS[2], avatar: '黄' },
];

// ============================================================
//  Core Analysis Logic — First Principles
// ============================================================

/**
 * 第一性原理: 从表面问题追问 "为什么"，直到找到根本原因
 * 分三层: 表达层(how) → 方法论层(what) → 结构层(why)
 */
function extractRootProblems(reviews: BlueTeamReview[], content: string | null): RootProblem[] {
  // 1. 收集所有非 praise 的问题
  const allIssues: Array<ReviewQuestion & { expertRole: string; round: number }> = [];
  reviews.forEach(r => {
    const questions = Array.isArray(r.questions) ? r.questions : r.questions ? [r.questions] : [];
    questions.forEach((q: any) => {
      if (q.severity !== 'praise') {
        allIssues.push({ ...q, expertRole: r.expert_role || r.expert_name || 'unknown', round: r.round });
      }
    });
  });

  if (allIssues.length === 0) return [];

  // 2. 关键词聚类 — 提取每个问题的核心关键词
  const issueGroups = clusterIssues(allIssues);

  // 3. 对每组问题进行第一性原理追问
  const rootProblems: RootProblem[] = issueGroups.map((group, idx) => {
    const surfaceIssues = group.items.map(i => i.question);
    const experts = [...new Set(group.items.map(i => ROLE_LABELS[i.expertRole] || i.expertRole))];
    const maxSeverity = group.items.some(i => i.severity === 'high') ? 'high' :
      group.items.some(i => i.severity === 'medium') ? 'medium' : 'low';

    // 第一性原理 "5 Whys" 简化版：从表面现象推导根因
    const { whyChain, rootCause, level } = deriveRootCause(group.keywords, surfaceIssues, content);

    return {
      id: `rp-${idx}`,
      surfaceIssues,
      whyChain,
      rootCause,
      level,
      severity: maxSeverity,
      sourceExperts: experts,
      frequency: group.items.length,
    };
  });

  // 按层级排序: structural > methodological > presentational, 同层按频次
  const levelOrder = { structural: 0, methodological: 1, presentational: 2 };
  return rootProblems
    .sort((a, b) => levelOrder[a.level] - levelOrder[b.level] || b.frequency - a.frequency)
    .slice(0, 8);
}

/** 简单关键词聚类 */
function clusterIssues(issues: Array<ReviewQuestion & { expertRole: string; round: number }>) {
  const groups: Array<{ keywords: string[]; items: typeof issues }> = [];

  // 关键词集合: 从 question + suggestion 中提取
  const STOP_WORDS = new Set(['的', '了', '是', '在', '和', '与', '对', '有', '不', '这', '那', '可以', '需要', '可能', '应该', '建议', '问题', '内容', '文章', '分析']);
  const extractKeywords = (text: string): string[] => {
    return text.replace(/[，。、；：""''！？【】《》（）\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length >= 2 && !STOP_WORDS.has(w))
      .slice(0, 8);
  };

  issues.forEach(issue => {
    const kw = extractKeywords(issue.question + ' ' + (issue.suggestion || ''));
    // 找与现有组的交集 >= 2 的组
    let matched = false;
    for (const group of groups) {
      const overlap = kw.filter(w => group.keywords.some(gw => gw.includes(w) || w.includes(gw)));
      if (overlap.length >= 2) {
        group.items.push(issue);
        group.keywords.push(...kw.filter(w => !group.keywords.includes(w)));
        matched = true;
        break;
      }
    }
    if (!matched) {
      groups.push({ keywords: kw, items: [issue] });
    }
  });

  return groups.filter(g => g.items.length > 0);
}

/** 第一性原理推导: 从表面现象 → 方法 → 根因 */
function deriveRootCause(
  keywords: string[],
  surfaces: string[],
  content: string | null,
): { whyChain: string[]; rootCause: string; level: RootProblem['level'] } {
  const joined = keywords.join(' ') + ' ' + surfaces.join(' ');

  // 判断问题层级并生成推理链
  // 结构性: 论点/框架/视角/核心观点 相关
  if (/论点|框架|视角|结构|立论|核心观点|主题|定位|方向|论证体系|整体/.test(joined)) {
    return {
      whyChain: [
        `表面: ${surfaces[0]?.slice(0, 40)}...`,
        '→ 为什么? 文章的论证框架本身存在缺陷',
        '→ 根因: 立论阶段未从第一性原理出发，缺乏基本假设的验证',
      ],
      rootCause: '论证框架未从基本事实出发建立，核心假设缺乏验证',
      level: 'structural',
    };
  }

  // 方法论: 数据/逻辑/因果/归因/样本 相关
  if (/数据|统计|来源|因果|归因|逻辑|样本|证据|论据|引用|准确/.test(joined)) {
    return {
      whyChain: [
        `表面: ${surfaces[0]?.slice(0, 40)}...`,
        '→ 为什么? 论据选取和推理方法存在问题',
        '→ 根因: 未遵循"先收集事实，再推导结论"的基本方法论',
      ],
      rootCause: '推理过程跳过了事实验证环节，先有结论再找证据',
      level: 'methodological',
    };
  }

  // 表达层 (默认)
  return {
    whyChain: [
      `表面: ${surfaces[0]?.slice(0, 40)}...`,
      '→ 为什么? 表达方式未能有效传达核心观点',
      '→ 根因: 信息密度与读者认知负荷不匹配',
    ],
    rootCause: '表达层面的信息组织未以读者理解路径为中心设计',
    level: 'presentational',
  };
}

// ============================================================
//  Expert Discussion Generation
// ============================================================

function resolveExperts(task: Task, reviews: BlueTeamReview[]): ExpertParticipant[] {
  const config = task.sequential_review_config as any;
  const participants: ExpertParticipant[] = [];

  // 优先从 config 中读取
  if (config) {
    const details = [
      ...(config.humanExpertsDetail || []),
      ...(config.readerExpertsDetail || []),
    ];
    details.forEach((d: any, idx: number) => {
      if (d.name) {
        participants.push({
          id: d.id || `cfg-${idx}`,
          name: d.name,
          profile: d.profile || '',
          color: EXPERT_COLORS[idx % EXPERT_COLORS.length],
          avatar: d.name.charAt(0),
        });
      }
    });
  }

  // 从 reviews 中补充
  if (participants.length < 3) {
    const seen = new Set(participants.map(p => p.name));
    reviews.forEach(r => {
      const name = r.expert_name || ROLE_LABELS[r.expert_role] || r.expert_role;
      if (!seen.has(name)) {
        seen.add(name);
        participants.push({
          id: r.expertId || r.id,
          name,
          profile: ROLE_LABELS[r.expert_role] || '评审专家',
          color: EXPERT_COLORS[participants.length % EXPERT_COLORS.length],
          avatar: name.charAt(0),
        });
      }
    });
  }

  // 兜底: 默认专家
  if (participants.length < 2) {
    return DEFAULT_EXPERTS;
  }

  return participants.slice(0, 5);
}

function generateDiscussion(
  experts: ExpertParticipant[],
  problems: RootProblem[],
  content: string | null,
): { rounds: DiscussionRound[]; votes: VoteResult[]; conclusion: string } {
  if (problems.length === 0 || experts.length === 0) {
    return { rounds: [], votes: [], conclusion: '暂无足够数据生成讨论' };
  }

  const topProblems = problems.slice(0, Math.min(5, problems.length));

  // === Round 1: 第一性原理拆解 — 每位专家从各自视角分析最重要的问题 ===
  const round1Entries: DiscussionEntry[] = experts.map((expert, idx) => {
    const problem = topProblems[idx % topProblems.length];
    const perspectives = generateFirstPrinciplePerspective(expert, problem);
    return {
      expertId: expert.id,
      expertName: expert.name,
      content: perspectives,
      stance: idx === 0 ? 'support' : idx === 1 ? 'challenge' : 'extend',
      referenceProblemId: problem.id,
    };
  });

  // === Round 2: 辩论与收敛 — 基于第一轮观点进行交叉质疑 ===
  const round2Entries: DiscussionEntry[] = experts.map((expert, idx) => {
    const targetIdx = (idx + 1) % experts.length;
    const targetEntry = round1Entries[targetIdx];
    const targetProblem = topProblems[targetIdx % topProblems.length];
    return {
      expertId: expert.id,
      expertName: expert.name,
      content: generateRebuttal(expert, targetEntry, targetProblem),
      stance: 'challenge',
      referenceProblemId: targetProblem.id,
    };
  });

  const rounds: DiscussionRound[] = [
    { round: 1, theme: '第一性原理拆解 — 回到基本事实', entries: round1Entries },
    { round: 2, theme: '交叉质疑 — 挑战彼此的假设', entries: round2Entries },
  ];

  // === Voting: 每位专家投票 ===
  const voteMap = new Map<string, VoteResult>();
  topProblems.forEach(p => {
    voteMap.set(p.id, { problemId: p.id, problemSummary: p.rootCause, votes: [], totalVotes: 0 });
  });

  experts.forEach((expert, idx) => {
    // 基于 profile 关键词匹配最相关的问题
    const bestProblem = findMostRelevantProblem(expert, topProblems);
    const vr = voteMap.get(bestProblem.id);
    if (vr) {
      vr.votes.push({
        expertName: expert.name,
        reason: generateVoteReason(expert, bestProblem),
      });
      vr.totalVotes++;
    }
  });

  const votes = [...voteMap.values()]
    .filter(v => v.totalVotes > 0)
    .sort((a, b) => b.totalVotes - a.totalVotes);

  const winner = votes[0];
  const conclusion = winner
    ? `经过 ${experts.length} 位专家的第一性原理分析和投票，团队一致认为最核心的问题是：「${winner.problemSummary}」。这是一个${LEVEL_LABELS[problems.find(p => p.id === winner.problemId)?.level || 'structural']?.label || '根本性'}，解决它将从根本上提升文章质量。`
    : '专家团队未能达成一致意见，建议进一步讨论。';

  return { rounds, votes, conclusion };
}

function generateFirstPrinciplePerspective(expert: ExpertParticipant, problem: RootProblem): string {
  const profile = expert.profile.toLowerCase();

  if (/数据|效率|执行|长期/.test(profile)) {
    return `从第一性原理来看，这个问题的本质是「${problem.rootCause}」。我们需要回到基本事实：内容创作的核心目标是什么？是传递准确、有价值的信息。当前${problem.surfaceIssues.length}个表面问题都指向同一个根因——我们在"${problem.level === 'structural' ? '搭建框架' : problem.level === 'methodological' ? '选择论据' : '组织表达'}"这一环节偏离了基本原则。`;
  }
  if (/用户|体验|口碑|性价比/.test(profile)) {
    return `让我用用户思维来拆解：读者打开文章的期望是什么？是快速获取可靠洞察。但「${problem.rootCause}」直接破坏了这个期望。${problem.surfaceIssues[0]?.slice(0, 30)}等问题的根源不在表面修辞，而在于我们没有站在读者的第一需求出发。`;
  }
  if (/技术|前沿|生态|赌注/.test(profile)) {
    return `从技术写作的底层逻辑看，「${problem.rootCause}」反映的是认知框架的问题。好的分析不是堆砌信息，而是建立"事实→推理→结论"的可验证链条。目前的${problem.frequency}处相关问题表明推理链条存在断裂。`;
  }

  return `这篇文章的核心问题是「${problem.rootCause}」。从第一性原理出发，我们需要追问：文章的基本假设是否成立？论证路径是否从事实出发？${problem.surfaceIssues.length}个表面问题的共同根因值得深入探讨。`;
}

function generateRebuttal(expert: ExpertParticipant, target: DiscussionEntry, problem: RootProblem): string {
  const profile = expert.profile.toLowerCase();

  if (/数据|效率/.test(profile)) {
    return `@${target.expertName} 的观点有道理，但我认为需要更量化地看待这个问题。「${problem.rootCause}」在文中出现了${problem.frequency}次，影响的不只是单个段落，而是整体论证的可信度。建议用具体数据指标来衡量修复优先级。`;
  }
  if (/用户|体验/.test(profile)) {
    return `同意 @${target.expertName} 的方向，但我想补充用户视角：即使根因相同，修复顺序应该按用户感知强度排列。读者最先感知到的是${problem.level === 'presentational' ? '表达层' : '逻辑层'}的问题，这决定了他们是否继续阅读。`;
  }

  return `@${target.expertName} 提出了有价值的视角。我想进一步追问：如果「${problem.rootCause}」是根因，那么解决它的"最小可行方案"是什么？我们需要避免过度重构，找到杠杆最大的修改点。`;
}

function findMostRelevantProblem(expert: ExpertParticipant, problems: RootProblem[]): RootProblem {
  const profile = expert.profile.toLowerCase();
  // 数据驱动 → 偏好方法论问题; 用户思维 → 偏好表达层; 技术 → 偏好结构性
  if (/数据|执行|效率/.test(profile)) {
    return problems.find(p => p.level === 'methodological') || problems[0];
  }
  if (/用户|体验|口碑/.test(profile)) {
    return problems.find(p => p.level === 'presentational') || problems[0];
  }
  if (/技术|前沿|生态/.test(profile)) {
    return problems.find(p => p.level === 'structural') || problems[0];
  }
  return problems[0];
}

function generateVoteReason(expert: ExpertParticipant, problem: RootProblem): string {
  return `从${expert.profile.slice(0, 10)}的角度，「${problem.rootCause.slice(0, 20)}...」是解锁其他改进的关键瓶颈`;
}

// ============================================================
//  Differentiation Analysis
// ============================================================

function analyzeDifferentiation(task: Task, reviews: BlueTeamReview[], content: string | null): DifferentiationPoint[] {
  const points: DifferentiationPoint[] = [];

  // 1. 正面评价 → 独特亮点
  reviews.forEach(r => {
    const questions = Array.isArray(r.questions) ? r.questions : r.questions ? [r.questions] : [];
    questions.forEach((q: any) => {
      if (q.severity === 'praise' && q.question) {
        points.push({
          dimension: ROLE_LABELS[r.expert_role] || '专家评价',
          description: q.question,
          evidence: q.suggestion || '专家正面评价',
          type: 'strength',
        });
      }
    });
  });

  // 2. 评估维度 → 差异化优势
  const evaluation = task.evaluation;
  if (evaluation?.dimensions) {
    const dims = evaluation.dimensions as Record<string, number>;
    Object.entries(dims).forEach(([key, value]) => {
      if (typeof value === 'number' && value >= 75) {
        const dimLabels: Record<string, string> = {
          novelty: '选题新颖性',
          timeliness: '时效性',
          dataAvailability: '数据充实度',
          expertiseMatch: '专业匹配度',
          topicHeat: '话题热度',
          differentiation: '差异化程度',
        };
        points.push({
          dimension: dimLabels[key] || key,
          description: `${dimLabels[key] || key}评分 ${value}/100，表现突出`,
          evidence: `超过 75 分的优势维度`,
          type: 'unique',
        });
      }
    });
  }

  // 3. 负面问题中的盲点 → 需要关注
  reviews.forEach(r => {
    const questions = Array.isArray(r.questions) ? r.questions : r.questions ? [r.questions] : [];
    questions.forEach((q: any) => {
      if (q.severity === 'high' && /缺少|遗漏|忽略|缺乏|未涉及|没有提及/.test(q.question + (q.suggestion || ''))) {
        points.push({
          dimension: '内容盲点',
          description: q.question.slice(0, 60),
          evidence: q.suggestion || '高优先级缺失项',
          type: 'blindspot',
        });
      }
    });
  });

  // 4. 兜底 — 如果没有足够数据
  if (points.length === 0) {
    points.push({
      dimension: '综合评估',
      description: '该文章具备基础内容完整性，建议通过多轮评审进一步挖掘差异化亮点',
      evidence: '暂无足够评审数据进行深度对比',
      type: 'strength',
    });
  }

  return points.slice(0, 10);
}

// ============================================================
//  Component
// ============================================================

export function DeepAnalysisPanel({ task, reviews, draftContent }: DeepAnalysisPanelProps) {
  const [phase, setPhase] = useState(0); // 0=loading, 1=problems, 2=discussion, 3=diff
  const [expandedProblem, setExpandedProblem] = useState<string | null>(null);

  // Compute analysis data
  const problems = useMemo(() => extractRootProblems(reviews, draftContent), [reviews, draftContent]);
  const experts = useMemo(() => resolveExperts(task, reviews), [task, reviews]);
  const discussion = useMemo(
    () => generateDiscussion(experts, problems, draftContent),
    [experts, problems, draftContent],
  );
  const differentiation = useMemo(() => analyzeDifferentiation(task, reviews, draftContent), [task, reviews, draftContent]);

  // Progressive reveal
  useEffect(() => {
    setPhase(0);
    const t1 = setTimeout(() => setPhase(1), 600);
    const t2 = setTimeout(() => setPhase(2), 1400);
    const t3 = setTimeout(() => setPhase(3), 2200);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [reviews]);

  const hasData = reviews.length > 0;

  return (
    <div className="mt-6 space-y-6 animate-in fade-in duration-500">

      {/* ====== Section 1: 实际问题诊断 (第一性原理) ====== */}
      <div className={`transition-all duration-700 ${phase >= 1 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
        <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 shadow-sm overflow-hidden">
          <div className="px-6 py-4 bg-gradient-to-r from-red-50 to-amber-50 dark:from-red-950/30 dark:to-amber-950/30 border-b border-outline-variant/20">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-red-100 dark:bg-red-900/40 text-red-600 flex items-center justify-center">
                <span className="material-symbols-outlined text-xl">target</span>
              </div>
              <div>
                <h4 className="font-bold text-on-surface">实际问题诊断</h4>
                <p className="text-xs text-slate-500 mt-0.5">基于第一性原理，从表面现象追溯根本原因</p>
              </div>
              {problems.length > 0 && (
                <span className="ml-auto text-xs font-bold px-2 py-1 rounded-full bg-red-100 text-red-700">
                  {problems.length} 个根因
                </span>
              )}
            </div>
          </div>

          <div className="p-6">
            {!hasData ? (
              <EmptyState message="暂无评审数据，请先完成专家评审" />
            ) : phase < 1 ? (
              <SkeletonCards count={3} />
            ) : problems.length === 0 ? (
              <div className="text-center py-8 text-slate-500">
                <span className="material-symbols-outlined text-4xl mb-2 block text-green-400">verified</span>
                <p className="text-sm">未发现显著问题，文章质量良好</p>
              </div>
            ) : (
              <div className="space-y-3">
                {/* 层级分布 */}
                <div className="flex gap-3 mb-4">
                  {(['structural', 'methodological', 'presentational'] as const).map(level => {
                    const count = problems.filter(p => p.level === level).length;
                    if (count === 0) return null;
                    const info = LEVEL_LABELS[level];
                    return (
                      <span key={level} className={`text-xs font-medium px-3 py-1.5 rounded-full border ${info.color}`}>
                        <span className="material-symbols-outlined text-sm align-middle mr-1">{info.icon}</span>
                        {info.label} × {count}
                      </span>
                    );
                  })}
                </div>

                {/* 问题卡片 */}
                {problems.map(problem => {
                  const isExpanded = expandedProblem === problem.id;
                  const levelInfo = LEVEL_LABELS[problem.level];
                  return (
                    <div
                      key={problem.id}
                      className={`p-4 rounded-xl border-l-4 cursor-pointer transition-all hover:shadow-md ${
                        problem.severity === 'high' ? 'border-l-red-500 bg-red-50/50 dark:bg-red-950/20' :
                        problem.severity === 'medium' ? 'border-l-amber-500 bg-amber-50/50 dark:bg-amber-950/20' :
                        'border-l-blue-500 bg-blue-50/50 dark:bg-blue-950/20'
                      }`}
                      onClick={() => setExpandedProblem(isExpanded ? null : problem.id)}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`text-xs font-bold px-2 py-0.5 rounded ${levelInfo.color}`}>
                              {levelInfo.label}
                            </span>
                            <span className="text-xs text-slate-400">来自 {problem.sourceExperts.join('、')}</span>
                          </div>
                          <p className="text-sm font-semibold text-on-surface">{problem.rootCause}</p>
                        </div>
                        <div className="flex items-center gap-2 ml-3">
                          <span className="text-xs text-slate-400 whitespace-nowrap">{problem.frequency}次</span>
                          <span className={`material-symbols-outlined text-lg text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
                            expand_more
                          </span>
                        </div>
                      </div>

                      {/* 展开: Why Chain */}
                      {isExpanded && (
                        <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-700 space-y-2">
                          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">第一性原理推导</p>
                          {problem.whyChain.map((step, i) => (
                            <div key={i} className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-400">
                              <span className="w-5 h-5 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                                {i + 1}
                              </span>
                              <span>{step}</span>
                            </div>
                          ))}
                          <div className="mt-3">
                            <p className="text-xs font-bold text-slate-500 mb-1">相关表面现象:</p>
                            <ul className="text-xs text-slate-500 space-y-1">
                              {problem.surfaceIssues.slice(0, 3).map((s, i) => (
                                <li key={i} className="flex items-start gap-1">
                                  <span className="text-slate-400">•</span>
                                  <span>{s.length > 60 ? s.slice(0, 60) + '...' : s}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ====== Section 2: 专家团队讨论 ====== */}
      <div className={`transition-all duration-700 ${phase >= 2 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
        <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 shadow-sm overflow-hidden">
          <div className="px-6 py-4 bg-gradient-to-r from-violet-50 to-indigo-50 dark:from-violet-950/30 dark:to-indigo-950/30 border-b border-outline-variant/20">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-violet-100 dark:bg-violet-900/40 text-violet-600 flex items-center justify-center">
                <span className="material-symbols-outlined text-xl">forum</span>
              </div>
              <div>
                <h4 className="font-bold text-on-surface">专家团队讨论</h4>
                <p className="text-xs text-slate-500 mt-0.5">多位专家基于第一性原理辩论最核心问题</p>
              </div>
              {/* Expert avatars */}
              <div className="ml-auto flex -space-x-2">
                {experts.slice(0, 4).map(e => (
                  <div
                    key={e.id}
                    className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white border-2 border-white dark:border-slate-900"
                    style={{ backgroundColor: e.color }}
                    title={`${e.name} — ${e.profile}`}
                  >
                    {e.avatar}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="p-6">
            {!hasData ? (
              <EmptyState message="暂无评审数据" />
            ) : phase < 2 ? (
              <SkeletonCards count={2} />
            ) : discussion.rounds.length === 0 ? (
              <EmptyState message="暂无足够问题进行讨论" />
            ) : (
              <div className="space-y-6">
                {/* Discussion Rounds */}
                {discussion.rounds.map(round => (
                  <div key={round.round}>
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-xs font-bold text-violet-600 bg-violet-100 px-2 py-1 rounded-full">
                        Round {round.round}
                      </span>
                      <span className="text-xs text-slate-500">{round.theme}</span>
                    </div>
                    <div className="space-y-3">
                      {round.entries.map((entry, idx) => {
                        const expert = experts.find(e => e.id === entry.expertId);
                        return (
                          <div key={idx} className="flex gap-3">
                            <div
                              className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                              style={{ backgroundColor: expert?.color || '#6b7280' }}
                            >
                              {expert?.avatar || '?'}
                            </div>
                            <div className="flex-1 bg-slate-50 dark:bg-slate-800/50 rounded-xl px-4 py-3">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-sm font-bold text-on-surface">{entry.expertName}</span>
                                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                                  entry.stance === 'support' ? 'bg-green-100 text-green-700' :
                                  entry.stance === 'challenge' ? 'bg-red-100 text-red-700' :
                                  'bg-blue-100 text-blue-700'
                                }`}>
                                  {entry.stance === 'support' ? '论证' : entry.stance === 'challenge' ? '质疑' : '延伸'}
                                </span>
                              </div>
                              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">{entry.content}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}

                {/* Voting */}
                {discussion.votes.length > 0 && (
                  <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1">
                      <span className="material-symbols-outlined text-sm">how_to_vote</span>
                      投票结果
                    </p>
                    <div className="space-y-2">
                      {discussion.votes.map((vote, idx) => (
                        <div key={vote.problemId} className="flex items-center gap-3">
                          <span className={`text-xs font-bold w-5 text-center ${idx === 0 ? 'text-amber-600' : 'text-slate-400'}`}>
                            {idx === 0 ? '🏆' : `#${idx + 1}`}
                          </span>
                          <div className="flex-1">
                            <p className="text-xs text-slate-700 dark:text-slate-300 truncate">{vote.problemSummary}</p>
                            <div className="mt-1 h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all duration-1000 ${idx === 0 ? 'bg-violet-500' : 'bg-slate-300'}`}
                                style={{ width: `${(vote.totalVotes / experts.length) * 100}%` }}
                              />
                            </div>
                          </div>
                          <div className="flex -space-x-1">
                            {vote.votes.map((v, vi) => {
                              const exp = experts.find(e => e.name === v.expertName);
                              return (
                                <div
                                  key={vi}
                                  className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold text-white border border-white dark:border-slate-900"
                                  style={{ backgroundColor: exp?.color || '#6b7280' }}
                                  title={v.reason}
                                >
                                  {exp?.avatar || '?'}
                                </div>
                              );
                            })}
                          </div>
                          <span className="text-xs text-slate-400 w-10 text-right">{vote.totalVotes}票</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Conclusion */}
                <div className="bg-violet-50 dark:bg-violet-950/30 rounded-xl p-4 border border-violet-200 dark:border-violet-800">
                  <div className="flex items-start gap-2">
                    <span className="material-symbols-outlined text-violet-600 text-lg mt-0.5">lightbulb</span>
                    <div>
                      <p className="text-xs font-bold text-violet-700 dark:text-violet-300 mb-1">团队结论</p>
                      <p className="text-sm text-violet-800 dark:text-violet-200 leading-relaxed">{discussion.conclusion}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ====== Section 3: 差异化分析 ====== */}
      <div className={`transition-all duration-700 ${phase >= 3 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
        <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 shadow-sm overflow-hidden">
          <div className="px-6 py-4 bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/30 border-b border-outline-variant/20">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 flex items-center justify-center">
                <span className="material-symbols-outlined text-xl">diamond</span>
              </div>
              <div>
                <h4 className="font-bold text-on-surface">差异化分析</h4>
                <p className="text-xs text-slate-500 mt-0.5">这篇文章有什么不一样的地方</p>
              </div>
            </div>
          </div>

          <div className="p-6">
            {phase < 3 ? (
              <SkeletonCards count={2} />
            ) : differentiation.length === 0 ? (
              <EmptyState message="暂无足够数据分析差异化" />
            ) : (
              <div className="space-y-4">
                {/* 按类型分组展示 */}
                {(['strength', 'unique', 'blindspot'] as const).map(type => {
                  const items = differentiation.filter(d => d.type === type);
                  if (items.length === 0) return null;
                  const config = {
                    strength: { label: '核心优势', icon: 'thumb_up', color: 'text-green-700', bgColor: 'bg-green-50 border-green-200' },
                    unique: { label: '差异化亮点', icon: 'auto_awesome', color: 'text-indigo-700', bgColor: 'bg-indigo-50 border-indigo-200' },
                    blindspot: { label: '需关注盲点', icon: 'visibility_off', color: 'text-orange-700', bgColor: 'bg-orange-50 border-orange-200' },
                  }[type];

                  return (
                    <div key={type}>
                      <p className={`text-xs font-bold mb-2 flex items-center gap-1 ${config.color}`}>
                        <span className="material-symbols-outlined text-sm">{config.icon}</span>
                        {config.label}
                      </p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {items.map((item, idx) => (
                          <div key={idx} className={`p-3 rounded-xl border text-xs ${config.bgColor}`}>
                            <p className="font-medium text-on-surface">{item.dimension}</p>
                            <p className="text-slate-600 dark:text-slate-400 mt-1">{item.description}</p>
                            <p className="text-slate-400 mt-1 italic">{item.evidence}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
//  Shared UI Atoms
// ============================================================

function SkeletonCards({ count }: { count: number }) {
  return (
    <div className="space-y-3 animate-pulse">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="h-16 bg-slate-100 dark:bg-slate-800 rounded-xl" />
      ))}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="text-center py-8 text-slate-400">
      <span className="material-symbols-outlined text-3xl mb-2 block">info</span>
      <p className="text-sm">{message}</p>
    </div>
  );
}
