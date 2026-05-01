// Compass · ⑤ 战略回声 · 我们曾经的方向,今天的命运
//
// 按原型 (07-archive/会议纪要 (20260501)/compass.html L611-751) 重做:
//   3 列 SVG Sankey
//   ① 北极星方向 (左) ← ceo_strategic_lines (kind=main)
//   ② 衍生战略假设 (中) ← ceo_strategic_echos.hypothesis_text
//   ③ 已观察的事实 (右) ← ceo_strategic_echos.fact_text
//   curved Bezier 流, 颜色 = fate (confirm 绿 / refute 红 / pending 金虚线)
//   hover tooltip + 底部解读

import { useEffect, useMemo, useRef, useState } from 'react';
import { ceoApi } from '../../../_apiAdapters';
import { EnqueueRunButton } from '../../../shared/EnqueueRunButton';

interface Echo {
  id: string;
  line_id: string;
  hypothesis_text: string;
  fact_text: string | null;
  fate: 'confirm' | 'refute' | 'pending';
  evidence_run_ids: string[];
  updated_at: string;
}
interface Line {
  id: string;
  name: string;
  kind?: 'main' | 'branch' | 'drift' | string;
  alignment_score?: number | null;
  description?: string | null;
}

const FATE_FILL: Record<Echo['fate'], string> = {
  confirm: 'rgba(106,154,92,0.22)',
  refute: 'rgba(176,90,74,0.22)',
  pending: 'rgba(184,147,72,0.18)',
};
const FATE_STROKE: Record<Echo['fate'], string> = {
  confirm: 'rgba(106,154,92,0.55)',
  refute: 'rgba(176,90,74,0.6)',
  pending: 'rgba(184,147,72,0.5)',
};
const FATE_INK: Record<Echo['fate'], string> = {
  confirm: '#6A9A5C',
  refute: '#B05A4A',
  pending: '#B89348',
};
const FATE_LABEL: Record<Echo['fate'], string> = {
  confirm: '已印证',
  refute: '已反驳',
  pending: '未定',
};

const VIEW_W = 1380;
const VIEW_H = 460;
const COL1_X = 130;     // 列①中心 x
const COL2_X = 690;     // 列② 中心
const COL3_X = 1250;    // 列③ 中心
const NODE_W1 = 180;
const NODE_H1 = 70;
const NODE_W2 = 240;
const NODE_H2 = 50;
const NODE_W3 = 200;
const NODE_H3 = 50;
const TOP_PAD = 50;
const BOT_PAD = 30;
const NODE_GAP = 14;

