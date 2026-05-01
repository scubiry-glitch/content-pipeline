// Situation · ③ Rubric 矩阵
// 来源: 07-archive/会议纪要 (20260501)/situation.html .rubric-table

import { RUBRIC_DIMS, RUBRIC_ROWS } from './_situationFixtures';

function scoreClass(s: number): { bg: string; ink: string } {
  if (s >= 7.5) return { bg: 'rgba(95,163,158,0.5)', ink: '#A5DDD7' };
  if (s >= 6) return { bg: 'rgba(196,155,77,0.5)', ink: '#FFE7BA' };
  return { bg: 'rgba(196,106,80,0.5)', ink: '#FFB89A' };
}

export function RubricMatrix() {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th
              style={{
                textAlign: 'left',
                padding: '8px 10px',
                fontFamily: 'var(--mono)',
                fontSize: 10,
                color: 'rgba(253,243,212,0.5)',
                letterSpacing: '0.15em',
                textTransform: 'uppercase',
                borderBottom: '1px solid rgba(255,200,87,0.18)',
                width: '20%',
              }}
            >
              利益方
            </th>
            {RUBRIC_DIMS.map((d, i) => (
              <th
                key={i}
                style={{
                  textAlign: 'center',
                  padding: '8px 6px',
                  fontFamily: 'var(--mono)',
                  fontSize: 9.5,
                  color: '#FFC857',
                  letterSpacing: '0.1em',
                  borderBottom: '1px solid rgba(255,200,87,0.18)',
                }}
              >
                {d}
              </th>
            ))}
            <th
              style={{
                textAlign: 'right',
                padding: '8px 10px',
                fontFamily: 'var(--mono)',
                fontSize: 10,
                color: 'rgba(253,243,212,0.5)',
                letterSpacing: '0.15em',
                textTransform: 'uppercase',
                borderBottom: '1px solid rgba(255,200,87,0.18)',
                width: '8%',
              }}
            >
              均分
            </th>
          </tr>
        </thead>
        <tbody>
          {RUBRIC_ROWS.map((r, i) => {
            const avg = r.scores.reduce((a, b) => a + b, 0) / r.scores.length;
            return (
              <tr key={i}>
                <td
                  style={{
                    padding: '10px 10px',
                    fontSize: 12.5,
                    color: '#FDF3D4',
                    borderBottom: '1px solid rgba(255,200,87,0.08)',
                  }}
                >
                  <div style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontWeight: 600 }}>
                    {r.who}
                  </div>
                  <div
                    style={{
                      fontSize: 10,
                      color: 'rgba(253,243,212,0.5)',
                      marginTop: 2,
                    }}
                  >
                    {r.sub}
                  </div>
                </td>
                {r.scores.map((s, j) => {
                  const cls = scoreClass(s);
                  return (
                    <td
                      key={j}
                      style={{
                        padding: '6px 6px',
                        textAlign: 'center',
                        borderBottom: '1px solid rgba(255,200,87,0.08)',
                      }}
                    >
                      <div
                        style={{
                          fontFamily: 'var(--mono)',
                          fontSize: 11,
                          color: cls.ink,
                          fontWeight: 600,
                          marginBottom: 3,
                        }}
                      >
                        {s.toFixed(1)}
                      </div>
                      <div
                        style={{
                          height: 3,
                          background: 'rgba(0,0,0,0.3)',
                          borderRadius: 99,
                          overflow: 'hidden',
                        }}
                      >
                        <i
                          style={{
                            display: 'block',
                            height: '100%',
                            width: `${s * 10}%`,
                            background: cls.bg,
                          }}
                        />
                      </div>
                    </td>
                  );
                })}
                <td
                  style={{
                    padding: '10px 10px',
                    textAlign: 'right',
                    fontFamily: 'var(--serif)',
                    fontStyle: 'italic',
                    fontSize: 16,
                    fontWeight: 600,
                    color: scoreClass(avg).ink,
                    borderBottom: '1px solid rgba(255,200,87,0.08)',
                  }}
                >
                  {avg.toFixed(1)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
