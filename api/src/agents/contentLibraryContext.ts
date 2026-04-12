// Agent ↔ Content Library 上下文桥接
//
// 每个 Agent 调用对应的 getXxxContext() 方法，
// 获取一段已经格式化好的 markdown 文本 (可直接拼进 LLM prompt)。
//
// 设计原则:
// - 非阻塞: 任何失败都返回空字符串，Agent 继续按原逻辑工作
// - 按需加载: 只查与该 Agent 相关的产出物 (Planner ①②③④, Researcher ⑤⑥⑦⑨, etc.)
// - 轻量: 每个 Context 预算 ~500-800 tokens
//
// 灵感来源: v7.0 plan 的 "产出物 × Pipeline Agent 集成" 章节

import {
  isContentLibraryInitialized,
  getContentLibraryEngine,
} from '../modules/content-library/singleton.js';

/**
 * 安全调用 Content Library，失败时记录 warning 并返回 null
 */
async function safeCall<T>(label: string, fn: () => Promise<T>): Promise<T | null> {
  if (!isContentLibraryInitialized()) return null;
  try {
    return await fn();
  } catch (err) {
    console.warn(`[AgentContext] ${label} failed:`, (err as Error).message);
    return null;
  }
}

/**
 * Planner Agent — 选题规划
 * 产出物: ① 议题推荐 + ② 趋势信号 + ③④ 差异化/空白
 */
export async function getPlannerContext(topic: string, domain?: string): Promise<string> {
  if (!isContentLibraryInitialized()) return '';
  const engine = getContentLibraryEngine();

  const [topicsPage, entities] = await Promise.all([
    safeCall('topicRecommendations', () => engine.getTopicRecommendations({ domain, limit: 5 })),
    safeCall('queryEntities', () => engine.queryEntities({ search: topic, limit: 5 })),
  ]);
  const topics = topicsPage?.items ?? [];

  // 尝试获取第一个相关实体的趋势
  let trends: Awaited<ReturnType<typeof engine.getTrendSignals>> | null = null;
  if (entities && entities.length > 0) {
    trends = await safeCall('getTrendSignals', () => engine.getTrendSignals(entities[0].id));
  }

  const lines: string[] = [];
  if (topics.length > 0) {
    lines.push('## 内容库·议题推荐 (①)');
    for (const t of topics.slice(0, 5)) {
      lines.push(`- **${t.entityName}** — 事实密度 ${t.factDensity}, 时效 ${t.timeliness?.toFixed?.(2) ?? '—'}, 空白度 ${t.gapScore?.toFixed?.(2) ?? '—'}`);
      if (t.suggestedAngles && t.suggestedAngles.length > 0) {
        lines.push(`  角度: ${t.suggestedAngles.slice(0, 3).join(' · ')}`);
      }
    }
    lines.push('');
  }

  if (trends && trends.length > 0) {
    lines.push('## 内容库·趋势信号 (②)');
    for (const tr of trends.slice(0, 3)) {
      lines.push(`- ${tr.entityName}/${tr.metric}: **${tr.direction}** (显著度 ${tr.significance?.toFixed?.(2) ?? '—'})`);
    }
    lines.push('');
  }

  return lines.length > 0 ? `\n---\n${lines.join('\n')}\n---\n` : '';
}

/**
 * Researcher Agent — 研究执行
 * 产出物: ⑤ 关键事实 + ⑥ 实体图谱 + ⑦ 信息增量 + ⑨ 知识卡片
 */
export async function getResearcherContext(topic: string, domain?: string): Promise<string> {
  if (!isContentLibraryInitialized()) return '';
  const engine = getContentLibraryEngine();

  const [facts, entities, delta] = await Promise.all([
    safeCall('getKeyFacts', () => engine.getKeyFacts({ subject: topic, domain, limit: 8 })),
    safeCall('queryEntities', () => engine.queryEntities({ search: topic, limit: 5 })),
    safeCall('getDeltaReport', () => engine.getDeltaReport(new Date(Date.now() - 7 * 86400000))),
  ]);

  const lines: string[] = [];

  if (facts && facts.length > 0) {
    lines.push('## 内容库·关键事实 (⑤)');
    for (const f of facts.slice(0, 8)) {
      const conf = Math.round((f.confidence || 0) * 100);
      lines.push(`- ${f.subject} · ${f.predicate} → ${f.object} (${conf}%)`);
    }
    lines.push('');
  }

  // 加载头号实体的知识卡片
  if (entities && entities.length > 0) {
    const card = await safeCall('getKnowledgeCard', () => engine.getKnowledgeCard(entities[0].id));
    if (card) {
      lines.push(`## 内容库·知识卡片 (⑨) — ${card.entityName}`);
      if (card.coreData && card.coreData.length > 0) {
        for (const d of card.coreData.slice(0, 5)) {
          lines.push(`- **${d.label}**: ${d.value} (${d.freshness})`);
        }
      }
      if (card.relatedEntities && card.relatedEntities.length > 0) {
        lines.push(`- 关联: ${card.relatedEntities.slice(0, 5).map(r => r.name).join(' · ')}`);
      }
      lines.push('');
    }
  }

  if (delta && (delta.newFacts.length > 0 || delta.updatedFacts.length > 0)) {
    lines.push('## 内容库·近 7 天信息增量 (⑦)');
    lines.push(`- 新增 ${delta.newFacts.length} 条事实 / 更新 ${delta.updatedFacts.length} / 推翻 ${delta.refutedFacts.length}`);
    if (delta.newFacts.length > 0) {
      lines.push('- 新事实示例:');
      for (const f of delta.newFacts.slice(0, 3)) {
        lines.push(`  · ${f.subject} · ${f.predicate} → ${f.object}`);
      }
    }
    lines.push('');
  }

  return lines.length > 0 ? `\n---\n${lines.join('\n')}\n---\n` : '';
}

