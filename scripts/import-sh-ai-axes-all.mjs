// Import script · 上海汇聚 AI 项目 · 4 轴聚合数据
//
// 数据源：/Users/scubiry/Downloads/sh-ai-axes-all.json
//   _meta + people + knowledge + meta + projects 四个轴的人工聚合分析
//   覆盖两场会议：M-SH-2026-03-31-AI-KICKOFF + M-SH-2026-04-XX-AI-01
//
// 写入目标（与 axes/registry.ts 16 个 computer 的输出表一一对应）：
//   - people     → mn_commitments / mn_role_trajectory_points / mn_speech_quality / mn_silence_signals
//   - projects   → mn_decisions / mn_assumptions / mn_open_questions / mn_risks
//   - knowledge  → mn_judgments / mn_mental_model_invocations / mn_cognitive_biases
//                  mn_counterfactuals / mn_evidence_grades
//   - meta       → mn_decision_quality / mn_meeting_necessity / mn_affect_curve
//
// 幂等：先 DELETE 当前两场 meeting 在各表中的旧行（仅这 2 场，不影响其它会议）
//
// 用法：
//   node scripts/import-sh-ai-axes-all.mjs
//
// 凭据从 api/.env 读取（DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD）

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const envText = readFileSync(resolve(repoRoot, 'api/.env'), 'utf8');
const env = Object.fromEntries(
  envText.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);

const JSON_PATH = '/Users/scubiry/Downloads/sh-ai-axes-all.json';

// ── 已知 / 待创建的 meeting asset id ──
const MEETING_KICKOFF_ID = '1ace56ff-1eeb-48d9-8f6b-e3070d9338a4';     // 已存在
const MEETING_APRIL_ID   = 'eff87d6c-efdd-4dc9-92a4-a8585b62a53c';     // 若不存在则创建

// ── Project scope（risks 必须挂 scope_id 才能在 axes API 里被查出来） ──
const PROJECT_SLUG = 'sh-ai-2026';
const PROJECT_NAME = '上海汇聚 AI 项目';

// ── meeting code (JSON 内引用) → meeting_id 映射 ──
const MEETING_CODE_MAP = {
  'M-SH-2026-03-31-AI-KICKOFF': MEETING_KICKOFF_ID,
  'M-SH-2026-03-31':            MEETING_KICKOFF_ID,
  'M-SH-2026-04-XX-AI-01':      MEETING_APRIL_ID,
  'M-SH-2026-04-XX':            MEETING_APRIL_ID,
};

function meetingIdFromCode(code) {
  if (!code) return null;
  const trimmed = String(code).trim();
  // 截掉可能的后缀注释 "(软性)" "(暂时)" 等
  const baseExact = MEETING_CODE_MAP[trimmed];
  if (baseExact) return baseExact;
  for (const [k, v] of Object.entries(MEETING_CODE_MAP)) {
    if (trimmed.startsWith(k)) return v;
  }
  return null;
}

// ── p1-p5 → 规范姓名 ──
const PERSON_CANONICAL = {
  p1: '永邦',
  p2: '赵一濛',
  p3: '王丽',          // 4 月场 p3, 推断 = 3/31「成员乙」
  p4: '成员甲',         // 仅 3/31, 名字未在转写出现
  p5: '洱海',           // 仅 4 月场
};

// ── 状态映射 ──
function mapCommitState(s) {
  switch ((s ?? '').trim()) {
    case 'on-track':     return 'on_track';
    case 'in-progress':  return 'on_track'; // 表里没 in_progress 枚举，用 on_track 兜底
    case 'at-risk':      return 'at_risk';
    case 'done':         return 'done';
    case 'slipped':      return 'slipped';
    default:             return 'on_track';
  }
}

function mapOpenQuestionStatus(s) {
  switch ((s ?? '').trim()) {
    case 'open':                 return 'open';
    case 'assigned':             return 'assigned';
    case 'chronic':              return 'chronic';
    case 'resolved':             return 'resolved';
    case 'partially_resolved':   return 'open';   // 表枚举无 partial → 暂归 open
    default:                     return 'open';
  }
}

