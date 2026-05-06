// PersonLLMProfileModal — AxisPeople · manage tab "AI 画像" 按钮的浮层
//
// 调 POST /people/:id/llm-profile 把该人物的全部历史轨迹（承诺/角色/发言/沉默/偏差
// + 原文片段）丢给 LLM，生成 markdown 画像。结果可选 persist 到 mn_people.metadata。

import { useEffect, useRef, useState } from 'react';
import { meetingNotesApi } from '../../api/meetingNotes';
import { EXPERT_DOMAINS } from '../../config/expertDomains';
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
  model: string | null;
  generatedAt: string | null;
  sources: Sources | null;
  promptChars: number | null;
  usage: { inputTokens?: number; outputTokens?: number } | null;
  /** true=来自 mn_people.metadata 缓存，false=本次现场生成 */
  fromCache: boolean;
  /** 自 generatedAt 之后又参与了多少场新会议（仅 fromCache=true 有效） */
  meetingsSinceCache?: number | null;
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

  // 写入专家库相关：domain + level 用户手选，提升准确率
  const [exportDomainCode, setExportDomainCode] = useState<string>('S');
  const [exportLevel, setExportLevel] = useState<'senior' | 'domain'>('senior');
  // phase: idle = 未开始 / previewing = 正在 dry-run / preview = preview 已就绪等用户确认 / confirming = 正在真写 / done = 写入完成
  type ExportPhase = 'idle' | 'previewing' | 'preview' | 'confirming' | 'done';
  const [exportPhase, setExportPhase] = useState<ExportPhase>('idle');
  const [exportPreview, setExportPreview] = useState<{
    willOverwrite: boolean;
    existing: { expert_id: string; name: string; domain: string[] | null; updated_at: string } | null;
    preview: {
      expert_id: string; name: string; domain: string[];
      persona: any; method: any;
      emm: { critical_factors: string[]; factor_hierarchy: Record<string, number>; veto_rules: string[] };
      output_schema: { format: string; sections: any[]; rubrics: { dimension: string; levels: any[] }[] };
      signature_phrases: string[]; anti_patterns: string[];
      display_metadata: any;
    };
    domainName: string;
  } | null>(null);
  const [exported, setExported] = useState<{ expert_id: string; domainName: string; level: string; wasOverwrite: boolean } | null>(null);
  const [exportErr, setExportErr] = useState<string | null>(null);

  function exportErrMsg(e: any) {
    const code = (e as { code?: string }).code;
    return code === 'NO_PROFILE' ? '请先点"保存到人物 metadata"再导入。'
      : code === 'NO_JSON_BLOCK' ? '画像里没有结构化 JSON 区块，请点"重新生成"再试。'
      : code === 'JSON_PARSE_FAIL' ? `LLM 生成的 JSON 不合法：${e?.message ?? ''}`
      : e?.message ?? String(e);
  }

  async function previewExport() {
    setExportPhase('previewing');
    setExportErr(null);
    try {
      const r = await meetingNotesApi.importPersonAsExpert(personId, {
        domainCode: exportDomainCode,
        level: exportLevel,
        dryRun: true,
      });
      if (r.dryRun === false) {
        // 不该走到这里（我们传的是 dryRun:true），保险一下
        setExported({ expert_id: r.expert_id, domainName: r.domainName, level: r.level, wasOverwrite: r.wasOverwrite });
        setExportPhase('done');
        return;
      }
      setExportPreview({
        willOverwrite: r.willOverwrite,
        existing: r.existing ? {
          expert_id: r.existing.expert_id, name: r.existing.name,
          domain: r.existing.domain, updated_at: r.existing.updated_at,
        } : null,
        preview: r.preview,
        domainName: r.domainName,
      });
      setExportPhase('preview');
    } catch (e: any) {
      setExportErr(exportErrMsg(e));
      setExportPhase('idle');
    }
  }

  async function confirmExport() {
    setExportPhase('confirming');
    setExportErr(null);
    try {
      const r = await meetingNotesApi.importPersonAsExpert(personId, {
        domainCode: exportDomainCode,
        level: exportLevel,
      });
      if (r.dryRun === true) return; // 不会发生
      setExported({ expert_id: r.expert_id, domainName: r.domainName, level: r.level, wasOverwrite: r.wasOverwrite });
      setExportPhase('done');
    } catch (e: any) {
      setExportErr(exportErrMsg(e));
      setExportPhase('preview');
    }
  }

  function cancelExportPreview() {
    setExportPreview(null);
    setExportPhase('idle');
  }

  async function generate(persist: boolean) {
    if (persist) setPersisting(true);
    else { setState('loading'); setErrMsg(null); setPersisted(false); }
    try {
      const r = await meetingNotesApi.generatePersonLLMProfile(personId, { scopeId, persist });
      setResult({ ...r, fromCache: false });
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

  // React 18 StrictMode 在 dev 下会 mount → unmount → mount 双跑 effect。
  // 上一版只用 cancelled 标志能跳过重复 setState，但 fetch 已经发出去，
  // 后端会真的跑两遍 LLM（10-30 秒 + 双倍 token）。
  // 这里用 ref 锁住 (personId|scopeId) 这个键：同一个键的第二次 effect 直接 return。
  const inflightKeyRef = useRef<string | null>(null);
  useEffect(() => {
    const key = `${personId}|${scopeId ?? ''}`;
    if (inflightKeyRef.current === key) return;
    inflightKeyRef.current = key;

    let cancelled = false;
    (async () => {
      setState('loading');
      setErrMsg(null);
      try {
        const cached = await meetingNotesApi.getPersonLLMProfile(personId);
        if (cancelled) return;
        if (cached.cached) {
          setResult({
            content: cached.content,
            model: cached.model,
            generatedAt: cached.generatedAt,
            sources: cached.sources,
            promptChars: null,
            usage: null,
            fromCache: true,
            meetingsSinceCache: cached.meetingsSinceCache,
          });
          setState('ok');
          setPersisted(true);
          return;
        }
      } catch {
        // GET 缓存失败不阻塞主流程，掉到现场生成
      }
      if (!cancelled) generate(false);
    })();
    return () => { cancelled = true; };
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
                <button onClick={() => generate(false)} style={{
                  padding: '6px 12px', border: '1px solid #fecaca', background: '#fff',
                  color: '#991b1b', borderRadius: 4, fontSize: 12, cursor: 'pointer',
                }}>重试</button>
              </div>
            </div>
          )}
          {state === 'ok' && result && (
            <>
              {result.fromCache && result.generatedAt && (
                <div style={{
                  marginBottom: 8, padding: '6px 10px',
                  background: '#fef9c3', border: '1px solid #fde68a', borderRadius: 4,
                  fontSize: 11.5, color: '#854d0e',
                  display: 'flex', alignItems: 'center', gap: 8,
                }}>
                  <span>📌 上次保存于 {new Date(result.generatedAt).toLocaleString('zh-CN')}（缓存版，未消耗 token）</span>
                </div>
              )}
              {result.fromCache && (result.meetingsSinceCache ?? 0) > 0 && (
                <div style={{
                  marginBottom: 8, padding: '6px 10px',
                  background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 4,
                  fontSize: 11.5, color: '#991b1b',
                  display: 'flex', alignItems: 'center', gap: 8,
                }}>
                  <span>⚠️ 上次保存后该人物又参与了 {result.meetingsSinceCache} 场新会议未纳入画像，建议点"重新生成"</span>
                </div>
              )}
              <div style={{
                marginBottom: 12, padding: '8px 12px',
                background: 'var(--paper-2)', borderRadius: 4,
                fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--ink-3)',
                display: 'flex', flexWrap: 'wrap', gap: 14,
              }}>
                {result.model && <span>model: {result.model}</span>}
                {result.promptChars != null && <span>prompt: {result.promptChars} 字</span>}
                {result.sources && (
                  <>
                    <span>会议: {result.sources.meetings}</span>
                    <span>承诺: {result.sources.commitments}</span>
                    <span>角色: {result.sources.roleTrajectory}</span>
                    <span>发言: {result.sources.speechRows}</span>
                    <span>原文段: {result.sources.segments}</span>
                  </>
                )}
                {result.usage && (
                  <span>tokens: {result.usage.inputTokens ?? '?'}↓/{result.usage.outputTokens ?? '?'}↑</span>
                )}
              </div>
              <pre style={{
                margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                fontFamily: 'var(--serif)', fontSize: 14, lineHeight: 1.7,
                color: 'var(--ink)', background: 'transparent',
              }}>{result.content}</pre>

              {/* 写入专家库面板：必须先持久化画像才能导入 */}
              <div style={{
                marginTop: 18, padding: '14px 14px',
                border: '1px solid var(--line)', borderRadius: 6,
                background: 'var(--paper-2)',
              }}>
                <div style={{
                  fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-3)',
                  textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 8,
                }}>导入到专家库</div>
                {exportPhase === 'done' && exported ? (
                  <div style={{
                    padding: '10px 12px', borderRadius: 4,
                    background: '#ecfdf5', color: '#065f46', border: '1px solid #a7f3d0',
                    fontSize: 12.5, lineHeight: 1.6,
                  }}>
                    ✓ {exported.wasOverwrite ? '已覆盖更新' : '已新建'}专家库条目：<code style={{ fontFamily: 'var(--mono)' }}>{exported.expert_id}</code>
                    （{exported.domainName} · {exported.level === 'senior' ? '特级专家' : '领域专家'}）
                    <div style={{ marginTop: 6 }}>
                      <a href="/expert-library" target="_blank" rel="noreferrer" style={{
                        color: '#059669', textDecoration: 'underline',
                      }}>打开专家库 →</a>
                    </div>
                  </div>
                ) : exportPhase === 'preview' && exportPreview ? (
                  <div>
                    {exportPreview.willOverwrite ? (
                      <div style={{
                        padding: '8px 10px', marginBottom: 10,
                        background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 4,
                        fontSize: 12.5, color: '#854d0e', lineHeight: 1.55,
                      }}>
                        ⚠️ 该 expert_id 已存在，确认后会**覆盖**已有专家：
                        <div style={{ marginTop: 4, fontFamily: 'var(--mono)', fontSize: 11 }}>
                          existing: {exportPreview.existing?.name} · 上次更新 {exportPreview.existing?.updated_at && new Date(exportPreview.existing.updated_at).toLocaleString('zh-CN')}
                        </div>
                      </div>
                    ) : (
                      <div style={{
                        padding: '8px 10px', marginBottom: 10,
                        background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 4,
                        fontSize: 12.5, color: '#065f46',
                      }}>
                        ✓ 将**新建**专家
                      </div>
                    )}
                    <div style={{
                      padding: '10px 12px', marginBottom: 10,
                      background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 4,
                      fontSize: 12, lineHeight: 1.7, color: 'var(--ink-2)',
                    }}>
                      <div><b>expert_id:</b> <code style={{ fontFamily: 'var(--mono)' }}>{exportPreview.preview.expert_id}</code></div>
                      <div><b>name:</b> {exportPreview.preview.name}</div>
                      <div><b>domain:</b> {exportPreview.preview.domain.join(', ')}</div>
                      <div><b>title:</b> {exportPreview.preview.display_metadata?.profile?.title ?? '—'}</div>
                      <div><b>signature_phrases:</b> {(exportPreview.preview.signature_phrases || []).slice(0, 3).join(' / ') || '—'}{exportPreview.preview.signature_phrases.length > 3 ? ` +${exportPreview.preview.signature_phrases.length - 3}` : ''}</div>
                      <div><b>anti_patterns:</b> {(exportPreview.preview.anti_patterns || []).slice(0, 3).join(' / ') || '—'}</div>
                      {/* MENTAL MODEL + EMM GATE LOGIC + OUTPUT SCHEMA — 同步生成 */}
                      <div style={{
                        marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--line-2)',
                        display: 'flex', flexWrap: 'wrap', gap: '4px 12px', fontSize: 11.5, color: 'var(--ink-3)',
                      }}>
                        <span title="cognition.mentalModels">
                          🧠 mental models: <b style={{ color: (exportPreview.preview.persona?.cognition?.mentalModels?.length ?? 0) > 0 ? 'var(--ink)' : '#b91c1c' }}>{exportPreview.preview.persona?.cognition?.mentalModels?.length ?? 0}</b>
                        </span>
                        <span title="cognition.heuristics">
                          ⚡ heuristics: <b style={{ color: (exportPreview.preview.persona?.cognition?.heuristics?.length ?? 0) > 0 ? 'var(--ink)' : '#b91c1c' }}>{exportPreview.preview.persona?.cognition?.heuristics?.length ?? 0}</b>
                        </span>
                        <span title="emm.veto_rules / critical_factors">
                          🚫 EMM veto/critical: <b style={{ color: (exportPreview.preview.emm?.veto_rules?.length ?? 0) > 0 ? 'var(--ink)' : '#b91c1c' }}>
                            {exportPreview.preview.emm?.veto_rules?.length ?? 0} / {exportPreview.preview.emm?.critical_factors?.length ?? 0}
                          </b>
                        </span>
                        <span title="output_schema.rubrics">
                          📋 rubrics: <b style={{ color: (exportPreview.preview.output_schema?.rubrics?.length ?? 0) > 0 ? 'var(--ink)' : '#b91c1c' }}>{exportPreview.preview.output_schema?.rubrics?.length ?? 0}</b>
                        </span>
                      </div>
                      {(exportPreview.preview.emm?.veto_rules?.length ?? 0) === 0 && (
                        <div style={{ marginTop: 6, fontSize: 11, color: '#b91c1c' }}>
                          ⚠ EMM veto_rules 为空。LLM 没生成或原料不足 — 评审会缺一票否决门禁。点"重新生成"再试可能补回来。
                        </div>
                      )}
                    </div>
                    {exportErr && (
                      <div style={{
                        padding: '8px 10px', marginBottom: 10,
                        background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 4,
                        fontSize: 12, color: '#991b1b', lineHeight: 1.5,
                      }}>{exportErr}</div>
                    )}
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        onClick={confirmExport}
                        disabled={exportPhase !== 'preview'}
                        style={{
                          padding: '8px 16px', borderRadius: 4, fontSize: 12.5,
                          border: '1px solid #1A1410',
                          background: '#1A1410', color: '#F0E8D6',
                          cursor: 'pointer', fontWeight: 500,
                        }}
                      >确认{exportPreview.willOverwrite ? '覆盖' : '写入'}</button>
                      <button
                        onClick={cancelExportPreview}
                        style={{
                          padding: '8px 14px', borderRadius: 4, fontSize: 12.5,
                          border: '1px solid var(--line)',
                          background: 'var(--paper)', color: 'var(--ink-2)',
                          cursor: 'pointer',
                        }}
                      >取消</button>
                    </div>
                  </div>
                ) : exportPhase === 'confirming' ? (
                  <div style={{ padding: '10px 12px', fontSize: 12.5, color: 'var(--ink-2)' }}>
                    写入中…
                  </div>
                ) : (
                  <>
                    <div style={{ fontSize: 12, color: 'var(--ink-2)', marginBottom: 10, lineHeight: 1.55 }}>
                      LLM 已生成结构化档案；为提升分类准确率，下方两项请手选：
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginBottom: 10 }}>
                      <label style={{ fontSize: 12, color: 'var(--ink-2)', display: 'flex', alignItems: 'center', gap: 6 }}>
                        领域
                        <select
                          value={exportDomainCode}
                          onChange={(e) => setExportDomainCode(e.target.value)}
                          style={{
                            padding: '5px 8px', fontSize: 12,
                            border: '1px solid var(--line)', borderRadius: 4,
                            background: 'var(--paper)',
                          }}
                        >
                          {EXPERT_DOMAINS.map((d) => (
                            <option key={d.code} value={d.code}>{d.icon} {d.code} · {d.name}</option>
                          ))}
                        </select>
                      </label>
                      <label style={{ fontSize: 12, color: 'var(--ink-2)', display: 'flex', alignItems: 'center', gap: 6 }}>
                        等级
                        <select
                          value={exportLevel}
                          onChange={(e) => setExportLevel(e.target.value as 'senior' | 'domain')}
                          style={{
                            padding: '5px 8px', fontSize: 12,
                            border: '1px solid var(--line)', borderRadius: 4,
                            background: 'var(--paper)',
                          }}
                        >
                          <option value="senior">特级专家 (S-)</option>
                          <option value="domain">领域专家 ({exportDomainCode}-)</option>
                        </select>
                      </label>
                    </div>
                    {!result.fromCache && !persisted && (
                      <div style={{
                        padding: '6px 10px', marginBottom: 10,
                        background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 4,
                        fontSize: 11.5, color: '#854d0e',
                      }}>
                        请先点上方"保存到人物 metadata"，再回来导入专家库。
                      </div>
                    )}
                    {exportErr && (
                      <div style={{
                        padding: '8px 10px', marginBottom: 10,
                        background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 4,
                        fontSize: 12, color: '#991b1b', lineHeight: 1.5,
                      }}>{exportErr}</div>
                    )}
                    <button
                      onClick={previewExport}
                      disabled={exportPhase === 'previewing' || (!result.fromCache && !persisted)}
                      style={{
                        padding: '8px 16px', borderRadius: 4, fontSize: 12.5,
                        border: '1px solid #1A1410',
                        background: exportPhase === 'previewing' || (!result.fromCache && !persisted) ? 'var(--paper-3)' : '#1A1410',
                        color: exportPhase === 'previewing' || (!result.fromCache && !persisted) ? 'var(--ink-3)' : '#F0E8D6',
                        cursor: exportPhase === 'previewing' || (!result.fromCache && !persisted) ? 'not-allowed' : 'pointer',
                        fontWeight: 500,
                      }}
                    >{exportPhase === 'previewing' ? '生成预览中…' : '预览写入'}</button>
                  </>
                )}
              </div>
            </>
          )}
        </div>

        <div style={{
          padding: '12px 24px 16px', borderTop: '1px solid var(--line-2)',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          {state === 'ok' && result && (
            <>
              {!result.fromCache && (
                <button
                  onClick={() => generate(true)}
                  disabled={persisting || persisted}
                  title="把当前画像写到 mn_people.metadata.llm_profile"
                  style={{
                    padding: '7px 14px', borderRadius: 4, fontSize: 12,
                    border: '1px solid var(--line)', cursor: persisting || persisted ? 'default' : 'pointer',
                    background: persisted ? 'var(--paper-3)' : 'var(--paper)',
                    color: persisted ? 'var(--ink-3)' : 'var(--ink)',
                  }}
                >{persisted ? '✓ 已保存到人物 metadata' : persisting ? '保存中…' : '保存到人物 metadata'}</button>
              )}
              <button
                onClick={() => generate(false)}
                title={result.fromCache ? '重新跑 LLM 生成新版本，覆盖前需手动点保存' : '丢弃当前结果重新生成'}
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
