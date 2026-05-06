// War Room · ② 兵棋推演入口 (sandbox)
// 拉 GET /api/v1/ceo/war-room/sandbox 列出最近 5 条
// 点卡片跳详情页 /ceo/internal/ceo/war-room/sandbox/:id
// "+ 启动新推演" 弹 modal 输入 topic → POST /sandbox → 入详情页

import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { SANDBOX } from './_warRoomFixtures';
import { useForceMock } from '../../../../meeting/_mockToggle';

interface SandboxRow {
  id: string;
  topic_text: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'archived' | string;
  branches: any[];
  evaluation: any;
  created_at: string;
  completed_at: string | null;
}

const STATUS_TONE: Record<string, { label: string; ink: string }> = {
  pending: { label: '待启动', ink: 'rgba(245,217,217,0.55)' },
  running: { label: '推演中', ink: '#D9B88E' },
  completed: { label: '已完成', ink: '#A6CC9A' },
  failed: { label: '失败', ink: '#FFB89A' },
  archived: { label: '已归档', ink: 'rgba(245,217,217,0.3)' },
};

export function SandboxList() {
  const nav = useNavigate();
  const forceMock = useForceMock();
  const [rows, setRows] = useState<SandboxRow[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [topicInput, setTopicInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  const fetchRows = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/ceo/war-room/sandbox?limit=5');
      if (!res.ok) {
        setRows([]);
        return;
      }
      const data = (await res.json()) as { items: SandboxRow[] };
      setRows(data.items ?? []);
    } catch {
      setRows([]);
    }
  }, []);

  useEffect(() => {
    void fetchRows();
  }, [fetchRows]);

  const handleCreate = useCallback(async () => {
    if (topicInput.trim().length < 4) {
      setError('主题至少 4 个字符');
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/ceo/war-room/sandbox', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topicText: topicInput.trim() }),
      });
      if (!res.ok) {
        setError(`${res.status} ${res.statusText}`);
        return;
      }
      const data = (await res.json()) as SandboxRow;
      setShowModal(false);
      setTopicInput('');
      nav(`/ceo/internal/ceo/war-room/sandbox/${data.id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCreating(false);
    }
  }, [topicInput, nav]);

  // 用真实数据；forceMock=true 时显示 fixture (设计演示路径), 真空状态显示空提示
  // 之前 API 空 → fallback fixture, 但 fixture 都是 PE 基金假数据 (Halycon/Stellar),
  // 在惠居上海 ws 下完全跑题 → 改为 forceMock 才走 fixture
  const apiHasItems = rows !== null && rows.length > 0;
  const displayItems: Array<{
    id: string | null;
    topic: string;
    pct: number;
    branches: number;
    status?: string;
  }> = apiHasItems
    ? rows.map((r) => ({
        id: r.id,
        topic: r.topic_text,
        pct: pctOf(r),
        branches: countBranches(r.branches),
        status: r.status,
      }))
    : forceMock
    ? SANDBOX.map((s) => ({ id: null, topic: s.topic, pct: s.pct, branches: s.branches }))
    : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {displayItems.length === 0 && rows !== null && (
        <div
          style={{
            padding: '16px 18px',
            background: 'rgba(214,69,69,0.04)',
            border: '1px dashed rgba(214,69,69,0.25)',
            borderRadius: 4,
            fontFamily: 'var(--serif)',
            fontStyle: 'italic',
            fontSize: 12.5,
            color: 'rgba(245,217,217,0.55)',
            lineHeight: 1.6,
          }}
        >
          暂无兵棋推演 — 点击下方"启动新推演"，给个具体主题（4 字以上），后端会拆出 3-7 条分支并自动跑评估。
        </div>
      )}
      {displayItems.map((s, i) => {
        const tone = s.status ? STATUS_TONE[s.status] ?? STATUS_TONE.pending : null;
        const cardInner = (
          <div
            style={{
              padding: '12px 14px',
              background: 'rgba(214,69,69,0.05)',
              border: '1px solid rgba(214,69,69,0.18)',
              borderRadius: 4,
              cursor: s.id ? 'pointer' : 'default',
              transition: 'all 250ms ease',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                gap: 12,
                marginBottom: 8,
              }}
            >
              <div
                style={{
                  fontFamily: 'var(--serif)',
                  fontStyle: 'italic',
                  fontSize: 13,
                  color: '#F5D9D9',
                  lineHeight: 1.5,
                  flex: 1,
                }}
              >
                {s.topic}
              </div>
              {tone && (
                <span
                  style={{
                    fontFamily: 'var(--mono)',
                    fontSize: 9,
                    letterSpacing: 0.5,
                    padding: '2px 8px',
                    color: tone.ink,
                    border: `1px solid ${tone.ink}55`,
                    borderRadius: 99,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {tone.label}
                </span>
              )}
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                fontFamily: 'var(--mono)',
                fontSize: 10,
                color: 'rgba(245,217,217,0.6)',
              }}
            >
              <div
                style={{
                  flex: 1,
                  height: 4,
                  background: 'rgba(0,0,0,0.3)',
                  borderRadius: 99,
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${s.pct}%`,
                    background: s.pct >= 70 ? '#C8A15C' : '#D64545',
                  }}
                />
              </div>
              <span style={{ color: '#F5D9D9', fontWeight: 600 }}>{s.pct}%</span>
              <span>{s.branches} 条分支</span>
            </div>
          </div>
        );
        return s.id ? (
          <Link key={s.id} to={`/ceo/internal/ceo/war-room/sandbox/${s.id}`} style={{ textDecoration: 'none' }}>
            {cardInner}
          </Link>
        ) : (
          <div key={`stub-${i}`}>{cardInner}</div>
        );
      })}

      <div
        onClick={() => setShowModal(true)}
        style={{
          marginTop: 4,
          padding: '10px 14px',
          background: 'rgba(214,69,69,0.05)',
          border: '1px dashed rgba(214,69,69,0.3)',
          borderRadius: 4,
          fontFamily: 'var(--serif)',
          fontStyle: 'italic',
          fontSize: 11.5,
          color: 'rgba(245,217,217,0.7)',
          textAlign: 'center',
          cursor: 'pointer',
        }}
      >
        + 启动新推演
      </div>

      {showModal && (
        <CreateModal
          topicInput={topicInput}
          setTopicInput={setTopicInput}
          creating={creating}
          error={error}
          onCancel={() => {
            setShowModal(false);
            setTopicInput('');
            setError(null);
          }}
          onSubmit={handleCreate}
        />
      )}
    </div>
  );
}

