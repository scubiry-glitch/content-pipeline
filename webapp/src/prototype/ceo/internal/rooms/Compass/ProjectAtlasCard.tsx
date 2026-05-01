// Compass · ④ Project Atlas 大入口卡
// 来源: 07-archive/会议纪要 (20260501)/compass.html .atlas-card block

import { ATLAS_STATS } from './_compassFixtures';

export function ProjectAtlasCard() {
  return (
    <a
      href="#project-atlas"
      onClick={(e) => {
        e.preventDefault();
        // PR4 阶段：暂时不跳转，仅 toast 提示
        const t = document.createElement('div');
        t.textContent = '🌌 Project Atlas — 子房间在 PR10 接入';
        t.style.cssText =
          'position:fixed;left:50%;bottom:40px;transform:translateX(-50%);background:#FAF7F0;color:#1A2E3D;border:1px solid #3E6E8C;padding:10px 18px;border-radius:4px;font-family:var(--serif);font-style:italic;font-size:13px;z-index:9999';
        document.body.appendChild(t);
        setTimeout(() => t.remove(), 2000);
      }}
      style={{
        gridColumn: '1 / -1',
        background:
          'linear-gradient(135deg, rgba(62,110,140,0.08) 0%, rgba(184,147,72,0.05) 100%)',
        border: '1px solid #3E6E8C',
        borderRadius: 6,
        padding: '28px 32px',
        display: 'grid',
        gridTemplateColumns: '1fr auto',
        gap: 30,
        alignItems: 'center',
        textDecoration: 'none',
        color: '#1A2E3D',
      }}
    >
      <div>
        <div
          style={{
            fontFamily: 'var(--mono)',
            fontSize: 10,
            color: '#3E6E8C',
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
          }}
        >
          → 项目侧切片 · sub-room
        </div>
        <div
          style={{
            fontFamily: 'var(--serif)',
            fontStyle: 'italic',
            fontSize: 22,
            fontWeight: 600,
            margin: '6px 0 8px',
          }}
        >
          进入 Project Atlas · 项目阿特拉斯
        </div>
        <div
          style={{
            fontSize: 13,
            color: 'rgba(26,46,61,0.62)',
            lineHeight: 1.6,
            marginBottom: 14,
            maxWidth: 560,
          }}
        >
          从"方向"切到"项目":每个项目作为星体,看哪个最危险、哪个该停、哪个该加注。
          星图 / 濒危看板 / 里程碑长河 / 决策回声 / 张力网格 / 救活 vs 安乐死。
        </div>
        <div style={{ display: 'flex', gap: 24 }}>
          {[
            { v: ATLAS_STATS.active, k: '活跃项目', color: '#3E6E8C' },
            { v: ATLAS_STATS.danger, k: '危险', color: '#B05A4A' },
            { v: ATLAS_STATS.warn, k: '预警', color: '#B89348' },
            { v: ATLAS_STATS.healthy, k: '健康', color: '#6A9A5C' },
          ].map((s) => (
            <div key={s.k} style={{ textAlign: 'left' }}>
              <span
                style={{
                  fontFamily: 'var(--serif)',
                  fontSize: 28,
                  fontWeight: 600,
                  color: s.color,
                }}
              >
                {s.v}
              </span>
              <span
                style={{
                  fontFamily: 'var(--mono)',
                  fontSize: 10,
                  color: 'rgba(26,46,61,0.4)',
                  letterSpacing: '0.15em',
                  textTransform: 'uppercase',
                  marginLeft: 8,
                }}
              >
                {s.k}
              </span>
            </div>
          ))}
        </div>
      </div>
      <div
        style={{
          fontSize: 64,
          color: '#3E6E8C',
          opacity: 0.4,
          fontFamily: 'var(--serif)',
        }}
      >
        →
      </div>
    </a>
  );
}
