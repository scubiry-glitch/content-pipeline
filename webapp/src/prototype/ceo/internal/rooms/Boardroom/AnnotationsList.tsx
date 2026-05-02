// Boardroom · ③ 外脑批注摘要
// 来源: GET /api/v1/ceo/boardroom/annotations (R3-6 LLM-backed) → fallback fixture
// R2-4 → T3 改造: 顶部入口从"+ 新建专家"改为"🔗 绑定专家"，复用 expert_library 已有人格；
//        BindExpertModal 内含降级到 CreateExpertModal 的"仍要新建"二次入口。
// R3-6: "🌌 生成新批注" 按钮 → POST /annotations/generate (g4-annotations LLM)

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ANNOTATIONS } from './_boardroomFixtures';
import { BindExpertModal } from './BindExpertModal';
import { RunProgressPanel } from '../../../shared/RunProgressPanel';

interface RealAnnotation {
  id: string;
  brief_id: string | null;
  expert_id: string;
  expert_name: string;
  mode: 'synthesis' | 'contrast' | 'counter' | 'extension' | string;
  highlight: string;
  body_md: string;
  citations: Array<{ type: string; id?: string; label: string }>;
  created_at: string;
}

const MODE_LABEL: Record<string, string> = {
  synthesis: '综合',
  contrast: '对照',
  counter: '反驳',
  extension: '延展',
};

const MODE_COLOR: Record<string, string> = {
  synthesis: '#D4A84B',
  contrast: '#7BA7C4',
  counter: '#E6A6A6',
  extension: '#A6CC9A',
};

