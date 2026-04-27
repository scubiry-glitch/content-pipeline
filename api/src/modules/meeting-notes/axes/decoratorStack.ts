// axes/decoratorStack.ts — Step3 第 4 步「装饰器 stack」的真实落地
//
// 前端文案："evidence_anchored → calibrated_confidence → knowledge_grounded"
// 之前完全装饰性 —— callExpertOrLLM 把 systemPrompt 原样发给 LLM，没有这些字段。
// 本模块把 strategySpec（"evidence_anchored|calibrated_confidence|...|base"）
// 解析成可叠加的 system prompt 装饰，并暴露 applyDecoratorStack 工具。
//
// 调用链：
//   strategySpec → splitDecorators → 每个 decorator 注入对应 instruction →
//   合成最终 systemPrompt → 由 _shared.callExpertOrLLM 走 LLM
//
// AsyncLocalStorage 让 axis computer 不必感知 strategy；runEngine 在 execute()
// 顶层注入 currentStrategySpec，axis 内部 callExpertOrLLM 自动读到。

import { AsyncLocalStorage } from 'node:async_hooks';

export interface StrategyContext {
  strategySpec: string | null;
  preset: 'lite' | 'standard' | 'max';
  /**
   * Step 2 用户为不同角色指定的真实专家 → 拼成的 persona system prompt 段，
   * 按 axis 索引。callExpertOrLLM 在跑某个 axis 时会读这里把 persona 注入。
   * 没有指定专家时为 undefined，表示沿用通用提示词。
   */
  expertPersonaByAxis?: Record<string, string>;
  /**
   * runEngine 在 axes loop 内部嵌套 strategyStorage.run() 时把当前 axis 推进来，
   * 让 callExpertOrLLM 不必改签名就能按 axis 取 persona。axis computer 内部
   * 是否需要它无关紧要。
   */
  currentAxis?: string;
}

export const strategyStorage = new AsyncLocalStorage<StrategyContext>();

/** 每个装饰器的 instruction —— 追加到 system prompt 之后。 */
const DECORATOR_INSTRUCTIONS: Record<string, string> = {
  evidence_anchored: [
    '【证据锚定】',
    '- 每条结论必须给出 evidence_excerpt（原文片段，≤80 字）',
    '- evidence_excerpt 必须可在素材中精确检索到，不得复述',
    '- 没有素材直接支持的判断，必须显式标注 inferred=true',
  ].join('\n'),
  calibrated_confidence: [
    '【置信度校准】',
    '- 每条结论附 confidence ∈ [0,1]，仅在 ≥ 0.7 时为高置信',
    '- 含义：0.5 ≈ 模糊推断，0.7 ≈ 文本明示，0.9 ≈ 多处互证',
    '- 禁止默认填 1.0；不确定时低于 0.6',
  ].join('\n'),
  knowledge_grounded: [
    '【知识锚定】',
    '- 引用心智模型 / 行业共识 / 历史判例时给出 source_label',
    '- 没有可信来源的"行业共识"必须降级为推断',
  ].join('\n'),
  failure_check: [
    '【失败模式扫描】',
    '- 输出前自检：是否过早归因？是否忽略反例？是否把相关性当因果？',
    '- 命中任一项需在结果末尾加 self_critique 字段',
  ].join('\n'),
  rubric_anchored_output: [
    '【评分维度对齐】',
    '- 输出 JSON 字段名必须严格遵守上文 schema',
    '- 不得新增字段；缺失字段用 null 显式占位',
  ].join('\n'),
  contradictions_surface: [
    '【矛盾外显】',
    '- 发现素材内自相矛盾的陈述时单独列 contradictions[]',
    '- 包含 a / b / weight（孰更可信）',
  ].join('\n'),
  signature_style: [
    '【风格】',
    '- 中文输出；语气克制、不堆砌形容词',
    '- 优先使用动词与具体数字；避免"赋能/抓手/链路"等套话',
  ].join('\n'),
  emm_iterative: [
    '【EMM 否决式自评】',
    '- 输出后自评是否触发 dealbreaker，若触发则降级为 needs_revision',
  ].join('\n'),
  heuristic_trigger_first: [
    '【启发式优先】',
    '- 先列触发的 heuristic / 心智模型，再展开论证',
  ].join('\n'),
  track_record_verify: [
    '【履历核验】',
    '- 引用专家观点前用 metadata.track_record 核对',
  ].join('\n'),
  mental_model_rotation: [
    '【心智模型轮转】',
    '- 至少切换 2 种视角（如 incentives / time horizons）',
  ].join('\n'),
};

export function splitDecorators(spec: string | null): string[] {
  if (!spec) return [];
  return spec.split('|').map((s) => s.trim()).filter(Boolean);
}

/** 把装饰器逐条追加到 system prompt 末尾，返回新 prompt。 */
export function applyDecoratorStack(
  basePrompt: string,
  spec: string | null,
): { prompt: string; applied: string[]; skipped: string[] } {
  const decorators = splitDecorators(spec);
  const applied: string[] = [];
  const skipped: string[] = [];
  const lines: string[] = [basePrompt.trim()];
  for (const d of decorators) {
    if (d === 'base' || d === 'single' || d === 'debate') {
      // 这些是 strategy 类型而非装饰器，跳过
      continue;
    }
    const instr = DECORATOR_INSTRUCTIONS[d];
    if (instr) {
      lines.push('', instr);
      applied.push(d);
    } else {
      skipped.push(d);
    }
  }
  return { prompt: lines.join('\n'), applied, skipped };
}

/** 给 axis computer 用：返回当前 run 的 strategy。 */
export function getCurrentStrategy(): StrategyContext | undefined {
  return strategyStorage.getStore();
}

/** 给 callExpertOrLLM 用：取当前 axis 对应的 expert persona system prompt 段（无则空串）。 */
export function getCurrentExpertPersona(): string {
  const ctx = strategyStorage.getStore();
  const axis = ctx?.currentAxis;
  if (!axis || !ctx?.expertPersonaByAxis) return '';
  return ctx.expertPersonaByAxis[axis] ?? '';
}
