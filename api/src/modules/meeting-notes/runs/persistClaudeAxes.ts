// runs/persistClaudeAxes.ts — 把 Claude CLI 一次性产出的 axes JSON 落到 17 张 mn_* 表
//
// 调用顺序：runEngine.execute() → runClaudeCliMode() → persistAnalysisToAsset() → persistClaudeAxes()
//
// 设计要点：
//   1. 所有写入都打 source='claude_cli'，重跑同 meeting 时 DELETE WHERE source='claude_cli' 后重写；
//      其他 source 的行（'manual_import'/'human_edit'/'llm_extracted'）不动。
//   2. Claude 返回 'p1'/'p2' localId，本模块用 cliPersonMap 反查 mn_people.id (UUID)；
//      找不到的人物直接跳过该行（不阻塞整批）。
//   3. tensions / consensus / focus_map 的 meeting_id 列是 VARCHAR(50)，其余表是 UUID。
//      传参时分两个变量 meetingIdUuid + meetingIdStr。
//   4. 失败容忍：单条 INSERT 出错只 console.warn，不中断整批；persistAxes 整体只在 connection error
//      时上抛，由 runEngine 决定是否 mark run as failed。

import type { MeetingNotesDeps } from '../types.js';

// ============================================================
// 入参 / 工具
// ============================================================

interface AxesRoot {
  meeting?: any;
  participants?: Array<{ id: string; name: string; role?: string }>;
  analysis: {
    summary?: { decision?: string; actionItems?: any[]; risks?: string[] };
    tension?: any[];
    newCognition?: any[];
    focusMap?: any[];
    consensus?: any[];
    crossView?: any[];
  };
  axes: {
    people?: { commitments?: any[]; peopleStats?: any[] };
    knowledge?: {
      reusableJudgments?: any[];
      mentalModels?: any[];
      evidenceGrades?: any[];
      cognitiveBiases?: any[];
      counterfactuals?: any[];
    };
    meta?: { decisionQuality?: any; necessity?: any; emotionCurve?: any[] };
    projects?: { decisionChain?: any[]; assumptions?: any[]; openQuestions?: any[]; risks?: any[] };
    tension?: any[];
  };
}

const SOURCE = 'claude_cli';

/** 中文 verification_state → DB 枚举 */
function mapVerificationState(v: unknown): string {
  const s = String(v ?? '').trim();
  if (!s) return 'unverified';
  if (/已验证|confirm/i.test(s)) return 'confirmed';
  if (/falsified|证伪/.test(s)) return 'falsified';
  if (/测试中|verifying|观察中/i.test(s)) return 'verifying';
  return 'unverified';
}

/** verdict → 'async_ok' | 'partial' | 'needed' */
function mapVerdict(v: unknown): string {
  const s = String(v ?? '').trim();
  if (!s) return 'needed';
  if (s === 'async_ok' || s === 'partial' || s === 'needed') return s;
  if (/可缩减|可异步|缩短|可省/.test(s)) return 'partial';
  if (/异步即可|可不开/.test(s)) return 'async_ok';
  return 'needed';
}

/** evidenceGrades 数组 [{grade:'A · 硬数据', count}] → {a, b, c, d} */
function bucketEvidenceGrades(arr: any[]): { a: number; b: number; c: number; d: number } {
  const out = { a: 0, b: 0, c: 0, d: 0 };
  if (!Array.isArray(arr)) return out;
  for (const item of arr) {
    const grade = String(item?.grade ?? '').toUpperCase();
    const cnt = Number(item?.count ?? 0) || 0;
    if (grade.startsWith('A')) out.a = cnt;
    else if (grade.startsWith('B')) out.b = cnt;
    else if (grade.startsWith('C')) out.c = cnt;
    else if (grade.startsWith('D')) out.d = cnt;
  }
  return out;
}

/** evidence_grade 单字符 'A'-'D'，否则 'C' */
function clampGrade(v: unknown): 'A' | 'B' | 'C' | 'D' {
  const s = String(v ?? '').trim().toUpperCase();
  if (s === 'A' || s === 'B' || s === 'C' || s === 'D') return s as any;
  return 'C';
}

/** state 枚举：on_track / at_risk / done / slipped */
function mapCommitState(v: unknown): string {
  const s = String(v ?? '').trim().toLowerCase().replace(/-/g, '_');
  if (['on_track', 'at_risk', 'done', 'slipped'].includes(s)) return s;
  return 'on_track';
}

/** severity 枚举（biases: low/med/high；risks: low/med/high/critical） */
function mapSeverity(v: unknown, allowCritical = false): string {
  const s = String(v ?? '').trim().toLowerCase();
  if (s === 'low' || s === 'med' || s === 'high') return s;
  if (allowCritical && s === 'critical') return s;
  return 'med';
}

