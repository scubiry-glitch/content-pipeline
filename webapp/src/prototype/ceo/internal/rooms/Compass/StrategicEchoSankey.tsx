// Compass · ⑤ 战略回响 Sankey
// 数据源: ceo_strategic_echos (经 PR8 seed 已有 5 条)
// 三列布局: hypothesis (左) ↔ fact (中) ↔ fate (右), 用 SVG 流线连接

import { useEffect, useState } from 'react';
import { ceoApi } from '../../../_apiAdapters';

interface Echo {
  id: string;
  line_id: string;
  hypothesis_text: string;
  fact_text: string | null;
  fate: 'confirm' | 'refute' | 'pending';
  evidence_run_ids: string[];
  updated_at: string;
}

const FATE_COLOR: Record<Echo['fate'], string> = {
  confirm: '#6A9A5C',
  refute: '#B05A4A',
  pending: '#B89348',
};

const FATE_LABEL: Record<Echo['fate'], string> = {
  confirm: '✓ 确认',
  refute: '✗ 证伪',
  pending: '⊘ 等待',
};

export function StrategicEchoSankey() {
  const [lines, setLines] = useState<Array<{ id: string; name: string }>>([]);
  const [echosByLine, setEchosByLine] = useState<Record<string, Echo[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const ls = await ceoApi.compass.lines({});
        if (cancelled) return;
        setLines(ls.items);
        // 串行拉每条线的 echos（数据少，不优化）
        const map: Record<string, Echo[]> = {};
        for (const l of ls.items) {
          try {
            const res = await fetch(`/api/v1/ceo/compass/echos?lineId=${encodeURIComponent(l.id)}`);
            if (res.ok) {
              const data = (await res.json()) as { items: Echo[] };
              if (data.items.length > 0) map[l.id] = data.items;
            }
          } catch {
            /* ignore */
          }
        }
        if (!cancelled) {
          setEchosByLine(map);
          setLoading(false);
        }
      } catch {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const allEchos = Object.entries(echosByLine).flatMap(([lineId, echos]) =>
    echos.map((e) => ({ ...e, lineName: lines.find((l) => l.id === lineId)?.name ?? '?' })),
  );

  if (loading) {
    return (
      <div style={{ padding: '20px', fontStyle: 'italic', color: 'rgba(26,46,61,0.5)' }}>
        加载战略回响…
      </div>
    );
  }
  if (allEchos.length === 0) {
    return (
      <div
        style={{
          padding: '20px 18px',
          background: 'rgba(62,110,140,0.04)',
          border: '1px dashed rgba(62,110,140,0.3)',
          borderRadius: 4,
          fontFamily: 'var(--serif)',
          fontStyle: 'italic',
          fontSize: 13,
          color: 'rgba(26,46,61,0.62)',
          lineHeight: 1.7,
        }}
      >
        无战略回响数据。先 seed: <code>cd api && npm run ceo:seed-demo</code>，
        再触发 g4 跨会批注 LLM 任务（PR12:{' '}
        <code>{'POST /api/v1/ceo/runs/enqueue {"axis":"g4"}'}</code>）。
      </div>
    );
  }

  // 三列 Sankey 简化版：每条 echo 一行 (line | hypothesis ↔ fact | fate)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {allEchos.map((e) => (
        <div
          key={e.id}
          style={{
            display: 'grid',
            gridTemplateColumns: '90px 1fr 1fr 90px',
            gap: 14,
            alignItems: 'center',
            padding: '10px 12px',
            background: '#FAF7F0',
            border: '1px solid #D8CFBF',
            borderLeft: `3px solid ${FATE_COLOR[e.fate]}`,
            borderRadius: '0 4px 4px 0',
          }}
        >
          <span
            style={{
              fontFamily: 'var(--serif)',
              fontStyle: 'italic',
              fontSize: 13,
              fontWeight: 600,
              color: '#1A2E3D',
            }}
          >
            {e.lineName}
          </span>
          <div style={{ fontSize: 12.5, lineHeight: 1.5, color: 'rgba(26,46,61,0.85)' }}>
            <span
              style={{
                fontFamily: 'var(--mono)',
                fontSize: 9,
                color: '#3E6E8C',
                letterSpacing: 0.3,
                textTransform: 'uppercase',
                marginRight: 6,
              }}
            >
              假设
            </span>
            {e.hypothesis_text}
          </div>
          <div style={{ fontSize: 12, lineHeight: 1.5, color: 'rgba(26,46,61,0.65)' }}>
            <span
              style={{
                fontFamily: 'var(--mono)',
                fontSize: 9,
                color: FATE_COLOR[e.fate],
                letterSpacing: 0.3,
                textTransform: 'uppercase',
                marginRight: 6,
              }}
            >
              现实
            </span>
            {e.fact_text ?? '— 待跨会聚合 —'}
          </div>
          <span
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 11,
              padding: '4px 10px',
              background: `${FATE_COLOR[e.fate]}22`,
              color: FATE_COLOR[e.fate],
              border: `1px solid ${FATE_COLOR[e.fate]}55`,
              borderRadius: 99,
              textAlign: 'center',
              letterSpacing: 0.2,
            }}
          >
            {FATE_LABEL[e.fate]}
          </span>
        </div>
      ))}
    </div>
  );
}
