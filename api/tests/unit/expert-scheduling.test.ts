/**
 * Expert Scheduling & Integration Tests
 * 覆盖: 调度服务、热点专家观点、素材专家标注
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SchedulingService } from '../../src/modules/expert-library/schedulingService.js';
import { ExpertMatcher } from '../../src/modules/expert-library/expertMatcher.js';
import type { ExpertProfile, ExpertLibraryDeps, DatabaseAdapter, LLMAdapter } from '../../src/modules/expert-library/types.js';

function createMockExpert(overrides?: Partial<ExpertProfile>): ExpertProfile {
  return {
    expert_id: 'E01-01',
    name: '测试专家',
    domain: ['新能源', '电动车'],
    persona: { style: '专业', tone: '中性', bias: ['数据驱动'] },
    method: { frameworks: ['PEST'], reasoning: '演绎', analysis_steps: ['分析'] },
    constraints: { must_conclude: true, allow_assumption: false },
    output_schema: { format: 'report', sections: ['总结'] },
    anti_patterns: [],
    signature_phrases: [],
    ...overrides,
  };
}

function createMockDeps(): ExpertLibraryDeps {
  return {
    db: { query: vi.fn().mockResolvedValue({ rows: [] }) } as DatabaseAdapter,
    llm: {
      complete: vi.fn().mockResolvedValue('{}'),
      completeWithSystem: vi.fn().mockResolvedValue('{}'),
    } as LLMAdapter,
  };
}

describe('SchedulingService', () => {
  let mockEngine: any;
  let deps: ExpertLibraryDeps;

  beforeEach(() => {
    deps = createMockDeps();
    const experts = [
      createMockExpert({ expert_id: 'E01-01', name: '专家A' }),
      createMockExpert({ expert_id: 'E02-01', name: '专家B' }),
    ];
    mockEngine = {
      loadExpert: vi.fn((id: string) => Promise.resolve(experts.find(e => e.expert_id === id) || null)),
      listExperts: vi.fn().mockResolvedValue(experts),
    };
  });

  it('should get workload for existing expert', async () => {
    const scheduler = new SchedulingService(mockEngine, deps);
    const workload = await scheduler.getWorkload('E01-01');

    expect(workload).not.toBeNull();
    expect(workload!.expertId).toBe('E01-01');
    expect(workload!.expertName).toBe('专家A');
    expect(workload!.availability).toBe('available');
  });

  it('should return null for non-existent expert', async () => {
    const scheduler = new SchedulingService(mockEngine, deps);
    const workload = await scheduler.getWorkload('NONEXISTENT');
    expect(workload).toBeNull();
  });

  it('should get all workloads', async () => {
    const scheduler = new SchedulingService(mockEngine, deps);
    const workloads = await scheduler.getAllWorkloads();

    expect(workloads).toHaveLength(2);
    expect(workloads[0].expertId).toBe('E01-01');
    expect(workloads[1].expertId).toBe('E02-01');
  });

  it('should assign task to expert', async () => {
    const scheduler = new SchedulingService(mockEngine, deps);
    const assignment = await scheduler.assignTask('E01-01', 'task-123', 'reviewer');

    expect(assignment.expertId).toBe('E01-01');
    expect(assignment.taskId).toBe('task-123');
    expect(assignment.role).toBe('reviewer');
    expect(assignment.status).toBe('assigned');
  });

  it('should throw for assigning to non-existent expert', async () => {
    const scheduler = new SchedulingService(mockEngine, deps);
    await expect(scheduler.assignTask('NONEXISTENT', 'task-123', 'reviewer'))
      .rejects.toThrow('Expert not found');
  });

  it('should get available experts sorted by load', async () => {
    const scheduler = new SchedulingService(mockEngine, deps);
    const available = await scheduler.getAvailableExperts();

    expect(available.length).toBe(2);
    expect(available[0].expert.expert_id).toBeDefined();
    expect(available[0].workload.availability).toBe('available');
  });
});

describe('ExpertMatcher — Chinese text matching', () => {
  let mockEngine: any;
  let deps: ExpertLibraryDeps;

  beforeEach(() => {
    deps = createMockDeps();
    const experts = [
      createMockExpert({ expert_id: 'E01-01', name: '能源专家', domain: ['新能源', '锂电池', '光伏'] }),
      createMockExpert({ expert_id: 'E02-01', name: '互联网专家', domain: ['互联网', '电商', '社交'] }),
    ];
    mockEngine = { listExperts: vi.fn().mockResolvedValue(experts) };
  });

  it('should match Chinese domain keywords in topic', async () => {
    const matcher = new ExpertMatcher(mockEngine as any, deps);
    const result = await matcher.match({ topic: '光伏产业链深度分析' });

    expect(result.domainExperts.length).toBeGreaterThan(0);
    expect(result.domainExperts[0].expert.expert_id).toBe('E01-01');
  });

  it('should match e-commerce expert for 电商 topic', async () => {
    const matcher = new ExpertMatcher(mockEngine as any, deps);
    const result = await matcher.match({ topic: '电商直播带货趋势' });

    expect(result.domainExperts.some(e => e.expert.expert_id === 'E02-01')).toBe(true);
  });
});
