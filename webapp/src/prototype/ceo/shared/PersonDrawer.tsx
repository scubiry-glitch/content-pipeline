// PersonDrawer · 全局右侧人物抽屉
// 由 PersonDrawerProvider 触发，显示 mn_people 详情 + 承诺 + 发言质量 + (D 阶段加 agent 区块)

import { useEffect, useState } from 'react';
import { usePersonDrawer } from './PersonDrawerProvider';

interface Person {
  id: string;
  canonical_name: string;
  aliases: string[];
  role: string | null;
  org: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

interface Commitment {
  id: string;
  person_id: string;
  meeting_id: string;
  text: string;
  due_at: string | null;
  state: string;
  progress: number | null;
  created_at: string;
}

interface SpeechSummary {
  speech: { avg_entropy: number | null; total_followed_up: number | null; meeting_count: number | null } | null;
  silence: { spoke: number | null; normal_silence: number | null; abnormal_silence: number | null; absent: number | null } | null;
}

const STATE_TONE: Record<string, string> = {
  on_track: '#5FA39E',
  at_risk: '#C49B4D',
  done: '#6A9A5C',
  slipped: '#C46A50',
};

export function PersonDrawer() {
  const { openPersonId, close } = usePersonDrawer();
  const [person, setPerson] = useState<Person | null>(null);
  const [commitments, setCommitments] = useState<Commitment[]>([]);
  const [speech, setSpeech] = useState<SpeechSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!openPersonId) {
      setPerson(null);
      setCommitments([]);
      setSpeech(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);

    const [kind, val] = openPersonId.split(':');
    const resolveId = async (): Promise<string | null> => {
      if (kind === 'id') return val;
      // by name → 调 /scopes/library/people 模糊查；简化：fallback 先 fetch 全员然后 client 过滤
      try {
        const res = await fetch(`/api/v1/meeting-notes/scopes/library/people`).catch(() => null);
        if (!res || !res.ok) return null;
        const data = (await res.json()) as { items: Array<{ id: string; canonical_name: string; aliases?: string[] }> };
        const match = data.items.find(
          (p) => p.canonical_name === val || (p.aliases ?? []).includes(val),
        );
        return match?.id ?? null;
      } catch {
        return null;
      }
    };

    (async () => {
      const id = await resolveId();
      if (cancelled) return;
      if (!id) {
        setError(`未找到人物: ${val}`);
        setLoading(false);
        return;
      }
      try {
        const [pRes, cRes, sRes] = await Promise.all([
          fetch(`/api/v1/meeting-notes/people/${id}`).then((r) => (r.ok ? r.json() : null)),
          fetch(`/api/v1/meeting-notes/people/${id}/commitments?limit=10`).then((r) =>
            r.ok ? r.json() : { items: [] },
          ),
          fetch(`/api/v1/meeting-notes/people/${id}/speech-summary`).then((r) =>
            r.ok ? r.json() : null,
          ),
        ]);
        if (cancelled) return;
        if (!pRes) {
          setError('人物详情加载失败');
        } else {
          setPerson(pRes);
          setCommitments(cRes.items ?? []);
          setSpeech(sRes);
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [openPersonId]);

  if (!openPersonId) return null;

  return (
    <>
      {/* 遮罩 */}
      <div
        onClick={close}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.4)',
          zIndex: 998,
        }}
      />
      {/* 抽屉 */}
      <aside
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: 480,
          background: '#0F0E15',
          borderLeft: '1px solid rgba(217,184,142,0.3)',
          color: '#F3ECDD',
          fontFamily: 'var(--sans)',
          padding: '24px 28px',
          overflowY: 'auto',
          zIndex: 999,
          boxShadow: '-12px 0 30px rgba(0,0,0,0.4)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <span
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 10,
              color: '#D9B88E',
              letterSpacing: '0.25em',
              textTransform: 'uppercase',
            }}
          >
            Person Drawer · mn_people
          </span>
          <button
            onClick={close}
            style={{
              background: 'transparent',
              border: '1px solid rgba(217,184,142,0.3)',
              color: 'rgba(232,227,216,0.7)',
              padding: '4px 10px',
              borderRadius: 4,
              cursor: 'pointer',
              fontFamily: 'var(--mono)',
              fontSize: 11,
            }}
          >
            ✕ 关闭
          </button>
        </div>

        {loading && (
          <div style={{ fontStyle: 'italic', color: 'rgba(232,227,216,0.5)', fontSize: 13 }}>加载…</div>
        )}
        {error && (
          <div
            style={{
              padding: '10px 12px',
              background: 'rgba(196,106,80,0.12)',
              border: '1px solid rgba(196,106,80,0.4)',
              borderLeft: '3px solid #C46A50',
              color: '#FFB89A',
              fontSize: 12.5,
              borderRadius: 4,
            }}
          >
            {error}
          </div>
        )}

