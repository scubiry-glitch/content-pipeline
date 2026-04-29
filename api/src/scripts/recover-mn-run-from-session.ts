// recover-mn-run-from-session.ts
// 把一段已经在 claude session JSONL 里的 inner JSON 直接灌进某个 mn_run 的持久化链路，
// 不重跑 anthropic API、不重花 token。用于：claude 在我们 SIGKILL 之后才完成响应、
// 但响应被 session 缓存住了的灾难恢复场景。
//
// 用法：
//   npx tsx src/scripts/recover-mn-run-from-session.ts \
//     --runId 194e8a19-bb26-4c72-a717-dc3dcd66e2a7 \
//     --inner /tmp/mn-194e8a19-inner.json
//
// inner 文件就是 claude 输出的 inner JSON 文本（meeting/participants/analysis/axes/facts/wikiMarkdown）。
// 跟 claudeCliRunner.ts 里 JSON.parse(stdout).result 解出来的那一段是同结构。

import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { query } from '../db/connection.js';
import {
  createPipelineDeps as createMeetingNotesDeps,
  createPipelineDBAdapter as createMeetingNotesDBAdapter,
} from '../modules/meeting-notes/adapters/pipeline.js';
import { createLocalAssetsAiAdapter } from '../modules/meeting-notes/index.js';
import { persistAnalysisToAsset } from '../modules/meeting-notes/runs/composeAnalysis.js';
import { persistClaudeAxes } from '../modules/meeting-notes/runs/persistClaudeAxes.js';
import { persistClaudeFacts } from '../modules/meeting-notes/runs/persistClaudeFacts.js';
import { persistClaudeWiki } from '../modules/meeting-notes/runs/persistClaudeWiki.js';
import { ensurePersonByName } from '../modules/meeting-notes/parse/participantExtractor.js';

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const k = a.slice(2);
      const v = argv[i + 1];
      out[k] = v;
      i += 1;
    }
  }
  return out;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const runId = args.runId;
  const innerPath = args.inner;
  if (!runId || !innerPath) {
    console.error('Usage: tsx recover-mn-run-from-session.ts --runId <uuid> --inner <path>');
    process.exit(2);
  }

  const inner = JSON.parse(readFileSync(innerPath, 'utf8'));
  if (!inner?.meeting || !inner?.analysis || !inner?.axes || !Array.isArray(inner?.participants)) {
    console.error('inner JSON missing required keys: meeting/analysis/axes/participants');
    process.exit(3);
  }

  // 1. 找出 run 的 meetingId（assetId）
  const r = await query(
    `SELECT id, scope_kind, scope_id::text AS scope_id, state, metadata
       FROM mn_runs WHERE id = $1`,
    [runId],
  );
  if (!r.rows[0]) {
    console.error(`run ${runId} not found`);
    process.exit(4);
  }
  const run = r.rows[0];
  if (run.scope_kind !== 'meeting' || !run.scope_id) {
    console.error(`only meeting-scope runs supported (this one: kind=${run.scope_kind})`);
    process.exit(5);
  }
  const meetingId = String(run.scope_id);
  console.log(`[recover] run=${runId} meetingId=${meetingId} state=${run.state}`);

  // 2. 构建 deps（同 server.ts，但只用 meeting-notes 必需）
  const mnDb = createMeetingNotesDBAdapter(query);
  const deps = createMeetingNotesDeps({
    db: mnDb,
    assetsAi: createLocalAssetsAiAdapter(mnDb),
    // 恢复路径不再调专家 / strategy resolver，给空 stub
    experts: { invoke: async () => ({ success: false, error: 'recovery-stub' }) } as any,
    expertApplication: {
      resolveForMeetingKind: () => null,
      shouldSkipExpertAnalysis: () => false,
    } as any,
  });

  // 3. 走跟 runEngine.execute spawn #1 完成后一样的持久化
  // 3a. 重建 cliPersonMap
  const cliPersonMap: Record<string, string> = {};
  for (const p of inner.participants) {
    const localId = String(p?.id ?? '').trim();
    const rawName = String(p?.name ?? '').trim();
    if (!localId || !rawName) continue;
    try {
      const uuid = await ensurePersonByName(deps, rawName, p?.role);
      if (uuid) cliPersonMap[localId] = uuid;
    } catch (e) {
      console.warn(`[recover] ensurePersonByName failed for ${rawName}:`, (e as Error).message);
    }
  }
  console.log(`[recover] cliPersonMap built: ${Object.keys(cliPersonMap).length} entries`);

  // 3b. analysis → assets.metadata.analysis
  const stampedAnalysis = {
    ...inner.analysis,
    _generated: {
      by: 'claude-cli' as const,
      runId,
      at: new Date().toISOString(),
      phase: 1 as const,
      recoveredFrom: 'session-jsonl',
    },
  };
  await persistAnalysisToAsset(mnDb, meetingId, stampedAnalysis);
  console.log(`[recover] persistAnalysisToAsset done`);

  // 3c. assets.metadata.participants
  if (inner.participants.length > 0) {
    await query(
      `UPDATE assets SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('participants', $2::jsonb) WHERE id = $1`,
      [meetingId, JSON.stringify(inner.participants)],
    );
    console.log(`[recover] participants written: ${inner.participants.length}`);
  }

  // 3d. axes → 17 张 mn_* 表
  await persistClaudeAxes(deps, meetingId, {
    meeting: inner.meeting,
    participants: inner.participants,
    analysis: inner.analysis,
    axes: inner.axes,
  }, cliPersonMap);
  console.log(`[recover] persistClaudeAxes done`);

  // 3e. facts → content_facts
  try {
    await persistClaudeFacts(deps, meetingId, inner.facts ?? []);
    console.log(`[recover] persistClaudeFacts done: ${(inner.facts ?? []).length} facts`);
  } catch (e) {
    console.warn(`[recover] persistClaudeFacts failed:`, (e as Error).message);
  }

  // 3f. wikiMarkdown → wiki vault .md
  try {
    await persistClaudeWiki(deps, meetingId, inner.wikiMarkdown ?? {}, undefined, inner.meeting?.title);
    console.log(`[recover] persistClaudeWiki done`);
  } catch (e) {
    console.warn(`[recover] persistClaudeWiki failed:`, (e as Error).message);
  }

  // 4. 把 mn_runs 标 succeeded + 留 audit trail
  await query(
    `UPDATE mn_runs
        SET state = 'succeeded',
            finished_at = NOW(),
            error_message = NULL,
            metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
              'currentStep', '完成 · 从 session JSONL 恢复'::text,
              'currentStepKey', 'recovered',
              'recoveredFrom', 'session-jsonl',
              'recoveredAt', NOW()::text,
              'recoveredFactsCount', $2::int,
              'recoveredParticipantsCount', $3::int,
              'recoveredAxesKeys', $4::jsonb
            )
      WHERE id = $1`,
    [
      runId,
      Array.isArray(inner.facts) ? inner.facts.length : 0,
      inner.participants.length,
      JSON.stringify(Object.keys(inner.axes ?? {})),
    ],
  );
  console.log(`[recover] run ${runId} → succeeded`);
  process.exit(0);
}

main().catch((e) => {
  console.error('[recover] fatal:', (e as Error).message);
  process.exit(1);
});
