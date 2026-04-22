// Round 2: Asset 深度分析结果展示
// 渲染 ⑤-⑮ deliverable + ⑬ 争议高亮 + 专家调用痕迹表
// 只读展示；数据来自 GET /ai/assets/:id/deep-analysis

import { useEffect, useState } from 'react';
import { assetsAiApi } from '../api/assetsAi';
import type {
  AssetDeepAnalysisResponse,
  ControversyAnalysisItem,
  ExpertInvocationItem,
} from '../api/assetsAi';
import './AssetAIAnalysis.css';

interface Props {
  assetId: string;
}

export function AssetDeepAnalysis({ assetId }: Props) {
  const [data, setData] = useState<AssetDeepAnalysisResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError(null);
    assetsAiApi
      .getDeepAnalysis(assetId)
      .then((d) => { if (mounted) setData(d); })
      .catch((err) => { if (mounted) setError(err?.message || '加载失败'); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [assetId]);

  if (loading) return <div className="ai-analysis-loading">加载深度分析…</div>;
  if (error) return <div className="ai-analysis-error">⚠️ {error}</div>;
  if (!data) {
    return (
      <div className="ai-analysis-empty">
        <p>🧬 该 asset 还未生成深度分析结果</p>
        <p style={{ marginTop: 8, fontSize: 13, color: '#888' }}>
          请到 <code>/content-library/batch-ops</code> 的 Step 2 勾选「深度分析」后重新处理此 asset。
        </p>
      </div>
    );
  }

  return (
    <div className="ai-analysis-panel">
      {/* 顶部状态横幅 */}
      <div className="ai-analysis-header">
        <h3>🧬 深度分析产出</h3>
        <div className="ai-analysis-meta">
          <span>专家: {data.matchedDomainExpertIds.join(', ') || '(未匹配)'}</span>
          {data.matchedSeniorExpertId && <span>特级: {data.matchedSeniorExpertId}</span>}
          <span>耗时: {Math.round(data.processingTimeMs / 1000)}s</span>
          <span>版本: {data.modelVersion}</span>
        </div>
        {data.matchReasons.length > 0 && (
          <details className="ai-analysis-meta-reasons">
            <summary>匹配理由 ({data.matchReasons.length})</summary>
            <ul>
              {data.matchReasons.map((r, i) => <li key={i}>{r}</li>)}
            </ul>
          </details>
        )}
      </div>

      {/* ⑬ 争议高亮（最顶部，用户最关心） */}
      {Array.isArray(data.controversies) && data.controversies.length > 0 && (
        <section className="deep-section deep-section-controversy">
          <h4>⑬ 争议分析 ({data.controversies.length})</h4>
          <div className="controversy-list">
            {data.controversies.map((c, i) => (
              <ControversyCard key={c.contradictionId || i} item={c} />
            ))}
          </div>
        </section>
      )}

      {/* 四大组折叠展示 */}
      <DeliverableGroup title="🎯 选题" items={[
        { id: '①', name: '议题推荐', data: data.topicRecommendations, hint: '候选议题 + 标题建议 + 角度矩阵' },
        { id: '②', name: '趋势信号', data: data.trendSignals, hint: '相关领域信号浪涌/衰减' },
        { id: '③', name: '差异化角度', data: data.differentiationGaps, hint: '已被写过的角度之外的新角度' },
        { id: '④', name: '知识空白', data: data.knowledgeBlanks, hint: '事实稀缺但话题热的领域' },
      ]} />

      <DeliverableGroup title="🔬 研究" items={[
        { id: '⑤', name: '关键事实', data: data.keyFacts, hint: '相关实体的高置信事实' },
        { id: '⑥', name: '实体图谱', data: data.entityGraph, hint: '核心实体 + 关联节点' },
        { id: '⑦', name: '增量报告', data: data.deltaReport, hint: '最近 7 天新增事实' },
        { id: '⑧', name: '保鲜度', data: data.staleFacts, hint: '过期待更新事实' },
        { id: '⑨', name: '知识卡片', data: data.knowledgeCard, hint: '实体百科式摘要' },
      ]} />

      <DeliverableGroup title="✍️ 写作" items={[
        { id: '⑩', name: '洞察', data: data.insights, hint: '从事实综合的结论性判断（专家视角）' },
        { id: '⑪', name: '素材推荐', data: data.materialRecommendations, hint: '可引用的上下文素材组合' },
        { id: '⑫', name: '专家共识', data: data.expertConsensus, hint: '主流观点 + 少数派' },
      ]} />

      <DeliverableGroup title="⚖️ 审核" items={[
        { id: '⑭', name: '观点演化', data: data.beliefEvolution, hint: '信念随时间变化轨迹 + pattern' },
        { id: '⑮', name: '跨领域', data: data.crossDomainInsights, hint: '跨越本领域的启发' },
      ]} />

      {/* 专家调用痕迹表 */}
      {data.expertInvocations?.length > 0 && (
        <section className="deep-section">
          <h4>🔎 专家调用痕迹 ({data.expertInvocations.length})</h4>
          <InvocationsTable items={data.expertInvocations} />
        </section>
      )}
    </div>
  );
}

// ============================================================
// 子组件
// ============================================================

interface DeliverableItem {
  id: string;
  name: string;
  data: any;
  hint: string;
}

function DeliverableGroup({ title, items }: { title: string; items: DeliverableItem[] }) {
  const hasData = items.some((it) => it.data != null);
  if (!hasData) return null;
  return (
    <section className="deep-section">
      <h4>{title}</h4>
      {items.map((it) => (
        <details key={it.id} className="deliverable-block" open={false}>
          <summary>
            <span className="deliverable-id">{it.id}</span>
            <span className="deliverable-name">{it.name}</span>
            <span className="deliverable-hint">{it.hint}</span>
            <span className="deliverable-status">{it.data != null ? '✅' : '—'}</span>
          </summary>
          <div className="deliverable-body">
            {it.data != null ? <DeliverableRenderer data={it.data} /> : <em>未生成</em>}
          </div>
        </details>
      ))}
    </section>
  );
}

function DeliverableRenderer({ data }: { data: any }) {
  // 尝试几种典型 shape：{items} / {insights} / 数组 / 字符串 / 对象
  if (data == null) return <em>无</em>;
  if (typeof data === 'string') return <p>{data}</p>;
  if (Array.isArray(data)) {
    return (
      <ul className="deliverable-list">
        {data.slice(0, 10).map((item, i) => (
          <li key={i}><SmartItem item={item} /></li>
        ))}
        {data.length > 10 && <li><em>…还有 {data.length - 10} 条</em></li>}
      </ul>
    );
  }
  if (typeof data === 'object') {
    // 常见: { items: [], total: N }
    if (Array.isArray(data.items)) {
      return (
        <div>
          <div className="deliverable-meta">total={data.total ?? data.items.length}</div>
          <ul className="deliverable-list">
            {data.items.slice(0, 10).map((item: any, i: number) => (
              <li key={i}><SmartItem item={item} /></li>
            ))}
          </ul>
        </div>
      );
    }
    if (Array.isArray(data.insights)) {
      return (
        <div>
          {data.summary && <p className="deliverable-summary">{data.summary}</p>}
          <ul className="deliverable-list">
            {data.insights.map((ins: any, i: number) => (
              <li key={i}>
                {ins.text}
                {typeof ins.confidence === 'number' && (
                  <span className="conf-badge">{Math.round(ins.confidence * 100)}%</span>
                )}
              </li>
            ))}
          </ul>
          {data.expertSupplement && (
            <details className="expert-supplement">
              <summary>专家补充判断 (by {data.expertSupplement.expertId})</summary>
              {data.expertSupplement.sections?.map((s: any, i: number) => (
                <div key={i}>
                  <strong>{s.title}</strong>
                  <pre>{s.content}</pre>
                </div>
              ))}
            </details>
          )}
        </div>
      );
    }
    // fallback: JSON tree
    return <pre className="deliverable-json">{JSON.stringify(data, null, 2).slice(0, 2000)}</pre>;
  }
  return <span>{String(data)}</span>;
}

function SmartItem({ item }: { item: any }) {
  if (item == null) return <em>null</em>;
  if (typeof item === 'string') return <span>{item}</span>;
  if (typeof item !== 'object') return <span>{String(item)}</span>;
  // 典型: {subject, predicate, object, confidence} 三元组
  if (item.subject && item.predicate && item.object) {
    return (
      <span>
        <strong>{item.subject}</strong> · {item.predicate} → {item.object}
        {typeof item.confidence === 'number' && (
          <span className="conf-badge">{Math.round(item.confidence * 100)}%</span>
        )}
      </span>
    );
  }
  // 典型: {name, ...}
  if (item.name || item.entityName || item.title) {
    const name = item.name || item.entityName || item.title;
    const rest = { ...item };
    delete rest.name; delete rest.entityName; delete rest.title;
    return (
      <span>
        <strong>{name}</strong>
        {Object.keys(rest).length > 0 && (
          <span className="conf-badge">{summarizeRest(rest)}</span>
        )}
      </span>
    );
  }
  return <pre style={{ fontSize: 11, margin: 0 }}>{JSON.stringify(item).slice(0, 200)}</pre>;
}

function summarizeRest(rest: Record<string, any>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(rest)) {
    if (v == null) continue;
    if (typeof v === 'number') parts.push(`${k}=${Math.round(v * 100) / 100}`);
    else if (typeof v === 'string' && v.length < 30) parts.push(`${k}=${v}`);
    if (parts.length >= 3) break;
  }
  return parts.join(' ');
}

