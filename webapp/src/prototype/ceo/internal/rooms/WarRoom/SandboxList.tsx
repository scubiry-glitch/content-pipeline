// War Room · ② 兵棋推演入口 (sandbox)
// stub — 完整 sandbox 子页待原型扩充 + LLM 集成

import { SANDBOX } from './_warRoomFixtures';

export function SandboxList() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {SANDBOX.map((s, i) => (
        <div
          key={i}
          style={{
            padding: '12px 14px',
            background: 'rgba(214,69,69,0.05)',
            border: '1px solid rgba(214,69,69,0.18)',
            borderRadius: 4,
            cursor: 'pointer',
            transition: 'all 250ms ease',
          }}
        >
          <div
            style={{
              fontFamily: 'var(--serif)',
              fontStyle: 'italic',
              fontSize: 13,
              color: '#F5D9D9',
              marginBottom: 8,
              lineHeight: 1.5,
            }}
          >
            {s.topic}
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              fontFamily: 'var(--mono)',
              fontSize: 10,
              color: 'rgba(245,217,217,0.6)',
            }}
          >
            <div
              style={{
                flex: 1,
                height: 4,
                background: 'rgba(0,0,0,0.3)',
                borderRadius: 99,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${s.pct}%`,
                  background: s.pct >= 70 ? '#C8A15C' : '#D64545',
                }}
              />
            </div>
            <span style={{ color: '#F5D9D9', fontWeight: 600 }}>{s.pct}%</span>
            <span>{s.branches} 条分支</span>
          </div>
        </div>
      ))}
      <div
        onClick={() => {
          const t = document.createElement('div');
          t.textContent = '📐 兵棋推演子页 · 待原型补齐 (见 docs/ceo-app-deferred.md)';
          t.style.cssText =
            'position:fixed;left:50%;bottom:40px;transform:translateX(-50%);background:#1A0E0E;color:#F5D9D9;border:1px solid #D64545;padding:10px 18px;border-radius:4px;font-family:var(--serif);font-style:italic;font-size:13px;z-index:9999;cursor:pointer';
          document.body.appendChild(t);
          setTimeout(() => t.remove(), 3000);
        }}
        style={{
          marginTop: 4,
          padding: '10px 14px',
          background: 'rgba(214,69,69,0.05)',
          border: '1px dashed rgba(214,69,69,0.3)',
          borderRadius: 4,
          fontFamily: 'var(--serif)',
          fontStyle: 'italic',
          fontSize: 11.5,
          color: 'rgba(245,217,217,0.55)',
          textAlign: 'center',
          cursor: 'pointer',
        }}
      >
        + 启动新推演 (子页待原型补齐 · 详见 docs/ceo-app-deferred.md)
      </div>
    </div>
  );
}
