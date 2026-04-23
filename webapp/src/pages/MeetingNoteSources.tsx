// 会议纪要采集渠道管理页面
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  meetingNoteSourcesApi,
  type MeetingNoteSource,
  type MeetingNoteSourceKind,
  type MeetingNoteImport,
} from '../api/client';
import './MeetingNoteSources.css';

const KIND_LABEL: Record<MeetingNoteSourceKind, string> = {
  lark: '飞书会议',
  zoom: 'Zoom',
  teams: 'Microsoft Teams',
  upload: '手动上传',
  folder: '本地目录',
  manual: '手工录入',
};

const KIND_OPTIONS: MeetingNoteSourceKind[] = [
  'manual', 'upload', 'folder', 'lark', 'zoom', 'teams',
];

const KIND_HINT: Record<MeetingNoteSourceKind, string> = {
  manual: '在此页直接粘贴/录入纪要文本。无需额外配置。',
  upload: '通过 REST 上传 .md/.txt/.docx 文件，自动落为会议纪要资产。',
  folder: '监听本地目录（例如 /data/minutes），新文件自动导入。',
  lark: 'v1 占位。实现后支持按飞书会议室 ID 拉取纪要。',
  zoom: 'v1 占位。实现后支持 Zoom 会议转录自动导入。',
  teams: 'v1 占位。实现后支持 Teams 会议文本导入。',
};

interface FormState {
  name: string;
  kind: MeetingNoteSourceKind;
  configText: string;      // JSON text
  scheduleCron: string;
  isActive: boolean;
}

const EMPTY_FORM: FormState = {
  name: '',
  kind: 'manual',
  configText: '{}',
  scheduleCron: '',
  isActive: true,
};

