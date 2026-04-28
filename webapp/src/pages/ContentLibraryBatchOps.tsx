// 内容库 — 统一批量操作面板
// v7.3: 认知综合预生成 + 断点续传 + 跳过/覆盖
// Step 1: 素材来源 | Step 2: AI 分析 | Step 3: 事实提取
// Step 4: 知识图谱重算 | Step 5: AI 产出物预生成 | Step 6: Wiki

import { useState, useEffect, useRef } from 'react';
import { StrategyPanel, useStrategySpec } from '../components/StrategyPanel';

const API = '/api/v1/content-library';
const API_AI = '/api/v1/ai/assets';

interface PendingAsset {
  id: string;
  title: string;
  source?: string;
  fileType?: string;
  createdAt?: string;
}

interface StepStatus {
  status: 'idle' | 'running' | 'done' | 'error';
  message?: string;
  lastRun?: string;
}

interface ErrorSample {
  assetId: string;
  assetTitle?: string;
  message: string;
  kind: string;
}

/** batch-ops 改进 #1: Step 3 质量面板的后端响应形态 */
interface QualityStats {
  jobId: string;
  window: { startedAt: string; completedAt: string };
  totals: {
    facts: number;
    errors: number;
    avgConfidence: number;
    placeholderRate: number;
    highConfRate: number;
  };
  confidenceBuckets: Array<{ range: string; label: string; count: number }>;
  placeholderByField: { subject: number; predicate: number; object: number };
  errorByKind: Record<string, number>;
  verdict: 'good' | 'fair' | 'poor';
}

interface JobProgress {
  processed: number;
  total: number;
  newFacts: number;
  updatedFacts: number;
  errors: number;
  /** batch-ops 改进 #2: 错误样例展开（前 5 条） */
  errorSamples?: ErrorSample[];
}

interface SynthesisProgress {
  total: number;
  processed: number;
  generated: number;
  skipped: number;
  errors: number;
  currentEntity?: string;
}

interface DedupResult {
  mode: 'dry-run' | 'apply';
  scanned: number;
  duplicate_groups: number;
  canonical_kept: number;
  to_hide: number;
  to_delete: number;
  processed: number;
}

