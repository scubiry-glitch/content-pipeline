// boardroom-promises · CEO 自有董事会承诺 → ceo_board_promises
//
// 输入：scope director concerns（含 id）+ 现有 mn_commitments + brief
// 输出：3-6 条 CEO 主动答复董事关切的具体承诺（带 owner / due_at）
//
// 与 mn_commitments 区分：
//   mn_commitments 是会议中提到的承诺（任意人对任意人）
//   ceo_board_promises 是 CEO 视角下"为了消化董事关切"主动写下的、要在 brief 里
//   公开声明的承诺，强调主语是 CEO 自己。

import { z } from 'zod';
import type { PromptDef, PromptCtx } from './types.js';

const Promise = z.object({
  what: z.string().min(20).max(200),
  owner: z.string().min(2).max(40),
  due_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'due_at 必须 YYYY-MM-DD'),
  // 接受 LLM 偶尔输出的 'planned'/'pending' 等近义词，统一映射到 in_progress
  status: z.preprocess(
    (v) => {
      if (typeof v !== 'string') return 'in_progress';
      const s = v.toLowerCase();
      if (['done', 'in_progress', 'late', 'dropped'].includes(s)) return s;
      if (['planned', 'pending', 'todo', 'scheduled', 'in-progress', 'active'].includes(s)) return 'in_progress';
      if (['cancelled', 'canceled', 'abandoned'].includes(s)) return 'dropped';
      if (['overdue', 'delayed'].includes(s)) return 'late';
      return 'in_progress';
    },
    z.enum(['done', 'in_progress', 'late', 'dropped']),
  ),
  linked_concern_topic: z.string().nullable(),
  rationale: z.string().min(20).max(240),
}).strict();

const Out = z.object({
  promises: z.array(Promise).min(3).max(8),
}).strict();

type OutT = z.infer<typeof Out>;

export const boardroomPromisesPrompt: PromptDef<OutT> = {
  axis: 'boardroom-promises',
  label: 'Boardroom · CEO 主动承诺',
  prism: 'boardroom',
  outputSchema: Out,
  maxTokens: 2000,
  temperature: 0.6,

  systemPrompt: () =>
    `你是 CEO 自己。基于董事关切 + 现有承诺空白，写下 3-6 条本季要在董事会预读包里公开声明的承诺。
要求：
- what 必须 SMART：含具体数字 / 频次 / 节点（"每月报告增加 3 个有效退出窗口预测"，不要"加强透明度"）
- owner 必须是真实角色（"陈汀" / "Wei + 陈汀" / "Sara M."），≥2 字
- due_at 是 YYYY-MM-DD 真实日期（必须晚于今天且早于今年底）
- linked_concern_topic 把承诺挂在某条董事关切话题上（不挂留 null）
- rationale 一句话讲为什么值得作为 boardroom 承诺（不是 mn_commitments 那种会议派生承诺），≥30 字
- 至少 1 条 status='in_progress'，至少 1 条 due_at 在 60 天内
- 不允许"建议/应该/推荐"开头
仅输出 JSON：{"promises":[{what, owner, due_at, status, linked_concern_topic, rationale}, ...]}`,

  userPrompt: (ctx) => {
    const today = new Date().toISOString().slice(0, 10);
    const briefStr = ctx.brief
      ? `预读包: ${ctx.brief.boardSession ?? '?'} v${ctx.brief.version}`
      : '当前无 draft brief';
    return `Scope: ${ctx.scopeName ?? '(未命名)'}
今天: ${today}
${briefStr}

董事画像（${ctx.directors.length}）：
${ctx.directors.map((d) => `- ${d.name} (${d.role ?? '?'})`).join('\n')}

近期会议派生承诺（${ctx.commitments.length}）：
${ctx.commitments.slice(0, 12).map((c) => `- [${c.status}] ${c.text.slice(0, 110)}${c.dueAt ? ` (due ${c.dueAt.slice(0, 10)})` : ''}`).join('\n')}

近 90 天关键判断：
${ctx.judgments.slice(0, 15).map((j) => `- [${j.kind}] ${j.text.slice(0, 100)}`).join('\n')}

请输出 3-6 条 CEO 主动承诺。`;
  },

  qualityChecks: [
    (out) => {
      for (const p of out.promises) {
        if (!/\d/.test(p.what)) return `承诺缺量化锚点: ${p.what.slice(0, 50)}`;
      }
      return null;
    },
    (out) => {
      const today = new Date();
      const yearEnd = new Date(today.getFullYear(), 11, 31);
      for (const p of out.promises) {
        const due = new Date(p.due_at);
        if (Number.isNaN(due.getTime())) return `due_at 不可解析: ${p.due_at}`;
        if (due < today) return `due_at 早于今天: ${p.due_at}`;
        if (due > new Date(today.getFullYear() + 1, 5, 30)) return `due_at 太远: ${p.due_at}`;
      }
      return null;
    },
    (out) => {
      // 至少 1 条 60 天内
      const today = Date.now();
      const has60 = out.promises.some((p) => {
        const due = new Date(p.due_at).getTime();
        return due - today < 60 * 86400 * 1000;
      });
      if (!has60) return '至少需要 1 条 due_at 在 60 天内';
      return null;
    },
  ],
};
