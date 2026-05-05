// SharedMeetingPage — /meeting/shared/:token 公开只读视图
// 无需登录，凭 share_token 读取会议摘要 (A 视图结构化数据)

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { meetingNotesApi } from '../../api/meetingNotes';
import { useAuth } from '../../contexts/AuthContext';
import { ImportConfirm, importErrorMessage } from './ImportConfirm';
import './_tokens.css';

export function SharedMeetingPage() {
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const { user, currentWorkspace } = useAuth();
  const [state, setState] = useState<'loading' | 'ok' | 'expired' | 'error'>('loading');
  const [data, setData] = useState<any>(null);
  const [showImport, setShowImport] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) { setState('error'); return; }
    meetingNotesApi.getSharedMeeting(token)
      .then((res) => { setData(res); setState('ok'); })
      .catch((r) => {
        if (r?.status === 410) setState('expired');
        else setState('error');
      });
  }, [token]);

  const onImport = async () => {
    if (importing) return;
    setImporting(true);
    setImportError(null);
    try {
      const r = await meetingNotesApi.importSharedMeeting(token);
      navigate(`/meeting/${r.meetingId}/a`);
    } catch (e: any) {
      setImportError(importErrorMessage(e));
      setImporting(false);
    }
  };

  if (state === 'loading') {
    return (
      <div style={centerStyle}>
        <p style={{ color: 'var(--ink-3)', fontFamily: 'var(--mono)', fontSize: 13 }}>加载中…</p>
      </div>
    );
  }

  if (state === 'expired') {
    return (
      <div style={centerStyle}>
        <p style={{ color: 'var(--ink-3)', fontFamily: 'var(--serif)', fontSize: 15 }}>此分享链接已过期</p>
      </div>
    );
  }

  if (state === 'error' || !data?.meeting) {
    return (
      <div style={centerStyle}>
        <p style={{ color: 'var(--ink-3)', fontFamily: 'var(--serif)', fontSize: 15 }}>链接无效或会议已删除</p>
      </div>
    );
  }

  // getMeetingDetail returns { view, meetingId, title, date, participants, sections, ... }
  const m = data.meeting;
  const title = m.title ?? '会议纪要';
  const date = m.date ? String(m.date).slice(0, 10) : '';
  const participants: any[] = m.participants ?? [];

  // Find sections by id
  const minutesSection = (m.sections ?? []).find((s: any) => s.id === 'minutes');
  const body = minutesSection?.body ?? {};
  const tldr: string = body.tldr ?? body.scqa?.answer ?? '';
  const scqa = body.scqa ?? null;
  const actionItems: any[] = body.actionItems ?? [];
  const decision: string = body.decision ?? '';
  const risks: string[] = body.risks ?? [];

  // People id→name map
  const personName = (id: string) => {
    const p = participants.find((x: any) => x.id === id);
    return p?.name ?? id.slice(0, 8);
  };

  return (
    <div className="meeting-proto" style={{ minHeight: '100vh', background: 'var(--paper)' }}>
      <header style={{
        padding: '16px 32px',
        borderBottom: '1px solid var(--line-2)',
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <span style={{ fontFamily: 'var(--serif)', fontWeight: 700, fontSize: 18, color: 'var(--ink)' }}>
          {title}
        </span>
        {date && (
          <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-3)' }}>{date}</span>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{
            fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-3)',
            padding: '2px 8px', borderRadius: 4, border: '1px solid var(--line-2)',
          }}>
            只读分享
          </span>
          {user && (
            <button
              onClick={() => setShowImport(true)}
              title={currentWorkspace ? `复制到工作区:${currentWorkspace.name}` : '需要先选择一个工作区'}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '5px 12px', borderRadius: 6, cursor: 'pointer',
                border: '1px solid var(--line)', background: 'var(--paper-2)', color: 'var(--ink)',
                fontFamily: 'var(--sans)', fontSize: 12.5, fontWeight: 500,
              }}
            >
              📥 添加到我的工作区
            </button>
          )}
          <button
            onClick={() => navigate(`/meeting/shared/${token}/detail`)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '5px 14px', borderRadius: 6, cursor: 'pointer',
              border: '1px solid var(--ink)', background: 'var(--ink)', color: 'var(--paper)',
              fontFamily: 'var(--sans)', fontSize: 12.5, fontWeight: 600,
            }}
          >
            查看详情
          </button>
        </div>
      </header>

      {showImport && (
        <ImportConfirm
          targetWorkspaceName={currentWorkspace?.name ?? '当前工作区'}
          meetingTitle={title}
          importing={importing}
          error={importError}
          onCancel={() => { setShowImport(false); setImportError(null); }}
          onConfirm={onImport}
        />
      )}

      <main style={{ maxWidth: 760, margin: '32px auto', padding: '0 24px' }}>

        {tldr && (
          <Section title="摘要">
            <p style={{ lineHeight: 1.75, color: 'var(--ink)', fontFamily: 'var(--serif)', fontSize: 14, margin: 0 }}>
              {tldr}
            </p>
          </Section>
        )}

        {scqa && (scqa.situation || scqa.complication || scqa.question || scqa.answer) && (
          <Section title="SCQA 结构">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {[
                { k: '情境 S', v: scqa.situation },
                { k: '冲突 C', v: scqa.complication },
                { k: '问题 Q', v: scqa.question },
                { k: '答案 A', v: scqa.answer },
              ].filter((x) => x.v).map(({ k, v }) => (
                <div key={k} style={{
                  padding: '10px 12px', borderRadius: 7,
                  background: 'var(--paper-2)', border: '1px solid var(--line-2)',
                }}>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-3)', marginBottom: 4 }}>{k}</div>
                  <div style={{ fontFamily: 'var(--serif)', fontSize: 13, lineHeight: 1.65, color: 'var(--ink)' }}>{v}</div>
                </div>
              ))}
            </div>
          </Section>
        )}

        {decision && (
          <Section title="决策">
            <p style={{ lineHeight: 1.65, fontFamily: 'var(--serif)', fontSize: 14, margin: 0, color: 'var(--ink)' }}>
              {decision}
            </p>
          </Section>
        )}

        {actionItems.length > 0 && (
          <Section title="行动项">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {actionItems.map((a: any) => (
                <div key={a.id} style={{
                  display: 'flex', alignItems: 'baseline', gap: 10,
                  padding: '8px 12px', borderRadius: 7,
                  background: 'var(--paper-2)', border: '1px solid var(--line-2)',
                }}>
                  <span style={{ fontFamily: 'var(--serif)', fontSize: 13.5, color: 'var(--ink)', flex: 1, lineHeight: 1.6 }}>
                    {a.what ?? a.action ?? '—'}
                  </span>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--ink-3)', whiteSpace: 'nowrap' }}>
                    {a.who ? personName(a.who) : ''}
                    {a.due ? ` · ${String(a.due).slice(0, 10)}` : ''}
                  </span>
                </div>
              ))}
            </div>
          </Section>
        )}

        {risks.length > 0 && (
          <Section title="风险">
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {risks.map((r: string, i: number) => (
                <li key={i} style={{ fontFamily: 'var(--serif)', fontSize: 13.5, lineHeight: 1.65, marginBottom: 5, color: 'var(--ink)' }}>
                  {r}
                </li>
              ))}
            </ul>
          </Section>
        )}

        {participants.filter((p: any) => p.role !== 'meta').length > 0 && (
          <Section title="参会人">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {participants.filter((p: any) => p.role !== 'meta').map((p: any) => (
                <span key={p.id} style={{
                  fontFamily: 'var(--sans)', fontSize: 12,
                  padding: '3px 10px', borderRadius: 99,
                  background: 'var(--paper-2)', border: '1px solid var(--line-2)',
                  color: 'var(--ink-2)',
                }}>
                  {p.name}
                  {p.role && <span style={{ opacity: 0.55, marginLeft: 4 }}>· {p.role}</span>}
                </span>
              ))}
            </div>
          </Section>
        )}

        {/* S1 协作提示 — 仅登录用户可见 */}
        {user && (
          <div style={{
            marginTop: 36, padding: '10px 14px', borderRadius: 6,
            background: 'var(--paper-2)', border: '1px dashed var(--line-2)',
            fontFamily: 'var(--serif)', fontSize: 12.5, lineHeight: 1.65, color: 'var(--ink-3)',
          }}>
            💡 想跟原作者一起协作编辑这场会议?让对方在 ta 的工作区设置里把你 (
            <span style={{ fontFamily: 'var(--mono)', fontSize: 11.5 }}>{user.email}</span>
            ) 加为成员,切到 ta 的工作区即可直接编辑原版。导入是另一种选择 — 复制一份独立加工。
          </div>
        )}

      </main>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <h3 style={{
        fontFamily: 'var(--sans)', fontSize: 11, fontWeight: 600,
        letterSpacing: '0.12em', textTransform: 'uppercase',
        color: 'var(--ink-3)', marginBottom: 10, margin: '0 0 10px',
      }}>
        {title}
      </h3>
      {children}
    </div>
  );
}

const centerStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  minHeight: '100vh',
};

export default SharedMeetingPage;
