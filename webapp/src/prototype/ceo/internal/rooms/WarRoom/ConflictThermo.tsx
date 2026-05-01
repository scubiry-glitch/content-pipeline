// War Room · ③ 冲突温度计
// 来源: 07-archive/会议纪要 (20260501)/war-room.html .thermo-row

import { CONFLICT } from './_warRoomFixtures';

interface Props {
  total?: number;
  build?: number;
  destructive?: number;
  silent?: number;
  verdict?: string;
  /** 温度 = build / total */
  temp?: number;
}

export function ConflictThermo(props: Props = {}) {
  const total = props.total ?? CONFLICT.total;
  const build = props.build ?? CONFLICT.build;
  const destructive = props.destructive ?? CONFLICT.destructive;
  const silent = props.silent ?? CONFLICT.silent;
  const verdict = props.verdict ?? CONFLICT.verdict;
  const temp = props.temp ?? (total > 0 ? build / total : 0);
  const pct = Math.round(temp * 100);

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 18 }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
        <div
          style={{
            width: 22,
            height: 160,
            position: 'relative',
            background: 'linear-gradient(180deg, rgba(214,69,69,0.18) 0%, rgba(160,150,140,0.18) 100%)',
            borderRadius: 99,
            border: '1px solid rgba(214,69,69,0.3)',
          }}
        >
          <div
            style={{
              position: 'absolute',
              left: -4,
              right: -4,
              bottom: `${pct}%`,
              height: 5,
              background: '#D64545',
              borderRadius: 2,
              boxShadow: '0 0 10px rgba(214,69,69,0.6)',
            }}
          />
        </div>
        <div
          style={{
            width: 36,
            height: 36,
            background: '#D64545',
            borderRadius: '50%',
            marginTop: -4,
            boxShadow: '0 0 18px rgba(214,69,69,0.5)',
          }}
        />
        <div
          style={{
            fontFamily: 'var(--mono)',
            fontSize: 10,
            color: '#D64545',
            marginTop: 6,
            fontWeight: 600,
          }}
        >
          {pct}°
        </div>
      </div>

      <div style={{ flex: 1, fontSize: 12.5, color: 'rgba(245,217,217,0.85)', lineHeight: 1.6 }}>
        本月发生 <b style={{ color: '#F5D9D9', fontSize: 14 }}>{total} 次</b> 实质性分歧:
        <ul style={{ margin: '6px 0 0 18px', padding: 0, lineHeight: 1.85 }}>
          <li>
            <b style={{ color: '#C8A15C' }}>建设性</b> {build} 次 (在议题上交锋,逻辑推进)
          </li>
          <li>
            <span style={{ color: '#FFB89A' }}>破坏性</span> {destructive} 次 (情绪化 / 离题 / 否决式)
          </li>
          <li>
            <span style={{ color: 'rgba(245,217,217,0.5)' }}>沉默回避</span> {silent} 次
          </li>
        </ul>
        <div
          style={{
            marginTop: 10,
            padding: '8px 12px',
            background: 'rgba(200,161,92,0.08)',
            borderLeft: '2px solid #C8A15C',
            fontFamily: 'var(--serif)',
            fontStyle: 'italic',
            color: '#FFE7BA',
          }}
        >
          {verdict}
        </div>
        <svg viewBox="0 0 200 36" style={{ width: '100%', height: 36, marginTop: 10 }}>
          <polyline
            points="0,28 25,22 50,18 75,24 100,16 125,12 150,18 175,14 200,10"
            fill="none"
            stroke="#C8A15C"
            strokeWidth="1.5"
          />
          <polyline
            points="0,28 25,22 50,18 75,24 100,16 125,12 150,18 175,14 200,10"
            fill="none"
            stroke="#C8A15C"
            strokeWidth="3"
            opacity="0.2"
          />
        </svg>
      </div>
    </div>
  );
}