export function StrategicEchoSankey() {
  const [lines, setLines] = useState<Line[]>([]);
  const [echos, setEchos] = useState<Echo[]>([]);
  const [loading, setLoading] = useState(true);
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const ls = await ceoApi.compass.lines({});
        if (cancelled) return;
        const lineRows = ls.items as Line[];
        setLines(lineRows);

        const all: Echo[] = [];
        for (const l of lineRows) {
          try {
            const res = await fetch(`/api/v1/ceo/compass/echos?lineId=${encodeURIComponent(l.id)}`);
            if (res.ok) {
              const data = (await res.json()) as { items: Echo[] };
              all.push(...data.items);
            }
          } catch {
            /* ignore per-line failures */
          }
        }
        if (!cancelled) {
          setEchos(all);
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

  // ─── 布局算子 ──────────────────────────────────────────
  // 列① 节点(每条 line 一个); 列② 节点(每条 echo 一个 hypothesis); 列③ 节点(每条 echo 一个 fact)
  // 流: lineNode → hypothesisNode → factNode (两段流, 颜色 = fate)
  const layout = useMemo(() => {
    // 仅展示 main + branch + drift (排除空数据)
    const visibleLines = lines.filter((l) => echos.some((e) => e.line_id === l.id));

    const lineCount = Math.max(1, visibleLines.length);
    const lineSpan = (VIEW_H - TOP_PAD - BOT_PAD - lineCount * NODE_H1) / Math.max(1, lineCount + 1);
    const linePos: Record<string, { y: number; cy: number; height: number; line: Line }> = {};
    visibleLines.forEach((l, i) => {
      const y = TOP_PAD + (i + 1) * lineSpan + i * NODE_H1;
      linePos[l.id] = { y, cy: y + NODE_H1 / 2, height: NODE_H1, line: l };
    });

    // 假设节点 (列②) — 每条 echo 一行
    const echoCount = Math.max(1, echos.length);
    const echoSpan = (VIEW_H - TOP_PAD - BOT_PAD - echoCount * NODE_H2) / Math.max(1, echoCount + 1);
    const hypoPos: Record<string, { y: number; cy: number; height: number; echo: Echo }> = {};
    const factPos: Record<string, { y: number; cy: number; height: number; echo: Echo }> = {};
    echos.forEach((e, i) => {
      const y = TOP_PAD + (i + 1) * echoSpan + i * NODE_H2;
      hypoPos[e.id] = { y, cy: y + NODE_H2 / 2, height: NODE_H2, echo: e };
      factPos[e.id] = { y, cy: y + NODE_H3 / 2, height: NODE_H3, echo: e };
    });

    return { visibleLines, linePos, hypoPos, factPos };
  }, [lines, echos]);

  if (loading) {
    return (
      <div style={{ padding: '20px', fontStyle: 'italic', color: 'rgba(26,46,61,0.5)' }}>
        加载战略回声…
      </div>
    );
  }
  if (echos.length === 0) {
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
        无战略回声数据。先 seed: <code>cd api && npm run ceo:seed-demo</code>，
        再触发 g4 跨会批注 LLM 任务（PR12:{' '}
        <code>{'POST /api/v1/ceo/runs/enqueue {"axis":"compass-echo"}'}</code>）。
      </div>
    );
  }

  const fateCounts = echos.reduce(
    (acc, e) => ({ ...acc, [e.fate]: (acc[e.fate] ?? 0) + 1 }),
    {} as Record<Echo['fate'], number>,
  );

  return (
    <div ref={containerRef} style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* 顶栏 - 图例 + 入队按钮 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 18,
          fontFamily: 'var(--mono)',
          fontSize: 10.5,
          color: 'rgba(26,46,61,0.55)',
          flexWrap: 'wrap',
        }}
      >
        <Legend swatch="rgba(106,154,92,0.55)" label={`已印证 ${fateCounts.confirm ?? 0}`} />
        <Legend swatch="rgba(176,90,74,0.6)" label={`已反驳 ${fateCounts.refute ?? 0}`} />
        <Legend swatch="rgba(184,147,72,0.5)" label={`未定 ${fateCounts.pending ?? 0}`} dashed />
        <span style={{ marginLeft: 'auto', fontSize: 9.5, color: 'rgba(26,46,61,0.45)' }}>
          流的颜色 · 命运 · 节点的边框 · 主线状态
        </span>
        <EnqueueRunButton
          axis="compass-echo"
          label="🌌 生成战略回响"
          productName="战略回响"
          tone="#3E6E8C"
          metadata={{ source: 'compass-block-5' }}
        />
      </div>

      {/* SVG canvas */}
      <div
        style={{
          background: '#FAF7F0',
          border: '1px solid #D8CFBF',
          borderRadius: 4,
          padding: '12px 14px 6px',
          position: 'relative',
        }}
      >
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          preserveAspectRatio="xMidYMid meet"
          style={{ width: '100%', height: 'auto', display: 'block', minHeight: 360 }}
          onMouseLeave={() => setTip(null)}
        >
          {/* 列头 */}
          <text x={COL1_X} y={26} textAnchor="middle" style={colHead}>
            北极星方向
          </text>
          <text x={COL2_X} y={26} textAnchor="middle" style={colHead}>
            衍生战略假设
          </text>
          <text x={COL3_X} y={26} textAnchor="middle" style={colHead}>
            已观察的事实
          </text>

          {/* 列分隔虚线 */}
          <line
            x1={(COL1_X + COL2_X) / 2}
            y1={45}
            x2={(COL1_X + COL2_X) / 2}
            y2={VIEW_H - 20}
            stroke="rgba(62,110,140,0.12)"
            strokeWidth={0.6}
            strokeDasharray="2 4"
          />
          <line
            x1={(COL2_X + COL3_X) / 2}
            y1={45}
            x2={(COL2_X + COL3_X) / 2}
            y2={VIEW_H - 20}
            stroke="rgba(62,110,140,0.12)"
            strokeWidth={0.6}
            strokeDasharray="2 4"
          />

          {/* 流 - 第 1 段 (line → hypothesis) */}
          {echos.map((e) => {
            const lp = layout.linePos[e.line_id];
            const hp = layout.hypoPos[e.id];
            if (!lp || !hp) return null;
            return (
              <path
                key={`f1-${e.id}`}
                d={curveBand(
                  COL1_X + NODE_W1 / 2,
                  lp.cy - 6,
                  COL2_X - NODE_W2 / 2,
                  hp.cy - 6,
                  12,
                )}
                fill={FATE_FILL[e.fate]}
                stroke={FATE_STROKE[e.fate]}
                strokeWidth={1}
                strokeDasharray={e.fate === 'pending' ? '4 3' : undefined}
                style={{ transition: 'fill-opacity 0.2s ease' }}
                onMouseMove={(ev) =>
                  showTip(ev, containerRef, setTip, `${lp.line.name} → ${e.hypothesis_text} · ${FATE_LABEL[e.fate]}`)
                }
              />
            );
          })}

          {/* 流 - 第 2 段 (hypothesis → fact) */}
          {echos.map((e) => {
            const hp = layout.hypoPos[e.id];
            const fp = layout.factPos[e.id];
            if (!hp || !fp || !e.fact_text) return null;
            return (
              <path
                key={`f2-${e.id}`}
                d={curveBand(
                  COL2_X + NODE_W2 / 2,
                  hp.cy - 6,
                  COL3_X - NODE_W3 / 2,
                  fp.cy - 6,
                  12,
                )}
                fill={FATE_FILL[e.fate]}
                stroke={FATE_STROKE[e.fate]}
                strokeWidth={1}
                strokeDasharray={e.fate === 'pending' ? '4 3' : undefined}
                style={{ transition: 'fill-opacity 0.2s ease' }}
                onMouseMove={(ev) =>
                  showTip(
                    ev,
                    containerRef,
                    setTip,
                    `${e.hypothesis_text} → ${e.fact_text} · ${FATE_LABEL[e.fate]}`,
                  )
                }
              />
            );
          })}

          {/* 列① 节点 */}
          {layout.visibleLines.map((l) => {
            const pos = layout.linePos[l.id];
            if (!pos) return null;
            const kind = l.kind ?? 'main';
            const stroke =
              kind === 'main'
                ? '#3E6E8C'
                : kind === 'branch'
                ? '#B89348'
                : '#B05A4A';
            return (
              <g key={l.id}>
                <rect
                  x={COL1_X - NODE_W1 / 2}
                  y={pos.y}
                  width={NODE_W1}
                  height={NODE_H1}
                  rx={2}
                  fill="#FFFCF5"
                  stroke={stroke}
                  strokeWidth={1}
                />
                <text
                  x={COL1_X}
                  y={pos.y + 24}
                  textAnchor="middle"
                  style={{ ...nodeLabel, fontWeight: 600 }}
                >
                  {l.name}
                </text>
                <text x={COL1_X} y={pos.y + 42} textAnchor="middle" style={nodeMeta}>
                  {kind === 'main' ? '主线' : kind === 'branch' ? '支线' : '漂移'} ·
                  对齐 {Number(l.alignment_score ?? 0).toFixed(2)}
                </text>
                <text x={COL1_X} y={pos.y + 58} textAnchor="middle" style={{ ...nodeMeta, fill: '#3E6E8C' }}>
                  {l.description ? truncate(l.description, 22) : ''}
                </text>
              </g>
            );
          })}

          {/* 列② 节点 */}
          {echos.map((e) => {
            const pos = layout.hypoPos[e.id];
            if (!pos) return null;
            return (
              <g key={`hypo-${e.id}`}>
                <rect
                  x={COL2_X - NODE_W2 / 2}
                  y={pos.y}
                  width={NODE_W2}
                  height={NODE_H2}
                  rx={2}
                  fill="#FFFCF5"
                  stroke={FATE_INK[e.fate]}
                  strokeWidth={1}
                  strokeDasharray={e.fate === 'pending' ? '4 3' : undefined}
                />
                <text x={COL2_X} y={pos.y + 21} textAnchor="middle" style={nodeLabel}>
                  {truncate(e.hypothesis_text, 26)}
                </text>
                <text
                  x={COL2_X}
                  y={pos.y + 39}
                  textAnchor="middle"
                  style={{ ...nodeMeta, fill: FATE_INK[e.fate] }}
                >
                  {FATE_LABEL[e.fate]}
                </text>
              </g>
            );
          })}

          {/* 列③ 节点 */}
          {echos.map((e) => {
            const pos = layout.factPos[e.id];
            if (!pos) return null;
            return (
              <g key={`fact-${e.id}`}>
                <rect
                  x={COL3_X - NODE_W3 / 2}
                  y={pos.y}
                  width={NODE_W3}
                  height={NODE_H3}
                  rx={2}
                  fill="#FFFCF5"
                  stroke={FATE_INK[e.fate]}
                  strokeWidth={1}
                  strokeDasharray={e.fate === 'pending' ? '4 3' : undefined}
                />
                <text x={COL3_X} y={pos.y + 21} textAnchor="middle" style={nodeLabel}>
                  {truncate(e.fact_text ?? '— 待跨会聚合 —', 24)}
                </text>
                <text
                  x={COL3_X}
                  y={pos.y + 39}
                  textAnchor="middle"
                  style={{ ...nodeMeta, fill: FATE_INK[e.fate] }}
                >
                  {FATE_LABEL[e.fate]}
                </text>
              </g>
            );
          })}
        </svg>

        {tip && (
          <div
            style={{
              position: 'absolute',
              left: tip.x + 14,
              top: tip.y + 14,
              padding: '6px 10px',
              background: '#1F2A36',
              color: '#F5EFE3',
              fontFamily: 'var(--mono)',
              fontSize: 10.5,
              lineHeight: 1.5,
              borderRadius: 3,
              maxWidth: 360,
              pointerEvents: 'none',
              zIndex: 20,
              boxShadow: '0 4px 18px rgba(0,0,0,0.18)',
            }}
          >
            {tip.text}
          </div>
        )}
      </div>

      {/* 底部解读 */}
      <FootInterpretation lines={layout.visibleLines} echos={echos} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// helpers + sub-components