function CreateModal({
  topicInput,
  setTopicInput,
  creating,
  error,
  onCancel,
  onSubmit,
}: {
  topicInput: string;
  setTopicInput: (v: string) => void;
  creating: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  return (
    <div
      onClick={onCancel}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 520,
          background: '#1A0E0E',
          border: '1px solid rgba(214,69,69,0.4)',
          borderRadius: 6,
          padding: 24,
          fontFamily: 'var(--sans)',
          color: '#F5D9D9',
        }}
      >
        <h3
          style={{
            margin: '0 0 14px',
            fontFamily: 'var(--serif)',
            fontSize: 16,
            fontWeight: 400,
            color: '#F5D9D9',
          }}
        >
          📐 启动新推演
        </h3>
        <p
          style={{
            margin: '0 0 14px',
            fontFamily: 'var(--mono)',
            fontSize: 11,
            color: 'rgba(245,217,217,0.6)',
            lineHeight: 1.6,
          }}
        >
          描述要推演的决策主题。LLM 将基于关切雷达 + 战略主线生成 3 路径决策树 + 总评估。
          <br />
          示例: "Q3 LP 大会前是否调整 Stellar 估值锚?"
        </p>
        <textarea
          value={topicInput}
          onChange={(e) => setTopicInput(e.target.value)}
          placeholder="输入推演主题…"
          rows={3}
          style={{
            width: '100%',
            background: 'rgba(0,0,0,0.4)',
            border: '1px solid rgba(245,217,217,0.18)',
            borderRadius: 4,
            color: '#F5D9D9',
            fontFamily: 'var(--serif)',
            fontSize: 13,
            padding: '10px 12px',
            resize: 'vertical',
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />
        {error && (
          <div
            style={{
              marginTop: 10,
              fontFamily: 'var(--mono)',
              fontSize: 11,
              color: '#FFB89A',
            }}
          >
            ⚠ {error}
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
          <button
            onClick={onCancel}
            disabled={creating}
            style={{
              padding: '8px 16px',
              background: 'transparent',
              border: '1px solid rgba(245,217,217,0.3)',
              color: 'rgba(245,217,217,0.7)',
              fontFamily: 'var(--mono)',
              fontSize: 11,
              borderRadius: 4,
              cursor: creating ? 'not-allowed' : 'pointer',
            }}
          >
            取消
          </button>
          <button
            onClick={onSubmit}
            disabled={creating || topicInput.trim().length < 4}
            style={{
              padding: '8px 18px',
              background: '#D6454522',
              border: '1px solid #D64545',
              color: '#F5D9D9',
              fontFamily: 'var(--mono)',
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: 0.5,
              borderRadius: 4,
              cursor: creating || topicInput.trim().length < 4 ? 'not-allowed' : 'pointer',
              opacity: creating || topicInput.trim().length < 4 ? 0.5 : 1,
            }}
          >
            {creating ? '⏳ 创建中…' : '创建并入详情页'}
          </button>
        </div>
      </div>
    </div>
  );
}

function pctOf(r: SandboxRow): number {
  if (r.status === 'completed') return 100;
  if (r.status === 'running') return 60;
  if (r.status === 'failed') return 0;
  return 12;
}

function countBranches(branches: any[]): number {
  if (!Array.isArray(branches) || branches.length === 0) return 0;
  let n = 0;
  for (const root of branches) {
    if (Array.isArray(root.options)) {
      n += root.options.length;
      for (const opt of root.options) {
        if (Array.isArray(opt.children)) n += opt.children.length;
      }
    }
  }
  return n;
}
