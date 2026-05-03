// boardroom-annotation · 外脑批注 → ceo_boardroom_annotations
//
// 升级现有 g4-annotations — 强制 citations 非空 + 数据锚点
// 由 ceo-generate-real-content.ts 按 (brief, expert) 配对调用

import { z } from 'zod';
import type { PromptDef, PromptCtx } from './types.js';

const Citation = z.object({
  type: z.enum(['meeting', 'asset', 'echo']),
  id: z.string(),
  label: z.string(),
}).strict();

const Out = z.object({
  mode: z.enum(['synthesis', 'contrast', 'counter', 'extension']),
  highlight: z.string().min(10).max(120),
  body_md: z.string().min(150).max(1600),
  citations: z.array(Citation).min(1).max(4),
}).strict();

type OutT = z.infer<typeof Out>;

export const boardroomAnnotationPrompt: PromptDef<OutT> = {
  axis: 'boardroom-annotation',
  label: 'Boardroom · 外脑批注',
  prism: 'boardroom',
  outputSchema: Out,
  maxTokens: 1500,
  temperature: 0.7,

  systemPrompt: () =>
    `你是被聘来给 CEO 预读包写批注的外部专家。要有立场、有锚点、有数据。
mode 含义：
- synthesis = 综合（你认同 + 补充论据）
- contrast  = 对比反方（指出"另一种讲法"会更稳）
- counter   = 直接反驳（指出 CEO 此处错了）
- extension = 延伸（CEO 没意识到的二阶影响）

输出要求：
- highlight 一句话核心观点 ≤40 字（背在心里就能拿出来）
- body_md 完整批注正文 200-700 字（Markdown），必含至少一个量化锚点
- citations 至少 1 条（type=meeting/asset/echo），id 必须来自我给的列表
- 不允许"建议/应该/推荐"开头 — 直接陈述事实/反驳/数据

仅输出 JSON：{"mode","highlight","body_md","citations":[{type,id,label}]}`,

  userPrompt: (ctx) => {
    const expertName = (ctx.extra?.expertName as string | undefined) ?? '匿名外部专家';
    const expertId = (ctx.extra?.expertId as string | undefined) ?? 'unknown';
    const briefStr = ctx.brief
      ? `预读包: ${ctx.brief.boardSession ?? '?'} v${ctx.brief.version}, ${ctx.brief.pageCount ?? '?'} 页\nTOC: ${JSON.stringify(ctx.brief.toc)}`
      : '（无 brief 上下文）';
    const concernsLines = ctx.judgments.slice(0, 8).map((j) => `- [${j.kind}] ${j.text.slice(0, 120)}`).join('\n');
    return `Scope: ${ctx.scopeName ?? '?'}
专家身份: ${expertName} (id: ${expertId})
${briefStr}

可引用的 meetings:
${ctx.meetings.slice(0, 10).map((m) => `- meeting:${m.id} → ${m.title}`).join('\n')}

近 90 天关切/判断:
${concernsLines}

请基于专家身份给出一条批注（mode 自选，但要从 4 个里挑）。`;
  },

  qualityChecks: [
    (out, ctx) => {
      const validIds = new Set<string>([
        ...ctx.meetings.map((m) => m.id),
      ]);
      for (const c of out.citations) {
        // 容错：LLM 偶尔会把 type 当 prefix 拼进 id（"meeting:xxx-uuid"）
        const cleanId = c.id.replace(/^(meeting|asset|echo):/i, '');
        if (c.type === 'meeting' && !validIds.has(cleanId)) {
          return `citation meeting:${c.id} 不在会议列表（LLM 编造）`;
        }
      }
      return null;
    },
    (out) => {
      if (!/\d/.test(out.body_md)) return 'body_md 缺量化锚点';
      return null;
    },
    (out) => {
      if (/^(建议|应该|推荐|可以考虑)/.test(out.body_md.trim())) {
        return 'body_md 不允许"建议/应该/推荐"开头';
      }
      return null;
    },
  ],
};
