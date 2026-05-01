// War Room 房间 · 团队战情 主壳
// 4 block (深红主题) - formation / sandbox / conflict thermo / formation analysis tabs
// 来源: 07-archive/会议纪要 (20260501)/war-room.html

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FormationMap } from './FormationMap';
import { SandboxList } from './SandboxList';
import { ConflictThermo } from './ConflictThermo';
import { FormationAnalysis } from './FormationAnalysis';
import { useGlobalScope, GlobalScopeFilter } from '../../../shared/GlobalScopeFilter';
import { buildScopeQuery } from '../../../_apiAdapters';

interface DashboardData {
  metric: { label: string; value: string; delta: string };
  formationHealth: number;
  conflictKinds: { build: number; destructive: number; silent: number; total: number };
  conflictTemp: number;
  verdict: string;
}

export function WarRoom() {
  const navigate = useNavigate();
  const [dash, setDash] = useState<DashboardData | null>(null);
  const { scopeIds } = useGlobalScope();
  const scopeKey = scopeIds.join(',');

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/v1/ceo/war-room/dashboard${buildScopeQuery(scopeIds)}`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setDash(d);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey]);

  return (
    <div
      style={{
        minHeight: '100%',
        background: '#1A0E0E',
        color: '#F5D9D9',
        fontFamily: 'var(--sans)',
      }}
    >
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '18px 36px',
          borderBottom: '1px solid rgba(214,69,69,0.22)',
          background: 'rgba(26,14,14,0.85)',
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
              border: '1.5px solid #D64545',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 20,
              background: 'rgba(214,69,69,0.06)',
              boxShadow: '0 0 18px rgba(214,69,69,0.2) inset',
            }}
          >
            ⚔️
          </div>
          <div>
            <h1
              style={{
                fontFamily: 'var(--serif)',
                fontStyle: 'italic',
                fontWeight: 600,
                fontSize: 22,
                margin: 0,
                color: '#F5D9D9',
              }}
            >
              War Room
            </h1>
            <div
              style={{
                fontFamily: 'var(--mono)',
                fontSize: 9.5,
                letterSpacing: '0.3em',
                color: '#D64545',
                textTransform: 'uppercase',
                marginTop: 2,
              }}
            >
              internal · 团队 · 战情
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
            color: 'rgba(245,217,217,0.7)',
            padding: '0 30px',
          }}
        >
          "团队健康吗? 有建设性冲突吗?"
          {dash && (
            <span
              style={{
                marginLeft: 12,
                fontFamily: 'var(--mono)',
                fontStyle: 'normal',
                fontSize: 11,
                padding: '3px 9px',
                background: 'rgba(214,69,69,0.18)',
                borderRadius: 99,
                color: '#FFB89A',
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
            color: 'rgba(245,217,217,0.7)',
            textTransform: 'uppercase',
            padding: '7px 14px',
            border: '1px solid rgba(214,69,69,0.4)',
            borderRadius: 3,
            background: 'rgba(214,69,69,0.05)',
            cursor: 'pointer',
          }}
        >
          ← 回到 CEO 主页
        </button>
      </header>

      <GlobalScopeFilter />

      <main
        style={{
          display: 'grid',
          gridTemplateColumns: '1.2fr 1fr',
          gap: 20,
          padding: '24px 36px 50px',
          maxWidth: 1480,
          margin: '0 auto',
        }}
      >
        <Block num="① formation" title="阵型图 · 作战桌俯视" meta="6 节点 · 5 类联结" tall>
          <FormationMap />
        </Block>

        <Block num="② sandbox" title="兵棋推演入口" meta="辅助决策 · 非预言">
          <SandboxList />
        </Block>

        <Block num="③ conflict temp" title="冲突温度计" meta="本月 · 4 周">
          <ConflictThermo
            total={dash?.conflictKinds.total}
            build={dash?.conflictKinds.build}
            destructive={dash?.conflictKinds.destructive}
            silent={dash?.conflictKinds.silent}
            verdict={dash?.verdict}
            temp={dash?.conflictTemp}
          />
        </Block>

        <Block num="④⑤ diagnose · spark" title="阵型分析" spanFull>
          <FormationAnalysis />
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
        border: '1px solid rgba(214,69,69,0.18)',
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
          borderBottom: '1px solid rgba(214,69,69,0.18)',
        }}
      >
        <span
          style={{
            fontFamily: 'var(--mono)',
            fontSize: 10,
            letterSpacing: '0.2em',
            color: '#D64545',
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
            color: '#F5D9D9',
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
              color: 'rgba(245,217,217,0.4)',
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

export default WarRoom;
