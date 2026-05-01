// War Room · Sandbox 兵棋推演详情页
// 路由: /ceo/internal/ceo/war-room/sandbox/:id
//
// 布局 (按设计图自由发挥):
//   ┌─────────────────────────────────────────────────────┐
//   │ ← 返回 War Room  · 推演主题  · 状态徽章                │
//   ├──────────────────────────────────────────┬──────────┤
//   │  决策树 (SVG)  — 横向铺开, 点击 option 高亮          │
//   │   r0 ──┬── r0-a (62%) ── r0-a-1 (71%)               │
//   │        │              └─ r0-a-2 (42%)               │
//   │        ├── r0-b (78%) ── r0-b-1 (85%) ★ 推荐         │
//   │        │              └─ r0-b-2 (55%)               │
//   │        └── r0-c (34%)                                │
//   │                                                      │
//   ├──────────────────────────────────────────┴──────────┤
//   │ 选中节点详情 · expected / confidence / 子选项链路     │
//   ├─────────────────────────────────────────────────────┤
//   │ 总评估 · 推荐路径 / 风险分 / 可逆性 / summary md       │
//   ├─────────────────────────────────────────────────────┤
//   │ [ 🚀 重新推演 ] (pending → 入队 g3-sandbox)            │
//   │ ↳ inline RunProgressPanel (SSE / poll fallback)       │
//   └─────────────────────────────────────────────────────┘

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { RunProgressPanel } from '../../../shared/RunProgressPanel';

interface SandboxOption {
  id: string;
  label: string;
  confidence: number;
  expected: string;
  children?: SandboxOption[];
}
interface SandboxBranchRoot {
  id: string;
  label: string;
  options: SandboxOption[];
}
interface SandboxEvaluation {
  recommendedPath?: string;
  recommendedLabel?: string;
  riskScore?: number;
  expectedReversibility?: 'low' | 'medium' | 'high' | string;
  summaryMd?: string;
}
interface SandboxRow {
  id: string;
  scope_id: string | null;
  topic_text: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'archived' | string;
  branches: SandboxBranchRoot[];
  evaluation: SandboxEvaluation | null;
  generated_run_id: string | null;
  created_at: string;
  completed_at: string | null;
}

const TONE = '#D64545';
const INK = '#F5D9D9';

export function SandboxDetail() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const [row, setRow] = useState<SandboxRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);

  const fetchRow = useCallback(async () => {
    if (!id) return;
    try {
      const res = await fetch(`/api/v1/ceo/war-room/sandbox/${id}`);
      if (!res.ok) {
        setError(res.status === 404 ? '推演不存在' : `${res.status} ${res.statusText}`);
        return;
      }
      const data = (await res.json()) as SandboxRow;
      setRow(data);
      if (data.generated_run_id && data.status === 'running') setActiveRunId(data.generated_run_id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void fetchRow();
  }, [fetchRow]);

  const recommendedNodeId = row?.evaluation?.recommendedPath?.split('→').pop()?.trim() ?? null;

  const handleStart = useCallback(async () => {
    if (!id) return;
    try {
      const res = await fetch(`/api/v1/ceo/war-room/sandbox/${id}/run`, { method: 'POST' });
      if (!res.ok) {
        setError(`启动失败: ${res.status}`);
        return;
      }
      const data = (await res.json()) as { sandboxId: string; runId: string };
      setActiveRunId(data.runId);
      void fetchRow();
    } catch (e) {
      setError((e as Error).message);
    }
  }, [id, fetchRow]);

  const allNodes = useMemo(() => flattenNodes(row?.branches ?? []), [row?.branches]);
  const selectedNode = selectedNodeId ? allNodes[selectedNodeId] : null;

  if (loading) {
    return (
      <Shell title="加载中…">
        <div style={{ padding: 40, color: 'rgba(245,217,217,0.5)', fontFamily: 'var(--mono)' }}>
          ⏳ 拉取推演数据…
        </div>
      </Shell>
    );
  }
  if (error || !row) {
    return (
      <Shell title="出错">
        <div style={{ padding: 40, color: '#FFB89A', fontFamily: 'var(--serif)' }}>
          ⚠ {error ?? '未知错误'}
        </div>
        <button
          onClick={() => nav('/ceo/internal/ceo/war-room')}
          style={btnStyle(TONE)}
        >
          ← 返回 War Room
        </button>
      </Shell>
    );
  }

  return (
    <Shell title={row.topic_text} status={row.status}>
      {/* 决策树 */}
      <section style={sectionStyle}>
        <h3 style={sectionTitle}>📐 决策树</h3>
        {row.branches.length === 0 ? (
          <div style={emptyHint}>暂无决策分支 — 点击下方 [重新推演] 由 LLM 生成</div>
        ) : (
          <BranchTree
            roots={row.branches}
            recommendedId={recommendedNodeId}
            selectedId={selectedNodeId}
            onSelect={setSelectedNodeId}
          />
        )}
      </section>

      {/* 选中节点 */}
      {selectedNode && (
        <section style={sectionStyle}>
          <h3 style={sectionTitle}>🔍 节点详情</h3>
          <NodeDetailCard node={selectedNode} isRecommended={selectedNode.id === recommendedNodeId} />
        </section>
      )}

      {/* 总评估 */}
      {row.evaluation && (
        <section style={sectionStyle}>
          <h3 style={sectionTitle}>⚖ 总评估</h3>
          <EvaluationCard evaluation={row.evaluation} />
        </section>
      )}

      {/* 操作 + 进度 */}
      <section style={sectionStyle}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={handleStart}
            disabled={row.status === 'running'}
            style={{
              ...btnStyle(TONE),
              opacity: row.status === 'running' ? 0.5 : 1,
              cursor: row.status === 'running' ? 'not-allowed' : 'pointer',
            }}
          >
            {row.status === 'pending' && '🚀 启动推演'}
            {row.status === 'running' && '⚙ 推演中…'}
            {row.status === 'completed' && '🔁 重新推演'}
            {row.status === 'failed' && '↻ 再试一次'}
          </button>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'rgba(245,217,217,0.5)' }}>
            创建 {row.created_at.slice(0, 10)}
            {row.completed_at && ` · 完成 ${row.completed_at.slice(0, 10)}`}
          </span>
        </div>
        {activeRunId && (
          <RunProgressPanel
            runId={activeRunId}
            tone={TONE}
            onCompleted={() => {
              setActiveRunId(null);
              void fetchRow();
            }}
          />
        )}
      </section>
    </Shell>
  );
}

