// CEO 棱镜 prompt 模块 — 共享类型
//
// 设计目的：把每个 axis（compass-stars / boardroom-rebuttal 等）的 prompt 与
// 输出结构、质量校验从 runHandlers.ts 抽出来，做到：
//   1. 每个棱镜的"preset scope"集中可读 + 单元测试可定位
//   2. LLM 输出走 zod 严格校验，schema 不通过 → run 标 failed，不写脏数据
//   3. quality checks 强制要求量化锚点 + meeting/asset 引用 + 长度区间，
//      避免 LLM 输出"务虚 / 无据"内容污染前端展示

import type { z } from 'zod';

/** prompt 加工时可用的全部上下文 — 由 loadPromptCtx 在 runHandlers 里组装 */
export interface PromptCtx {
  scopeId: string | null;
  scopeName: string | null;
  /** scope 下绑定的会议（assets.id + title），按 bound_at DESC 取前 N 条 */
  meetings: { id: string; title: string; createdAt: string | null }[];
  /** 近 90 天 mn_judgments，跨 scope（scope null 时也含全局）*/
  judgments: { kind: string; text: string; createdAt: string }[];
  /** 近 90 天 mn_commitments；用于 boardroom / tower */
  commitments: { text: string; dueAt: string | null; status: string; ownerName?: string }[];
  /** ceo_directors（boardroom-* / annotations 用） */
  directors: { id: string; name: string; role: string | null; weight: number }[];
  /** 当前 draft 的 ceo_briefs；annotations / rebuttal 挂在它上面 */
  brief: {
    id: string;
    boardSession: string | null;
    version: number;
    toc: unknown;
    pageCount: number | null;
  } | null;
  /** scope 下战略线（compass-echo / drift 写时回查） */
  strategicLines: { id: string; name: string; kind: 'main' | 'branch' | 'drift'; description: string | null }[];
  /** scope 下利益相关方（situation-signal 用） */
  stakeholders: { id: string; name: string; kind: string; heat: number }[];
  /** runId — 写表时挂 generated_run_id */
  runId: string;
  /** axis-specific extra fields — handler 可通过 metadata 注入 */
  extra?: Record<string, unknown>;
}

/** 单条 quality check：输入 LLM 解析出的对象，返回错误描述（null = 通过）*/
export type QualityCheck<TOut> = (out: TOut, ctx: PromptCtx) => string | null;

export interface PromptDef<TOut = unknown> {
  /** axis 字符串 — 与 mn_runs.axis 列、HANDLERS 表对齐 */
  axis: string;
  /** 给前端 / 日志看的人类标签 */
  label: string;
  /** 哪个棱镜（用于面板分组与统计） */
  prism: 'compass' | 'boardroom' | 'tower' | 'war-room' | 'situation' | 'balcony';
  systemPrompt: (ctx: PromptCtx) => string;
  userPrompt: (ctx: PromptCtx) => string;
  /** zod schema — strict() 严格模式禁多余字段。
   *  用 ZodType<TOut, ZodTypeDef, any> 让 input 类型自由（带 .optional().default() 的 schema 输入与输出不同）。 */
  outputSchema: z.ZodType<TOut, z.ZodTypeDef, any>;
  /** 质量校验列表 — 任一返回非 null → 视为 LLM 失败 */
  qualityChecks: QualityCheck<TOut>[];
  /** LLM 调参 */
  maxTokens?: number;
  temperature?: number;
  /** 非空 → 发现引用 ID 不在 ctx 内自动剔除（防 LLM 编造） */
  citationDomains?: ('meeting' | 'asset' | 'echo')[];
}

// ─────────────────────────────────────────────────────────
// 通用 quality check 工厂 — 多个 prompt 复用
// ─────────────────────────────────────────────────────────

/** 必须含至少一个量化数据点（数字 / 百分比 / 时间窗）*/
export function requireNumericAnchor<T>(getText: (out: T) => string): QualityCheck<T> {
  return (out) => {
    const text = getText(out);
    if (!/\d/.test(text)) {
      return '缺少量化锚点（要求文本含至少一个数字 / 百分比 / 时间）';
    }
    return null;
  };
}

/** 必须含至少一条 citation（meeting/asset/echo） */
export function requireCitations<T>(getCitations: (out: T) => unknown[]): QualityCheck<T> {
  return (out) => {
    const arr = getCitations(out);
    if (!Array.isArray(arr) || arr.length === 0) {
      return '缺少 citations（必须引用至少一条 meeting / asset / echo）';
    }
    return null;
  };
}

/** 文本不能以"建议 / 应该 / 推荐"开头（balcony-prompt 例外，要求事实陈述）*/
export function forbidAdviceOpener<T>(getText: (out: T) => string): QualityCheck<T> {
  return (out) => {
    const text = getText(out).trim();
    if (/^(建议|应该|推荐|你应该|可以考虑)/.test(text)) {
      return '不允许"建议/应该/推荐"开头 — 要求直接陈述事实/反驳/数据';
    }
    return null;
  };
}

/** 长度在 [min, max] 区间 */
export function requireLength<T>(
  getText: (out: T) => string,
  min: number,
  max: number,
): QualityCheck<T> {
  return (out) => {
    const len = getText(out).length;
    if (len < min) return `长度 ${len} 小于下限 ${min}`;
    if (len > max) return `长度 ${len} 超过上限 ${max}`;
    return null;
  };
}
