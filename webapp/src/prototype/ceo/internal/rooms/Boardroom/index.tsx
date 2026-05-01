// Boardroom 房间 · 董事会厅 主壳
// 6 个 block 网格布局 (暗色金线主题)

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ConcernsRadar } from './ConcernsRadar';
import { PrebriefDraft } from './PrebriefDraft';
import { AnnotationsList } from './AnnotationsList';
import { PromiseTable } from './PromiseTable';
import { VersionsTabs } from './VersionsTabs';
import { RebuttalRehearsal } from './RebuttalRehearsal';
import { ScopePicker, useSelectedScopes } from '../../../shared/ScopePicker';

interface DashboardData {
  metric: { label: string; value: string; delta: string };
  forwardPct: number;
}

export function Boardroom() {
  const navigate = useNavigate();
  const [dash, setDash] = useState<DashboardData | null>(null);
  const scopeIds = useSelectedScopes();
  const scopesQuery = scopeIds.length > 0 ? `?scopes=${scopeIds.join(',')}` : '';

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/v1/ceo/boardroom/dashboard${scopesQuery}`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setDash(d);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [scopesQuery]);

  return (
    <div
      style={{
        minHeight: '100%',
        background: '#1A1410',
        color: '#F0E8D6',
        position: 'relative',
        fontFamily: 'var(--sans)',
      }}
    >
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '18px 36px',
          borderBottom: '1px solid rgba(212,168,75,0.18)',
          background: 'rgba(26,20,16,0.85)',
          position: 'sticky',
          top: 0,
          zIndex: 5,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div
            style={{
              width: 42,
              height: 42,
              borderRadius: '50%',
              border: '1.5px solid #D4A84B',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 20,
              background: 'rgba(212,168,75,0.06)',
              boxShadow: '0 0 18px rgba(212,168,75,0.18) inset',
            }}
          >
            🏛️
          </div>
          <div>
            <h1
              style={{
                fontFamily: 'var(--serif)',
                fontStyle: 'italic',
                fontWeight: 600,
                fontSize: 22,
                margin: 0,
                color: '#F0E8D6',
              }}
            >
              Boardroom
            </h1>
            <div
              style={{
                fontFamily: 'var(--mono)',
                fontSize: 9.5,
                letterSpacing: '0.3em',
                color: '#D4A84B',
                textTransform: 'uppercase',
                marginTop: 2,
              }}
            >
              internal · 董事会 · 厅
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
            color: 'rgba(240,232,214,0.7)',
            padding: '0 30px',
          }}
        >
          "下次董事会我要带什么 ?"
          {dash && (
            <span
              style={{
                marginLeft: 12,
                fontFamily: 'var(--mono)',
                fontStyle: 'normal',
                fontSize: 11,
                padding: '3px 9px',
                background: 'rgba(212,168,75,0.15)',
                borderRadius: 99,
                color: '#D4A84B',
              }}
            >
              {dash.metric?.label ?? ''} {dash.metric?.value ?? ''}
            </span>
          )}
        </div>

        <button
          onClick={() => navigate('/ceo/internal/ceo')}
          style={{
            fontFamily: 'var(--mono)',
            fontSize: 11,
            letterSpacing: '0.18em',
            color: 'rgba(240,232,214,0.7)',
            textTransform: 'uppercase',
            padding: '7px 14px',
            border: '1px solid rgba(212,168,75,0.4)',
            borderRadius: 3,
            background: 'rgba(212,168,75,0.05)',
            cursor: 'pointer',
          }}
        >
          ← 回到 CEO 主页
        </button>
      </header>

      <main
        style={{
          display: 'grid',
          gridTemplateColumns: '1.3fr 1fr',
          gap: 20,
          padding: '24px 36px 50px',
          maxWidth: 1480,
          margin: '0 auto',
        }}
      >
        <Block
          num="◐ scope filter"
          title="勾选 scope · 项目 / 客户 / 主题"
          meta="多选 intersection · URL 持久化"
          spanFull
        >
          <ScopePicker />
        </Block>

        <Block num="① concerns radar" title="董事关切雷达 · 每位董事最近 3 次提的问题" meta="5 位董事 · 滚动 90 天" tall>
          <ConcernsRadar />
        </Block>

        <Block num="② pre-brief draft" title="预读包草稿" meta="自 4 周 readings">
          <PrebriefDraft />
        </Block>

        <Block num="③ external annotations" title="外脑批注摘要" meta="3 条新批注">
          <AnnotationsList />
        </Block>

        <Block num="④ promise tracking" title="上次董事会承诺 · 追踪" meta="BOARD #13 · 6 项" spanFull>
          <PromiseTable />
        </Block>

        <Block
          num="⑤ rebuttal rehearsal"
          title="反对论点演练 · 三个最尖锐的攻击"
          meta="基于关切雷达 + 棱镜推演 · g3 LLM"
          spanFull
        >
          <RebuttalRehearsal />
        </Block>

        <Block num="⑥ versions" title="两个版本" meta="ceo_briefs latest" spanFull>
          <VersionsTabs />
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
        background: 'rgba(0,0,0,0.25)',
        border: '1px solid rgba(212,168,75,0.18)',
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
          borderBottom: '1px solid rgba(212,168,75,0.18)',
        }}
      >
        <span
          style={{
            fontFamily: 'var(--mono)',
            fontSize: 10,
            letterSpacing: '0.2em',
            color: '#D4A84B',
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
            color: '#F0E8D6',
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
              color: 'rgba(240,232,214,0.4)',
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

function Placeholder({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: '20px 18px',
        background: 'rgba(212,168,75,0.05)',
        border: '1px dashed rgba(212,168,75,0.3)',
        borderRadius: 4,
        fontFamily: 'var(--serif)',
        fontStyle: 'italic',
        fontSize: 13,
        color: 'rgba(240,232,214,0.6)',
        lineHeight: 1.7,
      }}
    >
      {children}
    </div>
  );
}

export default Boardroom;
