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
  // due_at 容忍多种日期写法 — LLM 偶尔输出 "2026年6月15日" / "2026/06/15" / "Q2 end"
  // 统一 preprocess 到 YYYY-MM-DD，没法解析的报错
  due_at: z.preprocess(
    (v) => {
      if (typeof v !== 'string') return v;
      const trimmed = v.trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
      // "2026年6月15日" / "2026年06月15日"
      const cn = trimmed.match(/^(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日?$/);
      if (cn) return `${cn[1]}-${cn[2].padStart(2, '0')}-${cn[3].padStart(2, '0')}`;
      // "2026/06/15" / "2026.06.15"
      const slash = trimmed.match(/^(\d{4})[\/\.](\d{1,2})[\/\.](\d{1,2})$/);
      if (slash) return `${slash[1]}-${slash[2].padStart(2, '0')}-${slash[3].padStart(2, '0')}`;
      // ISO 全字符串带时间 → 截前 10 位
      const iso = trimmed.match(/^(\d{4}-\d{2}-\d{2})T\d{2}:/);
      if (iso) return iso[1];
      // 兜底：扔给 Date
      const d = new Date(trimmed);
      if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
      return v;  // 让下游 regex 拒掉
    },
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'due_at 无法解析为 YYYY-MM-DD'),
  ),
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

【硬约束 — 违反任何一条都会被判失败重新生成】
H1. 每条 what 必须含至少 1 个数字 (百分比 / 计数 / 频次 / 金额 / 时间窗口)
    反例 (无数字, 失败): "新增「规模成本曲线」专章, 披露当月新签城市三项指标"
    正例: "每月新签 ≥3 个城市的单房成本/调度成本/毛利率, 季报中披露 4 城市样本"
H2. due_at 必须 YYYY-MM-DD, 早于今年底, 晚于今天
H3. 至少 1 条 due_at 在今天起 60 天内 (近期可验证)
H4. owner 必须是真实姓名 / 角色 (来自 directors 列表), ≥2 字, 禁止 "团队/相关方" 等空泛词

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
