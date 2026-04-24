// Library — 会议纪要库（骨架阶段）
// 原型来源：/tmp/mn-proto/library.jsx Library / FolderNode / MeetingCard / PreviewPanel

import { Placeholder } from './_placeholder';
import { SCOPES, RECENT_MEETINGS } from './_fixtures';
import { MonoMeta } from './_atoms';

export function Library() {
  return (
    <Placeholder
      title="会议纪要库"
      subtitle="按 project / client / topic 三种分组切换 · 文件夹树 + 会议卡 + 右侧 PreviewPanel"
      protoSrc="library.jsx"
      phase={4}
      preview={
        <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr 280px', gap: 12, maxWidth: 1040 }}>
          <div style={{ background: 'var(--paper)', border: '1px solid var(--line-2)', borderRadius: 8, padding: 12 }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-4)', marginBottom: 6 }}>PROJECT</div>
            {SCOPES.project.map((s) => (
              <div key={s.id} style={{ fontSize: 12.5, padding: '4px 0', color: 'var(--ink-2)' }}>📁 {s.name} <MonoMeta>({s.n})</MonoMeta></div>
            ))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {RECENT_MEETINGS.slice(0, 2).map((m) => (
              <div key={m.id} style={{ background: 'var(--paper)', border: '1px solid var(--line-2)', borderRadius: 8, padding: '10px 14px' }}>
                <MonoMeta>{m.date}</MonoMeta>
                <div style={{ fontFamily: 'var(--serif)', fontSize: 14, marginTop: 3 }}>{m.title}</div>
              </div>
            ))}
          </div>
          <div style={{ background: 'var(--paper)', border: '1px dashed var(--line)', borderRadius: 8, padding: 12, fontSize: 12, color: 'var(--ink-3)' }}>
            PreviewPanel · 选中会议的元数据 / 标签 / 状态
          </div>
        </div>
      }
    />
  );
}

export default Library;
