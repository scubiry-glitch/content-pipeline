import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { assetsApi, type Asset, type AssetUsage } from '../api/client';
import { AssetAIAnalysis } from '../components/AssetAIAnalysis';
import { MeetingKindBadge } from '../components/MeetingKindBadge';
import './AssetDetail.css';

export function AssetDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [asset, setAsset] = useState<Asset | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'content' | 'meta' | 'citations' | 'ai-analysis' | 'deep-analysis'>('content');
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteResult, setQuoteResult] = useState<any>(null);
  const [usageStats, setUsageStats] = useState<AssetUsage | null>(null);
  const [usageLoading, setUsageLoading] = useState(false);
  const [deepAnalysis, setDeepAnalysis] = useState<any>(null);
  const [expertNameMap, setExpertNameMap] = useState<Record<string, string>>({});
  const [pipelineBusy, setPipelineBusy] = useState<'step3' | 'step4' | 'step5' | null>(null);
  const [pipelineLog, setPipelineLog] = useState<string>('');
  const [step4JobId, setStep4JobId] = useState<string | null>(null);
  const [step5JobId, setStep5JobId] = useState<string | null>(null);
  const [step3Status, setStep3Status] = useState<'idle' | 'running' | 'success' | 'failed'>('idle');
  const [step4Status, setStep4Status] = useState<'idle' | 'running' | 'success' | 'failed'>('idle');
  const [step5Status, setStep5Status] = useState<'idle' | 'running' | 'success' | 'failed'>('idle');
  const [step3Result, setStep3Result] = useState<any>(null);
  const [step4State, setStep4State] = useState<any>(null);
  const [step5State, setStep5State] = useState<any>(null);
  const [deepLoading, setDeepLoading] = useState(false);
  const [deepRunning, setDeepRunning] = useState(false);
  const [deepProgress, setDeepProgress] = useState<string>('');
  const [deepProgressPct, setDeepProgressPct] = useState(0);
  const [step4ProgressPct, setStep4ProgressPct] = useState(0);
  const [step5ProgressPct, setStep5ProgressPct] = useState(0);

  useEffect(() => {
    if (id) {
      loadAsset();
    }
  }, [id]);

  const loadAsset = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await assetsApi.getById(id!);
      setAsset(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  };

  const loadUsageStats = async () => {
    if (!id) return;
    setUsageLoading(true);
    try {
      const stats = await assetsApi.getUsageStats(id);
      setUsageStats(stats);
    } catch (err) {
      console.error('Failed to load usage stats:', err);
    } finally {
      setUsageLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'citations' && id) {
      loadUsageStats();
    }
    if (activeTab === 'deep-analysis' && id && !deepAnalysis && !deepLoading) {
      loadDeepAnalysis();
    }
  }, [activeTab, id]);

  useEffect(() => {
    const ids = deepAnalysis?.matchedDomainExpertIds;
    if (!Array.isArray(ids) || ids.length === 0) {
      setExpertNameMap({});
      return;
    }
    const uniqueIds = Array.from(new Set(ids.filter((x: any) => typeof x === 'string' && x.trim())));
    if (uniqueIds.length === 0) {
      setExpertNameMap({});
      return;
    }
    let cancelled = false;
    (async () => {
      const pairs = await Promise.all(
        uniqueIds.map(async (expertId) => {
          try {
            const res = await fetch(`/api/v1/expert-library/experts/${encodeURIComponent(expertId)}`);
            if (!res.ok) return [expertId, expertId] as const;
            const data = await res.json();
            const name = (data?.name || data?.expert_name || expertId) as string;
            return [expertId, name] as const;
          } catch {
            return [expertId, expertId] as const;
          }
        })
      );
      if (!cancelled) {
        setExpertNameMap(Object.fromEntries(pairs));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [deepAnalysis?.matchedDomainExpertIds]);

  const loadDeepAnalysis = async () => {
    setDeepLoading(true);
    try {
      const res = await fetch(`/api/v1/ai/assets/assets/${id}/deep-analysis`);
      if (res.status === 404) { setDeepAnalysis(null); return; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setDeepAnalysis(await res.json());
    } catch {
      setDeepAnalysis(null);
    } finally {
      setDeepLoading(false);
    }
  };

  const triggerDeepAnalysis = async () => {
    setDeepRunning(true);
    setDeepProgressPct(3);
    setDeepProgress('正在启动深度分析…');
    try {
      const res = await fetch('/api/v1/ai/assets/batch-process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assetIds: [id], enableDeepAnalysis: true, force: true }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      // 轮询直到深度分析结果写入
      const deadline = Date.now() + 10 * 60 * 1000;
      const startedAt = Date.now();
      const poll = setInterval(async () => {
        setDeepProgress(`分析中… ${Math.round((Date.now() % 60000) / 1000)}s`);
        const elapsed = Date.now() - startedAt;
        const pct = Math.min(95, Math.max(5, Math.round((elapsed / (10 * 60 * 1000)) * 100)));
        setDeepProgressPct(pct);
        const r = await fetch(`/api/v1/ai/assets/assets/${id}/deep-analysis`);
        if (r.ok) {
          const data = await r.json();
          if (data && data.assetId) {
            clearInterval(poll);
            setDeepAnalysis(data);
            setDeepRunning(false);
            setDeepProgress('');
            setDeepProgressPct(100);
          }
        }
        if (Date.now() > deadline) {
          clearInterval(poll);
          setDeepRunning(false);
          setDeepProgress('超时，请稍后刷新');
          setDeepProgressPct(100);
        }
      }, 5000);
    } catch (err) {
      setDeepProgress(`启动失败：${(err as Error).message}`);
      setDeepRunning(false);
      setDeepProgressPct(100);
    }
  };

  const handleQuote = async () => {
    if (!id) return;
    setQuoteLoading(true);
    try {
      const result = await assetsApi.quote(id);
      setQuoteResult(result);
      setTimeout(() => setQuoteResult(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : '引用失败');
    } finally {
      setQuoteLoading(false);
    }
  };

  const runStep3Reextract = async () => {
    if (!id) return;
    setStep3Status('running');
    setPipelineBusy('step3');
    setPipelineLog('Step 3 执行中：两段式事实提取...');
    try {
      const res = await fetch('/api/v1/content-library/reextract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assetIds: [id],
          onlyUnprocessed: false,
          source: 'assets',
          dryRun: false,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || `HTTP ${res.status}`);
      setStep3Result(data);
      setPipelineLog(`Step 3 完成：${JSON.stringify(data).slice(0, 300)}`);
      setStep3Status('success');
      // Step3 产出的是事实层，自动触发一次深度分析把新事实同步到本页可视化
      if (!deepRunning) {
        setPipelineLog('Step 3 完成，正在自动触发重新分析...');
        await triggerDeepAnalysis();
      }
    } catch (err) {
      setPipelineLog(`Step 3 失败：${(err as Error).message}`);
      setStep3Status('failed');
    } finally {
      setPipelineBusy(null);
    }
  };

  const runStep4ZepSync = async () => {
    setStep4Status('running');
    setStep4ProgressPct(3);
    setPipelineBusy('step4');
    setPipelineLog('Step 4 执行中：知识图谱 / Zep 同步...');
    try {
      const res = await fetch('/api/v1/content-library/zep/sync/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          limit: 80,
          batchSize: 10,
          minConfidence: 0.5,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || `HTTP ${res.status}`);
      const jobId = data?.jobId || null;
      setStep4JobId(jobId);
      setPipelineLog(`Step 4 已启动：jobId=${jobId || 'unknown'}（开始轮询进度）`);
    } catch (err) {
      setPipelineLog(`Step 4 失败：${(err as Error).message}`);
      setStep4Status('failed');
      setStep4ProgressPct(100);
    } finally {
      setPipelineBusy(null);
    }
  };

  const runStep5Pregenerate = async () => {
    setStep5Status('running');
    setStep5ProgressPct(3);
    setPipelineBusy('step5');
    setPipelineLog('Step 5 执行中：AI 产出物预生成...');
    try {
      const res = await fetch('/api/v1/content-library/synthesize/pregenerate/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          limit: 30,
          overwrite: false,
          minFacts: 3,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || `HTTP ${res.status}`);
      const jobId = data?.jobId || null;
      setStep5JobId(jobId);
      setPipelineLog(`Step 5 已启动：jobId=${jobId || 'unknown'}（开始轮询进度）`);
    } catch (err) {
      setPipelineLog(`Step 5 失败：${(err as Error).message}`);
      setStep5Status('failed');
      setStep5ProgressPct(100);
    } finally {
      setPipelineBusy(null);
    }
  };

  useEffect(() => {
    if (!step4JobId) return;
    let stopped = false;
    const timer = setInterval(async () => {
      try {
        const res = await fetch(`/api/v1/content-library/zep/sync/jobs/${encodeURIComponent(step4JobId)}`);
        if (!res.ok) return;
        const state = await res.json();
        if (stopped || !state) return;
        setStep4State(state);
        const status = state.status || 'unknown';
        const total = Number(state.total ?? 0);
        const done = Number(state.synced ?? 0) + Number(state.skipped ?? 0) + Number(state.errors ?? 0);
        const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : (status === 'running' ? 10 : 100);
        setStep4ProgressPct(pct);
        setPipelineLog(
          `Step 4 进度：status=${status} synced=${state.synced ?? 0}/${state.total ?? 0} skipped=${state.skipped ?? 0} errors=${state.errors ?? 0}`
        );
        if (status !== 'running') {
          clearInterval(timer);
          setStep4JobId(null);
          setStep4Status(status === 'completed' ? 'success' : 'failed');
          setStep4ProgressPct(100);
          setPipelineBusy((prev) => (prev === 'step4' ? null : prev));
        }
      } catch {
        // ignore transient polling errors
      }
    }, 2000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [step4JobId]);

  useEffect(() => {
    if (!step5JobId) return;
    let stopped = false;
    const timer = setInterval(async () => {
      try {
        const res = await fetch(`/api/v1/content-library/synthesize/pregenerate/jobs/${encodeURIComponent(step5JobId)}`);
        if (!res.ok) return;
        const state = await res.json();
        if (stopped || !state) return;
        setStep5State(state);
        const status = state.status || 'unknown';
        const total = Number(state.total ?? 0);
        const done = Number(state.processed ?? 0);
        const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : (status === 'running' ? 10 : 100);
        setStep5ProgressPct(pct);
        setPipelineLog(
          `Step 5 进度：status=${status} done=${state.processed ?? 0}/${state.total ?? 0} success=${state.success ?? 0} failed=${state.failed ?? 0}`
        );
        if (status !== 'running') {
          clearInterval(timer);
          setStep5JobId(null);
          setStep5Status(status === 'completed' ? 'success' : 'failed');
          setStep5ProgressPct(100);
          setPipelineBusy((prev) => (prev === 'step5' ? null : prev));
        }
      } catch {
        // ignore transient polling errors
      }
    }, 2000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [step5JobId]);

  const getQualityColor = (score: number) => {
    if (score >= 80) return '#52c41a';
    if (score >= 60) return '#faad14';
    return '#ff4d4f';
  };

  const getContentTypeLabel = (type: string) => {
    const map: Record<string, string> = {
      'text/plain': '文本',
      'text/markdown': 'Markdown',
      'text/html': 'HTML',
      'application/pdf': 'PDF',
      'image/png': 'PNG图片',
      'image/jpeg': 'JPEG图片',
      'text/rss': 'RSS',
    };
    return map[type] || type;
  };

  const hasFailed = step3Status === 'failed' || step4Status === 'failed' || step5Status === 'failed' || deepProgress.startsWith('启动失败') || deepProgress.startsWith('超时');
  const hasRunning = deepRunning || step3Status === 'running' || step4Status === 'running' || step5Status === 'running';
  const overallStatus: 'running' | 'success' | 'failed' | 'idle' = hasRunning ? 'running' : hasFailed ? 'failed' : deepAnalysis ? 'success' : 'idle';
  const overallStatusText = overallStatus === 'running'
    ? '生成中'
    : overallStatus === 'success'
      ? '成功'
      : overallStatus === 'failed'
        ? '失败'
        : '待开始';
  const overallProgressPct = Math.max(
    deepRunning ? deepProgressPct : deepAnalysis ? 100 : 0,
    step4Status === 'running' || step4Status === 'success' || step4Status === 'failed' ? step4ProgressPct : 0,
    step5Status === 'running' || step5Status === 'success' || step5Status === 'failed' ? step5ProgressPct : 0,
    step3Status === 'success' || step3Status === 'failed' ? 100 : step3Status === 'running' ? 50 : 0,
  );
  const statusColor = overallStatus === 'running' ? '#f59e0b' : overallStatus === 'success' ? '#16a34a' : overallStatus === 'failed' ? '#dc2626' : '#64748b';

  if (loading) {
    return <div className="asset-detail loading">加载中...</div>;
  }

  if (error) {
    return (
      <div className="asset-detail error">
        <div className="error-message">⚠️ {error}</div>
        <button className="btn btn-primary" onClick={loadAsset}>
          重试
        </button>
      </div>
    );
  }

  if (!asset) {
    return <div className="asset-detail empty">素材不存在</div>;
  }

  return (
    <div className="asset-detail">
      <div className="detail-header">
        <button className="btn btn-link back-btn" onClick={() => navigate('/assets')}>
          ← 返回素材库
        </button>
        <div className="header-actions">
          <button
            className="btn btn-secondary"
            onClick={handleQuote}
            disabled={quoteLoading}
          >
            {quoteLoading ? '⏳ 生成中...' : '📋 一键引用'}
          </button>
          <button
            className="btn btn-primary"
            onClick={() => navigate(`/assets/${id}/edit`)}
          >
            ✏️ 编辑
          </button>
        </div>
      </div>

      {quoteResult && (
        <div className="quote-toast success">
          <span>✅ 引用已生成</span>
          <button onClick={() => setQuoteResult(null)}>✕</button>
        </div>
      )}

      <div className="asset-hero">
        <div className="asset-title-section">
          <h1>{asset.title}</h1>
          <div className="asset-badges">
            <span className="content-type-badge">{getContentTypeLabel(asset.content_type)}</span>
            {asset.is_pinned && <span className="pinned-badge">📌 置顶</span>}
            {(asset as any).metadata?.meeting_kind && (
              <MeetingKindBadge kind={(asset as any).metadata.meeting_kind} compact={false} />
            )}
          </div>
        </div>

        <div className="asset-meta-bar">
          <span>🏢 {asset.source || '未知来源'}</span>
          <span>📅 {new Date(asset.created_at).toLocaleDateString()}</span>
          <span>👁️ {asset.view_count || 0} 次查看</span>
          {asset.quality_score !== undefined && (
            <span className="quality-badge" style={{ color: getQualityColor(asset.quality_score) }}>
              ⭐ 质量分 {asset.quality_score}
            </span>
          )}
        </div>

        <div className="asset-tags">
          {asset.tags?.map((tag) => (
            <span key={tag} className="tag">{tag}</span>
          ))}
          {asset.auto_tags?.map((tag, i) => (
            <span key={i} className="tag auto">🤖 {tag.tag}</span>
          ))}
        </div>
      </div>

      <div className="detail-tabs">
        <button
          className={`tab ${activeTab === 'content' ? 'active' : ''}`}
          onClick={() => setActiveTab('content')}
        >
          📝 内容
        </button>
        <button
          className={`tab ${activeTab === 'meta' ? 'active' : ''}`}
          onClick={() => setActiveTab('meta')}
        >
          📊 元数据
        </button>
        <button
          className={`tab ${activeTab === 'citations' ? 'active' : ''}`}
          onClick={() => setActiveTab('citations')}
        >
          📚 引用统计
        </button>
        <button
          className={`tab ${activeTab === 'ai-analysis' ? 'active' : ''}`}
          onClick={() => setActiveTab('ai-analysis')}
        >
          🤖 AI 分析
        </button>
        <button
          className={`tab ${activeTab === 'deep-analysis' ? 'active' : ''}`}
          onClick={() => setActiveTab('deep-analysis')}
        >
          🔬 深度分析
          {deepAnalysis && <span style={{ marginLeft: 4, fontSize: 10, background: '#6366f1', color: '#fff', borderRadius: 8, padding: '1px 5px' }}>已生成</span>}
        </button>
      </div>

      <div className="detail-content">
        {activeTab === 'content' && (
          <div className="content-panel">
            {asset.content ? (
              <div className="content-body">
                {asset.content_type?.includes('image') ? (
                  <img src={asset.content} alt={asset.title} className="content-image" />
                ) : (
                  <pre className="content-text">{asset.content}</pre>
                )}
              </div>
            ) : (
              <div className="empty-state">
                <div className="empty-icon">📝</div>
                <div className="empty-title">暂无内容</div>
                <p>该素材暂无文本内容</p>
              </div>
            )}

            {asset.summary && (
              <div className="summary-section">
                <h3>🤖 AI摘要</h3>
                <p>{asset.summary}</p>
              </div>
            )}

            {asset.key_points && asset.key_points.length > 0 && (
              <div className="keypoints-section">
                <h3>💡 关键要点</h3>
                <ul>
                  {asset.key_points.map((point, idx) => (
                    <li key={idx}>{point}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {activeTab === 'meta' && (
          <div className="meta-panel">
            <div className="meta-section">
              <h3>基本信息</h3>
              <div className="meta-grid">
                <div className="meta-item">
                  <span className="meta-label">ID</span>
                  <span className="meta-value code">{asset.id}</span>
                </div>
                <div className="meta-item">
                  <span className="meta-label">内容类型</span>
                  <span className="meta-value">{asset.content_type}</span>
                </div>
                <div className="meta-item">
                  <span className="meta-label">来源</span>
                  <span className="meta-value">{asset.source || '未知'}</span>
                </div>
                <div className="meta-item">
                  <span className="meta-label">来源URL</span>
                  <a href={asset.source_url} target="_blank" rel="noopener noreferrer" className="meta-value link">
                    {asset.source_url || '无'}
                  </a>
                </div>
                <div className="meta-item">
                  <span className="meta-label">主题ID</span>
                  <span className="meta-value">{asset.theme_id || '未分类'}</span>
                </div>
                <div className="meta-item">
                  <span className="meta-label">创建时间</span>
                  <span className="meta-value">{new Date(asset.created_at).toLocaleString()}</span>
                </div>
                <div className="meta-item">
                  <span className="meta-label">更新时间</span>
                  <span className="meta-value">{new Date(asset.updated_at).toLocaleString()}</span>
                </div>
              </div>
            </div>

            <div className="meta-section">
              <h3>质量评估</h3>
              <div className="quality-overview">
                <div
                  className="quality-score-circle"
                  style={{ '--score-color': getQualityColor(asset.quality_score || 0) } as any}
                >
                  <span className="score-number">{asset.quality_score || '--'}</span>
                  <span className="score-label">质量分</span>
                </div>
              </div>
              {asset.quality_dimensions && (
                <div className="quality-dimensions">
                  {Object.entries(asset.quality_dimensions).map(([dim, score]) => (
                    <div key={dim} className="dimension-row">
                      <span className="dim-name">{dim}</span>
                      <div className="dim-bar">
                        <div
                          className="dim-fill"
                          style={{ width: `${score}%`, background: getQualityColor(score) }}
                        />
                      </div>
                      <span className="dim-score">{score}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {asset.embedding && (
              <div className="meta-section">
                <h3>🔢 向量嵌入</h3>
                <p className="embedding-info">该素材已生成向量嵌入，可用于语义搜索</p>
                <div className="embedding-preview">
                  <code>维度: {Array.isArray(asset.embedding) ? asset.embedding.length : 'N/A'}</code>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'citations' && (
          <div className="citations-panel">
            <div className="citations-stats">
              <div className="stat-card primary">
                <span className="stat-value">{asset.citation_count || 0}</span>
                <span className="stat-label">被引用次数</span>
                <span className="stat-trend">{(asset.citation_count || 0) > 5 ? '🔥 热门素材' : ''}</span>
              </div>
              <div className="stat-card">
                <span className="stat-value">{asset.view_count || 0}</span>
                <span className="stat-label">查看次数</span>
              </div>
              <div className="stat-card">
                <span className="stat-value">{(asset.quality_score || 0) > 80 ? '高' : (asset.quality_score || 0) > 60 ? '中' : '低'}</span>
                <span className="stat-label">引用质量</span>
              </div>
              <div className="stat-card">
                <span className="stat-value">{asset.influence_score || '--'}</span>
                <span className="stat-label">影响力分</span>
              </div>
            </div>

            {/* 引用任务列表 */}
            <div className="citation-tasks">
              <h3>📋 引用该素材的任务</h3>
              <div className="citation-tasks-list">
                {usageLoading ? (
                  <div className="loading-citations">⏳ 加载中...</div>
                ) : usageStats?.usageHistory && usageStats.usageHistory.length > 0 ? (
                  usageStats.usageHistory.map((item, idx) => (
                    <div key={idx} className="citation-task-item">
                      <span className="task-name">{item.taskTitle || '未命名任务'}</span>
                      <span className="task-status completed">已引用</span>
                      <span className="citation-date">{new Date(item.usedAt).toLocaleDateString()}</span>
                    </div>
                  ))
                ) : (
                  <div className="empty-citations">暂无任务引用该素材</div>
                )}
              </div>
            </div>

            <div className="citation-actions">
              <h3>快速引用</h3>
              <div className="citation-formats">
                <div className="citation-format">
                  <span className="format-label">GB/T 7714</span>
                  <code className="format-content">
                    {asset.source || '未知作者'}. {asset.title}[{getContentTypeLabel(asset.content_type)}].
                    {asset.source ? `${asset.source}, ` : ''}{new Date(asset.created_at).getFullYear()}.
                  </code>
                  <button
                    className="btn btn-sm btn-secondary"
                    onClick={() => navigator.clipboard.writeText(`${asset.source || '未知作者'}. ${asset.title}[${getContentTypeLabel(asset.content_type)}]. ${asset.source ? `${asset.source}, ` : ''}${new Date(asset.created_at).getFullYear()}.`)}
                  >
                    复制
                  </button>
                </div>
                <div className="citation-format">
                  <span className="format-label">APA</span>
                  <code className="format-content">
                    {asset.source || 'Unknown'}. ({new Date(asset.created_at).getFullYear()}). {asset.title}.
                  </code>
                  <button
                    className="btn btn-sm btn-secondary"
                    onClick={() => navigator.clipboard.writeText(`${asset.source || 'Unknown'}. (${new Date(asset.created_at).getFullYear()}). ${asset.title}.`)}
                  >
                    复制
                  </button>
                </div>
                <div className="citation-format">
                  <span className="format-label">MLA</span>
                  <code className="format-content">
                    {asset.source || '"Unknown"'}. "{asset.title}." {asset.source || 'Web'}, {new Date(asset.created_at).getFullYear()}.
                  </code>
                  <button
                    className="btn btn-sm btn-secondary"
                    onClick={() => navigator.clipboard.writeText(`${asset.source || '"Unknown"'}. "${asset.title}." ${asset.source || 'Web'}, ${new Date(asset.created_at).getFullYear()}.`)}
                  >
                    复制
                  </button>
                </div>
              </div>
            </div>

            <div className="usage-tips">
              <h3>💡 使用建议</h3>
              <ul>
                <li>高质量素材（质量分&gt;80）适合作为核心论据引用</li>
                <li>引用时请注意核实内容的时效性和准确性</li>
                <li>建议在引用时添加自己的分析和观点</li>
                <li>可以通过"一键引用"功能快速生成标准引用格式</li>
              </ul>
            </div>
          </div>
        )}

        {activeTab === 'ai-analysis' && (
          <div className="ai-analysis-panel-wrapper">
            <AssetAIAnalysis assetId={id!} compact={false} />
          </div>
        )}

        {activeTab === 'deep-analysis' && (
          <div style={{ padding: '20px 0' }}>
            {deepLoading ? (
              <div style={{ color: '#999', padding: 24 }}>⏳ 加载中…</div>
            ) : !deepAnalysis ? (
              <div style={{ textAlign: 'center', padding: 48 }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>🔬</div>
                <div style={{ fontWeight: 600, marginBottom: 8 }}>尚未进行深度分析</div>
                <div style={{ color: '#999', fontSize: 13, marginBottom: 20 }}>
                  深度分析将生成 15 项产出物，并调用专家库 EMM 进行多视角结构化分析（约 1–3 分钟）
                </div>
                <button
                  onClick={triggerDeepAnalysis}
                  disabled={deepRunning}
                  style={{ background: '#6366f1', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 24px', fontWeight: 600, cursor: 'pointer', opacity: deepRunning ? 0.6 : 1 }}
                >
                  {deepRunning ? `⏳ ${deepProgress}` : '🚀 启动深度分析'}
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 12, background: '#fff' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 10, height: 10, borderRadius: '50%', background: statusColor, display: 'inline-block' }} />
                      <strong style={{ fontSize: 13 }}>全局状态：{overallStatusText}</strong>
                    </div>
                    <span style={{ color: '#64748b', fontSize: 12 }}>{overallProgressPct}%</span>
                  </div>
                  <div style={{ height: 8, width: '100%', background: '#e5e7eb', borderRadius: 999, overflow: 'hidden' }}>
                    <div style={{ width: `${overallProgressPct}%`, height: '100%', background: statusColor, transition: 'width 0.25s ease' }} />
                  </div>
                </div>

                {/* 操作栏 */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: '#999', fontSize: 12 }}>
                    耗时 {((deepAnalysis.processingTimeMs || 0) / 1000).toFixed(1)}s · {deepAnalysis.modelVersion}
                  </span>
                  <button
                    onClick={triggerDeepAnalysis}
                    disabled={deepRunning}
                    style={{ background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 6, padding: '6px 14px', fontSize: 12, cursor: 'pointer' }}
                  >
                    {deepRunning ? `⏳ ${deepProgress}` : '🔄 重新分析'}
                  </button>
                </div>

                {/* 专家匹配 */}
                {deepAnalysis.matchedDomainExpertIds?.length > 0 && (
                  <Section title="🧑‍🔬 匹配专家">
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {deepAnalysis.matchedDomainExpertIds.map((eid: string) => (
                        <span key={eid} style={{ background: '#ede9fe', color: '#6d28d9', borderRadius: 6, padding: '3px 10px', fontSize: 12 }}>
                          {expertNameMap[eid] || eid} <span style={{ opacity: 0.75 }}>({eid})</span>
                        </span>
                      ))}
                    </div>
                    {deepAnalysis.matchReasons?.length > 0 && (
                      <ul style={{ marginTop: 8, fontSize: 13, color: '#555', paddingLeft: 16 }}>
                        {deepAnalysis.matchReasons.slice(0, 3).map((r: string, i: number) => <li key={i}>{r}</li>)}
                      </ul>
                    )}
                  </Section>
                )}

                <Section title="🛠 手动流水线（Step 3/4/5）">
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button
                      onClick={runStep3Reextract}
                      disabled={!!pipelineBusy}
                      style={{ background: '#111827', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 12px', fontSize: 12, cursor: 'pointer', opacity: pipelineBusy ? 0.6 : 1 }}
                    >
                      {pipelineBusy === 'step3' ? '⏳ Step3 运行中' : 'Step3 两段式事实提取'}
                    </button>
                    <button
                      onClick={runStep4ZepSync}
                      disabled={!!pipelineBusy}
                      style={{ background: '#1d4ed8', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 12px', fontSize: 12, cursor: 'pointer', opacity: pipelineBusy ? 0.6 : 1 }}
                    >
                      {pipelineBusy === 'step4' ? '⏳ Step4 运行中' : 'Step4 知识图谱/Zep 增强'}
                    </button>
                    <button
                      onClick={runStep5Pregenerate}
                      disabled={!!pipelineBusy}
                      style={{ background: '#047857', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 12px', fontSize: 12, cursor: 'pointer', opacity: pipelineBusy ? 0.6 : 1 }}
                    >
                      {pipelineBusy === 'step5' ? '⏳ Step5 运行中' : 'Step5 AI 产出物预生成'}
                    </button>
                  </div>
                  <div style={{ color: '#6b7280', fontSize: 12, marginTop: 8 }}>
                    Step4 与 Step5 是后台异步任务，按钮返回 jobId 后会继续在服务端执行。
                  </div>
                  {pipelineLog ? (
                    <pre style={{ marginTop: 10, background: '#f8fafc', borderRadius: 6, padding: '8px 12px', fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                      {pipelineLog}
                    </pre>
                  ) : null}
                </Section>

                {(step3Result || step4State || step5State) && (
                  <Section title="📦 手动流水线产物预览">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {step3Result && (
                        <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 10 }}>
                          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>Step3 两段式事实提取</div>
                          <div style={{ fontSize: 12, color: '#334155' }}>
                            处理 {step3Result.processed ?? 0} 条，新增事实 {step3Result.newFacts ?? 0}，更新事实 {step3Result.updatedFacts ?? 0}，跳过 {step3Result.skipped ?? 0}，错误 {step3Result.errors ?? 0}
                          </div>
                        </div>
                      )}
                      {step4State && (
                        <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 10 }}>
                          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>Step4 知识图谱 / Zep 增强</div>
                          <div style={{ fontSize: 12, color: '#334155' }}>
                            状态 {step4State.status || 'unknown'}，同步 {step4State.synced ?? 0}/{step4State.total ?? 0}，跳过 {step4State.skipped ?? 0}，错误 {step4State.errors ?? 0}
                          </div>
                        </div>
                      )}
                      {step5State && (
                        <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 10 }}>
                          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>Step5 AI 产出物预生成</div>
                          <div style={{ fontSize: 12, color: '#334155' }}>
                            状态 {step5State.status || 'unknown'}，完成 {step5State.processed ?? 0}/{step5State.total ?? 0}，成功 {step5State.success ?? 0}，失败 {step5State.failed ?? 0}
                          </div>
                        </div>
                      )}
                    </div>
                  </Section>
                )}

                {/* 关键事实 */}
                <DeliverableSection num="⑤" title="关键事实" data={deepAnalysis.keyFacts} />

                {/* 洞察 */}
                {deepAnalysis.insights ? (
                  <Section title="⑩ 深度洞察">
                    <InsightsSection data={deepAnalysis.insights} />
                  </Section>
                ) : null}

                {/* 争议分析 */}
                {deepAnalysis.controversies?.length > 0 && (
                  <Section title="⑬ 争议分析">
                    {deepAnalysis.controversies.map((c: any, i: number) => (
                      <ControversyDetailCard key={i} c={c} />
                    ))}
                  </Section>
                )}

                {/* 专家共识 */}
                {deepAnalysis.expertConsensus ? (
                  <Section title="⑫ 专家共识">
                    <ConsensusSection data={deepAnalysis.expertConsensus} />
                  </Section>
                ) : null}

                {/* 趋势信号 */}
                <DeliverableSection num="②" title="趋势信号" data={deepAnalysis.trendSignals} />

                {/* 选题推荐 */}
                <DeliverableSection num="①" title="选题推荐" data={deepAnalysis.topicRecommendations} />

                {/* 知识卡片 */}
                {deepAnalysis.knowledgeCard && (
                  <Section title="⑨ 知识卡片">
                    <pre style={{ background: '#f8fafc', borderRadius: 6, padding: 12, fontSize: 12, whiteSpace: 'pre-wrap' }}>
                      {typeof deepAnalysis.knowledgeCard === 'string' ? deepAnalysis.knowledgeCard : JSON.stringify(deepAnalysis.knowledgeCard, null, 2)}
                    </pre>
                  </Section>
                )}

                {/* 跨域洞察 */}
                {deepAnalysis.crossDomainInsights ? (
                  <Section title="⑮ 跨域洞察">
                    <CrossDomainSection data={deepAnalysis.crossDomainInsights} />
                  </Section>
                ) : null}

                {/* 专家调用记录 */}
                {deepAnalysis.expertInvocations?.length > 0 && (
                  <Section title="🔍 专家调用记录">
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 6 }}>
                      {deepAnalysis.expertInvocations.map((inv: any, i: number) => (
                        <div key={i} style={{ background: '#f8fafc', borderRadius: 6, padding: '6px 10px', fontSize: 11 }}>
                          <div style={{ fontWeight: 600 }}>{inv.deliverable}</div>
                          <div style={{ color: '#666' }}>{inv.expertId}{inv.stage ? ` · ${inv.stage}` : ''}</div>
                          {inv.strategy && (
                            <div title={inv.strategy} style={{ color: '#6366f1', fontSize: 10, marginTop: 2 }}>
                              策略: {abbrevStrategy(inv.strategy)}
                            </div>
                          )}
                          <div style={{ color: inv.emmPass ? '#16a34a' : '#dc2626' }}>{inv.emmPass ? '✓ EMM通过' : '✗ EMM未通过'}</div>
                          {inv.durationMs && <div style={{ color: '#999' }}>{inv.durationMs}ms</div>}
                          {typeof inv.confidence === 'number' && (
                            <div style={{ color: '#888' }}>置信度: {Math.round(inv.confidence * 100)}%</div>
                          )}
                        </div>
                      ))}
                    </div>
                  </Section>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// 辅助组件
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 16 }}>
      <h4 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600 }}>{title}</h4>
      {children}
    </div>
  );
}

function renderDeliverableItem(item: any): string {
  if (item === null || item === undefined) return '';
  if (typeof item === 'string') return item;
  if (typeof item === 'number' || typeof item === 'boolean') return String(item);
  // 尝试提取常见的文本字段
  const text = item.title || item.insight || item.signal || item.trend || item.topic
    || item.consensus || item.position || item.statement || item.fact || item.content || item.summary;
  if (text && typeof text === 'string') {
    const extra = item.description || item.rationale || item.reason || item.strength || item.confidence;
    return extra ? `${text}\n${typeof extra === 'string' ? extra : JSON.stringify(extra)}` : text;
  }
  return JSON.stringify(item, null, 2);
}

function DeliverableSection({ num, title, data }: { num: string; title: string; data: any }) {
  if (!data || (Array.isArray(data) && data.length === 0)) return null;
  const items = Array.isArray(data) ? data : [data];
  return (
    <Section title={`${num} ${title}`}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.slice(0, 10).map((item: any, i: number) => (
          <pre key={i} style={{ background: '#f8fafc', borderRadius: 6, padding: '8px 12px', fontSize: 12, margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {renderDeliverableItem(item)}
          </pre>
        ))}
        {items.length > 10 && <div style={{ color: '#999', fontSize: 12 }}>…还有 {items.length - 10} 条</div>}
      </div>
    </Section>
  );
}

function InsightsSection({ data }: { data: any }) {
  const summary = typeof data?.summary === 'string' ? data.summary : '';
  const items = Array.isArray(data?.insights) ? data.insights : Array.isArray(data) ? data : [];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {summary ? (
        <div style={{ background: '#eef2ff', borderRadius: 6, padding: '8px 12px', fontSize: 12 }}>{summary}</div>
      ) : null}
      {items.length > 0 ? (
        items.slice(0, 10).map((item: any, i: number) => (
          <pre key={i} style={{ background: '#f8fafc', borderRadius: 6, padding: '8px 12px', fontSize: 12, margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {renderDeliverableItem(item)}
          </pre>
        ))
      ) : (
        <div style={{ color: '#999', fontSize: 12 }}>暂无可展示洞察</div>
      )}
    </div>
  );
}

function ConsensusSection({ data }: { data: any }) {
  const consensus = Array.isArray(data?.consensus) ? data.consensus : [];
  const divergences = Array.isArray(data?.divergences) ? data.divergences : [];
  if (consensus.length === 0 && divergences.length === 0) {
    return <div style={{ color: '#999', fontSize: 12 }}>暂无共识/分歧数据</div>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {consensus.slice(0, 6).map((item: any, i: number) => (
        <pre key={`c-${i}`} style={{ background: '#f8fafc', borderRadius: 6, padding: '8px 12px', fontSize: 12, margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {renderDeliverableItem(item)}
        </pre>
      ))}
      {divergences.slice(0, 4).map((item: any, i: number) => (
        <pre key={`d-${i}`} style={{ background: '#fff7ed', borderRadius: 6, padding: '8px 12px', fontSize: 12, margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {renderDeliverableItem(item)}
        </pre>
      ))}
    </div>
  );
}

function CrossDomainSection({ data }: { data: any }) {
  const associations = Array.isArray(data?.associations) ? data.associations : Array.isArray(data) ? data : [];
  if (associations.length === 0) {
    return <div style={{ color: '#999', fontSize: 12 }}>暂无跨域关联</div>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {associations.slice(0, 10).map((item: any, i: number) => (
        <pre key={i} style={{ background: '#f8fafc', borderRadius: 6, padding: '8px 12px', fontSize: 12, margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {renderDeliverableItem(item)}
        </pre>
      ))}
    </div>
  );
}

// Round 2: 详细争议卡片（⑬ 专家深度分析产出）
const CONTROVERSY_TYPE_STYLE: Record<string, { label: string; color: string }> = {
  real_disagreement: { label: '真实分歧', color: '#e11d48' },
  time_shift: { label: '时间变化', color: '#f59e0b' },
  source_error: { label: '来源差异', color: '#64748b' },
  definition_drift: { label: '定义漂移', color: '#3b82f6' },
  unknown: { label: '未知', color: '#64748b' },
};

function ControversyDetailCard({ c }: { c: any }) {
  const typeStyle = CONTROVERSY_TYPE_STYLE[c.contradictionType] || CONTROVERSY_TYPE_STYLE.unknown;
  return (
    <div style={{
      background: '#fffbeb',
      border: '1px solid #fde68a',
      borderRadius: 10,
      padding: 14,
      marginBottom: 12,
    }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 10 }}>
        <span style={{
          background: typeStyle.color, color: '#fff',
          padding: '2px 10px', borderRadius: 10, fontSize: 11,
        }}>
          {typeStyle.label}
        </span>
        {c.realWorldImpact && (
          <span style={{ color: '#666', fontSize: 12 }}>影响: {c.realWorldImpact.level}</span>
        )}
        {c.temporalContext && (
          <span style={{ color: '#888', fontSize: 11 }}>时间: {c.temporalContext}</span>
        )}
      </div>

      {/* 矛盾事实对 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 10, alignItems: 'center', marginBottom: 10 }}>
        <div style={{ background: '#fff', padding: 8, borderRadius: 6, fontSize: 12 }}>
          <div style={{ fontSize: 10, color: '#999', marginBottom: 2 }}>事实 A</div>
          <div><strong>{c.factA?.subject}</strong> · {c.factA?.predicate} → {c.factA?.object}</div>
          {typeof c.factA?.confidence === 'number' && (
            <div style={{ fontSize: 10, color: '#666', marginTop: 2 }}>confidence: {Math.round(c.factA.confidence * 100)}%</div>
          )}
        </div>
        <div style={{ fontWeight: 700, color: '#e11d48', fontSize: 14 }}>vs</div>
        <div style={{ background: '#fff', padding: 8, borderRadius: 6, fontSize: 12 }}>
          <div style={{ fontSize: 10, color: '#999', marginBottom: 2 }}>事实 B</div>
          <div><strong>{c.factB?.subject}</strong> · {c.factB?.predicate} → {c.factB?.object}</div>
          {typeof c.factB?.confidence === 'number' && (
            <div style={{ fontSize: 10, color: '#666', marginTop: 2 }}>confidence: {Math.round(c.factB.confidence * 100)}%</div>
          )}
        </div>
      </div>

      {/* Steelman */}
      {(c.steelmanA || c.steelmanB) && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
          <div style={{ background: '#fff', padding: 8, borderRadius: 6, fontSize: 12 }}>
            <div style={{ fontSize: 10, color: '#999', marginBottom: 2 }}>支持 A 的最强论证</div>
            <div>{c.steelmanA || '(未提供)'}</div>
          </div>
          <div style={{ background: '#fff', padding: 8, borderRadius: 6, fontSize: 12 }}>
            <div style={{ fontSize: 10, color: '#999', marginBottom: 2 }}>支持 B 的最强论证</div>
            <div>{c.steelmanB || '(未提供)'}</div>
          </div>
        </div>
      )}

      {/* 证据链 */}
      {(c.evidenceChainA?.length || c.evidenceChainB?.length) ? (
        <details style={{ fontSize: 12, marginBottom: 8 }}>
          <summary style={{ cursor: 'pointer', color: '#475569' }}>证据链</summary>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 6 }}>
            <div>
              <strong>A 方:</strong>
              <ul style={{ margin: '4px 0', paddingLeft: 16 }}>
                {(c.evidenceChainA || []).map((e: string, i: number) => <li key={i}>{e}</li>)}
              </ul>
            </div>
            <div>
              <strong>B 方:</strong>
              <ul style={{ margin: '4px 0', paddingLeft: 16 }}>
                {(c.evidenceChainB || []).map((e: string, i: number) => <li key={i}>{e}</li>)}
              </ul>
            </div>
          </div>
        </details>
      ) : null}

      {/* 利益相关方 */}
      {Array.isArray(c.stakeholders) && c.stakeholders.length > 0 && (
        <details style={{ fontSize: 12, marginBottom: 8 }}>
          <summary style={{ cursor: 'pointer', color: '#475569' }}>利益相关方 ({c.stakeholders.length})</summary>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 6, fontSize: 11 }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                <th style={{ padding: '4px 8px', border: '1px solid #e5e7eb', textAlign: 'left' }}>名称</th>
                <th style={{ padding: '4px 8px', border: '1px solid #e5e7eb', textAlign: 'left' }}>立场</th>
                <th style={{ padding: '4px 8px', border: '1px solid #e5e7eb', textAlign: 'left' }}>利益</th>
                <th style={{ padding: '4px 8px', border: '1px solid #e5e7eb', textAlign: 'left' }}>可信度</th>
              </tr>
            </thead>
            <tbody>
              {c.stakeholders.map((s: any, i: number) => (
                <tr key={i}>
                  <td style={{ padding: '4px 8px', border: '1px solid #e5e7eb' }}>{s.name}</td>
                  <td style={{ padding: '4px 8px', border: '1px solid #e5e7eb' }}>{s.position}</td>
                  <td style={{ padding: '4px 8px', border: '1px solid #e5e7eb' }}>{s.interest}</td>
                  <td style={{ padding: '4px 8px', border: '1px solid #e5e7eb' }}>{s.credibility}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}

      {/* 解决方案 / 残余不确定性 */}
      {(c.resolution || c.residualUncertainty) && (
        <div style={{
          background: '#ecfdf5', borderLeft: '3px solid #10b981',
          padding: '6px 10px', fontSize: 12, marginBottom: 6,
        }}>
          {c.resolution && <div>💡 <strong>判定:</strong> {c.resolution}</div>}
          {c.residualUncertainty && (
            <div style={{ marginTop: 4 }}>⚠️ <strong>残余不确定性:</strong> {c.residualUncertainty}</div>
          )}
        </div>
      )}

      {/* 底部元信息 */}
      <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 6, borderTop: '1px dashed #e5e7eb', paddingTop: 4 }}>
        分析专家: {c.analyzedByExpertId || '-'} · invokeId: {c.expertInvokeId?.slice(0, 8) || '-'}
      </div>
    </div>
  );
}

// Round 2: 策略 spec 字符串 → 紧凑中文缩写
const STRATEGY_ABBR: Record<string, string> = {
  single: '单',
  debate: '辩论',
  mental_model_rotation: '轮询',
  heuristic_trigger_first: '触发',
  failure_check: '自检',
  emm_iterative: 'EMM',
  evidence_anchored: '锚案例',
  calibrated_confidence: '校准',
  track_record_verify: '历史',
  signature_style: '签名',
  knowledge_grounded: '引证',
  contradictions_surface: '矛盾',
  rubric_anchored_output: 'R',
};
function abbrevStrategy(spec?: string): string {
  if (!spec) return '-';
  return spec.split('|').map(s => STRATEGY_ABBR[s] || s.slice(0, 6)).join('|');
}
