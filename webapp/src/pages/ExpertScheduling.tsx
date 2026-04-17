// 专家调度 — 工作量仪表盘 + 任务分配
import { useState, useEffect, useCallback } from 'react';
import { expertLibraryApi } from '../api/client';

interface Workload {
  expertId: string;
  expertName: string;
  domain: string[];
  activeTaskCount: number;
  completedTaskCount: number;
  totalInvocations: number;
  avgResponseTimeMs: number;
  availability: 'available' | 'busy' | 'unavailable';
}

interface Recommendation {
  expert_id: string;
  name: string;
  domain: string[];
  matchScore: number;
  activeTaskCount: number;
  availability: string;
}

export function ExpertScheduling() {
  const [workloads, setWorkloads] = useState<Workload[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedExpert, setSelectedExpert] = useState<Workload | null>(null);
  // 智能推荐
  const [recommendTopic, setRecommendTopic] = useState('');
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [recommendLoading, setRecommendLoading] = useState(false);

  const loadWorkloads = useCallback(async () => {
    setLoading(true);
    try {
      const result = await expertLibraryApi.getWorkloads();
      setWorkloads(result.workloads || []);
    } catch (error) {
      console.error('Failed to load workloads:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadWorkloads(); }, [loadWorkloads]);

  const handleRecommend = async () => {
    if (!recommendTopic.trim()) return;
    setRecommendLoading(true);
    try {
      const res = await expertLibraryApi.recommendExperts(recommendTopic, 3);
      setRecommendations(res.recommendations || []);
    } catch { /* ignore */ }
    finally { setRecommendLoading(false); }
  };

  const handleAvailabilityToggle = async (expertId: string, current: string) => {
    const next = current === 'available' ? 'busy' : current === 'busy' ? 'unavailable' : 'available';
    try {
      await expertLibraryApi.updateAvailability(expertId, next as any);
      loadWorkloads();
    } catch { /* ignore */ }
  };

  const totalActive = workloads.reduce((s, w) => s + w.activeTaskCount, 0);
  const totalCompleted = workloads.reduce((s, w) => s + w.completedTaskCount, 0);
  const availableCount = workloads.filter(w => w.availability === 'available').length;

  const getAvailabilityColor = (a: string) => {
    if (a === 'available') return 'text-green-500';
    if (a === 'busy') return 'text-yellow-500';
    return 'text-red-500';
  };

  const getAvailabilityLabel = (a: string) => {
    if (a === 'available') return '空闲';
    if (a === 'busy') return '忙碌';
    return '不可用';
  };

  const getLoadBarWidth = (count: number) => Math.min(100, count * 20);

  return (
    <div className="min-h-screen bg-surface p-6">
      <div className="max-w-7xl mx-auto mt-6">
        <h1 className="text-2xl font-bold text-on-surface mb-6 flex items-center gap-2">
          <span className="material-symbols-outlined text-primary">schedule</span>
          专家调度中心
        </h1>

        {/* 概览卡片 */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="bg-surface-container-lowest rounded-xl p-4 border border-outline-variant/20">
            <div className="text-xs text-on-surface-variant">总专家数</div>
            <div className="text-2xl font-bold text-on-surface">{workloads.length}</div>
          </div>
          <div className="bg-surface-container-lowest rounded-xl p-4 border border-outline-variant/20">
            <div className="text-xs text-on-surface-variant">空闲专家</div>
            <div className="text-2xl font-bold text-green-500">{availableCount}</div>
          </div>
          <div className="bg-surface-container-lowest rounded-xl p-4 border border-outline-variant/20">
            <div className="text-xs text-on-surface-variant">活跃任务</div>
            <div className="text-2xl font-bold text-primary">{totalActive}</div>
          </div>
          <div className="bg-surface-container-lowest rounded-xl p-4 border border-outline-variant/20">
            <div className="text-xs text-on-surface-variant">已完成</div>
            <div className="text-2xl font-bold text-on-surface">{totalCompleted}</div>
          </div>
        </div>

        {/* 智能推荐面板 */}
        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/20 p-4 mb-6">
          <h2 className="font-bold text-on-surface mb-3 flex items-center gap-2">
            <span className="material-symbols-outlined text-sm text-primary">auto_awesome</span>
            智能推荐
          </h2>
          <div className="flex gap-3">
            <input
              value={recommendTopic}
              onChange={e => setRecommendTopic(e.target.value)}
              placeholder="输入任务主题，推荐最匹配的专家..."
              className="flex-1 p-2.5 text-sm bg-surface-container-lowest text-on-surface border border-outline-variant/30 rounded-lg focus:ring-1 focus:ring-primary"
              onKeyDown={e => e.key === 'Enter' && handleRecommend()}
            />
            <button
              onClick={handleRecommend}
              disabled={recommendLoading || !recommendTopic.trim()}
              className="px-4 py-2 bg-primary text-on-primary text-sm font-bold rounded-lg disabled:opacity-50 flex items-center gap-1"
            >
              {recommendLoading ? (
                <span className="material-symbols-outlined animate-spin text-sm">sync</span>
              ) : (
                <span className="material-symbols-outlined text-sm">search</span>
              )}
              推荐
            </button>
          </div>
          {recommendations.length > 0 && (
            <div className="mt-3 grid grid-cols-3 gap-3">
              {recommendations.map((r, i) => (
                <div key={r.expert_id} className="p-3 bg-surface-container-low rounded-lg border border-primary/20">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-xs">
                      {r.name.charAt(0)}
                    </div>
                    <div>
                      <div className="text-sm font-bold text-on-surface">{r.name}</div>
                      <div className="text-xs text-on-surface-variant">{r.domain.slice(0, 2).join('/')}</div>
                    </div>
                    <span className="ml-auto text-xs px-2 py-0.5 bg-primary/10 text-primary rounded-full font-bold">
                      #{i + 1}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs text-on-surface-variant">
                    <span>匹配度: {(r.matchScore * 100).toFixed(0)}%</span>
                    <span className={getAvailabilityColor(r.availability)}>
                      {getAvailabilityLabel(r.availability)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 工作量列表 */}
        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/20">
          <div className="p-4 border-b border-outline-variant/20 flex items-center justify-between">
            <h2 className="font-bold text-on-surface">专家工作量</h2>
            <button
              onClick={loadWorkloads}
              className="text-xs px-3 py-1 border border-outline-variant rounded-lg hover:bg-surface-container text-on-surface-variant"
            >
              刷新
            </button>
          </div>

          {loading ? (
            <div className="p-8 text-center text-on-surface-variant">加载中...</div>
          ) : workloads.length === 0 ? (
            <div className="p-8 text-center text-on-surface-variant">暂无专家数据</div>
          ) : (
            <div className="divide-y divide-outline-variant/20">
              {workloads.map((w) => (
                <div
                  key={w.expertId}
                  className="p-4 flex items-center gap-4 hover:bg-surface-container/50 cursor-pointer transition-colors"
                  onClick={() => setSelectedExpert(selectedExpert?.expertId === w.expertId ? null : w)}
                >
                  {/* 头像 */}
                  <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-sm">
                    {w.expertName.charAt(0)}
                  </div>

                  {/* 信息 */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-on-surface">{w.expertName}</span>
                      <span className={`text-xs font-bold ${getAvailabilityColor(w.availability)}`}>
                        {getAvailabilityLabel(w.availability)}
                      </span>
                    </div>
                    <div className="text-xs text-on-surface-variant mt-0.5">
                      {w.domain.slice(0, 3).join(' / ')}
                    </div>
                  </div>

                  {/* 负载条 */}
                  <div className="w-32">
                    <div className="flex justify-between text-xs text-on-surface-variant mb-1">
                      <span>负载</span>
                      <span>{w.activeTaskCount} 任务</span>
                    </div>
                    <div className="h-2 bg-surface-container rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          w.availability === 'available' ? 'bg-green-500' :
                          w.availability === 'busy' ? 'bg-yellow-500' : 'bg-red-500'
                        }`}
                        style={{ width: `${getLoadBarWidth(w.activeTaskCount)}%` }}
                      />
                    </div>
                  </div>

                  {/* 统计 */}
                  <div className="text-right text-xs text-on-surface-variant w-24">
                    <div>{w.totalInvocations} 次调用</div>
                    <div>{w.completedTaskCount} 已完成</div>
                  </div>

                  {/* 状态切换 */}
                  <button
                    onClick={(e) => { e.stopPropagation(); handleAvailabilityToggle(w.expertId, w.availability); }}
                    className="text-xs px-2 py-1 border border-outline-variant/30 rounded-md hover:bg-surface-container text-on-surface-variant"
                    title="切换可用状态"
                  >
                    <span className="material-symbols-outlined text-sm">swap_horiz</span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 选中专家的详情面板 */}
        {selectedExpert && (
          <div className="mt-4 bg-surface-container-lowest rounded-xl border border-outline-variant/20 p-6">
            <h3 className="font-bold text-on-surface mb-3 flex items-center gap-2">
              <span className="material-symbols-outlined text-sm">person</span>
              {selectedExpert.expertName} — 详细信息
            </h3>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <div className="text-xs text-on-surface-variant">领域</div>
                <div className="text-sm text-on-surface mt-1">{selectedExpert.domain.join('、')}</div>
              </div>
              <div>
                <div className="text-xs text-on-surface-variant">平均响应时间</div>
                <div className="text-sm text-on-surface mt-1">
                  {selectedExpert.avgResponseTimeMs > 0 ? `${(selectedExpert.avgResponseTimeMs / 1000).toFixed(1)}s` : 'N/A'}
                </div>
              </div>
              <div>
                <div className="text-xs text-on-surface-variant">状态</div>
                <div className={`text-sm font-bold mt-1 ${getAvailabilityColor(selectedExpert.availability)}`}>
                  {getAvailabilityLabel(selectedExpert.availability)}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