// ─────────────────────────────────────────────────────────────

function Legend({ swatch, label, dashed }: { swatch: string; label: string; dashed?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span
        style={{
          width: 22,
          height: 8,
          background: swatch,
          backgroundImage: dashed
            ? 'repeating-linear-gradient(90deg, rgba(184,147,72,0.5) 0 4px, transparent 4px 7px)'
            : undefined,
          display: 'inline-block',
        }}
      />
      <span>{label}</span>
    </div>
  );
}

function FootInterpretation({ lines, echos }: { lines: Line[]; echos: Echo[] }) {
  const byLine: Record<string, { name: string; total: number; refute: number; confirm: number; pending: number }> = {};
  for (const l of lines) byLine[l.id] = { name: l.name, total: 0, refute: 0, confirm: 0, pending: 0 };
  for (const e of echos) {
    if (!byLine[e.line_id]) continue;
    byLine[e.line_id].total++;
    byLine[e.line_id][e.fate]++;
  }
  const reviewLines = Object.values(byLine).filter(
    (x) => x.total > 0 && x.refute / x.total >= 0.5,
  );
  const healthyLines = Object.values(byLine).filter(
    (x) => x.total > 0 && x.confirm / x.total >= 0.5,
  );

  return (
    <div
      style={{
        padding: '10px 14px',
        background: '#FAF7F0',
        border: '1px solid #D8CFBF',
        borderLeft: '3px solid #3E6E8C',
        fontFamily: 'var(--serif)',
        fontSize: 12,
        lineHeight: 1.7,
        color: 'rgba(26,46,61,0.78)',
      }}
    >
      <span style={{ fontWeight: 600, fontStyle: 'italic', color: '#1A2E3D' }}>读法 · </span>
      {healthyLines.length > 0 && (
        <>
          <b style={{ color: '#1A2E3D' }}>主线 {healthyLines.map((x) => x.name).join('、')}</b>{' '}
          整体在轨。
        </>
      )}
      {reviewLines.length > 0 ? (
        <>
          {' '}
          <b style={{ color: '#1A2E3D' }}>主线 {reviewLines.map((x) => x.name).join('、')}</b> 多
          条假设已被反驳 — <b style={{ color: '#B05A4A' }}>需要重审</b>而非延续。
        </>
      ) : (
        <> 当前未发现需立即重审的主线 — 假设与现实总体匹配。</>
      )}
    </div>
  );
}

