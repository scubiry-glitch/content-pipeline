// 内容库 — 统一批量操作面板
// v7.3: 认知综合预生成 + 断点续传 + 跳过/覆盖
// Step 1: 素材来源 | Step 2: AI 分析 | Step 3: 事实提取
// Step 4: 知识图谱重算 | Step 5: AI 产出物预生成 | Step 6: Wiki

import { useState, useEffect, useRef } from 'react';
import { ProductMetaBar } from '../components/ContentLibraryProductMeta';

const API = '/api/v1/content-library';
const API_AI = '/api/v1/ai/assets';

interface StepStatus {
  status: 'idle' | 'running' | 'done' | 'error';
  message?: string;
  lastRun?: string;
}

interface JobProgress {
  processed: number;
  total: number;
  newFacts: number;
  updatedFacts: number;
  errors: number;
}

interface SynthesisProgress {
  total: number;
  processed: number;
  generated: number;
  skipped: number;
  errors: number;
  currentEntity?: string;
}

export function ContentLibraryBatchOps() {
  const [steps, setSteps] = useState<Record<string, StepStatus>>({
    import: { status: 'idle' },
    ai: { status: 'idle' },
    extract: { status: 'idle' },
    graph: { status: 'idle' },
    topics: { status: 'idle' },
    synthesis: { status: 'idle' },
    wiki: { status: 'idle' },
  });
  const [extractJobId, setExtractJobId] = useState<string | null>(null);
  const [progress, setProgress] = useState<JobProgress | null>(null);
  const [extractLimit, setExtractLimit] = useState(50);
  const [extractSource, setExtractSource] = useState<'assets' | 'rss'>('assets');
  /** v7.3 调整1: 质量分门槛 (0=不过滤, >0 = 过滤低于此分的素材) */
  const [extractMinQuality, setExtractMinQuality] = useState(0);
  /** v7.3 调整2: Step 2 重试失败的资产 */
  const [retryFailed, setRetryFailed] = useState(false);
  /** v7.3: Step 2 素材来源勾选（仅 assets 表，不含 rss_items） */
  const [aiSourceAssets, setAiSourceAssets] = useState(true);
  const [aiSourceBinding, setAiSourceBinding] = useState(true);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Step 5b: 认知综合预生成
  const [synthesisJobId, setSynthesisJobId] = useState<string | null>(null);
  const [synthesisProgress, setSynthesisProgress] = useState<SynthesisProgress | null>(null);
  const [synthesisOverwrite, setSynthesisOverwrite] = useState(false);
  const [synthesisLimit, setSynthesisLimit] = useState(30);
  const [synthesisCacheStats, setSynthesisCacheStats] = useState<{ total: number; entities: number } | null>(null);
  const synthesisEsRef = useRef<EventSource | null>(null);

  // 通用 step 状态更新
  const setStep = (key: string, update: Partial<StepStatus>) => {
    setSteps(prev => ({ ...prev, [key]: { ...prev[key], ...update } }));
  };

  // Step 1: 素材来源 — 触发目录扫描
  const triggerDirectoryScan = async () => {
    setStep('import', { status: 'running', message: '正在扫描目录...' });
    try {
      const res = await fetch('/api/v1/assets/bindings', { method: 'GET' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const bindings = await res.json();
      const items = Array.isArray(bindings) ? bindings : bindings.items || [];
      let totalImported = 0, totalErrors = 0, scanned = 0;
      for (const b of items.slice(0, 5)) {
        try {
          const scanRes = await fetch(`/api/v1/assets/bindings/${b.id}/scan`, { method: 'POST' });
          if (scanRes.ok) {
            const scanData = await scanRes.json();
            totalImported += scanData.imported || 0;
            totalErrors += scanData.errors || 0;
          }
          scanned++;
        } catch { /* ignore */ }
      }
      setStep('import', {
        status: 'done',
        message: `扫描 ${scanned} 个目录 · 新素材 ${totalImported} · 错误 ${totalErrors}`,
        lastRun: new Date().toISOString(),
      });
    } catch (err) {
      setStep('import', { status: 'error', message: (err as Error).message });
    }
  };

  // Step 2: AI 批量分析 (v7.3: 断点续传 + 可选重试失败)
  const triggerAIBatch = async () => {
    setStep('ai', { status: 'running', message: retryFailed ? '启动 AI 分析 (含重试失败)...' : '启动 AI 批量分析...' });
    try {
      const res = await fetch(`${API_AI}/batch-process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify((() => {
          const sources = [
            ...(aiSourceAssets ? ['upload'] : []),
            ...(aiSourceBinding ? ['binding'] : []),
          ];
          return {
            batchSize: 20,
            retryFailed,
            sources: sources.length > 0 ? sources : undefined,
          };
        })()),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const processed = data.processed ?? data.totalAssets ?? data.queued ?? '?';
      const msg = data.message && data.message !== 'No assets to process'
        ? `${data.message}（处理 ${processed} 个）`
        : processed === 0 || processed === '0'
          ? '暂无待分析素材'
          : `处理 ${processed} 个素材`;
      setStep('ai', { status: 'done', message: msg, lastRun: new Date().toISOString() });
    } catch (err) {
      setStep('ai', { status: 'error', message: (err as Error).message });
    }
  };

  // Step 3: 事实提取 (异步 job + SSE)
  const startExtractJob = async () => {
    setStep('extract', { status: 'running', message: '启动两段式提取 job...' });
    setProgress(null);
    try {
      const res = await fetch(`${API}/reextract/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          limit: extractLimit,
          onlyUnprocessed: true,
          source: extractSource,
          minQualityScore: extractMinQuality > 0 ? extractMinQuality : undefined,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { jobId } = await res.json();
      setExtractJobId(jobId);

      // 订阅 SSE
      const es = new EventSource(`${API}/reextract/jobs/${jobId}/stream`);
      eventSourceRef.current = es;
      es.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.processed !== undefined) {
            setProgress({ processed: data.processed, total: data.total || extractLimit, newFacts: data.newFacts || 0, updatedFacts: data.updatedFacts || 0, errors: data.errors || 0 });
          }
          if (data.status && data.status !== 'running') {
            setStep('extract', { status: data.status === 'completed' ? 'done' : 'error', message: `处理 ${data.processed || 0} 条`, lastRun: new Date().toISOString() });
            es.close();
          }
        } catch { /* ignore */ }
      };
      es.addEventListener('progress', (e: any) => {
        try {
          const d = JSON.parse(e.data);
          setProgress(prev => ({ ...prev!, ...d }));
        } catch { /* ignore */ }
      });
      es.addEventListener('done', (e: any) => {
        try {
          const d = JSON.parse(e.data);
          setStep('extract', { status: d.status === 'completed' ? 'done' : 'error', lastRun: new Date().toISOString() });
        } catch { /* ignore */ }
        es.close();
      });
      es.onerror = () => {
        setStep('extract', { status: 'done', message: 'SSE 连接关闭', lastRun: new Date().toISOString() });
        es.close();
      };
    } catch (err) {
      setStep('extract', { status: 'error', message: (err as Error).message });
    }
  };

  const cancelExtractJob = async () => {
    if (extractJobId) {
      await fetch(`${API}/reextract/jobs/${extractJobId}`, { method: 'DELETE' }).catch(() => {});
      eventSourceRef.current?.close();
      setStep('extract', { status: 'idle', message: '已取消' });
    }
  };

  // Step 4: 知识图谱重算
  const triggerGraphRecompute = async () => {
    setStep('graph', { status: 'running', message: '重算社区 + 边表 + 观点...' });
    try {
      const [commRes, relRes, beliefsRes] = await Promise.all([
        fetch(`${API}/communities/recompute`, { method: 'POST' }),
        fetch(`${API}/relations/recompute`, { method: 'POST' }),
        fetch(`${API}/beliefs/recompute`, { method: 'POST' }),
      ]);
      const comm = commRes.ok ? await commRes.json() : null;
      const rel = relRes.ok ? await relRes.json() : null;
      const beliefs = beliefsRes.ok ? await beliefsRes.json() : null;
      setStep('graph', {
        status: 'done',
        message: `社区 ${comm?.communities || '?'} 个 · 边 ${rel?.inserted || '?'} 条 · 观点 ${beliefs?.total || '?'} 条`,
        lastRun: new Date().toISOString(),
      });
    } catch (err) {
      setStep('graph', { status: 'error', message: (err as Error).message });
    }
  };

  // Step 5a: 议题叙事预生成
  const triggerTopicEnrich = async () => {
    setStep('topics', { status: 'running', message: '调用 LLM 生成议题叙事并缓存...' });
    try {
      const res = await fetch(`${API}/topics/enrich?limit=10`, { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setStep('topics', {
        status: 'done',
        message: `${data.total || 0} 个议题, ${data.enriched || 0} 个成功生成叙事`,
        lastRun: new Date().toISOString(),
      });
    } catch (err) {
      setStep('topics', { status: 'error', message: (err as Error).message });
    }
  };

  // Step 5b: 认知综合预生成 — 读取缓存状态
  const loadSynthesisCacheStats = async () => {
    try {
      const res = await fetch(`${API}/synthesize/cache/stats`);
      if (res.ok) setSynthesisCacheStats(await res.json());
    } catch { /* ignore */ }
  };

  // Step 5b: 启动预生成 job + SSE
  const startSynthesisJob = async () => {
    setStep('synthesis', { status: 'running', message: '启动认知综合预生成...' });
    setSynthesisProgress(null);
    synthesisEsRef.current?.close();
    try {
      const res = await fetch(`${API}/synthesize/pregenerate/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: synthesisLimit, overwrite: synthesisOverwrite, minFacts: 3 }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { jobId } = await res.json();
      setSynthesisJobId(jobId);

      const es = new EventSource(`${API}/synthesize/pregenerate/jobs/${jobId}/stream`);
      synthesisEsRef.current = es;

      const applyProgress = (d: any) => {
        if (d.total !== undefined) {
          setSynthesisProgress(prev => ({ ...prev!, ...d }));
        }
        if (d.processed !== undefined) {
          const pct = d.total > 0 ? Math.round(d.processed / d.total * 100) : 0;
          const skip = synthesisOverwrite ? '' : ` · 跳过 ${d.skipped || 0}`;
          setStep('synthesis', {
            status: 'running',
            message: `${d.processed}/${d.total} (${pct}%) · 已生成 ${d.generated || 0}${skip}`,
          });
        }
      };

      es.onmessage = (e) => {
        try { applyProgress(JSON.parse(e.data)); } catch { /* ignore */ }
      };
      es.addEventListener('total', (e: any) => {
        try { const d = JSON.parse(e.data); setSynthesisProgress(p => ({ ...p!, total: d.total })); } catch { /* */ }
      });
      es.addEventListener('progress', (e: any) => {
        try { applyProgress(JSON.parse(e.data)); } catch { /* ignore */ }
      });
      es.addEventListener('done', (e: any) => {
        try {
          const d = JSON.parse(e.data);
          const isOk = d.status === 'completed';
          setStep('synthesis', {
            status: isOk ? 'done' : 'error',
            message: `完成 ${d.generated || 0} 条 · 跳过 ${d.skipped || 0} · 错误 ${d.errors || 0}`,
            lastRun: new Date().toISOString(),
          });
          loadSynthesisCacheStats();
        } catch { /* ignore */ }
        es.close();
      });
      es.onerror = () => {
        setStep('synthesis', { status: 'done', message: 'SSE 已关闭', lastRun: new Date().toISOString() });
        es.close();
        loadSynthesisCacheStats();
      };
    } catch (err) {
      setStep('synthesis', { status: 'error', message: (err as Error).message });
    }
  };

  const cancelSynthesisJob = async () => {
    if (synthesisJobId) {
      await fetch(`${API}/synthesize/pregenerate/jobs/${synthesisJobId}`, { method: 'DELETE' }).catch(() => {});
      synthesisEsRef.current?.close();
      setStep('synthesis', { status: 'idle', message: '已取消' });
    }
  };

  // Step 6: Wiki 重生成
  const triggerWikiGenerate = async () => {
    setStep('wiki', { status: 'running', message: '生成 Wiki...' });
    try {
      const res = await fetch(`${API}/wiki/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wikiRoot: './data/content-wiki/default' }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setStep('wiki', {
        status: 'done',
        message: `${data.filesWritten || 0} 个文件, ${data.entities || 0} 实体页`,
        lastRun: new Date().toISOString(),
      });
    } catch (err) {
      setStep('wiki', { status: 'error', message: (err as Error).message });
    }
  };

  // 一键全量更新
  // v7.3: Step 2 与 Step 3 无数据依赖，可并发执行 (Step 2 写 AI 元数据, Step 3 写知识三元组)
  const runAll = async () => {
    await triggerDirectoryScan();
    await triggerAIBatch();
    await startExtractJob();
    // Step 2 & 3 的后台 job 并发运行；Step 4-6 需前置完成，留给用户手动触发
  };

  // 初始化：加载缓存统计
  useEffect(() => {
    loadSynthesisCacheStats();
    return () => {
      eventSourceRef.current?.close();
      synthesisEsRef.current?.close();
    };
  }, []);

  const statusIcon = (s: StepStatus['status']) => {
    switch (s) {
      case 'idle': return '⚪';
      case 'running': return '🔄';
      case 'done': return '✅';
      case 'error': return '❌';
    }
  };

  const progressPct = progress && progress.total > 0
    ? Math.round(progress.processed / progress.total * 100)
    : 0;

  return (
    <div className="p-6">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">批量操作中心</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">
          从素材导入到知识图谱，一站式完成内容库全量更新
        </p>
      </div>

      <div className="space-y-4 max-w-3xl">
        {/* Step 1: 素材来源 */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              {statusIcon(steps.import.status)} Step 1: 素材导入
            </h3>
            <div className="flex gap-2">
              <button onClick={triggerDirectoryScan} disabled={steps.import.status === 'running'}
                className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
                📂 扫描目录
              </button>
              <a href="/assets" className="px-3 py-1.5 text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-200">
                手动上传
              </a>
            </div>
          </div>
          {steps.import.message && <p className="text-sm text-gray-500">{steps.import.message}</p>}
        </div>

        {/* Step 2: AI 分析 (v7.3: 断点续传 + 重试失败) */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              {statusIcon(steps.ai.status)} Step 2: AI 批量分析
            </h3>
            <button onClick={triggerAIBatch} disabled={steps.ai.status === 'running'}
              className="px-3 py-1.5 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50">
              🧠 启动分析
            </button>
          </div>
          <p className="text-xs text-gray-400">向量化 + 质量评分 + 主题检测 + 去重（断点续传: 卡住 &gt;30min 自动恢复）</p>
          <div className="flex flex-wrap gap-4 mt-2">
            <span className="text-xs text-gray-500">素材来源:</span>
            <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer select-none">
              <input type="checkbox" checked={aiSourceAssets} onChange={e => setAiSourceAssets(e.target.checked)}
                className="rounded accent-indigo-600" />
              📁 素材库 (upload)
            </label>
            <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer select-none">
              <input type="checkbox" checked={aiSourceBinding} onChange={e => setAiSourceBinding(e.target.checked)}
                className="rounded accent-indigo-600" />
              📂 目录绑定 (binding)
            </label>
            <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer select-none">
              <input type="checkbox" checked={retryFailed} onChange={e => setRetryFailed(e.target.checked)}
                className="rounded accent-indigo-600" />
              🔄 包含之前失败的素材
            </label>
          </div>
          <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
            📡 RSS 条目 (1116 条) 存储在独立表，不经过此步 → 直接在 Step 3 选「RSS 源」提取事实
          </p>
          {steps.ai.message && <p className="text-sm text-gray-500 mt-1">{steps.ai.message}</p>}
        </div>

        {/* Step 3: 事实提取 */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              {statusIcon(steps.extract.status)} Step 3: 两段式事实提取
            </h3>
            <div className="flex gap-2 items-center">
              <select value={extractSource} onChange={e => setExtractSource(e.target.value as any)}
                className="px-2 py-1 text-xs border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                <option value="assets">素材库 (assets)</option>
                <option value="rss">📡 RSS 源 (1116 条)</option>
              </select>
              <input type="number" min={1} max={500} value={extractLimit}
                onChange={e => setExtractLimit(Math.min(500, Math.max(1, Number(e.target.value) || 50)))}
                className="w-16 px-2 py-1 text-xs border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
              <span className="text-xs text-gray-400">条</span>
              {steps.extract.status === 'running' ? (
                <button onClick={cancelExtractJob} className="px-3 py-1.5 text-xs bg-red-500 text-white rounded hover:bg-red-600">
                  ⏹ 取消
                </button>
              ) : (
                <button onClick={startExtractJob} className="px-3 py-1.5 text-xs bg-amber-600 text-white rounded hover:bg-amber-700">
                  📋 启动提取
                </button>
              )}
            </div>
          </div>
          <div className="flex gap-4 items-center mt-1 flex-wrap">
            <p className="text-xs text-gray-400">analyze → extract → delta compress → entity resolve (断点续传 + themeId 关联)</p>
            <label className="flex items-center gap-1 text-xs text-gray-500 cursor-pointer select-none">
              质量门槛
              <input type="number" min={0} max={100} value={extractMinQuality}
                onChange={e => setExtractMinQuality(Math.min(100, Math.max(0, Number(e.target.value) || 0)))}
                className="w-12 px-1 py-0.5 border rounded text-xs dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
              {extractMinQuality > 0 && <span className="text-amber-500 text-[10px]">跳过 &lt;{extractMinQuality} 分</span>}
            </label>
          </div>
          {progress && (
            <div className="mt-3">
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>{progress.processed}/{progress.total} ({progressPct}%)</span>
                <span>新事实 {progress.newFacts} · 更新 {progress.updatedFacts} · 错误 {progress.errors}</span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div className="bg-indigo-600 rounded-full h-2 transition-all" style={{ width: `${progressPct}%` }} />
              </div>
            </div>
          )}
          {steps.extract.message && <p className="text-sm text-gray-500 mt-1">{steps.extract.message}</p>}
        </div>

        {/* Step 4: 知识图谱 */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              {statusIcon(steps.graph.status)} Step 4: 知识图谱重算
            </h3>
            <button onClick={triggerGraphRecompute} disabled={steps.graph.status === 'running'}
              className="px-3 py-1.5 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50">
              🔗 重算图谱
            </button>
          </div>
          <p className="text-xs text-gray-400">Louvain 社区发现 + 4 信号边表</p>
          {steps.graph.message && <p className="text-sm text-gray-500 mt-1">{steps.graph.message}</p>}
        </div>

        {/* Step 5: AI 产出物预生成（5a 议题叙事 + 5b 认知综合） */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
            {(steps.topics.status === 'running' || steps.synthesis.status === 'running') ? '🔄' :
             (steps.topics.status === 'error' || steps.synthesis.status === 'error') ? '❌' :
             (steps.topics.status === 'done' && steps.synthesis.status === 'done') ? '✅' : '⚪'}
            Step 5: AI 产出物预生成
          </h3>

          {/* 5a: 议题叙事 */}
          <div className="flex items-start justify-between gap-3 pb-3 border-b border-gray-100 dark:border-gray-700">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="text-xs font-medium text-gray-600 dark:text-gray-300">{statusIcon(steps.topics.status)} 5a · 议题叙事</span>
              </div>
              <p className="text-xs text-gray-400">Top 10 议题 → 标题/导语/角度矩阵，缓存至 DB</p>
              {steps.topics.message && <p className="text-xs text-gray-500 mt-0.5">{steps.topics.message}</p>}
              {steps.topics.lastRun && <p className="text-[10px] text-gray-400">上次: {new Date(steps.topics.lastRun).toLocaleString()}</p>}
            </div>
            <button onClick={triggerTopicEnrich} disabled={steps.topics.status === 'running'}
              className="px-3 py-1.5 text-xs bg-rose-600 text-white rounded hover:bg-rose-700 disabled:opacity-50 shrink-0">
              ✍️ 生成叙事
            </button>
          </div>

          {/* 5b: 认知综合 */}
          <div className="pt-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                  <span className="text-xs font-medium text-gray-600 dark:text-gray-300">{statusIcon(steps.synthesis.status)} 5b · 认知综合</span>
                  {synthesisCacheStats && (
                    <span className="text-[10px] text-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 px-1.5 py-0.5 rounded">
                      缓存 {synthesisCacheStats.entities || 0} 实体
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-400">按实体逐一调 LLM 提炼洞察并写缓存，打开综合页直接读取</p>
              </div>
              <div className="flex gap-2 items-center shrink-0">
                {steps.synthesis.status === 'running' ? (
                  <button onClick={cancelSynthesisJob}
                    className="px-3 py-1.5 text-xs bg-red-500 text-white rounded hover:bg-red-600">
                    ⏹ 取消
                  </button>
                ) : (
                  <button onClick={startSynthesisJob}
                    className="px-3 py-1.5 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700">
                    🧠 预生成
                  </button>
                )}
              </div>
            </div>

            {/* 参数行 */}
            <div className="flex gap-4 items-center mt-2 flex-wrap">
              <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer select-none">
                <input type="number" min={5} max={200} value={synthesisLimit}
                  onChange={e => setSynthesisLimit(Math.min(200, Math.max(5, Number(e.target.value) || 30)))}
                  className="w-14 px-1.5 py-0.5 border rounded text-xs dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                个实体
              </label>
              <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer select-none">
                <input type="checkbox" checked={synthesisOverwrite}
                  onChange={e => setSynthesisOverwrite(e.target.checked)}
                  className="rounded accent-indigo-600" />
                覆盖已有缓存
                {!synthesisOverwrite && <span className="text-[10px] text-green-600 ml-0.5">(断点续传)</span>}
              </label>
            </div>

            {/* 进度条 */}
            {synthesisProgress && synthesisProgress.total > 0 && (
              <div className="mt-2">
                <div className="flex justify-between text-[10px] text-gray-400 mb-1">
                  <span>
                    {synthesisProgress.processed}/{synthesisProgress.total}
                    {synthesisProgress.currentEntity && (
                      <span className="text-indigo-500 ml-1">· {synthesisProgress.currentEntity}</span>
                    )}
                  </span>
                  <span>
                    生成 {synthesisProgress.generated}
                    {!synthesisOverwrite && ` · 跳过 ${synthesisProgress.skipped}`}
                    {synthesisProgress.errors > 0 && ` · 错误 ${synthesisProgress.errors}`}
                  </span>
                </div>
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                  <div
                    className="bg-indigo-500 rounded-full h-1.5 transition-all"
                    style={{ width: `${Math.round(synthesisProgress.processed / synthesisProgress.total * 100)}%` }}
                  />
                </div>
              </div>
            )}

            {steps.synthesis.message && (
              <p className="text-xs text-gray-500 mt-1">{steps.synthesis.message}</p>
            )}
            {steps.synthesis.lastRun && (
              <p className="text-[10px] text-gray-400">上次: {new Date(steps.synthesis.lastRun).toLocaleString()}</p>
            )}
          </div>
        </div>

        {/* Step 6: Wiki */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              {statusIcon(steps.wiki.status)} Step 6: Wiki 重生成
            </h3>
            <button onClick={triggerWikiGenerate} disabled={steps.wiki.status === 'running'}
              className="px-3 py-1.5 text-xs bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50">
              📖 生成 Wiki
            </button>
          </div>
          <p className="text-xs text-gray-400">物化为 Obsidian 兼容 Markdown vault</p>
          {steps.wiki.message && <p className="text-sm text-gray-500 mt-1">{steps.wiki.message}</p>}
        </div>

        {/* 一键全量 */}
        <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={runAll}
            disabled={Object.values(steps).some(s => s.status === 'running')}
            className="w-full py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold rounded-lg hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 text-sm"
          >
            🔄 一键全量更新 (Step 1→3 顺序执行)
          </button>
          <p className="text-xs text-gray-400 text-center mt-2">
            Step 4–5 在事实提取完成后手动触发（需确认数据正确）
          </p>
        </div>
      </div>
    </div>
  );
}
