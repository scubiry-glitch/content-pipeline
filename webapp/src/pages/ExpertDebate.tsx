// 专家辩论 — 多专家协作辩论 + 对比分析
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { expertLibraryApi } from '../api/client';

interface DebateRound {
  round: number;
  phase: string;
  opinions: Array<{ expertId: string; expertName: string; content: string; targetExpertId?: string }>;
}

interface DebateResult {
  id?: string;
  topic: string;
  rounds: DebateRound[];
  consensus: string[];
  disagreements: string[];
  finalVerdict: string;
  participantSummary: Array<{ expertId: string; expertName: string; position: string }>;
}

export function ExpertDebate() {
  const navigate = useNavigate();
  const [experts, setExperts] = useState<any[]>([]);
  const [selectedExperts, setSelectedExperts] = useState<string[]>([]);
  const [topic, setTopic] = useState('');
  const [content, setContent] = useState('');
  const [rounds, setRounds] = useState(3);
  const [temperature, setTemperature] = useState(0.7);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DebateResult | null>(null);

  // 辩论历史
  const [debateHistory, setDebateHistory] = useState<any[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    expertLibraryApi.getExperts().then(r => setExperts(r.experts || [])).catch(() => {});
    loadHistory();
  }, []);

  const loadHistory = async () => {
    setHistoryLoading(true);
    try {
      const res = await expertLibraryApi.listDebates(20);
      setDebateHistory(res.debates || []);
    } catch { /* ignore */ }
    finally { setHistoryLoading(false); }
  };

  const viewHistoryDebate = (debate: any) => {
    window.open(`/expert-debate/${debate.id}`, '_blank');
  };

  const toggleExpert = (id: string) => {
    setSelectedExperts(prev =>
      prev.includes(id) ? prev.filter(e => e !== id) : prev.length < 4 ? [...prev, id] : prev
    );
  };

  const startDebate = async () => {
    if (selectedExperts.length < 2 || !topic.trim() || !content.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await expertLibraryApi.debate(topic, content, selectedExperts, rounds, temperature);
      setResult(res);
      loadHistory(); // 刷新历史列表
      // 若后端返回了持久化 ID，跳转到独立详情页
      if (res?.id) {
        navigate(`/expert-debate/${res.id}`);
        return;
      }
    } catch (error) {
      console.error('Debate failed:', error);
      alert('辩论启动失败');
    } finally {
      setLoading(false);
    }
  };

  const phaseLabel = (phase: string) => {
    if (phase === 'independent') return '独立观点';
    if (phase === 'cross_examination') return '交叉质疑';
    return '综合裁决';
  };

  return (
    <div className="min-h-screen bg-surface p-6">
      <div className="max-w-7xl mx-auto mt-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-on-surface flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">forum</span>
            专家辩论
          </h1>
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="text-sm px-4 py-2 border border-outline-variant rounded-lg hover:bg-surface-container text-on-surface-variant flex items-center gap-1"
          >
            <span className="material-symbols-outlined text-sm">history</span>
            历史记录 {debateHistory.length > 0 && `(${debateHistory.length})`}
          </button>
        </div>

        {/* 辩论历史面板 */}
        {showHistory && (
          <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/20 p-4 mb-6">
            <h3 className="font-bold text-on-surface mb-3">辩论历史</h3>
            {historyLoading ? (
              <div className="text-sm text-on-surface-variant text-center py-4">加载中...</div>
            ) : debateHistory.length === 0 ? (
              <div className="text-sm text-on-surface-variant text-center py-4">暂无辩论记录</div>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {debateHistory.map((debate: any) => (
                  <div
                    key={debate.id}
                    className="p-3 bg-surface-container-low rounded-lg hover:bg-surface-container cursor-pointer transition-colors flex items-center justify-between"
                    onClick={() => viewHistoryDebate(debate)}
                  >
                    <div>
                      <div className="text-sm font-bold text-on-surface">{debate.topic}</div>
                      <div className="text-xs text-on-surface-variant mt-0.5">
                        {debate.expertNames?.join('、')} · {new Date(debate.createdAt).toLocaleString('zh-CN')}
                      </div>
                    </div>
                    <span className="material-symbols-outlined text-on-surface-variant text-sm">arrow_forward</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {!result ? (
          /* 设置面板 */
          <div className="space-y-6">
            {/* 议题输入 */}
            <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/20 p-6">
              <h2 className="font-bold text-on-surface mb-3">辩论议题</h2>
              <input
                value={topic}
                onChange={e => setTopic(e.target.value)}
                placeholder="输入辩论议题，如：新能源汽车出海策略"
                className="w-full p-3 text-sm bg-surface-container-lowest text-on-surface border border-outline-variant/30 rounded-lg focus:ring-1 focus:ring-primary mb-3"
              />
              <textarea
                value={content}
                onChange={e => setContent(e.target.value)}
                placeholder="输入待讨论的内容或背景材料..."
                rows={4}
                className="w-full p-3 text-sm bg-surface-container-lowest text-on-surface border border-outline-variant/30 rounded-lg focus:ring-1 focus:ring-primary"
              />
            </div>

            {/* 专家选择 */}
            <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/20 p-6">
              <h2 className="font-bold text-on-surface mb-3">
                选择辩论专家 ({selectedExperts.length}/4)
              </h2>
              <div className="grid grid-cols-3 gap-3">
                {experts.map((e: any) => (
                  <div
                    key={e.expert_id}
                    className={`p-3 rounded-lg border cursor-pointer transition-all ${
                      selectedExperts.includes(e.expert_id)
                        ? 'border-primary bg-primary/10'
                        : 'border-outline-variant/30 hover:border-primary/50'
                    }`}
                    onClick={() => toggleExpert(e.expert_id)}
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-xs">
                        {e.name?.charAt(0)}
                      </div>
                      <div>
                        <div className="text-sm font-bold text-on-surface">{e.name}</div>
                        <div className="text-xs text-on-surface-variant">{e.domain?.slice(0, 2).join('/')}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 辩论参数 */}
            <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/20 p-6">
              <h2 className="font-bold text-on-surface mb-4">辩论参数</h2>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="text-sm font-medium text-on-surface-variant mb-2 block">
                    辩论轮数
                  </label>
                  <div className="flex items-center gap-3">
                    {[2, 3, 4, 5].map(r => (
                      <button
                        key={r}
                        onClick={() => setRounds(r)}
                        className={`w-10 h-10 rounded-lg text-sm font-bold transition-all ${
                          rounds === r
                            ? 'bg-primary text-on-primary'
                            : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
                        }`}
                      >
                        {r}
                      </button>
                    ))}
                    <span className="text-xs text-on-surface-variant ml-1">
                      {rounds === 2 ? '快速对比' : rounds === 3 ? '标准辩论' : rounds === 4 ? '深度讨论' : '全面博弈'}
                    </span>
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-on-surface-variant mb-2 block">
                    创造性 ({temperature.toFixed(1)})
                  </label>
                  <input
                    type="range"
                    min="0.1"
                    max="1.0"
                    step="0.1"
                    value={temperature}
                    onChange={e => setTemperature(parseFloat(e.target.value))}
                    className="w-full accent-primary"
                  />
                  <div className="flex justify-between text-xs text-on-surface-variant mt-1">
                    <span>保守</span>
                    <span>平衡</span>
                    <span>激进</span>
                  </div>
                </div>
              </div>
            </div>

            <button
              onClick={startDebate}
              disabled={loading || selectedExperts.length < 2 || !topic.trim() || !content.trim()}
              className="px-8 py-3 bg-primary text-on-primary font-bold text-sm rounded-lg shadow-lg hover:bg-primary-dim transition-all active:scale-95 disabled:opacity-50 flex items-center gap-2"
            >
              {loading ? (
                <><span className="material-symbols-outlined animate-spin">sync</span>辩论进行中...</>
              ) : (
                <><span className="material-symbols-outlined">forum</span>开始辩论 ({rounds}轮)</>
              )}
            </button>
          </div>
        ) : (
          /* 结果展示 */
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-on-surface">辩论结果：{result.topic}</h2>
              <button
                onClick={() => setResult(null)}
                className="text-sm px-4 py-2 border border-outline-variant rounded-lg hover:bg-surface-container text-on-surface-variant"
              >
                新辩论
              </button>
            </div>

            {/* 各轮展示 */}
            {result.rounds.map((round) => (
              <div key={round.round} className="bg-surface-container-lowest rounded-xl border border-outline-variant/20 p-6">
                <h3 className="font-bold text-on-surface mb-4 flex items-center gap-2">
                  <span className="text-xs px-2 py-1 bg-primary/10 text-primary rounded-full">
                    Round {round.round}
                  </span>
                  {phaseLabel(round.phase)}
                </h3>
                <div className="space-y-3">
                  {round.opinions.map((op, i) => (
                    <div key={i} className="p-4 bg-surface-container-low rounded-lg">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-7 h-7 rounded-full bg-tertiary/20 flex items-center justify-center text-tertiary font-bold text-xs">
                          {op.expertName.charAt(0)}
                        </div>
                        <span className="font-bold text-sm text-on-surface">{op.expertName}</span>
                        {op.targetExpertId && (
                          <span className="text-xs text-on-surface-variant">
                            回应 {round.opinions.find(o => o.expertId === op.targetExpertId)?.expertName || op.targetExpertId}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-on-surface-variant whitespace-pre-wrap">{op.content}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {/* 共识与分歧 */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-green-500/10 rounded-xl p-5 border border-green-500/20">
                <h3 className="font-bold text-green-700 mb-2">共识</h3>
                <ul className="text-sm text-on-surface space-y-1 list-disc pl-4">
                  {result.consensus.map((c, i) => <li key={i}>{c}</li>)}
                </ul>
              </div>
              <div className="bg-red-500/10 rounded-xl p-5 border border-red-500/20">
                <h3 className="font-bold text-red-700 mb-2">分歧</h3>
                <ul className="text-sm text-on-surface space-y-1 list-disc pl-4">
                  {result.disagreements.map((d, i) => <li key={i}>{d}</li>)}
                </ul>
              </div>
            </div>

            {/* 综合裁决 */}
            <div className="bg-primary/5 rounded-xl p-6 border border-primary/20">
              <h3 className="font-bold text-primary mb-2">综合裁决</h3>
              <p className="text-sm text-on-surface">{result.finalVerdict}</p>
            </div>

            {/* 参与者立场汇总 */}
            <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/20 p-6">
              <h3 className="font-bold text-on-surface mb-3">参与者立场</h3>
              <div className="space-y-2">
                {result.participantSummary.map((p) => (
                  <div key={p.expertId} className="flex items-center gap-3">
                    <span className="font-bold text-sm text-on-surface w-20">{p.expertName}</span>
                    <span className="text-sm text-on-surface-variant">{p.position}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
