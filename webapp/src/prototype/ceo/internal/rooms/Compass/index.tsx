// Compass 房间 · 方向罗盘 主壳
// 7 个 block 网格布局
// 来源: 07-archive/会议纪要 (20260501)/compass.html

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ceoApi } from '../../../_apiAdapters';
import { Astrolabe } from './Astrolabe';
import { TimePie } from './TimePie';
import { DriftRadar } from './DriftRadar';
import { ProjectAtlasCard } from './ProjectAtlasCard';
import { StrategicEchoSankey } from './StrategicEchoSankey';
import { OnePagerPaper } from './OnePagerPaper';
import { ArchivesTabs } from './ArchivesTabs';

export function Compass() {
  const navigate = useNavigate();
  const [alignment, setAlignment] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    ceoApi.compass
      .dashboard()
      .then((d) => {
        if (!cancelled) {
          setAlignment(d.alignmentScore);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div
      style={{
        minHeight: '100%',
        background: '#F4F1EC',
        color: '#1A2E3D',
        position: 'relative',
        fontFamily: 'var(--sans)',
      }}
    >
      <div
        style={{
          position: 'fixed',
          inset: 0,
          pointerEvents: 'none',
          zIndex: 1,
          backgroundImage:
            'radial-gradient(circle at 20% 10%, rgba(123,167,196,0.1), transparent 50%), radial-gradient(circle at 80% 90%, rgba(184,147,72,0.06), transparent 50%)',
        }}
      />

      {/* topbar */}
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '18px 36px',
          borderBottom: '1px solid #D8CFBF',
          background: 'rgba(250,247,240,0.7)',
          position: 'relative',
          zIndex: 5,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div
            style={{
              width: 42,
              height: 42,
              borderRadius: '50%',
              border: '1.5px solid #3E6E8C',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 20,
              background: '#fff',
              boxShadow: '0 0 18px rgba(62,110,140,0.15) inset',
            }}
          >
            🧭
          </div>
          <div>
            <h1
              style={{
                fontFamily: 'var(--serif)',
                fontStyle: 'italic',
                fontWeight: 600,
                fontSize: 22,
                margin: 0,
                letterSpacing: '-0.005em',
              }}
            >
              Compass
            </h1>
            <div
              style={{
                fontFamily: 'var(--mono)',
                fontSize: 9.5,
                letterSpacing: '0.3em',
                color: '#3E6E8C',
                textTransform: 'uppercase',
                marginTop: 2,
              }}
            >
              internal · 方向 · 罗盘
            </div>
          </div>
        </div>

        <div
          style={{
            flex: 1,
            textAlign: 'center',
            fontFamily: 'var(--serif)',
            fontStyle: 'italic',
            fontSize: 14.5,
            color: 'rgba(26,46,61,0.62)',
            padding: '0 30px',
          }}
        >
          "我把时间花在战略主线上了吗 ?"
          {!loading && alignment != null && (
            <span
              style={{
                marginLeft: 12,
                fontFamily: 'var(--mono)',
                fontStyle: 'normal',
                fontSize: 11,
                padding: '3px 9px',
                background: 'rgba(62,110,140,0.1)',
                borderRadius: 99,
                color: '#3E6E8C',
              }}
            >
              对齐度 {alignment.toFixed(2)}
            </span>
          )}
        </div>

        <button
          onClick={() => navigate('/ceo/internal/ceo')}
          style={{
            fontFamily: 'var(--mono)',
            fontSize: 11,
            letterSpacing: '0.18em',
            color: 'rgba(26,46,61,0.62)',
            textTransform: 'uppercase',
            padding: '7px 14px',
            border: '1px solid #C8BCA8',
            borderRadius: 3,
            background: '#fff',
            cursor: 'pointer',
          }}
        >
          ← 回到 CEO 主页
        </button>
      </header>

      {/* main grid */}
      <main
        style={{
          position: 'relative',
          zIndex: 2,
          display: 'grid',
          gridTemplateColumns: '1.3fr 1fr',
          gap: 20,
          padding: '24px 36px 50px',
          maxWidth: 1480,
          margin: '0 auto',
        }}
      >
        {/* ① 战略星盘 */}
        <Block num="① astrolabe" title="战略星盘 · 主线 / 支线 / 漂移" meta="指针 = 本周注意力实际朝向" tall>
          <Astrolabe />
          <Legend />
        </Block>

        {/* ② 时间分配饼 */}
        <Block num="② time pie" title="时间分配 · 战略主线 vs 救火" meta="本周 · 38h 实测">
          <TimePie />
        </Block>

        {/* ③ 漂移雷达 */}
        <Block num="③ drift radar" title="本周漂移 · 偏离了哪些主线" meta="基于 belief-drift 轴">
          <DriftRadar />
        </Block>

        {/* ④ Project Atlas */}
        <ProjectAtlasCard />

        {/* ⑤ 战略回响 Sankey — 接 ceo_strategic_echos 真数据 */}
        <Block num="⑤ strategic echo" title="战略回响 · 假设 ↔ 现实" meta="hypothesis ↔ fact ↔ fate" spanFull>
          <StrategicEchoSankey />
        </Block>

        {/* ⑥ 一页纸摘要 — 接 ceo_briefs 最新一份 */}
        <Block num="⑥ one-pager" title="一页纸摘要" meta="ceo_briefs latest">
          <OnePagerPaper />
        </Block>

        {/* ⑦ Archives — 接 ceo_briefs 历史版本 */}
        <Block num="⑦ archives" title="历史档案" meta="按 board session" spanFull>
          <ArchivesTabs />
        </Block>
      </main>
    </div>
  );
}

interface BlockProps {
  num: string;
  title: string;
  meta?: string;
  tall?: boolean;
  spanFull?: boolean;
  children: React.ReactNode;
}

function Block({ num, title, meta, tall, spanFull, children }: BlockProps) {
  return (
    <section
      style={{
        background: '#FAF7F0',
        border: '1px solid #D8CFBF',
        borderRadius: 4,
        padding: '22px 24px',
        gridRow: tall ? 'span 2' : undefined,
        gridColumn: spanFull ? '1 / -1' : undefined,
        minHeight: tall ? 580 : undefined,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 12,
          marginBottom: 14,
          paddingBottom: 10,
          borderBottom: '1px solid #D8CFBF',
        }}
      >
        <span
          style={{
            fontFamily: 'var(--mono)',
            fontSize: 10,
            letterSpacing: '0.2em',
            color: '#B89348',
            textTransform: 'uppercase',
          }}
        >
          {num}
        </span>
        <span
          style={{
            fontFamily: 'var(--serif)',
            fontStyle: 'italic',
            fontSize: 18,
            fontWeight: 600,
            color: '#1A2E3D',
            flex: 1,
          }}
        >
          {title}
        </span>
        {meta && (
          <span
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 10,
              color: 'rgba(26,46,61,0.4)',
              letterSpacing: '0.1em',
            }}
          >
            {meta}
          </span>
        )}
      </div>
      {children}
    </section>
  );
}

function Legend() {
  return (
    <div
      style={{
        display: 'flex',
        gap: 18,
        marginTop: 14,
        flexWrap: 'wrap',
        fontFamily: 'var(--mono)',
        fontSize: 10,
        color: 'rgba(26,46,61,0.62)',
      }}
    >
      <div>
        <span
          style={{
            display: 'inline-block',
            width: 10,
            height: 10,
            borderRadius: '50%',
            background: '#3E6E8C',
            marginRight: 6,
          }}
        />
        主线项目 (N 极)
      </div>
      <div>
        <span
          style={{
            display: 'inline-block',
            width: 10,
            height: 10,
            borderRadius: '50%',
            background: '#B89348',
            marginRight: 6,
          }}
        />
        支线 (E/W)
      </div>
      <div>
        <span
          style={{
            display: 'inline-block',
            width: 10,
            height: 10,
            borderRadius: '50%',
            background: 'rgba(176,90,74,0.5)',
            border: '1px dashed #B05A4A',
            marginRight: 6,
          }}
        />
        漂移 (S 极)
      </div>
    </div>
  );
}

export default Compass;