// ─────────────────────────────────────────────────────────────
// 视觉组件
// ─────────────────────────────────────────────────────────────

function Shell({ title, status, children }: { title: string; status?: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'radial-gradient(circle at top, #1A0E0E 0%, #0A0608 75%)',
        color: INK,
        padding: '32px 36px 80px',
        fontFamily: 'var(--sans)',
      }}
    >
      <div style={{ maxWidth: 1080, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <Link
            to="/ceo/internal/ceo/war-room"
            style={{ color: 'rgba(245,217,217,0.6)', fontFamily: 'var(--mono)', fontSize: 11, textDecoration: 'none' }}
          >
            ← 返回 War Room
          </Link>
          {status && <StatusBadge status={status} />}
        </div>
        <h1
          style={{
            fontFamily: 'var(--serif)',
            fontSize: 22,
            fontWeight: 400,
            lineHeight: 1.4,
            color: INK,
            margin: '0 0 26px',
            letterSpacing: 0.3,
          }}
        >
          {title}
        </h1>
        {children}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; ink: string; bg: string }> = {
    pending: { label: '待启动', ink: 'rgba(245,217,217,0.7)', bg: 'rgba(245,217,217,0.08)' },
    running: { label: '推演中', ink: '#D9B88E', bg: 'rgba(217,184,142,0.15)' },
    completed: { label: '已完成', ink: '#A6CC9A', bg: 'rgba(106,154,92,0.15)' },
    failed: { label: '失败', ink: '#FFB89A', bg: 'rgba(196,106,80,0.15)' },
    archived: { label: '已归档', ink: 'rgba(245,217,217,0.4)', bg: 'rgba(245,217,217,0.04)' },
  };
  const m = map[status] ?? map.pending;
  return (
    <span
      style={{
        fontFamily: 'var(--mono)',
        fontSize: 10,
        letterSpacing: 0.5,
        padding: '4px 10px',
        background: m.bg,
        color: m.ink,
        border: `1px solid ${m.ink}40`,
        borderRadius: 99,
      }}
    >
      {m.label}
    </span>
  );
}

