/**
 * classifyMeeting — heuristic meetingKind detector
 *
 * Maps (title, content) → one of:
 *   strategy_roadshow | tech_review | expert_interview |
 *   industry_research | internal_ops
 *
 * v1 is pure keyword/structure regex. A future version may tag-team with
 * inputProcessor's LLM fallback.
 */
import { describe, it, expect } from 'vitest';
import { classifyMeeting } from '../../src/services/meetingClassifier.js';

describe('classifyMeeting', () => {
  it('recognises strategy roadshows', () => {
    expect(classifyMeeting('2026Q2 融资路演', '与红杉交流...').kind).toBe('strategy_roadshow');
    expect(classifyMeeting('战略规划讨论', 'IPO 节奏...').kind).toBe('strategy_roadshow');
  });

  it('recognises technical reviews', () => {
    expect(classifyMeeting('模型架构评审', '讨论 transformer 层数').kind).toBe('tech_review');
    expect(classifyMeeting('算法验收', '推理延迟要低于 200ms').kind).toBe('tech_review');
  });

  it('recognises expert interviews by Q/A structure', () => {
    const content = `问：你们现在用的什么框架？
答：主要是 PyTorch。
问：训练多久一次？
答：每天凌晨跑一轮。`;
    expect(classifyMeeting('客户访谈 - 某银行 CTO', content).kind).toBe('expert_interview');
  });

  it('recognises expert interviews by Q:/A: ascii', () => {
    const content = 'Q: What stack are you using?\nA: We use Fastify + React.\nQ: How many engineers?\nA: Twelve.';
    expect(classifyMeeting('Tech stack interview', content).kind).toBe('expert_interview');
  });

  it('recognises industry research', () => {
    expect(classifyMeeting('新能源行业调研记录', '走访三家电池厂...').kind).toBe('industry_research');
    expect(classifyMeeting('半导体行业走访', '产能分布...').kind).toBe('industry_research');
  });

  it('flags internal ops as default for周会/OKR/复盘', () => {
    expect(classifyMeeting('产品周会 2026-W17', 'OKR 回顾').kind).toBe('internal_ops');
    expect(classifyMeeting('工程站会', '昨天/今天/阻塞').kind).toBe('internal_ops');
    expect(classifyMeeting('季度复盘', '回顾 Q1 成绩').kind).toBe('internal_ops');
  });

  it('falls back to internal_ops when no signal matches', () => {
    const result = classifyMeeting('备忘', '随便写点东西');
    expect(result.kind).toBe('internal_ops');
    expect(result.confidence).toBeLessThan(0.5);
  });

  it('returns confidence in [0,1] and a reason string', () => {
    const r = classifyMeeting('技术评审', '架构讨论');
    expect(r.confidence).toBeGreaterThan(0);
    expect(r.confidence).toBeLessThanOrEqual(1);
    expect(typeof r.reason).toBe('string');
    expect(r.reason.length).toBeGreaterThan(0);
  });

  it('prefers tech_review over internal_ops when both signal', () => {
    expect(classifyMeeting('工程周会 - 架构评审议题', '讨论 v3 架构').kind).toBe('tech_review');
  });

  it('prefers expert_interview over other kinds when Q/A structure clearly present', () => {
    const content = `问：路演最近怎么样？
答：融资顺利。
问：技术团队规模？
答：120 人。`;
    expect(classifyMeeting('CTO 专访 - 融资路演进展', content).kind).toBe('expert_interview');
  });
});
