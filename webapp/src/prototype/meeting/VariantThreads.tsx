// VariantThreads — C 视图 · 人物编织
// 原型来源：/tmp/mn-proto/variant-c.jsx VariantThreads

import { useState, useEffect, useMemo, type CSSProperties } from 'react';
import { useParams } from 'react-router-dom';
import { MEETING, PARTICIPANTS, ANALYSIS, P as defaultP } from './_fixtures';
import type { Participant } from './_fixtures';
import { Icon, Avatar, Chip, MonoMeta, SectionLabel, MockBadge } from './_atoms';
import { useForceMock } from './_mockToggle';
import { adaptApiAnalysis } from './_apiAdapters';
import { useMeetingDetail, useMeetingHealth } from './MeetingDetailShell';
import { useIsMobile } from '../_useIsMobile';

type PFn = (id: string) => Participant;
type ThreadEvent = { t: number; kind: string; label?: string; ref?: string };

// ── Belief thread events (hardcoded per prototype) ──
const EVENTS: Record<string, Array<{ t: number; kind: string; label?: string; ref?: string }>> = {
  p1: [
    { t: 42, kind: 'listen' }, { t: 54, kind: 'fork', label: '6000万 / 8000万' },
    { t: 78, kind: 'update', ref: 'N1' }, { t: 108, kind: 'decide' },
  ],
  p2: [
    { t: 18, kind: 'claim', label: '推理层主张' }, { t: 39, kind: 'clash', label: 'vs Wei Tan' },
    { t: 74, kind: 'update', ref: 'N3' }, { t: 95, kind: 'commit' },
  ],
  p3: [
    { t: 22, kind: 'claim', label: '训练层护城河' }, { t: 39, kind: 'clash' },
    { t: 72, kind: 'update', ref: 'N2' }, { t: 105, kind: 'yield' },
  ],
  p4: [{ t: 30, kind: 'listen' }, { t: 85, kind: 'data', label: '基础利率 38%' }],
  p5: [{ t: 55, kind: 'flag', label: '合规边界' }],
  p6: [{ t: 72, kind: 'data', label: '18 warm intro' }, { t: 96, kind: 'listen' }],
};

// ── Legend kind groups (used for toggleable filter) ──
const LEGEND_KINDS: Array<{
  label: string; kinds: string[];
  color: string; ring?: boolean; small?: boolean; square?: boolean;
}> = [
  { label: '主张 / claim',     kinds: ['claim'],                              color: 'var(--ink)' },
  { label: '冲击 / clash',     kinds: ['clash'],                              color: 'var(--accent)', ring: true },
  { label: '信念更新 / update', kinds: ['update'],                             color: 'var(--teal)' },
  { label: '数据 / evidence',  kinds: ['data'],                               color: 'var(--amber)' },
  { label: '倾听 / listen',    kinds: ['listen'],                             color: 'var(--ink-3)', small: true },
  { label: '让步 · 决断',      kinds: ['yield', 'commit', 'decide', 'fork', 'flag'], color: 'var(--ink-2)', square: true },
];

// ── LegendDot ──
function LegendDot({ color, label, ring, small, square, onClick, hidden }: {
  color: string; label: string; ring?: boolean; small?: boolean; square?: boolean;
  onClick?: () => void; hidden?: boolean;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        cursor: onClick ? 'pointer' : undefined,
        opacity: hidden ? 0.3 : 1,
        textDecoration: hidden ? 'line-through' : undefined,
        userSelect: 'none',
        transition: 'opacity 0.15s',
      }}
    >
      {square ? (
        <div style={{ width: 9, height: 9, background: color, transform: 'rotate(45deg)', opacity: hidden ? 0.4 : 1 }} />
      ) : ring ? (
        <div style={{ width: 10, height: 10, border: `1.5px solid ${color}`, borderRadius: 99 }} />
      ) : (
        <div style={{ width: small ? 5 : 9, height: small ? 5 : 9, background: color, borderRadius: 99 }} />
      )}
      <span>{label}</span>
    </div>
  );
}

