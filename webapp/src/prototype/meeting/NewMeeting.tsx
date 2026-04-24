// NewMeeting — 新建会议纪要向导（骨架阶段）
// 原型来源：/tmp/mn-proto/strategy-panel.jsx FlowUpload / FlowExperts / FlowProcessing / FlowMultiView

import { Placeholder } from './_placeholder';
import { PRESETS } from './_fixtures';
import { MonoMeta } from './_atoms';

export function NewMeeting() {
  return (
    <Placeholder
      title="新建会议纪要"
      subtitle="3 步向导：Upload → Experts → Processing → Multi-view"
      protoSrc="strategy-panel.jsx · Flow*"
      phase={5}
      preview={
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center', fontFamily: 'var(--sans)' }}>
            {['① 上传', '② 选专家', '③ 处理中', '④ 多维视图'].map((s, i) => (
              <div key={i} style={{
                padding: '6px 12px', borderRadius: 999, fontSize: 12,
                background: i < 2 ? 'var(--accent-soft)' : 'var(--paper-2)',
                color: i < 2 ? 'oklch(0.35 0.1 40)' : 'var(--ink-3)',
                border: '1px solid var(--line-2)',
              }}>
                {s}
              </div>
            ))}
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--ink-3)', lineHeight: 1.7 }}>
            预设：{PRESETS.map((p) => `${p.label} (${p.cost})`).join(' · ')}
          </div>
          <MonoMeta>现版旧页 /meeting-notes/new 已实现 3 步主流程；本 /meeting/new 将按原型还原度重抄一遍。</MonoMeta>
        </div>
      }
    />
  );
}

export default NewMeeting;