/** open question status: open/assigned/chronic/resolved */
function mapStatus(v: unknown): string {
  const s = String(v ?? '').trim().toLowerCase();
  if (['open', 'assigned', 'chronic', 'resolved'].includes(s)) return s;
  return 'open';
}

function mapCategory(v: unknown): string {
  const s = String(v ?? '').trim().toLowerCase();
  if (['strategic', 'analytical', 'governance', 'operational'].includes(s)) return s;
  return 'operational';
}

function mapTrend(v: unknown): string {
  const s = String(v ?? '').trim().toLowerCase();
  if (['up', 'flat', 'down'].includes(s)) return s;
  return 'flat';
}

function clampNumber(v: unknown, min: number, max: number, fallback: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/** YYYY-MM-DD 或 ISO 转 SQL TIMESTAMPTZ；'—' / 空 → null */
function toTs(v: unknown): string | null {
  if (!v) return null;
  const s = String(v).trim();
  if (!s || s === '—') return null;
  // 简单 sanity check
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s;
  return null;
}

/** 把 'p1' → mn_people.id (UUID)；找不到返回 null */
function resolvePersonId(localId: unknown, map: Record<string, string>): string | null {
  if (typeof localId !== 'string' || !localId) return null;
  return map[localId] ?? null;
}

/** ['p1','p3'] → ['uuid1','uuid3']（过滤掉解析不到的） */
function resolvePersonIds(arr: unknown, map: Record<string, string>): string[] {
  if (!Array.isArray(arr)) return [];
  const out: string[] = [];
  for (const it of arr) {
    const id = resolvePersonId(it, map);
    if (id) out.push(id);
  }
  return out;
}

// ============================================================
// 主入口
// ============================================================

export async function persistClaudeAxes(
  deps: MeetingNotesDeps,
  meetingIdStr: string, // assets.id 字符串形态（既是 UUID 字符串又能匹配 VARCHAR(50)）
  axesRoot: AxesRoot,
  cliPersonMap: Record<string, string>,
): Promise<void> {
  const db = deps.db;
  const meetingIdUuid = meetingIdStr; // PG 会自动从 text 转成 uuid（INSERT 时显式 ::uuid 安全）

  // ── 0. 先把所有相关 mn_* 表里 source='claude_cli' 的旧行删掉，避免重跑数据翻倍 ──
  const cleanupQueries = [
    `DELETE FROM mn_commitments        WHERE meeting_id = $1::uuid AND source = $2`,
    `DELETE FROM mn_role_trajectory_points WHERE meeting_id = $1::uuid AND source = $2`,
    `DELETE FROM mn_speech_quality     WHERE meeting_id = $1::uuid AND source = $2`,
    `DELETE FROM mn_silence_signals    WHERE meeting_id = $1::uuid AND source = $2`,
    `DELETE FROM mn_decisions          WHERE meeting_id = $1::uuid AND source = $2`,
    `DELETE FROM mn_assumptions        WHERE meeting_id = $1::uuid AND source = $2`,
    // mn_open_questions 没有 meeting_id 列；按 first_raised_meeting_id 清理
    `DELETE FROM mn_open_questions     WHERE first_raised_meeting_id = $1::uuid AND source = $2`,
    // mn_risks 也没有 meeting_id；按 metadata.firstRaisedMeetingId 清理（claude-cli 模式我们写在 metadata 里）
    `DELETE FROM mn_risks              WHERE metadata->>'firstRaisedMeetingId' = $1 AND source = $2`,
    `DELETE FROM mn_judgments          WHERE abstracted_from_meeting_id = $1::uuid AND source = $2`,
    `DELETE FROM mn_mental_model_invocations WHERE meeting_id = $1::uuid AND source = $2`,
    `DELETE FROM mn_cognitive_biases   WHERE meeting_id = $1::uuid AND source = $2`,
    `DELETE FROM mn_counterfactuals    WHERE meeting_id = $1::uuid AND source = $2`,
    `DELETE FROM mn_evidence_grades    WHERE meeting_id = $1::uuid AND source = $2`,
    `DELETE FROM mn_decision_quality   WHERE meeting_id = $1::uuid AND source = $2`,
    `DELETE FROM mn_meeting_necessity  WHERE meeting_id = $1::uuid AND source = $2`,
    `DELETE FROM mn_affect_curve       WHERE meeting_id = $1::uuid AND source = $2`,
    // tension/consensus/focus_map: meeting_id 是 VARCHAR(50)
    `DELETE FROM mn_tensions           WHERE meeting_id = $1 AND source = $2`,
    `DELETE FROM mn_consensus_items    WHERE meeting_id = $1 AND source = $2`,
    `DELETE FROM mn_focus_map          WHERE meeting_id = $1 AND source = $2`,
  ];
  for (const q of cleanupQueries) {
    try {
      await db.query(q, [meetingIdUuid, SOURCE]);
    } catch (e: any) {
      console.warn('[persistClaudeAxes] cleanup failed:', q.slice(0, 60), '—', e?.message);
    }
  }

  // ── 1. People axis ─────────────────────────────────────────
  const peopleBlock = axesRoot.axes?.people ?? {};
  await persistCommitments(deps, meetingIdUuid, peopleBlock.commitments ?? [], cliPersonMap);
  await persistPeopleStats(deps, meetingIdUuid, peopleBlock.peopleStats ?? [], cliPersonMap);

  // ── 2. Projects axis ───────────────────────────────────────
  const projectsBlock = axesRoot.axes?.projects ?? {};
  await persistDecisions(deps, meetingIdUuid, projectsBlock.decisionChain ?? [], cliPersonMap);
  await persistAssumptions(deps, meetingIdUuid, projectsBlock.assumptions ?? [], cliPersonMap);
  await persistOpenQuestions(deps, meetingIdUuid, projectsBlock.openQuestions ?? [], cliPersonMap);
  await persistRisks(deps, meetingIdUuid, meetingIdStr, projectsBlock.risks ?? []);

  // ── 3. Knowledge axis ──────────────────────────────────────
  const knowledgeBlock = axesRoot.axes?.knowledge ?? {};
  await persistJudgments(deps, meetingIdUuid, knowledgeBlock.reusableJudgments ?? [], cliPersonMap);
  await persistMentalModels(deps, meetingIdUuid, knowledgeBlock.mentalModels ?? [], cliPersonMap);
  await persistEvidenceGrades(deps, meetingIdUuid, knowledgeBlock.evidenceGrades ?? []);
  await persistCognitiveBiases(deps, meetingIdUuid, knowledgeBlock.cognitiveBiases ?? [], cliPersonMap);
  await persistCounterfactuals(deps, meetingIdUuid, knowledgeBlock.counterfactuals ?? [], cliPersonMap);

  // ── 4. Meta axis ────────────────────────────────────────────
  const metaBlock = axesRoot.axes?.meta ?? {};
  await persistDecisionQuality(deps, meetingIdUuid, metaBlock.decisionQuality);
  await persistMeetingNecessity(deps, meetingIdUuid, metaBlock.necessity);
  await persistAffectCurve(deps, meetingIdUuid, metaBlock.emotionCurve ?? []);

  // ── 5. Tension / Consensus / FocusMap (VARCHAR meeting_id) ─
  await persistTensions(deps, meetingIdStr, axesRoot.axes?.tension ?? axesRoot.analysis?.tension ?? [], cliPersonMap);
  await persistConsensus(deps, meetingIdStr, axesRoot.analysis?.consensus ?? [], cliPersonMap);
  await persistFocusMap(deps, meetingIdStr, axesRoot.analysis?.focusMap ?? [], cliPersonMap);
}

// ============================================================
// 各 axis 写入函数
// ============================================================

async function persistCommitments(
  deps: MeetingNotesDeps,
  meetingIdUuid: string,
  rows: any[],
  pmap: Record<string, string>,
): Promise<void> {
  for (const it of rows) {
    const personId = resolvePersonId(it?.who, pmap);
    if (!personId) continue;
    try {
      await deps.db.query(
        `INSERT INTO mn_commitments
           (meeting_id, person_id, text, due_at, state, progress, evidence_refs, source)
         VALUES ($1::uuid, $2::uuid, $3, $4::timestamptz, $5, $6, $7::jsonb, $8)`,
        [
          meetingIdUuid,
          personId,
          String(it?.what ?? '').trim() || '(no text)',
          toTs(it?.due),
          mapCommitState(it?.state),
          clampNumber(Number(it?.progress) * 100, 0, 100, 0), // claude 0-1, DB 0-100
          JSON.stringify({ src_id: it?.id ?? null }),
          SOURCE,
        ],
      );
    } catch (e: any) {
      console.warn('[persistClaudeAxes] commitments insert failed:', e?.message);
    }
  }
}

async function persistPeopleStats(
  deps: MeetingNotesDeps,
  meetingIdUuid: string,
  rows: any[],
  pmap: Record<string, string>,
): Promise<void> {
  for (const stat of rows) {
    const personId = resolvePersonId(stat?.who, pmap);
    if (!personId) continue;

    // role_trajectory_points: 一行 = 一个 (person, meeting, scope=null) trajectory point
    // 兼容两种 schema：(老) roleTrajectory: [{m, role}]; (新, 单场会议简化) roleThisMeeting: string
    const traj: Array<{ role?: string; confidence?: number }> =
      Array.isArray(stat?.roleTrajectory) ? stat.roleTrajectory
      : (typeof stat?.roleThisMeeting === 'string' && stat.roleThisMeeting.trim().length > 0
          ? [{ role: stat.roleThisMeeting, confidence: 0.7 }]
          : []);
    for (const t of traj) {
      try {
        await deps.db.query(
          `INSERT INTO mn_role_trajectory_points
             (person_id, meeting_id, scope_id, role_label, confidence, source)
           VALUES ($1::uuid, $2::uuid, NULL, $3, $4, $5)
           ON CONFLICT (person_id, meeting_id, scope_id) DO UPDATE
             SET role_label = EXCLUDED.role_label,
                 confidence = EXCLUDED.confidence,
                 source = EXCLUDED.source`,
          [
            personId,
            meetingIdUuid,
            String(t?.role ?? '').slice(0, 60) || 'unknown',
            clampNumber(t?.confidence ?? 0.6, 0, 1, 0.6),
            SOURCE,
          ],
        );
      } catch (e: any) {
        console.warn('[persistClaudeAxes] role_trajectory insert failed:', e?.message);
      }
    }

    // speech_quality: entropy_pct (Claude 0-1 → DB 0-100), followed_up_count
    const entropy01 = Number(stat?.speechHighEntropy ?? stat?.speech_high_entropy ?? 0);
    const followed = Number(stat?.beingFollowedUp ?? 0);
    if (entropy01 > 0 || followed > 0) {
      try {
        await deps.db.query(
          `INSERT INTO mn_speech_quality
             (meeting_id, person_id, entropy_pct, followed_up_count, quality_score, sample_quotes, source)
           VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6::jsonb, $7)
           ON CONFLICT (meeting_id, person_id) DO UPDATE
             SET entropy_pct = EXCLUDED.entropy_pct,
                 followed_up_count = EXCLUDED.followed_up_count,
                 quality_score = EXCLUDED.quality_score,
                 source = EXCLUDED.source`,
          [
            meetingIdUuid,
            personId,
            clampNumber(entropy01 * 100, 0, 100, 0),
            Math.max(0, Math.floor(followed)),
            clampNumber(entropy01 * 60 + Math.min(40, followed), 0, 100, 0),
            JSON.stringify([]),
            SOURCE,
          ],
        );
      } catch (e: any) {
        console.warn('[persistClaudeAxes] speech_quality insert failed:', e?.message);
      }
    }

    // silence_signals: silentOnTopics → 一条 row 一个 topic
    const silentTopics = Array.isArray(stat?.silentOnTopics) ? stat.silentOnTopics : [];
    for (const topic of silentTopics) {
      const t = String(topic ?? '').trim();
      if (!t) continue;
      try {
        await deps.db.query(
          `INSERT INTO mn_silence_signals
             (meeting_id, person_id, topic_id, state, prior_topics_spoken, anomaly_score, source)
           VALUES ($1::uuid, $2::uuid, $3, 'abnormal_silence', 0, $4, $5)`,
          [meetingIdUuid, personId, t.slice(0, 80), 70, SOURCE],
        );
      } catch (e: any) {
        console.warn('[persistClaudeAxes] silence_signals insert failed:', e?.message);
      }
    }
  }
}

async function persistDecisions(
  deps: MeetingNotesDeps,
  meetingIdUuid: string,
  rows: any[],
  pmap: Record<string, string>,
): Promise<void> {
  for (const it of rows) {
    const proposerId = resolvePersonId(it?.who, pmap);
    try {
      await deps.db.query(
        `INSERT INTO mn_decisions
           (meeting_id, title, proposer_person_id, based_on_ids, superseded_by_id,
            confidence, is_current, rationale, metadata, source)
         VALUES ($1::uuid, $2, $3::uuid, $4::uuid[], NULL, $5, $6, $7, $8::jsonb, $9)`,
        [
          meetingIdUuid,
          String(it?.title ?? '').slice(0, 400) || '(untitled decision)',
          proposerId,
          [], // based_on_ids: 跨会议 D-XX 难以解析，留空
          clampNumber(it?.confidence, 0, 1, 0.5),
          !it?.superseded,
          String(it?.basedOn ?? '') || null,
          JSON.stringify({ src_id: it?.id ?? null, supersededBy: it?.supersededBy ?? null }),
          SOURCE,
        ],
      );
    } catch (e: any) {
      console.warn('[persistClaudeAxes] decisions insert failed:', e?.message);
    }
  }
}

async function persistAssumptions(
  deps: MeetingNotesDeps,
  meetingIdUuid: string,
  rows: any[],
  pmap: Record<string, string>,
): Promise<void> {
  for (const it of rows) {
    const verifierId = resolvePersonId(it?.verifier, pmap);
    try {
      await deps.db.query(
        `INSERT INTO mn_assumptions
           (meeting_id, text, evidence_grade, verification_state, verifier_person_id,
            due_at, underpins_decision_ids, confidence, metadata, source)
         VALUES ($1::uuid, $2, $3, $4, $5::uuid, $6::timestamptz, $7::uuid[], $8, $9::jsonb, $10)`,
        [
          meetingIdUuid,
          String(it?.text ?? '').trim() || '(empty assumption)',
          clampGrade(it?.evidenceGrade),
          mapVerificationState(it?.verificationState),
          verifierId,
          toTs(it?.verifyDue),
          [], // underpins_decision_ids 跨会议难解析
          clampNumber(it?.confidence, 0, 1, 0.5),
          JSON.stringify({ src_id: it?.id ?? null, underpinsRaw: it?.underpins ?? [] }),
          SOURCE,
        ],
      );
    } catch (e: any) {
      console.warn('[persistClaudeAxes] assumptions insert failed:', e?.message);
    }
  }
}

async function persistOpenQuestions(
  deps: MeetingNotesDeps,
  meetingIdUuid: string,
  rows: any[],
  pmap: Record<string, string>,
): Promise<void> {
  for (const it of rows) {
    const ownerId = resolvePersonId(it?.owner, pmap);
    try {
      await deps.db.query(
        `INSERT INTO mn_open_questions
           (text, category, status, times_raised, first_raised_meeting_id, last_raised_meeting_id,
            owner_person_id, due_at, metadata, source)
         VALUES ($1, $2, $3, $4, $5::uuid, $6::uuid, $7::uuid, $8::timestamptz, $9::jsonb, $10)`,
        [
          String(it?.text ?? '').trim() || '(empty question)',
          mapCategory(it?.category),
          mapStatus(it?.status),
          Math.max(1, Number(it?.timesRaised) || 1),
          meetingIdUuid,
          meetingIdUuid, // 单场会议 first==last
          ownerId,
          toTs(it?.due),
          JSON.stringify({ src_id: it?.id ?? null, note: it?.note ?? null }),
          SOURCE,
        ],
      );
    } catch (e: any) {
      console.warn('[persistClaudeAxes] open_questions insert failed:', e?.message);
    }
  }
}

async function persistRisks(
  deps: MeetingNotesDeps,
  meetingIdUuid: string,
  meetingIdStr: string,
  rows: any[],
): Promise<void> {
  for (const it of rows) {
    try {
      await deps.db.query(
        `INSERT INTO mn_risks
           (text, severity, mention_count, heat_score, trend, action_taken, metadata, source)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)`,
        [
          String(it?.text ?? '').trim() || '(empty risk)',
          mapSeverity(it?.severity, true),
          Math.max(1, Number(it?.mentions) || 1),
          clampNumber(it?.heat, 0, 1, 0.5),
          mapTrend(it?.trend),
          Boolean(it?.hasAction),
          JSON.stringify({
            src_id: it?.id ?? null,
            firstRaisedMeetingId: meetingIdStr, // claude-cli 模式 cleanup 时按这个查
            action: it?.action ?? null,
            meetings: Number(it?.meetings) || 1,
          }),
          SOURCE,
        ],
      );
    } catch (e: any) {
      console.warn('[persistClaudeAxes] risks insert failed:', e?.message);
    }
  }
  void meetingIdUuid; // 暂未使用 mn_risks 没有 meeting_id 列
}

async function persistJudgments(
  deps: MeetingNotesDeps,
  meetingIdUuid: string,
  rows: any[],
  pmap: Record<string, string>,
): Promise<void> {
  for (const it of rows) {
    // author 字段是字符串 'EXX-XX 专家提炼'，不是 person id
    try {
      await deps.db.query(
        `INSERT INTO mn_judgments
           (text, abstracted_from_meeting_id, author_person_id, domain, generality_score,
            reuse_count, linked_meeting_ids, metadata, source)
         VALUES ($1, $2::uuid, NULL, $3, $4, $5, $6::uuid[], $7::jsonb, $8)`,
        [
          String(it?.text ?? '').trim() || '(empty judgment)',
          meetingIdUuid,
          String(it?.domain ?? '').slice(0, 80) || null,
          clampNumber(it?.generalityScore, 0, 1, 0.5),
          Math.max(0, Number(it?.reuseCount) || 0),
          [], // linked_meeting_ids 跨会议 M-YYYY-MM-DD 难解析；只关联自己时为空数组
          JSON.stringify({ src_id: it?.id ?? null, abstractedFrom: it?.abstractedFrom ?? null, author: it?.author ?? null }),
          SOURCE,
        ],
      );
    } catch (e: any) {
      console.warn('[persistClaudeAxes] judgments insert failed:', e?.message);
    }
  }
  void pmap;
}

async function persistMentalModels(
  deps: MeetingNotesDeps,
  meetingIdUuid: string,
  rows: any[],
  pmap: Record<string, string>,
): Promise<void> {
  for (const it of rows) {
    const invokedById = resolvePersonId(it?.invokedBy, pmap);
    try {
      await deps.db.query(
        `INSERT INTO mn_mental_model_invocations
           (meeting_id, model_name, invoked_by_person_id, correctly_used, outcome,
            expert_source, confidence, source)
         VALUES ($1::uuid, $2, $3::uuid, $4, $5, $6, $7, $8)`,
        [
          meetingIdUuid,
          String(it?.name ?? '').slice(0, 120) || '(unnamed model)',
          invokedById,
          typeof it?.correctly === 'boolean' ? it.correctly : null,
          String(it?.outcome ?? '') || null,
          String(it?.expert ?? '').slice(0, 80) || null,
          clampNumber(0.7, 0, 1, 0.7),
          SOURCE,
        ],
      );
    } catch (e: any) {
      console.warn('[persistClaudeAxes] mental_models insert failed:', e?.message);
    }
  }
}

async function persistEvidenceGrades(
  deps: MeetingNotesDeps,
  meetingIdUuid: string,
  rows: any[],
): Promise<void> {
  if (!rows || rows.length === 0) return;
  const { a, b, c, d } = bucketEvidenceGrades(rows);
  const total = a + b + c + d;
  // 加权分：A=4, B=3, C=2, D=1，平均化到 0-4
  const weighted = total > 0 ? (a * 4 + b * 3 + c * 2 + d * 1) / total : 0;
  try {
    await deps.db.query(
      `INSERT INTO mn_evidence_grades
         (meeting_id, dist_a, dist_b, dist_c, dist_d, weighted_score, source)
       VALUES ($1::uuid, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (meeting_id) DO UPDATE
         SET dist_a = EXCLUDED.dist_a,
             dist_b = EXCLUDED.dist_b,
             dist_c = EXCLUDED.dist_c,
             dist_d = EXCLUDED.dist_d,
             weighted_score = EXCLUDED.weighted_score,
             source = EXCLUDED.source,
             computed_at = NOW()`,
      [meetingIdUuid, a, b, c, d, Number(weighted.toFixed(2)), SOURCE],
    );
  } catch (e: any) {
    console.warn('[persistClaudeAxes] evidence_grades upsert failed:', e?.message);
  }
}

async function persistCognitiveBiases(
  deps: MeetingNotesDeps,
  meetingIdUuid: string,
  rows: any[],
  pmap: Record<string, string>,
): Promise<void> {
  for (const it of rows) {
    const byArr = Array.isArray(it?.by) ? it.by : [];
    const byPersonId = byArr.length > 0 ? resolvePersonId(byArr[0], pmap) : null;
    try {
      await deps.db.query(
        `INSERT INTO mn_cognitive_biases
           (meeting_id, bias_type, where_excerpt, by_person_id, severity, mitigated, mitigation_strategy, source)
         VALUES ($1::uuid, $2, $3, $4::uuid, $5, $6, $7, $8)`,
        [
          meetingIdUuid,
          String(it?.name ?? '').slice(0, 60) || 'unknown',
          String(it?.where ?? '') || null,
          byPersonId,
          mapSeverity(it?.severity, false),
          Boolean(it?.mitigated),
          String(it?.mitigation ?? '') || null,
          SOURCE,
        ],
      );
    } catch (e: any) {
      console.warn('[persistClaudeAxes] cognitive_biases insert failed:', e?.message);
    }
  }
}

async function persistCounterfactuals(
  deps: MeetingNotesDeps,
  meetingIdUuid: string,
  rows: any[],
  pmap: Record<string, string>,
): Promise<void> {
  for (const it of rows) {
    const byArr = Array.isArray(it?.rejectedBy) ? it.rejectedBy : [];
    const byPersonId = byArr.length > 0 ? resolvePersonId(byArr[0], pmap) : null;
    try {
      await deps.db.query(
        `INSERT INTO mn_counterfactuals
           (meeting_id, rejected_path, rejected_by_person_id, tracking_note,
            next_validity_check_at, current_validity, source)
         VALUES ($1::uuid, $2, $3::uuid, $4, $5::timestamptz, 'unclear', $6)`,
        [
          meetingIdUuid,
          String(it?.path ?? '').trim() || '(empty path)',
          byPersonId,
          String(it?.trackingNote ?? '') || null,
          toTs(it?.validityCheckAt),
          SOURCE,
        ],
      );
    } catch (e: any) {
      console.warn('[persistClaudeAxes] counterfactuals insert failed:', e?.message);
    }
  }
}

async function persistDecisionQuality(
  deps: MeetingNotesDeps,
  meetingIdUuid: string,
  block: any,
): Promise<void> {
  if (!block || typeof block !== 'object') return;
  const dimsArr: any[] = Array.isArray(block.dims) ? block.dims : [];
  const dims: Record<string, number> = {};
  for (const d of dimsArr) {
    if (d && typeof d.id === 'string' && typeof d.score === 'number') {
      dims[d.id] = clampNumber(d.score, 0, 1, 0);
    }
  }
  try {
    await deps.db.query(
      `INSERT INTO mn_decision_quality
         (meeting_id, overall, clarity, actionable, traceable, falsifiable, aligned, source)
       VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (meeting_id) DO UPDATE
         SET overall = EXCLUDED.overall,
             clarity = EXCLUDED.clarity, actionable = EXCLUDED.actionable,
             traceable = EXCLUDED.traceable, falsifiable = EXCLUDED.falsifiable,
             aligned = EXCLUDED.aligned, source = EXCLUDED.source,
             computed_at = NOW()`,
      [
        meetingIdUuid,
        clampNumber(block.overall, 0, 1, 0),
        dims.clarity ?? 0,
        dims.actionable ?? 0,
        dims.traceable ?? 0,
        dims.falsifiable ?? 0,
        dims.aligned ?? 0,
        SOURCE,
      ],
    );
  } catch (e: any) {
    console.warn('[persistClaudeAxes] decision_quality upsert failed:', e?.message);
  }
}

async function persistMeetingNecessity(
  deps: MeetingNotesDeps,
  meetingIdUuid: string,
  block: any,
): Promise<void> {
  if (!block || typeof block !== 'object') return;
  const reasons = Array.isArray(block.reasons) ? block.reasons : [];
  const suggestedDur = Number(block.suggested_duration_min ?? block.suggestedDurationMin);
  try {
    await deps.db.query(
      `INSERT INTO mn_meeting_necessity
         (meeting_id, verdict, suggested_duration_min, reasons, source)
       VALUES ($1::uuid, $2, $3, $4::jsonb, $5)
       ON CONFLICT (meeting_id) DO UPDATE
         SET verdict = EXCLUDED.verdict,
             suggested_duration_min = EXCLUDED.suggested_duration_min,
             reasons = EXCLUDED.reasons,
             source = EXCLUDED.source,
             computed_at = NOW()`,
      [
        meetingIdUuid,
        mapVerdict(block.verdict),
        Number.isFinite(suggestedDur) && suggestedDur > 0 ? Math.floor(suggestedDur) : null,
        JSON.stringify(reasons),
        SOURCE,
      ],
    );
  } catch (e: any) {
    console.warn('[persistClaudeAxes] meeting_necessity upsert failed:', e?.message);
  }
}

async function persistAffectCurve(
  deps: MeetingNotesDeps,
  meetingIdUuid: string,
  rows: any[],
): Promise<void> {
  if (!Array.isArray(rows) || rows.length === 0) return;
  // 把 [{t, v, i, tag}] 标准化成 [{t_sec, valence, intensity, tag?}]
  const samples = rows
    .filter((r) => r && typeof r === 'object')
    .map((r) => ({
      t_sec: Math.floor(Number(r.t ?? r.t_sec ?? 0) * (typeof r.t === 'number' && Number(r.t) < 1000 ? 60 : 1)), // t 通常是分钟，乘 60；如果已经是秒（>1000）保留
      valence: clampNumber(r.v ?? r.valence, -1, 1, 0),
      intensity: clampNumber(r.i ?? r.intensity, 0, 1, 0),
      ...(r.tag ? { tag: String(r.tag) } : {}),
    }));
  try {
    await deps.db.query(
      `INSERT INTO mn_affect_curve
         (meeting_id, samples, tension_peaks, insight_points, source)
       VALUES ($1::uuid, $2::jsonb, $3::jsonb, $4::jsonb, $5)
       ON CONFLICT (meeting_id) DO UPDATE
         SET samples = EXCLUDED.samples,
             tension_peaks = EXCLUDED.tension_peaks,
             insight_points = EXCLUDED.insight_points,
             source = EXCLUDED.source,
             computed_at = NOW()`,
      [
        meetingIdUuid,
        JSON.stringify(samples),
        JSON.stringify([]), // tension_peaks 由后续触发器/聚合计算
        JSON.stringify([]),
        SOURCE,
      ],
    );
  } catch (e: any) {
    console.warn('[persistClaudeAxes] affect_curve upsert failed:', e?.message);
  }
}

async function persistTensions(
  deps: MeetingNotesDeps,
  meetingIdStr: string,
  rows: any[],
  pmap: Record<string, string>,
): Promise<void> {
  for (const it of rows) {
    const betweenIds = resolvePersonIds(it?.between, pmap);
    const moments = Array.isArray(it?.moments) ? it.moments : [];
    try {
      await deps.db.query(
        `INSERT INTO mn_tensions
           (meeting_id, tension_key, between_ids, topic, intensity, summary, meta, source)
         VALUES ($1, $2, $3::uuid[], $4, $5, $6, $7::jsonb, $8)
         ON CONFLICT (meeting_id, tension_key) DO UPDATE
           SET between_ids = EXCLUDED.between_ids,
               topic = EXCLUDED.topic,
               intensity = EXCLUDED.intensity,
               summary = EXCLUDED.summary,
               meta = EXCLUDED.meta,
               source = EXCLUDED.source,
               computed_at = NOW()`,
        [
          meetingIdStr,
          String(it?.id ?? '').slice(0, 50) || `T${Date.now()}`,
          betweenIds,
          String(it?.topic ?? '').trim() || '(empty topic)',
          clampNumber(it?.intensity, 0, 1, 0),
          String(it?.summary ?? '') || null,
          JSON.stringify({ moments }),
          SOURCE,
        ],
      );
    } catch (e: any) {
      console.warn('[persistClaudeAxes] tensions insert failed:', e?.message);
    }
  }
}

async function persistConsensus(
  deps: MeetingNotesDeps,
  meetingIdStr: string,
  rows: any[],
  pmap: Record<string, string>,
): Promise<void> {
  for (let i = 0; i < rows.length; i++) {
    const it = rows[i];
    const kind = it?.kind === 'divergence' ? 'divergence' : 'consensus';
    const supportedBy = resolvePersonIds(it?.supportedBy, pmap);
    let itemId: string | null = null;
    try {
      const r = await deps.db.query(
        `INSERT INTO mn_consensus_items
           (meeting_id, kind, item_text, supported_by, seq, source)
         VALUES ($1, $2, $3, $4::uuid[], $5, $6)
         RETURNING id`,
        [
          meetingIdStr,
          kind,
          String(it?.text ?? '').trim() || '(empty)',
          supportedBy,
          i,
          SOURCE,
        ],
      );
      itemId = r.rows[0]?.id ?? null;
    } catch (e: any) {
      console.warn('[persistClaudeAxes] consensus_items insert failed:', e?.message);
      continue;
    }
    if (!itemId) continue;
    const sides = Array.isArray(it?.sides) ? it.sides : [];
    for (let s = 0; s < sides.length; s++) {
      const side = sides[s];
      try {
        await deps.db.query(
          `INSERT INTO mn_consensus_sides
             (item_id, stance, reason, by_ids, seq, source)
           VALUES ($1::uuid, $2, $3, $4::uuid[], $5, $6)`,
          [
            itemId,
            String(side?.stance ?? '').slice(0, 200),
            String(side?.reason ?? '') || null,
            resolvePersonIds(side?.by, pmap),
            s,
            SOURCE,
          ],
        );
      } catch (e: any) {
        console.warn('[persistClaudeAxes] consensus_sides insert failed:', e?.message);
      }
    }
  }
}

async function persistFocusMap(
  deps: MeetingNotesDeps,
  meetingIdStr: string,
  rows: any[],
  pmap: Record<string, string>,
): Promise<void> {
  for (const it of rows) {
    const personId = resolvePersonId(it?.who, pmap);
    if (!personId) continue;
    const themes = Array.isArray(it?.themes)
      ? it.themes.map((t: any) => String(t)).filter((t: string) => t.length > 0)
      : [];
    try {
      await deps.db.query(
        `INSERT INTO mn_focus_map
           (meeting_id, person_id, themes, returns_to, source)
         VALUES ($1, $2::uuid, $3::text[], $4, $5)
         ON CONFLICT (meeting_id, person_id) DO UPDATE
           SET themes = EXCLUDED.themes,
               returns_to = EXCLUDED.returns_to,
               source = EXCLUDED.source,
               computed_at = NOW()`,
        [
          meetingIdStr,
          personId,
          themes,
          Math.max(0, Number(it?.returnsTo) || 0),
          SOURCE,
        ],
      );
    } catch (e: any) {
      console.warn('[persistClaudeAxes] focus_map insert failed:', e?.message);
    }
  }
}
