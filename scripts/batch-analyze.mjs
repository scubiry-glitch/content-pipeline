#!/usr/bin/env node
/**
 * batch-analyze.mjs
 * 本地 Claude CLI 逐场生成分析 → 写入 115 DB
 *
 * 用法: node scripts/batch-analyze.mjs [--start N] [--limit N] [--dry-run]
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import pg from 'pg';
import { execSync } from 'child_process';
import { randomUUID } from 'crypto';

// ---- 配置 ----
const DRY_RUN = process.argv.includes('--dry-run');
const START = parseInt(process.argv.find((a, i) => process.argv[i - 1] === '--start') || '0');
const LIMIT = parseInt(process.argv.find((a, i) => process.argv[i - 1] === '--limit') || '999');
const DB_HOST = '115.190.221.164';
const WORKSPACE_ID = '61307c1b-f493-45d2-803d-1250ad26c14c';
const OUTPUT_DIR = join(dirname(import.meta.url.replace('file://', '')), '..', 'tmp', 'analysis-json');
const CLAUDE_MODEL = 'sonnet';
const CLAUDE_TIMEOUT_MS = 1_800_000; // 30 min

// ---- Prompt 模板（精简版，与 claudeCliFullPipeline.ts 同款结构）----
// 读取 API 代码中的完整 prompt 模板
const PROMPT_TEMPLATE_PATH = join(
  '/Users/scubiry/Documents/Scubiry/lab/pipeline/api/src/modules/meeting-notes/runs/promptTemplates/claudeCliFullPipeline.ts'
);

import { jsonrepair } from 'jsonrepair';

// ---- 工具函数 ----
function buildPrompt(meetingId, title, transcript, participants) {
  const participantList = participants
    .map((p, i) => `  ${p.localId}: ${p.name}`)
    .join('\n');

  return `=== ROLE ===
你是会议纪要分析专家。读完整段转写后, 按下面给定的 JSON Schema 一次性输出
「会议纪要 + 多轴分析」单一 JSON 对象, 不要包含任何 prose、markdown 代码栅栏、解释性文本。
输出会被 JSON.parse 直接消费, 任何非法内容都会导致整个 run 失败。

=== 核心分析原则（7 条铁律 + 2 条执行纪律）===
1. 人物还原 — 从对话线索(互称、职责描述、被点名)推断每位说话人的真实身份和角色关系，绝不可保留"说话人1/2"
2. 张力深挖 — 每条张力必须有叙事性summary(谁在什么语境下说了什么，对方如何回应，结局如何)，加上「原话引用」
3. 认知跃迁 — 追踪"信念被当场推翻"的时刻: before(旧信念) → after(新信念) + trigger(谁用什么话术/证据打翻的)
4. 共识/分歧双轨 — 共识必须列 supportedBy 具体人物; 分歧必须结构化 sides(每方 stance + reason + by)
5. 原话为王 — 任何判断都引用转写中的原话(用「」)，不可编造或意译; 没有原文锚点的结论标注 [无原文证据]
6. 行业深度 — 涉及业务模式/战略/产品时，必须展开行业框架(客群细分/收入模型/金融产品/竞争格局等)
7. 元观察 — 评估会议形态: 谁主导节奏/跑题率/话语权不对等/情绪曲线/信息流方向

执行纪律:
  • calibrated_confidence — 给每个判断附上 confidence 0-1; 不确定的宁可写 0.5 + null, 不要伪装高置信度
  • single — 专家单视角输出, 不做内部多回合辩论

=== OUTPUT DISCIPLINE ===
严格 JSON, UTF-8, 能被 JSON.parse 直接吃。不要任何 markdown 代码块。
数字/专有名词/引用原文一律保留, 不做"行话化"包装; 分数保留 2 位小数。
人物 id 严格用 p1/p2/p3..., 与下方 participants 数组的 id 一致, 任何引用人物处都用这些 id, 不要写名字。
日期 ISO 8601 (YYYY-MM-DD); 未知用 null。

输出密度硬性最低 (除非会议明显短/平淡, 任何"内容不够"的偷懒都视为低质):
   - summary.tldr: 必填, ≤50字, 1句话, 主语+动词+时间锚, 让没参会的人 30 秒抓住结论
   - summary.scqa: 4 段必填, 每段≤80字, 必须形成 S→C→Q→A 因果链 (S→C 是触发, C→Q 推问题, Q→A 是回答)
   - summary.metrics: 5 个数字字段全部从已有 axes 反求, 严禁凭空生成或估算
   - tension: ≥5 条; 每条 moments ≥4 句原话 (照抄不许意译); summary ≥250 字, 分段写出至少两方立场, 内嵌引语
   - newCognition: ≥6 条; before/after 必须形成强对比, trigger 必须含 'pX:「原话」'
   - consensus + divergence 合计 ≥10 条; 每条都要 supportedBy 至少 1 人
   - crossView: ≥4 条; 每条 responses ≥2 个不同立场的人
   - axes.knowledge.cognitiveBiases: ≥6 条; 每条要 where 引用原文短句 + by 具体人物
   - axes.knowledge.mentalModels: ≥5 条; 每条要 invokedBy 具体人物 + 是否 correctlyUsed
   - axes.knowledge.reusableJudgments: ≥6 条; 每条 generalityScore
   - axes.knowledge.counterfactuals: ≥3 条
   - axes.projects.decisionChain: ≥3 条 (即使本场没拍板, 也要列出"在某假设下若如何则如何"的潜在决策)
   - axes.projects.assumptions: ≥4 条
   - axes.projects.openQuestions: ≥4 条
   - axes.projects.risks: ≥6 条
   - facts (SPO 三元组): ≥10 条; 每条必填 taxonomy_code
   - wikiMarkdown.sourceEntry 9 段齐全:
     一、决议 / 二、张力 / 三、共识 / 四、决策链(≥3) / 五、关键判断(≥4) /
     六、假设(≥3)+待决(≥3) / 七、心智模型(≥3) / 八、认知偏误(≥2) / 九、反事实(≥2)

任何"事件类"字段必须给原文 moments/quotes/where 锚点, ":「完整原话」" 格式;
   引文必须是转写里能逐字找到的字符串, 不可改写、不可省略主语、不可拼接。
不要编造数据。转写里没明确出现的字段填 null 或空数组。
   但: 数量下限是常态指标, 如果原文支撑不足则宁可少一条也不要"凑"。

=== OUTPUT SCHEMA ===
{
  "meeting": {
    "id": "${meetingId}",
    "title": "还原后的完整标题(含业务线和议题)",
    "date": "YYYY-MM-DD",
    "duration": N,
    "source": "feishu-minutes"
  },
  "participants": [{
    "id": "p1",
    "name": "从互称/职责/被点名还原真实姓名或称呼(绝不保留'说话人1/2')",
    "role": "还原的精确角色和职权",
    "initials": "XX",
    "tone": "neutral|warm|cool",
    "speakingPct": 0.0-1.0
  }],

  "analysis": {
    "summary": {
      "tldr": "≤50字, 1句话核心结论, 含主语+动词+时间锚",
      "scqa": {
        "situation": "背景 — 这次会议在什么大背景下开",
        "complication": "冲突 — 出现了什么变化/矛盾, 必须由 situation 推出",
        "question": "问题 — 因此要回答什么核心问题, 必须由 complication 推出",
        "answer": "答案 — 本次会议的回答, 与 decision 字段呼应"
      },
      "metrics": {
        "topicsCount": "N, 与 focusMap 主题去重后总数对齐",
        "decisionsCount": "N, 与 axes.projects.decisionChain.length 对齐",
        "openQuestionsCount": "N, 与 axes.projects.openQuestions.length 对齐",
        "chronicCount": "N, axes.projects.openQuestions 中 status='chronic' 的数量",
        "necessityVerdict": "needed|partial|async_ok"
      },
      "decision": "1-2句话主决议 (作为 SCQA.answer 的展开)",
      "actionItems": [{ "id": "A1", "who": "p1", "what": "具体的、可验证的承诺", "due": "YYYY-MM-DD或具体时间点" }],
      "risks": ["R1 · 短描述 — pX:「原话引用」"]
    },
    "tension": [{
      "id": "T1",
      "between": ["p1","p2"],
      "topic": "张力核心议题(具体到立场冲突)",
      "intensity": 0.0-1.0,
      "summary": "≥250字叙事, 分段呈现至少两方立场, 含原文短引用穿插",
      "moments": ["p1:「完整原话1」", "p2:「完整原话2」", "p1:「完整原话3」", "p2:「完整原话4 — 关键转折点」"]
    }],
    "newCognition": [{
      "id": "N1",
      "who": "p1",
      "before": "会前/初始信念, 完整一句话",
      "after": "更新后信念, 完整一句话, 与 before 形成强对比",
      "trigger": "触发更新的事件/数据/论点, 必须含原话引用 'pX:「...」'"
    }],
    "focusMap": [{
      "who": "p1",
      "themes": ["主题1", "主题2", "主题3", "主题4"],
      "returnsTo": 5
    }],
    "consensus": [{
      "id": "C1",
      "kind": "consensus",
      "text": "达成的共识内容(具体)",
      "supportedBy": ["p1","p2"],
      "sides": []
    }, {
      "id": "D1",
      "kind": "divergence",
      "text": "分歧的核心议题",
      "supportedBy": [],
      "sides": [{
        "stance": "立场A",
        "reason": "论据(引用原话)",
        "by": ["p1"]
      }, {
        "stance": "立场B",
        "reason": "论据(引用原话)",
        "by": ["p2"]
      }]
    }],
    "crossView": [{
      "id": "V1",
      "claimBy": "p1",
      "claim": "此人抛出的核心主张(含原话引用)",
      "responses": [{
        "who": "p2",
        "stance": "support|partial|against|neutral",
        "text": "回应内容(含原话引用)"
      }, {
        "who": "p3",
        "stance": "support|partial|against|neutral",
        "text": "回应内容(含原话引用)"
      }]
    }]
  },

  "axes": {
    "people": {
      "axis": "people",
      "commitments": [{ "id": "K-A1", "who": "p1", "what": "承诺(具体可验证)", "due_at": "YYYY-MM-DD", "state": "on_track|at_risk|done|slipped", "progress": 0.0-1.0 }],
      "peopleStats": [{ "who": "p1", "speechHighEntropy": 0.0-1.0, "beingFollowedUp": 0, "silentOnTopics": [], "roleThisMeeting": "提出者|质疑者|决策者|执行者|旁观者" }]
    },
    "projects": {
      "project": { "id": "${meetingId}", "name": "${title}", "status": "active", "meetings": 1, "decisions": 0, "openItems": 0 },
      "decisionChain": [{ "id": "D1", "what": "决策内容(具体)", "who": "p1", "when": "YYYY-MM-DD", "rationale": "理由(含原话佐证)", "superseded": false }],
      "assumptions": [{ "id": "A1", "text": "假设内容(标注是谁的假设)", "evidenceGrade": "A|B|C|D", "verificationState": "unverified|confirmed|falsified", "firstRaisedBy": "p1" }],
      "openQuestions": [{ "id": "Q1", "text": "待解问题(标注谁提出)", "status": "open|assigned|chronic|resolved", "category": "strategic|analytical|governance|operational", "firstAskedBy": "p1" }],
      "risks": [{ "id": "R1", "text": "风险描述(含原话佐证)", "severity": "high|medium|low", "trend": "increasing|stable|decreasing", "firstRaisedBy": "p1" }]
    },
    "knowledge": {
      "axis": "knowledge",
      "reusableJudgments": [{ "id": "J1", "judgment": "可复用的商业判断(非本场特有)", "context": "适用场景", "confidence": 0.8, "generalityScore": 0.0-1.0, "domain": "领域", "evidence": "证据(含原话)", "linked_meeting_ids": ["${meetingId}"] }],
      "mentalModels": [{ "id": "M1", "model": "思维模型名(如二阶效应/漏斗模型/品牌矩阵)", "invokedBy": "p1", "application": "如何应用(含原话)", "correctlyUsed": true|false|null, "effectiveness": 0.7, "expert": "外部案例来源" }],
      "evidenceGrades": [
        { "grade": "A", "label": "硬数据", "count": 0, "examples": [] },
        { "grade": "B", "label": "类比/案例", "count": 0, "examples": [] },
        { "grade": "C", "label": "直觉/口述", "count": 0, "examples": [] },
        { "grade": "D", "label": "道听途说", "count": 0, "examples": [] }
      ],
      "cognitiveBiases": [{ "id": "B1", "bias": "偏差名(如确认偏差/锚定效应/幸存者偏差)", "where": "原文短句引用", "by": ["p1"], "severity": "high|medium|low", "mitigated": false, "mitigation": "纠正建议" }],
      "counterfactuals": [{ "id": "CF1", "path": "被否决的路径(如'如果走X方案')", "rejectedAt": "决策点描述", "rejectedBy": ["p1"], "thenClause": "那么会...", "trackingNote": "跟踪备注", "validityCheckAt": null }]
    },
    "meta": {
      "axis": "meta",
      "decisionQuality": { "overall": 0.0-1.0, "dims": { "clarity": 0.0-1.0, "actionable": 0.0-1.0, "traceable": 0.0-1.0, "falsifiable": 0.0-1.0, "aligned": 0.0-1.0 } },
      "necessity": { "verdict": "needed|partial|async_ok", "score": 0.0-1.0, "reasons": ["理由(含原话)"] },
      "emotionCurve": [{ "t": 5, "valence": -1.0-1.0, "intensity": 0.0-1.0 }]
    },
    "tension": [{ "id": "T1", "between": ["p1","p2"], "topic": "...", "intensity": 0.7, "summary": "...", "moments": ["p1:「原话」"] }]
  },

  "facts": [{ "subject": "实体", "predicate": "关系", "object": "值", "context": "上下文(含原话)", "confidence": 0.9, "taxonomy_code": "XX.XX" }],
  "wikiMarkdown": {
    "sourceEntry": { "title": "${title}", "summary": "摘要", "keyTakeaways": ["要点1"] },
    "entityUpdates": [{ "name": "实体名", "type": "person|org|concept|product", "initialContent": "描述", "blockContent": "详细内容" }]
  }
}

=== TASK ===
meetingId: ${meetingId}
meetingTitle: ${title}

participants (localId → name 映射, 输出中所有人物 id 必须用这些 localId):
${participantList}

=== TRANSCRIPT ===
${transcript}

=== OUTPUT ===
请输出单一 JSON 对象。
注意: meeting.id 必须等于 "${meetingId}"。不要包含任何 markdown 代码栅栏。
现在开始输出 JSON:`;
}

async function runClaudeCli(prompt) {
  const tmpFile = join(OUTPUT_DIR, `prompt-${Date.now()}.txt`);
  const outFile = join(OUTPUT_DIR, `output-${Date.now()}.json`);

  writeFileSync(tmpFile, prompt, 'utf-8');

  try {
    const cmd = `claude -p --model ${CLAUDE_MODEL} --max-turns 1 --output-format json < "${tmpFile}" > "${outFile}"`;
    execSync(cmd, {
      timeout: CLAUDE_TIMEOUT_MS,
      maxBuffer: 50 * 1024 * 1024,
    });

    const raw = readFileSync(outFile, 'utf-8');
    return parseInnerJson(raw);
  } catch (e) {
    // Try reading partial output
    try {
      const raw = readFileSync(outFile, 'utf-8');
      return parseInnerJson(raw);
    } catch {
      throw e;
    }
  }
}

function parseInnerJson(text) {
  let parsed = null;

  // If it's a Claude CLI result wrapper, extract the .result field
  try {
    const wrapper = JSON.parse(text);
    if (wrapper.type === 'result' && typeof wrapper.result === 'string') {
      text = wrapper.result;
    } else if (wrapper.type === 'result' && typeof wrapper.result === 'object') {
      parsed = wrapper.result; // Already parsed JSON (could be array or object)
    }
  } catch {
    // Not a wrapper, try parsing as-is
  }

  if (!parsed) {
    // Strip markdown fences
    let s = text.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
    // Find first { or [ to last } or ]
    const objStart = s.indexOf('{');
    const arrStart = s.indexOf('[');
    let start, end;
    if (objStart >= 0 && (arrStart < 0 || objStart < arrStart)) {
      start = objStart;
      end = s.lastIndexOf('}');
    } else if (arrStart >= 0) {
      start = arrStart;
      end = s.lastIndexOf(']');
    }
    if (start >= 0 && end > start) {
      s = s.slice(start, end + 1);
    }

    // Try direct parse
    try {
      parsed = JSON.parse(s);
    } catch {
      try {
        parsed = JSON.parse(jsonrepair(s));
      } catch {
        try {
          parsed = JSON.parse(fixUnescapedQuotes(s));
        } catch (e) {
          console.log(`  JSON repair failed: ${e.message?.slice(0, 100)}`);
          throw e;
        }
      }
    }
  }

  // If result is an array of objects, merge them into one
  if (Array.isArray(parsed)) {
    console.log(`  ⚠ LLM returned array (${parsed.length} items), merging...`);
    const merged = {};
    for (const item of parsed) {
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        for (const [k, v] of Object.entries(item)) {
          // If key already exists, make it an array of values
          if (k in merged) {
            if (!Array.isArray(merged[k])) merged[k] = [merged[k]];
            merged[k].push(v);
          } else {
            merged[k] = v;
          }
        }
      }
    }
    return merged;
  }

  return parsed;
}

// Fix unescaped quotes in JSON string values by re-encoding
function fixUnescapedQuotes(jsonStr) {
  // Strategy: walk through the string char by char, tracking whether we're inside a string value
  let result = '';
  let inString = false;
  let escapeNext = false;

  for (let i = 0; i < jsonStr.length; i++) {
    const ch = jsonStr[i];

    if (escapeNext) {
      result += ch;
      escapeNext = false;
      continue;
    }

    if (ch === '\\') {
      result += ch;
      escapeNext = true;
      continue;
    }

    if (ch === '"') {
      if (!inString) {
        // Starting a string
        inString = true;
        result += ch;
      } else {
        // Could be end of string or unescaped quote inside string
        // Look ahead: if next non-whitespace char is : or , or } or ], it's end of string
        let j = i + 1;
        while (j < jsonStr.length && jsonStr[j] === ' ') j++;
        if (j < jsonStr.length && [':', ',', '}', ']'].includes(jsonStr[j])) {
          // End of string
          inString = false;
          result += ch;
        } else {
          // Unescaped quote inside string - escape it
          result += '\\"';
        }
      }
    } else {
      result += ch;
    }
  }
  return result;
}

// ---- Persist 逻辑 ----
async function resolvePeople(client, meetingId, participants, workspaceId) {
  const personMap = {}; // localId -> person UUID
  for (const p of participants) {
    // Try to find existing person by name
    const { rows } = await client.query(
      `SELECT id FROM mn_people WHERE canonical_name = $1 AND workspace_id = $2 LIMIT 1`,
      [p.name, workspaceId]
    );
    if (rows.length > 0) {
      personMap[p.id] = rows[0].id;
    } else {
      // Create new person
      const insertResult = await client.query(
        `INSERT INTO mn_people (id, canonical_name, workspace_id, metadata, first_seen_meeting_id) VALUES (gen_random_uuid(), $1, $2, '{}', $3) RETURNING id`,
        [p.name, workspaceId, meetingId]
      );
      personMap[p.id] = insertResult.rows[0].id;
    }
  }
  return personMap;
}

async function persistAnalysis(pool, meetingId, result, workspaceId) {
  let currentStep = 'init';
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 0. Resolve people
    currentStep = 'resolve-people';
    const participants = result.participants || [];
    const personMap = await resolvePeople(client, meetingId, participants, workspaceId);

    // 1. 写入 assets.metadata.analysis
    currentStep = 'assets-metadata';
    await client.query(
      `UPDATE assets SET metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb WHERE id = $1`,
      [meetingId, JSON.stringify({ analysis: result.analysis })]
    );

    // 2. 写入 mn_commitments
    currentStep = 'mn-commitments';
    const commitments = result.axes?.people?.commitments || [];
    for (const c of commitments) {
      const personId = personMap[c.who] || Object.values(personMap)[0];
      if (!personId) continue; // skip if no person found
      const stateMap = { 'open': 'on_track', 'in_progress': 'on_track', 'done': 'done', 'at_risk': 'at_risk', 'slipped': 'slipped' };
      const state = stateMap[c.state] || 'on_track';
      await client.query(
        `INSERT INTO mn_commitments (id, meeting_id, person_id, text, due_at, state, progress, evidence_refs, source, workspace_id)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, '[]'::jsonb, 'claude_cli', $7)`,
        [meetingId, personId, (c.what || c.text)?.slice(0, 2000) || '未指定承诺', c.due_at || null, state, Math.round((c.progress || 0) * 100), workspaceId]
      );
    }

    // 3. 写入 mn_decisions
    currentStep = 'mn-decisions';
    const decisions = result.axes?.projects?.decisionChain || [];
    const decisionIdMap = {}; // D1 -> uuid
    for (const d of decisions) {
      const proposerId = personMap[d.who] || null;
      const decisionId = randomUUID();
      decisionIdMap[d.id] = decisionId;
      const decisionTitle = (d.what || d.title || '未命名决策').slice(0, 2000);
      await client.query(
        `INSERT INTO mn_decisions (id, meeting_id, title, based_on_ids, proposer_person_id, confidence, is_current, rationale, metadata, source, workspace_id)
         VALUES ($1, $2, $3, '{}'::uuid[], $4, $5, true, $6, '{}'::jsonb, 'claude_cli', $7)`,
        [decisionId, meetingId, decisionTitle, proposerId, 0.7, d.rationale?.slice(0, 2000) || null, workspaceId]
      );
    }

    // 4. 写入 mn_assumptions
    currentStep = 'mn-assumptions';
    const assumptions = result.axes?.projects?.assumptions || [];
    for (const a of assumptions) {
      await client.query(
        `INSERT INTO mn_assumptions (id, meeting_id, text, evidence_grade, verification_state, underpins_decision_ids, confidence, metadata, source, workspace_id)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, '{}'::uuid[], $5, $6, 'claude_cli', $7)`,
        [meetingId, (a.text || '未指定假设').slice(0, 2000), (a.evidenceGrade || 'C').charAt(0).toUpperCase(), a.verificationState || 'unverified', 0.5, JSON.stringify({ firstRaisedBy: a.firstRaisedBy }), workspaceId]
      );
    }

    // Lookup project scope for this meeting (used by mn_open_questions, mn_risks, mn_assumptions)
    const { rows: meetingScopes } = await client.query(
      `SELECT sm.scope_id FROM mn_scope_members sm JOIN mn_scopes s ON s.id = sm.scope_id
       WHERE sm.meeting_id = $1 AND s.kind = 'project' LIMIT 1`,
      [meetingId]
    );
    const projectScopeId = meetingScopes[0]?.scope_id || null;

    // 5. 写入 mn_open_questions (no meeting_id; has scope_id, first_raised_meeting_id)
    const questions = result.axes?.projects?.openQuestions || [];
    const catMap = { 'strategic': 'strategic', 'operational': 'operational', 'technical': 'analytical', 'analytical': 'analytical', 'governance': 'governance' };
    const oqStatusMap = { 'open': 'open', 'resolved': 'resolved', 'deferred': 'assigned', 'assigned': 'assigned', 'chronic': 'chronic' };
    for (const q of questions) {
      const ownerPersonId = personMap[q.firstAskedBy] || null;
      await client.query(
        `INSERT INTO mn_open_questions (id, scope_id, text, category, status, times_raised, first_raised_meeting_id, owner_person_id, metadata, source, workspace_id)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, 1, $5, $6, '{}'::jsonb, 'claude_cli', $7)`,
        [projectScopeId, (q.text || '未指定问题').slice(0, 2000), catMap[q.category] || 'strategic', oqStatusMap[q.status] || 'open', meetingId, ownerPersonId, workspaceId]
      );
    }

    // 6. 写入 mn_risks (scope_id = project scope, action_taken is boolean)
    const risks = result.axes?.projects?.risks || [];
    const trendMap = { 'increasing': 'up', 'stable': 'flat', 'decreasing': 'down' };
    const severityMap = { 'low': 'low', 'medium': 'med', 'med': 'med', 'high': 'high', 'critical': 'critical' };
    for (const r of risks) {
      if (!projectScopeId) continue; // skip if no project scope
      await client.query(
        `INSERT INTO mn_risks (id, scope_id, text, severity, mention_count, heat_score, trend, action_taken, metadata, source, workspace_id)
         VALUES (gen_random_uuid(), $1, $2, $3, 1, 0.5, $4, false, $5, 'claude_cli', $6)`,
        [projectScopeId, (r.text || '未指定风险').slice(0, 2000), severityMap[r.severity] || 'med', trendMap[r.trend] || 'flat', JSON.stringify({ firstRaisedBy: r.firstRaisedBy, firstRaisedMeetingId: meetingId }), workspaceId]
      );
    }

    // 7. 写入 mn_judgments
    currentStep = 'mn-judgments';
    const judgments = result.axes?.knowledge?.reusableJudgments || [];
    for (const j of judgments) {
      await client.query(
        `INSERT INTO mn_judgments (id, text, abstracted_from_meeting_id, generality_score, reuse_count, linked_meeting_ids, metadata, source, workspace_id)
         VALUES (gen_random_uuid(), $1, $2, $3, 0, ARRAY[$4]::uuid[], $5, 'claude_cli', $6)`,
        [(j.judgment || '未指定判断').slice(0, 2000), meetingId, j.generalityScore || 0.5, meetingId, JSON.stringify({ context: j.context, confidence: j.confidence, domain: j.domain, evidence: j.evidence }), workspaceId]
      );
    }

    // 8. 写入 mn_mental_model_invocations (no metadata; has invoked_by_person_id, expert_source, outcome)
    currentStep = 'mn-mental-models';
    const models = result.axes?.knowledge?.mentalModels || [];
    for (const m of models) {
      const invokedByPersonId = personMap[m.invokedBy] || null;
      await client.query(
        `INSERT INTO mn_mental_model_invocations (id, meeting_id, model_name, invoked_by_person_id, expert_source, confidence, outcome, source, workspace_id)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, 'claude_cli', $7)`,
        [meetingId, (m.model || '未指定模型').slice(0, 500), invokedByPersonId, m.expert?.slice(0, 500) || null, m.effectiveness || 0.5, m.application?.slice(0, 2000) || null, workspaceId]
      );
    }

    // 9. 写入 mn_cognitive_biases (no metadata column; has where_excerpt, by_person_id, mitigation_strategy)
    currentStep = 'mn-cognitive-biases';
    const biases = result.axes?.knowledge?.cognitiveBiases || [];
    for (const b of biases) {
      const byPersonId = (b.by || []).map(bid => personMap[bid]).find(Boolean) || null;
      await client.query(
        `INSERT INTO mn_cognitive_biases (id, meeting_id, bias_type, where_excerpt, by_person_id, severity, mitigated, mitigation_strategy, source, workspace_id)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, false, $6, 'claude_cli', $7)`,
        [meetingId, (b.bias || '未指定偏差').slice(0, 500), (b.where || b.evidence)?.slice(0, 2000) || null, byPersonId, ({ 'low': 'low', 'medium': 'med', 'med': 'med', 'high': 'high' })[b.severity] || 'med', (b.mitigation || b.counterAction)?.slice(0, 2000) || null, workspaceId]
      );
    }

    // 10. 写入 mn_counterfactuals (no metadata; has rejected_path, rejected_at_decision_id, rejected_by_person_id)
    currentStep = 'mn-counterfactuals';
    const counterfactuals = result.axes?.knowledge?.counterfactuals || [];
    for (const cf of counterfactuals) {
      const rejectedByPersonId = (cf.rejectedBy || []).map(bid => personMap[bid]).find(Boolean) || null;
      // rejected_at_decision_id is UUID — only use if it maps to a known decision, otherwise null
      const rejectedAtDecisionId = decisionIdMap[cf.rejectedAtDecisionId] || decisionIdMap[cf.rejectedAt] || null;
      const cfPath = (cf.path || cf.ifClause)?.slice(0, 2000) || '未指定路径';
      // Merge text description of rejectedAt into tracking_note if no valid UUID
      const trackingNote = [cf.thenClause, cf.trackingNote, (cf.rejectedAt && !rejectedAtDecisionId) ? `决策点: ${cf.rejectedAt}` : null].filter(Boolean).join('; ');
      await client.query(
        `INSERT INTO mn_counterfactuals (id, meeting_id, rejected_path, rejected_at_decision_id, rejected_by_person_id, tracking_note, source, workspace_id)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, 'claude_cli', $6)`,
        [meetingId, cfPath, rejectedAtDecisionId, rejectedByPersonId, trackingNote?.slice(0, 2000) || null, workspaceId]
      );
    }

    // 11. 写入 content_facts (context is jsonb, asset_id is varchar)
    currentStep = 'content-facts';
    const facts = result.facts || [];
    for (const f of facts) {
      const contextVal = f.context ? (typeof f.context === 'string' ? JSON.stringify({ text: f.context.slice(0, 500) }) : f.context) : '{}';
      await client.query(
        `INSERT INTO content_facts (id, asset_id, subject, predicate, object, context, confidence, is_current, zep_sync_attempts)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, true, 0)`,
        [meetingId, (f.subject || '未知').slice(0, 500), (f.predicate || '相关').slice(0, 200), (f.object || '未知').slice(0, 500), contextVal, f.confidence || 0.5]
      );
    }

    // 12. 写入 mn_tensions (meeting_id is varchar, between_ids is uuid[])
    currentStep = 'mn-tensions';
    const tensions = result.axes?.tension || result.analysis?.tension || [];
    for (const t of tensions) {
      const betweenIds = (t.between || []).map(b => personMap[b]).filter(Boolean);
      await client.query(
        `INSERT INTO mn_tensions (id, meeting_id, between_ids, topic, intensity, summary, computed_at, meta, moments, source, workspace_id)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, NOW(), $6, $7, 'claude_cli', $8)`,
        [meetingId, betweenIds, (t.topic || '未指定议题').slice(0, 500), t.intensity || 0.5, t.summary?.slice(0, 2000) || '', JSON.stringify({ between: t.between }), JSON.stringify(t.moments || []), workspaceId]
      );
    }

    // 13. 写入 mn_decision_quality (meeting_id PK, separate dim columns, no id)
    currentStep = 'mn-decision-quality';
    const dq = result.axes?.meta?.decisionQuality;
    if (dq) {
      const dims = dq.dims || {};
      await client.query(
        `INSERT INTO mn_decision_quality (meeting_id, overall, clarity, actionable, traceable, falsifiable, aligned, notes, computed_at, source, workspace_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, '{}'::jsonb, NOW(), 'claude_cli', $8)
         ON CONFLICT (meeting_id) DO UPDATE SET overall = $2, clarity = $3, actionable = $4, traceable = $5, falsifiable = $6, aligned = $7`,
        [meetingId, dq.overall || 0.5, dims.clarity || 0.5, dims.actionable || 0.5, dims.traceable || 0.5, dims.falsifiable || 0.5, dims.aligned || 0.5, workspaceId]
      );
    }

    // 14. 写入 mn_meeting_necessity (meeting_id PK, has suggested_duration_min not score, no id)
    currentStep = 'mn-meeting-necessity';
    const nec = result.axes?.meta?.necessity;
    if (nec) {
      const verdictMap = { 'needed': 'needed', 'partial': 'partial', 'async_ok': 'async_ok' };
      const durationMin = result.meeting?.duration || null;
      await client.query(
        `INSERT INTO mn_meeting_necessity (meeting_id, verdict, suggested_duration_min, reasons, computed_at, source, workspace_id)
         VALUES ($1, $2, $3, $4, NOW(), 'claude_cli', $5)
         ON CONFLICT (meeting_id) DO UPDATE SET verdict = $2, suggested_duration_min = $3, reasons = $4`,
        [meetingId, verdictMap[nec.verdict] || 'partial', durationMin ? Math.round(durationMin * 0.6) : null, JSON.stringify(nec.reasons || []), workspaceId]
      );
    }

    // 15. 写入 mn_affect_curve (single row: meeting_id PK, samples as jsonb array, no id column)
    currentStep = 'mn-affect-curve';
    const ec = result.axes?.meta?.emotionCurve || [];
    if (ec.length > 0) {
      const samples = ec.map(pt => ({ t: (pt.t || 0) * 60, valence: pt.valence || 0, intensity: pt.intensity || 0 }));
      await client.query(
        `INSERT INTO mn_affect_curve (meeting_id, samples, tension_peaks, insight_points, computed_at, source, workspace_id)
         VALUES ($1, $2, '[]'::jsonb, '[]'::jsonb, NOW(), 'claude_cli', $3)
         ON CONFLICT (meeting_id) DO UPDATE SET samples = $2, tension_peaks = '[]'::jsonb, insight_points = '[]'::jsonb`,
        [meetingId, JSON.stringify(samples), workspaceId]
      );
    }

    // 16. 写入 mn_evidence_grades
    currentStep = 'mn-evidence-grades';
    const eg = result.axes?.knowledge?.evidenceGrades || [];
    if (eg.length > 0) {
      const distA = eg.filter(e => (e.grade || 'C').toUpperCase() === 'A').length;
      const distB = eg.filter(e => (e.grade || 'C').toUpperCase() === 'B').length;
      const distC = eg.filter(e => (e.grade || 'C').toUpperCase() === 'C').length;
      const distD = eg.filter(e => (e.grade || 'C').toUpperCase() === 'D').length;
      const weighted = (distA * 4 + distB * 3 + distC * 2 + distD * 1) / Math.max(eg.length, 1);
      await client.query(
        `INSERT INTO mn_evidence_grades (meeting_id, dist_a, dist_b, dist_c, dist_d, weighted_score, computed_at, source, workspace_id)
         VALUES ($1, $2, $3, $4, $5, $6, NOW(), 'claude_cli', $7)
         ON CONFLICT (meeting_id) DO UPDATE SET dist_a = $2, dist_b = $3, dist_c = $4, dist_d = $5, weighted_score = $6`,
        [meetingId, distA, distB, distC, distD, weighted, workspaceId]
      );
    }

    // 17. 标记 mn_runs (has required columns: sub_dims, preset, cost_tokens, cost_ms, depends_on)
    currentStep = 'mn-runs';
    await client.query(
      `INSERT INTO mn_runs (id, module, axis, sub_dims, preset, state, triggered_by, progress_pct, cost_tokens, cost_ms, scope_id, scope_kind, metadata, depends_on, workspace_id)
       VALUES ($1, 'mn', 'all', '{}'::text[], 'standard', 'succeeded', 'manual', 100, 0, 0, $2, 'meeting', $3, '{}'::uuid[], $4)`,
      [randomUUID(), meetingId, JSON.stringify({ source: 'local-claude-cli', meetingTitle: result.meeting?.title, generatedAt: new Date().toISOString() }), WORKSPACE_ID]
    );

    await client.query('COMMIT');
    return true;
  } catch (e) {
    await client.query('ROLLBACK');
    // Enrich error with context about which step failed
    e.message = `Persist failed at step [${currentStep}] for meeting ${meetingId}: ${e.message}`;
    throw e;
  } finally {
    client.release();
  }
}

// ---- 主逻辑 ----
async function main() {
  console.log(`\n🤖 Batch Analyze (local Claude CLI → 115 DB) ${DRY_RUN ? 'DRY-RUN' : ''}\n`);

  mkdirSync(OUTPUT_DIR, { recursive: true });

  const poolConfig = {
    host: DB_HOST,
    port: 5432,
    database: 'author',
    user: 'scubiry',
    password: '0tzgzmjUXWCgTed1N28iaA==',
    connectionTimeoutMillis: 30000,
    idleTimeoutMillis: 60000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 5000,
    max: 2,
  };

  // 获取所有 feishu-minutes assets（时长 >= 3min，排除已分析的）
  const pool = new pg.Pool(poolConfig);
  pool.on('error', (err) => {
    console.error('Pool error (non-fatal):', err.message?.slice(0, 100));
  });
  const { rows: assets } = await pool.query(
    `SELECT id, title, content, metadata->>'duration_min' AS dur,
            metadata->>'parse_segments' AS seg_info
     FROM assets
     WHERE source = 'feishu-minutes'
       AND (metadata->>'duration_min')::int >= 3
       AND id::text NOT IN (
         SELECT DISTINCT scope_id::text FROM mn_runs WHERE state = 'succeeded' AND module = 'mn'
       )
     ORDER BY (metadata->>'duration_min')::int ASC
     OFFSET $1 LIMIT $2`,
    [START, LIMIT]
  );

  console.log(`Meetings to analyze: ${assets.length}`);
  if (assets.length === 0) {
    console.log('Nothing to do.');
    await pool.end();
    return;
  }

  let succeeded = 0;
  let failed = 0;

  for (let i = 0; i < assets.length; i++) {
    const a = assets[i];
    console.log(`\n[${i + 1}/${assets.length}] ${a.title} (${a.dur}min)`);

    // 解析参与者
    const segInfo = a.seg_info ? JSON.parse(a.seg_info) : { segments: [] };
    const speakers = [...new Set(segInfo.segments?.map(s => s.speaker) || [])];
    const participants = speakers.map((s, idx) => ({ localId: `p${idx + 1}`, name: s }));

    // 构建 prompt
    const transcript = a.content || '';
    const prompt = buildPrompt(a.id, a.title, transcript, participants);

    if (DRY_RUN) {
      console.log(`  Prompt length: ${prompt.length} chars`);
      continue;
    }

    // 执行 Claude CLI
    try {
      const result = await runClaudeCli(prompt);
      console.log(`  ✓ Claude output received: ${Object.keys(result).join(', ')}`);

      // 持久化 — 单连接 pool，用完立即关闭
      const persistPool = new pg.Pool({ ...poolConfig, max: 1 });
      persistPool.on('error', (err) => {
        console.error('PersistPool error (non-fatal):', err.message?.slice(0, 100));
      });
      try {
        await persistAnalysis(persistPool, a.id, result, WORKSPACE_ID);
        succeeded++;
        console.log(`  ✓ Persisted to DB`);
      } finally {
        await persistPool.end();
        // 等连接完全释放
        await new Promise(r => setTimeout(r, 500));
      }
    } catch (e) {
      failed++;
      console.error(`  ✗ Failed: ${e.message?.slice(0, 200)}`);
    }
  }

  console.log(`\n📊 Done: ${succeeded} succeeded, ${failed} failed`);
  await pool.end();
}

main().catch(e => {
  console.error('Fatal:', e);
  process.exit(1);
});