// ---------- 争议卡片 ----------

function ControversyCard({ item }: { item: ControversyAnalysisItem }) {
  const typeColor: Record<string, string> = {
    real_disagreement: '#e74c3c',
    time_shift: '#f39c12',
    source_error: '#95a5a6',
    definition_drift: '#3498db',
    unknown: '#7f8c8d',
  };
  const color = typeColor[item.contradictionType] || '#7f8c8d';

  return (
    <div className="controversy-card">
      <div className="controversy-header">
        <span className="controversy-type-badge" style={{ background: color }}>
          {typeLabel(item.contradictionType)}
        </span>
        {item.realWorldImpact && (
          <span className="controversy-impact">
            影响: {item.realWorldImpact.level}
          </span>
        )}
      </div>

      <div className="controversy-facts">
        <div className="controversy-fact">
          <div className="fact-label">事实 A</div>
          <div className="fact-text">
            {item.factA.subject} · {item.factA.predicate} → {item.factA.object}
            <span className="conf-badge">{Math.round(item.factA.confidence * 100)}%</span>
          </div>
        </div>
        <div className="controversy-vs">vs</div>
        <div className="controversy-fact">
          <div className="fact-label">事实 B</div>
          <div className="fact-text">
            {item.factB.subject} · {item.factB.predicate} → {item.factB.object}
            <span className="conf-badge">{Math.round(item.factB.confidence * 100)}%</span>
          </div>
        </div>
      </div>

      {(item.steelmanA || item.steelmanB) && (
        <div className="controversy-steelman">
          <div>
            <div className="fact-label">支持 A 的最强论证</div>
            <div>{item.steelmanA || '(未提供)'}</div>
          </div>
          <div>
            <div className="fact-label">支持 B 的最强论证</div>
            <div>{item.steelmanB || '(未提供)'}</div>
          </div>
        </div>
      )}

      {(item.evidenceChainA?.length || item.evidenceChainB?.length) && (
        <details className="controversy-details">
          <summary>证据链</summary>
          <div className="controversy-evidence">
            <div>
              <strong>A 方:</strong>
              <ul>{(item.evidenceChainA || []).map((e, i) => <li key={i}>{e}</li>)}</ul>
            </div>
            <div>
              <strong>B 方:</strong>
              <ul>{(item.evidenceChainB || []).map((e, i) => <li key={i}>{e}</li>)}</ul>
            </div>
          </div>
        </details>
      )}

      {Array.isArray(item.stakeholders) && item.stakeholders.length > 0 && (
        <details className="controversy-details">
          <summary>利益相关方 ({item.stakeholders.length})</summary>
          <table className="stakeholder-table">
            <thead>
              <tr>
                <th>名称</th><th>立场</th><th>利益</th><th>可信度</th>
              </tr>
            </thead>
            <tbody>
              {item.stakeholders.map((s, i) => (
                <tr key={i}>
                  <td>{s.name}</td>
                  <td>{s.position}</td>
                  <td>{s.interest}</td>
                  <td>{s.credibility}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}

      {(item.resolution || item.residualUncertainty) && (
        <div className="controversy-resolution">
          {item.resolution && <p><strong>判定:</strong> {item.resolution}</p>}
          {item.residualUncertainty && (
            <p><strong>残余不确定性:</strong> {item.residualUncertainty}</p>
          )}
        </div>
      )}

      <div className="controversy-footer">
        <small>
          分析专家: {item.analyzedByExpertId || '-'} · invokeId: {item.expertInvokeId?.slice(0, 8) || '-'}
        </small>
      </div>
    </div>
  );
}

function typeLabel(t: string): string {
  const map: Record<string, string> = {
    real_disagreement: '真实分歧',
    time_shift: '时间变化',
    source_error: '来源差异',
    definition_drift: '定义漂移',
    unknown: '未知',
  };
  return map[t] || t;
}

// ---------- 调用痕迹表 ----------

function InvocationsTable({ items }: { items: ExpertInvocationItem[] }) {
  return (
    <table className="invocations-table">
      <thead>
        <tr>
          <th>Deliverable</th>
          <th>专家</th>
          <th>策略</th>
          <th>阶段</th>
          <th>EMM</th>
          <th>置信度</th>
          <th>耗时</th>
        </tr>
      </thead>
      <tbody>
        {items.map((t, i) => (
          <tr key={i}>
            <td>{t.deliverable}</td>
            <td>{t.expertId}</td>
            <td title={t.strategy}>{abbrevStrategy(t.strategy)}</td>
            <td>{t.stage || '-'}</td>
            <td>{t.emmPass ? '✅' : '❌'}</td>
            <td>{typeof t.confidence === 'number' ? Math.round(t.confidence * 100) + '%' : '-'}</td>
            <td>{typeof t.durationMs === 'number' ? t.durationMs + 'ms' : '-'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function abbrevStrategy(spec: string | undefined): string {
  if (!spec) return '-';
  return spec
    .split('|')
    .map((s) => STRATEGY_LABELS[s] || s.slice(0, 10))
    .join(' | ');
}

const STRATEGY_LABELS: Record<string, string> = {
  single: '单专家',
  debate: '辩论',
  mental_model_rotation: '心智轮询',
  heuristic_trigger_first: '启发触发',
  failure_check: '失效自检',
  emm_iterative: 'EMM迭代',
  evidence_anchored: '案例锚',
  calibrated_confidence: '校准',
  track_record_verify: '历史对照',
  signature_style: '签名风格',
  knowledge_grounded: '严格引证',
  contradictions_surface: '矛盾显式',
  rubric_anchored_output: 'Rubric',
};