export function ContentLibraryBatchOps() {
  const [steps, setSteps] = useState<Record<string, StepStatus>>({
    import: { status: 'idle' },
    ai: { status: 'idle' },
    extract: { status: 'idle' },
    graph: { status: 'idle' },
    zepSync: { status: 'idle' },
    topics: { status: 'idle' },
    synthesis: { status: 'idle' },
    wiki: { status: 'idle' },
  });
  const [extractJobId, setExtractJobId] = useState<string | null>(null);
  const [progress, setProgress] = useState<JobProgress | null>(null);
  /** batch-ops 改进 #1: Step 3 完成后拉一次质量面板数据 */
  const [extractQuality, setExtractQuality] = useState<QualityStats | null>(null);
  const [extractLimit, setExtractLimit] = useState(50);
  const [extractSource, setExtractSource] = useState<'assets' | 'rss'>('assets');
  /** v7.3 调整1: 质量分门槛 (0=不过滤, >0 = 过滤低于此分的素材) */
  const [extractMinQuality, setExtractMinQuality] = useState(0);
  /** v7.3 调整2: Step 2 重试失败的资产 */
  const [retryFailed, setRetryFailed] = useState(false);
  /** v7.3: Step 2 素材来源勾选（仅 assets 表，不含 rss_items） */
  const [aiSourceAssets, setAiSourceAssets] = useState(true);
  const [aiSourceBinding, setAiSourceBinding] = useState(true);
  /** v7.4: Step 2 深度分析开关 — 勾选后跑 15 产出物 + 专家库 EMM */
  const [enableDeepAnalysis, setEnableDeepAnalysis] = useState(false);
  /** Round 2: Step 3 / 5 / topics 的 deep 开关 + 策略配置 */
  const [extractDeep, setExtractDeep] = useState(false);
  const [synthesisDeep, setSynthesisDeep] = useState(false);
  const [topicsDeep, setTopicsDeep] = useState(false);
  const [graphDeep, setGraphDeep] = useState(false);
  /**
   * batch-ops 改进 #4: 质量档全局开关
   * fast: 全部 deep 关 / balanced: Step 3 + 5b 开（核心抽取+综合走深度）/ deep: 全开
   * 用户切档后自动同步 5 个 deep state；切到 'custom' 表示用户单独调过、不再受全局控制
   */
  type QualityTier = 'fast' | 'balanced' | 'deep' | 'custom';
  const [qualityTier, setQualityTier] = useState<QualityTier>('fast');
  const applyQualityTier = (tier: QualityTier) => {
    if (tier === 'custom') { setQualityTier('custom'); return; }
    setQualityTier(tier);
    if (tier === 'fast') {
      setEnableDeepAnalysis(false);
      setExtractDeep(false);
      setGraphDeep(false);
      setTopicsDeep(false);
      setSynthesisDeep(false);
    } else if (tier === 'balanced') {
      setEnableDeepAnalysis(false);  // Step 2 不开（最贵 + 收益靠 Step 3）
      setExtractDeep(true);          // Step 3 核心抽取开深度
      setGraphDeep(false);            // Step 4a 默认关，需要 L3 张力时手动开
      setTopicsDeep(false);
      setSynthesisDeep(true);         // Step 5b 综合走 CDT
    } else {
      setEnableDeepAnalysis(true);
      setExtractDeep(true);
      setGraphDeep(true);
      setTopicsDeep(true);
      setSynthesisDeep(true);
    }
  };
  // 任一 deep 开关被单独修改时把 tier 标 'custom'，避免被下次 tier 切换覆盖
  // 注意：applyQualityTier 内部 setX 也会触发这些 useEffect，所以用 ref 标记防递归
  const tierGuard = useRef(false);
  useEffect(() => {
    if (tierGuard.current) { tierGuard.current = false; return; }
    // 检查当前组合是否匹配某个预设
    const all = [enableDeepAnalysis, extractDeep, graphDeep, topicsDeep, synthesisDeep];
    if (all.every((x) => !x) && qualityTier !== 'fast') setQualityTier('custom');
    else if (all.every((x) => x) && qualityTier !== 'deep') setQualityTier('custom');
    else if (!enableDeepAnalysis && extractDeep && !graphDeep && !topicsDeep && synthesisDeep && qualityTier !== 'balanced') setQualityTier('custom');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enableDeepAnalysis, extractDeep, graphDeep, topicsDeep, synthesisDeep]);
  const [graphDeepLimit, setGraphDeepLimit] = useState(30);
  const [graphProgress, setGraphProgress] = useState<{ done: number; total: number; label: string } | null>(null);
  const [topicsLimit, setTopicsLimit] = useState(20);
  const [step2Strategy, setStep2Strategy] = useStrategySpec('step2');
  const [step3Strategy, setStep3Strategy] = useStrategySpec('step3');
  const [step5Strategy, setStep5Strategy] = useStrategySpec('step5');
  const [topicsStrategy, setTopicsStrategy] = useStrategySpec('topics');
  // 确认弹窗状态
  const [confirmModal, setConfirmModal] = useState<{
    open: boolean;
    loading: boolean;
    assets: PendingAsset[];
    selected: Set<string>;
  }>({ open: false, loading: false, assets: [], selected: new Set() });

  const eventSourceRef = useRef<EventSource | null>(null);

  // Step 4b: Zep 知识回填
  const [zepSyncJobId, setZepSyncJobId] = useState<string | null>(null);
  const [zepSyncProgress, setZepSyncProgress] = useState<{ total: number; synced: number; skipped: number; errors: number } | null>(null);
  const zepSyncEsRef = useRef<EventSource | null>(null);

  // Step 5b: 认知综合预生成
  const [synthesisJobId, setSynthesisJobId] = useState<string | null>(null);
  const [synthesisProgress, setSynthesisProgress] = useState<SynthesisProgress | null>(null);
  const [synthesisOverwrite, setSynthesisOverwrite] = useState(false);
  const [synthesisLimit, setSynthesisLimit] = useState(30);
  const [synthesisCacheStats, setSynthesisCacheStats] = useState<{ total: number; entities: number } | null>(null);
  const synthesisEsRef = useRef<EventSource | null>(null);
  const [dedupRunning, setDedupRunning] = useState(false);
  const [dedupResult, setDedupResult] = useState<DedupResult | null>(null);
  const [dedupMessage, setDedupMessage] = useState<string>('');

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

  const runAssetDeduplicate = async (mode: 'dry-run' | 'apply') => {
    setDedupRunning(true);
    setDedupMessage(mode === 'dry-run' ? '正在预览重复资产...' : '正在执行去重（删除/隐藏）...');
    try {
      const res = await fetch('/api/v1/assets/deduplicate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, limit: 3000 }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setDedupResult(data);
      setDedupMessage(
        mode === 'dry-run'
          ? `预览完成：${data.duplicate_groups || 0} 组重复，待删 ${data.to_delete || 0}，待隐藏 ${data.to_hide || 0}`
          : `执行完成：删除 ${data.to_delete || 0}，隐藏 ${data.to_hide || 0}`
      );
    } catch (err) {
      setDedupMessage(`去重失败：${(err as Error).message}`);
    } finally {
      setDedupRunning(false);
    }
  };

  // Step 2: 打开确认弹窗（先拉取 pending 列表）
  const openAIBatchConfirm = async () => {
    setConfirmModal({ open: true, loading: true, assets: [], selected: new Set() });
    try {
      // 只有单独选择某一来源时才传 sources 过滤，都选或都不选则不过滤
      const sources = [
        ...(aiSourceAssets ? ['upload'] : []),
        ...(aiSourceBinding ? ['binding'] : []),
      ];
      const params = new URLSearchParams({ limit: '200', retryFailed: String(retryFailed) });
      // 仅当两者不全选时传 sources（全选 = 不过滤）
      if (sources.length > 0 && sources.length < 2) params.set('sources', sources.join(','));
      const res = await fetch(`${API_AI}/pending?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const assets: PendingAsset[] = data.items || [];
      setConfirmModal({
        open: true,
        loading: false,
        assets,
        selected: new Set(assets.map((a: PendingAsset) => a.id)),
      });
    } catch (err) {
      setConfirmModal({ open: false, loading: false, assets: [], selected: new Set() });
      setStep('ai', { status: 'error', message: (err as Error).message });
    }
  };

  // Step 2: AI 批量分析 (v7.3: 断点续传 + 可选重试失败; v7.4: 深度分析开关)
  const triggerAIBatch = async (assetIds?: string[]) => {
    setConfirmModal({ open: false, loading: false, assets: [], selected: new Set() });
    const total = assetIds?.length ?? 0;
    setStep('ai', { status: 'running', message: `正在分析 0 / ${total}...` });
    try {
      const sources = [
        ...(aiSourceAssets ? ['upload'] : []),
        ...(aiSourceBinding ? ['binding'] : []),
      ];
      // 记录开始前已完成数，用于计算增量
      const baseStats = await fetch(`${API_AI}/stats`).then(r => r.json()).catch(() => ({ totalAnalyzed: 0 }));
      const baseAnalyzed: number = baseStats.totalAnalyzed ?? 0;

      const res = await fetch(`${API_AI}/batch-process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          batchSize: 20,
          retryFailed,
          sources: sources.length > 0 ? sources : undefined,
          enableDeepAnalysis,
          expertStrategy: enableDeepAnalysis ? step2Strategy : undefined,
          ...(assetIds ? { assetIds } : {}),
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.totalAssets === 0) {
        setStep('ai', { status: 'done', message: '暂无待分析素材', lastRun: new Date().toISOString() });
        return;
      }
      const jobTotal: number = data.totalAssets ?? total;

      // 轮询 /stats 展示实时进度，直到增量 >= jobTotal 或超时（5min）
      const deadline = Date.now() + 5 * 60 * 1000;
      const poll = setInterval(async () => {
        try {
          const s = await fetch(`${API_AI}/stats`).then(r => r.json());
          const done = Math.max(0, (s.totalAnalyzed ?? 0) - baseAnalyzed);
          if (done >= jobTotal || Date.now() > deadline) {
            clearInterval(poll);
            setStep('ai', {
              status: 'done',
              message: `分析完成：本次处理 ${done} 个，累计 ${s.totalAnalyzed} 个`,
              lastRun: new Date().toISOString(),
            });
          } else {
            setStep('ai', { status: 'running', message: `正在分析 ${done} / ${jobTotal}...` });
          }
        } catch {
          // 轮询失败不中断，等下次
        }
      }, 4000);
    } catch (err) {
      setStep('ai', { status: 'error', message: (err as Error).message });
    }
  };

  // Step 3: 事实提取 (异步 job + SSE)
  const startExtractJob = async () => {
    setStep('extract', { status: 'running', message: '启动两段式提取 job...' });
    setProgress(null);
    setExtractQuality(null); // 清掉上次的质量面板
    try {
      const res = await fetch(`${API}/reextract/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          limit: extractLimit,
          onlyUnprocessed: true,
          source: extractSource,
          minQualityScore: extractMinQuality > 0 ? extractMinQuality : undefined,
          enableDeep: extractDeep,
          expertStrategy: extractDeep ? step3Strategy : undefined,
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
            setProgress({
              processed: data.processed,
              total: data.total || extractLimit,
              newFacts: data.newFacts || 0,
              updatedFacts: data.updatedFacts || 0,
              errors: data.errors || 0,
              errorSamples: Array.isArray(data.errorSamples) ? data.errorSamples : undefined,
            });
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
          // batch-ops 改进 #1: 完成后拉质量面板（confidence 分布 / 占位率 / verdict）
          if (d.status === 'completed') {
            fetch(`${API}/reextract/jobs/${jobId}/quality`)
              .then(r => r.ok ? r.json() : null)
              .then(q => { if (q && q.totals) setExtractQuality(q); })
              .catch(() => {});
          }
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
    const totalSteps = 4;
    setGraphProgress({ done: 0, total: totalSteps, label: '启动中...' });
    setStep('graph', { status: 'running', message: '' });
    try {
      setGraphProgress({ done: 0, total: totalSteps, label: '社区发现（Louvain）...' });
      const commRes = await fetch(`${API}/communities/recompute`, { method: 'POST' });
      const comm = commRes.ok ? await commRes.json() : null;

      setGraphProgress({ done: 1, total: totalSteps, label: '实体关系边表...' });
      const relRes = await fetch(`${API}/relations/recompute`, { method: 'POST' });
      const rel = relRes.ok ? await relRes.json() : null;

      setGraphProgress({ done: 2, total: totalSteps, label: '观点聚合...' });
      const beliefsRes = await fetch(`${API}/beliefs/recompute`, { method: 'POST' });
      const beliefs = beliefsRes.ok ? await beliefsRes.json() : null;

      let contrStr = '';
      if (graphDeep) {
        setGraphProgress({ done: 3, total: totalSteps, label: '深度张力图（L1+L2+L3）...' });
        const contrRes = await fetch(`${API}/contradictions/recall`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ limit: graphDeepLimit, enableL3: true }),
        });
        if (contrRes.ok) {
          const data = await contrRes.json();
          const total = data.total || 0;
          const byType = data.byType as Record<string, number> | undefined;
          const byLayer = data.byLayer as Record<string, number> | undefined;
          const typeStr = byType
            ? Object.entries(byType).filter(([k, n]) => n > 0 && k !== 'unknown').map(([t, n]) => `${t}×${n}`).join(' ')
            : '';
          const layerStr = byLayer
            ? Object.entries(byLayer).map(([l, n]) => `${l}:${n}`).join('+')
            : '';
          contrStr = ` · 张力 ${total} 条${typeStr ? `（${typeStr}）` : ''}${layerStr ? ` [${layerStr}]` : ''}`;
        }
      } else {
        setGraphProgress({ done: 3, total: totalSteps, label: '争议话题计数...' });
        const contrRes = await fetch(`${API}/contradictions?limit=200`);
        if (contrRes.ok) {
          const contrArr = await contrRes.json();
          const contrCount = Array.isArray(contrArr) ? contrArr.length : null;
          if (contrCount !== null) contrStr = ` · 争议 ${contrCount}${contrCount >= 200 ? '+' : ''} 条`;
        }
      }

      setGraphProgress({ done: totalSteps, total: totalSteps, label: '完成' });
      setStep('graph', {
        status: 'done',
        message: `社区 ${comm?.communities || '?'} 个 · 边 ${rel?.inserted || '?'} 条 · 观点 ${beliefs?.total || '?'} 条${contrStr}`,
        lastRun: new Date().toISOString(),
      });
    } catch (err) {
      setGraphProgress(null);
      setStep('graph', { status: 'error', message: (err as Error).message });
    }
  };

  // Step 4b: Zep 知识回填 — 启动 job + SSE
  const startZepSync = async () => {
    setStep('zepSync', { status: 'running', message: '启动 Zep 知识回填...' });
    setZepSyncProgress(null);
    zepSyncEsRef.current?.close();
    try {
      const res = await fetch(`${API}/zep/sync/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchSize: 10, minConfidence: 0.5 }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { jobId } = await res.json();
      setZepSyncJobId(jobId);

      const es = new EventSource(`${API}/zep/sync/jobs/${jobId}/stream`);
      zepSyncEsRef.current = es;

      es.addEventListener('total', (e: any) => {
        try {
          const d = JSON.parse(e.data);
          setZepSyncProgress(p => ({ synced: 0, skipped: 0, errors: 0, ...p, total: d.total }));
        } catch { /* ignore */ }
      });
      es.addEventListener('progress', (e: any) => {
        try {
          const d = JSON.parse(e.data);
          setZepSyncProgress(d);
          const denom = typeof d.syncGoal === 'number' ? d.syncGoal : d.total;
          const pct = denom > 0 ? Math.round((d.synced + d.skipped + d.errors) / denom * 100) : 0;
          setStep('zepSync', { status: 'running', message: `${d.synced + d.skipped + d.errors}/${denom} (${pct}%) · 同步 ${d.synced} · 跳过 ${d.skipped}` });
        } catch { /* ignore */ }
      });
      es.addEventListener('done', (e: any) => {
        try {
          const d = JSON.parse(e.data);
          const isOk = d.status === 'completed';
          setStep('zepSync', {
            status: isOk ? 'done' : 'error',
            message: `同步 ${d.synced || 0} 条 · 跳过 ${d.skipped || 0} · 错误 ${d.errors || 0}`,
            lastRun: new Date().toISOString(),
          });
        } catch { /* ignore */ }
        es.close();
      });
      es.onerror = () => {
        setStep('zepSync', { status: 'done', message: 'SSE 已关闭', lastRun: new Date().toISOString() });
        es.close();
      };
    } catch (err) {
      setStep('zepSync', { status: 'error', message: (err as Error).message });
    }
  };

  const cancelZepSync = async () => {
    if (zepSyncJobId) {
      await fetch(`${API}/zep/sync/jobs/${zepSyncJobId}`, { method: 'DELETE' }).catch(() => {});
      zepSyncEsRef.current?.close();
      setStep('zepSync', { status: 'idle', message: '已取消' });
    }
  };

  // Step 5a: 议题叙事预生成 — 自动分批循环，跳过已生成的
  const triggerTopicEnrich = async () => {
    setStep('topics', { status: 'running', message: '正在生成议题叙事（跳过已有）...' });
    let totalEnriched = 0;
    let batches = 0;
    const perBatch = Math.min(topicsLimit, 10); // 每批最多 10（enrichLimit=5）
    const targetTotal = topicsLimit;
    const MAX_BATCHES = Math.ceil(targetTotal / 5) + 2;
    try {
      while (batches < MAX_BATCHES && totalEnriched < targetTotal) {
        const res = await fetch(`${API}/topics/enrich?limit=${perBatch}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            enableDeep: topicsDeep,
            skipExisting: true,
            expertStrategy: topicsDeep ? topicsStrategy : undefined,
          }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        totalEnriched += data.enriched || 0;
        batches++;
        // 无未处理议题时退出
        if ((data.total || 0) === 0 || (data.pageItems || 0) === 0) break;
        setStep('topics', {
          status: 'running',
          message: `已生成 ${totalEnriched} 个叙事，剩余约 ${data.total || 0} 个未处理${data.deep ? ' (深度)' : ''}...`,
        });
      }
      // 查询 DB 里目前有叙事的总数，给用户看累计进度
      let narrativeTotal: number | null = null;
      try {
        const countRes = await fetch(`${API}/topics/recommended?has_narrative=true&limit=1`);
        if (countRes.ok) {
          const countData = await countRes.json();
          narrativeTotal = typeof countData.total === 'number' ? countData.total : null;
        }
      } catch { /* ignore */ }
      const totalStr = narrativeTotal !== null ? `，库中共 ${narrativeTotal} 条` : '';
      setStep('topics', {
        status: 'done',
        message: `本次新生成 ${totalEnriched} 条叙事${topicsDeep ? ' (深度)' : ''}${totalStr}，共 ${batches} 批`,
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
        body: JSON.stringify({
          limit: synthesisLimit,
          overwrite: synthesisOverwrite,
          minFacts: 3,
          enableDeep: synthesisDeep,
          expertStrategy: synthesisDeep ? step5Strategy : undefined,
        }),
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
    await triggerAIBatch(); // 一键全量跳过弹窗，直接执行
    await startExtractJob();
    // Step 2 & 3 的后台 job 并发运行；Step 4-6 需前置完成，留给用户手动触发
  };

  // 初始化：加载缓存统计
  useEffect(() => {
    loadSynthesisCacheStats();
    return () => {
      eventSourceRef.current?.close();
      synthesisEsRef.current?.close();
      zepSyncEsRef.current?.close();
    };
  }, []);

  /**
   * batch-ops 改进 #2: 错误样例展开组件
   * "错误 N" 旁加 [查看] 按钮，点开显示前 5 条具体失败（assetId / kind / message）。
   * 让用户能立刻判断是 LLM 超时 / quota / json parse / DB 约束，而不是面对一个数字。
   */
  const ErrorSamplesPanel = ({ samples, label }: { samples?: ErrorSample[]; label?: string }) => {
    const [open, setOpen] = useState(false);
    if (!samples || samples.length === 0) return null;
    const KIND_TONE: Record<string, string> = {
      timeout: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
      rate_limit: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300',
      quota: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
      json_parse: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
      db_constraint: 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300',
      db_fk: 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300',
      network: 'bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-300',
      encoding: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300',
      other: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
    };
    return (
      <div className="mt-2">
        <button onClick={() => setOpen((o) => !o)}
          className="text-[10px] text-amber-600 hover:text-amber-700 underline">
          {open ? '收起' : '查看'}错误样例（{samples.length}{label ? ` ${label}` : ''}）
        </button>
        {open && (
          <ul className="mt-1.5 space-y-1.5 pl-2 border-l-2 border-amber-200 dark:border-amber-800">
            {samples.map((s, i) => (
              <li key={i} className="text-[11px]">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${KIND_TONE[s.kind] ?? KIND_TONE.other}`}>
                    {s.kind}
                  </span>
                  <span className="font-mono text-[10px] text-gray-400">
                    {s.assetId.slice(0, 8)}…
                  </span>
                  {s.assetTitle && (
                    <span className="text-gray-500 dark:text-gray-400 truncate max-w-[180px]">
                      {s.assetTitle}
                    </span>
                  )}
                </div>
                <div className="text-gray-600 dark:text-gray-400 mt-0.5 leading-relaxed">{s.message}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  };

  /**
   * batch-ops 改进 #1: Step 3 质量面板组件
   * 跑完事实提取后展示 confidence 分布 / 占位率 / 错误分类，让用户判断
   * 这次 run 产出"是否值得进入 Step 4-6"。
   */
  const QualityPanel = ({ q }: { q: QualityStats }) => {
    const VERDICT_TONE: Record<QualityStats['verdict'], { label: string; cls: string }> = {
      good: { label: '✓ 质量良好', cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300' },
      fair: { label: '⚠ 质量一般', cls: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300' },
      poor: { label: '✗ 质量较差', cls: 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300' },
    };
    const v = VERDICT_TONE[q.verdict];
    const totalBucket = q.confidenceBuckets.reduce((s, b) => s + b.count, 0);
    return (
      <div className="mt-3 p-3 rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">📊 产出质量面板</span>
          <span className={`text-[10px] px-2 py-0.5 rounded font-medium ${v.cls}`}>{v.label}</span>
        </div>
        <div className="grid grid-cols-3 gap-2 mb-2 text-[11px]">
          <div className="bg-white dark:bg-gray-900 rounded p-1.5 border border-gray-100 dark:border-gray-700">
            <div className="text-gray-400 text-[9px]">本次新增</div>
            <div className="font-semibold text-gray-700 dark:text-gray-200">{q.totals.facts} fact</div>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded p-1.5 border border-gray-100 dark:border-gray-700">
            <div className="text-gray-400 text-[9px]">平均 confidence</div>
            <div className="font-semibold text-gray-700 dark:text-gray-200">
              {q.totals.avgConfidence.toFixed(2)}
              <span className="text-[9px] text-gray-400 ml-1">/ 1.0</span>
            </div>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded p-1.5 border border-gray-100 dark:border-gray-700">
            <div className="text-gray-400 text-[9px]">占位率</div>
            <div className={`font-semibold ${q.totals.placeholderRate > 10 ? 'text-rose-600' : 'text-gray-700 dark:text-gray-200'}`}>
              {q.totals.placeholderRate}%
            </div>
          </div>
        </div>
        {totalBucket > 0 && (
          <div className="mb-2">
            <div className="text-[10px] text-gray-500 mb-1">Confidence 分布</div>
            <div className="flex h-3 rounded overflow-hidden bg-gray-200 dark:bg-gray-700">
              {q.confidenceBuckets.map((b, i) => {
                const pct = b.count / totalBucket * 100;
                if (pct === 0) return null;
                const colors = ['bg-rose-400', 'bg-amber-400', 'bg-emerald-400', 'bg-emerald-600'];
                return (
                  <div key={i} className={colors[i] ?? 'bg-gray-400'} style={{ width: `${pct}%` }}
                    title={`${b.range} (${b.label}): ${b.count} 条 / ${pct.toFixed(0)}%`} />
                );
              })}
            </div>
            <div className="flex justify-between text-[9px] text-gray-400 mt-0.5">
              {q.confidenceBuckets.map((b, i) => (
                <span key={i}>{b.range}: {b.count}</span>
              ))}
            </div>
          </div>
        )}
        {(q.placeholderByField.subject + q.placeholderByField.predicate + q.placeholderByField.object) > 0 && (
          <div className="text-[10px] text-gray-500 mb-1">
            占位字段：subject {q.placeholderByField.subject} · predicate {q.placeholderByField.predicate} · object {q.placeholderByField.object}
          </div>
        )}
        {Object.keys(q.errorByKind).length > 0 && (
          <div className="text-[10px] text-gray-500">
            错误分类：{Object.entries(q.errorByKind).map(([k, n]) => `${k} × ${n}`).join(' · ')}
          </div>
        )}
        {q.verdict !== 'good' && (
          <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700 text-[10px] text-amber-600 dark:text-amber-400">
            ⚠ 建议在进入 Step 4 之前重跑此次 job（提高质量门槛 / 切深度模式 / 修 prompt），避免低质量数据污染图谱。
          </div>
        )}
      </div>
    );
  };

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

      {/* batch-ops 改进 #4: 质量档全局开关 — 同步 5 个 step 的 deep 模式默认值 */}
      <div className="mb-4 max-w-3xl bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
        <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
          <div>
            <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">质量档</span>
            <span className="text-xs text-gray-500 ml-2">
              一键设置 Step 2 / 3 / 4a / 5a / 5b 深度模式默认值
            </span>
          </div>
          {qualityTier === 'custom' && (
            <span className="text-[10px] px-2 py-0.5 rounded bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">
              已手动调整 · 全局档无效
            </span>
          )}
        </div>
        <div className="grid grid-cols-3 gap-2">
          {([
            { id: 'fast', label: '⚡ Fast', desc: '全部走 lite，~1× 速度' },
            { id: 'balanced', label: '⚖ Balanced', desc: 'Step 3+5b 走 CDT，~2× 速度' },
            { id: 'deep', label: '🧬 Deep', desc: '全开深度，~5× 速度，最高质量' },
          ] as const).map((tier) => {
            const active = qualityTier === tier.id;
            return (
              <button
                key={tier.id}
                onClick={() => { tierGuard.current = true; applyQualityTier(tier.id); }}
                className={`text-left p-3 rounded-md border transition-all ${
                  active
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                    : 'bg-gray-50 dark:bg-gray-900 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-indigo-300'
                }`}
              >
                <div className="font-semibold text-sm">{tier.label}</div>
                <div className={`text-[11px] mt-0.5 ${active ? 'text-indigo-100' : 'text-gray-500'}`}>
                  {tier.desc}
                </div>
              </button>
            );
          })}
        </div>
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

        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              🧹 /assets 去重（wiki 联动）
            </h3>
            <div className="flex gap-2">
              <button
                onClick={() => runAssetDeduplicate('dry-run')}
                disabled={dedupRunning}
                className="px-3 py-1.5 text-xs bg-slate-600 text-white rounded hover:bg-slate-700 disabled:opacity-50"
              >
                预览去重
              </button>
              <button
                onClick={() => runAssetDeduplicate('apply')}
                disabled={dedupRunning}
                className="px-3 py-1.5 text-xs bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
              >
                执行去重
              </button>
            </div>
          </div>
          <p className="text-xs text-gray-400">
            规则：完全重复（标题+正文标准化一致）；已进入 wiki 的重复资产隐藏，未进入 wiki 的重复资产删除。
          </p>
          {dedupMessage && <p className="text-sm text-gray-500 mt-2">{dedupMessage}</p>}
          {dedupResult && (
            <p className="text-xs text-gray-500 mt-1">
              扫描 {dedupResult.scanned} 条 · 重复组 {dedupResult.duplicate_groups} · 保留主记录 {dedupResult.canonical_kept} · 删除 {dedupResult.to_delete} · 隐藏 {dedupResult.to_hide}
            </p>
          )}
        </div>

        {/* Step 2: AI 分析 (v7.3: 断点续传 + 重试失败) */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              {statusIcon(steps.ai.status)} Step 2: AI 批量分析
            </h3>
            <button onClick={openAIBatchConfirm} disabled={steps.ai.status === 'running'}
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
          <div className="mt-3 p-2 rounded bg-indigo-50 dark:bg-indigo-950 border border-indigo-200 dark:border-indigo-800">
            <label className="flex items-start gap-2 text-xs cursor-pointer select-none">
              <input type="checkbox" checked={enableDeepAnalysis}
                onChange={e => setEnableDeepAnalysis(e.target.checked)}
                className="mt-0.5 rounded accent-indigo-600" />
              <span>
                <span className="font-medium text-indigo-700 dark:text-indigo-300">🧬 深度分析（15 产出物 + 专家库 EMM）</span>
                <span className="block text-indigo-600/80 dark:text-indigo-400/80 mt-0.5">
                  跑完标签化后调用 ContentLibraryEngine 产出全部 15 个 deliverable，并由匹配到的专家 CDT 对争议话题做多视角结构化分析（stakeholder / steelman / contradictionType）。约慢 3-5 倍。
                </span>
              </span>
            </label>
            {enableDeepAnalysis && (
              <StrategyPanel stepId="step2" value={step2Strategy} onChange={setStep2Strategy} />
            )}
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
            <label className="flex items-center gap-1 text-xs cursor-pointer select-none">
              <input type="checkbox" checked={extractDeep}
                onChange={e => setExtractDeep(e.target.checked)}
                className="rounded accent-amber-600" />
              <span className="text-amber-700 dark:text-amber-400 font-medium">🧬 深度模式</span>
              <span className="text-[10px] text-gray-400">（CDT 专家第 3 段审定，慢 ~1.5x）</span>
            </label>
          </div>
          {extractDeep && (
            <StrategyPanel stepId="step3" value={step3Strategy} onChange={setStep3Strategy} />
          )}
          {progress && (
            <div className="mt-3">
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>{progress.processed}/{progress.total} ({progressPct}%)</span>
                <span>新事实 {progress.newFacts} · 更新 {progress.updatedFacts} · 错误 {progress.errors}</span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div className="bg-indigo-600 rounded-full h-2 transition-all" style={{ width: `${progressPct}%` }} />
              </div>
              <ErrorSamplesPanel samples={progress.errorSamples} />
            </div>
          )}
          {steps.extract.message && <p className="text-sm text-gray-500 mt-1">{steps.extract.message}</p>}
          {extractQuality && <QualityPanel q={extractQuality} />}
        </div>

        {/* Step 4: 知识图谱 + Zep 回填 */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
            {(steps.graph.status === 'running' || steps.zepSync.status === 'running') ? '🔄' :
             (steps.graph.status === 'error' || steps.zepSync.status === 'error') ? '❌' :
             (steps.graph.status === 'done' && steps.zepSync.status === 'done') ? '✅' : '⚪'}
            Step 4: 知识图谱 & Zep 增强
          </h3>

          {/* 4a: 图谱重算 */}
          <div className="flex items-start justify-between gap-3 pb-3 border-b border-gray-100 dark:border-gray-700">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="text-xs font-medium text-gray-600 dark:text-gray-300">{statusIcon(steps.graph.status)} 4a · 图谱重算</span>
              </div>
              <p className="text-xs text-gray-400">Louvain 社区发现 + 4 信号边表 + 观点聚合</p>
              <div className="flex items-center gap-3 mt-1 flex-wrap">
                <label className="flex items-center gap-1 text-xs cursor-pointer select-none">
                  <input type="checkbox" checked={graphDeep} onChange={e => setGraphDeep(e.target.checked)}
                    disabled={steps.graph.status === 'running'}
                    className="rounded accent-green-600" />
                  <span className="text-green-700 dark:text-green-400 font-medium">🧬 深度支持</span>
                  <span className="text-[10px] text-gray-400">L1+L2+L3 三层召回，输出张力地图</span>
                </label>
                {graphDeep && (
                  <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer select-none">
                    召回数量
                    <input
                      type="number" min={5} max={200} value={graphDeepLimit}
                      onChange={e => setGraphDeepLimit(Math.min(200, Math.max(5, Number(e.target.value) || 30)))}
                      className="w-16 px-1.5 py-0.5 border rounded text-xs dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                      disabled={steps.graph.status === 'running'}
                    />
                    条
                  </label>
                )}
              </div>
              {graphProgress && steps.graph.status === 'running' && (
                <div className="mt-2">
                  <div className="flex justify-between text-[10px] text-gray-400 mb-1">
                    <span>{graphProgress.label}</span>
                    <span>{graphProgress.done}/{graphProgress.total}</span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                    <div
                      className="bg-green-500 rounded-full h-1.5 transition-all duration-300"
                      style={{ width: `${Math.round(graphProgress.done / graphProgress.total * 100)}%` }}
                    />
                  </div>
                </div>
              )}
              {steps.graph.message && <p className="text-xs text-gray-500 mt-0.5">{steps.graph.message}</p>}
              {steps.graph.lastRun && <p className="text-[10px] text-gray-400">上次: {new Date(steps.graph.lastRun).toLocaleString()}</p>}
            </div>
            <button onClick={triggerGraphRecompute} disabled={steps.graph.status === 'running'}
              className="px-3 py-1.5 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 shrink-0">
              🔗 重算图谱
            </button>
          </div>

          {/* 4b: Zep 知识回填 */}
          <div className="pt-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                  <span className="text-xs font-medium text-gray-600 dark:text-gray-300">{statusIcon(steps.zepSync.status)} 4b · Zep 知识回填</span>
                  {zepSyncProgress && zepSyncProgress.total > 0 && (
                    <span className="text-[10px] text-purple-500 bg-purple-50 dark:bg-purple-900/30 px-1.5 py-0.5 rounded">
                      {zepSyncProgress.synced} / {zepSyncProgress.total} 已同步
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-400">将 content_facts 历史数据回填至 Zep Graph，激活图谱实体关联与时序矛盾检测</p>
              </div>
              <div className="shrink-0">
                {steps.zepSync.status === 'running' ? (
                  <button onClick={cancelZepSync}
                    className="px-3 py-1.5 text-xs bg-red-500 text-white rounded hover:bg-red-600">
                    ⏹ 取消
                  </button>
                ) : (
                  <button onClick={startZepSync}
                    className="px-3 py-1.5 text-xs bg-purple-600 text-white rounded hover:bg-purple-700">
                    🧠 回填 Zep
                  </button>
                )}
              </div>
            </div>

            {/* Zep 进度条 */}
            {zepSyncProgress && zepSyncProgress.total > 0 && (() => {
              const done = zepSyncProgress.synced + zepSyncProgress.skipped + zepSyncProgress.errors;
              const pct = Math.round(done / zepSyncProgress.total * 100);
              return (
                <div className="mt-2">
                  <div className="flex justify-between text-[10px] text-gray-400 mb-1">
                    <span>{done}/{zepSyncProgress.total} ({pct}%)</span>
                    <span>
                      同步 {zepSyncProgress.synced}
                      {zepSyncProgress.skipped > 0 && ` · 跳过 ${zepSyncProgress.skipped}`}
                      {zepSyncProgress.errors > 0 && ` · 错误 ${zepSyncProgress.errors}`}
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                    <div className="bg-purple-500 rounded-full h-1.5 transition-all" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })()}

            {steps.zepSync.message && (
              <p className="text-xs text-gray-500 mt-1">{steps.zepSync.message}</p>
            )}
            {steps.zepSync.lastRun && (
              <p className="text-[10px] text-gray-400">上次: {new Date(steps.zepSync.lastRun).toLocaleString()}</p>
            )}
          </div>
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
              <div className="flex items-center gap-3 mt-1 flex-wrap">
                <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer select-none">
                  生成数量
                  <input
                    type="number" min={1} max={328} value={topicsLimit}
                    onChange={e => setTopicsLimit(Math.min(328, Math.max(1, Number(e.target.value) || 20)))}
                    className="w-16 px-1.5 py-0.5 border rounded text-xs dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                    disabled={steps.topics.status === 'running'}
                  />
                  个
                </label>
                <label className="flex items-center gap-1 text-xs cursor-pointer select-none">
                  <input type="checkbox" checked={topicsDeep}
                    onChange={e => setTopicsDeep(e.target.checked)}
                    className="rounded accent-rose-600"
                    disabled={steps.topics.status === 'running'} />
                  <span className="text-rose-700 dark:text-rose-400 font-medium">🧬 深度模式</span>
                  <span className="text-[10px] text-gray-400">（CDT 专家替代泛型编辑 prompt）</span>
                </label>
              </div>
              {steps.topics.message && <p className="text-xs text-gray-500 mt-0.5">{steps.topics.message}</p>}
              {steps.topics.lastRun && <p className="text-[10px] text-gray-400">上次: {new Date(steps.topics.lastRun).toLocaleString()}</p>}
            </div>
            <button onClick={triggerTopicEnrich} disabled={steps.topics.status === 'running'}
              className="px-3 py-1.5 text-xs bg-rose-600 text-white rounded hover:bg-rose-700 disabled:opacity-50 shrink-0">
              ✍️ 生成叙事
            </button>
          </div>
          {topicsDeep && (
            <StrategyPanel stepId="topics" value={topicsStrategy} onChange={setTopicsStrategy} />
          )}

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
              <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none">
                <input type="checkbox" checked={synthesisDeep}
                  onChange={e => setSynthesisDeep(e.target.checked)}
                  className="rounded accent-indigo-600" />
                <span className="text-indigo-700 dark:text-indigo-400 font-medium">🧬 深度模式</span>
                <span className="text-[10px] text-gray-400">（CDT 专家综合，独立 entity:X:deep 缓存）</span>
              </label>
            </div>
            {synthesisDeep && (
              <StrategyPanel stepId="step5" value={step5Strategy} onChange={setStep5Strategy} />
            )}

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
            {(enableDeepAnalysis || extractDeep || synthesisDeep || topicsDeep) && (
              <p className="text-[10px] text-gray-400 mt-2 pt-2 border-t border-dashed border-gray-200 dark:border-gray-700">
                💡 跑完后进入任意 asset 详情页的「🧬 深度分析」tab，可查看 15 个 deliverable + ⑬ 争议结构化卡片 + 专家调用痕迹 (带策略标签)。
              </p>
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

      {/* 确认弹窗：AI 批量分析清单 */}
      {confirmModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-lg mx-4 flex flex-col max-h-[80vh]">
            {/* 头部 */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-white">🧠 确认 AI 分析清单</h3>
                {!confirmModal.loading && (
                  <p className="text-xs text-gray-500 mt-0.5">
                    共 {confirmModal.assets.length} 个待分析素材 · 已勾选 {confirmModal.selected.size} 个
                  </p>
                )}
              </div>
              <button
                onClick={() => setConfirmModal({ open: false, loading: false, assets: [], selected: new Set() })}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xl leading-none"
              >
                ✕
              </button>
            </div>

            {/* 内容 */}
            <div className="flex-1 overflow-y-auto px-5 py-3">
              {confirmModal.loading ? (
                <div className="flex items-center justify-center py-12 text-gray-400 text-sm gap-2">
                  <span className="animate-spin">🔄</span> 正在加载待分析素材...
                </div>
              ) : confirmModal.assets.length === 0 ? (
                <div className="text-center py-12 text-gray-400 text-sm">暂无待分析素材</div>
              ) : (
                <>
                  {/* 全选 */}
                  <label className="flex items-center gap-2 text-xs text-gray-500 pb-2 border-b border-gray-100 dark:border-gray-700 mb-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={confirmModal.selected.size === confirmModal.assets.length}
                      onChange={e => setConfirmModal(prev => ({
                        ...prev,
                        selected: e.target.checked
                          ? new Set(prev.assets.map(a => a.id))
                          : new Set(),
                      }))}
                      className="rounded accent-indigo-600"
                    />
                    全选 / 全不选
                  </label>

                  {/* 素材列表 */}
                  <ul className="space-y-1">
                    {confirmModal.assets.map(asset => (
                      <li key={asset.id}>
                        <label className="flex items-start gap-2.5 py-1.5 px-2 rounded hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={confirmModal.selected.has(asset.id)}
                            onChange={e => setConfirmModal(prev => {
                              const next = new Set(prev.selected);
                              e.target.checked ? next.add(asset.id) : next.delete(asset.id);
                              return { ...prev, selected: next };
                            })}
                            className="mt-0.5 rounded accent-indigo-600 shrink-0"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm text-gray-800 dark:text-gray-200 truncate">
                              {asset.title || asset.id}
                            </p>
                            <p className="text-[10px] text-gray-400 truncate">
                              {[asset.fileType, asset.source, asset.createdAt ? new Date(asset.createdAt).toLocaleDateString('zh-CN') : ''].filter(Boolean).join(' · ')}
                            </p>
                          </div>
                        </label>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>

            {/* 底部操作 */}
            {!confirmModal.loading && (
              <div className="flex gap-3 px-5 py-4 border-t border-gray-200 dark:border-gray-700">
                <button
                  onClick={() => setConfirmModal({ open: false, loading: false, assets: [], selected: new Set() })}
                  className="flex-1 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  取消
                </button>
                <button
                  onClick={() => triggerAIBatch(Array.from(confirmModal.selected))}
                  disabled={confirmModal.selected.size === 0}
                  className="flex-1 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 font-medium"
                >
                  确认分析 {confirmModal.selected.size > 0 ? `（${confirmModal.selected.size} 个）` : ''}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