/**
 * Writer Agent — 内容写作
 * 产出物: ⑩ 有价值的认知 + ⑪ 素材组合推荐 + ⑫ 专家共识
 */
export async function getWriterContext(topic: string, domain?: string): Promise<string> {
  if (!isContentLibraryInitialized()) return '';
  const engine = getContentLibraryEngine();

  const [synth, recs, consensus] = await Promise.all([
    safeCall('synthesizeInsights', () => engine.synthesizeInsights({ domain, limit: 5 })),
    safeCall('recommendMaterials', () => engine.recommendMaterials({ domain, limit: 3 })),
    safeCall('getExpertConsensus', () => engine.getExpertConsensus({ topic, domain, limit: 5 })),
  ]);

  const lines: string[] = [];

  if (synth && synth.insights.length > 0) {
    lines.push('## 内容库·有价值的认知 (⑩)');
    for (const i of synth.insights.slice(0, 5)) {
      const conf = typeof i.confidence === 'number' ? ` (${Math.round(i.confidence * 100)}%)` : '';
      lines.push(`- ${i.text}${conf}`);
    }
    lines.push('');
  }

  if (recs && recs.recommendations.length > 0) {
    lines.push('## 内容库·素材组合推荐 (⑪)');
    for (const r of recs.recommendations.slice(0, 3)) {
      lines.push(`- ${r.rationale} (评分 ${r.score.toFixed(2)})`);
    }
    lines.push('');
  }

  if (consensus && consensus.consensus.length > 0) {
    lines.push('## 内容库·专家共识 (⑫)');
    for (const c of consensus.consensus.slice(0, 5)) {
      lines.push(`- ${c.position} (置信度 ${(c.confidence * 100).toFixed(0)}%)`);
    }
    if (consensus.divergences && consensus.divergences.length > 0) {
      lines.push(`  *分歧*: ${consensus.divergences.length} 处不同意见`);
    }
    lines.push('');
  }

  return lines.length > 0 ? `\n---\n${lines.join('\n')}\n---\n` : '';
}

/**
 * BlueTeam Agent — 质量评审
 * 产出物: ⑬ 争议话题 + ⑧ 事实保鲜度 + ⑭ 观点演化
 */
export async function getBlueTeamContext(topic: string, domain?: string): Promise<string> {
  if (!isContentLibraryInitialized()) return '';
  const engine = getContentLibraryEngine();

  const [contradictions, staleFacts, beliefs] = await Promise.all([
    safeCall('getContradictions', () => engine.getContradictions({ domain, limit: 5 })),
    safeCall('getStaleFacts', () => engine.getStaleFacts({ domain, maxAgeDays: 180, limit: 5 })),
    safeCall('getBeliefEvolution', () => engine.getBeliefEvolution({ subject: topic, limit: 5 })),
  ]);

  const lines: string[] = [];

  if (contradictions && contradictions.length > 0) {
    lines.push('## 内容库·争议点 (⑬) — 审核重点');
    for (const c of contradictions.slice(0, 5)) {
      lines.push(`- [${c.severity}] ${c.description}`);
    }
    lines.push('');
  }

  if (staleFacts && staleFacts.length > 0) {
    lines.push('## 内容库·过时事实 (⑧) — 需验证');
    for (const f of staleFacts.slice(0, 5)) {
      const days = Math.round((Date.now() - new Date(f.createdAt).getTime()) / 86400000);
      lines.push(`- ${f.subject} · ${f.predicate} → ${f.object} (${days} 天前)`);
    }
    lines.push('');
  }

  if (beliefs && beliefs.timeline.length > 0) {
    lines.push('## 内容库·观点演化 (⑭)');
    lines.push(`- ${beliefs.summary}`);
    for (const t of beliefs.timeline.slice(0, 3)) {
      lines.push(`- ${new Date(t.date).toLocaleDateString()}: ${t.state}`);
    }
    lines.push('');
  }

  return lines.length > 0 ? `\n---\n${lines.join('\n')}\n---\n` : '';
}