function mapVerificationState(raw) {
  const t = (raw ?? '').trim();
  if (t.startsWith('已验证'))                         return 'confirmed';
  if (t.startsWith('部分验证'))                       return 'verifying';
  if (t.startsWith('测试中') || t.startsWith('待验证')) return 'verifying';
  if (t.startsWith('未验证'))                         return 'unverified';
  if (t.startsWith('已证伪'))                         return 'falsified';
  return 'unverified';
}

function mapNecessityVerdict(verdict) {
  const t = (verdict ?? '').trim();
  if (t.includes('不可缩减'))         return 'needed';
  if (t.includes('缩减') || t.includes('可异步'))  return 'partial';
  if (t.includes('async'))            return 'async_ok';
  return 'needed';
}

// "12 分 15 秒" / "23 分钟" / "119 分钟" / "~80 分钟" → 整数分钟
function parseDurationMin(text) {
  if (!text) return null;
  const m = String(text).match(/(\d+)\s*分/);
  return m ? Number(m[1]) : null;
}

// "2026-09-30" / "2026-04-30" / "1 个月窗口" / "—" / "持续" → ISO 或 null
function parseDateOrNull(s) {
  if (!s) return null;
  const t = String(s).trim();
  const m = t.match(/(20\d{2}[-/]\d{1,2}[-/]\d{1,2})/);
  if (m) return new Date(m[1].replace(/\//g, '-')).toISOString();
  return null;
}

// 0-1 → 0-100, 0-100 透传
function pctFromUnit(v) {
  if (v == null) return 0;
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return n <= 1.0 ? Math.round(n * 100 * 100) / 100 : Math.round(n * 100) / 100;
}

// ── 主流程 ──
const raw = JSON.parse(readFileSync(JSON_PATH, 'utf8'));
const client = new pg.Client({
  host: env.DB_HOST, port: +env.DB_PORT, database: env.DB_NAME,
  user: env.DB_USER, password: env.DB_PASSWORD,
});
await client.connect();

const summary = {};
function bump(key, n = 1) { summary[key] = (summary[key] ?? 0) + n; }

try {
  // ============================================================
  // Step 0: 确保两场 meeting asset 存在
  // ============================================================
  const exists = await client.query(
    `SELECT id FROM assets WHERE id = ANY($1::text[])`,
    [[MEETING_KICKOFF_ID, MEETING_APRIL_ID]],
  );
  const have = new Set(exists.rows.map((r) => r.id));
  if (!have.has(MEETING_APRIL_ID)) {
    const aprilMeta = {
      occurred_at: '2026-04-15T10:05:07+08:00',
      meeting_kind: 'workshop',
      duration_min: 119,
      participants: ['p1','p2','p3','p5'].map((pid) => ({
        id: pid,
        name: PERSON_CANONICAL[pid],
      })),
    };
    await client.query(
      `INSERT INTO assets (id, type, title, content, content_type, metadata)
         VALUES ($1, 'meeting_note', $2, '', 'meeting_note', $3::jsonb)`,
      [MEETING_APRIL_ID, '上海汇聚 AI 项目 · B 点研讨首轮', JSON.stringify(aprilMeta)],
    );
    console.log(`[step0] CREATED april meeting asset ${MEETING_APRIL_ID}`);
    bump('assets_created');
  } else {
    console.log(`[step0] april meeting asset already exists`);
  }

  // ============================================================
  // Step 1: upsert mn_people (p1-p5)
  // ============================================================
  const personId = {}; // pId → mn_people.id
  for (const [pid, canonical] of Object.entries(PERSON_CANONICAL)) {
    const sel = await client.query(
      `SELECT id FROM mn_people WHERE canonical_name = $1 AND COALESCE(org,'') = ''`,
      [canonical],
    );
    if (sel.rows[0]?.id) {
      personId[pid] = sel.rows[0].id;
    } else {
      const ins = await client.query(
        `INSERT INTO mn_people (canonical_name, role)
           VALUES ($1, $2) RETURNING id`,
        [canonical, raw.people.peopleStats.find((p) => p.who === pid)?.note ? null : null],
      );
      personId[pid] = ins.rows[0].id;
      bump('people_created');
    }
  }
  console.log('[step1] mn_people 映射:', personId);

  const ALL_MEETING_IDS = [MEETING_KICKOFF_ID, MEETING_APRIL_ID];

  // ============================================================
  // Step 1.5: upsert mn_scopes + mn_scope_members
  //   - getMeetingAxes 的 risks 查询必须经 mn_scope_members → scope_id 才能命中
  //   - 没有 scope 关联时前端 projects 轴 risks 列恒空
  // ============================================================
  let scopeId;
  {
    const sel = await client.query(
      `SELECT id FROM mn_scopes WHERE kind='project' AND slug=$1`,
      [PROJECT_SLUG],
    );
    if (sel.rows[0]?.id) {
      scopeId = sel.rows[0].id;
    } else {
      const ins = await client.query(
        `INSERT INTO mn_scopes (kind, slug, name, description, metadata)
           VALUES ('project', $1, $2, $3, $4::jsonb) RETURNING id`,
        [
          PROJECT_SLUG, PROJECT_NAME,
          '上海汇聚 AI 元年项目: kickoff (2026-03-31) + B 点研讨首轮 (2026-04-XX)',
          JSON.stringify({ src: 'sh-ai-axes-all.json', meta: raw._meta ?? null }),
        ],
      );
      scopeId = ins.rows[0].id;
      bump('scopes_created');
    }
    for (const mid of [MEETING_KICKOFF_ID, MEETING_APRIL_ID]) {
      await client.query(
        `INSERT INTO mn_scope_members (scope_id, meeting_id) VALUES ($1, $2)
         ON CONFLICT (scope_id, meeting_id) DO NOTHING`,
        [scopeId, mid],
      );
    }
    console.log(`[step1.5] mn_scopes id=${scopeId}, members=2`);
  }

  // ============================================================
  // Step 2: 清空两场会议在 axis 表的旧数据（幂等重算）
  // ============================================================
  console.log('[step2] 清空两场 meeting 的旧 axis 数据...');
  const wipes = [
    [`DELETE FROM mn_commitments WHERE meeting_id = ANY($1::uuid[])`, [ALL_MEETING_IDS]],
    [`DELETE FROM mn_role_trajectory_points WHERE meeting_id = ANY($1::uuid[])`, [ALL_MEETING_IDS]],
    [`DELETE FROM mn_speech_quality WHERE meeting_id = ANY($1::uuid[])`, [ALL_MEETING_IDS]],
    [`DELETE FROM mn_silence_signals WHERE meeting_id = ANY($1::uuid[])`, [ALL_MEETING_IDS]],
    [`DELETE FROM mn_decisions WHERE meeting_id = ANY($1::uuid[])`, [ALL_MEETING_IDS]],
    [`DELETE FROM mn_assumptions WHERE meeting_id = ANY($1::uuid[])`, [ALL_MEETING_IDS]],
    [`DELETE FROM mn_open_questions WHERE first_raised_meeting_id = ANY($1::uuid[]) OR last_raised_meeting_id = ANY($1::uuid[])`, [ALL_MEETING_IDS]],
    // mn_risks: 没有 meeting_id 列；按 scope_id 清（保证幂等不重复）
    [`DELETE FROM mn_risks WHERE scope_id = $1`, [scopeId]],
    [`DELETE FROM mn_judgments WHERE abstracted_from_meeting_id = ANY($1::uuid[])`, [ALL_MEETING_IDS]],
    [`DELETE FROM mn_mental_model_invocations WHERE meeting_id = ANY($1::uuid[])`, [ALL_MEETING_IDS]],
    [`DELETE FROM mn_cognitive_biases WHERE meeting_id = ANY($1::uuid[])`, [ALL_MEETING_IDS]],
    [`DELETE FROM mn_counterfactuals WHERE meeting_id = ANY($1::uuid[])`, [ALL_MEETING_IDS]],
    [`DELETE FROM mn_evidence_grades WHERE meeting_id = ANY($1::uuid[])`, [ALL_MEETING_IDS]],
    [`DELETE FROM mn_decision_quality WHERE meeting_id = ANY($1::uuid[])`, [ALL_MEETING_IDS]],
    [`DELETE FROM mn_meeting_necessity WHERE meeting_id = ANY($1::uuid[])`, [ALL_MEETING_IDS]],
    [`DELETE FROM mn_affect_curve WHERE meeting_id = ANY($1::uuid[])`, [ALL_MEETING_IDS]],
  ];
  for (const [sql, args] of wipes) {
    try {
      const r = await client.query(sql, args);
      if (r.rowCount > 0) console.log(`  - ${sql.slice(12, 60)}... → ${r.rowCount} rows`);
    } catch (e) {
      console.warn(`  ! ${sql.slice(12, 60)}... → ${e.message}`);
    }
  }

  // ============================================================
  // Step 3: People axis
  // ============================================================
  console.log('\n[step3] people axis');

  // 3.1 commitments
  for (const c of raw.people.commitments) {
    const pid = personId[c.who];
    const mid = meetingIdFromCode(c.meeting);
    if (!pid || !mid) { bump('commitments_skipped'); continue; }
    await client.query(
      `INSERT INTO mn_commitments (meeting_id, person_id, text, due_at, state, progress, evidence_refs)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
      [
        mid,
        pid,
        c.what,
        parseDateOrNull(c.due),
        mapCommitState(c.state),
        pctFromUnit(c.progress),
        JSON.stringify({
          src_id: c.id,
          due_raw: c.due ?? null,
          state_raw: c.state ?? null,
          note: c.note ?? null,
        }),
      ],
    );
    bump('commitments_inserted');
  }

  // 3.2 role_trajectory_points / speech_quality / silence_signals from peopleStats
  for (const ps of raw.people.peopleStats) {
    const pid = personId[ps.who];
    if (!pid) continue;

    const attendedMeetings = []; // [meeting_id]
    for (const t of (ps.roleTrajectory ?? [])) {
      const mid = meetingIdFromCode(t.m);
      if (!mid) continue;
      const role = t.role ?? '';
      // role_trajectory_points: 即便缺席也记录（可作为缺席信号），role_label 直接用 中文
      await client.query(
        `INSERT INTO mn_role_trajectory_points (person_id, meeting_id, role_label, confidence)
           VALUES ($1, $2, $3, $4)
         ON CONFLICT (person_id, meeting_id, scope_id) DO UPDATE
           SET role_label = EXCLUDED.role_label`,
        [pid, mid, role.slice(0, 60), 0.8],
      );
      bump('role_trajectory_inserted');
      if (!role.includes('缺席')) attendedMeetings.push(mid);
    }

    // speech_quality: peopleStats 是跨会议聚合 → 复制到所有出席场次
    const entropyPct = pctFromUnit(ps.speechHighEntropy);
    const followups  = Number.isFinite(+ps.beingFollowedUp) ? +ps.beingFollowedUp : 0;
    const qualityScore = Math.round((entropyPct * 0.6 + Math.min(followups, 30) / 30 * 100 * 0.4) * 100) / 100;
    for (const mid of attendedMeetings) {
      await client.query(
        `INSERT INTO mn_speech_quality (meeting_id, person_id, entropy_pct, followed_up_count, quality_score, sample_quotes)
           VALUES ($1, $2, $3, $4, $5, $6::jsonb)
         ON CONFLICT (meeting_id, person_id) DO UPDATE SET
           entropy_pct = EXCLUDED.entropy_pct,
           followed_up_count = EXCLUDED.followed_up_count,
           quality_score = EXCLUDED.quality_score,
           sample_quotes = EXCLUDED.sample_quotes`,
        [
          mid, pid,
          entropyPct, followups, qualityScore,
          JSON.stringify({
            name_in_json: ps.name ?? null,
            fulfillment: ps.fulfillment ?? null,
            avg_latency: ps.avgLatency ?? null,
            claims: ps.claims ?? null,
            follow_through_grade: ps.followThroughGrade ?? null,
            note: ps.note ?? null,
          }),
        ],
      );
      bump('speech_quality_inserted');
    }

    // silence_signals: silentOnTopics → 写入到 attended 场次
    const topics = Array.isArray(ps.silentOnTopics) ? ps.silentOnTopics : [];
    for (const mid of attendedMeetings) {
      for (const topic of topics) {
        if (!topic || /几乎全部/.test(topic)) continue; // 缺席总览不当具体 topic
        const topicId = topic.slice(0, 80);
        await client.query(
          `INSERT INTO mn_silence_signals (meeting_id, person_id, topic_id, state, anomaly_score)
             VALUES ($1, $2, $3, 'abnormal_silence', $4)
           ON CONFLICT (meeting_id, person_id, topic_id) DO UPDATE
             SET state = EXCLUDED.state, anomaly_score = EXCLUDED.anomaly_score`,
          [mid, pid, topicId, 70.00],
        );
        bump('silence_signals_inserted');
      }
    }
  }

  // ============================================================
  // Step 4: Projects axis
  // ============================================================
  console.log('\n[step4] projects axis');

  // 4.1 decisions（两遍：先全量插入拿 UUID，再回填 superseded_by）
  const decisionUuidByCode = {}; // "D-01" → uuid
  for (const d of raw.projects.decisionChain) {
    const mid = meetingIdFromCode(d.at);
    const proposerId = personId[d.who] ?? null;
    if (!mid) { bump('decisions_skipped'); continue; }
    const ins = await client.query(
      `INSERT INTO mn_decisions
         (scope_id, meeting_id, title, proposer_person_id, confidence, is_current, rationale, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
         RETURNING id`,
      [
        scopeId,
        mid,
        (d.title ?? '').slice(0, 400),
        proposerId,
        Number(d.confidence ?? 0.5),
        d.superseded === true ? false : true,
        d.basedOn ?? null,
        JSON.stringify({
          src_id: d.id,
          based_on_text: d.basedOn ?? null,
          superseded_by_code: d.supersededBy ?? null,
          note: d.note ?? null,
          marked_current_in_json: d.current === true,
        }),
      ],
    );
    decisionUuidByCode[d.id] = ins.rows[0].id;
    bump('decisions_inserted');
  }
  // 第二遍：回填 superseded_by
  for (const d of raw.projects.decisionChain) {
    if (!d.supersededBy) continue;
    const fromId = decisionUuidByCode[d.id];
    const toId   = decisionUuidByCode[d.supersededBy];
    if (fromId && toId) {
      await client.query(
        `UPDATE mn_decisions SET superseded_by_id = $2 WHERE id = $1`,
        [fromId, toId],
      );
      bump('decisions_superseded_linked');
    }
  }

  // 4.2 assumptions
  for (const a of raw.projects.assumptions) {
    const mid = meetingIdFromCode(a.introducedAt);
    const verifierId = personId[a.verifier] ?? null;
    if (!mid) { bump('assumptions_skipped'); continue; }
    const underpinUuids = (a.underpins ?? [])
      .map((dCode) => decisionUuidByCode[dCode])
      .filter(Boolean);
    const grade = ['A','B','C','D'].includes(a.evidenceGrade) ? a.evidenceGrade : 'C';
    await client.query(
      `INSERT INTO mn_assumptions
         (scope_id, meeting_id, text, evidence_grade, verification_state, verifier_person_id,
          due_at, underpins_decision_ids, confidence, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::uuid[], $9, $10::jsonb)`,
      [
        scopeId,
        mid,
        a.text,
        grade,
        mapVerificationState(a.verificationState),
        verifierId,
        parseDateOrNull(a.verifyDue),
        underpinUuids,
        Number(a.confidence ?? 0.5),
        JSON.stringify({
          src_id: a.id,
          underpins_codes: a.underpins ?? [],
          verifier_code: a.verifier ?? null,
          verify_due_raw: a.verifyDue ?? null,
          verification_state_raw: a.verificationState ?? null,
          author_code: a.by ?? null,
          note: a.note ?? null,
        }),
      ],
    );
    bump('assumptions_inserted');
  }

  // 4.3 open_questions
  for (const q of raw.projects.openQuestions) {
    const firstMid = meetingIdFromCode(q.raisedAt);
    const lastMid  = meetingIdFromCode(q.lastRaised);
    const ownerId  = (q.owner && q.owner !== '—') ? (personId[q.owner] ?? null) : null;
    await client.query(
      `INSERT INTO mn_open_questions
         (scope_id, text, category, status, times_raised, first_raised_meeting_id,
          last_raised_meeting_id, owner_person_id, due_at, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)`,
      [
        scopeId,
        q.text,
        q.category ?? 'operational',
        mapOpenQuestionStatus(q.status),
        Number(q.timesRaised ?? 1),
        firstMid,
        lastMid,
        ownerId,
        parseDateOrNull(q.due),
        JSON.stringify({
          src_id: q.id,
          status_raw: q.status ?? null,
          owner_code: q.owner ?? null,
          by_code: q.by ?? null,
          due_raw: q.due ?? null,
          note: q.note ?? null,
        }),
      ],
    );
    bump('open_questions_inserted');
  }

  // 4.4 risks（必须带 scope_id, 否则 engine /meetings/:id/axes 查不到）
  for (const r of raw.projects.risks) {
    const sev = ['low','med','high','critical'].includes(r.severity) ? r.severity : 'med';
    const trend = ['up','flat','down'].includes(r.trend) ? r.trend : 'flat';
    await client.query(
      `INSERT INTO mn_risks
         (scope_id, text, severity, mention_count, heat_score, trend, action_taken, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
      [
        scopeId,
        r.text,
        sev,
        Number(r.mentions ?? 1),
        pctFromUnit(r.heat),
        trend,
        r.hasAction === true,
        JSON.stringify({
          src_id: r.id,
          meetings_seen: r.meetings ?? null,
          action_text: r.action ?? null,
          note: r.note ?? null,
        }),
      ],
    );
    bump('risks_inserted');
  }

  // ============================================================
  // Step 5: Knowledge axis
  // ============================================================
  console.log('\n[step5] knowledge axis');

  // 5.1 reusable judgments → mn_judgments
  for (const j of raw.knowledge.reusableJudgments) {
    const linkedUuids = (j.linkedMeetings ?? []).map(meetingIdFromCode).filter(Boolean);
    const abstractedFromUuid = linkedUuids[0] ?? MEETING_KICKOFF_ID;
    const authorId = personId[j.author] ?? null;
    await client.query(
      `INSERT INTO mn_judgments
         (text, abstracted_from_meeting_id, author_person_id, domain,
          generality_score, reuse_count, linked_meeting_ids, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7::uuid[], $8::jsonb)`,
      [
        j.text,
        abstractedFromUuid,
        authorId,
        (j.domain ?? '').slice(0, 80),
        Number(j.generalityScore ?? 0.5),
        Number(j.reuseCount ?? 0),
        linkedUuids,
        JSON.stringify({
          src_id: j.id,
          abstracted_from_text: j.abstractedFrom ?? null,
          author_code: j.author ?? null,
          linked_meetings_codes: j.linkedMeetings ?? [],
        }),
      ],
    );
    bump('judgments_inserted');
  }

  // 5.2 mental_model_invocations
  // mentalModels 在 JSON 是「跨两场聚合」字段；engine 里 axes API 按 meeting_id 过滤，
  // 单挂 kickoff 会让 4 月场页面「心智模型」列空白 → 同一行复制写到两场会议
  for (const m of raw.knowledge.mentalModels) {
    const byId = (m.invokedBy && m.invokedBy !== '—') ? (personId[m.invokedBy] ?? null) : null;
    for (const mid of [MEETING_KICKOFF_ID, MEETING_APRIL_ID]) {
      await client.query(
        `INSERT INTO mn_mental_model_invocations
           (meeting_id, model_name, invoked_by_person_id, correctly_used, outcome, expert_source, confidence)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          mid,
          (m.name ?? '').slice(0, 120),
          byId,
          m.correctly === true ? true : (m.correctly === false ? false : null),
          m.outcome ?? null,
          (m.expert && m.expert !== '—') ? String(m.expert).slice(0, 80) : null,
          Number.isFinite(+m.invokedCount) ? Math.min(1, +m.invokedCount / 7) : 0.5,
        ],
      );
      bump('mental_models_inserted');
    }
  }

  // 5.3 cognitive_biases —— 与 mental_models 同理：JSON 是跨场聚合，复制写到两场
  for (const b of raw.knowledge.cognitiveBiases) {
    const byId = Array.isArray(b.by) && b.by.length > 0 ? (personId[b.by[0]] ?? null) : null;
    const sev = ['low','med','high'].includes(b.severity) ? b.severity : 'med';
    const mitigated = b.mitigated === true || b.mitigated === 'partial';
    for (const mid of [MEETING_KICKOFF_ID, MEETING_APRIL_ID]) {
      await client.query(
        `INSERT INTO mn_cognitive_biases
           (meeting_id, bias_type, where_excerpt, by_person_id, severity, mitigated, mitigation_strategy)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          mid,
          (b.name ?? '').slice(0, 60),
          b.where ?? null,
          byId,
          sev,
          mitigated,
          (b.mitigation && b.mitigation !== '—') ? b.mitigation : null,
        ],
      );
      bump('cognitive_biases_inserted');
    }
  }

  // 5.4 counterfactuals
  for (const cf of raw.knowledge.counterfactuals) {
    const mid = meetingIdFromCode(cf.rejectedAt) ?? MEETING_KICKOFF_ID;
    const byId = Array.isArray(cf.rejectedBy) && cf.rejectedBy.length > 0
      ? (personId[cf.rejectedBy[0]] ?? null) : null;
    await client.query(
      `INSERT INTO mn_counterfactuals
         (meeting_id, rejected_path, rejected_by_person_id, tracking_note, next_validity_check_at)
         VALUES ($1, $2, $3, $4, $5)`,
      [
        mid,
        cf.path,
        byId,
        cf.trackingNote ?? null,
        parseDateOrNull(cf.validityCheckAt),
      ],
    );
    bump('counterfactuals_inserted');
  }

  // 5.5 evidence_grades —— 按 examples 文本归属粗略拆分到两场
  // 简化策略：60/40 拆分给 kickoff / april
  const grades = raw.knowledge.evidenceGrades ?? [];
  const distAll = { A: 0, B: 0, C: 0, D: 0 };
  for (const g of grades) {
    const letter = (g.grade ?? '').match(/^[ABCD]/)?.[0];
    if (letter && Number.isFinite(+g.count)) distAll[letter] = +g.count;
  }
  const split = (n) => {
    const k = Math.round(n * 0.6);
    return [k, n - k];
  };
  const [aK, aA] = split(distAll.A);
  const [bK, bA] = split(distAll.B);
  const [cK, cA] = split(distAll.C);
  const [dK, dA] = split(distAll.D);
  const score = (a, b, c, d) => {
    const total = a + b + c + d;
    if (total === 0) return 0;
    return Math.round((4 * a + 3 * b + 2 * c + 1 * d) / total * 100) / 100;
  };
  for (const [mid, a, b, c, d] of [
    [MEETING_KICKOFF_ID, aK, bK, cK, dK],
    [MEETING_APRIL_ID,   aA, bA, cA, dA],
  ]) {
    await client.query(
      `INSERT INTO mn_evidence_grades (meeting_id, dist_a, dist_b, dist_c, dist_d, weighted_score)
         VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (meeting_id) DO UPDATE SET
         dist_a = EXCLUDED.dist_a, dist_b = EXCLUDED.dist_b,
         dist_c = EXCLUDED.dist_c, dist_d = EXCLUDED.dist_d,
         weighted_score = EXCLUDED.weighted_score, computed_at = NOW()`,
      [mid, a, b, c, d, score(a, b, c, d)],
    );
    bump('evidence_grades_inserted');
  }

  // ============================================================
  // Step 6: Meta axis
  // ============================================================
  console.log('\n[step6] meta axis');
  for (const m of raw.meta.perMeeting) {
    const mid = meetingIdFromCode(m.meeting);
    if (!mid) { bump('meta_skipped'); continue; }

    // decision_quality
    const dq = m.decisionQuality ?? {};
    const dims = Array.isArray(dq.dims) ? dq.dims : [];
    const get = (id) => dims.find((x) => x.id === id)?.score ?? 0;
    const notesObj = Object.fromEntries(dims.map((x) => [x.id, x.note ?? '']));
    await client.query(
      `INSERT INTO mn_decision_quality
         (meeting_id, overall, clarity, actionable, traceable, falsifiable, aligned, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
      [
        mid,
        Number(dq.overall ?? 0),
        Number(get('clarity')),
        Number(get('actionable')),
        Number(get('traceable')),
        Number(get('falsifiable')),
        Number(get('aligned')),
        JSON.stringify(notesObj),
      ],
    );
    bump('decision_quality_inserted');

    // meeting_necessity
    const nc = m.necessity ?? {};
    await client.query(
      `INSERT INTO mn_meeting_necessity
         (meeting_id, verdict, suggested_duration_min, reasons)
         VALUES ($1, $2, $3, $4::jsonb)`,
      [
        mid,
        mapNecessityVerdict(nc.verdict),
        parseDurationMin(nc.verdict),
        JSON.stringify(nc.reasons ?? []),
      ],
    );
    bump('meeting_necessity_inserted');

    // affect_curve (samples: t→t_sec*60)
    const samples = (m.emotionCurve ?? []).map((s) => ({
      t_sec: Math.round(Number(s.t ?? 0) * 60),
      valence: Number(s.v ?? 0),
      intensity: Number(s.i ?? 0),
      tag: s.tag ?? null,
    }));
    const tensionPeaks = samples
      .filter((s) => s.valence < 0)
      .sort((a, b) => a.valence - b.valence)
      .slice(0, 3)
      .map((s) => ({ t_sec: s.t_sec, valence: s.valence, tag: s.tag }));
    const insightPoints = samples
      .filter((s) => s.tag && /(认同|认可|演示|demo|启动|共识|长系统)/.test(s.tag))
      .map((s) => ({ t_sec: s.t_sec, tag: s.tag }));
    await client.query(
      `INSERT INTO mn_affect_curve
         (meeting_id, samples, tension_peaks, insight_points)
         VALUES ($1, $2::jsonb, $3::jsonb, $4::jsonb)`,
      [
        mid,
        JSON.stringify(samples),
        JSON.stringify(tensionPeaks),
        JSON.stringify(insightPoints),
      ],
    );
    bump('affect_curve_inserted');
  }

  // ============================================================
  // Step 7: 验证
  // ============================================================
  console.log('\n[step7] 验证');
  const verifyTables = [
    'mn_commitments', 'mn_role_trajectory_points', 'mn_speech_quality', 'mn_silence_signals',
    'mn_decisions', 'mn_assumptions', 'mn_open_questions', 'mn_risks',
    'mn_judgments', 'mn_mental_model_invocations', 'mn_cognitive_biases',
    'mn_counterfactuals', 'mn_evidence_grades',
    'mn_decision_quality', 'mn_meeting_necessity', 'mn_affect_curve',
  ];
  const verifyRows = [];
  for (const t of verifyTables) {
    const cols = await client.query(
      `SELECT column_name FROM information_schema.columns
         WHERE table_name = $1`,
      [t],
    );
    const colSet = new Set(cols.rows.map((r) => r.column_name));
    let where, args;
    if (colSet.has('meeting_id')) {
      where = 'meeting_id = ANY($1::uuid[])';
      args = [ALL_MEETING_IDS];
    } else if (colSet.has('first_raised_meeting_id')) {
      where = 'first_raised_meeting_id = ANY($1::uuid[]) OR last_raised_meeting_id = ANY($1::uuid[])';
      args = [ALL_MEETING_IDS];
    } else if (colSet.has('abstracted_from_meeting_id')) {
      where = 'abstracted_from_meeting_id = ANY($1::uuid[])';
      args = [ALL_MEETING_IDS];
    } else if (t === 'mn_risks') {
      where = `scope_id = $1`;
      args = [scopeId];
    } else {
      where = 'TRUE';
      args = [];
    }
    const r = await client.query(`SELECT count(*)::int AS n FROM ${t} WHERE ${where}`, args);
    verifyRows.push({ table: t, n: r.rows[0].n });
  }
  console.table(verifyRows);

  console.log('\n=== summary ===');
  console.table(Object.entries(summary).map(([k, v]) => ({ key: k, count: v })));
} catch (e) {
  console.error('[FATAL]', e);
  process.exitCode = 1;
} finally {
  await client.end();
}
