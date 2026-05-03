// boardroom-concerns · 抽董事关切 → ceo_director_concerns
//
// 输入: 近 90 天 mn_judgments + ceo_directors
// 输出: 每位董事 1-3 条关切（pending），按重要度排序

import { z } from 'zod';
import type { PromptDef, PromptCtx } from './types.js';

const Concern = z.object({
  director_id: z.string().uuid(),
  director_name: z.string(),
  topic: z.string().min(15).max(180),
  raised_count: z.number().int().min(1).max(10),
  source_meeting_id: z.string().nullable(),
}).strict();

const Out = z.object({
  concerns: z.array(Concern).min(2).max(15),
}).strict();

type OutT = z.infer<typeof Out>;

export const boardroomConcernsPrompt: PromptDef<OutT> = {
  axis: 'boardroom-concerns',
  label: 'Boardroom · 董事关切提取',
  prism: 'boardroom',
  outputSchema: Out,
  maxTokens: 1800,
  temperature: 0.5,

  systemPrompt: () =>
    `你是 CEO 的董事关切提取器。从近 90 天 mn_judgments 与会议中，按 director 归集关切话题（pending = 还没回应）。
要求：
- director_id 必须来自我给的 directors 列表（不可编人）
- topic 必须像问句或质疑（"X 反复 5 次，尽调标准是什么？"），15-150 字
- 每位董事建议 1-3 条；总数 5-12 条
- raised_count 估计该关切被提了多少次（结合 judgments 频次）
- source_meeting_id 必须来自 meetings 列表，无明确来源 → null
- topic 必含至少一个具体名词（项目名 / 数字 / 人名）—— 不要"沟通透明度需要提升"这种空话

仅输出 JSON：{"concerns":[{director_id,director_name,topic,raised_count,source_meeting_id},...]}`,

  userPrompt: (ctx) =>
    `Scope: ${ctx.scopeName ?? '(未命名)'}
董事（${ctx.directors.length} 位）：
${ctx.directors.map((d) => `- [${d.id}] ${d.name} (${d.role ?? '?'}, weight=${d.weight})`).join('\n')}

会议样本：
${ctx.meetings.slice(0, 12).map((m) => `- [${m.id}] ${m.title}`).join('\n')}

近 90 天 judgments：
${ctx.judgments.slice(0, 35).map((j) => `- [${j.kind}] ${j.text.slice(0, 130)}`).join('\n')}

请抽 5-10 条最值得 CEO 当周回应的 pending 关切。`,

  qualityChecks: [
    (out, ctx) => {
      const ids = new Set(ctx.directors.map((d) => d.id));
      for (const c of out.concerns) {
        if (!ids.has(c.director_id)) return `director_id ${c.director_id} 不在董事列表`;
      }
      return null;
    },
    (out) => {
      const directors = new Set(out.concerns.map((c) => c.director_id));
      if (directors.size < 2) return '关切来源应覆盖 ≥2 位董事，避免单点';
      return null;
    },
  ],
};
