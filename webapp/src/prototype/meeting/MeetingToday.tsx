// Today — 「今天」入口页（骨架阶段）
// 原型来源：/tmp/mn-proto/main-shell.jsx TodayPane

import { Placeholder } from './_placeholder';
import { RECENT_MEETINGS } from './_fixtures';
import { MonoMeta } from './_atoms';

export function MeetingToday() {
  return (
    <Placeholder
      title="今天，值得关注"
      subtitle="首页：最近 run · 新判断 · 至风险 · 开放问题 · 承诺到期提示"
      protoSrc="main-shell.jsx · TodayPane"
      phase={7}
      preview={
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 720 }}>
          {RECENT_MEETINGS.slice(0, 3).map((m) => (
            <div key={m.id} style={{
              background: 'var(--paper)', border: '1px solid var(--line-2)',
              borderRadius: 6, padding: '12px 16px',
              display: 'grid', gridTemplateColumns: '100px 1fr 160px', gap: 12, alignItems: 'center',
            }}>
              <MonoMeta>{m.date}</MonoMeta>
              <div style={{ fontFamily: 'var(--serif)', fontSize: 14, fontWeight: 500 }}>{m.title}</div>
              <div style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>{m.n}</div>
            </div>
          ))}
        </div>
      }
    />
  );
}

export default MeetingToday;