const colHead: React.CSSProperties = {
  fontFamily: 'var(--serif)',
  fontStyle: 'italic',
  fontSize: 12,
  letterSpacing: 0.5,
  fill: 'rgba(26,46,61,0.55)',
};
const nodeLabel: React.CSSProperties = {
  fontFamily: 'var(--serif)',
  fontStyle: 'italic',
  fontSize: 13,
  fill: '#1A2E3D',
};
const nodeMeta: React.CSSProperties = {
  fontFamily: 'var(--mono)',
  fontSize: 10,
  fill: 'rgba(26,46,61,0.55)',
};

function curveBand(x1: number, y1: number, x2: number, y2: number, h: number): string {
  const cx1 = x1 + (x2 - x1) * 0.45;
  const cx2 = x1 + (x2 - x1) * 0.55;
  return [
    `M ${x1} ${y1}`,
    `C ${cx1} ${y1}, ${cx2} ${y2}, ${x2} ${y2}`,
    `L ${x2} ${y2 + h}`,
    `C ${cx2} ${y2 + h}, ${cx1} ${y1 + h}, ${x1} ${y1 + h}`,
    'Z',
  ].join(' ');
}

function showTip(
  ev: React.MouseEvent<SVGPathElement>,
  containerRef: React.RefObject<HTMLDivElement>,
  setTip: React.Dispatch<React.SetStateAction<{ x: number; y: number; text: string } | null>>,
  text: string,
) {
  const rect = containerRef.current?.getBoundingClientRect();
  if (!rect) return;
  setTip({ x: ev.clientX - rect.left, y: ev.clientY - rect.top, text });
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 1) + '…';
}
