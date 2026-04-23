// v7.5 用户目的推断器 — 从历史任务分布倒推用户的"写作目的"
//
// 6 种目的(与 PurposeId 对齐):
//   建立权威 / 引发讨论 / 拉新 / 转化 / 教育 / 消费决策
//
// 推断流程:
//   1) 查最近 20 篇(默认)用户任务的 topic / target_formats / metadata
//   2) 用关键词规则匹配到 6 个 purpose 之一
//   3) 取出现频次最高的作为默认;无历史 → fallback '建立权威'

import type { ContentLibraryDeps, PurposeId } from '../types.js';

const PURPOSE_KEYWORDS: Record<PurposeId, string[]> = {
  '建立权威': [
    '深度', '复盘', '观察', '研究', '分析', '框架', '方法论', '范式', '本质', '第一性原理',
    '系统性', '全景', '综述',
  ],
  '引发讨论': [
    '争议', '分歧', '辩论', '反驳', '质疑', '真相', '究竟', '到底', '是否', '值得',
    '还是', '之争', '反对', '站队',
  ],
  '拉新': [
    '入门', '新手', '小白', '零基础', '一文看懂', '5 分钟', '速览', '扫盲', '基础',
    '科普', '介绍',
  ],
  '转化': [
    '推荐', '清单', '必买', '值得买', '种草', '好物', '测评', '对比', '选购', '购买',
    '性价比', '优惠',
  ],
  '教育': [
    '教程', '步骤', '指南', 'how to', '如何', '怎么', 'why', '原理', '学习', '学会',
    '掌握', '练习',
  ],
  '消费决策': [
    '值不值', '要不要', '买不买', '换不换', '投资', '配置', '仓位', '估值', '回报',
    '风险', '决策',
  ],
};

/**
 * 推断用户目的；优先级：
 *   1. 显式 options.override
 *   2. 最近 N 篇历史任务的关键词聚类最多者
 *   3. fallback '建立权威'
 */
export async function inferPurpose(
  deps: ContentLibraryDeps,
  options?: {
    userId?: string;
    override?: PurposeId;
    /** 查多少条历史任务,默认 20 */
    historyLimit?: number;
  },
): Promise<{ purpose: PurposeId; source: 'override' | 'inferred' | 'fallback'; historyCount: number }> {
  if (options?.override) {
    return { purpose: options.override, source: 'override', historyCount: 0 };
  }

  const limit = Math.max(3, Math.min(options?.historyLimit ?? 20, 100));

  let topics: string[] = [];
  try {
    const params: any[] = [limit];
    let where = `WHERE is_deleted = false AND topic IS NOT NULL`;
    if (options?.userId) {
      where += ` AND created_by = $2`;
      params.push(options.userId);
    }
    const result = await deps.db.query(
      `SELECT topic FROM tasks ${where} ORDER BY created_at DESC LIMIT $1`,
      params,
    );
    topics = result.rows.map((r: any) => String(r.topic || ''));
  } catch (err) {
    console.warn('[purposeInferrer] history query failed:', (err as Error).message);
    return { purpose: '建立权威', source: 'fallback', historyCount: 0 };
  }

  if (topics.length < 3) {
    // 历史不足 3 篇 → 不足以支撑自动推断
    return { purpose: '建立权威', source: 'fallback', historyCount: topics.length };
  }

  // 按关键词累计投票
  const scores: Record<PurposeId, number> = {
    '建立权威': 0,
    '引发讨论': 0,
    '拉新': 0,
    '转化': 0,
    '教育': 0,
    '消费决策': 0,
  };

  const allText = topics.join(' ').toLowerCase();
  for (const [purpose, keywords] of Object.entries(PURPOSE_KEYWORDS) as Array<[PurposeId, string[]]>) {
    for (const kw of keywords) {
      const regex = new RegExp(kw.toLowerCase(), 'g');
      const matches = allText.match(regex);
      if (matches) scores[purpose] += matches.length;
    }
  }

  // 找最高分
  let best: PurposeId = '建立权威';
  let bestScore = 0;
  for (const [p, s] of Object.entries(scores) as Array<[PurposeId, number]>) {
    if (s > bestScore) {
      best = p;
      bestScore = s;
    }
  }

  if (bestScore === 0) {
    return { purpose: '建立权威', source: 'fallback', historyCount: topics.length };
  }

  return { purpose: best, source: 'inferred', historyCount: topics.length };
}

/**
 * 回灌:查指定 purpose + entity.category 下的历史任务阅读/转化均值,用于 whyItWorks
 * metadata.readCount / metadata.conversionRate 字段在 tasks.metadata 中。
 * 若不足 5 篇数据 → 返回 null,调用方 fallback 到"历史数据不足"
 */
export async function queryTrackRecord(
  deps: ContentLibraryDeps,
  purpose: PurposeId,
  entityCategory?: string,
): Promise<{ avgReadCount?: number; sampleSize: number } | null> {
  try {
    const result = await deps.db.query(
      `SELECT
         COUNT(*) as cnt,
         AVG(COALESCE((metadata->>'readCount')::int, 0)) as avg_read
       FROM tasks
       WHERE is_deleted = false
         AND metadata IS NOT NULL
         AND ($1::text IS NULL OR metadata->>'entityCategory' = $1)
         AND ($2::text IS NULL OR metadata->>'purpose' = $2)`,
      [entityCategory ?? null, purpose],
    );
    const cnt = parseInt(result.rows[0]?.cnt || '0', 10);
    if (cnt < 5) return null;
    const avg = parseFloat(result.rows[0]?.avg_read || '0');
    return { avgReadCount: avg, sampleSize: cnt };
  } catch {
    return null;
  }
}
