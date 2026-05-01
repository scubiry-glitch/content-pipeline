// Boardroom · ④ 上次董事会承诺追踪
// 来源: 07-archive/会议纪要 (20260501)/boardroom.html .promise-table

import { PROMISES, type PromiseRow } from './_boardroomFixtures';

const STATUS_STYLES: Record<PromiseRow['status'], { bg: string; ink: string; border: string }> = {
  late: { bg: 'rgba(168,69,30,0.18)', ink: '#FFB89A', border: 'rgba(168,69,30,0.5)' },
  in_progress: { bg: 'rgba(212,168,75,0.18)', ink: '#F3D27A', border: 'rgba(212,168,75,0.5)' },
  done: { bg: 'rgba(106,154,92,0.2)', ink: '#A6CC9A', border: 'rgba(106,154,92,0.5)' },
};

interface Props {
  promises?: PromiseRow[];
}

export function PromiseTable({ promises = PROMISES }: Props) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr>
          {['承诺', '责任人', '状态'].map((h, i) => (
            <th
              key={i}
              style={{
                textAlign: 'left',
                fontFamily: 'var(--mono)',
                fontSize: 10,
                color: 'rgba(240,232,214,0.45)',
                letterSpacing: '0.15em',
                textTransform: 'uppercase',
                padding: '8px 10px',
                borderBottom: '1px solid rgba(212,168,75,0.15)',
              }}
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {promises.map((p, i) => {
          const s = STATUS_STYLES[p.status];
          return (
            <tr key={i}>
              <td
                style={{
                  padding: '10px 10px',
                  fontSize: 13,
                  color: '#F0E8D6',
                  fontFamily: 'var(--serif)',
                  borderBottom: '1px solid rgba(212,168,75,0.08)',
                }}
              >
                {p.what}
              </td>
              <td
                style={{
                  padding: '10px 10px',
                  fontSize: 12,
                  color: 'rgba(240,232,214,0.7)',
                  borderBottom: '1px solid rgba(212,168,75,0.08)',
                }}
              >
                {p.owner}
              </td>
              <td
                style={{
                  padding: '10px 10px',
                  borderBottom: '1px solid rgba(212,168,75,0.08)',
                }}
              >
                <span
                  style={{
                    fontFamily: 'var(--mono)',
                    fontSize: 10.5,
                    padding: '3px 9px',
                    background: s.bg,
                    color: s.ink,
                    border: `1px solid ${s.border}`,
                    borderRadius: 99,
                    letterSpacing: 0.3,
                  }}
                >
                  {p.statusText}
                </span>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
