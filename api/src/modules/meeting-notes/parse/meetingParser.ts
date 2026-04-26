// parse/meetingParser.ts — 单会议解析编排器
//
// 责任：从 assets.id (asset_type='meeting_minutes') 触发一次端到端解析
// 流程：
//   1) assetsAi.parseMeeting(assetId) — 调用既有深度分析
//   2) participantExtractor — 抽取/合并 mn_people
//   3) claim/commitment 抽取（PR3 仅参会人；具体抽取由 axes/* 的 computer 做）
//   4) emit 'mn.meeting.parsed' event
//
// 本模块不做 axis 计算，只做 "原子事实" 落盘。轴计算通过独立 enqueueRun 触发。

import type { MeetingNotesDeps } from '../types.js';
import { ensurePersonByName } from './participantExtractor.js';

export interface ParseMeetingResult {
  ok: boolean;
  assetId: string;
  participantCount: number;
  /** 入库 / 去重后的最终参会人列表（PR15.8: 暴露给前端 ingest 步骤的可观察输出） */
  participants?: Array<{ id: string; name: string; role?: string }>;
  /** 段落数（来自 parsed.segments，PR15.8 起非空） */
  segmentCount?: number;
  /** 估算时长（秒）；最后一段 start 推断 */
  durationSec?: number | null;
  reason?: string;
}

function normalizeNameKey(s: string): string {
  return s.replace(/\s+/g, '').replace(/[（(].*?[)）]/g, '').toLowerCase();
}

export async function parseMeeting(
  deps: MeetingNotesDeps,
  assetId: string,
): Promise<ParseMeetingResult> {
  // 1) 先确认 asset 存在且是 meeting_minutes
  // 兼容历史库字段：有的库是 assets.type（当前主线），旧实现曾使用 asset_type。
  const hasAssetTypeCol = await deps.db.query(
    `SELECT 1
       FROM information_schema.columns
      WHERE table_name = 'assets' AND column_name = 'asset_type'
      LIMIT 1`,
  );
  const typeExpr = hasAssetTypeCol.rows.length > 0
    ? `COALESCE(asset_type::text, type::text, content_type::text, '')`
    : `COALESCE(type::text, content_type::text, '')`;
  const rows = await deps.db.query(
    `SELECT id, ${typeExpr} AS asset_kind, title, content, metadata
       FROM assets WHERE id = $1`,
    [assetId],
  );
  if (rows.rows.length === 0) {
    return { ok: false, assetId, participantCount: 0, reason: 'asset-not-found' };
  }
  const asset = rows.rows[0];
  if (asset.asset_kind !== 'meeting_minutes') {
    return { ok: false, assetId, participantCount: 0, reason: 'not-meeting-minutes' };
  }

  // 2) 调 assets-ai 做深度解析（ASR、分段、发言人）
  //    PR1/PR3 阶段 AssetsAiAdapter 默认 no-op，返回 { assetId }，
  //    PR5 接入真 orchestrator 后这里会有完整 segments/participants
  const parsed = await deps.assetsAi.parseMeeting(assetId);

  // 3) 参会人合并：从 asset.metadata.participants 与 parsed.participants 取并集，
  //    并按 normalizeNameKey 去重（避免同名人因来源不同被插两次）。
  const metaParticipants: Array<{ name: string; role?: string }> =
    Array.isArray(asset.metadata?.participants)
      ? asset.metadata.participants.map((p: any) =>
          typeof p === 'string' ? { name: p } : { name: String(p?.name || ''), role: p?.role },
        )
      : [];
  const parsedParticipants = parsed.participants ?? [];
  const seen = new Set<string>();
  const merged: Array<{ name: string; role?: string }> = [];
  for (const p of [...metaParticipants, ...parsedParticipants]) {
    const name = (p.name || '').trim();
    if (!name) continue;
    const key = normalizeNameKey(name);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push({ name, role: p.role });
  }

  const persistedPeople: Array<{ id: string; name: string; role?: string }> = [];
  for (const p of merged) {
    const id = await ensurePersonByName(deps, p.name, p.role);
    if (id) persistedPeople.push({ id, name: p.name, role: p.role });
  }
  const participantCount = persistedPeople.length;

  // 3.5) 持久化全量 segments：写到 assets.metadata.parse_segments（覆写）
  //      上限 5000 段（保护 jsonb 列）；超过则只存前 5000 + 总数。
  if (Array.isArray(parsed.segments) && parsed.segments.length > 0) {
    const MAX_SEG = 5000;
    const truncated = parsed.segments.length > MAX_SEG;
    const segmentsToStore = truncated ? parsed.segments.slice(0, MAX_SEG) : parsed.segments;
    try {
      await deps.db.query(
        `UPDATE assets
            SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
              'parse_segments', jsonb_build_object(
                'count', $2::int,
                'truncated', $3::boolean,
                'segments', $4::jsonb
              )
            )
          WHERE id = $1`,
        [assetId, parsed.segments.length, truncated, JSON.stringify(segmentsToStore)],
      );
    } catch (e) {
      console.warn('[meetingParser] persist parse_segments failed:', (e as Error).message);
    }
  }

  // 4) 发事件（PR4 起 run engine 会订阅此事件做 auto-enqueue）
  await deps.eventBus.publish('mn.meeting.parsed', {
    assetId,
    participantCount,
    segmentCount: parsed.segments?.length ?? 0,
  });

  // 估算时长：取最后一段 start
  const lastWithStart = [...(parsed.segments ?? [])].reverse().find((s) => s.start != null);
  const durationSec = lastWithStart?.start ?? null;

  return {
    ok: true,
    assetId,
    participantCount,
    participants: persistedPeople,
    segmentCount: parsed.segments?.length ?? 0,
    durationSec,
  };
}
