// runs/composeAnalysis.ts — 把 axes 各表 row 合成成参考分析（ANALYSIS）schema
//
// 背景：getMeetingDetail 的 view A 之前有两条数据路径：
//   1) storedAnalysis fast-path（assets.metadata.analysis 命中）→ 返回手工精雕的 ANALYSIS
//   2) axes-driven fallback → 直接把 mn_* 表的 raw row 当 sections.body 返回
// 路径 2 schema 跟前端 _fixtures.ts 的 ANALYSIS 不一致：
//   - tension row 字段是 { tension_key, between_ids, computed_at... } 而前端期望 { id, between, ... }
//   - newCognition 用了 mn_judgments row（{ text, domain, generality_score }）而前端期望 { who, before, after, trigger }
//   - consensus 用了 mn_assumptions（{ text, evidence_grade, ... }）而前端期望 { kind, supportedBy, sides }
// 结果就是 view A 渲染杂乱，与 storedAnalysis 命中的页面观感差距巨大。
//
// 这个模块在 runEngine.execute() 跑完所有 axes 之后调用，把 axes 数据 schema-map 成
// 参考 ANALYSIS object，供 runEngine 写入 assets.metadata.analysis；下次访问 view A
// 自动走 fast-path，schema 与手工分析对齐。
//
// Phase 1（当前）：纯 schema mapping，零新 LLM 调用。覆盖：summary / tension / focusMap /
// consensus 4 个 section 完全实现；newCognition 用 counterfactuals 拼，crossView 留空数组。
// Phase 2（未来）：加 1-2 次 LLM 调用专门抽取 newCognition 的 before→after→trigger 三元组
// 与 crossView 的 claim+responses。

import type { DatabaseAdapter } from '../types.js';

// ── 与 webapp/src/prototype/meeting/_fixtures.ts ANALYSIS 对齐的 schema ──
export interface AnalysisActionItem {
  id: string;
  who: string;        // person_id (UUID) 或 mock 形态 'p1'/'p2'
  what: string;
  due: string;        // YYYY-MM-DD 或 '—'
}

export interface AnalysisTension {
  id: string;         // 'T1' / 'T2' / ...
  between: string[];  // person_id 数组
  topic: string;
  intensity: number;  // 0-1
  summary: string;
  moments: string[];  // 已 normalize 成 "who：text" 字符串
}

export interface AnalysisNewCognition {
  id: string;         // 'N1' / 'N2' / ...
  who: string;
  before: string;
  after: string;
  trigger: string;
}

export interface AnalysisFocusMapEntry {
  who: string;
  themes: string[];
  returnsTo: number;
}

export interface AnalysisConsensusItem {
  id: string;
  kind: 'consensus' | 'divergence';
  text: string;
  supportedBy: string[];
  sides: Array<{ stance: string; reason: string; by: string[] }>;
}

export interface AnalysisCrossView {
  id: string;
  claimBy: string;
  claim: string;
  responses: Array<{ who: string; stance: 'support' | 'partial' | 'against'; text: string }>;
}

export interface AnalysisObject {
  summary: {
    decision: string;
    actionItems: AnalysisActionItem[];
    risks: string[];
  };
  tension: AnalysisTension[];
  newCognition: AnalysisNewCognition[];
  focusMap: AnalysisFocusMapEntry[];
  consensus: AnalysisConsensusItem[];
  crossView: AnalysisCrossView[];
  /** 元信息：标记 run 自动产出，区别于手工注入。runEngine 写入前用它做 manualOverride 守护 */
  _generated?: {
    by: 'compose-analysis' | 'claude-cli';
    runId?: string;
    at: string;
    phase: 1 | 2;
  };
}

// ── 工具 ──

function toDateStr(v: any): string {
  if (!v) return '—';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v);
  if (s.length >= 10) return s.slice(0, 10);
  return '—';
}

