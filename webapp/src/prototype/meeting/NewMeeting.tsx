// NewMeeting — 新建会议纪要向导（3 步）
// 原型来源：/tmp/mn-proto/strategy-panel.jsx FlowUpload / FlowExperts / FlowProcessing

import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Icon, Chip, MonoMeta, SectionLabel } from './_atoms';
import { EXPERTS, ExpertMock } from './_fixtures';
import { meetingNotesApi } from '../../api/meetingNotes';
import { bindingsApi, expertLibraryApi } from '../../api/client';
import { EXPERT_API_KEYS } from '../../hooks/useExpertApi';
import { useCachedData } from '../../hooks/useSWRConfig';
import { useForceMock } from './_mockToggle';

function adaptExpertFullRow(e: Record<string, unknown>): ExpertMock {
  const profile = e.profile as Record<string, string> | undefined;
  const philosophy = e.philosophy as { core?: string[]; quotes?: string[] } | undefined;
  return {
    id: String(e.id),
    name: String(e.name ?? ''),
    field: String(e.domainName ?? ''),
    style: String(profile?.personality ?? profile?.title ?? ''),
    match: 0.8,
    calibration: '',
    mentalModels: Array.isArray(philosophy?.core)
      ? (philosophy.core as string[])
      : Array.isArray(e.reviewDimensions)
        ? (e.reviewDimensions as string[])
        : [],
    signature: String(philosophy?.quotes?.[0] ?? ''),
    recommendedFor: [],
    selected: false,
  };
}

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
  const normalizePath = (p: string) =>
    p.trim().replace(/\\/g, '/').replace(/\/+$/, '');
  const forceMock = useForceMock();
  const [mode, setMode] = useState<'files' | 'folder' | 'recent'>('files');
  const [uploading, setUploading] = useState(false);
  const [uploadDone, setUploadDone] = useState(false);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [uploadIssue, setUploadIssue] = useState<string | null>(null);
  const [uploadedName, setUploadedName] = useState<string | null>(null);
  const [folderPath, setFolderPath] = useState('');
  const [bindingFolder, setBindingFolder] = useState(false);
  const [folderHint, setFolderHint] = useState<string | null>(null);
  const [recentLoading, setRecentLoading] = useState(false);
  const [recentError, setRecentError] = useState<string | null>(null);
  const [recentItems, setRecentItems] = useState<Array<{
    id: string;
    t: string;
    title: string;
    n: string;
    assetId: string | null;
  }>>([]);
  const [selectedRecentId, setSelectedRecentId] = useState<string | null>(null);
  const [folderPreviewLoading, setFolderPreviewLoading] = useState(false);
  const [folderPreviewError, setFolderPreviewError] = useState<string | null>(null);
  const [folderPreviewItems, setFolderPreviewItems] = useState<string[]>([]);
  const [activeBindingId, setActiveBindingId] = useState<string | null>(null);
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
    setUploadDone(false);
    setSelectedAssetId(null);
    setUploadIssue(null);
    if (forceMock) {
      onUploaded(null);
      setUploadDone(true);
      return;
    }
    setUploading(true);
    try {
      const sources = await meetingNotesApi.listSources();
      const sourceId = sources.items?.[0]?.id ?? 'meetings';
      const r: {
        assetId?: string;
        assetIds?: string[];
        id?: string;
        status?: string;
        errorMessage?: string | null;
        itemsImported?: number;
      } = await meetingNotesApi.uploadToSource(sourceId, file);
      // /sources/:id/upload 返回的是 import 记录，id 通常是 importId，不是 assets.id。
      // 这里必须优先使用 assetIds[0]（或显式 assetId），否则 parse 会拿错 id 返回 404。
      let resolvedAssetId = r.assetId ?? (Array.isArray(r.assetIds) ? (r.assetIds[0] ?? null) : null);
      // 某些后端分支可能返回导入记录但未内联 assetIds，这里立刻从历史补一次。
      if (!resolvedAssetId) {
        try {
          const history = await meetingNotesApi.getSourceHistory({ sourceId, limit: 5 });
          resolvedAssetId = (history.items ?? [])
            .flatMap((item: any) => (Array.isArray(item?.assetIds) ? item.assetIds : []))
            .find((id: unknown) => typeof id === 'string' && id.length > 0) ?? null;
        } catch (historyErr) {
          console.warn('fallback getSourceHistory failed:', historyErr);
        }
      }
      const finalAssetId = resolvedAssetId ?? null;
      setSelectedAssetId(finalAssetId);
      onUploaded(finalAssetId);
      if (!finalAssetId) {
        setUploadIssue(
          r.errorMessage
            || (r.status && r.status !== 'succeeded'
              ? `上传入库失败（${r.status}）`
              : '上传完成，但后端未返回可解析资产 ID')
        );
      }
    } catch (e) {
      console.warn('upload failed, demo fallback:', e);
      setSelectedAssetId(null);
      onUploaded(null);
      setUploadIssue(e instanceof Error ? e.message : '上传请求失败');
    } finally {
      setUploading(false);
      setUploadDone(true);
    }
  }

  async function handleBindFolder() {
    const path = normalizePath(folderPath);
    if (!path) return;
    if (forceMock) {
      setFolderHint(`已绑定目录: ${path}`);
      setUploadDone(true);
      setSelectedAssetId(null);
      onUploaded(null);
      return;
    }
    setBindingFolder(true);
    setFolderHint(null);
    try {
      const listed = await bindingsApi.getAll();
      let binding = (listed ?? []).find((b: any) =>
        normalizePath(String(b?.path ?? '')) === path,
      );
      if (!binding) {
        binding = await bindingsApi.create({
          name: `Meeting Folder · ${path.split('/').filter(Boolean).slice(-1)[0] || 'meeting-notes'}`,
          path,
          auto_import: true,
        });
      }
      try {
        await bindingsApi.scan(binding.id);
      } catch (scanErr) {
        console.warn('binding scan failed:', scanErr);
      }
      setActiveBindingId(binding.id);
      setSelectedAssetId(null);
      onUploaded(null);
      setUploadDone(true);
      setFolderHint(`已绑定目录: ${path}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '目录绑定失败';
      setFolderHint(msg);
    } finally {
      setBindingFolder(false);
    }
  }

  useEffect(() => {
    if (mode !== 'folder') return;
    const path = normalizePath(folderPath);
    if (!path) {
      setFolderPreviewItems([]);
      setFolderPreviewError(null);
      setFolderPreviewLoading(false);
      setActiveBindingId(null);
      return;
    }
    let cancelled = false;
    setFolderPreviewLoading(true);
    setFolderPreviewError(null);
    const loadPreview = async () => {
      try {
        let bindingId = activeBindingId;
        if (!bindingId) {
          const all = await bindingsApi.getAll();
          const matched = (all ?? []).find((b: any) => normalizePath(String(b?.path ?? '')) === path);
          if (!matched) {
            setFolderPreviewItems([]);
            return;
          }
          bindingId = matched.id;
          setActiveBindingId(matched.id);
        }
        let latest: string[] = [];
        // scan 后 tracked_files 可能稍后落库，短轮询几次避免误报“暂无文件”
        for (let i = 0; i < 4; i += 1) {
          const filesResp = await bindingsApi.listFiles(bindingId, { limit: 50, offset: 0 });
          latest = (filesResp.items ?? []).map((f: any) =>
            String(f.relative_path ?? f.path ?? f.file_path ?? '').trim(),
          ).filter(Boolean);
          if (latest.length > 0) break;
          await new Promise((r) => setTimeout(r, 800));
        }
        if (!cancelled) setFolderPreviewItems(latest);
      } catch (err: unknown) {
        if (cancelled) return;
        setFolderPreviewError(err instanceof Error ? err.message : '读取目录预览失败');
        setFolderPreviewItems([]);
      } finally {
        if (!cancelled) setFolderPreviewLoading(false);
      }
    };
    void loadPreview();
    return () => { cancelled = true; };
  }, [mode, folderPath, activeBindingId]);

  useEffect(() => {
    if (mode !== 'recent') return;
    if (forceMock) {
      setRecentItems([
        { id: 'mock-1', t: '2026-03-28', title: '远翎资本 · Q1 复盘 · 基础设施方向', n: '8 人 · 142 分钟', assetId: null },
        { id: 'mock-2', t: '2026-03-14', title: '团队内部 · 推理层 subadvisor 选择讨论', n: '4 人 · 68 分钟', assetId: null },
        { id: 'mock-3', t: '2026-02-22', title: 'LP 沟通会 · Q1 进度披露', n: '12 人 · 95 分钟', assetId: null },
      ]);
      return;
    }
    setRecentLoading(true);
    setRecentError(null);
    meetingNotesApi.getSourceHistory({ limit: 20 })
      .then((r) => {
        const mapped = (r.items ?? []).map((x: any, idx: number) => {
          const dt = x.startedAt || x.finishedAt || new Date().toISOString();
          const timeLabel = new Date(dt).toLocaleString('zh-CN', {
            month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
          });
          const status = x.status || 'unknown';
          const sourceLabel = x.sourceId ? String(x.sourceId).slice(0, 8) : 'unknown';
          return {
            id: x.id ?? `history-${idx}`,
            t: timeLabel,
            title: `导入 ${status} · source ${sourceLabel}`,
            n: `${x.itemsImported ?? 0} 条导入 / ${x.itemsDiscovered ?? 0} 条发现`,
            assetId: Array.isArray(x.assetIds) ? (x.assetIds[0] ?? null) : null,
          };
        });
        setRecentItems(mapped);
      })
      .catch((err: unknown) => {
        setRecentError(err instanceof Error ? err.message : '读取历史失败');
        setRecentItems([]);
      })
      .finally(() => setRecentLoading(false));
  }, [mode, forceMock]);

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
            <input
              value={folderPath}
              onChange={(e) => setFolderPath(e.target.value)}
              placeholder="/absolute/path/to/meetings"
              style={{
                marginTop: 12, width: '100%', padding: '12px 14px',
                background: 'var(--paper-2)', borderRadius: 6, fontFamily: 'var(--mono)',
                fontSize: 12, border: '1px solid var(--line-2)',
              }}
            />
            <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 10, lineHeight: 1.6 }}>
              目录中任何新增文件都会被持续索引，并按同一套原始素参考规则挂载到下一次会议纪要。
            </div>
            <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={handleBindFolder}
                disabled={bindingFolder || !folderPath.trim()}
                style={{
                  padding: '8px 12px', borderRadius: 4, border: '1px solid var(--ink)',
                  background: 'var(--ink)', color: 'var(--paper)', fontSize: 12,
                  opacity: bindingFolder || !folderPath.trim() ? 0.5 : 1,
                  cursor: bindingFolder || !folderPath.trim() ? 'not-allowed' : 'pointer',
                }}
              >
                {bindingFolder ? '绑定中…' : '绑定并索引'}
              </button>
              {folderHint && (
                <span style={{ fontSize: 12, color: 'var(--ink-3)', alignSelf: 'center' }}>{folderHint}</span>
              )}
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
              {folderPreviewLoading && (
                <div style={{ fontSize: 12, color: 'var(--ink-3)', padding: '8px 4px' }}>加载目录文件中…</div>
              )}
              {!folderPreviewLoading && folderPreviewError && (
                <div style={{ fontSize: 12, color: 'var(--ink-3)', padding: '8px 4px' }}>读取失败: {folderPreviewError}</div>
              )}
              {!folderPreviewLoading && !folderPreviewError && folderPreviewItems.length === 0 && (
                <div style={{ fontSize: 12, color: 'var(--ink-3)', padding: '8px 4px' }}>
                  暂无可预览文件（请先完成绑定并确认目录下有可索引文件）
                </div>
              )}
              {!folderPreviewLoading && !folderPreviewError && folderPreviewItems.map((f, i) => (
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
          {recentLoading && (
            <div style={{ padding: '22px 20px', fontSize: 12, color: 'var(--ink-3)' }}>正在读取历史记录…</div>
          )}
          {!recentLoading && recentError && (
            <div style={{ padding: '22px 20px', fontSize: 12, color: 'var(--ink-3)' }}>读取历史失败: {recentError}</div>
          )}
          {!recentLoading && !recentError && recentItems.length === 0 && (
            <div style={{ padding: '22px 20px', fontSize: 12, color: 'var(--ink-3)' }}>暂无历史导入记录</div>
          )}
          {!recentLoading && !recentError && recentItems.map((x, i) => (
            <div
              key={x.id}
              onClick={() => {
                setSelectedRecentId(x.id);
                setSelectedAssetId(x.assetId);
                onUploaded(x.assetId);
                setUploadDone(Boolean(x.assetId));
              }}
              style={{
              display: 'grid', gridTemplateColumns: '120px 1fr 200px 24px', gap: 14, alignItems: 'center',
              padding: '14px 20px', borderTop: i === 0 ? 'none' : '1px solid var(--line-2)',
              background: selectedRecentId === x.id ? 'var(--paper-2)' : 'transparent',
              cursor: 'pointer',
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
        <button
          style={{ ...btnPrimary, ...((mode === 'files' && uploading) || (mode === 'folder' && bindingFolder) ? { opacity: 0.5, cursor: 'not-allowed' } : {}) }}
          onClick={onNext}
          disabled={
            (mode === 'files' && uploading)
            || (mode === 'files' && (!uploadDone || !selectedAssetId))
            || (mode === 'folder' && bindingFolder)
            || (mode === 'folder' && !uploadDone)
            || (mode === 'recent' && (!uploadDone || !selectedAssetId))
          }
        >
          {uploading
            ? '上传中…'
            : mode === 'folder' && bindingFolder
              ? '绑定中…'
              : uploadDone
                ? '已选择 · 继续'
                : '继续 · 选择专家'}
        </button>
      </div>
      {mode === 'files' && uploadDone && !selectedAssetId && (
        <div style={{ marginTop: 8, fontSize: 12, color: 'var(--ink-3)' }}>
          {uploadIssue ?? '上传已完成但未拿到可解析资产 ID，请重传一次文件或切换到“从历史中选”。'}
        </div>
      )}
      {mode === 'recent' && selectedRecentId && !selectedAssetId && (
        <div style={{ marginTop: 8, fontSize: 12, color: 'var(--ink-3)' }}>
          该历史记录没有可用资产，请选择其他记录（需 itemsImported {'>'} 0）。
        </div>
      )}
    </div>
  );
}

// ── Step 2: FlowExperts ───────────────────────────────────────────────────────

type MnRoleId = 'people' | 'projects' | 'knowledge';

const MN_ROLE_OPTIONS: Array<{ id: MnRoleId; label: string; hint: string }> = [
  { id: 'people',    label: '人事/团队',     hint: '承诺、发言质量、沉默信号、角色轨迹' },
  { id: 'projects',  label: '项目/决策',     hint: '决策出处、假设、开放问题、风险热度' },
  { id: 'knowledge', label: '知识/认知/张力', hint: '判断、心智模型、偏差、反事实、情绪曲线、张力' },
];

/**
 * 首次加载时的默认选择（按用户配置）。expertsReady 后若 expertList 里存在这些 id，
 * 就直接预选并落 role；缺失的 role 再 fallback 到 guessRoleFromExpert + match 排序。
 */
const DEFAULT_EXPERT_PICKS: Array<{ id: string; role: MnRoleId }> = [
  { id: 'E08-08', role: 'people' },     // 左晖
  { id: 'S-06',   role: 'projects' },   // 任正非
  { id: 'S-03',   role: 'projects' },   // 马斯克
  { id: 'S-40',   role: 'knowledge' },  // Andrej Karpathy
];

function guessRoleFromExpert(e: ExpertMock): MnRoleId {
  // 极简启发：从 field/style/mentalModels 里搜关键词，命中即给对应角色；否则默认 knowledge
  const txt = `${e.field} ${e.style} ${(e.mentalModels ?? []).join(' ')}`.toLowerCase();
  if (/团队|人事|沟通|承诺|领导|hr|管理|coaching/.test(txt)) return 'people';
  if (/决策|风险|项目|战略|财务|商业|产品/.test(txt)) return 'projects';
  return 'knowledge';
}

function FlowExperts({ onNext, onBack, onSubmit }: {
  onNext: () => void;
  onBack: () => void;
  onSubmit: (body: { presetId: string; expertIds: string[]; expertRoles: Record<MnRoleId, string[]> }) => Promise<boolean>;
}) {
  const pageSize = 8;
  const slowThresholdMs = 5000;
  const forceMock = useForceMock();
  const expertsSwr = useCachedData(
    forceMock ? null : EXPERT_API_KEYS.experts(),
    () => expertLibraryApi.getExpertsFull(),
  );
  const { data: expertsPayload, isLoading: expertsLoading } = expertsSwr;

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [roleMap, setRoleMap] = useState<Record<string, MnRoleId>>({});
  const [presetId, setPresetId] = useState('standard');
  const [nameKeyword, setNameKeyword] = useState('');
  const [page, setPage] = useState(1);
  const [slowHint, setSlowHint] = useState(false);
  const [enqueueing, setEnqueueing] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const normalizedKeyword = nameKeyword.trim().toLowerCase();

  const adaptedRemote = useMemo(() => {
    const rows = expertsPayload?.experts ?? [];
    return rows.map((e: Record<string, unknown>) => adaptExpertFullRow(e));
  }, [expertsPayload]);

  const expertList = useMemo(() => {
    if (forceMock) return EXPERTS;
    return adaptedRemote.length > 0 ? adaptedRemote : EXPERTS;
  }, [forceMock, adaptedRemote]);

  /**
   * 真实专家库是否已就绪：mock 模式直接 ready；非 mock 模式需等 SWR 完成且后端真返了数据。
   * 没 ready 时 expertList 是 EXPERTS（mock fallback），不要 auto-select 进 selectedIds，
   * 否则会被后续 prune 移走（产业链测绘师等 mock-only id），又触发新一轮 auto-select 重复添加。
   */
  const expertsReady = forceMock || (!expertsLoading && adaptedRemote.length > 0);

  const toggle = (id: string) => {
    setSelectedIds(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      return [...prev, id];
    });
    setRoleMap(prev => {
      if (prev[id]) {
        const { [id]: _, ...rest } = prev;
        return rest;
      }
      const e = expertList.find(x => x.id === id);
      if (!e) return prev;
      return { ...prev, [id]: guessRoleFromExpert(e) };
    });
  };
  const setExpertRole = (id: string, role: MnRoleId) => {
    setRoleMap(prev => ({ ...prev, [id]: role }));
  };

  useEffect(() => {
    if (!forceMock) return;
    const ids = EXPERTS.filter(e => e.selected).map(e => e.id);
    setSelectedIds(ids);
    // mock 默认选中也要带 role
    setRoleMap(prev => {
      const next: Record<string, MnRoleId> = { ...prev };
      for (const id of ids) {
        if (!next[id]) {
          const e = EXPERTS.find(x => x.id === id);
          if (e) next[id] = guessRoleFromExpert(e);
        }
      }
      return next;
    });
  }, [forceMock]);

  // 当真实 expertList 切换（SWR 完成 / 切到/出 mock）时，把 selectedIds 限制在 expertList 内
  // 同时去重，去掉之前的 mock-only id（如 E04-12 产业链测绘师）和重复添加
  useEffect(() => {
    if (!expertsReady) return;
    const valid = new Set(expertList.map(e => e.id));
    setSelectedIds(prev => {
      const seen = new Set<string>();
      const next: string[] = [];
      for (const id of prev) {
        if (valid.has(id) && !seen.has(id)) {
          seen.add(id);
          next.push(id);
        }
      }
      return next.length === prev.length && next.every((v, i) => v === prev[i]) ? prev : next;
    });
    setRoleMap(prev => {
      const next: Record<string, MnRoleId> = {};
      for (const [id, role] of Object.entries(prev)) {
        if (valid.has(id)) next[id] = role;
      }
      return Object.keys(next).length === Object.keys(prev).length ? prev : next;
    });
  }, [expertsReady, expertList]);

  // 自动选择：等专家库 ready 后，先按 DEFAULT_EXPERT_PICKS 预选；剩余缺口再按
  // match 降序 + guessRole 启发补；候选只来自 expertList，不会选到 mock-only id。
  useEffect(() => {
    if (!expertsReady) return;
    if (expertList.length === 0) return;
    const ALL_ROLES: MnRoleId[] = ['people', 'projects', 'knowledge'];
    const adds: Array<{ id: string; role: MnRoleId }> = [];
    const used = new Set<string>(selectedIds);
    const validIds = new Set(expertList.map(e => e.id));

    // 1) 首次预选：DEFAULT_EXPERT_PICKS 中存在于专家库的项，全部追加
    if (selectedIds.length === 0) {
      for (const pick of DEFAULT_EXPERT_PICKS) {
        if (validIds.has(pick.id) && !used.has(pick.id)) {
          adds.push(pick);
          used.add(pick.id);
        }
      }
    }

    // 2) 再做"每个角色至少一位"补缺：合并 selectedIds 已有 role 与本轮 adds 的 role
    const haveRoles = new Set<MnRoleId>();
    for (const id of selectedIds) {
      const r = roleMap[id];
      if (r) haveRoles.add(r);
    }
    for (const a of adds) haveRoles.add(a.role);
    const missing = ALL_ROLES.filter(role => !haveRoles.has(role));

    if (missing.length > 0) {
      const sorted = [...expertList].sort((a, b) => b.match - a.match);
      for (const role of missing) {
        let cand = sorted.find(e => !used.has(e.id) && guessRoleFromExpert(e) === role);
        if (!cand) cand = sorted.find(e => !used.has(e.id));
        if (cand) {
          adds.push({ id: cand.id, role });
          used.add(cand.id);
        }
      }
    }

    if (adds.length === 0) return;
    // 用 union 而非 append：double-invoke 或 race 也不会重复
    setSelectedIds(prev => {
      const set = new Set(prev);
      for (const a of adds) set.add(a.id);
      return set.size === prev.length ? prev : [...set];
    });
    setRoleMap(prev => {
      const next = { ...prev };
      for (const a of adds) next[a.id] = a.role;
      return next;
    });
  }, [expertsReady, expertList, selectedIds, roleMap]);

  useEffect(() => {
    if (forceMock || !expertsLoading) {
      setSlowHint(false);
      return;
    }
    const t = window.setTimeout(() => setSlowHint(true), slowThresholdMs);
    return () => window.clearTimeout(t);
  }, [forceMock, expertsLoading]);

  const sortedExperts = useMemo(
    () => [...expertList].sort((a, b) => b.match - a.match),
    [expertList],
  );
  const filteredExperts = useMemo(() => {
    if (!normalizedKeyword) return sortedExperts;
    return sortedExperts.filter(e =>
      `${e.name} ${e.id}`.toLowerCase().includes(normalizedKeyword),
    );
  }, [sortedExperts, normalizedKeyword]);
  const totalPages = Math.max(1, Math.ceil(filteredExperts.length / pageSize));
  const pagedExperts = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredExperts.slice(start, start + pageSize);
  }, [filteredExperts, page]);

  useEffect(() => {
    setPage(1);
  }, [normalizedKeyword, expertList.length]);
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);
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
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 2 }}>
            <input
              value={nameKeyword}
              onChange={e => setNameKeyword(e.target.value)}
              placeholder="按名字筛选（支持 id）"
              style={{
                flex: 1,
                minWidth: 240,
                padding: '8px 10px',
                border: '1px solid var(--line-2)',
                borderRadius: 6,
                fontSize: 12.5,
                background: 'var(--paper)',
                color: 'var(--ink)',
                fontFamily: 'var(--sans)',
              }}
            />
            {nameKeyword.trim() && (
              <button
                type="button"
                onClick={() => setNameKeyword('')}
                style={{
                  padding: '7px 10px',
                  border: '1px solid var(--line)',
                  borderRadius: 5,
                  background: 'var(--paper)',
                  color: 'var(--ink-2)',
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                清空
              </button>
            )}
            <MonoMeta>{filteredExperts.length} / {expertList.length}</MonoMeta>
          </div>
          {!forceMock && expertsLoading && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              fontSize: 12, color: 'var(--ink-3)',
              background: 'var(--paper)', border: '1px solid var(--line-2)',
              borderRadius: 8, padding: '6px 10px',
            }}>
              <div style={{
                width: 12, height: 12, borderRadius: 99, flexShrink: 0,
                border: '2px solid var(--line)', borderTopColor: 'transparent',
                animation: 'mn-spin 0.85s linear infinite',
              }} />
              <style>{`@keyframes mn-spin{to{transform:rotate(360deg)}}`}</style>
              <span>正在同步服务器专家名单… 下方可先选本地预览，完成后自动替换为库内数据。</span>
            </div>
          )}
          {slowHint && (
            <div style={{
              fontSize: 12, color: 'var(--ink-3)',
              background: 'var(--paper)', border: '1px dashed var(--line)',
              borderRadius: 8, padding: '8px 10px',
            }}>
              接口响应较慢，已先展示本地专家，可直接继续选择。
            </div>
          )}
          {pagedExperts.map(e => {
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
          {filteredExperts.length === 0 && (
            <div style={{
              background: 'var(--paper)',
              border: '1px dashed var(--line)',
              borderRadius: 8,
              padding: '18px 16px',
              fontSize: 12.5,
              color: 'var(--ink-3)',
            }}>
              没有匹配的专家，请尝试更短的关键词。
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 }}>
            <MonoMeta>第 {page} / {totalPages} 页</MonoMeta>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1}
                style={{
                  padding: '6px 10px',
                  border: '1px solid var(--line)',
                  borderRadius: 5,
                  background: 'var(--paper)',
                  color: 'var(--ink-2)',
                  cursor: page <= 1 ? 'not-allowed' : 'pointer',
                  opacity: page <= 1 ? 0.5 : 1,
                  fontSize: 12,
                }}
              >
                上一页
              </button>
              <button
                type="button"
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                style={{
                  padding: '6px 10px',
                  border: '1px solid var(--line)',
                  borderRadius: 5,
                  background: 'var(--paper)',
                  color: 'var(--ink-2)',
                  cursor: page >= totalPages ? 'not-allowed' : 'pointer',
                  opacity: page >= totalPages ? 0.5 : 1,
                  fontSize: 12,
                }}
              >
                下一页
              </button>
            </div>
          </div>
        </div>

        <aside style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ background: 'var(--paper)', border: '1px solid var(--line-2)', borderRadius: 8, padding: '16px 18px' }}>
            <SectionLabel>已选 · {selectedIds.length} 位</SectionLabel>
            <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 4, lineHeight: 1.5 }}>
              请为每位专家指定角色：决定 Step 3 哪一组维度（人事/项目/知识）会以这位专家的视角输出。
            </div>
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {selectedIds.map(id => {
                const e = expertList.find(x => x.id === id);
                if (!e) return null;
                const role = roleMap[id] ?? 'knowledge';
                return (
                  <div key={id} style={{
                    display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12.5,
                    padding: '8px 10px', background: 'var(--paper-2)', borderRadius: 4,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <MonoMeta>{e.id}</MonoMeta>
                      <span style={{ fontWeight: 500 }}>{e.name.split(' · ')[0]}</span>
                      <button
                        type="button"
                        onClick={() => toggle(id)}
                        title="移除该专家"
                        style={{
                          marginLeft: 'auto',
                          width: 22,
                          height: 22,
                          padding: 0,
                          border: '1px solid var(--line-2)',
                          background: 'var(--paper)',
                          color: 'var(--ink-3)',
                          borderRadius: 4,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Icon name="x" size={12} />
                      </button>
                    </div>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {MN_ROLE_OPTIONS.map(opt => {
                        const active = role === opt.id;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            title={opt.hint}
                            onClick={() => setExpertRole(id, opt.id)}
                            style={{
                              padding: '4px 8px',
                              borderRadius: 4,
                              border: active ? '1px solid var(--accent)' : '1px solid var(--line-2)',
                              background: active ? 'var(--accent-soft)' : 'var(--paper)',
                              color: active ? 'oklch(0.35 0.1 40)' : 'var(--ink-2)',
                              fontSize: 11.5,
                              fontFamily: 'var(--sans)',
                              cursor: 'pointer',
                            }}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
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
            <button
              style={{ ...btnPrimary, flex: 1, ...(enqueueing ? { opacity: 0.7, cursor: 'not-allowed' } : {}) }}
              disabled={enqueueing}
              onClick={async () => {
                setEnqueueing(true);
                setSubmitError(null);
                // 聚合已选专家 → 角色 id 列表
                const expertRoles: Record<MnRoleId, string[]> = { people: [], projects: [], knowledge: [] };
                for (const id of selectedIds) {
                  const role = roleMap[id];
                  if (role) expertRoles[role].push(id);
                }
                const ok = await onSubmit({ presetId, expertIds: selectedIds, expertRoles });
                setEnqueueing(false);
                if (ok) onNext();
                else setSubmitError('任务未成功入队：请先上传可解析的会议纪要文件，再重试。');
              }}
            >{enqueueing ? '入队中…' : '生成会议纪要 →'}</button>
          </div>
          {submitError && (
            <div style={{ marginTop: 8, fontSize: 12, color: 'var(--ink-3)' }}>
              {submitError}
            </div>
          )}
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
  onBack, runId, onViewRun, onGoMultiView, onRetry,
}: {
  onBack: () => void;
  runId: string | null;
  onViewRun: (runId: string) => void;
  onGoMultiView: (meetingId: string) => void;
  onRetry: () => Promise<boolean>;
}) {
  const [tick, setTick] = useState(0);
  const [done, setDone] = useState(false);
  const [realRunId, setRealRunId] = useState<string | null>(runId);
  const [realMeetingId, setRealMeetingId] = useState<string | null>(null);
  const [realProgress, setRealProgress] = useState<number | null>(null);
  // Phase 15.6 · getRun 扩 tokens/cost/currentStep
  const [realTokens, setRealTokens] = useState<{ input: number; output: number } | null>(null);
  const [realCostUsd, setRealCostUsd] = useState<number | null>(null);
  const [realCurrentStep, setRealCurrentStep] = useState<string | null>(null);
  // Phase 15.8 · 后端落库的 6 步标记 + dispatchPlan / decorators / synthesis / render
  const [realCurrentStepKey, setRealCurrentStepKey] = useState<string | null>(null);
  const [realSurfaces, setRealSurfaces] = useState<{
    dispatchPlan?: any;
    decorators?: any;
    synthesis?: any;
    render?: any;
  } | null>(null);
  const [realLlmCalls, setRealLlmCalls] = useState<number | null>(null);
  const [realState, setRealState] = useState<string | null>(null);
  const [realErrorMessage, setRealErrorMessage] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  const [startedAt] = useState(() => Date.now());

  useEffect(() => {
    setDone(false);
    setRealRunId(runId);
    setRealMeetingId(null);
    setRealProgress(null);
    setRealTokens(null);
    setRealCostUsd(null);
    setRealCurrentStep(null);
    setRealCurrentStepKey(null);
    setRealSurfaces(null);
    setRealLlmCalls(null);
    setRealState(null);
    setRealErrorMessage(null);
    setRetryError(null);
  }, [runId]);

  useEffect(() => {
    const t = setInterval(() => setTick(x => x + 1), 900);
    return () => clearInterval(t);
  }, []);

  // 真实 getRun 轮询（runId 非空时）
  useEffect(() => {
    if (!runId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let consecutiveErrors = 0;
    const maxConsecutiveErrors = 3;
    const scheduleNext = (ms: number) => {
      if (cancelled) return;
      timer = setTimeout(poll, ms);
    };
    const poll = async () => {
      try {
        const r: {
          state?: string;
          progress?: number;
          progressPct?: number;
          meetingId?: string;
          result?: { meetingId?: string };
          tokens?: number | { input?: number; output?: number };
          costTokens?: number;
          costUsd?: number;
          currentStep?: string;
          currentStepKey?: string;
          llmCalls?: number;
          metadata?: { currentStep?: string; currentStepKey?: string; llmCalls?: number };
          surfaces?: { dispatchPlan?: any; decorators?: any; synthesis?: any; render?: any };
          errorMessage?: string;
        } = await meetingNotesApi.getRun(runId);
        if (cancelled) return;
        consecutiveErrors = 0;
        setRealRunId(runId);
        const state = (r.state ?? '').toLowerCase();
        setRealState(state || null);
        setRealErrorMessage(typeof r.errorMessage === 'string' ? r.errorMessage : null);
        const pct = typeof r.progress === 'number'
          ? r.progress
          : (typeof r.progressPct === 'number' ? r.progressPct : null);
        if (pct != null) setRealProgress(Math.max(0, Math.min(100, pct)));
        if (typeof r.tokens === 'object' && r.tokens) {
          setRealTokens({ input: Number(r.tokens.input ?? 0), output: Number(r.tokens.output ?? 0) });
        } else if (typeof r.costTokens === 'number') {
          // 后端当前仅返回总 token；前端双栏按 input/output 近似拆分，避免看起来像 mock 固定值
          const input = Math.round(r.costTokens * 0.8);
          setRealTokens({ input, output: Math.max(0, r.costTokens - input) });
        }
        if (typeof r.costUsd === 'number') setRealCostUsd(r.costUsd);
        if (r.currentStep || r.metadata?.currentStep) setRealCurrentStep(r.currentStep ?? r.metadata?.currentStep ?? null);
        const stepKey = r.currentStepKey ?? r.metadata?.currentStepKey ?? null;
        if (stepKey) setRealCurrentStepKey(stepKey);
        if (r.surfaces) setRealSurfaces(r.surfaces);
        const llmCount = typeof r.llmCalls === 'number' ? r.llmCalls : (typeof r.metadata?.llmCalls === 'number' ? r.metadata.llmCalls : null);
        if (llmCount != null) setRealLlmCalls(llmCount);
        // API 返回 scope: { kind:'meeting', id:uuid } — meetingId 就在 scope.id 里
        const mid = r.meetingId ?? r.result?.meetingId
          ?? ((r as any).scope?.kind === 'meeting' ? (r as any).scope?.id : undefined);
        if (mid) setRealMeetingId(mid);
        if (state === 'done' || state === 'completed' || state === 'succeeded') {
          setDone(true);
        } else if (state === 'failed' || state === 'cancelled') {
          setDone(false);
        } else {
          scheduleNext(2000);
        }
      } catch (e) {
        if (cancelled) return;
        consecutiveErrors += 1;
        const msg = e instanceof Error ? e.message : String(e);
        console.warn(`[FlowProcessing] getRun failed (${consecutiveErrors}/${maxConsecutiveErrors}):`, msg);
        // 404 一般代表 run 不存在；直接终止轮询并展示失败态。
        if (msg.includes('→ 404')) {
          setRealState('failed');
          setRealErrorMessage('run 不存在或已失效（404），请返回上一步重新发起任务。');
          return;
        }
        // 503 = 后端 DB 短暂不可用；不计入连续失败，直接 3s 后重试。
        const is503 = msg.includes('→ 503');
        if (is503) {
          consecutiveErrors = Math.max(0, consecutiveErrors - 1);
          scheduleNext(3000);
          return;
        }
        if (consecutiveErrors >= maxConsecutiveErrors) {
          setRealState('failed');
          setRealErrorMessage('运行状态查询连续失败（可能是后端数据库超时），已停止自动轮询，请稍后重试。');
          return;
        }
        // 500/网络异常：指数退避，避免刷爆后端日志。
        const retryMs = Math.min(8000, 1500 * (2 ** (consecutiveErrors - 1)));
        scheduleNext(retryMs);
      }
    };
    poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [runId]);

  // R15: 用 surfaces 动态生成 dispatch / dec 标签，避免硬编码 "3 位专家"
  // 与实际 dispatchPlan.experts.length 不一致（如单 axis 跑只 1 位）
  const dispatchExpertCount = Array.isArray((realSurfaces as any)?.dispatchPlan?.experts)
    ? (realSurfaces as any).dispatchPlan.experts.length
    : null;
  const decoratorAppliedList = Array.isArray((realSurfaces as any)?.decorators?.applied)
    ? ((realSurfaces as any).decorators.applied as string[])
    : null;
  const stepDefs = [
    { id: 'ingest',    label: '原始素材解析 · ASR + 文档清洗',              sub: '' },
    { id: 'segment',   label: '发言切分 + 参与者归并',                       sub: '' },
    {
      id: 'dispatch',
      label: dispatchExpertCount != null
        ? `分派给 ${dispatchExpertCount} 位专家 · preset: ${realSurfaces?.dispatchPlan?.preset ?? 'standard'}`
        : '分派给 3 位专家 · preset: standard',
      sub: '',
    },
    {
      id: 'dec',
      label: '装饰器 stack · 注入证据 / 校准 confidence',
      sub: decoratorAppliedList && decoratorAppliedList.length > 0
        ? decoratorAppliedList.slice(0, 3).join(' → ')
        : 'evidence_anchored → calibrated_confidence → knowledge_grounded',
    },
    { id: 'synth',     label: '跨专家综合 · 7 条 deliverable 映射',          sub: '' },
    { id: 'render',    label: '多维度组装 · 张力 / 新认知 / 共识 / 观点对位', sub: '' },
  ] as const;
  // Fallback animation: monotonically increases from 5% → 90% over ~5min using elapsed time
  const fallbackProgress = runId
    ? (realState === 'queued'
      ? 5
      : realState === 'running'
        ? Math.min(90, 5 + ((Date.now() - startedAt) / 300000) * 85)
        : 0)
    : null;
  // realProgress=0 means "backend not yet tracking"; use animated fallback until progress is meaningful
  const displayProgress = runId
    ? (realProgress != null && realProgress > 0 ? realProgress : fallbackProgress)
    : null;
  // Phase 15.8 · 后端按 STEP_RANGES 写 progress_pct，前端按区间反推每步状态：
  //   ingest 3-16 / segment 17-33 / dispatch 34-50 / dec 51-58 /
  //   axes 59-83(map到 dispatch+dec 平均，前端无独立 axes 步) /
  //   synth 84-91 / render 92-99
  // 注意：前端 stepDefs 没有"axes"项，axes 期间 currentStepKey='axes'，
  // 我们把它视为 dec 已完成 + synth 未开始（即 dec=done, synth=queued）。
  const STEP_PCT_RANGES: Record<string, [number, number]> = {
    ingest:   [0,   16],
    segment:  [17,  33],
    dispatch: [34,  50],
    dec:      [51,  58],
    synth:    [84,  91],
    render:   [92, 100],
  };
  const stepKeys = ['ingest', 'segment', 'dispatch', 'dec', 'synth', 'render'] as const;
  const steps = stepDefs.map((s, i) => {
    if (runId && (realProgress != null || displayProgress != null)) {
      const cur = realProgress ?? displayProgress ?? 0;
      const key = stepKeys[i];
      const [lo, hi] = STEP_PCT_RANGES[key];
      let pct = 0;
      if (cur >= hi) pct = 100;
      else if (cur < lo) pct = 0;
      else pct = Math.round(((cur - lo) / Math.max(1, hi - lo)) * 100);
      // currentStepKey 优先：如果它命中本步，强制 running 状态
      // 但已 done（pct>=100）或整体 succeeded 时不覆盖，避免最终态闪回 running
      let state: 'done' | 'running' | 'queued' =
        pct >= 100 ? 'done' : pct > 0 ? 'running' : 'queued';
      const wholeRunDone = realState === 'succeeded' || realState === 'done' || done;
      if (realCurrentStepKey === key && !wholeRunDone && pct < 100) state = 'running';
      else if (realCurrentStepKey === 'axes' && (key === 'dispatch' || key === 'dec')) {
        // axes 期间 dispatch/dec 都已 done
        state = 'done'; pct = 100;
      }
      return { ...s, pct, state };
    }
    if (done) return { ...s, pct: 100, state: 'done' as const };
    const demoPct = [100, 100, 100, 78, 12, 0][i] ?? 0;
    const demoState = ['done', 'done', 'done', 'running', 'queued', 'queued'][i] as 'done' | 'running' | 'queued';
    return { ...s, pct: demoPct, state: demoState };
  });
  const liveStrategy = runId ? 'pipeline-runner' : 'debate';
  // 优先用后端 surfaces.decorators.applied（真实生效的装饰器栈）
  const liveDecorators = (realSurfaces?.decorators?.applied as string[] | undefined)
    ?? (realCurrentStep ? [realCurrentStep] : ['failure_check', 'evidence_anchored', 'calibrated_confidence', 'knowledge_grounded', 'rubric_anchored_output']);
  // 优先取 surfaces.synthesis.deliverables（来自后端实际聚合）；
  // 否则回退到静态 demo 列表，保持原 mock 行为。
  // Array.isArray 守卫：避免后端返回非数组（如 null / 对象）时崩溃
  const rawDeliverables = realSurfaces?.synthesis?.deliverables;
  const synthDeliverables: Array<{ key: string; label?: string; count?: number; generated?: boolean }> | undefined =
    Array.isArray(rawDeliverables) ? rawDeliverables : undefined;
  const deliverables: Array<{ key: string; label?: string; ready: boolean; count?: number }> =
    synthDeliverables && synthDeliverables.length > 0
      ? synthDeliverables.map((d) => ({
          key: typeof d?.key === 'string' ? d.key : 'unknown',
          label: typeof d?.label === 'string' ? d.label : undefined,
          ready: !!d?.generated,
          count: typeof d?.count === 'number' ? d.count : undefined,
        }))
      : [
          '① topic-enrich',
          'step3-fact-review',
          '⑫ consensus',
          '⑬ controversy',
          '⑩ insights',
          '⑭ beliefEvolution',
          'step5-synthesis',
        ].map((k) => ({ key: k, ready: false }));
  // 优先用 surfaces.synthesis.deliverables 中真实 generated=true 的数量
  const generatedFromSurfaces = synthDeliverables
    ? synthDeliverables.filter((d) => d.generated).length
    : null;
  const deliveredCount = typeof generatedFromSurfaces === 'number'
    ? generatedFromSurfaces
    : typeof realSurfaces?.synthesis?.generatedCount === 'number'
      ? Math.max(0, Math.min(deliverables.length, realSurfaces.synthesis.generatedCount))
      : runId && realProgress != null
        ? Math.max(0, Math.min(deliverables.length, Math.floor((realProgress / 100) * deliverables.length)))
        : runId && displayProgress != null
          ? Math.max(0, Math.min(deliverables.length, Math.floor((displayProgress / 100) * deliverables.length)))
        : (done ? deliverables.length : 2);
  const elapsedMs = Date.now() - startedAt;
  const elapsedStr = `${Math.floor(elapsedMs / 60000)}m ${Math.floor((elapsedMs % 60000) / 1000)}s`;
  const totalTokens = realTokens ? (realTokens.input + realTokens.output) : null;

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
            <MonoMeta>
              step 3 / 3 · standard preset
              {realState ? ` · ${realState}` : ''}
              {done && ` · ${realRunId ?? 'run-237'}`}
            </MonoMeta>
            {!runId && (
              <span style={{
                fontSize: 10.5, padding: '2px 8px', borderRadius: 3, fontFamily: 'var(--mono)',
                background: 'oklch(0.93 0.04 50)', color: 'oklch(0.45 0.12 50)',
                border: '1px solid oklch(0.82 0.07 50)', marginLeft: 4,
              }}>mock · 无真实 run</span>
            )}
            {runId && (
              <span style={{
                fontSize: 10.5, padding: '2px 8px', borderRadius: 3, fontFamily: 'var(--mono)',
                background: 'oklch(0.93 0.08 165)', color: 'oklch(0.35 0.12 165)',
                border: '1px solid oklch(0.80 0.10 165)', marginLeft: 4,
              }}>API · 轮询中</span>
            )}
            <div style={{ marginLeft: 'auto' }}>
              {!runId && (
                <button onClick={() => setDone(d => !d)} style={{
                  padding: '5px 12px', fontSize: 11, border: '1px dashed var(--line)',
                  background: 'transparent', borderRadius: 4, color: 'var(--ink-3)',
                  cursor: 'pointer', fontFamily: 'var(--mono)',
                }}>{done ? '↺ 重置演示' : '⇢ 演示完成态'}</button>
              )}
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
              <div><span style={{ color: 'var(--ink-4)' }}>strategy   </span>{liveStrategy}</div>
              <div><span style={{ color: 'var(--ink-4)' }}>run state  </span>{realState ?? (done ? 'done' : 'running')}</div>
              <div><span style={{ color: 'var(--ink-4)' }}>progress   </span>{displayProgress != null ? `${Math.round(displayProgress)}%` : (done ? '100%' : '78%')}</div>
              <div><span style={{ color: 'var(--ink-4)' }}>decorators </span></div>
              {liveDecorators.map((d, i) => (
                <div key={d} style={{ paddingLeft: 12, color: i === 1 ? 'var(--teal)' : 'var(--ink-2)' }}>
                  {i === 1 ? '▸ ' : '· '}{d}
                </div>
              ))}
            </div>
            {(realState === 'failed' || realState === 'cancelled') && (
              <div style={{ marginTop: 10, fontSize: 11, color: 'var(--ink-3)', lineHeight: 1.6 }}>
                <span style={{ fontFamily: 'var(--mono)', color: 'var(--ink-4)' }}>error: </span>
                {realErrorMessage || 'run 执行失败，请返回上一步重试。'}
              </div>
            )}
          </div>
          <div style={{ background: 'var(--paper)', border: '1px solid var(--line-2)', borderRadius: 8, padding: '16px 18px' }}>
            <SectionLabel>实时开销{realTokens || realCostUsd != null ? '' : ' · mock'}</SectionLabel>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
              {(() => {
                const elapsedMs = Date.now() - startedAt;
                const elapsedStr = `${Math.floor(elapsedMs / 60000)}m ${Math.floor((elapsedMs % 60000) / 1000)}s`;
                const tiles = [
                  { l: 'input tokens',  v: realTokens ? realTokens.input.toLocaleString() : '41,382' },
                  { l: 'output tokens', v: realTokens ? realTokens.output.toLocaleString() : '8,240' },
                  realCostUsd != null
                    ? { l: 'cost (USD)', v: `$${realCostUsd.toFixed(2)}` }
                    : (realLlmCalls != null
                        ? { l: 'LLM calls', v: realLlmCalls.toLocaleString() }
                        : { l: 'experts called', v: '3' }),
                  { l: 'elapsed',       v: runId ? elapsedStr : '1m 32s' },
                ];
                return tiles.map(x => (
                  <div key={x.l} style={{ padding: '8px 10px', background: 'var(--paper-2)', borderRadius: 5, border: '1px solid var(--line-2)' }}>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: 0.3 }}>{x.l}</div>
                    <div style={{ fontFamily: 'var(--serif)', fontSize: 17, fontWeight: 600, marginTop: 2 }}>{x.v}</div>
                  </div>
                ));
              })()}
            </div>
            {realCurrentStep && (
              <div style={{ marginTop: 10, fontSize: 11, color: 'var(--ink-3)' }}>
                <span style={{ fontFamily: 'var(--mono)', color: 'var(--ink-4)' }}>current step: </span>
                {realCurrentStep}
              </div>
            )}
          </div>
          <div style={{ background: 'var(--paper)', border: '1px solid var(--line-2)', borderRadius: 8, padding: '16px 18px' }}>
            <SectionLabel>已产出 · {deliveredCount} / {deliverables.length}</SectionLabel>
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {deliverables.map((d, idx) => {
                const isReady = synthDeliverables ? d.ready : idx < deliveredCount;
                return (
                  <div key={d.key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                    {isReady
                      ? <Icon name="check" size={13} style={{ color: 'var(--accent)' }} />
                      : <div style={{ width: 13, height: 13, borderRadius: 99, border: '1.2px solid var(--line)' }} />}
                    <span style={{ color: isReady ? 'var(--ink)' : 'var(--ink-3)', fontFamily: 'var(--serif)' }}>{d.key}</span>
                    {typeof d.count === 'number' && d.count > 0 && (
                      <span style={{ fontSize: 10.5, color: 'var(--ink-3)', fontFamily: 'var(--mono)' }}>· {d.count}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          {/* Phase 15.8 · 后端 surfaces.dispatchPlan.experts → 真实"3 位专家"清单 */}
          {realSurfaces?.dispatchPlan?.experts && Array.isArray(realSurfaces.dispatchPlan.experts) && realSurfaces.dispatchPlan.experts.length > 0 && (
            <div style={{ background: 'var(--paper)', border: '1px solid var(--line-2)', borderRadius: 8, padding: '16px 18px' }}>
              <SectionLabel>专家分派 · {realSurfaces.dispatchPlan.experts.length} 位</SectionLabel>
              <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {realSurfaces.dispatchPlan.experts.map((ex: any) => (
                  <div key={ex.expertId} style={{ fontSize: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{
                        width: 6, height: 6, borderRadius: 99,
                        background: ex.state === 'done' ? 'var(--accent)' : ex.state === 'running' ? 'var(--teal)' : 'var(--line)',
                      }} />
                      <span style={{ fontFamily: 'var(--serif)' }}>{ex.label}</span>
                      <span style={{ marginLeft: 'auto', fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--ink-3)' }}>
                        {ex.completedSubDims?.length ?? 0}/{ex.subDims?.length ?? 0}
                      </span>
                    </div>
                    <div style={{ paddingLeft: 12, fontSize: 10.5, color: 'var(--ink-3)', fontFamily: 'var(--mono)', marginTop: 2 }}>
                      {(ex.axes || []).join(' · ')}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
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
                <span style={{ color: 'var(--ink-3)' }}>
                  · {realRunId ?? 'run-237'} · {runId ? elapsedStr : '2m 08s'} · {totalTokens != null ? `${totalTokens.toLocaleString()} tokens` : '49,622 tokens'}
                </span>
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
                {realState === 'queued'
                  ? <>任务排队中 · 正等待执行</>
                  : (realState === 'failed' || realState === 'cancelled')
                    ? <>任务执行失败 · 请返回上一步重试</>
                    : <>解析进行中 · 约 <b>48 秒</b> 后可进入多维视图</>}
              </div>
            </div>
            <button onClick={onBack} style={btnGhost}>← 返回</button>
            {(realState === 'failed' || realState === 'cancelled') && (
              <button
                onClick={async () => {
                  setRetrying(true);
                  setRetryError(null);
                  const ok = await onRetry();
                  setRetrying(false);
                  if (!ok) setRetryError('重试入队失败，请返回上一步检查素材后重试。');
                }}
                disabled={retrying}
                style={{ ...btnPrimary, ...(retrying ? { opacity: 0.7, cursor: 'not-allowed' } : {}) }}
              >
                {retrying ? '重试中…' : '重试本次任务'}
              </button>
            )}
          </>
        )}
      </div>
      {retryError && (
        <div style={{ padding: '8px 48px 14px', fontSize: 12, color: 'var(--ink-3)' }}>
          {retryError}
        </div>
      )}
    </div>
  );
}

// ── Main export ──────────────────────────────────────────────────────────────

export function NewMeeting() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const forceMock = useForceMock();
  // Deep-link: /meeting/new?runId=xxx → resume on step 3 with that run loaded.
  // Used when generation-center 队列点击 “查看进度”，或刷新页面/分享链接。
  const runIdFromQuery = searchParams.get('runId');
  const [step, setStep] = useState<1 | 2 | 3>(runIdFromQuery ? 3 : 1);
  const [assetId, setAssetId] = useState<string | null>(null);
  const [runId, setRunId] = useState<string | null>(runIdFromQuery);
  const [lastSubmitBody, setLastSubmitBody] = useState<{ presetId: string; expertIds: string[]; expertRoles: Record<MnRoleId, string[]> } | null>(null);

  // Persist runId → URL so refresh / back-button keep state.
  useEffect(() => {
    if (runId) {
      if (searchParams.get('runId') !== runId) {
        setSearchParams({ runId }, { replace: true });
      }
    } else if (searchParams.has('runId')) {
      const next = new URLSearchParams(searchParams);
      next.delete('runId');
      setSearchParams(next, { replace: true });
    }
    // Don't depend on searchParams to avoid loops; setSearchParams is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);

  async function handleSubmit(body: { presetId: string; expertIds: string[]; expertRoles: Record<MnRoleId, string[]> }): Promise<boolean> {
    setLastSubmitBody(body);
    if (forceMock) return true;
    if (!assetId) {
      console.warn('enqueue skipped: missing assetId (no uploaded/recent meeting file selected)');
      return false;
    }
    try {
      const parsed: { ok?: boolean; reason?: string } = await meetingNotesApi.parseMeeting(assetId);
      if (!parsed?.ok) {
        console.warn('parseMeeting failed:', parsed);
        return false;
      }
      // 解析成功后按 meeting scope 发起 run，避免落到 library 级“空跑成功”
      const scope = { kind: 'meeting', id: assetId };
      // 仅传非空角色：避免后端拿到空数组时去查不存在的 expertId
      const cleanedRoles: { people?: string[]; projects?: string[]; knowledge?: string[] } = {};
      if (body.expertRoles.people.length)    cleanedRoles.people = body.expertRoles.people;
      if (body.expertRoles.projects.length)  cleanedRoles.projects = body.expertRoles.projects;
      if (body.expertRoles.knowledge.length) cleanedRoles.knowledge = body.expertRoles.knowledge;
      const r: { runId?: string; ok?: boolean } = await meetingNotesApi.enqueueRun({
        scope,
        axis: 'all',
        preset: body.presetId,
        triggeredBy: 'new-meeting-wizard',
        ...(Object.keys(cleanedRoles).length > 0 ? { expertRoles: cleanedRoles } : {}),
      });
      if (r.runId) {
        setRunId(r.runId);
        return true;
      }
      console.warn('enqueueRun returned no runId:', r);
      return false;
    } catch (e) {
      console.warn('enqueueRun failed:', e);
      return false;
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
          onRetry={async () => {
            if (!lastSubmitBody) return false;
            return handleSubmit(lastSubmitBody);
          }}
        />
      )}
    </div>
  );
}

export default NewMeeting;
