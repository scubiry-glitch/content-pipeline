// 内容库 — ⑦ 信息增量报告
import { useState, useEffect } from 'react';
import { ProductMetaBar, useDropdownOptions, DomainSelect } from '../components/ContentLibraryProductMeta';

const API_BASE = '/api/v1/content-library';

/** 与 api ContentFact / DeltaReport JSON 对齐（日期序列化为 ISO 字符串） */
interface ContentFact {
  id: string;
  assetId: string;
  subject: string;
  predicate: string;
  object: string;
  context: Record<string, unknown>;
  confidence: number;
  isCurrent: boolean;
  supersededBy?: string;
  sourceChunkIndex?: number;
  createdAt: string;
}

interface DeltaReport {
  period: { from: string; to: string };
  newFacts: ContentFact[];
  updatedFacts: Array<{ old: ContentFact; new: ContentFact }>;
  refutedFacts: ContentFact[];
  summary: string;
}

function formatWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function FactLine({ fact, accent }: { fact: ContentFact; accent?: 'default' | 'muted' }) {
  const muted = accent === 'muted';
  return (
    <div className={`text-sm ${muted ? 'text-gray-500 dark:text-gray-400' : 'text-gray-800 dark:text-gray-200'}`}>
      <span className="font-medium text-indigo-600 dark:text-indigo-400">{fact.subject}</span>
      <span className="text-gray-400 mx-1">·</span>
      <span className="text-gray-600 dark:text-gray-300">{fact.predicate}</span>
      <span className="text-gray-400 mx-1">→</span>
      <span className="font-medium">{fact.object}</span>
      <span className="text-gray-400 text-xs ml-2">{formatWhen(fact.createdAt)}</span>
    </div>
  );
}

export function ContentLibraryDelta() {
  const [report, setReport] = useState<DeltaReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [since, setSince] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().split('T')[0];
  });
  const [domain, setDomain] = useState('');
  const { domains } = useDropdownOptions();

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ since });
      if (domain) params.set('domain', domain);
      const res = await fetch(`${API_BASE}/delta?${params}`);
      if (res.ok) setReport(await res.json());
    } catch {
      /* ignore */
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const stats = report
    ? [
        { label: '新增事实', value: report.newFacts.length, color: 'text-green-600', bg: 'bg-green-50 dark:bg-green-900/20' },
        { label: '更新（替代链）', value: report.updatedFacts.length, color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-900/20' },
        { label: '被推翻/替代', value: report.refutedFacts.length, color: 'text-orange-600', bg: 'bg-orange-50 dark:bg-orange-900/20' },
      ]
    : [];

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-1 text-gray-900 dark:text-white">信息增量</h1>
      <p className="text-gray-500 dark:text-gray-400 mb-6">⑦ 内容库知识变化的增量报告</p>
      <ProductMetaBar productKey="delta" />

      <div className="flex gap-3 mb-6 items-center flex-wrap">
        <label className="text-sm text-gray-600 dark:text-gray-400">起始日期：</label>
        <input
          type="date"
          value={since}
          onChange={(e) => setSince(e.target.value)}
          className="px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white text-sm"
        />
        <DomainSelect value={domain} onChange={setDomain} domains={domains} />
        <button
          onClick={load}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm"
        >
          查询
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500">加载中...</div>
      ) : !report ? (
        <div className="text-center py-12 text-gray-400">暂无增量数据</div>
      ) : (
        <>
          <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">{report.summary}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-6">
            统计区间：{formatWhen(report.period.from)} — {formatWhen(report.period.to)}
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
            {stats.map((s, i) => (
              <div key={i} className={`${s.bg} rounded-lg p-4 text-center`}>
                <div className={`text-3xl font-bold ${s.color}`}>{s.value}</div>
                <div className="text-sm text-gray-500 mt-1">{s.label}</div>
              </div>
            ))}
          </div>

          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">新增事实</h2>
          {report.newFacts.length === 0 ? (
            <div className="text-center py-6 text-gray-400 mb-8">无</div>
          ) : (
            <div className="space-y-2 mb-8">
              {report.newFacts.map((f) => (
                <div
                  key={f.id}
                  className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4"
                >
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-green-100 text-green-700 mb-2">
                    新增
                  </span>
                  <FactLine fact={f} />
                </div>
              ))}
            </div>
          )}

          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">事实更新</h2>
          {report.updatedFacts.length === 0 ? (
            <div className="text-center py-6 text-gray-400 mb-8">无</div>
          ) : (
            <div className="space-y-2 mb-8">
              {report.updatedFacts.map(({ old: o, new: n }) => (
                <div
                  key={n.id}
                  className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4"
                >
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-700 mb-2">
                    更新
                  </span>
                  <div className="text-sm mb-1">
                    <span className="font-medium text-indigo-600 dark:text-indigo-400">{n.subject}</span>
                    <span className="text-gray-400 mx-1">·</span>
                    <span className="text-gray-600 dark:text-gray-300">{n.predicate}</span>
                  </div>
                  <div className="text-sm text-right">
                    <span className="text-red-500 line-through mr-2">{o.object}</span>
                    <span className="text-green-600 font-medium">{n.object}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">被替代的旧事实</h2>
          {report.refutedFacts.length === 0 ? (
            <div className="text-center py-6 text-gray-400">无</div>
          ) : (
            <div className="space-y-2">
              {report.refutedFacts.map((f) => (
                <div
                  key={f.id}
                  className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4"
                >
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-orange-100 text-orange-700 mb-2">
                    已替代
                  </span>
                  <FactLine fact={f} accent="muted" />
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
