// 内容库 — ⑦ 信息增量报告
import { useState, useEffect } from 'react';

const API_BASE = '/api/v1/content-library';

interface DeltaReport {
  since: string;
  newFacts: number;
  updatedFacts: number;
  supersededFacts: number;
  newEntities: number;
  highlights: Array<{ subject: string; predicate: string; oldValue?: string; newValue: string; type: 'new' | 'updated' | 'superseded' }>;
}

export function ContentLibraryDelta() {
  const [report, setReport] = useState<DeltaReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [since, setSince] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 7);
    return d.toISOString().split('T')[0];
  });

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/delta?since=${since}`);
      if (res.ok) setReport(await res.json());
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const typeConfig: Record<string, { label: string; color: string; icon: string }> = {
    new: { label: '新增', color: 'bg-green-100 text-green-700', icon: 'add_circle' },
    updated: { label: '更新', color: 'bg-blue-100 text-blue-700', icon: 'edit' },
    superseded: { label: '替代', color: 'bg-orange-100 text-orange-700', icon: 'swap_horiz' },
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-1 text-gray-900 dark:text-white">信息增量</h1>
      <p className="text-gray-500 dark:text-gray-400 mb-6">⑦ 内容库知识变化的增量报告</p>

      <div className="flex gap-3 mb-6 items-center">
        <label className="text-sm text-gray-600 dark:text-gray-400">起始日期：</label>
        <input type="date" value={since} onChange={e => setSince(e.target.value)}
          className="px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white text-sm" />
        <button onClick={load} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm">查询</button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500">加载中...</div>
      ) : !report ? (
        <div className="text-center py-12 text-gray-400">暂无增量数据</div>
      ) : (
        <>
          {/* 统计卡片 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            {[
              { label: '新增事实', value: report.newFacts, color: 'text-green-600', bg: 'bg-green-50 dark:bg-green-900/20' },
              { label: '更新事实', value: report.updatedFacts, color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-900/20' },
              { label: '替代事实', value: report.supersededFacts, color: 'text-orange-600', bg: 'bg-orange-50 dark:bg-orange-900/20' },
              { label: '新增实体', value: report.newEntities, color: 'text-purple-600', bg: 'bg-purple-50 dark:bg-purple-900/20' },
            ].map((s, i) => (
              <div key={i} className={`${s.bg} rounded-lg p-4 text-center`}>
                <div className={`text-3xl font-bold ${s.color}`}>{s.value ?? 0}</div>
                <div className="text-sm text-gray-500 mt-1">{s.label}</div>
              </div>
            ))}
          </div>

          {/* 变化明细 */}
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">变化明细</h2>
          {(!report.highlights || report.highlights.length === 0) ? (
            <div className="text-center py-8 text-gray-400">无详细变化记录</div>
          ) : (
            <div className="space-y-2">
              {report.highlights.map((h, i) => {
                const cfg = typeConfig[h.type] || typeConfig.new;
                return (
                  <div key={i} className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 flex items-center gap-3">
                    <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${cfg.color}`}>
                      <span className="material-symbols-outlined text-sm">{cfg.icon}</span>{cfg.label}
                    </span>
                    <div className="flex-1 min-w-0">
                      <span className="font-medium text-indigo-600 dark:text-indigo-400">{h.subject}</span>
                      <span className="text-gray-400 mx-1">·</span>
                      <span className="text-gray-600 dark:text-gray-300">{h.predicate}</span>
                    </div>
                    <div className="text-sm text-right shrink-0">
                      {h.oldValue && <span className="text-red-500 line-through mr-2">{h.oldValue}</span>}
                      <span className="text-green-600 font-medium">{h.newValue}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
