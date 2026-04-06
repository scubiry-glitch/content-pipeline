/**
 * Expert Library Module Tests
 * 覆盖: 类型定义、专家匹配、大纲评审、辩论引擎、提示词个性化
 * 对应测试用例: TC-001 ~ TC-010
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { assertExpertProfile } from '../../src/modules/expert-library/expertProfileDb.js';
import { buildSystemPrompt } from '../../src/modules/expert-library/promptBuilder.js';
import { ExpertMatcher } from '../../src/modules/expert-library/expertMatcher.js';
import type {
  ExpertProfile,
  ExpertLibraryDeps,
  DatabaseAdapter,
  LLMAdapter,
} from '../../src/modules/expert-library/types.js';

// ===== Mock Data =====

function createMockExpert(overrides?: Partial<ExpertProfile>): ExpertProfile {
  return {
    expert_id: 'E01-01',
    name: '测试专家',
    domain: ['新能源', '电动车', '锂电池'],
    persona: {
      style: '数据驱动，逻辑严谨',
      tone: '专业但不失亲和',
      bias: ['关注成本结构', '重视技术路径'],
      cognition: {
        mentalModel: '第一性原理拆解',
        decisionStyle: '数据+模型驱动',
        riskAttitude: '风险中性，量化评估',
        timeHorizon: '3-5年产业周期',
      },
      values: {
        excites: ['成本突破', '技术创新'],
        irritates: ['空洞概念', '缺乏数据'],
        qualityBar: '必须有可验证的数据支撑',
        dealbreakers: ['违反物理定律', '数据造假'],
      },
      taste: {
        admires: ['特斯拉财报的信息密度'],
        disdains: ['八股文研报'],
        benchmark: '麦肯锡报告级别',
      },
      voice: {
        disagreementStyle: '直接指出逻辑漏洞',
        praiseStyle: '给出具体数据佐证',
      },
    },
    method: {
      frameworks: ['PEST', 'Porter五力', '价值链分析'],
      reasoning: '演绎推理为主',
      analysis_steps: ['明确问题', '收集数据', '建立模型', '得出结论'],
      reviewLens: {
        firstGlance: '数据完整性',
        deepDive: ['假设合理性', '模型健壮性'],
        killShot: '核心数据缺失',
        bonusPoints: ['独到洞察', '反直觉结论'],
      },
    },
    emm: {
      critical_factors: ['数据质量', '逻辑严密', '结论可行'],
      factor_hierarchy: { '数据质量': 0.4, '逻辑严密': 0.35, '结论可行': 0.25 },
      veto_rules: ['数据造假', '逻辑自相矛盾'],
      aggregation_logic: 'weighted_score',
    },
    constraints: { must_conclude: true, allow_assumption: false },
    output_schema: { format: 'structured_report', sections: ['总结', '分析', '建议'] },
    anti_patterns: ['不要使用模糊表述', '不要回避给出结论'],
    signature_phrases: ['数据说话', '让我们看看数字'],
    ...overrides,
  };
}

function createMockDeps(): ExpertLibraryDeps {
  const db: DatabaseAdapter = {
    query: vi.fn().mockResolvedValue({ rows: [] }),
  };
  const llm: LLMAdapter = {
    complete: vi.fn().mockResolvedValue('mock response'),
    completeWithSystem: vi.fn().mockResolvedValue('mock response'),
  };
  return { db, llm };
}

// ===== TC-001: 类型定义完整性 =====
describe('TC-001: ExpertProfile Type Completeness', () => {
  it('should validate a complete expert profile', () => {
    const expert = createMockExpert();
    expect(assertExpertProfile(expert)).toBe(true);
  });

  it('should reject profile missing required fields', () => {
    expect(assertExpertProfile(null)).toBe(false);
    expect(assertExpertProfile({})).toBe(false);
    expect(assertExpertProfile({ expert_id: 'test' })).toBe(false);
  });

  it('should reject profile with invalid EMM weights (sum != 1)', () => {
    const expert = createMockExpert({
      emm: {
        critical_factors: ['a', 'b'],
        factor_hierarchy: { a: 0.3, b: 0.3 }, // sum = 0.6
        veto_rules: [],
        aggregation_logic: 'weighted_score',
      },
    });
    expect(assertExpertProfile(expert)).toBe(false);
  });

  it('should accept profile with valid EMM weights (sum = 1)', () => {
    const expert = createMockExpert({
      emm: {
        critical_factors: ['a', 'b'],
        factor_hierarchy: { a: 0.6, b: 0.4 },
        veto_rules: [],
        aggregation_logic: 'weighted_score',
      },
    });
    expect(assertExpertProfile(expert)).toBe(true);
  });
});

// ===== TC-002: 提示词构建 =====
describe('TC-002: Prompt Builder with Personalization', () => {
  it('should include persona identity', () => {
    const expert = createMockExpert();
    const prompt = buildSystemPrompt(expert);
    expect(prompt).toContain('测试专家');
    expect(prompt).toContain('数据驱动');
    expect(prompt).toContain('新能源');
  });

  it('should include decision DNA section', () => {
    const expert = createMockExpert();
    const prompt = buildSystemPrompt(expert);
    expect(prompt).toContain('决策基因');
    expect(prompt).toContain('第一性原理');
    expect(prompt).toContain('必须有可验证的数据支撑');
  });

  it('should include task personalization for analysis', () => {
    const expert = createMockExpert();
    const prompt = buildSystemPrompt(expert, { taskType: 'analysis' });
    expect(prompt).toContain('本次任务个性化指引');
    expect(prompt).toContain('数据+模型驱动');
    expect(prompt).toContain('风险中性');
  });

  it('should include evaluation-specific lens', () => {
    const expert = createMockExpert();
    const prompt = buildSystemPrompt(expert, { taskType: 'evaluation' });
    expect(prompt).toContain('数据完整性'); // firstGlance
    expect(prompt).toContain('核心数据缺失'); // killShot
  });

  it('should include generation-specific guidance', () => {
    const expert = createMockExpert();
    const prompt = buildSystemPrompt(expert, { taskType: 'generation' });
    expect(prompt).toContain('成本突破'); // excites
    expect(prompt).toContain('八股文研报'); // disdains
  });

  it('should include EMM rules', () => {
    const expert = createMockExpert();
    const prompt = buildSystemPrompt(expert);
    expect(prompt).toContain('判断规则');
    expect(prompt).toContain('数据质量');
    expect(prompt).toContain('一票否决');
  });

  it('should include anti-patterns and signature phrases', () => {
    const expert = createMockExpert();
    const prompt = buildSystemPrompt(expert);
    expect(prompt).toContain('不要使用模糊表述');
    expect(prompt).toContain('数据说话');
  });
});

// ===== TC-003 ~ TC-004: 专家匹配 =====
describe('TC-003/004: Expert Matching by Domain', () => {
  let mockEngine: any;
  let deps: ExpertLibraryDeps;

  beforeEach(() => {
    deps = createMockDeps();
    const experts = [
      createMockExpert({ expert_id: 'E01-01', name: '新能源专家', domain: ['新能源', '锂电池'] }),
      createMockExpert({ expert_id: 'E02-01', name: '互联网专家', domain: ['互联网', '社交媒体', '电商'] }),
      createMockExpert({ expert_id: 'E03-01', name: '金融专家', domain: ['金融', '投资', '银行'] }),
      createMockExpert({ expert_id: 'S-01', name: '战略大师', domain: ['战略', '投资', '科技'] }),
    ];
    mockEngine = {
      listExperts: vi.fn().mockResolvedValue(experts),
      loadExpert: vi.fn((id: string) => Promise.resolve(experts.find(e => e.expert_id === id) || null)),
    };
  });

  it('should match domain experts by topic keywords', async () => {
    const matcher = new ExpertMatcher(mockEngine, deps);
    const result = await matcher.match({ topic: '新能源汽车锂电池产业链分析' });

    expect(result.domainExperts.length).toBeGreaterThan(0);
    expect(result.domainExperts[0].expert.expert_id).toBe('E01-01');
    expect(result.domainExperts[0].matchScore).toBeGreaterThan(0);
  });

  it('should return empty for non-matching topic', async () => {
    const matcher = new ExpertMatcher(mockEngine, deps);
    const result = await matcher.match({ topic: '农业种植技术' });

    // No exact domain match, should return low or no results
    const highScoreExperts = result.domainExperts.filter(e => e.matchScore > 20);
    expect(highScoreExperts.length).toBe(0);
  });

  it('should match with industry filter', async () => {
    const matcher = new ExpertMatcher(mockEngine, deps);
    const result = await matcher.match({ topic: '市场分析', industry: '互联网' });

    expect(result.domainExperts.some(e => e.expert.expert_id === 'E02-01')).toBe(true);
  });
});

// ===== TC-005 ~ TC-006: 特级专家触发 =====
describe('TC-005/006: Senior Expert Triggering', () => {
  let mockEngine: any;
  let deps: ExpertLibraryDeps;

  beforeEach(() => {
    deps = createMockDeps();
    const experts = [
      createMockExpert({ expert_id: 'E01-01', name: '领域专家', domain: ['科技'] }),
      createMockExpert({ expert_id: 'S-01', name: '战略大师', domain: ['战略', '科技', '投资'] }),
    ];
    mockEngine = {
      listExperts: vi.fn().mockResolvedValue(experts),
    };
  });

  it('should NOT include senior expert for low importance tasks', async () => {
    const matcher = new ExpertMatcher(mockEngine, deps);
    const result = await matcher.match({ topic: '科技趋势', importance: 0.5 });

    expect(result.seniorExpert).toBeUndefined();
  });

  it('should include senior expert for high importance tasks', async () => {
    const matcher = new ExpertMatcher(mockEngine, deps);
    const result = await matcher.match({ topic: '科技趋势', importance: 0.9 });

    expect(result.seniorExpert).toBeDefined();
    expect(result.seniorExpert!.expert.expert_id).toBe('S-01');
  });
});

// ===== TC-007: 通用专家分配 =====
describe('TC-007: Universal Expert Assignment', () => {
  it('should always return match reasons', async () => {
    const deps = createMockDeps();
    const mockEngine = {
      listExperts: vi.fn().mockResolvedValue([]),
    };
    const matcher = new ExpertMatcher(mockEngine as any, deps);
    const result = await matcher.match({ topic: '任意主题' });

    expect(result.matchReasons).toBeDefined();
    expect(result.matchReasons.length).toBeGreaterThan(0);
  });
});

// ===== TC-008 ~ TC-010: 风格化观点 =====
describe('TC-008/009/010: Style-Specific Opinion via Prompt', () => {
  it('should generate different prompts for different experts', () => {
    const expertA = createMockExpert({
      name: '张一鸣',
      persona: {
        ...createMockExpert().persona,
        style: '数据驱动，延迟满足感',
        cognition: {
          mentalModel: 'A/B测试思维',
          decisionStyle: '数据驱动，反直觉决策',
          riskAttitude: '高概率小赌注',
          timeHorizon: '10年',
        },
      },
    });

    const expertB = createMockExpert({
      name: '马斯克',
      persona: {
        ...createMockExpert().persona,
        style: '第一性原理，挑战一切假设',
        cognition: {
          mentalModel: '物理定律层面推导',
          decisionStyle: '物理直觉+工程验证',
          riskAttitude: '高风险高回报',
          timeHorizon: '30年',
        },
      },
    });

    const promptA = buildSystemPrompt(expertA, { taskType: 'analysis' });
    const promptB = buildSystemPrompt(expertB, { taskType: 'analysis' });

    // 不同专家的 prompt 应该有差异
    expect(promptA).not.toBe(promptB);
    expect(promptA).toContain('A/B测试思维');
    expect(promptB).toContain('物理定律层面推导');
    expect(promptA).toContain('张一鸣');
    expect(promptB).toContain('马斯克');
  });

  it('should include dealbreakers in decision DNA', () => {
    const expert = createMockExpert({
      persona: {
        ...createMockExpert().persona,
        values: {
          excites: ['创新'],
          irritates: ['守旧'],
          qualityBar: '高标准',
          dealbreakers: ['数据造假', '逻辑错误'],
        },
      },
    });

    const prompt = buildSystemPrompt(expert);
    expect(prompt).toContain('数据造假');
    expect(prompt).toContain('逻辑错误');
  });
});
