// NewMeeting — 新建会议纪要向导
// 关键流程：① Upload → ② Experts → ③ Processing → Multi-view
// 原型来源：/api/docs/会议纪要.zip · strategy-panel.jsx (FlowUpload/FlowExperts/FlowProcessing/FlowMultiView)

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { meetingNotesApi } from '../../api/meetingNotes';
import { expertsApi } from '../../api/client';
import type { Expert } from '../../types';

type StepId = 'upload' | 'experts' | 'processing';
type UploadMode = 'files' | 'folder' | 'recent';
type PresetId = 'lite' | 'standard' | 'max';

interface ExpertCard {
  id: string;
  code: string;
  name: string;
  field: string;
  style: string;
  calibration: string;
  mentalModels: string[];
  match: number;
}

const PRESETS: { id: PresetId; label: string; position: string }[] = [
  { id: 'lite',     label: 'lite',     position: '快速通道 · 1 专家 · 基础装饰器' },
  { id: 'standard', label: 'standard', position: '常规场景 · 3 专家 · 完整装饰器栈' },
  { id: 'max',      label: 'max',      position: '深度分析 · 5+ 专家 · 辩论 + 复核' },
];

// 原型 fallback — 后端 /experts 无数据时使用
const MOCK_EXPERTS: ExpertCard[] = [
  { id: 'E09-09', code: 'E09-09', name: '二阶思考者 · Q. Lin', field: '宏观 · 二阶推演', style: '反驳 + 展开', calibration: 'cal 0.86', mentalModels: ['second-order', 'base-rate', 'pre-mortem'], match: 0.92 },
  { id: 'E11-03', code: 'E11-03', name: '叙事追踪者 · S. Chen', field: '媒介 · 叙事演化', style: '溯源 + 解构', calibration: 'cal 0.81', mentalModels: ['framing', 'dominant-narrative', 'adjacent-possible'], match: 0.87 },
  { id: 'E04-12', code: 'E04-12', name: '产业链测绘师 · W. Zhao', field: '产业 · 链路结构', style: '综合 + 落地', calibration: 'cal 0.83', mentalModels: ['supply-chain', 'bottleneck', 'margin-flow'], match: 0.81 },
  { id: 'E07-05', code: 'E07-05', name: '反例收集者 · M. Wu', field: '通用 · 归谬校验', style: '挑战 + 归谬', calibration: 'cal 0.78', mentalModels: ['disconfirming', 'edge-case', 'survivorship'], match: 0.74 },
  { id: 'E02-07', code: 'E02-07', name: '资本流向观察者 · J. Pan', field: '金融 · 一级/二级', style: '跟踪 + 量化', calibration: 'cal 0.84', mentalModels: ['flow-following', 'reflexivity', 'liquidity'], match: 0.71 },
];

const PROC_STEPS = [
  { id: 'ingest',          label: '原始素材解析 · ASR + 文档清洗' },
  { id: 'segment',         label: '发言切分 + 参与者归并' },
  { id: 'expert-dispatch', label: '分派给专家' },
  { id: 'decorators',      label: '装饰器 stack · 注入证据 / 校准 confidence',
    sub: 'evidence_anchored → calibrated_confidence → knowledge_grounded' },
  { id: 'synthesis',       label: '跨专家综合 · deliverable 映射' },
  { id: 'render',          label: '多维度组装 · 张力 / 新认知 / 共识 / 观点对位' },
];

function StepDot({ state }: { state: 'done' | 'running' | 'queued' }) {
  if (state === 'done') {
    return (
      <div className="w-[18px] h-[18px] rounded-full bg-orange-600 flex items-center justify-center text-white text-[11px]">
        ✓
      </div>
    );
  }
  if (state === 'running') {
    return (
      <div className="w-[18px] h-[18px] rounded-full border-2 border-teal-500 border-t-transparent animate-spin" />
    );
  }
  return <div className="w-[14px] h-[14px] rounded-full border-[1.5px] border-gray-300 ml-[2px]" />;
}

