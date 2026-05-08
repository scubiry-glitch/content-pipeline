#!/usr/bin/env tsx
// 一次性挽救 mn_runs 988147ac-b94f-4362-b73c-74ebc964d107（meeting 0581995b-...）
//
// 失败原因：claude CLI 输出在中文字符串里嵌了 4 处未转义 ASCII 双引号 + 1 处多余 `}`，
// 导致 JSON.parse @ pos 25628 崩。CLI 完整 38KB 输出已在 metadata.cliRaw。
//
// 本脚本：
//   1) 拉 cliRaw → escape 内嵌 quote + 删多余 close → JSON.parse → cliResult
//   2) ensurePersonByName 重建 cliPersonMap
//   3) persistAnalysisToAsset / 写 assets.metadata.participants / persistClaudeAxes / persistClaudeFacts
//   4) 跳过 persistClaudeWiki + wikiGenerator（重 I/O，后续手动触发或下次 run 时重生即可）
//   5) UPDATE mn_runs SET state='succeeded', progress=100, finished_at=now, metadata += {salvagedAt}
//
// 跑法（在 api/ 下）：tsx scripts/salvage-988147ac.mts

import dotenv from 'dotenv';
import path from 'node:path';
dotenv.config({ path: path.join(process.cwd(), '.env') });

import { Pool } from 'pg';
import { persistClaudeAxes } from '../src/modules/meeting-notes/runs/persistClaudeAxes.js';
import { persistClaudeFacts } from '../src/modules/meeting-notes/runs/persistClaudeFacts.js';
import { persistAnalysisToAsset } from '../src/modules/meeting-notes/runs/composeAnalysis.js';
import { ensurePersonByName } from '../src/modules/meeting-notes/parse/participantExtractor.js';

const RUN_ID = '988147ac-b94f-4362-b73c-74ebc964d107';

// ─── repair pipeline ──────────────────────────────────────────
function escUnescapedInnerQuotes(text: string): string {
  const out: string[] = [];
  let inStr = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (ch === '\\') { out.push(ch, text[i + 1]); i++; continue; }
      if (ch === '"') {
        let j = i + 1; while (j < text.length && /\s/.test(text[j])) j++;
        const nx = text[j];
        if (nx === ',' || nx === ':' || nx === '}' || nx === ']' || j >= text.length) {
          inStr = false; out.push(ch); continue;
        }
        out.push('\\"'); continue;  // 内嵌未转义 → escape
      }
      out.push(ch); continue;
    }
    if (ch === '"') { inStr = true; out.push(ch); continue; }
    out.push(ch);
  }
  return out.join('');
}

function repairExtraCloses(text: string): string {
  for (let it = 0; it < 8; it++) {
    try { JSON.parse(text); return text; }
    catch (e: any) {
      const m = String(e.message).match(/Unexpected non-whitespace character after JSON at position (\d+)/);
      if (!m) return text;
      const pos = +m[1];
      // pos-1 是带来 stack=0 的那个 close — 删它
      let j = pos - 1;
      if (text[j] !== '}' && text[j] !== ']') {
        while (j >= 0 && text[j] !== '}' && text[j] !== ']') j--;
      }
      if (j < 0) return text;
      text = text.slice(0, j) + text.slice(j + 1);
    }
  }
  return text;
}

function repair(raw: string): any {
  let cur = escUnescapedInnerQuotes(raw);
  cur = repairExtraCloses(cur);
  return JSON.parse(cur);
}

// ─── DB ────────────────────────────────────────────────────────
const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT ?? 5432),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

const dbAdapter = {
  async query(sql: string, params?: any[]) {
    const r = await pool.query(sql, params);
    return { rows: r.rows, rowCount: r.rowCount };
  },
};
// persistClaudeFacts/Axes 接收的 deps 形状：只用 db，但类型是 MeetingNotesDeps；用 as any 跳类型校验
const deps = { db: dbAdapter } as any;

