// Decorator G: track_record_verify — 历史战绩问责
// 对预测性论断检索该专家过往相似预测+实际结果，强制问责"如何调和/更新"

import type {
  ExpertApplicationStrategy,
  StrategyContext,
  StrategyResult,
} from '../types.js';

const MAX_PAST_RECORDS = 3;

export function makeTrackRecordVerifyDecorator(
  inner: ExpertApplicationStrategy,
): ExpertApplicationStrategy {
  return {
    id: 'track_record_verify',
    name: '历史战绩问责',
    requiresMultipleExperts: inner.requiresMultipleExperts,
    supportedTaskTypes: inner.supportedTaskTypes,
    wraps: inner,

    async apply(ctx: StrategyContext): Promise<StrategyResult> {
      const innerResult = await inner.apply(ctx);
      const expert = ctx.experts[0];
      if (!expert) return innerResult;

      const pastRecords = await fetchPastPredictions(ctx, expert.expert_id, MAX_PAST_RECORDS);
      if (pastRecords.length === 0) {
        return {
          ...innerResult,
          meta: {
            ...innerResult.meta,
            trackRecordVerify: { applied: false, reason: 'no_past_records' },
          },
        };
      }

      const prompt = [
        '你刚才给出的分析是:',
        '',
        innerResult.output.sections.map((s) => `### ${s.title}\n${s.content}`).join('\n\n'),
        '',
        '你在类似主题上的过往判断/预测:',
        ...pastRecords.map((r, i) =>
          `  ${i + 1}. [${r.date || '时间未知'}] ${r.prediction}${r.outcome ? ` → 实际: ${r.outcome}` : ' (结果待观察)'}`,
        ),
        '',
        '请严格自省:',
        '1. 本次分析与你过往判断是否一致？',
        '2. 若不一致，是什么新证据让你更新了看法？具体说明。',
        '3. 若一致，为什么这次情况没有出现让你改变判断的新证据？',
        '4. 你愿意为本次判断承担"如果错了"的代价吗？',
      ].join('\n');

      const started = Date.now();
      const resp = await ctx.expertEngine.invoke({
        expert_id: expert.expert_id,
        task_type: 'evaluation',
        input_type: 'text',
        input_data: prompt,
        context: '你在做历史一致性问责，对比过往判断和本次分析。',
        params: { depth: 'quick' },
      });

      const reconciliation = resp.output.sections.map((s) => s.content).join('\n\n');

      return {
        output: {
          sections: [
            ...innerResult.output.sections,
            { title: '历史战绩对照', content: reconciliation },
          ],
        },
        traces: [
          ...innerResult.traces.map((t) => ({ ...t, strategy: `track_record_verify|${t.strategy}` })),
          {
            deliverable: ctx.deliverable,
            expertId: expert.expert_id,
            invokeId: resp.metadata.invoke_id,
            strategy: 'track_record_verify',
            stage: 'reconciliation',
            emmPass: resp.metadata.emm_result?.passed ?? true,
            confidence: resp.metadata.confidence ?? 0,
            durationMs: Date.now() - started,
          },
        ],
        meta: {
          ...innerResult.meta,
          trackRecordVerify: {
            applied: true,
            pastRecordCount: pastRecords.length,
          },
        },
      };
    },
  };
}

async function fetchPastPredictions(
  ctx: StrategyContext,
  expertId: string,
  limit: number,
): Promise<Array<{ date?: string; prediction: string; outcome?: string }>> {
  try {
    // 先试 expert_invocations 里近 180 天的 analysis 记录（存在则用）
    const result = await ctx.deps.db.query(
      `SELECT response_output, created_at
       FROM expert_invocations
       WHERE expert_id = $1 AND task_type = 'analysis' AND created_at >= NOW() - INTERVAL '180 days'
       ORDER BY created_at DESC LIMIT $2`,
      [expertId, limit],
    );
    return result.rows.map((row: any) => ({
      date: row.created_at ? new Date(row.created_at).toISOString().slice(0, 10) : undefined,
      prediction: truncate(stringifyOutput(row.response_output), 200),
    }));
  } catch {
    return [];
  }
}

function stringifyOutput(output: any): string {
  if (!output) return '';
  if (typeof output === 'string') return output;
  try {
    if (Array.isArray(output.sections)) {
      return output.sections.map((s: any) => s.content).join(' ');
    }
    return JSON.stringify(output);
  } catch {
    return '';
  }
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + '…' : s;
}