function BranchTree({
  roots,
  recommendedId,
  selectedId,
  onSelect,
}: {
  roots: SandboxBranchRoot[];
  recommendedId: string | null;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {roots.map((root) => (
        <div key={root.id}>
          <div
            style={{
              fontFamily: 'var(--serif)',
              fontStyle: 'italic',
              fontSize: 14,
              color: INK,
              marginBottom: 12,
              padding: '8px 14px',
              background: 'rgba(214,69,69,0.08)',
              borderLeft: `3px solid ${TONE}`,
            }}
          >
            {root.label}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingLeft: 14 }}>
            {root.options.map((opt) => (
              <OptionNode
                key={opt.id}
                option={opt}
                depth={0}
                recommendedId={recommendedId}
                selectedId={selectedId}
                onSelect={onSelect}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function OptionNode({
  option,
  depth,
  recommendedId,
  selectedId,
  onSelect,
}: {
  option: SandboxOption;
  depth: number;
  recommendedId: string | null;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const isRecommended = option.id === recommendedId;
  const isSelected = option.id === selectedId;
  const cf = option.confidence ?? 0;
  const cfPct = Math.round(cf * 100);
  const barColor = cf >= 0.7 ? '#A6CC9A' : cf >= 0.5 ? '#D9B88E' : 'rgba(245,217,217,0.5)';

  return (
    <div style={{ paddingLeft: depth * 22 }}>
      <div
        onClick={() => onSelect(isSelected ? null : option.id)}
        style={{
          padding: '10px 14px',
          background: isSelected ? 'rgba(214,69,69,0.18)' : 'rgba(0,0,0,0.25)',
          border: isSelected
            ? `1px solid ${TONE}`
            : isRecommended
            ? '1px solid rgba(166,204,154,0.55)'
            : '1px solid rgba(245,217,217,0.12)',
          borderRadius: 4,
          cursor: 'pointer',
          transition: 'all 200ms ease',
          position: 'relative',
        }}
      >
        {isRecommended && (
          <div
            style={{
              position: 'absolute',
              top: -8,
              right: 12,
              padding: '2px 8px',
              background: '#A6CC9A',
              color: '#0A0608',
              fontFamily: 'var(--mono)',
              fontSize: 9,
              fontWeight: 700,
              borderRadius: 99,
              letterSpacing: 0.5,
            }}
          >
            ★ 推荐
          </div>
        )}
        <div
          style={{
            fontFamily: 'var(--serif)',
            fontSize: 13,
            color: INK,
            marginBottom: 6,
            lineHeight: 1.5,
          }}
        >
          {option.label}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              flex: 1,
              height: 4,
              background: 'rgba(0,0,0,0.4)',
              borderRadius: 99,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${cfPct}%`,
                background: barColor,
                transition: 'width 0.4s ease',
              }}
            />
          </div>
          <span
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 10.5,
              color: barColor,
              fontWeight: 600,
              minWidth: 32,
              textAlign: 'right',
            }}
          >
            {cfPct}%
          </span>
        </div>
        {option.expected && (
          <div
            style={{
              marginTop: 6,
              fontFamily: 'var(--mono)',
              fontSize: 10,
              color: 'rgba(245,217,217,0.55)',
              lineHeight: 1.5,
            }}
          >
            预计: {option.expected}
          </div>
        )}
      </div>
      {option.children && option.children.length > 0 && (
        <div
          style={{
            marginTop: 8,
            marginLeft: 14,
            paddingLeft: 14,
            borderLeft: `1px dashed rgba(245,217,217,0.18)`,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          {option.children.map((child) => (
            <OptionNode
              key={child.id}
              option={child}
              depth={depth + 1}
              recommendedId={recommendedId}
              selectedId={selectedId}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function NodeDetailCard({ node, isRecommended }: { node: SandboxOption; isRecommended: boolean }) {
  return (
    <div
      style={{
        padding: '14px 18px',
        background: isRecommended ? 'rgba(106,154,92,0.08)' : 'rgba(214,69,69,0.05)',
        border: isRecommended ? '1px solid rgba(166,204,154,0.4)' : '1px solid rgba(214,69,69,0.18)',
        borderRadius: 4,
      }}
    >
      <div style={{ fontFamily: 'var(--serif)', fontSize: 14, marginBottom: 10, color: INK }}>
        {node.label}
      </div>
      <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', fontFamily: 'var(--mono)', fontSize: 11 }}>
        <div>
          <span style={{ color: 'rgba(245,217,217,0.5)' }}>信心 · </span>
          <span style={{ color: INK, fontWeight: 600 }}>{Math.round((node.confidence ?? 0) * 100)}%</span>
        </div>
        <div>
          <span style={{ color: 'rgba(245,217,217,0.5)' }}>子选项 · </span>
          <span style={{ color: INK, fontWeight: 600 }}>{node.children?.length ?? 0}</span>
        </div>
      </div>
      {node.expected && (
        <div
          style={{
            marginTop: 10,
            padding: '8px 12px',
            background: 'rgba(0,0,0,0.25)',
            fontFamily: 'var(--serif)',
            fontStyle: 'italic',
            fontSize: 12,
            color: 'rgba(245,217,217,0.85)',
            lineHeight: 1.6,
            borderLeft: `2px solid ${isRecommended ? '#A6CC9A' : TONE}`,
          }}
        >
          {node.expected}
        </div>
      )}
    </div>
  );
}

function EvaluationCard({ evaluation }: { evaluation: SandboxEvaluation }) {
  const risk = evaluation.riskScore ?? 0;
  const riskColor = risk < 0.3 ? '#A6CC9A' : risk < 0.6 ? '#D9B88E' : '#FFB89A';
  const revBadge: Record<string, { label: string; color: string }> = {
    high: { label: '可逆性 高', color: '#A6CC9A' },
    medium: { label: '可逆性 中', color: '#D9B88E' },
    low: { label: '可逆性 低', color: '#FFB89A' },
  };
  const rev = revBadge[evaluation.expectedReversibility ?? ''] ?? null;

  return (
    <div
      style={{
        padding: '16px 18px',
        background: 'rgba(166,204,154,0.05)',
        border: '1px solid rgba(166,204,154,0.25)',
        borderRadius: 4,
      }}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 22, marginBottom: 14 }}>
        {evaluation.recommendedLabel && (
          <Stat label="推荐路径">
            <span style={{ color: '#A6CC9A', fontFamily: 'var(--serif)', fontSize: 13.5 }}>
              ★ {evaluation.recommendedLabel}
            </span>
          </Stat>
        )}
        <Stat label="风险分">
          <span style={{ color: riskColor, fontFamily: 'var(--mono)', fontSize: 14, fontWeight: 700 }}>
            {risk.toFixed(2)}
          </span>
        </Stat>
        {rev && (
          <Stat label="可逆性">
            <span style={{ color: rev.color, fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 600 }}>
              {rev.label}
            </span>
          </Stat>
        )}
      </div>
      {evaluation.summaryMd && (
        <pre
          style={{
            margin: 0,
            padding: '12px 14px',
            background: 'rgba(0,0,0,0.3)',
            borderLeft: '2px solid #A6CC9A',
            fontFamily: 'var(--serif)',
            fontSize: 12,
            color: 'rgba(245,217,217,0.88)',
            lineHeight: 1.7,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {evaluation.summaryMd}
        </pre>
      )}
    </div>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 9.5, color: 'rgba(245,217,217,0.5)', letterSpacing: 0.5, marginBottom: 4 }}>
        {label.toUpperCase()}
      </div>
      <div>{children}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// styles & helpers
// ─────────────────────────────────────────────────────────────

const sectionStyle: React.CSSProperties = {
  marginBottom: 26,
  padding: '18px 22px',
  background: 'rgba(0,0,0,0.18)',
  border: '1px solid rgba(245,217,217,0.08)',
  borderRadius: 4,
};

const sectionTitle: React.CSSProperties = {
  fontFamily: 'var(--mono)',
  fontSize: 11,
  letterSpacing: 0.8,
  color: 'rgba(245,217,217,0.6)',
  margin: '0 0 14px',
  fontWeight: 600,
  textTransform: 'uppercase',
};

const emptyHint: React.CSSProperties = {
  padding: 28,
  textAlign: 'center',
  color: 'rgba(245,217,217,0.45)',
  fontFamily: 'var(--serif)',
  fontStyle: 'italic',
  fontSize: 12.5,
};

function btnStyle(tone: string): React.CSSProperties {
  return {
    padding: '10px 20px',
    background: `${tone}22`,
    color: tone === TONE ? INK : tone,
    border: `1px solid ${tone}`,
    borderRadius: 4,
    fontFamily: 'var(--mono)',
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: 0.5,
    cursor: 'pointer',
    transition: 'all 200ms ease',
  };
}

function flattenNodes(roots: SandboxBranchRoot[]): Record<string, SandboxOption> {
  const out: Record<string, SandboxOption> = {};
  const walk = (opts: SandboxOption[]) => {
    for (const o of opts) {
      out[o.id] = o;
      if (o.children) walk(o.children);
    }
  };
  for (const r of roots) walk(r.options);
  return out;
}
