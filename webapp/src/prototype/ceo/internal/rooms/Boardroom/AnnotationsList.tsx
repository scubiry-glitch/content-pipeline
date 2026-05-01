// Boardroom · ③ 外脑批注摘要
// 来源: 07-archive/会议纪要 (20260501)/boardroom.html .annot-list
// R2-4: 顶部加 "+ 新建专家" 入口 → CreateExpertModal

import { useState } from 'react';
import { ANNOTATIONS } from './_boardroomFixtures';
import { CreateExpertModal } from './CreateExpertModal';

export function AnnotationsList() {
  const [modalOpen, setModalOpen] = useState(false);
  const [createdExpertIds, setCreatedExpertIds] = useState<string[]>([]);
  return (
    <div>
      <CreateExpertModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={(id) => setCreatedExpertIds((arr) => [...arr, id])}
      />
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 10,
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
          {createdExpertIds.length > 0 ? `已新建 ${createdExpertIds.length} 个专家` : 'fixture · 3 条批注'}
        </span>
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
          + 新建专家
        </button>
      </div>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {ANNOTATIONS.map((a, i) => (
        <div
          key={i}
          style={{
            padding: '10px 12px',
            background: 'rgba(212,168,75,0.05)',
            border: '1px solid rgba(212,168,75,0.18)',
            borderLeft: '3px solid #D4A84B',
            borderRadius: '0 3px 3px 0',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              marginBottom: 4,
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
                color: 'rgba(212,168,75,0.7)',
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
        </div>
      ))}
    </div>
    </div>
  );
}