export function AnnotationsList() {
  const [modalOpen, setModalOpen] = useState(false);
  // 已绑定到本 Boardroom 的 expert_id 集合（含原"createdExpertIds"语义；
  // 现在主要来源是 BindExpertModal 选了已有专家，少数走"+ 仍要新建"分支）
  const [boundExpertIds, setBoundExpertIds] = useState<string[]>([]);
  const [items, setItems] = useState<RealAnnotation[] | null>(null);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const fetchAnnotations = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/ceo/boardroom/annotations?limit=10');
      if (!res.ok) {
        setItems([]);
        return;
      }
      const data = (await res.json()) as { items: RealAnnotation[]; source: 'real' | 'empty' };
      setItems(data.items ?? []);
    } catch {
      setItems([]);
    }
  }, []);

  useEffect(() => {
    void fetchAnnotations();
  }, [fetchAnnotations]);

  const handleGenerate = useCallback(async () => {
    // 默认用第一个 fixture 的 from 作为 expert (实际应从下拉选择)
    const fb = ANNOTATIONS[0];
    setGenerating(true);
    try {
      const res = await fetch('/api/v1/ceo/boardroom/annotations/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expertId: fb?.from ? `${fb.from}-auto` : 'auto-expert',
          expertName: fb?.from ?? '外部专家',
          contextHint: '基于本周关切雷达 + 战略主线',
        }),
      });
      if (!res.ok) {
        setGenerating(false);
        return;
      }
      const data = (await res.json()) as { runId: string };
      setActiveRunId(data.runId);
    } finally {
      setGenerating(false);
    }
  }, []);

  const useReal = items !== null && items.length > 0;
  const displayItems = useMemo(() => {
    if (useReal) {
      return items!.map((a) => ({
        kind: 'real' as const,
        id: a.id,
        from: a.expert_name,
        target: '预读包',
        tag: MODE_LABEL[a.mode] ?? a.mode,
        tagColor: MODE_COLOR[a.mode] ?? '#D4A84B',
        quote: a.highlight,
        body_md: a.body_md,
        citations: a.citations,
        expert_id: a.expert_id,
      }));
    }
    return ANNOTATIONS.map((a, i) => ({
      kind: 'fixture' as const,
      id: `fx-${i}`,
      from: a.from,
      target: a.target,
      tag: a.tag,
      tagColor: '#D4A84B',
      quote: a.quote,
      body_md: '',
      citations: [],
      expert_id: '',
    }));
  }, [items, useReal]);

  return (
    <div>
      <BindExpertModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        alreadyBound={boundExpertIds}
        onBound={(id) => setBoundExpertIds((arr) => arr.includes(id) ? arr : [...arr, id])}
      />
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 10,
          gap: 10,
        }}
      >
        <span
          style={{
            fontFamily: 'var(--mono)',
            fontSize: 10,
            color: 'rgba(240,232,214,0.55)',
            letterSpacing: 0.3,
          }}
        >
          {useReal
            ? `LIVE · ${items!.length} 条批注${boundExpertIds.length > 0 ? ` · 已绑定 ${boundExpertIds.length} 位专家` : ''}`
            : `fixture · ${ANNOTATIONS.length} 条批注${boundExpertIds.length > 0 ? ` · 已绑定 ${boundExpertIds.length} 位专家` : ''}`}
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={handleGenerate}
            disabled={generating || activeRunId != null}
            style={{
              padding: '5px 12px',
              background: 'rgba(127,167,196,0.12)',
              border: '1px solid rgba(127,167,196,0.5)',
              color: '#7BA7C4',
              fontFamily: 'var(--mono)',
              fontSize: 11,
              borderRadius: 4,
              cursor: generating || activeRunId != null ? 'not-allowed' : 'pointer',
              opacity: generating || activeRunId != null ? 0.5 : 1,
            }}
          >
            🌌 生成新批注
          </button>
          <button
            onClick={() => setModalOpen(true)}
            style={{
              padding: '5px 12px',
              background: 'rgba(212,168,75,0.12)',
              border: '1px solid rgba(212,168,75,0.5)',
              color: '#D4A84B',
              fontFamily: 'var(--mono)',
              fontSize: 11,
              borderRadius: 4,
              cursor: 'pointer',
            }}
          >
            🔗 绑定专家
          </button>
        </div>
      </div>

      {activeRunId && (
        <div style={{ marginBottom: 8 }}>
          <RunProgressPanel
            runId={activeRunId}
            tone="#7BA7C4"
            onCompleted={() => {
              setActiveRunId(null);
              void fetchAnnotations();
            }}
          />
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {displayItems.map((a) => {
          const isExpanded = expanded.has(a.id);
          return (
            <div
              key={a.id}
              style={{
                padding: '10px 12px',
                background: 'rgba(212,168,75,0.05)',
                border: '1px solid rgba(212,168,75,0.18)',
                borderLeft: `3px solid ${a.tagColor}`,
                borderRadius: '0 3px 3px 0',
                cursor: a.kind === 'real' ? 'pointer' : 'default',
              }}
              onClick={() =>
                a.kind === 'real' &&
                setExpanded((s) => {
                  const next = new Set(s);
                  if (next.has(a.id)) next.delete(a.id);
                  else next.add(a.id);
                  return next;
                })
              }
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                  marginBottom: 4,
                  gap: 8,
                }}
              >
                <span style={{ fontFamily: 'var(--serif)', fontSize: 12.5, color: '#F0E8D6' }}>
                  <b>{a.from}</b>
                  <span style={{ opacity: 0.65, marginLeft: 4 }}>对 {a.target}</span>
                </span>
                <span
                  style={{
                    fontFamily: 'var(--mono)',
                    fontSize: 10,
                    color: a.tagColor,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {a.tag}
                </span>
              </div>
              <div
                style={{
                  fontStyle: 'italic',
                  fontSize: 12.5,
                  color: 'rgba(240,232,214,0.8)',
                  lineHeight: 1.6,
                }}
              >
                "{a.quote}"
              </div>
              {isExpanded && a.body_md && (
                <pre
                  style={{
                    marginTop: 8,
                    padding: '8px 10px',
                    background: 'rgba(0,0,0,0.25)',
                    borderLeft: `2px solid ${a.tagColor}`,
                    fontFamily: 'var(--serif)',
                    fontSize: 11.5,
                    lineHeight: 1.7,
                    color: 'rgba(240,232,214,0.85)',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                >
                  {a.body_md}
                </pre>
              )}
              {isExpanded && a.citations.length > 0 && (
                <div
                  style={{
                    marginTop: 6,
                    fontFamily: 'var(--mono)',
                    fontSize: 10,
                    color: 'rgba(240,232,214,0.55)',
                  }}
                >
                  引用 ·{' '}
                  {a.citations.map((c, j) => (
                    <span key={j} style={{ marginRight: 8 }}>
                      [{c.type}] {c.label}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