export function MeetingNoteSources() {
  const [sources, setSources] = useState<MeetingNoteSource[]>([]);
  const [history, setHistory] = useState<MeetingNoteImport[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<MeetingNoteSource | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [pasteTarget, setPasteTarget] = useState<MeetingNoteSource | null>(null);
  const [pasteForm, setPasteForm] = useState<{ title: string; content: string }>({ title: '', content: '' });
  const [pasting, setPasting] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [sourcesResp, histResp] = await Promise.all([
        meetingNoteSourcesApi.getAll(),
        meetingNoteSourcesApi.getHistory({ limit: 20 }),
      ]);
      setSources(sourcesResp.items);
      setHistory(histResp.items);
    } catch (err: any) {
      setMessage(`加载失败: ${err?.message || err}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setMessage(null);
  };

  const openEdit = (src: MeetingNoteSource) => {
    setEditing(src);
    setForm({
      name: src.name,
      kind: src.kind,
      configText: JSON.stringify(src.config || {}, null, 2),
      scheduleCron: src.scheduleCron || '',
      isActive: src.isActive,
    });
    setMessage(null);
  };

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      // 先试 JSON；失败则作为"备注/原始文本"包装，不阻塞保存。
      let config: Record<string, any>;
      const raw = (form.configText || '').trim();
      if (!raw || raw === '{}') {
        config = {};
      } else {
        try {
          const parsed = JSON.parse(raw);
          config = typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
            ? parsed
            : { value: parsed };
        } catch {
          config = { note: raw };
          setMessage('提示：config 非 JSON，已作为 { note: <原文> } 保存。');
        }
      }
      if (editing) {
        await meetingNoteSourcesApi.update(editing.id, {
          name: form.name,
          config,
          scheduleCron: form.scheduleCron || null,
          isActive: form.isActive,
        });
      } else {
        await meetingNoteSourcesApi.create({
          name: form.name,
          kind: form.kind,
          config,
          scheduleCron: form.scheduleCron || null,
          isActive: form.isActive,
        });
      }
      setEditing(null);
      setForm(EMPTY_FORM);
      await loadData();
    } catch (err: any) {
      setMessage(`保存失败: ${err?.response?.data?.message || err?.message || err}`);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (src: MeetingNoteSource) => {
    if (!confirm(`确认删除 "${src.name}"？此操作不可恢复。`)) return;
    try {
      await meetingNoteSourcesApi.delete(src.id);
      await loadData();
    } catch (err: any) {
      setMessage(`删除失败: ${err?.message || err}`);
    }
  };

  const triggerImport = async (src: MeetingNoteSource) => {
    try {
      const result = await meetingNoteSourcesApi.triggerImport(src.id);
      setMessage(`采集完成：新增 ${result.itemsImported}，重复 ${result.duplicates}，失败 ${result.errors}`);
      await loadData();
    } catch (err: any) {
      setMessage(`采集失败: ${err?.response?.data?.message || err?.message || err}`);
    }
  };

  const uploadFile = async (src: MeetingNoteSource, file: File) => {
    setUploadingId(src.id);
    try {
      const result = await meetingNoteSourcesApi.upload(src.id, file);
      setMessage(`上传完成：新增 ${result.itemsImported}，重复 ${result.duplicates}`);
      await loadData();
    } catch (err: any) {
      setMessage(`上传失败: ${err?.response?.data?.message || err?.message || err}`);
    } finally {
      setUploadingId(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="meeting-note-sources">
      <header className="mns-header">
        <div>
          <h1>会议纪要采集渠道</h1>
          <p className="mns-subtitle">
            配置外部来源（飞书 / Zoom / Teams / 上传 / 本地目录），统一落为 asset_type=meeting_minutes 资产。
          </p>
        </div>
        <button className="mns-btn mns-btn-primary" onClick={openCreate}>
          + 新建采集源
        </button>
      </header>

      {message && <div className="mns-message">{message}</div>}

      <section className="mns-panel">
        <h2>表单</h2>
        <div className="mns-form">
          <label>
            名称
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="例：飞书会议室-架构评审"
            />
          </label>
          <label>
            渠道类型
            <select
              value={form.kind}
              onChange={(e) => setForm({ ...form, kind: e.target.value as MeetingNoteSourceKind })}
              disabled={!!editing}
            >
              {KIND_OPTIONS.map((k) => (
                <option key={k} value={k}>{KIND_LABEL[k]}</option>
              ))}
            </select>
            <small className="mns-hint">{KIND_HINT[form.kind]}</small>
          </label>
          <label>
            config (JSON)
            <textarea
              rows={6}
              value={form.configText}
              onChange={(e) => setForm({ ...form, configText: e.target.value })}
              spellCheck={false}
            />
          </label>
          <label>
            schedule_cron（v1 暂未生效，仅记录）
            <input
              value={form.scheduleCron}
              onChange={(e) => setForm({ ...form, scheduleCron: e.target.value })}
              placeholder="0 */15 * * * *"
            />
          </label>
          <label className="mns-checkbox">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
            />
            启用
          </label>
          <div className="mns-form-actions">
            <button className="mns-btn mns-btn-primary" onClick={save} disabled={saving || !form.name}>
              {saving ? '保存中...' : editing ? '保存修改' : '新建'}
            </button>
            {editing && (
              <button className="mns-btn" onClick={openCreate}>取消编辑</button>
            )}
          </div>
        </div>
      </section>

      <section className="mns-panel">
        <h2>采集源列表</h2>
        {loading ? (
          <p>加载中...</p>
        ) : sources.length === 0 ? (
          <p className="mns-empty">暂无采集源。</p>
        ) : (
          <table className="mns-table">
            <thead>
              <tr>
                <th>名称</th>
                <th>类型</th>
                <th>启用</th>
                <th>最近采集</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {sources.map((s) => (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  <td>{KIND_LABEL[s.kind]}</td>
                  <td>{s.isActive ? '是' : '否'}</td>
                  <td>{s.lastImportedAt ? new Date(s.lastImportedAt).toLocaleString() : '—'}</td>
                  <td className="mns-actions">
                    <button onClick={() => openEdit(s)}>编辑</button>
                    <button onClick={() => triggerImport(s)}>触发采集</button>
                    {(s.kind === 'upload' || s.kind === 'manual') && (
                      <>
                        <label className="mns-upload-btn">
                          上传文件
                          <input
                            type="file"
                            ref={fileInputRef}
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) uploadFile(s, f);
                            }}
                            accept=".md,.txt,.markdown,.docx"
                            disabled={uploadingId === s.id}
                          />
                        </label>
                        <button onClick={() => { setPasteTarget(s); setPasteForm({ title: '', content: '' }); }}>
                          粘贴内容
                        </button>
                      </>
                    )}
                    <button className="mns-btn-danger" onClick={() => remove(s)}>删除</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="mns-panel">
        <h2>最近采集历史</h2>
        {history.length === 0 ? (
          <p className="mns-empty">暂无历史记录。</p>
        ) : (
          <table className="mns-table">
            <thead>
              <tr>
                <th>时间</th>
                <th>状态</th>
                <th>发现</th>
                <th>导入</th>
                <th>重复</th>
                <th>失败</th>
                <th>触发</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id} className={`mns-row-${h.status}`}>
                  <td>{new Date(h.startedAt).toLocaleString()}</td>
                  <td>{h.status}</td>
                  <td>{h.itemsDiscovered}</td>
                  <td>{h.itemsImported}</td>
                  <td>{h.duplicates}</td>
                  <td>{h.errors}</td>
                  <td>{h.triggeredBy}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {pasteTarget && (
        <div className="mns-modal-backdrop" onClick={() => !pasting && setPasteTarget(null)}>
          <div className="mns-modal" onClick={(e) => e.stopPropagation()}>
            <div className="mns-modal-header">
              <h3>粘贴会议纪要 — {pasteTarget.name}</h3>
              <button className="mns-modal-close" onClick={() => !pasting && setPasteTarget(null)}>×</button>
            </div>
            <div className="mns-modal-body">
              <label>
                标题（可留空，自动按时间戳生成）
                <input
                  value={pasteForm.title}
                  onChange={(e) => setPasteForm({ ...pasteForm, title: e.target.value })}
                  placeholder="例：2026-04-20 架构评审"
                />
              </label>
              <label>
                内容（粘贴任意文本，无需 JSON）
                <textarea
                  rows={14}
                  value={pasteForm.content}
                  onChange={(e) => setPasteForm({ ...pasteForm, content: e.target.value })}
                  placeholder="把会议纪要、Q&A、录音转录等直接粘贴到这里..."
                  spellCheck={false}
                />
              </label>
              <small className="mns-hint">
                保存后自动按规则识别会议性质（strategy_roadshow / tech_review / expert_interview /
                industry_research / internal_ops），并落为 meeting_minutes 资产。
              </small>
            </div>
            <div className="mns-modal-actions">
              <button onClick={() => !pasting && setPasteTarget(null)} disabled={pasting}>取消</button>
              <button
                className="mns-btn-primary"
                disabled={pasting || !pasteForm.content.trim()}
                onClick={async () => {
                  setPasting(true);
                  try {
                    const result = await meetingNoteSourcesApi.ingestText(pasteTarget.id, {
                      title: pasteForm.title || undefined,
                      content: pasteForm.content,
                    });
                    setMessage(`粘贴已入库：新增 ${result.itemsImported}，重复 ${result.duplicates}`);
                    setPasteTarget(null);
                    setPasteForm({ title: '', content: '' });
                    await loadData();
                  } catch (err: any) {
                    setMessage(`粘贴失败: ${err?.response?.data?.message || err?.message || err}`);
                  } finally {
                    setPasting(false);
                  }
                }}
              >
                {pasting ? '保存中...' : '保存为资产'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default MeetingNoteSources;
