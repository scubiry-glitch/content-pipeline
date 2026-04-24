// NewMeeting — 新建会议纪要向导（3 步）
// 原型来源：/tmp/mn-proto/strategy-panel.jsx FlowUpload / FlowExperts / FlowProcessing

import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon, Chip, MonoMeta, SectionLabel } from './_atoms';
import { EXPERTS } from './_fixtures';
import { meetingNotesApi } from '../../api/meetingNotes';

// ── Local presets (richer than _fixtures.ts) ─────────────────────────────────

const PRESETS_FLOW = [
  {
    id: 'lite', title: 'lite · 精简',
    position: '日常批量处理；2 装饰器 + 单专家',
    cost: '最低 · 约 standard 的 1/5',
    strategy: 'single',
  },
  {
    id: 'standard', title: 'standard · 深度（默认）',
    position: '案例锚定 + 校准 + 心智模型；争议走 debate',
    cost: '均衡',
    strategy: 'debate (→ single fallback)',
  },
  {
    id: 'max', title: 'max · 极致',
    position: '7-8 装饰器全量堆叠；每条产出都带专家 DNA',
    cost: '慢 5-8×',
    strategy: 'mental_model_rotation + debate',
  },
];

// ── Step indicator ────────────────────────────────────────────────────────────

function StepBar({ step }: { step: number }) {
  const steps = ['① 上传', '② 选专家', '③ 处理中'];
  return (
    <div style={{ display: 'flex', gap: 3, alignSelf: 'flex-start', marginBottom: 18 }}>
      {steps.map((s, i) => (
        <div key={i} style={{
          padding: '5px 12px', borderRadius: 999, fontSize: 12,
          background: i + 1 === step ? 'var(--ink)' : i + 1 < step ? 'var(--accent-soft)' : 'var(--paper-2)',
          color: i + 1 === step ? 'var(--paper)' : i + 1 < step ? 'oklch(0.35 0.1 40)' : 'var(--ink-3)',
          border: '1px solid var(--line-2)', fontFamily: 'var(--sans)',
        }}>{s}</div>
      ))}
    </div>
  );
}

// ── Step 1: FlowUpload ────────────────────────────────────────────────────────