        {person && (
          <>
            <h2
              style={{
                fontFamily: 'var(--serif)',
                fontStyle: 'italic',
                fontSize: 28,
                fontWeight: 600,
                margin: '0 0 6px',
                color: '#F3ECDD',
              }}
            >
              {person.canonical_name}
            </h2>
            <div
              style={{
                fontFamily: 'var(--mono)',
                fontSize: 11,
                color: 'rgba(232,227,216,0.55)',
                marginBottom: 16,
                letterSpacing: 0.2,
              }}
            >
              {person.role ?? '—'}
              {person.org && ` · ${person.org}`}
              {person.aliases?.length > 0 && ` · 别名 ${person.aliases.join(' / ')}`}
            </div>

            {speech && (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, 1fr)',
                  gap: 10,
                  marginBottom: 18,
                }}
              >
                <Stat label="平均发言熵" value={speech.speech?.avg_entropy != null ? `${Number(speech.speech.avg_entropy).toFixed(0)}%` : '—'} sub="近 90 天" />
                <Stat label="被跟进次数" value={`${speech.speech?.total_followed_up ?? 0}`} sub={`${speech.speech?.meeting_count ?? 0} 场会议`} />
                <Stat
                  label="正常发言"
                  value={`${speech.silence?.spoke ?? 0}`}
                  sub="vs 异常沉默"
                  tone="#5FA39E"
                />
                <Stat
                  label="异常沉默"
                  value={`${speech.silence?.abnormal_silence ?? 0}`}
                  sub="值得关注"
                  tone={(speech.silence?.abnormal_silence ?? 0) > 0 ? '#C46A50' : 'rgba(232,227,216,0.6)'}
                />
              </div>
            )}

            <div
              style={{
                fontFamily: 'var(--mono)',
                fontSize: 10,
                color: '#D9B88E',
                letterSpacing: '0.2em',
                textTransform: 'uppercase',
                marginBottom: 8,
              }}
            >
              承诺 · {commitments.length} 条 (近 30 条)
            </div>
            {commitments.length === 0 ? (
              <div style={{ fontSize: 12, color: 'rgba(232,227,216,0.5)', fontStyle: 'italic', padding: '12px 0' }}>
                无承诺记录
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {commitments.map((c) => {
                  const tone = STATE_TONE[c.state] ?? 'rgba(232,227,216,0.5)';
                  return (
                    <div
                      key={c.id}
                      style={{
                        padding: '8px 12px',
                        background: 'rgba(217,184,142,0.04)',
                        border: '1px solid rgba(217,184,142,0.18)',
                        borderLeft: `3px solid ${tone}`,
                        borderRadius: '0 4px 4px 0',
                      }}
                    >
                      <div
                        style={{
                          fontFamily: 'var(--serif)',
                          fontStyle: 'italic',
                          fontSize: 13,
                          color: '#F3ECDD',
                          lineHeight: 1.5,
                          marginBottom: 4,
                        }}
                      >
                        {c.text}
                      </div>
                      <div
                        style={{
                          display: 'flex',
                          gap: 10,
                          fontFamily: 'var(--mono)',
                          fontSize: 9.5,
                          color: 'rgba(232,227,216,0.55)',
                        }}
                      >
                        <span style={{ color: tone, fontWeight: 600 }}>{c.state}</span>
                        {c.due_at && <span>截止 {new Date(c.due_at).toLocaleDateString('zh-CN')}</span>}
                        {c.progress != null && <span>{Number(c.progress).toFixed(0)}%</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div
              style={{
                marginTop: 24,
                padding: '14px 16px',
                background: 'rgba(217,184,142,0.05)',
                border: '1px dashed rgba(217,184,142,0.25)',
                borderRadius: 4,
                color: 'rgba(232,227,216,0.55)',
                fontStyle: 'italic',
                fontSize: 12,
                lineHeight: 1.6,
              }}
            >
              🤖 调用为 agent · 待 R2-3 接入 ceo_person_agent_links + expert-library /invoke
            </div>
          </>
        )}
      </aside>
    </>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div
      style={{
        padding: '8px 12px',
        background: 'rgba(217,184,142,0.04)',
        border: '1px solid rgba(217,184,142,0.15)',
        borderRadius: 4,
      }}
    >
      <div
        style={{
          fontFamily: 'var(--mono)',
          fontSize: 9,
          color: 'rgba(232,227,216,0.5)',
          letterSpacing: 0.3,
          textTransform: 'uppercase',
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: 'var(--serif)',
          fontStyle: 'italic',
          fontSize: 18,
          fontWeight: 600,
          color: tone ?? '#F3ECDD',
          marginTop: 2,
        }}
      >
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 9.5, color: 'rgba(232,227,216,0.45)', marginTop: 1 }}>{sub}</div>
      )}
    </div>
  );
}
