// axes/projects/riskHeatComputer.ts — 风险热度 (risk_heat)
//
// heat_score = mention_count × severity_factor × (1 if !action_taken else 0.4)
// severity_factor: low=1, med=2, high=3, critical=4

import { loadMeetingBundle, budgetedExcerpt } from '../../parse/claimExtractor.js';
import { callExpertOrLLM, emptyResult, safeJsonParse, type ComputeArgs, type ComputeResult } from '../_shared.js';
import { FEW_SHOT_HEADER, EX_RISK_HEAT } from '../_examples.js';
import type { MeetingNotesDeps } from '../../types.js';

interface ExtractedRisk {
  text: string;
  severity?: 'low' | 'med' | 'high' | 'critical';
  action_taken?: boolean;
  trend?: 'up' | 'flat' | 'down';
}

const SYSTEM = `你是风险抽取器。从正文里找出被提出的项目风险。返回 JSON 数组：
[{"text":"风险描述（≤80字）", "severity":"low|med|high|critical", "action_taken":true/false, "trend":"up|flat|down"}]
- 只抽取明显是风险/隐患的断言
- text 必须能定位到具体业务场景（哪家公司/哪个赛道/哪条业务线），不要泛化为"市场风险"
- severity 反映对项目的影响强度；action_taken=true 仅当会上有明确缓解动作

${FEW_SHOT_HEADER}
${EX_RISK_HEAT}`;

const SEVERITY_FACTOR: Record<string, number> = { low: 1, med: 2, high: 3, critical: 4 };

export async function computeRiskHeat(
  deps: MeetingNotesDeps,
  args: ComputeArgs,
): Promise<ComputeResult> {
  const out = emptyResult('risk_heat');
  if (!args.meetingId) return out;
  const bundle = await loadMeetingBundle(deps, args.meetingId);
  if (!bundle) return out;

  const raw = await callExpertOrLLM(deps, bundle.meetingKind, SYSTEM,
    `标题：${bundle.title}\n\n正文：\n${budgetedExcerpt(bundle.content)}`);
  const items = safeJsonParse<ExtractedRisk[]>(raw, []);

  for (const item of items) {
    try {
      const sev = item.severity ?? 'med';
      const taken = item.action_taken ?? false;
      const existing = await deps.db.query(
        `SELECT id, mention_count FROM mn_risks
          WHERE COALESCE(scope_id::text,'') = COALESCE($1::text,'')
            AND lower(text) = lower($2)
          LIMIT 1`,
        [args.scopeId ?? null, item.text],
      );
      if (existing.rows.length > 0) {
        const mentions = Number(existing.rows[0].mention_count ?? 1) + 1;
        const heat = mentions * (SEVERITY_FACTOR[sev] || 2) * (taken ? 0.4 : 1);
        await deps.db.query(
          `UPDATE mn_risks
              SET mention_count = $2,
                  severity = $3,
                  action_taken = $4,
                  trend = $5,
                  heat_score = $6,
                  updated_at = NOW()
            WHERE id = $1`,
          [existing.rows[0].id, mentions, sev, taken, item.trend ?? 'flat', heat],
        );
        out.updated += 1;
      } else {
        const heat = 1 * (SEVERITY_FACTOR[sev] || 2) * (taken ? 0.4 : 1);
        await deps.db.query(
          `INSERT INTO mn_risks
             (scope_id, text, severity, mention_count, heat_score, trend, action_taken)
           VALUES ($1, $2, $3, 1, $4, $5, $6)`,
          [args.scopeId ?? null, item.text, sev, heat, item.trend ?? 'flat', taken],
        );
        out.created += 1;
      }
    } catch {
      out.errors += 1;
    }
  }
  return out;
}