function FlowUpload({ onNext, onUploaded }: {
  onNext: () => void;
  onUploaded: (assetId: string | null) => void;
}) {
  const [mode, setMode] = useState<'files' | 'folder' | 'recent'>('files');
  const [uploading, setUploading] = useState(false);
  const [uploadedName, setUploadedName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const btnPrimary: React.CSSProperties = {
    padding: '9px 18px', border: '1px solid var(--ink)', background: 'var(--ink)',
    color: 'var(--paper)', borderRadius: 5, fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'var(--sans)',
  };
  const btnGhost: React.CSSProperties = {
    padding: '9px 18px', border: '1px solid var(--line)', background: 'var(--paper)',
    color: 'var(--ink-2)', borderRadius: 5, fontSize: 13, cursor: 'pointer', fontFamily: 'var(--sans)',
  };

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const file = files[0];
    setUploadedName(file.name);
    setUploading(true);
    try {
      const sources = await meetingNotesApi.listSources();
      const sourceId = sources.items?.[0]?.id ?? 'meetings';
      const r: { assetId?: string; id?: string } = await meetingNotesApi.uploadToSource(sourceId, file);
      onUploaded(r.assetId ?? r.id ?? null);
    } catch (e) {
      console.warn('upload failed, demo fallback:', e);
      onUploaded(null);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div style={{
      width: '100%', height: '100%', background: 'var(--paper-2)', padding: '36px 48px',
      display: 'flex', flexDirection: 'column', overflow: 'hidden', fontFamily: 'var(--sans)',
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 6 }}>
        <h2 style={{ fontFamily: 'var(--serif)', fontWeight: 500, fontSize: 24, margin: 0, letterSpacing: '-0.01em' }}>
          新建会议纪要
        </h2>
        <MonoMeta>step 1 / 3</MonoMeta>
      </div>
      <div style={{ fontSize: 13, color: 'var(--ink-3)', marginBottom: 22, maxWidth: 640 }}>
        上传录音 / 文字稿 / 笔记，或绑定一个目录（目录中的文件将持续作为原始素材被索引）。
      </div>

      <StepBar step={1} />

      <div style={{ display: 'flex', gap: 3, border: '1px solid var(--line)', borderRadius: 6, padding: 3, alignSelf: 'flex-start', marginBottom: 18, background: 'var(--paper)' }}>
        {[{ id: 'files' as const, label: '上传文件' }, { id: 'folder' as const, label: '绑定目录' }, { id: 'recent' as const, label: '从历史中选' }].map(x => (
          <button key={x.id} onClick={() => setMode(x.id)} style={{
            padding: '6px 14px', border: 0, borderRadius: 4, fontSize: 12.5,
            background: mode === x.id ? 'var(--ink)' : 'transparent',
            color: mode === x.id ? 'var(--paper)' : 'var(--ink-2)', cursor: 'pointer',
            fontWeight: mode === x.id ? 600 : 450,
          }}>{x.label}</button>
        ))}
      </div>

      {mode === 'files' && (
        <div
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); handleFiles(e.dataTransfer.files); }}
          style={{
            flex: 1, border: '1.5px dashed var(--line)', borderRadius: 8, background: 'var(--paper)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 14,
            position: 'relative', overflow: 'hidden', cursor: 'pointer',
          }}>
          <input
            ref={fileInputRef}
            type="file"
            onChange={(e) => handleFiles(e.target.files)}
            style={{ display: 'none' }}
            accept=".m4a,.mp3,.wav,.docx,.md,.txt,.pdf,.vtt,.srt"
          />
          <div style={{
            width: 64, height: 64, borderRadius: 14, background: 'var(--paper-2)',
            border: '1px solid var(--line-2)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--ink-2)',
          }}>
            <Icon name="upload" size={26} />
          </div>
          <div style={{ fontFamily: 'var(--serif)', fontSize: 18, fontWeight: 500 }}>
            {uploading ? '上传中…' : uploadedName ? `已上传：${uploadedName}` : '拖拽文件到此处 · 或点击上传'}
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>
            支持 m4a / mp3 / wav · docx / md / txt · pdf · vtt / srt
          </div>
          <div style={{
            display: 'flex', gap: 10, marginTop: 10, padding: '10px 14px',
            background: 'var(--paper-2)', borderRadius: 6, border: '1px solid var(--line-2)',
            fontSize: 12, color: 'var(--ink-2)',
          }}>
            <Icon name="folder" size={14} />
            已识别项目目录: <span style={{ fontFamily: 'var(--mono)', color: 'var(--ink)' }}>/assets/meetings/2026-Q2/</span>
          </div>
          <div style={{ position: 'absolute', left: 48, bottom: 28, display: 'flex', gap: 10 }}>
            {[{ name: 'zoom-recording-237.m4a', size: '48.2 MB' }, { name: '会议纪要初稿.docx', size: '23 KB' }, { name: '尽调包-推理层.xlsx', size: '180 KB' }].map((f, i) => (
              <div key={i} style={{
                padding: '8px 12px', background: 'var(--paper-2)', border: '1px solid var(--line-2)',
                borderRadius: 5, display: 'flex', alignItems: 'center', gap: 8, fontSize: 12,
              }}>
                <Icon name="ledger" size={13} />
                <span>{f.name}</span>
                <MonoMeta>{f.size}</MonoMeta>
                <Icon name="check" size={12} style={{ color: 'var(--accent)' }} />
              </div>
            ))}
          </div>
        </div>
      )}

      {mode === 'folder' && (
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
          <div style={{ background: 'var(--paper)', border: '1px solid var(--line-2)', borderRadius: 8, padding: '18px 20px' }}>
            <SectionLabel>目录绑定</SectionLabel>
            <div style={{ marginTop: 12, padding: '12px 14px', background: 'var(--paper-2)', borderRadius: 6, fontFamily: 'var(--mono)', fontSize: 12, border: '1px solid var(--line-2)' }}>
              paper.morning.rocks/assets/meetings/
            </div>
            <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 10, lineHeight: 1.6 }}>
              目录中任何新增文件都会被持续索引，并按同一套原始素参考规则挂载到下一次会议纪要。
            </div>
            <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
              <Chip tone="accent">自动索引</Chip>
              <Chip tone="ghost">Webhook: on</Chip>
              <Chip tone="ghost">最新同步 · 2 分钟前</Chip>
            </div>
          </div>
          <div style={{ background: 'var(--paper)', border: '1px solid var(--line-2)', borderRadius: 8, padding: '18px 20px' }}>
            <SectionLabel>目录内容 · 预览</SectionLabel>
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column' }}>
              {['audio/zoom-237.m4a','notes/纪要初稿.docx','notes/纪要补丁.md','attachments/尽调包.xlsx','attachments/推理层-候选.pdf'].map((f, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '8px 4px',
                  borderTop: i === 0 ? 'none' : '1px solid var(--line-2)', fontSize: 12.5,
                }}>
                  <Icon name="ledger" size={13} style={{ color: 'var(--ink-3)' }} />
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 11.5 }}>{f}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {mode === 'recent' && (
        <div style={{ flex: 1, background: 'var(--paper)', border: '1px solid var(--line-2)', borderRadius: 8, padding: '4px 0' }}>
          {[
            { t: '2026-03-28', title: '远翎资本 · Q1 复盘 · 基础设施方向', n: '8 人 · 142 分钟' },
            { t: '2026-03-14', title: '团队内部 · 推理层 subadvisor 选择讨论', n: '4 人 · 68 分钟' },
            { t: '2026-02-22', title: 'LP 沟通会 · Q1 进度披露', n: '12 人 · 95 分钟' },
          ].map((x, i) => (
            <div key={i} style={{
              display: 'grid', gridTemplateColumns: '120px 1fr 200px 24px', gap: 14, alignItems: 'center',
              padding: '14px 20px', borderTop: i === 0 ? 'none' : '1px solid var(--line-2)',
            }}>
              <MonoMeta>{x.t}</MonoMeta>
              <div style={{ fontFamily: 'var(--serif)', fontSize: 15, fontWeight: 500 }}>{x.title}</div>
              <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>{x.n}</div>
              <Icon name="chevron" size={14} style={{ color: 'var(--ink-4)' }} />
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 22 }}>
        <button style={btnGhost}>稍后</button>
        <button style={btnPrimary} onClick={onNext}>继续 · 选择专家</button>
      </div>
    </div>
  );
}

// ── Step 2: FlowExperts ───────────────────────────────────────────────────────

function FlowExperts({ onNext, onBack, onSubmit }: {
  onNext: () => void;
  onBack: () => void;
  onSubmit: (body: { presetId: string; expertIds: string[] }) => void;
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>(EXPERTS.filter(e => e.selected).map(e => e.id));
  const [presetId, setPresetId] = useState('standard');
  const toggle = (id: string) => setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const btnPrimary: React.CSSProperties = {
    padding: '9px 18px', border: '1px solid var(--ink)', background: 'var(--ink)',
    color: 'var(--paper)', borderRadius: 5, fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'var(--sans)',
  };

  return (
    <div style={{
      width: '100%', height: '100%', background: 'var(--paper-2)', padding: '32px 48px',
      display: 'flex', flexDirection: 'column', overflow: 'hidden', fontFamily: 'var(--sans)',
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 6 }}>
        <h2 style={{ fontFamily: 'var(--serif)', fontWeight: 500, fontSize: 24, margin: 0, letterSpacing: '-0.01em' }}>
          选择专家
        </h2>
        <MonoMeta>step 2 / 3</MonoMeta>
      </div>
      <div style={{ fontSize: 13, color: 'var(--ink-3)', marginBottom: 18, maxWidth: 720 }}>
        基于 batch-ops 的深度分析逻辑：系统读取会议文本特征（叙事密度、争议性、术语分布、参与者风格），
        从专家库中推荐匹配度最高的几位。你也可以手动追加。
      </div>

      <StepBar step={2} />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 18, flex: 1, overflow: 'hidden' }}>
        <div style={{ overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <SectionLabel>推荐</SectionLabel>
            <span style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>按 match 降序 · 根据话题、风格与校准分</span>
          </div>
          {EXPERTS.map(e => {
            const on = selectedIds.includes(e.id);
            return (
              <div key={e.id} onClick={() => toggle(e.id)} style={{
                background: 'var(--paper)', border: `1px solid ${on ? 'var(--accent)' : 'var(--line-2)'}`,
                borderRadius: 8, padding: '16px 18px', cursor: 'pointer', display: 'grid',
                gridTemplateColumns: '44px 1fr 120px 24px', gap: 14, alignItems: 'center',
              }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 8, background: 'var(--paper-2)',
                  border: '1px solid var(--line-2)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 600, color: 'var(--ink-2)',
                }}>{e.id}</div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ fontFamily: 'var(--serif)', fontSize: 15, fontWeight: 600 }}>{e.name}</div>
                    <MonoMeta>{e.calibration}</MonoMeta>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 2 }}>
                    {e.field} · <i>{e.style}</i>
                  </div>
                  <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {e.mentalModels.slice(0, 3).map((m, i) => (
                      <span key={i} style={{
                        fontFamily: 'var(--mono)', fontSize: 10.5, padding: '2px 7px',
                        background: 'var(--paper-2)', border: '1px solid var(--line-2)', borderRadius: 3,
                        color: 'var(--ink-2)',
                      }}>{m}</span>
                    ))}
                    {e.mentalModels.length > 3 && <MonoMeta>+{e.mentalModels.length - 3}</MonoMeta>}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontFamily: 'var(--serif)', fontSize: 24, fontWeight: 600, color: 'var(--accent)', letterSpacing: '-0.01em' }}>
                    {(e.match * 100).toFixed(0)}<span style={{ fontSize: 13, color: 'var(--ink-3)' }}>%</span>
                  </div>
                  <div style={{ fontSize: 10.5, color: 'var(--ink-3)' }}>match</div>
                </div>
                <div style={{
                  width: 20, height: 20, borderRadius: 5,
                  background: on ? 'var(--accent)' : 'transparent',
                  border: on ? '1px solid var(--accent)' : '1px solid var(--line)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--paper)',
                }}>
                  {on && <Icon name="check" size={12} />}
                </div>
              </div>
            );
          })}
        </div>

        <aside style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ background: 'var(--paper)', border: '1px solid var(--line-2)', borderRadius: 8, padding: '16px 18px' }}>
            <SectionLabel>已选 · {selectedIds.length} 位</SectionLabel>
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {selectedIds.map(id => {
                const e = EXPERTS.find(x => x.id === id);
                if (!e) return null;
                return (
                  <div key={id} style={{
                    display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5,
                    padding: '6px 8px', background: 'var(--paper-2)', borderRadius: 4,
                  }}>
                    <MonoMeta>{e.id}</MonoMeta>
                    <span style={{ fontWeight: 500 }}>{e.name.split(' · ')[0]}</span>
                    <Icon name="x" size={12} style={{ marginLeft: 'auto', color: 'var(--ink-4)', cursor: 'pointer' }} />
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ background: 'var(--paper)', border: '1px solid var(--line-2)', borderRadius: 8, padding: '16px 18px' }}>
            <SectionLabel>调用预设</SectionLabel>
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {PRESETS_FLOW.map(p => {
                const active = p.id === presetId;
                return (
                  <div key={p.id} onClick={() => setPresetId(p.id)} style={{
                    padding: '10px 12px', borderRadius: 6,
                    border: active ? '1px solid var(--accent)' : '1px solid var(--line-2)',
                    background: active ? 'var(--accent-soft)' : 'transparent', cursor: 'pointer',
                  }}>
                    <div style={{ fontFamily: 'var(--serif)', fontSize: 13.5, fontWeight: 600 }}>{p.id}</div>
                    <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 2, lineHeight: 1.4 }}>{p.position}</div>
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 'auto' }}>
            <button onClick={onBack} style={{
              padding: '9px 14px', border: '1px solid var(--line)', background: 'var(--paper)',
              color: 'var(--ink-2)', borderRadius: 5, fontSize: 13, cursor: 'pointer', fontFamily: 'var(--sans)',
            }}>← 返回</button>
            <button style={{ ...btnPrimary, flex: 1 }} onClick={() => {
              onSubmit({ presetId, expertIds: selectedIds });
              onNext();
            }}>生成会议纪要 →</button>
          </div>
        </aside>
      </div>
    </div>
  );
}