// ── EventMark ──
function EventMark({ e, x, slot = 0 }: { e: ThreadEvent; x: number; slot?: number }) {
  const base: CSSProperties = {
    position: 'absolute', left: x, top: '50%',
    transform: 'translate(-50%,-50%)', zIndex: 2,
  };
  // 标签共享样式：限宽 + 省略
  // slot 决定 label 的垂直偏移（dot 始终在 line 上）：
  //   slot 0 → 0px,  slot 1 → +14px (下),  slot 2 → -14px (上),  slot 3 → +28px,  slot 4 → -28px ...
  // lane 高度 72，半高 36，offset 控在 ±28 内不串入相邻 lane。
  const labelDy = slot === 0 ? 0 : (slot % 2 === 1 ? 1 : -1) * Math.ceil(slot / 2) * 14;
  const labelStyle: CSSProperties = {
    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
    maxWidth: 96, display: 'inline-block',
    transform: labelDy ? `translateY(${labelDy}px)` : undefined,
    background: labelDy ? 'var(--paper-2)' : undefined,
    padding: labelDy ? '0 4px' : undefined,
    borderRadius: labelDy ? 3 : undefined,
  };
  switch (e.kind) {
    case 'claim':
      return (
        <div style={{ ...base, display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 10, height: 10, background: 'var(--ink)', borderRadius: 99, boxShadow: '0 0 0 3px var(--paper-2)' }} />
          {e.label && <span title={e.label} style={{ ...labelStyle, fontSize: 10.5, color: 'var(--ink)', fontWeight: 500 }}>{e.label}</span>}
        </div>
      );
    case 'clash':
      return (
        <div style={{ ...base, display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 14, height: 14, border: '2px solid var(--accent)', borderRadius: 99, background: 'var(--paper-2)' }} />
          {e.label && <span title={e.label} style={{ ...labelStyle, fontSize: 10.5, color: 'var(--accent)', fontWeight: 500, marginLeft: 2 }}>{e.label}</span>}
        </div>
      );
    case 'update':
      return (
        <div style={{ ...base, display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{ width: 12, height: 12, background: 'var(--teal)', borderRadius: 99, boxShadow: '0 0 0 3px var(--paper-2)' }} />
          <MonoMeta style={{ fontSize: 9.5, color: 'oklch(0.3 0.08 200)' }}>{e.ref}</MonoMeta>
        </div>
      );
    case 'data':
      return (
        <div style={{ ...base, display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{ width: 9, height: 9, background: 'var(--amber)', borderRadius: 99, boxShadow: '0 0 0 3px var(--paper-2)' }} />
          {e.label && <span title={e.label} style={{ ...labelStyle, fontSize: 10, color: 'oklch(0.42 0.09 75)' }}>{e.label}</span>}
        </div>
      );
    case 'listen':
      return (
        <div style={base}>
          <div style={{ width: 5, height: 5, background: 'var(--ink-3)', borderRadius: 99, boxShadow: '0 0 0 2px var(--paper-2)' }} />
        </div>
      );
    case 'fork':
      return (
        <div style={{ ...base, display: 'flex', alignItems: 'center', gap: 5 }}>
          <Icon name="git" size={14} style={{ color: 'var(--accent)' }} />
          {e.label && <span title={e.label} style={{ ...labelStyle, fontSize: 10, color: 'var(--accent)', fontWeight: 500 }}>{e.label}</span>}
        </div>
      );
    case 'flag':
      return (
        <div style={{ ...base, display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{ width: 0, height: 0, borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderBottom: '9px solid var(--amber)' }} />
          {e.label && <span title={e.label} style={{ ...labelStyle, fontSize: 10, color: 'oklch(0.4 0.09 75)' }}>{e.label}</span>}
        </div>
      );
    case 'yield':
    case 'commit':
    case 'decide':
      return (
        <div style={base}>
          <div style={{ width: 10, height: 10, background: 'var(--ink-2)', transform: 'rotate(45deg)', boxShadow: '0 0 0 3px var(--paper-2)' }} />
        </div>
      );
    default:
      return null;
  }
}

// ── ThreadView ──
function ThreadView({ a, isMock, P = defaultP, participants, events }: {
  a: typeof ANALYSIS; isMock?: boolean; P?: PFn;
  /** 实际渲染的人物列表（API 模式来自 detail.participants，否则 fixture） */
  participants?: Participant[];
  /** 信念事件 dict（mock 模式来自模块级 EVENTS；API 模式从 analysis 派生） */
  events?: Record<string, ThreadEvent[]>;
}) {
  const isMobile = useIsMobile();
  const [hiddenKinds, setHiddenKinds] = useState(new Set<string>());
  const toggleKind = (kinds: string[]) => {
    setHiddenKinds((prev) => {
      const next = new Set(prev);
      const allHidden = kinds.every((k) => next.has(k));
      if (allHidden) kinds.forEach((k) => next.delete(k));
      else kinds.forEach((k) => next.add(k));
      return next;
    });
  };

  const lanePeople = participants && participants.length > 0 ? participants : PARTICIPANTS;
  const eventDict = events ?? EVENTS;
  const W = 1440 - 56 * 2;
  const laneH = 72;
  const startX = 170;
  const endX = W - 60;
  const MIN = 118;
  const xFor = (min: number) => startX + (min / MIN) * (endX - startX);

  return (
    <div style={{ padding: isMobile ? '16px 14px 22px' : '26px 56px 32px', overflowY: 'auto' }}>
      <div style={{
        marginBottom: 18, display: 'flex',
        flexDirection: isMobile ? 'column' : 'row',
        alignItems: isMobile ? 'flex-start' : 'baseline',
        gap: isMobile ? 8 : 18,
      }}>
        <h2 style={{ fontFamily: 'var(--serif)', fontWeight: 500, fontSize: isMobile ? 20 : 26, margin: 0, letterSpacing: '-0.01em' }}>
          信念演化 · Belief threads {isMock && <MockBadge style={{ verticalAlign: 'middle', marginLeft: 6 }} />}
        </h2>
        <div style={{ fontSize: 13, color: 'var(--ink-3)', maxWidth: 560 }}>
          每条横轴是一个人的信念轨迹。标记点是：主张 · 冲击 · 更新 · 让步 · 决断。读图就像看一场辩论的 MRI。
        </div>
      </div>

      {/* Legend — click to toggle kind visibility */}
      <div style={{ display: 'flex', gap: 14, marginBottom: 18, fontSize: 11.5, color: 'var(--ink-3)', flexWrap: 'wrap' }}>
        {LEGEND_KINDS.map((item) => (
          <LegendDot
            key={item.label}
            color={item.color}
            label={item.label}
            ring={item.ring}
            small={item.small}
            square={item.square}
            hidden={item.kinds.every((k) => hiddenKinds.has(k))}
            onClick={() => toggleKind(item.kinds)}
          />
        ))}
        {hiddenKinds.size > 0 && (
          <span
            onClick={() => setHiddenKinds(new Set())}
            style={{ cursor: 'pointer', color: 'var(--teal)', fontSize: 10.5, alignSelf: 'center' }}
          >
            全部显示
          </span>
        )}
      </div>

      {/* Chart · API 模式由 analysis 派生事件（无真实时间戳，按数组序号铺到时间轴） */}
      {/* mobile: 整张轨迹图（含 startX=170 + 1158px 时间轴）需要 ~1328px，包进横滑容器 */}
      <div className={isMobile ? 'mp-scroll-h' : undefined} style={{
        ...(isMobile ? { overflowX: 'auto' as const, WebkitOverflowScrolling: 'touch' as const } : {}),
      }}>
      <div style={{
        position: 'relative', background: 'var(--paper-2)', border: '1px solid var(--line-2)',
        borderRadius: 8, padding: '18px 0 30px',
        ...(isMobile ? { width: W + 60 + startX } : {}),
      }}>
        {/* Time axis */}
        <div style={{ position: 'relative', height: 20, marginLeft: startX, marginRight: 60, marginBottom: 6 }}>
          {[0, 30, 60, 90, 118].map((m) => (
            <div key={m} style={{ position: 'absolute', left: ((m / MIN) * (endX - startX)) + 'px', top: 0 }}>
              <div style={{ width: 1, height: 8, background: 'var(--line)' }} />
              <MonoMeta style={{ fontSize: 10, transform: 'translateX(-50%)', display: 'inline-block' }}>{m}m</MonoMeta>
            </div>
          ))}
        </div>

        {/* Lanes */}
        {lanePeople.map((p, i) => (
          <div key={p.id} style={{
            position: 'relative', height: laneH,
            borderTop: i === 0 ? 'none' : '1px dashed var(--line-2)',
            display: 'flex', alignItems: 'center',
          }}>
            <div style={{ width: startX - 14, padding: '0 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <Avatar p={p} size={28} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{
                  fontSize: 12.5, fontWeight: 500,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }} title={p.name}>{p.name}</div>
                <div style={{
                  fontSize: 10.5, color: 'var(--ink-3)',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }} title={p.role}>{p.role}</div>
              </div>
            </div>
            {/* Track */}
            <div style={{
              position: 'absolute', left: startX, right: 60, top: '50%', height: 2,
              background: 'linear-gradient(to right, var(--line) 0%, var(--line) 100%)',
              transform: 'translateY(-50%)',
            }} />
            {/* Speaking density */}
            <div style={{
              position: 'absolute', left: startX, right: 60, top: '50%', height: 22,
              transform: 'translateY(-50%)',
              background: `linear-gradient(to right, transparent, ${
                p.tone === 'warm'
                  ? 'oklch(0.9 0.04 40 / 0.4)'
                  : p.tone === 'cool'
                  ? 'oklch(0.9 0.035 200 / 0.4)'
                  : 'oklch(0.9 0.005 75 / 0.35)'
              } ${Math.min(95, p.speakingPct * 2)}%, transparent)`,
              borderRadius: 11, pointerEvents: 'none',
            }} />
            {/* Events · 贪心 slot 分配，相邻 label 自动上下错开避让 */}
            {(() => {
              const events = (eventDict[p.id] ?? [])
                .filter((e) => !hiddenKinds.has(e.kind))
                .slice().sort((a, b) => a.t - b.t);
              const MIN_DIST = 96; // 与 labelStyle.maxWidth 一致：相邻 label 至少留 96px
              const slotEnds: number[] = [];
              const slots: number[] = events.map((e) => {
                if (!e.label) return 0; // 无 label 不占 slot
                const ex = xFor(e.t);
                for (let s = 0; s < slotEnds.length; s++) {
                  if (ex - slotEnds[s] >= MIN_DIST) {
                    slotEnds[s] = ex;
                    return s;
                  }
                }
                slotEnds.push(ex);
                return slotEnds.length - 1;
              });
              return events.map((e, j) => (
                <EventMark key={j} e={e} x={xFor(e.t)} slot={slots[j]} />
              ));
            })()}
          </div>
        ))}

        {/* mock 模式保留 demo 的两条参考线（API 派生事件没有时间戳，故隐藏） */}
        {isMock && <>
          <div style={{
            position: 'absolute', left: xFor(39) + 56, top: 30 + 20,
            height: laneH * 2 + 10, width: 0,
            borderLeft: '1.5px dashed var(--accent)', opacity: 0.5,
          }} />
          <div style={{
            position: 'absolute', left: xFor(108) + 56, top: 20, bottom: 10,
            width: 0, borderLeft: '1.5px solid var(--accent)', opacity: 0.3,
          }} />
          <div style={{
            position: 'absolute', left: xFor(108) + 56, top: -4, transform: 'translateX(-50%)',
            fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--accent)', letterSpacing: 0.3,
            background: 'var(--paper)', padding: '1px 6px', borderRadius: 3,
          }}>DECISION · 108m</div>
        </>}
      </div>
      </div>{/* close mp-scroll-h container (ThreadView chart) */}

      {/* Belief updates summary */}
      <div style={{
        marginTop: 22, display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr',
        gap: 14,
      }}>
        {a.newCognition.map((n) => {
          const p = P(n.who);
          return (
            <div key={n.id} style={{
              background: 'var(--paper-2)', border: '1px solid var(--line-2)', borderRadius: 6,
              padding: '14px 16px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <Avatar p={p} size={22} />
                <span style={{ fontSize: 12, fontWeight: 500 }}>{p.name}</span>
                <Chip tone="teal" style={{ marginLeft: 'auto', padding: '1px 6px', fontSize: 10 }}>update</Chip>
              </div>
              <div style={{
                fontSize: 12, color: 'var(--ink-3)', fontFamily: 'var(--serif)', fontStyle: 'italic',
                marginBottom: 6, textDecoration: 'line-through',
              }}>{n.before}</div>
              <div style={{
                fontSize: 13, color: 'oklch(0.28 0.08 200)', fontFamily: 'var(--serif)',
                fontWeight: 500, lineHeight: 1.5,
              }}>→ {n.after}</div>
              <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 10, display: 'flex', gap: 4, alignItems: 'baseline' }}>
                <span style={{ color: 'var(--ink-4)' }}>触发</span>{n.trigger}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── ConsensusGraph ──
function ConsensusGraph({ a, isMock, apiParticipants, P = defaultP }: {
  a: typeof ANALYSIS; isMock?: boolean;
  apiParticipants?: Array<{ id?: string; name: string; role?: string; initials?: string; tone?: string; speakingPct?: number }>;
  P?: PFn;
}) {
  const isMobile = useIsMobile();
  const cons = a.consensus.filter((x) => x.kind === 'consensus');
  const divs = a.consensus.filter((x) => x.kind === 'divergence');
  // API 模式：participants 列表来自 /meetings/:id/detail.analysis.participants（含真实 UUID）
  // 否则回落到 fixture PARTICIPANTS（id 是 p1-p6）
  const participants = (apiParticipants && apiParticipants.length > 0)
    ? apiParticipants
        .filter((p): p is typeof p & { id: string } => typeof p.id === 'string' && p.id.length > 0)
        .map((p) => ({
          id: p.id,
          name: p.name,
          role: p.role ?? '',
          initials: p.initials ?? p.name.slice(0, 2),
          tone: (p.tone as 'warm' | 'cool' | 'neutral') ?? 'neutral',
          speakingPct: p.speakingPct ?? 0,
        }))
    : PARTICIPANTS;

  const cx = 450, cy = 360, ringR = 180;
  const nodePos: Record<string, { x: number; y: number }> = {};
  participants.forEach((p, i) => {
    const angle = (i / participants.length) * Math.PI * 2 - Math.PI / 2;
    nodePos[p.id] = { x: cx + Math.cos(angle) * ringR, y: cy + Math.sin(angle) * ringR };
  });

  return (
    <div style={{
      padding: isMobile ? '16px 14px 22px' : '22px 56px 26px',
      display: 'grid',
      gridTemplateColumns: isMobile ? '1fr' : '900px 1fr',
      gap: isMobile ? 18 : 26,
      overflow: 'auto',
    }}>
      <div>
        <h2 style={{ fontFamily: 'var(--serif)', fontWeight: 500, fontSize: isMobile ? 20 : 24, margin: '0 0 14px', letterSpacing: '-0.01em' }}>
          共识 · 分歧 · 图谱 {isMock && <MockBadge style={{ verticalAlign: 'middle', marginLeft: 6 }} />}
        </h2>
        {/* mobile: 整张图谱（SVG + HTML 卡片）需要 900px 以保持坐标系，包进横滑容器 */}
        <div className={isMobile ? 'mp-scroll-h' : undefined} style={{
          position: 'relative', height: 720,
          ...(isMobile ? {
            overflowX: 'auto' as const, overflowY: 'hidden' as const,
            WebkitOverflowScrolling: 'touch' as const,
            border: '1px solid var(--line-2)', borderRadius: 6, background: 'var(--paper-2)',
          } : {}),
        }}>
        {/* 内层强制 900px 宽，让 absolute 子元素的坐标系不被压缩 */}
        <div style={{ position: 'relative', width: 900, height: 720 }}>
        <svg width={900} height={680} style={{ position: 'absolute', left: 0, top: 40 }}>
          <defs>
            <pattern id="dots" patternUnits="userSpaceOnUse" width="16" height="16">
              <circle cx="2" cy="2" r="0.8" fill="oklch(0.85 0.01 75)" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#dots)" opacity="0.5" />
          <circle cx={cx} cy={cy} r={ringR} fill="none" stroke="var(--line)" strokeDasharray="2 4" />
          <circle cx={cx} cy={cy} r={44} fill="var(--paper)" stroke="var(--ink)" strokeWidth={1.5} />
          <text x={cx} y={cy - 4} textAnchor="middle" fontFamily="var(--serif)" fontSize="12" fontWeight="600" fill="var(--ink)">会议</text>
          <text x={cx} y={cy + 12} textAnchor="middle" fontFamily="var(--mono)" fontSize="9" fill="var(--ink-3)">M-237</text>

          {/* Divergence paths */}
          {divs.map((d, idx) => {
            const dy = 80 + idx * 250;
            const dx = cx + 240;
            return (
              <g key={d.id}>
                {d.sides.map((s, sIdx) =>
                  s.by.map((pid) => {
                    const from = nodePos[pid];
                    if (!from) return null;
                    const toX = dx, toY = dy + 50 + sIdx * 70;
                    return (
                      <path key={pid + sIdx}
                        d={`M ${from.x} ${from.y} C ${(from.x + toX) / 2} ${from.y}, ${(from.x + toX) / 2} ${toY}, ${toX} ${toY}`}
                        fill="none"
                        stroke={sIdx === 0 ? 'var(--teal)' : 'oklch(0.6 0.1 40)'}
                        strokeWidth={1.3} opacity={0.55}
                      />
                    );
                  })
                )}
              </g>
            );
          })}

          {/* Consensus paths */}
          {cons.map((c, idx) => {
            const dy = 110 + idx * 150;
            const dx = cx - 250;
            return (
              <g key={c.id}>
                {c.supportedBy.map((pid) => {
                  const from = nodePos[pid];
                  if (!from) return null;
                  return (
                    <path key={pid}
                      d={`M ${from.x} ${from.y} C ${(from.x + dx) / 2} ${from.y}, ${(from.x + dx) / 2} ${dy + 30}, ${dx} ${dy + 30}`}
                      fill="none" stroke="var(--accent)" strokeWidth={1.2} opacity={0.5}
                    />
                  );
                })}
              </g>
            );
          })}

          {/* Participant nodes — 圆 + initials 留在 SVG；人名移到外层 HTML 以便单行 ellipsis */}
          {participants.map((p) => {
            const { x, y } = nodePos[p.id];
            const fill = p.tone === 'warm'
              ? 'oklch(0.88 0.06 40)'
              : p.tone === 'cool'
              ? 'oklch(0.9 0.05 200)'
              : 'oklch(0.92 0.01 75)';
            return (
              <g key={p.id}>
                <circle cx={x} cy={y} r={22} fill={fill} stroke="var(--paper)" strokeWidth={3} />
                <text x={x} y={y + 4} textAnchor="middle" fontFamily="var(--sans)" fontSize="11" fontWeight="600" fill="var(--ink)">{p.initials}</text>
              </g>
            );
          })}
        </svg>
        {/* 人名 HTML 层（absolute · 跟 svg 用同一坐标系：svg top:40 已被 SectionLabel 占位，此层 top:40 起算） */}
        {participants.map((p) => {
          const { x, y } = nodePos[p.id];
          return (
            <div key={`name-${p.id}`} style={{
              position: 'absolute', left: x - 50, top: 40 + y + 28, width: 100,
              textAlign: 'center', fontSize: 10.5, color: 'var(--ink-2)',
              fontFamily: 'var(--sans)',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              pointerEvents: 'none',
            }} title={p.name}>{p.name}</div>
          );
        })}

        {/* Consensus HTML cards */}
        {cons.map((c, idx) => (
          <div key={c.id} style={{
            position: 'absolute', left: 10, top: 150 + idx * 150, width: 180,
            background: 'var(--accent-soft)', border: '1px solid oklch(0.85 0.07 40)',
            borderRadius: 5, padding: '10px 12px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <Icon name="check" size={11} style={{ color: 'oklch(0.4 0.1 40)' }} />
              <MonoMeta style={{ fontSize: 10 }}>{c.id}</MonoMeta>
            </div>
            <div style={{ fontFamily: 'var(--serif)', fontSize: 12.5, lineHeight: 1.45, color: 'oklch(0.28 0.08 40)' }}>
              {c.text}
            </div>
          </div>
        ))}

        {/* Divergence HTML cards */}
        {divs.map((d, idx) => (
          <div key={d.id} style={{
            position: 'absolute', right: 10, top: 120 + idx * 250, width: 220,
            background: 'var(--paper)', border: '1px solid var(--line-2)', borderRadius: 6,
          }}>
            <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--line-2)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Icon name="git" size={11} style={{ color: 'var(--teal)' }} />
              <MonoMeta style={{ fontSize: 10 }}>{d.id}</MonoMeta>
            </div>
            <div style={{ padding: '10px 12px', fontFamily: 'var(--serif)', fontSize: 12.5, lineHeight: 1.4, borderBottom: '1px solid var(--line-2)' }}>
              {d.text}
            </div>
            {d.sides.map((s, i) => (
              <div key={i} style={{
                padding: '6px 12px', fontSize: 11, display: 'flex', justifyContent: 'space-between',
                background: i === 0 ? 'var(--teal-soft)' : 'oklch(0.96 0.02 40)',
                borderTop: i > 0 ? '1px solid var(--line-2)' : 'none',
              }}>
                <span style={{ fontWeight: 600 }}>{s.stance}</span>
                <div style={{ display: 'flex', gap: 2 }}>
                  {s.by.map((pid) => <Avatar key={pid} p={P(pid)} size={14} radius={3} />)}
                </div>
              </div>
            ))}
          </div>
        ))}
        </div>{/* close inner 900px-fixed wrapper */}
        </div>{/* close mp-scroll-h container */}
      </div>

      {/* Right stats panel */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ background: 'var(--paper-2)', border: '1px solid var(--line-2)', borderRadius: 6, padding: '16px 18px' }}>
          <SectionLabel>共识 / 分歧条目</SectionLabel>
          <div style={{ fontFamily: 'var(--serif)', fontSize: 34, fontWeight: 500, marginTop: 8, letterSpacing: '-0.02em' }}>
            {cons.length} / {divs.length}
          </div>
          <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 4 }}>
            {isMock ? '基线 0.48 · 对齐度 0.62（demo）' : '基于 mn_consensus_items 的实时计数'}
          </div>
        </div>
        {/* 「分歧结构」「专家附议」当前没有 API 数据 · 仅 mock 模式展示 */}
        {isMock && <>
          <div style={{ background: 'var(--paper-2)', border: '1px solid var(--line-2)', borderRadius: 6, padding: '16px 18px' }}>
            <SectionLabel>分歧结构</SectionLabel>
            <div style={{ fontSize: 13, lineHeight: 1.65, color: 'var(--ink-2)', marginTop: 8 }}>
              主要分歧集中在 <b style={{ color: 'var(--ink)' }}>陈汀 ↔ 林雾</b> 的风险偏好轴，
              以及 <b style={{ color: 'var(--ink)' }}>沈岚 ↔ Wei Tan</b> 的产业判断轴。两者在决议时点汇合。
            </div>
          </div>
          <div style={{ background: 'var(--paper-2)', border: '1px solid var(--line-2)', borderRadius: 6, padding: '16px 18px' }}>
            <SectionLabel>专家附议 · E09-09</SectionLabel>
            <div style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--ink-2)', marginTop: 8, fontFamily: 'var(--serif)' }}>
              分歧 D1 并非真正的分歧，而是 <i>风险预算谁承担</i> 的代理争论。建议把单笔上限的讨论
              挪到 LP 委员会层面，而不是投决会层面。
            </div>
          </div>
        </>}
      </div>
    </div>
  );
}

// ── FocusNebula ──
function FocusNebula({ a, isMock, P = defaultP }: { a: typeof ANALYSIS; isMock?: boolean; P?: PFn }) {
  const isMobile = useIsMobile();
  const W = 900, H = 620;
  const clusters = a.focusMap.map((f, i) => {
    const angle = (i / a.focusMap.length) * Math.PI * 2 - Math.PI / 2;
    return {
      who: f.who,
      cx: W / 2 + Math.cos(angle) * 240,
      cy: H / 2 + Math.sin(angle) * 180,
      themes: f.themes,
      returnsTo: f.returnsTo,
    };
  });

  return (
    <div style={{
      padding: isMobile ? '16px 14px 22px' : '22px 56px 26px',
      display: 'grid',
      gridTemplateColumns: isMobile ? '1fr' : '1fr 340px',
      gap: isMobile ? 18 : 26,
      overflow: 'auto',
    }}>
      <div>
        <h2 style={{ fontFamily: 'var(--serif)', fontWeight: 500, fontSize: isMobile ? 20 : 24, margin: '0 0 14px', letterSpacing: '-0.01em' }}>
          关注点星云 · Focus nebula {isMock && <MockBadge style={{ verticalAlign: 'middle', marginLeft: 6 }} />}
        </h2>
        {/* mobile: 900px 星云图横滑（不压缩） */}
        <div className={isMobile ? 'mp-scroll-h' : undefined} style={{
          ...(isMobile ? { overflowX: 'auto' as const, WebkitOverflowScrolling: 'touch' as const } : {}),
        }}>
        <div style={{
          position: 'relative', background: 'var(--paper-2)', border: '1px solid var(--line-2)',
          borderRadius: 8, width: W, height: H, overflow: 'hidden',
        }}>
          <svg width={W} height={H} style={{ position: 'absolute', inset: 0 }}>
            <defs>
              <pattern id="dots2" patternUnits="userSpaceOnUse" width="20" height="20">
                <circle cx="2" cy="2" r="0.7" fill="oklch(0.85 0.01 75)" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#dots2)" opacity="0.6" />
            {clusters.map((c) => (
              <circle key={c.who} cx={c.cx} cy={c.cy} r={52 + c.returnsTo * 6}
                fill={P(c.who).tone === 'warm'
                  ? 'oklch(0.9 0.04 40 / 0.35)'
                  : P(c.who).tone === 'cool'
                  ? 'oklch(0.9 0.035 200 / 0.3)'
                  : 'oklch(0.9 0.008 75 / 0.5)'}
              />
            ))}
          </svg>
          {clusters.map((c) => {
            const p = P(c.who);
            return (
              <div key={c.who}>
                <div style={{
                  position: 'absolute', left: c.cx - 22, top: c.cy - 22, width: 44, height: 44,
                  borderRadius: 99, background: 'var(--paper)', border: '1.5px solid var(--ink-2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: 'var(--sans)', fontWeight: 600, fontSize: 13,
                }}>{p.initials}</div>
                <div style={{
                  position: 'absolute', left: c.cx - 50, top: c.cy + 26, width: 100,
                  textAlign: 'center', fontSize: 11, color: 'var(--ink-3)',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  pointerEvents: 'none',
                }} title={p.name}>{p.name}</div>
                {c.themes.map((th, i) => {
                  const angle = (i / c.themes.length) * Math.PI * 2 - Math.PI / 4;
                  const r = 90;
                  const tx = c.cx + Math.cos(angle) * r;
                  const ty = c.cy + Math.sin(angle) * r;
                  return (
                    <div key={i} style={{
                      position: 'absolute', left: tx, top: ty, transform: 'translate(-50%,-50%)',
                      padding: '3px 8px', background: 'var(--paper)',
                      border: '1px solid oklch(0.85 0.07 75)',
                      color: 'oklch(0.38 0.09 75)', fontSize: 11, fontWeight: 500,
                      borderRadius: 99, whiteSpace: 'nowrap',
                      maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis',
                    }} title={String(th)}>{th}</div>
                  );
                })}
              </div>
            );
          })}
        </div>
        </div>{/* close mp-scroll-h container (FocusNebula) */}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* 重叠主题：API 模式从 a.focusMap 计算（同一 theme 被多人关注则归为重叠） */}
        <div style={{ background: 'var(--paper-2)', border: '1px solid var(--line-2)', borderRadius: 6, padding: '14px 16px' }}>
          <SectionLabel>重叠主题</SectionLabel>
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(() => {
              if (isMock) {
                return [
                  { theme: '推理层', who: ['p1', 'p2'] },
                  { theme: '毛利',   who: ['p2'] },
                  { theme: '合规 / LP', who: ['p1', 'p5'] },
                  { theme: '退出路径', who: ['p3'] },
                ];
              }
              const themeMap = new Map<string, Set<string>>();
              for (const f of a.focusMap) {
                for (const th of (f.themes ?? [])) {
                  if (!themeMap.has(th)) themeMap.set(th, new Set());
                  themeMap.get(th)!.add(f.who);
                }
              }
              return Array.from(themeMap.entries())
                .filter(([, who]) => who.size >= 2)
                .map(([theme, who]) => ({ theme, who: Array.from(who) }))
                .slice(0, 6);
            })().map((x, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                <Chip tone="amber">{x.theme}</Chip>
                <div style={{ display: 'flex', gap: 3 }}>
                  {x.who.map((id) => <Avatar key={id} p={P(id)} size={18} radius={4} />)}
                </div>
                <MonoMeta style={{ marginLeft: 'auto' }}>×{x.who.length}</MonoMeta>
              </div>
            ))}
            {!isMock && a.focusMap.length === 0 && (
              <div style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>暂无 focusMap 数据</div>
            )}
          </div>
        </div>
        {/* 「沉默 / Under-spoken」当前没有 API 数据来源 · 仅 mock 模式展示 */}
        {isMock && (
          <div style={{ background: 'var(--paper-2)', border: '1px solid var(--line-2)', borderRadius: 6, padding: '14px 16px' }}>
            <SectionLabel>沉默 / Under-spoken</SectionLabel>
            <div style={{ fontSize: 12.5, color: 'var(--ink-2)', marginTop: 8, lineHeight: 1.6, fontFamily: 'var(--serif)' }}>
              「估值模型校准」是所有人在口头上都认同、但没有一人将其作为关注主题反复回归的议题。
              这是一个典型的 <i style={{ color: 'var(--accent)' }}>伪共识</i>。
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── VariantThreads ──
export function VariantThreads() {
  const { id } = useParams<{ id: string }>();
  const forceMock = useForceMock();
  const isMobile = useIsMobile();
  const [view, setView] = useState<'threads' | 'consensus' | 'focus' | 'affect'>('threads');
  const [a, setA] = useState<typeof ANALYSIS>(ANALYSIS);
  const [usingMock, setUsingMock] = useState(true);
  const [consensusMock, setConsensusMock] = useState(true);
  const [focusMapMock, setFocusMapMock] = useState(true);
  const [apiState, setApiState] = useState<'loading' | 'ok' | 'error' | 'skipped'>('skipped');
  const [apiParticipants, setApiParticipants] = useState<Array<{ id?: string; name: string; role?: string; initials?: string; tone?: string; speakingPct?: number }>>([]);
  // 复用 Shell 已经抓的 detail，避免重复 fetch
  const { detail: shellDetail, state: shellDetailState } = useMeetingDetail();

  const P = useMemo<PFn>(() => {
    const map = new Map<string, Participant>();
    apiParticipants.forEach((p) => {
      if (typeof p.id !== 'string' || !p.id) return;
      map.set(p.id, {
        id: p.id, name: p.name || p.id, role: p.role ?? '',
        initials: p.initials ?? p.name.slice(0, 2),
        tone: (p.tone as 'warm' | 'cool' | 'neutral') ?? 'neutral',
        speakingPct: p.speakingPct ?? 0,
      });
    });
    return (id: string) => map.get(id) ?? defaultP(id);
  }, [apiParticipants]);

  // 把 lanePeople 在 mock / API 间切换；API 但 participants 缺失则保留 fixture 占位
  const lanePeople: Participant[] = useMemo(() => {
    if (usingMock) return PARTICIPANTS;
    const fromApi = apiParticipants
      .filter((p): p is typeof p & { id: string } => typeof p.id === 'string' && p.id.length > 0)
      .map((p) => P(p.id));
    return fromApi.length > 0 ? fromApi : PARTICIPANTS;
  }, [usingMock, apiParticipants, P]);

  // API 模式下从 a（已 adapt）派生信念事件 dict — 没有真实时间戳，按数组序号匀分到 0~118m
  const derivedEvents = useMemo<Record<string, ThreadEvent[]>>(() => {
    if (usingMock) return EVENTS;
    const dict: Record<string, ThreadEvent[]> = {};
    const push = (who: string, e: ThreadEvent) => {
      if (!who) return;
      if (!dict[who]) dict[who] = [];
      dict[who].push(e);
    };
    const trim = (s: string, n = 22) => (s.length > n ? s.slice(0, n) + '…' : s);
    // claim: crossView.claimBy
    (a.crossView ?? []).forEach((v: any, i: number) => {
      const t = 6 + (i * 12) % 100;
      push(v.claimBy, { t, kind: 'claim', label: trim(String(v.claim ?? '')) });
    });
    // clash: tension.between (取首两位)
    (a.tension ?? []).forEach((tn: any, i: number) => {
      const t = 30 + (i * 14) % 70;
      const between = tn.between ?? [];
      between.slice(0, 2).forEach((pid: string) => {
        push(pid, { t, kind: 'clash', label: trim(String(tn.topic ?? '')) });
      });
    });
    // update: newCognition.who
    (a.newCognition ?? []).forEach((n: any, i: number) => {
      const t = 50 + (i * 9) % 60;
      push(n.who, { t, kind: 'update', ref: n.id, label: trim(String(n.after ?? '')) });
    });
    // decide: consensus(kind=consensus).supportedBy
    (a.consensus ?? []).filter((c: any) => c.kind === 'consensus').forEach((c: any, i: number) => {
      const t = 90 + (i * 4) % 25;
      (c.supportedBy ?? []).slice(0, 2).forEach((pid: string) => push(pid, { t, kind: 'decide' }));
    });
    // 每条按 t 排序，避免视觉上交错
    Object.keys(dict).forEach((k) => dict[k].sort((x, y) => x.t - y.t));
    return dict;
  }, [usingMock, a]);

  // 同步 Shell 已抓取的 detail —— 不再单独 fetch（dev StrictMode 下省掉 4 次重复请求）
  useEffect(() => {
    if (forceMock) {
      setA(ANALYSIS);
      setUsingMock(true);
      setConsensusMock(true);
      setFocusMapMock(true);
      setApiState('skipped');
      setApiParticipants([]);
      return;
    }
    if (shellDetailState === 'loading') { setApiState('loading'); return; }
    if (shellDetailState === 'skipped') { setApiState('skipped'); return; }
    const data = shellDetail;
    if (shellDetailState === 'error' || !data?.analysis) { setApiState('error'); return; }
    setA(adaptApiAnalysis(data.analysis));
    setUsingMock(false);
    setApiState('ok');
    if (Array.isArray(data.analysis.participants)) {
      setApiParticipants(data.analysis.participants);
    }
    // analysis.consensus / analysis.focusMap 也是真实数据（即便 mn_* 表为空）· 不要被打上 MockBadge
    const sectionAt = (sid: string) => (data.analysis.sections ?? []).find((s: any) => s.id === sid);
    const cArr = Array.isArray(data.analysis.consensus) ? data.analysis.consensus : sectionAt('consensus')?.body;
    if (Array.isArray(cArr) && cArr.length > 0) setConsensusMock(false);
    const fArr = Array.isArray(data.analysis.focusMap) ? data.analysis.focusMap : sectionAt('focus-map')?.body;
    if (Array.isArray(fArr) && fArr.length > 0) setFocusMapMock(false);
    // Phase 15.15 · C.2 · consensus fork（来自 detail 顶层 consensus 字段，与 Shell 同 endpoint，无额外请求）
    if (Array.isArray(data?.consensus) && data.consensus.length > 0) {
      const adapted = (data.consensus as any[]).map((c) => ({
        id: c.id as string,
        kind: c.kind as 'consensus' | 'divergence',
        text: c.text as string,
        supportedBy: (c.supported_by ?? []) as string[],
        sides: ((c.sides ?? []) as any[]).map((s) => ({
          stance: s.stance as string,
          reason: (s.reason ?? '') as string,
          by: (s.by_ids ?? s.by ?? []) as string[],
        })),
      }));
      setA((prev) => ({ ...prev, consensus: adapted }));
      setConsensusMock(false);
    }
    // Phase 15.15 · C.3 · focus nebula
    if (Array.isArray(data?.focusMap) && data.focusMap.length > 0) {
      setA((prev) => ({ ...prev, focusMap: data.focusMap }));
      setFocusMapMock(false);
    }
  }, [forceMock, shellDetail, shellDetailState]);

  if (apiState === 'loading') {
    return (
      <div style={{
        width: '100%', height: '100%', background: 'var(--paper)',
        color: 'var(--ink-3)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'var(--sans)', fontSize: 13,
      }}>加载中…</div>
    );
  }

  return (
    <div style={{
      width: '100%', height: '100%', background: 'var(--paper)',
      display: 'grid',
      gridTemplateRows: isMobile ? 'auto 1fr' : '56px 1fr',
      color: 'var(--ink)',
      fontFamily: 'var(--sans)', overflow: 'hidden',
    }}>
      {/* Top — mobile: 横滑保留全部信息（标题 + 4 tab + chips），不强行换行 */}
      <header className={isMobile ? 'mp-scroll-h' : undefined} style={{
        display: 'flex', alignItems: 'center',
        padding: isMobile ? '8px 14px' : '0 28px',
        gap: isMobile ? 10 : 18,
        borderBottom: '1px solid var(--line-2)',
        ...(isMobile ? {
          overflowX: 'auto' as const, WebkitOverflowScrolling: 'touch' as const,
        } : {}),
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <div style={{
            fontFamily: 'var(--serif)', fontStyle: 'italic', fontWeight: 600,
            fontSize: isMobile ? 18 : 22, letterSpacing: '-0.01em',
          }}>Threads</div>
          {!isMobile && <MonoMeta>· 会议编织视图</MonoMeta>}
          {usingMock && <MockBadge />}
        </div>
        <div style={{
          display: 'flex', gap: 2, border: '1px solid var(--line)', borderRadius: 6, padding: 2,
          flexShrink: 0,
        }}>
          {([
            { id: 'threads',   label: '信念线' },
            { id: 'consensus', label: '共识 / 分歧图' },
            { id: 'focus',     label: '关注点星云' },
            { id: 'affect',    label: '情绪温度曲线' },
          ] as const).map((v) => (
            <button key={v.id} onClick={() => setView(v.id)} style={{
              padding: '5px 12px', border: 0, borderRadius: 4, fontSize: 12,
              background: view === v.id ? 'var(--ink)' : 'transparent',
              color: view === v.id ? 'var(--paper)' : 'var(--ink-2)',
              cursor: 'pointer', fontWeight: view === v.id ? 600 : 450,
              whiteSpace: 'nowrap',
            }}>{v.label}</button>
          ))}
        </div>
        {!isMobile && <div style={{ flex: 1 }} />}
        {/* duration / 专家配置当前接口未透传 · API 模式只显示真实可得的人数 */}
        {usingMock && <Chip tone="ghost" style={{ flexShrink: 0 }}><Icon name="clock" size={11} /> {MEETING.duration}</Chip>}
        <Chip tone="ghost" style={{ flexShrink: 0 }}><Icon name="users" size={11} /> {usingMock ? '6 人' : `${apiParticipants.length} 人`}</Chip>
        {usingMock && <Chip tone="accent" style={{ flexShrink: 0 }}>3 experts · standard</Chip>}
      </header>

      {view === 'threads'   && <ThreadView    a={a} isMock={usingMock} P={P} participants={lanePeople} events={derivedEvents} />}
      {view === 'consensus' && <ConsensusGraph a={a} isMock={consensusMock} apiParticipants={apiParticipants} P={P} />}
      {view === 'focus'     && <FocusNebula   a={a} isMock={focusMapMock} P={P} />}
      {view === 'affect'    && <AffectiveTrace isMock={usingMock} />}
    </div>
  );
}

// ── label slot allocator：按 x 坐标贪心分配行，避免水平重叠 ──
function assignLabelSlots(
  items: Array<{ x: number; label: string }>,
  numRows: number,
  charWidthSvg = 7,
  minGap = 12,
): number[] {
  const rowEnds: number[] = new Array(numRows).fill(-Infinity);
  return items.map(({ x, label }) => {
    const end = x + label.length * charWidthSvg + minGap;
    for (let r = 0; r < numRows; r++) {
      if (x >= rowEnds[r]) { rowEnds[r] = end; return r; }
    }
    // 全部行占用 → 选 end 最小的行
    let minR = 0;
    for (let r = 1; r < numRows; r++) if (rowEnds[r] < rowEnds[minR]) minR = r;
    rowEnds[minR] = end;
    return minR;
  });
}

// ── SVG pill label：底色矩形 + 白色文字 ──
function SvgLabel({ x, y, label, bg, fg = '#fff', anchor = 'start', fs = 10 }: {
  x: number; y: number; label: string; bg: string; fg?: string;
  anchor?: 'start' | 'middle' | 'end'; fs?: number;
}) {
  const w = label.length * 8 + 14;   // ~8 SVG units per mixed char
  const h = fs + 6;
  const ox = anchor === 'middle' ? -w / 2 : anchor === 'end' ? -w : 0;
  return (
    <g>
      <rect x={x + ox} y={y - fs} width={w} height={h} rx={3} fill={bg} />
      <text x={x} y={y - 1} fontFamily="var(--mono)" fontSize={fs} fill={fg} textAnchor={anchor}>
        {label}
      </text>
    </g>
  );
}

// ── AffectiveTrace · 情绪温度曲线（C 视图独立 tab） ──
// 数据：useMeetingHealth().affect — { samples, peak, tensionPeaks, insightPoints }
//   sample: { t, v, i, tag }；v: valence (-1..1)；i: intensity (0..1)
// 渲染：竖条（颜色按 valence 暖/冷，长度按 intensity，从 v=0 中线向上/向下）
//       + valence 折线（细线连各 sample 点）
//       + 峰值标注（intensity 最大点）
// anchor: id='affect-section'
const AFFECT_LAYERS: Array<{ id: string; label: string; icon: React.ReactNode }> = [
  { id: 'warm',    label: '正向 valence（暖）', icon: <span style={{ width: 12, height: 4, background: 'oklch(0.6 0.15 50)', borderRadius: 2, display: 'inline-block' }} /> },
  { id: 'cool',    label: '负向 valence（冷）', icon: <span style={{ width: 12, height: 4, background: 'oklch(0.6 0.15 220)', borderRadius: 2, display: 'inline-block' }} /> },
  { id: 'line',    label: 'valence 折线',       icon: <span style={{ width: 18, height: 1.5, background: 'var(--ink-2)', display: 'inline-block' }} /> },
  { id: 'peak',    label: '峰值',               icon: <span style={{ width: 10, height: 10, border: '1.4px solid var(--accent)', borderRadius: 99, display: 'inline-block' }} /> },
  { id: 'tension', label: '张力峰',             icon: <span style={{ display: 'inline-block', width: 0, height: 0, borderLeft: '4px solid transparent', borderRight: '4px solid transparent', borderBottom: '8px solid var(--accent)', opacity: 0.85, verticalAlign: 'middle' }} /> },
  { id: 'insight', label: '洞察点',             icon: <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 99, background: 'var(--teal)', opacity: 0.85 }} /> },
];

function AffectiveTrace({ isMock }: { isMock: boolean }) {
  const isMobile = useIsMobile();
  const [hiddenLayers, setHiddenLayers] = useState(new Set<string>());
  const show = (id: string) => !hiddenLayers.has(id);
  const toggleLayer = (id: string) => setHiddenLayers((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const health = useMeetingHealth();
  const affect = health?.affect ?? null;
  const rawSamples: any[] = affect?.samples ?? [];
  // API returns t_sec/valence/intensity; normalize to t/v/i for chart
  const samples = rawSamples.map((s: any) => ({
    t: s.t ?? s.t_sec,
    v: s.v ?? s.valence,
    i: s.i ?? s.intensity,
    tag: s.tag,
  }));
  const peak = affect?.peak ?? null;
  // tension_peaks and insight_points: { t_sec: seconds, note: string }
  const normTensionPeaks: Array<{ t: number; note: string }> = (
    Array.isArray(affect?.tensionPeaks) ? affect!.tensionPeaks as any[] : []
  ).map((tp: any) => ({
    t: Number(tp.t_sec ?? tp.t ?? 0) / (tp.t !== undefined ? 1 : 60),
    note: String(tp.note ?? tp.tag ?? ''),
  }));
  const normInsightPoints: Array<{ t: number; note: string }> = (
    Array.isArray(affect?.insightPoints) ? affect!.insightPoints as any[] : []
  ).map((ip: any) => ({
    t: Number(ip.t_sec ?? ip.t ?? 0) / (ip.t !== undefined ? 1 : 60),
    note: String(ip.note ?? ip.tag ?? ''),
  }));

  // 主图尺寸（逻辑坐标；SVG 用 viewBox 填满容器宽度）
  const W = 1040, H = 460;
  const PAD = { L: 56, R: 32, T: 52, B: 60 };
  const IW = W - PAD.L - PAD.R;
  const IH = H - PAD.T - PAD.B;
  const midY = PAD.T + IH / 2;
  // x 轴最大时间：取 samples / tensionPeaks / insightPoints 三组里的最大 t,
  // 加 5% padding 保证最右边有点空间; 至少 1 分钟避免除零.
  // (之前固定 MIN=118 让短会议样本全挤到最左 ~2% 宽度看不清.)
  const allTs: number[] = [
    ...samples.map((s) => Number(s.t ?? 0)),
    ...normTensionPeaks.map((tp) => tp.t),
    ...normInsightPoints.map((ip) => ip.t),
  ].filter((n) => Number.isFinite(n));
  const maxT = Math.max(1, ...allTs) * 1.05;
  const xFor = (t: number) => PAD.L + (t / maxT) * IW;
  const yForValence = (v: number) => midY - v * (IH / 2 - 12);

  // intensity 峰值对应的 sample 下标（用于红圈标注）
  const peakIdx = (() => {
    if (samples.length === 0) return -1;
    let idx = 0, maxI = -1;
    samples.forEach((s, i) => {
      const ii = Number(s.i ?? 0);
      if (ii > maxI) { maxI = ii; idx = i; }
    });
    return idx;
  })();

  // ── label 行槽预计算 ──
  // 图内最多展示全文标签的数量；超出部分仅保留编号徽章，全量显示在侧边栏
  const INLINE_MAX = 3;

  // 张力峰：从顶部向下 3 行（仅为 inline 项分配 slot）
  const TP_ROW_Y = [PAD.T + 32, PAD.T + 48, PAD.T + 64];
  const tpInline = normTensionPeaks.slice(0, INLINE_MAX);
  const tpSlots = assignLabelSlots(
    tpInline.map((tp) => ({ x: xFor(tp.t) + 12, label: tp.note.slice(0, 36) })),
    TP_ROW_Y.length,
  );

  // 洞察点：从底部向上 3 行（仅为 inline 项分配 slot）
  const IP_ROW_Y = [H - PAD.B - 22, H - PAD.B - 38, H - PAD.B - 54];
  const ipInline = normInsightPoints.slice(0, INLINE_MAX);
  const ipSlots = assignLabelSlots(
    ipInline.map((ip) => ({ x: xFor(ip.t) + 12, label: ip.note.slice(0, 36) })),
    IP_ROW_Y.length,
  );

  // sample tag：正 valence 在中线上方 3 行，负 valence 在中线下方 3 行
  const TAG_ROWS_ABOVE = [midY - 24, midY - 40, midY - 56].map((y) => Math.max(y, PAD.T + 10));
  const TAG_ROWS_BELOW = [midY + 28, midY + 44, midY + 60].map((y) => Math.min(y, H - PAD.B - 8));
  const taggedSamples = samples
    .map((s, i) => ({ s, i, x: xFor(Number(s.t ?? 0)), v: Number(s.v ?? 0) }))
    .filter(({ s }) => !!s.tag);
  const aboveSamples = taggedSamples.filter(({ v }) => v >= 0);
  const belowSamples = taggedSamples.filter(({ v }) => v < 0);
  const aboveSlots = assignLabelSlots(
    aboveSamples.map(({ x, s }) => ({ x, label: String(s.tag) })),
    TAG_ROWS_ABOVE.length,
  );
  const belowSlots = assignLabelSlots(
    belowSamples.map(({ x, s }) => ({ x, label: String(s.tag) })),
    TAG_ROWS_BELOW.length,
  );

  return (
    <div id="affect-section" style={{
      padding: isMobile ? '16px 14px 22px' : '22px 56px 26px',
      display: 'grid',
      gridTemplateColumns: '1fr',  // 主图横向铺满页面宽度；图例/标注列表移到主图下方
      gap: isMobile ? 18 : 26,
      overflow: 'auto',
    }}>
      <div>
        <h2 style={{
          fontFamily: 'var(--serif)', fontWeight: 500, fontSize: isMobile ? 20 : 24,
          margin: '0 0 14px', letterSpacing: '-0.01em',
        }}>
          情绪温度曲线 · Affective trace {isMock && <MockBadge style={{ verticalAlign: 'middle', marginLeft: 6 }} />}
        </h2>
        <div style={{
          position: 'relative', background: 'var(--paper-2)', border: '1px solid var(--line-2)',
          borderRadius: 8, width: '100%', aspectRatio: `${W} / ${H}`, overflow: 'hidden',
        }}>
          {samples.length === 0 ? (
            <div style={{
              position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, color: 'var(--ink-3)', fontFamily: 'var(--mono)',
            }}>
              数据待生成 · meta/affect_curve
            </div>
          ) : (
            <svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ position: 'absolute', inset: 0 }}>
              <defs>
                <pattern id="affectDots" patternUnits="userSpaceOnUse" width="20" height="20">
                  <circle cx="2" cy="2" r="0.7" fill="oklch(0.85 0.01 75)" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#affectDots)" opacity="0.35" />
              {/* +1 / 中线 / -1 参考线 */}
              <line x1={PAD.L} y1={PAD.T + 6} x2={W - PAD.R} y2={PAD.T + 6}
                stroke="var(--line-2)" strokeDasharray="1 5" />
              <line x1={PAD.L} y1={midY} x2={W - PAD.R} y2={midY}
                stroke="var(--line)" strokeDasharray="2 4" />
              <line x1={PAD.L} y1={H - PAD.B - 6} x2={W - PAD.R} y2={H - PAD.B - 6}
                stroke="var(--line-2)" strokeDasharray="1 5" />
              {/* Y 轴 valence 标签 */}
              <text x={PAD.L - 8} y={PAD.T + 10} fontFamily="var(--mono)" fontSize="9"
                fill="var(--ink-3)" textAnchor="end">+1</text>
              <text x={PAD.L - 8} y={midY + 3} fontFamily="var(--mono)" fontSize="9"
                fill="var(--ink-3)" textAnchor="end">0</text>
              <text x={PAD.L - 8} y={H - PAD.B - 3} fontFamily="var(--mono)" fontSize="9"
                fill="var(--ink-3)" textAnchor="end">−1</text>
              {/* 时间轴 ticks */}
              {[0, 30, 60, 90, 118].map((m) => (
                <g key={m}>
                  <line x1={xFor(m)} y1={H - PAD.B} x2={xFor(m)} y2={H - PAD.B + 6} stroke="var(--line)" />
                  <text x={xFor(m)} y={H - PAD.B + 18} fontFamily="var(--mono)" fontSize="10"
                    fill="var(--ink-3)" textAnchor="middle">{m}m</text>
                </g>
              ))}
              {/* 竖条 intensity — 正向（暖） */}
              {show('warm') && samples.filter((s) => Number(s.v ?? 0) >= 0).map((s, i) => {
                const t = Number(s.t ?? 0);
                const v = Number(s.v ?? 0);
                const intensity = Math.max(0, Math.min(1, Number(s.i ?? 0)));
                const x = xFor(t);
                const halfH = (IH / 2 - 12) * intensity * 0.9;
                return (
                  <line key={`warm-${i}`} x1={x} y1={midY} x2={x} y2={midY - halfH}
                    stroke={`oklch(${0.65 - intensity * 0.1} ${0.10 + intensity * 0.10} ${75 - v * 35})`}
                    strokeWidth={8} strokeLinecap="round" opacity={0.7}>
                    <title>{`t=${t}m · valence=${v.toFixed(2)} · intensity=${intensity.toFixed(2)}${s.tag ? ` · ${s.tag}` : ''}`}</title>
                  </line>
                );
              })}
              {/* 竖条 intensity — 负向（冷） */}
              {show('cool') && samples.filter((s) => Number(s.v ?? 0) < 0).map((s, i) => {
                const t = Number(s.t ?? 0);
                const v = Number(s.v ?? 0);
                const intensity = Math.max(0, Math.min(1, Number(s.i ?? 0)));
                const x = xFor(t);
                const halfH = (IH / 2 - 12) * intensity * 0.9;
                return (
                  <line key={`cool-${i}`} x1={x} y1={midY} x2={x} y2={midY + halfH}
                    stroke={`oklch(${0.65 - intensity * 0.1} ${0.10 + intensity * 0.10} ${210 + v * 30})`}
                    strokeWidth={8} strokeLinecap="round" opacity={0.7}>
                    <title>{`t=${t}m · valence=${v.toFixed(2)} · intensity=${intensity.toFixed(2)}${s.tag ? ` · ${s.tag}` : ''}`}</title>
                  </line>
                );
              })}
              {/* valence 折线 + 点 */}
              {show('line') && <>
                <polyline
                  points={samples.map((s) => `${xFor(Number(s.t ?? 0))},${yForValence(Number(s.v ?? 0))}`).join(' ')}
                  fill="none" stroke="var(--ink-2)" strokeWidth={1.6} opacity={0.85}
                />
                {samples.map((s, i) => (
                  <circle key={`pt-${i}`}
                    cx={xFor(Number(s.t ?? 0))} cy={yForValence(Number(s.v ?? 0))}
                    r={3} fill="var(--ink)" />
                ))}
              </>}
              {/* 张力峰：三角 + 编号徽章（全部），前 INLINE_MAX 个额外显示全文标签 */}
              {show('tension') && normTensionPeaks.map((tp, i) => {
                const x = xFor(tp.t);
                const isInline = i < INLINE_MAX;
                const labelY = isInline ? TP_ROW_Y[tpSlots[i]] : 0;
                return (
                  <g key={`tp-${i}`}>
                    <line x1={x} y1={PAD.T} x2={x} y2={H - PAD.B}
                      stroke="var(--accent)" strokeWidth={1.2} strokeDasharray="4 3" opacity={0.45} />
                    {/* 三角图标 */}
                    <polygon
                      points={`${x},${PAD.T + 2} ${x - 6},${PAD.T + 13} ${x + 6},${PAD.T + 13}`}
                      fill="var(--accent)" opacity={0.9}
                    />
                    {/* 编号徽章（始终显示） */}
                    <circle cx={x} cy={PAD.T + 24} r={9} fill="oklch(0.42 0.18 25)" />
                    <text x={x} y={PAD.T + 28} fontFamily="var(--mono)" fontSize="10"
                      fill="#fff" textAnchor="middle" fontWeight="bold">{i + 1}</text>
                    {/* 全文标签（仅前 INLINE_MAX 个） */}
                    {isInline && tp.note && <>
                      {labelY > PAD.T + 36 && (
                        <line x1={x} y1={PAD.T + 34} x2={x} y2={labelY - 4}
                          stroke="var(--accent)" strokeWidth={0.7} strokeDasharray="2 3" opacity={0.4} />
                      )}
                      <SvgLabel x={x + 12} y={labelY} label={tp.note.slice(0, 36)}
                        bg="oklch(0.42 0.18 25)" fg="#fff" />
                    </>}
                  </g>
                );
              })}
              {/* 洞察点：编号圆圈（全部），前 INLINE_MAX 个额外显示全文标签 */}
              {show('insight') && normInsightPoints.map((ip, i) => {
                const x = xFor(ip.t);
                const isInline = i < INLINE_MAX;
                const labelY = isInline ? IP_ROW_Y[ipSlots[i]] : 0;
                return (
                  <g key={`ip-${i}`}>
                    <line x1={x} y1={PAD.T} x2={x} y2={H - PAD.B}
                      stroke="var(--teal)" strokeWidth={1.2} strokeDasharray="4 3" opacity={0.45} />
                    {/* 编号圆圈（始终显示） */}
                    <circle cx={x} cy={H - PAD.B - 11} r={10} fill="oklch(0.32 0.10 200)" />
                    <text x={x} y={H - PAD.B - 7} fontFamily="var(--mono)" fontSize="10"
                      fill="#fff" textAnchor="middle" fontWeight="bold">{i + 1}</text>
                    {/* 全文标签（仅前 INLINE_MAX 个） */}
                    {isInline && ip.note && <>
                      {labelY < H - PAD.B - 24 && (
                        <line x1={x} y1={H - PAD.B - 22} x2={x} y2={labelY + 4}
                          stroke="var(--teal)" strokeWidth={0.7} strokeDasharray="2 3" opacity={0.4} />
                      )}
                      <SvgLabel x={x + 12} y={labelY} label={ip.note.slice(0, 36)}
                        bg="oklch(0.32 0.10 200)" fg="#fff" />
                    </>}
                  </g>
                );
              })}
              {/* sample tag 标注：slot 行错开，正 valence 上方，负 valence 下方 */}
              {aboveSamples.map(({ s, x }, j) => {
                if (!show('warm')) return null;
                const labelY = TAG_ROWS_ABOVE[aboveSlots[j]];
                const py = yForValence(Number(s.v ?? 0));
                return (
                  <g key={`atag-${j}`}>
                    <line x1={x} y1={py - 4} x2={x} y2={labelY + 4}
                      stroke="var(--line)" strokeWidth={0.7} strokeDasharray="2 2" />
                    <SvgLabel x={x} y={labelY} label={String(s.tag)}
                      bg="oklch(0.22 0.02 75)" fg="#e8e3da" anchor="middle" fs={9} />
                  </g>
                );
              })}
              {belowSamples.map(({ s, x }, j) => {
                if (!show('cool')) return null;
                const labelY = TAG_ROWS_BELOW[belowSlots[j]];
                const py = yForValence(Number(s.v ?? 0));
                return (
                  <g key={`btag-${j}`}>
                    <line x1={x} y1={py + 4} x2={x} y2={labelY - 12}
                      stroke="var(--line)" strokeWidth={0.7} strokeDasharray="2 2" />
                    <SvgLabel x={x} y={labelY} label={String(s.tag)}
                      bg="oklch(0.22 0.02 75)" fg="#e8e3da" anchor="middle" fs={9} />
                  </g>
                );
              })}
              {/* 峰值标注 */}
              {show('peak') && peakIdx >= 0 && (() => {
                const s = samples[peakIdx];
                const x = xFor(Number(s.t ?? 0));
                const y = yForValence(Number(s.v ?? 0));
                const tagText = peak?.tag ?? s.tag ?? `i=${Number(s.i ?? 0).toFixed(2)}`;
                return (
                  <g>
                    <circle cx={x} cy={y} r={9} fill="none" stroke="var(--accent)" strokeWidth={1.6} />
                    <SvgLabel x={x + 12} y={y - 5} label={`峰 · ${tagText}`}
                      bg="oklch(0.42 0.18 25)" fg="#fff" fs={11} />
                  </g>
                );
              })()}
            </svg>
          )}
        </div>
        {/* Legend — 点击切换显示/隐藏 */}
        <div style={{ display: 'flex', gap: 12, marginTop: 12, fontSize: 11, color: 'var(--ink-3)', flexWrap: 'wrap', alignItems: 'center' }}>
          {AFFECT_LAYERS.map((layer) => {
            const hidden = hiddenLayers.has(layer.id);
            return (
              <span
                key={layer.id}
                onClick={() => toggleLayer(layer.id)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  cursor: 'pointer', userSelect: 'none',
                  opacity: hidden ? 0.3 : 1,
                  textDecoration: hidden ? 'line-through' : undefined,
                  transition: 'opacity 0.15s',
                }}
              >
                {layer.icon}
                {layer.label}
              </span>
            );
          })}
          {hiddenLayers.size > 0 && (
            <span
              onClick={() => setHiddenLayers(new Set())}
              style={{ cursor: 'pointer', color: 'var(--teal)', fontSize: 10.5 }}
            >
              全部显示
            </span>
          )}
        </div>
      </div>
      <aside style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: 12,
      }}>
        {peak && (
          <div style={{
            background: 'var(--paper-2)', border: '1px solid var(--line-2)', borderRadius: 6,
            padding: '14px 16px',
          }}>
            <SectionLabel>峰值 · peak</SectionLabel>
            <div style={{ marginTop: 10, fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.7 }}>
              <div>valence <MonoMeta>{peak.valence.toFixed(2)}</MonoMeta></div>
              <div>intensity <MonoMeta>{peak.intensity.toFixed(2)}</MonoMeta></div>
              {peak.tag && (
                <div style={{
                  marginTop: 6, fontFamily: 'var(--serif)', fontSize: 13.5, color: 'var(--ink)',
                }}>「{peak.tag}」</div>
              )}
            </div>
          </div>
        )}
        {/* 张力峰全量列表 */}
        <div style={{
          background: 'var(--paper-2)', border: '1px solid var(--line-2)', borderRadius: 6,
          padding: '14px 16px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
            <SectionLabel>张力峰 · tension peaks</SectionLabel>
            <MonoMeta>{normTensionPeaks.length}</MonoMeta>
            {normTensionPeaks.length > INLINE_MAX && (
              <MonoMeta style={{ color: 'var(--ink-3)', fontSize: 9.5 }}>
                图内显示 {INLINE_MAX} 个
              </MonoMeta>
            )}
          </div>
          {normTensionPeaks.length === 0 ? (
            <div style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>暂无</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {normTensionPeaks.map((tp, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <div style={{
                    width: 18, height: 18, borderRadius: 99, flexShrink: 0, marginTop: 1,
                    background: 'oklch(0.42 0.18 25)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 10, fontFamily: 'var(--mono)', color: '#fff', fontWeight: 700,
                  }}>{i + 1}</div>
                  <div>
                    <MonoMeta style={{ fontSize: 10 }}>{Math.round(tp.t)}m</MonoMeta>
                    <div style={{ fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.55, marginTop: 2 }}>{tp.note}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        {/* 洞察点全量列表 */}
        <div style={{
          background: 'var(--paper-2)', border: '1px solid var(--line-2)', borderRadius: 6,
          padding: '14px 16px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
            <SectionLabel>洞察点 · insight points</SectionLabel>
            <MonoMeta>{normInsightPoints.length}</MonoMeta>
            {normInsightPoints.length > INLINE_MAX && (
              <MonoMeta style={{ color: 'var(--ink-3)', fontSize: 9.5 }}>
                图内显示 {INLINE_MAX} 个
              </MonoMeta>
            )}
          </div>
          {normInsightPoints.length === 0 ? (
            <div style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>暂无</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {normInsightPoints.map((ip, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <div style={{
                    width: 18, height: 18, borderRadius: 99, flexShrink: 0, marginTop: 1,
                    background: 'oklch(0.32 0.10 200)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 10, fontFamily: 'var(--mono)', color: '#fff', fontWeight: 700,
                  }}>{i + 1}</div>
                  <div>
                    <MonoMeta style={{ fontSize: 10 }}>{Math.round(ip.t)}m</MonoMeta>
                    <div style={{ fontSize: 12, color: 'oklch(0.28 0.08 200)', lineHeight: 1.55, marginTop: 2 }}>{ip.note}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        {!peak && normTensionPeaks.length === 0 && normInsightPoints.length === 0 && samples.length === 0 && (
          <div style={{ fontSize: 11.5, color: 'var(--ink-3)', textAlign: 'center', padding: '8px 0' }}>
            <MonoMeta>暂无 affect 数据</MonoMeta>
          </div>
        )}
      </aside>
    </div>
  );
}

export default VariantThreads;
