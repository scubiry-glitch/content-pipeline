// MeetingToday — 「今天」入口页
// 原型来源：/tmp/mn-proto/main-shell.jsx TodayPane
// API：listRuns({ limit: 10 }) + listMeetings({ limit: 5 })（成功 un-mock；失败降级）

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon, Dot, MonoMeta, MockBadge } from './_atoms';
import { meetingNotesApi } from '../../api/meetingNotes';

// ── Mock data (fallback) ─────────────────────────────────────

interface TodayItem {
  kind: 'new' | 'due' | 'drift';
  title: string;
  sub: string;
  meta: string;
  to: string;
}

const MOCK_ITEMS: TodayItem[] = [
  {
    kind: 'new',
    title: '昨晚的「2026 Q2 AI 基础设施策略评审」已完成解析',
    sub: '标记出 3 条张力 · 3 条信念更新 · 2 条分歧 · 14 个 warm intro 数据点',
    meta: 'M-2026-04-11 · 118 分钟 · 3 experts · 98 秒完成',
    to: '/meeting/M-2026-04-11-0237/a',
  },
  {
    kind: 'due',
    title: 'AS-04 「LP 对 6000 万不会反弹」今天需要验证',
    sub: '证据等级 D · 置信度 0.55 · 关联决策 D-07（3 天前刚作出）',
    meta: '负责：陈汀 · 已逾期 0 天',
    to: '/meeting/axes/projects',
  },
  {
    kind: 'drift',
    title: 'Wei Tan 的「训练层规模效应」信念 14 天内出现明显松动',
    sub: '从 0.78 降至 0.56 · 触发点：沈岚展示的客户报价曲线',
    meta: '6 次会议的纵向观察 · 建议下次会议定向追问',
    to: '/meeting/longitudinal',
  },
];

const kindColor = { new: 'var(--accent)', due: 'var(--amber)', drift: 'var(--teal)' } as const;
const kindLabel = { new: 'New · 新解析', due: 'Due · 待验证', drift: 'Drift · 信念漂移' } as const;

// ── 将最近完成的 run + meeting 映射为 "New" 卡片 ────────────

interface ApiMeeting { id?: string; title?: string; duration?: string | number; participants?: number; }
interface ApiRun { id?: string; state?: string; axis?: string; finishedAt?: string; meetingId?: string; }

function runToItem(run: ApiRun, meetings: ApiMeeting[]): TodayItem | null {
  if (!run.id) return null;
  const m = run.meetingId ? meetings.find((x) => x.id === run.meetingId) : null;
  return {
    kind: 'new',
    title: m?.title ? `「${m.title}」已完成解析` : `${run.axis ?? '未知轴'} · ${run.id} 已完成`,
    sub: `run ${run.id} · axis ${run.axis ?? '-'} · state ${run.state ?? '-'}`,
    meta: `${run.finishedAt ?? ''}${m?.duration ? ` · ${m.duration}` : ''}`,
    to: m?.id ? `/meeting/${m.id}/a` : `/meeting/generation-center?run=${run.id}`,
  };
}

// ── Main export ──────────────────────────────────────────────

export function MeetingToday() {
  const navigate = useNavigate();
  const [items, setItems] = useState<TodayItem[]>(MOCK_ITEMS);
  const [isMock, setIsMock] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([
      meetingNotesApi.listRuns({ limit: 10, state: 'done' }),
      meetingNotesApi.listMeetings({ limit: 5 }),
    ]).then(([rRuns, rMeetings]) => {
      if (cancelled) return;
      const runs: ApiRun[] = rRuns.status === 'fulfilled' ? (rRuns.value.items ?? []) : [];
      const meetings: ApiMeeting[] = rMeetings.status === 'fulfilled' ? (rMeetings.value.items ?? []) : [];
      if (runs.length === 0 && meetings.length === 0) return;  // 保留 mock
      const apiItems = runs.slice(0, 3).map((r) => runToItem(r, meetings)).filter((x): x is TodayItem => !!x);
      if (apiItems.length > 0) {
        setItems(apiItems);
        setIsMock(false);
      }
    });
    return () => { cancelled = true; };
  }, []);

  return (
    <div style={{ padding: '40px 48px 60px', maxWidth: 1100 }}>
      <div style={{
        display: 'flex', alignItems: 'baseline', gap: 10, fontFamily: 'var(--mono)', fontSize: 11,
        color: 'var(--ink-3)', letterSpacing: '0.14em', textTransform: 'uppercase',
      }}>
        <span>2026 · 04 · 11 · 星期六 · 09:42</span>
        {isMock && <MockBadge />}
      </div>
      <h1 style={{
        fontFamily: 'var(--serif)', fontSize: 40, fontWeight: 500,
        letterSpacing: '-0.02em', margin: '8px 0 28px', lineHeight: 1.12,
      }}>
        今天，{items.length} 件事值得你的注意。
      </h1>

      {items.map((it, i) => (
        <article key={i} onClick={() => navigate(it.to)} style={{
          background: 'var(--paper-2)', border: '1px solid var(--line-2)',
          borderLeft: `2px solid ${kindColor[it.kind]}`,
          borderRadius: 4, padding: '22px 26px', marginBottom: 12,
          display: 'grid', gridTemplateColumns: '1fr auto', gap: 20, alignItems: 'center',
          cursor: 'pointer',
        }}>
          <div>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8,
              fontFamily: 'var(--mono)', fontSize: 10.5, letterSpacing: 0.3, color: 'var(--ink-3)',
              textTransform: 'uppercase',
            }}>
              <Dot color={kindColor[it.kind]} />
              {kindLabel[it.kind]}
            </div>
            <h2 style={{ fontFamily: 'var(--serif)', fontSize: 20, fontWeight: 600, margin: '0 0 8px', letterSpacing: '-0.005em' }}>
              {it.title}
            </h2>
            <p style={{ fontSize: 13.5, color: 'var(--ink-2)', margin: '0 0 8px', lineHeight: 1.55 }}>{it.sub}</p>
            <MonoMeta>{it.meta}</MonoMeta>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); navigate(it.to); }}
            style={{
              padding: '8px 14px', border: '1px solid var(--line)', background: 'var(--paper)',
              borderRadius: 5, cursor: 'pointer', fontSize: 12.5, color: 'var(--ink)',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
            打开 <Icon name="arrow" size={12} />
          </button>
        </article>
      ))}

      <div style={{ marginTop: 32, padding: '20px 22px', background: 'var(--paper-2)', border: '1px solid var(--line-2)', borderRadius: 6 }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>近期待跟进 · 承诺 + 验证点</span>
          <MockBadge />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          {[
            { l: '待验证承诺', v: '5', sub: '本周到期 2 条',   c: 'var(--amber)',  to: '/meeting/axes/people' },
            { l: '开放问题',   v: '8', sub: '3 条超 2 周未决', c: 'var(--accent)', to: '/meeting/axes/projects' },
            { l: '新入库判断', v: '4', sub: '本周新增',         c: 'var(--teal)',   to: '/meeting/axes/knowledge' },
          ].map(s => (
            <div key={s.l} onClick={() => navigate(s.to)} style={{
              padding: '14px 16px', background: 'var(--paper)', border: '1px solid var(--line-2)', borderRadius: 5,
              cursor: 'pointer',
            }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 9.5, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: 0.3 }}>{s.l}</div>
              <div style={{ fontFamily: 'var(--serif)', fontSize: 28, fontWeight: 600, color: s.c, letterSpacing: '-0.01em', margin: '4px 0 2px' }}>{s.v}</div>
              <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>{s.sub}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default MeetingToday;