function Stepper({ step }: { step: StepId }) {
  const items: { id: StepId; label: string }[] = [
    { id: 'upload',     label: '上传素材' },
    { id: 'experts',    label: '选择专家' },
    { id: 'processing', label: '解析生成' },
  ];
  const idx = items.findIndex((x) => x.id === step);
  return (
    <div className="flex items-center gap-3">
      {items.map((it, i) => {
        const state: 'done' | 'current' | 'todo' =
          i < idx ? 'done' : i === idx ? 'current' : 'todo';
        return (
          <div key={it.id} className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-mono ${
                state === 'done'
                  ? 'bg-orange-600 text-white'
                  : state === 'current'
                  ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-500'
              }`}>
                {state === 'done' ? '✓' : i + 1}
              </div>
              <span className={`text-sm ${
                state === 'todo' ? 'text-gray-400' : 'text-gray-800 dark:text-gray-100 font-medium'
              }`}>
                {it.label}
              </span>
            </div>
            {i < items.length - 1 && (
              <div className={`h-px w-10 ${i < idx ? 'bg-orange-600' : 'bg-gray-200 dark:bg-gray-700'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Step 1: Upload ──────────────────────────────────────────────────
function StepUpload({
  files, onFilesChange, mode, onModeChange, folderPath, onFolderPathChange,
}: {
  files: File[];
  onFilesChange: (f: File[]) => void;
  mode: UploadMode;
  onModeChange: (m: UploadMode) => void;
  folderPath: string;
  onFolderPathChange: (p: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const dropped = Array.from(e.dataTransfer.files);
    if (dropped.length > 0) onFilesChange([...files, ...dropped]);
  };

  return (
    <div>
      <div className="flex items-baseline gap-3 mb-1">
        <h2 className="text-2xl font-semibold tracking-tight" style={{ fontFamily: 'Source Serif 4, Noto Serif SC, Georgia, serif' }}>
          新建会议纪要
        </h2>
        <span className="text-xs font-mono text-gray-400">step 1 / 3</span>
      </div>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-5 max-w-xl">
        上传录音 / 文字稿 / 笔记，或绑定一个目录（目录中的文件将持续作为原始素材被索引）。
      </p>

      <div className="inline-flex gap-1 border border-gray-200 dark:border-gray-700 rounded-md p-1 mb-4 bg-white dark:bg-gray-900">
        {[
          { id: 'files' as const,  label: '上传文件' },
          { id: 'folder' as const, label: '绑定目录' },
          { id: 'recent' as const, label: '从历史中选' },
        ].map((x) => (
          <button
            key={x.id}
            onClick={() => onModeChange(x.id)}
            className={`px-3.5 py-1.5 rounded text-xs font-medium transition-colors ${
              mode === x.id
                ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900'
                : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'
            }`}
          >
            {x.label}
          </button>
        ))}
      </div>

      {mode === 'files' && (
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          className="border-[1.5px] border-dashed border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 min-h-[260px] flex flex-col items-center justify-center gap-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50"
        >
          <input
            ref={inputRef}
            type="file"
            multiple
            hidden
            onChange={(e) => {
              const picked = Array.from(e.target.files ?? []);
              if (picked.length > 0) onFilesChange([...files, ...picked]);
              e.target.value = '';
            }}
          />
          <div className="w-16 h-16 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 flex items-center justify-center text-2xl">
            ⬆
          </div>
          <div className="text-lg font-medium" style={{ fontFamily: 'Source Serif 4, Noto Serif SC, Georgia, serif' }}>
            拖拽文件到此处 · 或点击上传
          </div>
          <div className="text-xs text-gray-500">
            支持 m4a / mp3 / wav · docx / md / txt · pdf · vtt / srt
          </div>

          {files.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2 max-w-full px-6" onClick={(e) => e.stopPropagation()}>
              {files.map((f, i) => (
                <div
                  key={`${f.name}-${i}`}
                  className="px-3 py-1.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded text-xs flex items-center gap-2"
                >
                  <span>📄</span>
                  <span className="max-w-[240px] truncate">{f.name}</span>
                  <span className="font-mono text-gray-400">
                    {(f.size / 1024).toFixed(f.size > 1024 * 1024 ? 0 : 1)}
                    {f.size > 1024 * 1024 ? ' MB' : ' KB'}
                  </span>
                  <button
                    onClick={() => onFilesChange(files.filter((_, j) => j !== i))}
                    className="text-gray-400 hover:text-red-600"
                    title="移除"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {mode === 'folder' && (
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-5">
            <div className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-2">目录绑定</div>
            <input
              value={folderPath}
              onChange={(e) => onFolderPathChange(e.target.value)}
              placeholder="assets/meetings/2026-Q2/"
              className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded font-mono text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <p className="text-xs text-gray-500 mt-2 leading-relaxed">
              目录中任何新增文件都会被持续索引，并按同一套原始素材规则挂载到下一次会议纪要。
            </p>
            <div className="mt-3 flex gap-2 flex-wrap">
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 border border-orange-200 dark:border-orange-700">自动索引</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700">Webhook: on</span>
            </div>
          </div>
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-5">
            <div className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-2">目录内容 · 预览</div>
            <p className="text-xs text-gray-400">绑定路径后将从后端列出索引文件。</p>
          </div>
        </div>
      )}

      {mode === 'recent' && (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg">
          <p className="text-xs text-gray-400 px-5 py-8 text-center">
            历史会议纪要列表（从已上传渠道拉取）<br />
            <span className="text-[11px]">—— 当前原型占位，未来接入 meetingNotesApi.listScopes()</span>
          </p>
        </div>
      )}
    </div>
  );
}

// ── Step 2: Experts ─────────────────────────────────────────────────
function StepExperts({
  experts, selected, onToggle, preset, onPresetChange, loading,
}: {
  experts: ExpertCard[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  preset: PresetId;
  onPresetChange: (p: PresetId) => void;
  loading: boolean;
}) {
  return (
    <div>
      <div className="flex items-baseline gap-3 mb-1">
        <h2 className="text-2xl font-semibold tracking-tight" style={{ fontFamily: 'Source Serif 4, Noto Serif SC, Georgia, serif' }}>
          选择专家
        </h2>
        <span className="text-xs font-mono text-gray-400">step 2 / 3</span>
      </div>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-5 max-w-2xl">
        基于 batch-ops 的深度分析逻辑：系统读取会议文本特征（叙事密度、争议性、术语分布、参与者风格），
        从专家库中推荐匹配度最高的几位。你也可以手动追加。
      </p>

      <div className="grid gap-4" style={{ gridTemplateColumns: '1fr 320px' }}>
        <div className="flex flex-col gap-2 max-h-[540px] overflow-y-auto pr-1">
          <div className="flex items-center gap-3 mb-1">
            <div className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">推荐</div>
            <span className="text-xs text-gray-500">按 match 降序 · 根据话题、风格与校准分</span>
          </div>
          {loading && (
            <div className="text-xs text-gray-400 py-6 text-center">加载专家…</div>
          )}
          {!loading && experts.length === 0 && (
            <div className="text-xs text-gray-400 py-6 text-center">暂无可用专家</div>
          )}
          {experts.map((e) => {
            const on = selected.has(e.id);
            return (
              <div
                key={e.id}
                onClick={() => onToggle(e.id)}
                className={`bg-white dark:bg-gray-900 border rounded-lg p-4 cursor-pointer grid items-center gap-3 transition-colors ${
                  on
                    ? 'border-orange-500 ring-1 ring-orange-200 dark:ring-orange-800'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                }`}
                style={{ gridTemplateColumns: '44px 1fr 110px 22px' }}
              >
                <div className="w-11 h-11 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 flex items-center justify-center font-mono text-[11px] font-semibold text-gray-600 dark:text-gray-300">
                  {e.code}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="font-semibold text-[15px]" style={{ fontFamily: 'Source Serif 4, Noto Serif SC, Georgia, serif' }}>{e.name}</div>
                    <span className="font-mono text-[10px] text-gray-400">{e.calibration}</span>
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    {e.field} · <i>{e.style}</i>
                  </div>
                  {e.mentalModels.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {e.mentalModels.slice(0, 3).map((m, i) => (
                        <span key={i} className="font-mono text-[10px] px-1.5 py-0.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded text-gray-600 dark:text-gray-400">
                          {m}
                        </span>
                      ))}
                      {e.mentalModels.length > 3 && (
                        <span className="font-mono text-[10px] text-gray-400">+{e.mentalModels.length - 3}</span>
                      )}
                    </div>
                  )}
                </div>
                <div className="text-right">
                  <div className="text-2xl font-semibold text-orange-600" style={{ fontFamily: 'Source Serif 4, Noto Serif SC, Georgia, serif' }}>
                    {(e.match * 100).toFixed(0)}
                    <span className="text-xs text-gray-400">%</span>
                  </div>
                  <div className="text-[10px] text-gray-400">match</div>
                </div>
                <div className={`w-5 h-5 rounded flex items-center justify-center border ${
                  on ? 'bg-orange-600 border-orange-600 text-white' : 'border-gray-300'
                }`}>
                  {on && '✓'}
                </div>
              </div>
            );
          })}
        </div>

        <aside className="flex flex-col gap-3">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
            <div className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">已选 · {selected.size} 位</div>
            <div className="mt-2 flex flex-col gap-1.5">
              {Array.from(selected).map((id) => {
                const e = experts.find((x) => x.id === id);
                if (!e) return null;
                return (
                  <div key={id} className="flex items-center gap-2 text-xs px-2 py-1.5 bg-gray-50 dark:bg-gray-800 rounded">
                    <span className="font-mono text-[10px] text-gray-400">{e.code}</span>
                    <span className="font-medium truncate">{e.name.split(' · ')[0]}</span>
                    <button
                      onClick={() => onToggle(id)}
                      className="ml-auto text-gray-400 hover:text-red-600"
                    >
                      ×
                    </button>
                  </div>
                );
              })}
              {selected.size === 0 && (
                <div className="text-xs text-gray-400">尚未选择</div>
              )}
            </div>
          </div>

          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
            <div className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">调用预设</div>
            <div className="mt-2 flex flex-col gap-1.5">
              {PRESETS.map((p) => {
                const active = preset === p.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => onPresetChange(p.id)}
                    className={`text-left px-3 py-2.5 rounded-md border transition-colors ${
                      active
                        ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/20'
                        : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
                    }`}
                  >
                    <div className="text-sm font-semibold" style={{ fontFamily: 'Source Serif 4, Noto Serif SC, Georgia, serif' }}>{p.label}</div>
                    <div className="text-[11px] text-gray-500 mt-0.5 leading-snug">{p.position}</div>
                  </button>
                );
              })}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

// ── Step 3: Processing ──────────────────────────────────────────────
function StepProcessing({
  runId, done, errored, tokens, elapsedMs, progress, deliverables, experts, preset, onRetry,
}: {
  runId?: string;
  done: boolean;
  errored?: string;
  tokens: { input: number; output: number };
  elapsedMs: number;
  progress: number;
  deliverables: { k: string; done: boolean }[];
  experts: ExpertCard[];
  preset: PresetId;
  onRetry?: () => void;
}) {
  const steps = PROC_STEPS.map((s, i) => {
    const stepPct = 100 / PROC_STEPS.length;
    const threshold = (i + 1) * stepPct;
    const soft = i * stepPct;
    let pct = 0;
    let state: 'done' | 'running' | 'queued' = 'queued';
    if (done) { pct = 100; state = 'done'; }
    else if (progress >= threshold) { pct = 100; state = 'done'; }
    else if (progress > soft) { pct = Math.round(((progress - soft) / stepPct) * 100); state = 'running'; }
    return { ...s, pct, state };
  });

  const elapsedLabel = (() => {
    const s = Math.floor(elapsedMs / 1000);
    const m = Math.floor(s / 60);
    return `${m}m ${String(s % 60).padStart(2, '0')}s`;
  })();

  return (
    <div>
      <div className="flex items-baseline gap-3 mb-1">
        <h2 className="text-2xl font-semibold tracking-tight" style={{ fontFamily: 'Source Serif 4, Noto Serif SC, Georgia, serif' }}>
          {errored ? '解析出错' : done ? '解析完成' : '正在生成'}
        </h2>
        <span className="text-xs font-mono text-gray-400">
          step 3 / 3 · {preset} preset{runId ? ` · ${runId.slice(0, 8)}` : ''}
        </span>
      </div>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        每一步可观察 · 每一次专家调用都记录 strategy + decorator stack + cost。
      </p>

      <div className="grid gap-4" style={{ gridTemplateColumns: '1fr 360px' }}>
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg max-h-[540px] overflow-y-auto">
          {steps.map((s, i) => (
            <div
              key={s.id}
              className={`px-5 py-4 grid items-center gap-3 ${
                i > 0 ? 'border-t border-gray-100 dark:border-gray-800' : ''
              }`}
              style={{ gridTemplateColumns: '22px 1fr 60px' }}
            >
              <StepDot state={s.state} />
              <div>
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-medium ${
                    s.state === 'queued' ? 'text-gray-400' : ''
                  }`}>
                    {s.label}
                  </span>
                  {s.state === 'running' && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300">
                      running
                    </span>
                  )}
                </div>
                {s.sub && (
                  <div className="font-mono text-[11px] text-gray-400 mt-1.5">{s.sub}</div>
                )}
                <div className="h-[3px] bg-gray-100 dark:bg-gray-800 rounded mt-2.5 overflow-hidden">
                  <div
                    className={`h-full transition-all ${
                      s.state === 'done'
                        ? 'bg-orange-600'
                        : s.state === 'running'
                        ? 'bg-teal-500'
                        : 'bg-gray-300'
                    }`}
                    style={{ width: `${s.pct}%` }}
                  />
                </div>
              </div>
              <span className="text-right font-mono text-[10px] text-gray-400">{s.pct}%</span>
            </div>
          ))}
        </div>

        <aside className="flex flex-col gap-3">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
            <div className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">当前调用</div>
            <div className="font-mono text-[11px] mt-2.5 leading-relaxed text-gray-600 dark:text-gray-300 space-y-0.5">
              <div><span className="text-gray-400">strategy </span>debate</div>
              {experts.slice(0, 3).map((e, i) => (
                <div key={e.id}>
                  <span className="text-gray-400">{i === 0 ? 'expertA   ' : i === 1 ? 'expertB   ' : 'judge     '}</span>
                  {e.code} · {e.name.split(' · ')[0]}
                </div>
              ))}
              <div className="text-gray-400">decorators</div>
              {['failure_check', 'evidence_anchored', 'calibrated_confidence', 'knowledge_grounded', 'rubric_anchored_output'].map((d, i) => (
                <div key={d} className={`pl-3 ${i === 1 && !done ? 'text-teal-600' : ''}`}>
                  {i === 1 && !done ? '▸ ' : '· '}{d}
                </div>
              ))}
            </div>
          </div>
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
            <div className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">实时开销</div>
            <div className="grid grid-cols-2 gap-2 mt-2.5">
              {[
                { l: 'input tokens', v: tokens.input.toLocaleString() },
                { l: 'output tokens', v: tokens.output.toLocaleString() },
                { l: 'experts called', v: String(experts.length) },
                { l: 'elapsed', v: elapsedLabel },
              ].map((x) => (
                <div key={x.l} className="px-2.5 py-2 bg-gray-50 dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700">
                  <div className="font-mono text-[9px] uppercase tracking-wider text-gray-400">{x.l}</div>
                  <div className="text-base font-semibold mt-0.5" style={{ fontFamily: 'Source Serif 4, Noto Serif SC, Georgia, serif' }}>{x.v}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
            <div className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">
              已产出 · {deliverables.filter((d) => d.done).length} / {deliverables.length}
            </div>
            <div className="mt-2 flex flex-col gap-1.5">
              {deliverables.map((d) => (
                <div key={d.k} className="flex items-center gap-2 text-xs">
                  {d.done ? (
                    <span className="text-orange-600">✓</span>
                  ) : (
                    <span className="w-3 h-3 rounded-full border border-gray-300 inline-block" />
                  )}
                  <span className={`${d.done ? '' : 'text-gray-400'}`} style={{ fontFamily: 'Source Serif 4, Noto Serif SC, Georgia, serif' }}>
                    {d.k}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>

      {errored && (
        <div className="mt-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg p-4 flex items-start gap-3">
          <span className="text-red-600 text-lg">⚠</span>
          <div className="flex-1">
            <div className="text-sm font-semibold text-red-800 dark:text-red-300">解析失败</div>
            <div className="text-xs text-red-700 dark:text-red-400 mt-1">{errored}</div>
          </div>
          {onRetry && (
            <button onClick={onRetry} className="text-xs px-3 py-1.5 rounded border border-red-300 text-red-700 hover:bg-red-100 dark:hover:bg-red-900/40">
              重试
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Shell ───────────────────────────────────────────────────────────
export function NewMeeting() {
  const navigate = useNavigate();
  const [step, setStep] = useState<StepId>('upload');

  // step 1 state
  const [uploadMode, setUploadMode] = useState<UploadMode>('files');
  const [files, setFiles] = useState<File[]>([]);
  const [folderPath, setFolderPath] = useState('');

  // step 2 state
  const [experts, setExperts] = useState<ExpertCard[]>([]);
  const [expertsLoading, setExpertsLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [preset, setPreset] = useState<PresetId>('standard');

  // step 3 state
  const [runId, setRunId] = useState<string | undefined>();
  const [done, setDone] = useState(false);
  const [errored, setErrored] = useState<string | undefined>();
  const [progress, setProgress] = useState(0);
  const [tokens, setTokens] = useState({ input: 0, output: 0 });
  const startedAtRef = useRef<number>(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [meetingId, setMeetingId] = useState<string | undefined>();

  // 初始载入专家列表（含 mock fallback）
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await expertsApi.getAll();
        if (cancelled) return;
        const items: Expert[] = ((r as any)?.items ?? []).slice(0, 8) as Expert[];
        if (items.length > 0) {
          const mapped: ExpertCard[] = items.map((e, i) => {
            const any = e as any;
            return {
              id: e.id,
              code: e.code || e.id.slice(0, 6),
              name: `${e.name}${any.profile?.personality ? ` · ${any.profile.personality}` : ''}`,
              field: `${e.domainName || e.domain || '通用'}${e.angle ? ` · ${e.angle}` : ''}`,
              style: any.angle || 'balanced',
              calibration: `cal ${(0.7 + ((e.acceptanceRate ?? 20) / 100) * 0.3).toFixed(2)}`,
              mentalModels: (e.reviewDimensions || []).slice(0, 4),
              match: Math.max(0.5, 1 - i * 0.05),
            };
          });
          setExperts(mapped);
          setSelected(new Set(mapped.slice(0, 3).map((m) => m.id)));
        } else {
          setExperts(MOCK_EXPERTS);
          setSelected(new Set(MOCK_EXPERTS.slice(0, 3).map((m) => m.id)));
        }
      } catch {
        if (cancelled) return;
        setExperts(MOCK_EXPERTS);
        setSelected(new Set(MOCK_EXPERTS.slice(0, 3).map((m) => m.id)));
      } finally {
        if (!cancelled) setExpertsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // 开始解析
  const startProcessing = useCallback(async () => {
    setStep('processing');
    setErrored(undefined);
    setDone(false);
    setProgress(0);
    setTokens({ input: 0, output: 0 });
    startedAtRef.current = Date.now();

    try {
      // 1) 上传文件（若有）
      if (uploadMode === 'files' && files.length > 0) {
        // 找 upload 类型的 source，没有就建一个
        const srcResp = await meetingNotesApi.listSources();
        let sourceId = srcResp.items.find((s: any) => s.kind === 'upload')?.id;
        if (!sourceId) {
          throw new Error('未找到 upload 类型的采集渠道，请先到会议纪要设置创建一个');
        }
        for (const f of files) {
          await meetingNotesApi.uploadToSource(sourceId, f);
          setProgress((p) => Math.min(25, p + 25 / files.length));
        }
      } else {
        setProgress(20);
      }

      // 2) 启动 run
      const runRes = await meetingNotesApi.enqueueRun({
        scope: { kind: 'meeting', ref: meetingId ?? `upload-${Date.now()}` },
        axis: 'meta',
        preset,
        strategy: 'debate',
        triggeredBy: 'new-meeting-wizard',
      });
      if (!runRes.ok || !runRes.runId) {
        throw new Error(runRes.reason || '创建 run 失败');
      }
      setRunId(runRes.runId);
      setProgress(35);

      // 3) 轮询 run 状态
      const pollStart = Date.now();
      while (Date.now() - pollStart < 300_000) {
        await new Promise((r) => setTimeout(r, 1500));
        try {
          const run = await meetingNotesApi.getRun(runRes.runId);
          if (run?.tokens) setTokens({ input: run.tokens.input ?? 0, output: run.tokens.output ?? 0 });
          if (run?.progress) setProgress(Math.min(95, 35 + Math.round(run.progress * 60)));
          if (run?.state === 'succeeded') {
            setProgress(100);
            setMeetingId(run.meetingId ?? run.scopeRef ?? undefined);
            setDone(true);
            return;
          }
          if (run?.state === 'failed' || run?.state === 'cancelled') {
            throw new Error(run.error || `run ${run.state}`);
          }
        } catch (err: any) {
          // 单次轮询失败容忍，但不中止
          console.warn('poll run error', err);
        }
      }
      throw new Error('解析超时（5 分钟）');
    } catch (e: any) {
      setErrored(e?.message || '未知错误');
    }
  }, [files, uploadMode, preset, meetingId]);

  // elapsed 计时
  useEffect(() => {
    if (step !== 'processing' || done || errored) return;
    const t = setInterval(() => setElapsedMs(Date.now() - startedAtRef.current), 500);
    return () => clearInterval(t);
  }, [step, done, errored]);

  // 解析完成 → 2 秒后跳转多视图
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => {
      const target = meetingId ? `/meeting-notes/${meetingId}` : '/meeting-notes/axes/people';
      navigate(target, { state: { justParsed: true, runId } });
    }, 2200);
    return () => clearTimeout(t);
  }, [done, meetingId, runId, navigate]);

  const deliverables = useMemo(() => {
    const keys = [
      '① topic-enrich',
      'step3-fact-review',
      '⑫ consensus',
      '⑬ controversy',
      '⑩ insights',
      '⑭ beliefEvolution',
      'step5-synthesis',
    ];
    return keys.map((k, i) => ({ k, done: done || progress > (i + 1) * (100 / keys.length) }));
  }, [done, progress]);

  const canNext = useMemo(() => {
    if (step === 'upload') {
      if (uploadMode === 'files') return files.length > 0;
      if (uploadMode === 'folder') return folderPath.trim().length > 0;
      return false;
    }
    if (step === 'experts') return selected.size > 0;
    return false;
  }, [step, uploadMode, files, folderPath, selected]);

  const toggleExpert = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-gray-950 px-10 py-6">
      {/* 顶栏 */}
      <div className="flex items-center justify-between mb-6 pb-4 border-b border-gray-200 dark:border-gray-800">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-gray-400 font-mono mb-1">Meeting Intelligence</div>
          <h1 className="text-xl font-semibold" style={{ fontFamily: 'Source Serif 4, Noto Serif SC, Georgia, serif' }}>
            新建会议纪要
          </h1>
        </div>
        <div className="flex items-center gap-4">
          <Stepper step={step} />
          <button
            onClick={() => navigate('/meeting-notes/library')}
            className="text-xs text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
          >
            取消
          </button>
        </div>
      </div>

      {/* 步骤正文 */}
      <div className="max-w-[1100px] mx-auto">
        {step === 'upload' && (
          <StepUpload
            files={files}
            onFilesChange={setFiles}
            mode={uploadMode}
            onModeChange={setUploadMode}
            folderPath={folderPath}
            onFolderPathChange={setFolderPath}
          />
        )}
        {step === 'experts' && (
          <StepExperts
            experts={experts}
            selected={selected}
            onToggle={toggleExpert}
            preset={preset}
            onPresetChange={setPreset}
            loading={expertsLoading}
          />
        )}
        {step === 'processing' && (
          <StepProcessing
            runId={runId}
            done={done}
            errored={errored}
            tokens={tokens}
            elapsedMs={elapsedMs}
            progress={progress}
            deliverables={deliverables}
            experts={experts.filter((e) => selected.has(e.id))}
            preset={preset}
            onRetry={startProcessing}
          />
        )}
      </div>

      {/* 底部动作 */}
      {step !== 'processing' && (
        <div className="max-w-[1100px] mx-auto flex items-center justify-end gap-3 mt-8 pt-4 border-t border-gray-200 dark:border-gray-800">
          {step !== 'upload' ? (
            <button
              onClick={() => setStep(step === 'experts' ? 'upload' : 'experts')}
              className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
            >
              ← 上一步
            </button>
          ) : (
            <div className="flex-1" />
          )}
          <button
            disabled={!canNext}
            onClick={() => {
              if (step === 'upload') setStep('experts');
              else if (step === 'experts') void startProcessing();
            }}
            className="px-5 py-2 text-sm font-medium bg-gray-900 text-white dark:bg-white dark:text-gray-900 rounded disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {step === 'upload' ? '继续 · 选择专家' : '生成会议纪要 →'}
          </button>
        </div>
      )}

      {/* Processing 完成后的底栏 banner */}
      {step === 'processing' && done && (
        <div className="max-w-[1100px] mx-auto mt-6 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-700 rounded-lg p-4 flex items-center gap-4">
          <div className="w-8 h-8 rounded-full bg-orange-600 flex items-center justify-center text-white">✓</div>
          <div className="flex-1">
            <div className="font-semibold" style={{ fontFamily: 'Source Serif 4, Noto Serif SC, Georgia, serif' }}>
              解析完成 · 正在进入多维视图…
            </div>
            <div className="text-xs text-gray-500 mt-1 font-mono">
              run {runId?.slice(0, 8)} · {(elapsedMs / 1000).toFixed(0)}s · {(tokens.input + tokens.output).toLocaleString()} tokens
            </div>
          </div>
          <button
            onClick={() => navigate(meetingId ? `/meeting-notes/${meetingId}` : '/meeting-notes/axes/people', { state: { justParsed: true, runId } })}
            className="text-xs px-4 py-2 bg-gray-900 text-white dark:bg-white dark:text-gray-900 rounded"
          >
            立即进入 →
          </button>
        </div>
      )}
    </div>
  );
}

export default NewMeeting;