// ── Step 3: FlowProcessing ────────────────────────────────────────────────────

function StepDot({ state, tick }: { state: string; tick: number }) {
  void tick;
  if (state === 'done') return (
    <div style={{
      width: 18, height: 18, borderRadius: 99, background: 'var(--accent)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--paper)',
    }}>
      <Icon name="check" size={11} />
    </div>
  );
  if (state === 'running') return (
    <div style={{ width: 18, height: 18, borderRadius: 99, border: '2px solid var(--teal)', borderTopColor: 'transparent', animation: 'spin 1s linear infinite' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
  return <div style={{ width: 14, height: 14, borderRadius: 99, border: '1.5px solid var(--line)', marginLeft: 2 }} />;
}

function FlowProcessing({
  onBack, runId, onViewRun, onGoMultiView,
}: {
  onBack: () => void;
  runId: string | null;
  onViewRun: (runId: string) => void;
  onGoMultiView: (meetingId: string) => void;
}) {
  const [tick, setTick] = useState(0);
  const [done, setDone] = useState(false);
  const [realRunId, setRealRunId] = useState<string | null>(runId);
  const [realMeetingId, setRealMeetingId] = useState<string | null>(null);
  const [realProgress, setRealProgress] = useState<number | null>(null);

  useEffect(() => {
    const t = setInterval(() => setTick(x => x + 1), 900);
    return () => clearInterval(t);
  }, []);

  // 真实 getRun 轮询（runId 非空时）
  useEffect(() => {
    if (!runId) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const r: { state?: string; progress?: number; meetingId?: string; result?: { meetingId?: string } } = await meetingNotesApi.getRun(runId);
        if (cancelled) return;
        setRealRunId(runId);
        if (typeof r.progress === 'number') setRealProgress(r.progress);
        const mid = r.meetingId ?? r.result?.meetingId;
        if (mid) setRealMeetingId(mid);
        if (r.state === 'done' || r.state === 'completed') setDone(true);
        else setTimeout(poll, 2000);
      } catch (e) {
        console.warn('getRun failed, falling back to demo timing:', e);
      }
    };
    poll();
    return () => { cancelled = true; };
  }, [runId]);

  const steps = [
    { id: 'ingest',    label: '原始素材解析 · ASR + 文档清洗',              pct: 100,       state: 'done',    sub: '' },
    { id: 'segment',   label: '发言切分 + 参与者归并',                       pct: 100,       state: 'done',    sub: '' },
    { id: 'dispatch',  label: '分派给 3 位专家 · preset: standard',          pct: 100,       state: 'done',    sub: '' },
    { id: 'dec',       label: '装饰器 stack · 注入证据 / 校准 confidence',   pct: done ? 100 : 78, state: done ? 'done' : 'running', sub: 'evidence_anchored → calibrated_confidence → knowledge_grounded' },
    { id: 'synth',     label: '跨专家综合 · 7 条 deliverable 映射',          pct: done ? 100 : 12, state: done ? 'done' : 'queued',  sub: '' },
    { id: 'render',    label: '多维度组装 · 张力 / 新认知 / 共识 / 观点对位', pct: done ? 100 : 0,  state: done ? 'done' : 'queued',  sub: '' },
  ];

  const btnPrimary: React.CSSProperties = {
    padding: '9px 18px', border: '1px solid var(--ink)', background: 'var(--ink)',
    color: 'var(--paper)', borderRadius: 5, fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'var(--sans)',
  };
  const btnGhost: React.CSSProperties = {
    padding: '9px 18px', border: '1px solid var(--line)', background: 'var(--paper)',
    color: 'var(--ink-2)', borderRadius: 5, fontSize: 13, cursor: 'pointer', fontFamily: 'var(--sans)',
  };

  return (
    <div style={{
      width: '100%', height: '100%', background: 'var(--paper-2)',
      display: 'flex', flexDirection: 'column', overflow: 'hidden', fontFamily: 'var(--sans)',
    }}>
      <div style={{
        flex: 1, minHeight: 0, padding: '32px 48px 18px',
        display: 'grid', gridTemplateColumns: '1fr 380px', gap: 22, overflow: 'hidden',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 6 }}>
            <h2 style={{ fontFamily: 'var(--serif)', fontWeight: 500, fontSize: 24, margin: 0, letterSpacing: '-0.01em' }}>
              {done ? '解析完成' : '正在生成'}
            </h2>
            <MonoMeta>step 3 / 3 · standard preset {done && '· run-237'}</MonoMeta>
            <div style={{ marginLeft: 'auto' }}>
              <button onClick={() => setDone(d => !d)} style={{
                padding: '5px 12px', fontSize: 11, border: '1px dashed var(--line)',
                background: 'transparent', borderRadius: 4, color: 'var(--ink-3)',
                cursor: 'pointer', fontFamily: 'var(--mono)',
              }}>{done ? '↺ 重置演示' : '⇢ 演示完成态'}</button>
            </div>
          </div>

          <StepBar step={3} />

          <div style={{ fontSize: 13, color: 'var(--ink-3)', marginBottom: 18, maxWidth: 720 }}>
            每一步可观察 · 每一次专家调用都记录 strategy + decorator stack + cost。中途可暂停或切换到 lite。
          </div>

          <div style={{ flex: 1, background: 'var(--paper)', border: '1px solid var(--line-2)', borderRadius: 8, overflow: 'auto' }}>
            {steps.map((s, i) => (
              <div key={s.id} style={{
                padding: '16px 22px', borderTop: i === 0 ? 'none' : '1px solid var(--line-2)',
                display: 'grid', gridTemplateColumns: '22px 1fr 60px', gap: 14, alignItems: 'center',
              }}>
                <StepDot state={s.state} tick={tick} />
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 13.5, fontWeight: 500, color: s.state === 'queued' ? 'var(--ink-3)' : 'var(--ink)' }}>
                      {s.label}
                    </span>
                    {s.state === 'running' && <Chip tone="accent" style={{ padding: '1px 7px', fontSize: 10 }}>running</Chip>}
                  </div>
                  {s.sub && (
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-3)', marginTop: 6 }}>{s.sub}</div>
                  )}
                  <div style={{ height: 3, background: 'var(--line-2)', borderRadius: 2, marginTop: 10, overflow: 'hidden' }}>
                    <div style={{
                      width: `${s.pct}%`, height: '100%',
                      background: s.state === 'done' ? 'var(--accent)' : s.state === 'running' ? 'var(--teal)' : 'var(--line)',
                    }} />
                  </div>
                </div>
                <MonoMeta style={{ textAlign: 'right' }}>{s.pct}%</MonoMeta>
              </div>
            ))}
          </div>
        </div>

        <aside style={{ display: 'flex', flexDirection: 'column', gap: 14, overflow: 'auto' }}>
          <div style={{ background: 'var(--paper)', border: '1px solid var(--line-2)', borderRadius: 8, padding: '16px 18px' }}>
            <SectionLabel>当前调用</SectionLabel>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 11.5, lineHeight: 1.8, marginTop: 10, color: 'var(--ink-2)' }}>
              <div><span style={{ color: 'var(--ink-4)' }}>strategy   </span>debate</div>
              <div><span style={{ color: 'var(--ink-4)' }}>expertA    </span>E09-09 · 二阶思考者</div>
              <div><span style={{ color: 'var(--ink-4)' }}>expertB    </span>E11-03 · 叙事追踪者</div>
              <div><span style={{ color: 'var(--ink-4)' }}>judge      </span>E04-12 · 产业链测绘师</div>
              <div><span style={{ color: 'var(--ink-4)' }}>decorators </span></div>
              {['failure_check','evidence_anchored','calibrated_confidence','knowledge_grounded','rubric_anchored_output'].map((d, i) => (
                <div key={d} style={{ paddingLeft: 12, color: i === 1 ? 'var(--teal)' : 'var(--ink-2)' }}>
                  {i === 1 ? '▸ ' : '· '}{d}
                </div>
              ))}
            </div>
          </div>
          <div style={{ background: 'var(--paper)', border: '1px solid var(--line-2)', borderRadius: 8, padding: '16px 18px' }}>
            <SectionLabel>实时开销</SectionLabel>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
              {[{ l: 'input tokens', v: '41,382' }, { l: 'output tokens', v: '8,240' }, { l: 'experts called', v: '3' }, { l: 'elapsed', v: '1m 32s' }].map(x => (
                <div key={x.l} style={{ padding: '8px 10px', background: 'var(--paper-2)', borderRadius: 5, border: '1px solid var(--line-2)' }}>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: 0.3 }}>{x.l}</div>
                  <div style={{ fontFamily: 'var(--serif)', fontSize: 17, fontWeight: 600, marginTop: 2 }}>{x.v}</div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ background: 'var(--paper)', border: '1px solid var(--line-2)', borderRadius: 8, padding: '16px 18px' }}>
            <SectionLabel>已产出 · 2 / 7</SectionLabel>
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {[
                { k: '① topic-enrich',  done: true  },
                { k: 'step3-fact-review', done: true  },
                { k: '⑫ consensus',     done: false },
                { k: '⑬ controversy',   done: false },
                { k: '⑩ insights',      done: false },
                { k: '⑭ beliefEvolution', done: false },
                { k: 'step5-synthesis',  done: false },
              ].map(d => (
                <div key={d.k} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                  {d.done
                    ? <Icon name="check" size={13} style={{ color: 'var(--accent)' }} />
                    : <div style={{ width: 13, height: 13, borderRadius: 99, border: '1.2px solid var(--line)' }} />}
                  <span style={{ color: d.done ? 'var(--ink)' : 'var(--ink-3)', fontFamily: 'var(--serif)' }}>{d.k}</span>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>

      <div style={{
        flex: '0 0 auto', borderTop: '1px solid var(--line-2)',
        background: done ? 'var(--accent-soft)' : 'var(--paper)',
        padding: '14px 48px', display: 'flex', alignItems: 'center', gap: 18,
      }}>
        {done ? (
          <>
            <div style={{
              width: 28, height: 28, borderRadius: 99, background: 'var(--accent)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--paper)', flexShrink: 0,
            }}>
              <Icon name="check" size={15} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: 'var(--serif)', fontSize: 15, fontWeight: 600, letterSpacing: '-0.005em' }}>
                解析完成 · 6 维度产出 已就绪
              </div>
              <div style={{ fontSize: 12, color: 'var(--ink-2)', marginTop: 3, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                <span>承诺 <b style={{ color: 'var(--ink)' }}>12</b></span>
                <span>at-risk <b style={{ color: 'var(--ink)' }}>3</b></span>
                <span>开放问题 <b style={{ color: 'var(--ink)' }}>5</b></span>
                <span>新判断入库 <b style={{ color: 'var(--ink)' }}>4</b></span>
                <span style={{ color: 'var(--ink-3)' }}>· run-237 · 2m 08s · 49,622 tokens</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button style={btnGhost} onClick={() => onViewRun(realRunId ?? 'run-237')}>查看本次 run</button>
              <button style={btnPrimary} onClick={() => onGoMultiView(realMeetingId ?? 'M-2026-04-11-0237')}>进入多维视图 →</button>
            </div>
          </>
        ) : (
          <>
            <div style={{ width: 22, height: 22, borderRadius: 99, border: '2px solid var(--teal)', borderTopColor: 'transparent', animation: 'spin 1s linear infinite' }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, color: 'var(--ink-2)' }}>
                解析进行中 · 约 <b>48 秒</b> 后可进入多维视图
              </div>
            </div>
            <button onClick={onBack} style={btnGhost}>← 返回</button>
          </>
        )}
      </div>
    </div>
  );
}