function safeNumber(v: any, fallback = 0): number {
  if (typeof v === 'number') return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function nonEmpty(s: any): string {
  return typeof s === 'string' && s.trim().length > 0 ? s.trim() : '';
}

/**
 * tension.moments 表里是 [{who, text}]（mn_tensions JSONB），前端期望字符串数组。
 * 这里 normalize 成 "who：text" / 纯文本（who 缺失时）。
 */
function normalizeMoments(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((m: any) => {
      if (typeof m === 'string') return m;
      if (m && typeof m === 'object') {
        const who = nonEmpty(m.who);
        const text = nonEmpty(m.text);
        if (!text) return '';
        return who ? `${who}：${text}` : text;
      }
      return '';
    })
    .filter((s) => s.length > 0);
}

// ── 主入口 ──

/**
 * 从 axes 数据合成 ANALYSIS 对象。
 *
 * @param db   db adapter
 * @param meetingId
 * @param runId 用于 _generated.runId（可选）
 * @returns 完整 ANALYSIS object（即使某些 section 为空也返回该字段）
 */
export async function composeAnalysisFromAxes(
  db: DatabaseAdapter,
  meetingId: string,
  runId?: string,
): Promise<AnalysisObject> {
  // 一次性把所有需要的表都拉出来（同步并行可加速，但顺序 query 已足够快 < 50ms）
  const [
    decisionsRows,
    commitmentsRows,
    risksRows,
    tensionsRows,
    counterfactualsRows,
    judgmentsRows,
    speechQualityRows,
    consensusItemsRows,
    consensusSidesRows,
    assumptionsRows,
    openQuestionsRows,
    cognitiveBiasesRows,
  ] = await Promise.all([
    db.query(
      `SELECT id, title, rationale FROM mn_decisions
        WHERE meeting_id = $1 AND is_current = TRUE
        ORDER BY confidence DESC, created_at ASC`,
      [meetingId],
    ),
    db.query(
      `SELECT id, person_id, text, due_at FROM mn_commitments
        WHERE meeting_id = $1
        ORDER BY due_at NULLS LAST, created_at ASC`,
      [meetingId],
    ),
    db.query(
      `SELECT r.id, r.text FROM mn_risks r
        WHERE r.scope_id IN (SELECT scope_id FROM mn_scope_members WHERE meeting_id = $1)
           OR EXISTS (
             SELECT 1 FROM mn_risks rr
              WHERE rr.id = r.id AND rr.scope_id IS NULL
           )
        ORDER BY r.heat_score DESC NULLS LAST
        LIMIT 12`,
      [meetingId],
    ).catch(() => ({ rows: [] as any[] })),
    db.query(
      `SELECT id, tension_key, between_ids, topic, intensity, summary, moments
         FROM mn_tensions
        WHERE meeting_id = $1
        ORDER BY intensity DESC`,
      [meetingId],
    ).catch(() => ({ rows: [] as any[] })),
    db.query(
      `SELECT id, rejected_path, rejected_by_person_id, tracking_note
         FROM mn_counterfactuals
        WHERE meeting_id = $1
        ORDER BY id`,
      [meetingId],
    ).catch(() => ({ rows: [] as any[] })),
    db.query(
      `SELECT id, text, domain FROM mn_judgments
        WHERE $1 = ANY(linked_meeting_ids)
        ORDER BY generality_score DESC NULLS LAST
        LIMIT 8`,
      [meetingId],
    ).catch(() => ({ rows: [] as any[] })),
    db.query(
      `SELECT person_id, sample_quotes, followed_up_count, quality_score
         FROM mn_speech_quality
        WHERE meeting_id = $1
        ORDER BY quality_score DESC NULLS LAST`,
      [meetingId],
    ),
    db.query(
      `SELECT id, kind, item_text, supported_by
         FROM mn_consensus_items
        WHERE meeting_id = $1
        ORDER BY seq ASC, computed_at ASC`,
      [meetingId],
    ).catch(() => ({ rows: [] as any[] })),
    db.query(
      `SELECT s.item_id, s.stance, s.reason, s.by_ids
         FROM mn_consensus_sides s
         JOIN mn_consensus_items i ON i.id = s.item_id
        WHERE i.meeting_id = $1
        ORDER BY s.seq ASC`,
      [meetingId],
    ).catch(() => ({ rows: [] as any[] })),
    // assumptions：会上做出的假设。高 confidence (≥0.7) 视作"共识"，低 confidence 视作"待
    // 验证假设"。这是 mn_consensus_items 表为空时的兜底（当前没 axis computer 写入）。
    db.query(
      `SELECT id, text, evidence_grade, verification_state, confidence
         FROM mn_assumptions
        WHERE meeting_id = $1
        ORDER BY confidence DESC NULLS LAST
        LIMIT 16`,
      [meetingId],
    ).catch(() => ({ rows: [] as any[] })),
    // open_questions：未决问题。chronic 状态或 times_raised ≥ 2 视作"分歧/争议"
    db.query(
      `SELECT id, text, status, times_raised, category, owner_person_id
         FROM mn_open_questions
        WHERE first_raised_meeting_id = $1 OR last_raised_meeting_id = $1
        ORDER BY times_raised DESC NULLS LAST
        LIMIT 16`,
      [meetingId],
    ).catch(() => ({ rows: [] as any[] })),
    // cognitive_biases：含 by_person_id 的认知偏差，可作为"对决策的反应"做 cross-view responses
    db.query(
      `SELECT id, where_excerpt, by_person_id, severity, mitigation_strategy
         FROM mn_cognitive_biases
        WHERE meeting_id = $1
        ORDER BY severity DESC
        LIMIT 12`,
      [meetingId],
    ).catch(() => ({ rows: [] as any[] })),
  ]);

  // ── summary.decision ──
  // 兜底链：mn_decisions（最理想，明确决策语句） → mn_judgments（团队习得的核心判断当
  // "会议级总体决议") → mn_consensus_items 高置信项 → mn_assumptions A/B 级
  // 因为 decisionProvenanceComputer 的 LLM prompt 只认"明确决策语句"，探索讨论型会议
  // 经常 0 条，但参考分析里 decision 通常是"会议综合性结论"。
  let decision = nonEmpty(decisionsRows.rows[0]?.title);
  if (!decision) {
    decision = nonEmpty(decisionsRows.rows[0]?.rationale);
  }
  if (!decision && (judgmentsRows.rows ?? []).length > 0) {
    // 取 generality 最高的 judgment（首条已按 generality_score DESC 排序）当总体判断
    decision = nonEmpty(judgmentsRows.rows[0]?.text);
  }
  if (!decision && (consensusItemsRows.rows ?? []).length > 0) {
    decision = nonEmpty((consensusItemsRows.rows[0] as any)?.item_text);
  }
  if (!decision) {
    // 取首条高置信 assumption
    const top = (assumptionsRows.rows ?? []).find((a: any) => Number(a.confidence ?? 0) >= 0.7);
    if (top) decision = nonEmpty((top as any).text);
  }
  if (!decision) decision = '（本次会议未抽取出明确决议）';

  const actionItems: AnalysisActionItem[] = commitmentsRows.rows.slice(0, 12).map((r: any, i: number) => ({
    id: `A${i + 1}`,
    who: String(r.person_id ?? ''),
    what: nonEmpty(r.text),
    due: toDateStr(r.due_at),
  }));

  const risks: string[] = (risksRows.rows ?? []).map((r: any) => nonEmpty(r.text)).filter(Boolean);

  // ── tension ──
  const tensions: AnalysisTension[] = (tensionsRows.rows ?? []).map((r: any, i: number) => ({
    id: nonEmpty(r.tension_key) || `T${i + 1}`,
    between: Array.isArray(r.between_ids) ? r.between_ids.map((x: any) => String(x)) : [],
    topic: nonEmpty(r.topic),
    intensity: Math.max(0, Math.min(1, safeNumber(r.intensity, 0.5))),
    summary: nonEmpty(r.summary),
    moments: normalizeMoments(r.moments),
  }));

  // ── newCognition ──
  // Phase 1：用 counterfactuals 拼 before→after。counterfactual.rejected_path 是被否决的方案
  // （本来想做但没做），tracking_note 是会上达成的新理解；这两者天然对应"before/after 翻转"。
  // 不够数时用 judgments 里的句子做"after"，before 留空 placeholder。
  const newCognition: AnalysisNewCognition[] = [];
  for (let i = 0; i < counterfactualsRows.rows.length && newCognition.length < 8; i++) {
    const r: any = counterfactualsRows.rows[i];
    const rejected = nonEmpty(r.rejected_path);
    const note = nonEmpty(r.tracking_note);
    if (!rejected && !note) continue;
    newCognition.push({
      id: `N${newCognition.length + 1}`,
      who: String(r.rejected_by_person_id ?? ''),
      before: rejected || '（原计划方案）',
      after: note || '（已被否决，未跟踪后续）',
      trigger: '',
    });
  }
  // 不够 3 条时再用 judgments 补
  for (let i = 0; i < judgmentsRows.rows.length && newCognition.length < 6; i++) {
    const j: any = judgmentsRows.rows[i];
    const text = nonEmpty(j.text);
    if (!text) continue;
    newCognition.push({
      id: `N${newCognition.length + 1}`,
      who: '',
      before: '',
      after: text,
      trigger: nonEmpty(j.domain),
    });
  }

  // ── focusMap ──
  // 每位发言者：themes 用 sample_quotes 提关键短语（截断），returnsTo 用 followed_up_count
  const focusMap: AnalysisFocusMapEntry[] = (speechQualityRows.rows ?? []).map((r: any) => {
    const quotes: string[] = Array.isArray(r.sample_quotes) ? r.sample_quotes : [];
    // sample_quotes 一般是若干条原话。这里把每条截 14 字当 theme 关键词。
    const themes = quotes.slice(0, 5).map((q: any) => {
      const s = String(q ?? '').trim();
      return s.length > 16 ? s.slice(0, 14) + '…' : s;
    }).filter(Boolean);
    return {
      who: String(r.person_id ?? ''),
      themes,
      returnsTo: safeNumber(r.followed_up_count, 0),
    };
  });

  // ── consensus / divergence ──
  // 优先级：mn_consensus_items（如有 axis computer 写入）→ 没有则用 assumptions+open_questions 兜底
  const sidesByItem = new Map<string, Array<{ stance: string; reason: string; by: string[] }>>();
  for (const s of (consensusSidesRows.rows ?? [])) {
    const arr = sidesByItem.get(String(s.item_id)) ?? [];
    arr.push({
      stance: nonEmpty((s as any).stance),
      reason: nonEmpty((s as any).reason),
      by: Array.isArray((s as any).by_ids) ? (s as any).by_ids.map((x: any) => String(x)) : [],
    });
    sidesByItem.set(String(s.item_id), arr);
  }
  const consensus: AnalysisConsensusItem[] = [];
  let cIdx = 0, dIdx = 0;
  // 1) 主路径：mn_consensus_items
  for (const r of (consensusItemsRows.rows ?? []) as any[]) {
    const kind: 'consensus' | 'divergence' = r.kind === 'divergence' ? 'divergence' : 'consensus';
    if (kind === 'consensus') cIdx++; else dIdx++;
    consensus.push({
      id: `${kind === 'consensus' ? 'C' : 'D'}${kind === 'consensus' ? cIdx : dIdx}`,
      kind,
      text: nonEmpty(r.item_text),
      supportedBy: Array.isArray(r.supported_by) ? r.supported_by.map((x: any) => String(x)) : [],
      sides: sidesByItem.get(String(r.id)) ?? [],
    });
  }
  // 2) 兜底：mn_consensus_items 为空时，从 assumptions（高置信 → 共识）+ open_questions（争议 → 分歧）拼
  if (consensus.length === 0) {
    for (const a of (assumptionsRows.rows ?? []) as any[]) {
      const conf = Number(a.confidence ?? 0);
      const grade = String(a.evidence_grade ?? '');
      // A/B 级证据 或 confidence ≥ 0.7：视作团队达成共识的假设
      if ((grade === 'A' || grade === 'B' || conf >= 0.7) && nonEmpty(a.text)) {
        cIdx++;
        consensus.push({
          id: `C${cIdx}`,
          kind: 'consensus',
          text: nonEmpty(a.text),
          supportedBy: [],
          sides: [],
        });
      }
    }
    for (const oq of (openQuestionsRows.rows ?? []) as any[]) {
      const times = Number(oq.times_raised ?? 1);
      // chronic（多次提出未决）或 times_raised ≥ 2：视作分歧
      if ((oq.status === 'chronic' || times >= 2) && nonEmpty(oq.text)) {
        dIdx++;
        consensus.push({
          id: `D${dIdx}`,
          kind: 'divergence',
          text: nonEmpty(oq.text),
          supportedBy: [],
          sides: oq.owner_person_id ? [{
            stance: '负责人',
            reason: '该问题由此人 owns',
            by: [String(oq.owner_person_id)],
          }] : [],
        });
      }
    }
    // 若 chronic 还不够，把 mention_count ≥ 1 的 risks 也归到 divergence（风险本身就是反对意见）
    if (dIdx < 3) {
      for (const r of (risksRows.rows ?? []) as any[]) {
        if (!nonEmpty(r.text)) continue;
        dIdx++;
        consensus.push({
          id: `D${dIdx}`,
          kind: 'divergence',
          text: `（风险）${r.text}`,
          supportedBy: [],
          sides: [],
        });
        if (dIdx >= 6) break;
      }
    }
  }

  // ── crossView ──
  // 兜底链：decisions（claim+proposer 最理想）→ judgments（claim 但无 author）→ tensions（topic+between）
  // Phase 2 需要 LLM 抽显式 claim+respond 对；当前是基于 axes raw 数据的近似。
  const crossView: AnalysisCrossView[] = [];

  // 1) 主路径：mn_decisions
  for (const d of (decisionsRows.rows ?? []).slice(0, 6) as any[]) {
    const claim = nonEmpty(d.rationale)
      ? `${nonEmpty(d.title)}：${nonEmpty(d.rationale)}`
      : nonEmpty(d.title);
    if (!claim) continue;
    const claimBy = String(d.proposer_person_id ?? '');
    const responses = (cognitiveBiasesRows.rows ?? []).slice(0, 3).map((b: any) => {
      const by = String(b.by_person_id ?? '');
      const stance: 'support' | 'partial' | 'against' = (by && by === claimBy) ? 'partial' : 'against';
      return {
        who: by,
        stance,
        text: nonEmpty(b.where_excerpt) || nonEmpty(b.mitigation_strategy) || '',
      };
    }).filter((r: any) => r.text);
    crossView.push({ id: `V${crossView.length + 1}`, claimBy, claim, responses });
  }

  // 2) 兜底：decisions 为空时，用 high-generality judgments 当 claim（机器抽出的"团队习得的判断"）
  if (crossView.length === 0) {
    for (const j of (judgmentsRows.rows ?? []).slice(0, 6) as any[]) {
      if (!nonEmpty(j.text)) continue;
      // 找跟此 judgment domain 相关的 biases 当 responses（同 domain → 同议题不同视角）
      const responses = (cognitiveBiasesRows.rows ?? []).slice(0, 2).map((b: any) => ({
        who: String(b.by_person_id ?? ''),
        stance: 'partial' as const,
        text: nonEmpty(b.where_excerpt) || nonEmpty(b.mitigation_strategy) || '',
      })).filter((r: any) => r.text);
      crossView.push({
        id: `V${crossView.length + 1}`,
        claimBy: '',  // judgment 表无 author 列
        claim: nonEmpty(j.text),
        responses,
      });
    }
  }

  // 3) 再兜底：还为空就用 tensions（双方对立点 → 可视作多方观点）
  if (crossView.length === 0) {
    for (const t of (tensionsRows.rows ?? []).slice(0, 4) as any[]) {
      if (!nonEmpty(t.topic)) continue;
      const between: string[] = Array.isArray(t.between_ids) ? t.between_ids.map(String) : [];
      const moments = normalizeMoments(t.moments);
      // 把 moments 拆成 responses（每条原话当一个发言）
      const responses = moments.slice(0, 4).map((m, i) => ({
        who: between[Math.min(i, between.length - 1)] ?? '',
        stance: 'partial' as const,
        text: m,
      }));
      crossView.push({
        id: `V${crossView.length + 1}`,
        claimBy: between[0] ?? '',
        claim: `（张力议题）${t.topic}` + (nonEmpty(t.summary) ? `：${t.summary}` : ''),
        responses,
      });
    }
  }

  return {
    summary: { decision, actionItems, risks },
    tension: tensions,
    newCognition,
    focusMap,
    consensus,
    crossView,
    _generated: {
      by: 'compose-analysis',
      runId,
      at: new Date().toISOString(),
      phase: 1,
    },
  };
}

/**
 * 把生成的 ANALYSIS 写到 assets.metadata.analysis；如果已有手工版本（标记
 * manualOverride: true 或没有 _generated 字段），则跳过覆盖。
 *
 * 返回 'written' / 'skipped-manual' / 'failed'。
 */
export async function persistAnalysisToAsset(
  db: DatabaseAdapter,
  meetingId: string,
  analysis: AnalysisObject,
): Promise<'written' | 'skipped-manual' | 'failed'> {
  // 先读现状
  let existing: any = null;
  try {
    const r = await db.query(
      `SELECT metadata->>'analysis' AS analysis_raw FROM assets WHERE id = $1`,
      [meetingId],
    );
    const raw = r.rows[0]?.analysis_raw;
    if (raw) {
      try { existing = typeof raw === 'string' ? JSON.parse(raw) : raw; }
      catch { existing = null; }
    }
  } catch (e) {
    console.warn('[composeAnalysis] read existing failed:', (e as Error).message);
  }

  // 守护：手工版本不覆盖
  if (existing && typeof existing === 'object') {
    const manual = !existing._generated || existing.manualOverride === true;
    if (manual) return 'skipped-manual';
  }

  try {
    await db.query(
      `UPDATE assets
          SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
            'analysis', $2::jsonb
          )
        WHERE id = $1`,
      [meetingId, JSON.stringify(analysis)],
    );
    return 'written';
  } catch (e) {
    console.warn('[composeAnalysis] write failed:', (e as Error).message);
    return 'failed';
  }
}
