// Tower · ⑥ 节奏视图 (替换 RhythmsArchive)
// 来源: 07-archive/会议纪要 (20260501)/tower.html L572-649
// 双 tab: 团队节奏 7×24 heatmap / 个人节奏 折线 + 5 行 stat

import { useState } from 'react';
import { TeamHeatmap } from './TeamHeatmap';
import { PersonalRhythm } from './PersonalRhythm';

export function RhythmsTabs() {
  const [tab, setTab] = useState<'team' | 'self'>('team');

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        {(['team', 'self'] as const).map((id) => {
          const isActive = tab === id;
          const label = id === 'team' ? '👥 团队节奏' : '👤 个人节奏';
          return (
            <button
              key={id}
              onClick={() => setTab(id)}
              style={{
                padding: '7px 14px',
                border: `1px solid ${isActive ? '#5FA39E' : 'rgba(95,163,158,0.2)'}`,
                background: isActive ? 'rgba(95,163,158,0.12)' : 'transparent',
                color: isActive ? '#E8EFF2' : 'rgba(232,239,242,0.6)',
                fontFamily: 'var(--serif)',
                fontStyle: isActive ? 'normal' : 'italic',
                fontSize: 12.5,
                fontWeight: isActive ? 600 : 500,
                borderRadius: 4,
                cursor: 'pointer',
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {tab === 'team' && <TeamHeatmap />}
      {tab === 'self' && <PersonalRhythm />}
    </div>
  );
}