// ─── main ──────────────────────────────────────────────────────
async function main() {
  // 1) 拉 cliRaw + 元信息
  const r = await pool.query(
    `SELECT id, scope_id::text AS meeting_id, state, metadata->>'cliRaw' AS cli_raw,
            metadata->>'meetingKind' AS meeting_kind
       FROM mn_runs WHERE id = $1`,
    [RUN_ID],
  );
  if (r.rows.length === 0) throw new Error(`run ${RUN_ID} not found`);
  const row = r.rows[0];
  const meetingId = row.meeting_id as string;
  const cliRaw = row.cli_raw as string;
  console.log('[salvage] run state =', row.state, ', meetingId =', meetingId, ', cliRaw chars =', cliRaw?.length);
  if (!cliRaw) throw new Error('mn_runs.metadata.cliRaw is empty');

  // 2) 修复 + 解析
  const inner = repair(cliRaw);
  console.log('[salvage] parsed inner. top keys =', Object.keys(inner).join(','));
  console.log('[salvage] participants =', inner.participants?.length ?? 0,
              'facts =', (inner.facts ?? []).length,
              'tension =', (inner.tension ?? inner.analysis?.tension ?? []).length);

  // 3) 重建 cliPersonMap
  const claudeParticipants = Array.isArray(inner.participants) ? inner.participants : [];
  const cliPersonMap: Record<string, string> = {};
  for (const p of claudeParticipants) {
    const localId = String((p as any)?.id ?? '').trim();
    const rawName = String((p as any)?.name ?? '').trim();
    if (!localId || !rawName) continue;
    try {
      const uuid = await ensurePersonByName(deps, rawName, (p as any)?.role, undefined, meetingId);
      if (uuid) cliPersonMap[localId] = uuid;
    } catch (e: any) {
      console.warn('[salvage] ensurePersonByName failed for', rawName, ':', e?.message);
    }
  }
  console.log('[salvage] cliPersonMap mapped', Object.keys(cliPersonMap).length, '/', claudeParticipants.length);

  // 4) persist analysis to asset.metadata.analysis
  const stampedAnalysis = {
    ...(inner.analysis ?? {}),
    _generated: { by: 'claude-cli' as const, runId: RUN_ID, at: new Date().toISOString(), phase: 1 as const },
  };
  const aRes = await persistAnalysisToAsset(dbAdapter as any, meetingId, stampedAnalysis as any);
  console.log('[salvage] persistAnalysisToAsset →', aRes);

  // 5) 写 assets.metadata.participants
  if (claudeParticipants.length > 0) {
    await pool.query(
      `UPDATE assets SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('participants', $2::jsonb) WHERE id = $1`,
      [meetingId, JSON.stringify(claudeParticipants)],
    );
    console.log('[salvage] assets.metadata.participants written');
  }

  // 6) persistClaudeAxes — 写 17 张 mn_* 表
  await persistClaudeAxes(deps, meetingId, {
    meeting: inner.meeting,
    participants: inner.participants,
    analysis: inner.analysis,
    axes: inner.axes,
  } as any, cliPersonMap);
  console.log('[salvage] persistClaudeAxes done');

  // 7) persistClaudeFacts — 写 content_facts (wiki SPO)
  try {
    const factsRes = await persistClaudeFacts(deps, meetingId, inner.facts ?? []);
    console.log('[salvage] persistClaudeFacts →', factsRes);
  } catch (e: any) {
    console.warn('[salvage] persistClaudeFacts failed (非阻塞):', e?.message);
  }

  // 8) 把修好的 inner 也回写 cliRaw（覆盖旧脏数据，方便下次回看）
  await pool.query(
    `UPDATE mn_runs
        SET state = 'succeeded',
            progress_pct = 100,
            finished_at = NOW(),
            error_message = NULL,
            metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
              'cliRaw', $2::text,
              'salvagedAt', NOW()::text,
              'salvagedFrom', 'failed-jsonparse-pos25628'
            )
      WHERE id = $1`,
    [RUN_ID, JSON.stringify(inner)],
  );
  console.log('[salvage] mn_runs marked succeeded');

  console.log('\n✅ run', RUN_ID, 'salvaged. (skipped: persistClaudeWiki + wikiGenerator regen — heavy I/O, run again or trigger manually if 需要)');
}

main()
  .then(() => pool.end())
  .catch((e) => { console.error('[salvage] FATAL:', e); pool.end(); process.exit(1); });
