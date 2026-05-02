// PersonLLMProfileModal — AxisPeople · manage tab "AI 画像" 按钮的浮层
//
// 调 POST /people/:id/llm-profile 把该人物的全部历史轨迹（承诺/角色/发言/沉默/偏差
// + 原文片段）丢给 LLM，生成 markdown 画像。结果可选 persist 到 mn_people.metadata。

import { useEffect, useState } from 'react';
import { meetingNotesApi } from '../../api/meetingNotes';
import { Icon } from './_atoms';

type Sources = {
  meetings: number;
  commitments: number;
  roleTrajectory: number;
  speechRows: number;
  silenceRows: number;
  biases: number;
  segments: number;
  scopeId: string | null;
};

type Result = {
  content: string;
  model: string;
  generatedAt: string;
  sources: Sources;
  promptChars: number;
  usage: { inputTokens?: number; outputTokens?: number } | null;
};

export function PersonLLMProfileModal({
  personId,
  personName,
  scopeId,
  onClose,
}: {
  personId: string;
  personName: string;
  scopeId?: string;
  onClose: () => void;
}) {
  const [state, setState] = useState<'idle' | 'loading' | 'ok' | 'err'>('loading');
  const [result, setResult] = useState<Result | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [persisting, setPersisting] = useState(false);
  const [persisted, setPersisted] = useState(false);

  async function run(persist: boolean) {
    if (persist) setPersisting(true);
    else { setState('loading'); setErrMsg(null); }
    try {
      const r = await meetingNotesApi.generatePersonLLMProfile(personId, { scopeId, persist });
      setResult(r);
      setState('ok');
      if (persist) setPersisted(true);
    } catch (e: any) {
      const code = (e as { code?: string }).code;
      const msg = code === 'NO_HISTORY'
        ? '该人物没有任何关联会议轨迹，无法生成画像。'
        : code === 'LLM_UNAVAILABLE'
        ? `LLM 不可达：${e.message ?? ''}`
        : e?.message ?? String(e);
      setErrMsg(msg);
      setState('err');
    } finally {
      setPersisting(false);
    }
  }

  useEffect(() => {
    run(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personId, scopeId]);

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 80,
        background: 'rgba(30, 28, 26, 0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'var(--sans)',
      }}
    >
      <div style={{
        width: 'min(780px, 94vw)', maxHeight: '88vh',
        background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 8,
        boxShadow: '0 28px 64px -10px rgba(0,0,0,0.3)',
        display: 'flex', flexDirection: 'column', position: 'relative',
      }}>
        <button onClick={onClose} title="关闭" style={{
          position: 'absolute', top: 12, right: 14,
          border: '1px solid var(--line)', background: 'var(--paper)', borderRadius: 4,
          width: 26, height: 26, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--ink-2)',
        }}>
          <Icon name="x" size={12} />
        </button>

        <div style={{ padding: '20px 24px 12px' }}>
          <div style={{
            fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-3)',
            textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 4,
          }}>AI 人物画像 · LLM Profile</div>
          <h2 style={{
            fontFamily: 'var(--serif)', fontSize: 22, fontWeight: 600, margin: 0,
            letterSpacing: '-0.005em',
          }}>{personName}</h2>
          <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 6, lineHeight: 1.5 }}>
            把该人物在历史会议中的承诺 / 角色 / 发言质量 / 沉默信号 / 认知偏差 + 原文片段全部丢给 LLM，生成结构化画像。
          </div>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '8px 24px 16px' }}>
          {state === 'loading' && (
            <div style={{ padding: 28, color: 'var(--ink-3)', fontSize: 13 }}>
              收集原料 + LLM 生成中…（可能 10-30 秒）
            </div>
          )}
          {state === 'err' && (
            <div style={{
              padding: '14px 16px', borderRadius: 5,
              background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca',
              fontSize: 12.5, lineHeight: 1.5,
            }}>
              {errMsg}
              <div style={{ marginTop: 10 }}>
                <button onClick={() => run(false)} style={{
                  padding: '6px 12px', border: '1px solid #fecaca', background: '#fff',
                  color: '#991b1b', borderRadius: 4, fontSize: 12, cursor: 'pointer',
                }}>重试</button>
              </div>
            </div>
          )}
          {state === 'ok' && result && (
            <>
              <div style={{
                marginBottom: 12, padding: '8px 12px',
                background: 'var(--paper-2)', borderRadius: 4,
                fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--ink-3)',
                display: 'flex', flexWrap: 'wrap', gap: 14,
              }}>
                <span>model: {result.model}</span>
                <span>prompt: {result.promptChars} 字</span>
                <span>会议: {result.sources.meetings}</span>
                <span>承诺: {result.sources.commitments}</span>
                <span>角色: {result.sources.roleTrajectory}</span>
                <span>发言: {result.sources.speechRows}</span>
                <span>原文段: {result.sources.segments}</span>
                {result.usage && (
                  <span>tokens: {result.usage.inputTokens ?? '?'}↓/{result.usage.outputTokens ?? '?'}↑</span>
                )}
              </div>
              <pre style={{
                margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                fontFamily: 'var(--serif)', fontSize: 14, lineHeight: 1.7,
                color: 'var(--ink)', background: 'transparent',
              }}>{result.content}</pre>
            </>
          )}
        </div>

        <div style={{
          padding: '12px 24px 16px', borderTop: '1px solid var(--line-2)',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          {state === 'ok' && result && (
            <>
              <button
                onClick={() => run(true)}
                disabled={persisting || persisted}
                title="把当前画像写到 mn_people.metadata.llm_profile"
                style={{
                  padding: '7px 14px', borderRadius: 4, fontSize: 12,
                  border: '1px solid var(--line)', cursor: persisting || persisted ? 'default' : 'pointer',
                  background: persisted ? 'var(--paper-3)' : 'var(--paper)',
                  color: persisted ? 'var(--ink-3)' : 'var(--ink)',
                }}
              >{persisted ? '✓ 已保存到人物 metadata' : persisting ? '保存中…' : '保存到人物 metadata'}</button>
              <button
                onClick={() => run(false)}
                style={{
                  padding: '7px 14px', borderRadius: 4, fontSize: 12,
                  border: '1px solid var(--line)', background: 'var(--paper)',
                  color: 'var(--ink-2)', cursor: 'pointer',
                }}
              >重新生成</button>
            </>
          )}
          <span style={{ flex: 1 }} />
          <button onClick={onClose} style={{
            padding: '7px 14px', borderRadius: 4, fontSize: 12,
            border: '1px solid var(--line)', background: 'var(--paper)', color: 'var(--ink-2)',
            cursor: 'pointer',
          }}>关闭</button>
        </div>
      </div>
    </div>
  );
}

export default PersonLLMProfileModal;
