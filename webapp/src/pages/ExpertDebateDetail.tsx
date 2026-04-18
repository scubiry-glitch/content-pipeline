// 专家辩论详情页 — 独立路由 /expert-debate/:id
import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useDebate } from '../hooks/useExpertApi';
import { ROUTES } from '../config/routes';

const API = '/api/v1/expert-library';

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

const phaseLabel = (phase: string) => {
  if (phase === 'independent') return '独立观点';
  if (phase === 'cross_examination') return '交叉质疑';
  return '综合裁决';
};

export function ExpertDebateDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data, error: fetchError, isLoading: loading } = useDebate(id ?? null);
  const result = data as DebateResult | null;
  const error = fetchError
    ? '加载失败，请检查网络或数据库连接'
    : !loading && !result
      ? '辩论记录不存在'
      : '';

  // 隐藏 + 打分状态
  const [isHidden, setIsHidden] = useState(false);
  const [rating, setRating] = useState<number | null>(null);
  const [ratingSubmitted, setRatingSubmitted] = useState(false);
  const [hiding, setHiding] = useState(false);

  const handleHide = async () => {
    if (!id || hiding) return;
    setHiding(true);
    try {
      await fetch(`${API}/debates/${id}/hide`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hidden: !isHidden }),
      });
      setIsHidden(!isHidden);
    } catch { /* ignore */ }
    setHiding(false);
  };

  const handleRate = async (score: number) => {
    if (!id) return;
    setRating(score);
    try {
      await fetch(`${API}/debates/${id}/rate`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating: score }),
      });
      setRatingSubmitted(true);
      setTimeout(() => setRatingSubmitted(false), 3000);
    } catch { /* ignore */ }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <span className="material-symbols-outlined animate-spin text-primary text-4xl">sync</span>
      </div>
    );
  }

  if (error || !result) {
    return (
      <div className="min-h-screen bg-surface p-6 flex flex-col items-center justify-center gap-4">
        <p className="text-on-surface-variant">{error || '未找到辩论记录'}</p>
        <button
          onClick={() => navigate(ROUTES.expert.debate)}
          className="text-sm px-4 py-2 bg-primary text-on-primary rounded-lg"
        >
          返回辩论列表
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface p-6">
      <div className="max-w-5xl mx-auto mt-6 space-y-6">
        {/* 顶部导航 + 操作 */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => navigate(ROUTES.expert.debate)}
            className="text-sm text-on-surface-variant hover:text-on-surface flex items-center gap-1"
          >
            <span className="material-symbols-outlined text-sm">arrow_back</span>
            返回
          </button>
          <h1 className="text-xl font-bold text-on-surface flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">forum</span>
            {result.topic}
          </h1>
          <div className="flex items-center gap-3">
            <button
              onClick={handleHide}
              disabled={hiding}
              className="text-xs px-3 py-1.5 rounded-lg border border-outline-variant/30 text-on-surface-variant hover:bg-surface-container-low transition-colors flex items-center gap-1"
              title={isHidden ? '取消隐藏' : '隐藏此辩论'}
            >
              <span className="material-symbols-outlined text-sm">
                {isHidden ? 'visibility' : 'visibility_off'}
              </span>
              {isHidden ? '已隐藏' : '隐藏'}
            </button>
            <div className="text-xs text-on-surface-variant">{id?.slice(0, 8)}…</div>
          </div>
        </div>

        {/* 辩论打分 */}
        <div className="flex items-center gap-3 bg-surface-container-lowest rounded-xl border border-outline-variant/20 p-4">
          <span className="text-sm font-medium text-on-surface">辩论质量评分：</span>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map(n => (
              <button
                key={n}
                onClick={() => handleRate(n)}
                className="transition-all"
                style={{
                  fontSize: 22,
                  color: rating && n <= rating ? '#f59e0b' : '#d1d5db',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '0 2px',
                }}
                title={`${n} 分`}
              >
                ★
              </button>
            ))}
          </div>
          {rating && (
            <span className="text-sm text-on-surface-variant">
              {rating}/5
              {ratingSubmitted && <span className="text-green-600 ml-2">✓ 已反馈给专家库</span>}
            </span>
          )}
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
          <p className="text-sm text-on-surface whitespace-pre-wrap">{result.finalVerdict}</p>
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
    </div>
  );
}