// ── Main export ──────────────────────────────────────────────────────────────

export function NewMeeting() {
  const navigate = useNavigate();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [assetId, setAssetId] = useState<string | null>(null);
  const [runId, setRunId] = useState<string | null>(null);

  async function handleSubmit(body: { presetId: string; expertIds: string[] }) {
    if (!assetId) {
      // No real upload — skip enqueueRun, stay in demo mode
      return;
    }
    try {
      const scope = { kind: 'MEETING', assetId };
      const r: { runId?: string; ok?: boolean } = await meetingNotesApi.enqueueRun({
        scope,
        axis: 'multi',
        preset: body.presetId,
        triggeredBy: 'new-meeting-wizard',
      });
      if (r.runId) setRunId(r.runId);
    } catch (e) {
      console.warn('enqueueRun failed, demo fallback:', e);
    }
  }

  return (
    <div style={{ width: '100%', height: '100%' }}>
      {step === 1 && <FlowUpload onNext={() => setStep(2)} onUploaded={setAssetId} />}
      {step === 2 && <FlowExperts onNext={() => setStep(3)} onBack={() => setStep(1)} onSubmit={handleSubmit} />}
      {step === 3 && (
        <FlowProcessing
          onBack={() => setStep(2)}
          runId={runId}
          onViewRun={(rid) => navigate(`/meeting/generation-center?run=${rid}`)}
          onGoMultiView={(mid) => navigate(`/meeting/${mid}/a`)}
        />
      )}
    </div>
  );
}

export default NewMeeting;
