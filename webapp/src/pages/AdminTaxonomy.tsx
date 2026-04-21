// /admin/taxonomy — CRUD UI for the two-level domain taxonomy.
// MVP scope (per plan):
//   - level-1 and level-2 create / rename / icon / color / sort_order / deactivate
//   - code is immutable (protects existing FK-like references)
//   - deactivate flow shows usage counts before confirming
//   - "Sync from config" and "Export as taxonomyData.ts" admin actions
//   - Audit drawer reads the last 50 audit events

import { useCallback, useEffect, useMemo, useState } from 'react';
import { taxonomyApi } from '../api/taxonomy';
import { useTaxonomy, invalidateTaxonomyCache } from '../hooks/useTaxonomy';
import type {
  TaxonomyAuditEntry,
  TaxonomyNode,
  TaxonomyUsage,
} from '../types/taxonomy';

const CODE_L1 = /^E\d{2}$/;
const CODE_L2 = /^E\d{2}\.[A-Z][A-Z0-9_]*$/;

type DraftMode = 'edit' | 'new-l1' | 'new-l2';

interface Draft {
  mode: DraftMode;
  code: string;
  parent_code: string | null;
  name: string;
  icon: string;
  color: string;
  sort_order: number;
  is_active: boolean;
}

function draftFromNode(n: TaxonomyNode): Draft {
  return {
    mode: 'edit',
    code: n.code,
    parent_code: n.parent_code,
    name: n.name,
    icon: n.icon ?? '',
    color: n.color ?? '',
    sort_order: n.sort_order,
    is_active: n.is_active,
  };
}

function emptyDraft(mode: DraftMode, parent?: string | null): Draft {
  return {
    mode,
    code: '',
    parent_code: mode === 'new-l2' ? parent ?? null : null,
    name: '',
    icon: '',
    color: '',
    sort_order: 0,
    is_active: true,
  };
}

export function AdminTaxonomy() {
  const { tree, loading, error, refresh, findByCode } = useTaxonomy();
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [usage, setUsage] = useState<TaxonomyUsage | null>(null);
  const [deactivateCandidate, setDeactivateCandidate] = useState<TaxonomyNode | null>(null);
  const [deactivateUsage, setDeactivateUsage] = useState<TaxonomyUsage | null>(null);
  const [showAudit, setShowAudit] = useState(false);
  const [auditRows, setAuditRows] = useState<TaxonomyAuditEntry[]>([]);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportText, setExportText] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const selected = selectedCode ? findByCode(selectedCode) : null;

  // When selecting a new node, hydrate the edit draft.
  useEffect(() => {
    if (!selected) { setDraft(null); setUsage(null); return; }
    setDraft(draftFromNode(selected));
    setSaveError(null);
    taxonomyApi.getUsage(selected.code)
      .then(r => setUsage(r.data))
      .catch(() => setUsage(null));
  }, [selected]);

  const handleSelect = (code: string) => {
    setSelectedCode(code);
  };

  const handleAddL1 = () => {
    setSelectedCode(null);
    setDraft(emptyDraft('new-l1'));
    setSaveError(null);
  };

  const handleAddL2 = (parent: TaxonomyNode) => {
    setSelectedCode(null);
    setDraft(emptyDraft('new-l2', parent.code));
    setSaveError(null);
  };

  const handleSave = async () => {
    if (!draft) return;
    setSaving(true);
    setSaveError(null);
    try {
      if (draft.mode === 'edit') {
        await taxonomyApi.update(draft.code, {
          name: draft.name,
          icon: draft.icon || null,
          color: draft.color || null,
          sort_order: draft.sort_order,
          is_active: draft.is_active,
        });
      } else {
        const pattern = draft.mode === 'new-l1' ? CODE_L1 : CODE_L2;
        if (!pattern.test(draft.code)) {
          throw new Error(
            draft.mode === 'new-l1'
              ? 'code 必须形如 "E\\d{2}"（例如 E13）'
              : 'code 必须形如 "E\\d{2}.[A-Z]+"（例如 E07.NEWLAB）',
          );
        }
        await taxonomyApi.create({
          code: draft.code,
          parent_code: draft.parent_code,
          name: draft.name,
          icon: draft.icon || null,
          color: draft.color || null,
          sort_order: draft.sort_order,
        });
      }
      invalidateTaxonomyCache();
      await refresh();
      setSelectedCode(draft.code);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: unknown } }; message?: string })
        ?.response?.data?.error ?? (err as Error).message;
      setSaveError(typeof msg === 'string' ? msg : JSON.stringify(msg));
    } finally {
      setSaving(false);
    }
  };

  const askDeactivate = async (node: TaxonomyNode) => {
    setDeactivateCandidate(node);
    setDeactivateUsage(null);
    try {
      const u = await taxonomyApi.getUsage(node.code);
      setDeactivateUsage(u.data);
    } catch {
      setDeactivateUsage({ assets: 0, themes: 0, facts: 0, experts: 0, total: 0 });
    }
  };

  const confirmDeactivate = async () => {
    if (!deactivateCandidate) return;
    setBusy('deactivate');
    try {
      await taxonomyApi.update(deactivateCandidate.code, { is_active: false });
      invalidateTaxonomyCache();
      await refresh();
      setDeactivateCandidate(null);
      setDeactivateUsage(null);
    } finally {
      setBusy(null);
    }
  };

  const reactivate = async (node: TaxonomyNode) => {
    setBusy(`reactivate:${node.code}`);
    try {
      await taxonomyApi.update(node.code, { is_active: true });
      invalidateTaxonomyCache();
      await refresh();
    } finally {
      setBusy(null);
    }
  };

  const handleSync = async () => {
    if (!confirm('从 taxonomyData.ts 同步（不会删除 DB 中的新增项；code 相同的节点会被覆盖 name/icon 等字段）。继续？')) return;
    setBusy('sync');
    try {
      await taxonomyApi.sync();
      invalidateTaxonomyCache();
      await refresh();
    } finally {
      setBusy(null);
    }
  };

  const handleExport = async () => {
    setBusy('export');
    try {
      const src = await taxonomyApi.exportTs();
      setExportText(typeof src === 'string' ? src : JSON.stringify(src, null, 2));
      setExportOpen(true);
    } finally {
      setBusy(null);
    }
  };

  const handleAudit = async () => {
    setShowAudit(true);
    try {
      const r = await taxonomyApi.audit(undefined, 50);
      setAuditRows(r.data);
    } catch {
      setAuditRows([]);
    }
  };

  const totalNodes = useMemo(
    () => tree.reduce((n, l1) => n + 1 + (l1.children?.length ?? 0), 0),
    [tree],
  );

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">分类编辑</h1>
          <p className="text-sm text-gray-500 mt-1">
            共 {totalNodes} 个节点 · code 不可修改，仅允许弃用；新增二级需指定父级。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="px-3 py-2 text-sm rounded-lg border hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
            onClick={handleAudit}
            disabled={busy !== null}
          >
            审计日志
          </button>
          <button
            className="px-3 py-2 text-sm rounded-lg border hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
            onClick={handleExport}
            disabled={busy !== null}
          >
            导出为 taxonomyData.ts
          </button>
          <button
            className="px-3 py-2 text-sm rounded-lg border hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
            onClick={handleSync}
            disabled={busy !== null}
          >
            从配置同步
          </button>
          <button
            className="px-3 py-2 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
            onClick={handleAddL1}
            disabled={busy !== null}
          >
            + 新增一级
          </button>
        </div>
      </header>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-700 text-sm">
          加载失败：{error.message}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-[320px_1fr] gap-6">
        <div className="border rounded-lg p-3 bg-white dark:bg-gray-900 h-fit">
          {loading ? (
            <div className="text-sm text-gray-400">加载中...</div>
          ) : (
            <ul className="space-y-1">
              {tree.map(l1 => (
                <li key={l1.code}>
                  <TreeRow
                    node={l1}
                    level={1}
                    selected={selectedCode === l1.code}
                    onSelect={handleSelect}
                    onAddL2={handleAddL2}
                    onDeactivate={askDeactivate}
                    onReactivate={reactivate}
                    busy={busy}
                  />
                  <ul className="ml-5 mt-0.5 space-y-0.5">
                    {(l1.children ?? []).map(l2 => (
                      <li key={l2.code}>
                        <TreeRow
                          node={l2}
                          level={2}
                          selected={selectedCode === l2.code}
                          onSelect={handleSelect}
                          onDeactivate={askDeactivate}
                          onReactivate={reactivate}
                          busy={busy}
                        />
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="border rounded-lg p-5 bg-white dark:bg-gray-900 min-h-[420px]">
          {!draft && (
            <div className="text-gray-400 text-sm">从左侧选择一个节点编辑，或新增一级/二级。</div>
          )}
          {draft && (
            <DraftEditor
              draft={draft}
              onChange={setDraft}
              onSave={handleSave}
              saving={saving}
              saveError={saveError}
              usage={draft.mode === 'edit' ? usage : null}
            />
          )}
        </div>
      </div>

      {deactivateCandidate && (
        <DeactivateModal
          node={deactivateCandidate}
          usage={deactivateUsage}
          onCancel={() => { setDeactivateCandidate(null); setDeactivateUsage(null); }}
          onConfirm={confirmDeactivate}
          busy={busy === 'deactivate'}
        />
      )}

      {exportOpen && (
        <ExportModal
          text={exportText}
          onClose={() => setExportOpen(false)}
        />
      )}

      {showAudit && (
        <AuditDrawer
          rows={auditRows}
          onClose={() => setShowAudit(false)}
        />
      )}
    </div>
  );
}

interface TreeRowProps {
  node: TaxonomyNode;
  level: 1 | 2;
  selected: boolean;
  onSelect: (code: string) => void;
  onAddL2?: (parent: TaxonomyNode) => void;
  onDeactivate: (node: TaxonomyNode) => void;
  onReactivate: (node: TaxonomyNode) => void;
  busy: string | null;
}

function TreeRow({
  node, level, selected, onSelect, onAddL2, onDeactivate, onReactivate, busy,
}: TreeRowProps) {
  return (
    <div
      className={`group flex items-center gap-2 rounded px-2 py-1 cursor-pointer text-sm
        ${selected ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-200' : 'hover:bg-gray-50 dark:hover:bg-gray-800'}
        ${node.is_active ? '' : 'opacity-50'}`}
      onClick={() => onSelect(node.code)}
    >
      {level === 1 && node.icon && <span className="text-base">{node.icon}</span>}
      <span className={level === 1 ? 'font-medium' : 'text-gray-700 dark:text-gray-300'}>
        {node.name}
      </span>
      <span className="text-xs text-gray-400">{node.code}</span>
      {!node.is_active && <span className="text-[10px] text-red-500 border border-red-200 rounded px-1">已弃用</span>}
      <span className="ml-auto hidden group-hover:flex items-center gap-1">
        {level === 1 && onAddL2 && (
          <button
            className="text-xs px-1.5 py-0.5 border rounded hover:bg-gray-100"
            onClick={e => { e.stopPropagation(); onAddL2(node); }}
            title="新增二级"
          >
            +
          </button>
        )}
        {node.is_active ? (
          <button
            className="text-xs px-1.5 py-0.5 border rounded hover:bg-red-50 text-red-600 disabled:opacity-50"
            onClick={e => { e.stopPropagation(); onDeactivate(node); }}
            disabled={busy !== null}
            title="弃用"
          >
            弃
          </button>
        ) : (
          <button
            className="text-xs px-1.5 py-0.5 border rounded hover:bg-green-50 text-green-600 disabled:opacity-50"
            onClick={e => { e.stopPropagation(); onReactivate(node); }}
            disabled={busy !== null}
            title="恢复"
          >
            ✓
          </button>
        )}
      </span>
    </div>
  );
}

interface DraftEditorProps {
  draft: Draft;
  onChange: (d: Draft) => void;
  onSave: () => void;
  saving: boolean;
  saveError: string | null;
  usage: TaxonomyUsage | null;
}

function DraftEditor({ draft, onChange, onSave, saving, saveError, usage }: DraftEditorProps) {
  const isNew = draft.mode !== 'edit';
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">
          {draft.mode === 'edit' && '编辑节点'}
          {draft.mode === 'new-l1' && '新增一级'}
          {draft.mode === 'new-l2' && `新增二级（父：${draft.parent_code}）`}
        </h2>
        {draft.mode === 'edit' && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={draft.is_active}
              onChange={e => onChange({ ...draft, is_active: e.target.checked })}
            />
            启用
          </label>
        )}
      </div>

      <Field label="Code" hint={isNew ? '创建后不可修改' : '只读'}>
        <input
          className="w-full px-3 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-700 text-sm font-mono"
          value={draft.code}
          onChange={e => onChange({ ...draft, code: e.target.value.trim() })}
          readOnly={!isNew}
          placeholder={draft.mode === 'new-l1' ? '例如 E13' : '例如 E07.NEWLAB'}
        />
      </Field>

      <Field label="名称">
        <input
          className="w-full px-3 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-700 text-sm"
          value={draft.name}
          onChange={e => onChange({ ...draft, name: e.target.value })}
          placeholder="显示名称（例如 人工智能 / 大模型）"
        />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="图标（emoji）">
          <input
            className="w-full px-3 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-700 text-sm"
            value={draft.icon}
            onChange={e => onChange({ ...draft, icon: e.target.value })}
            placeholder="🤖"
          />
        </Field>
        <Field label="颜色">
          <input
            className="w-full px-3 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-700 text-sm"
            value={draft.color}
            onChange={e => onChange({ ...draft, color: e.target.value })}
            placeholder="#2f54eb"
          />
        </Field>
      </div>

      <Field label="排序" hint="数字越小越靠前">
        <input
          type="number"
          className="w-full px-3 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-700 text-sm"
          value={draft.sort_order}
          onChange={e => onChange({ ...draft, sort_order: parseInt(e.target.value || '0', 10) || 0 })}
        />
      </Field>

      {usage && (
        <div className="text-xs text-gray-500 border-t pt-3">
          引用计数：assets {usage.assets} · themes {usage.themes} · facts {usage.facts} · experts {usage.experts}
        </div>
      )}

      {saveError && (
        <div className="p-2 rounded bg-red-50 text-red-700 text-xs">{saveError}</div>
      )}

      <div className="flex items-center gap-2 pt-2">
        <button
          className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm hover:bg-indigo-700 disabled:opacity-50"
          onClick={onSave}
          disabled={saving || !draft.name || !draft.code}
        >
          {saving ? '保存中...' : (isNew ? '创建' : '保存')}
        </button>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <label className="text-sm font-medium">{label}</label>
        {hint && <span className="text-xs text-gray-400">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function DeactivateModal({
  node, usage, onCancel, onConfirm, busy,
}: {
  node: TaxonomyNode;
  usage: TaxonomyUsage | null;
  onCancel: () => void;
  onConfirm: () => void;
  busy: boolean;
}) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-900 rounded-xl p-6 max-w-md w-full shadow-xl">
        <h3 className="text-lg font-semibold mb-2">确认弃用 <span className="font-mono text-base">{node.code}</span></h3>
        <p className="text-sm text-gray-500 mb-3">
          弃用后：选择器不再显示，但历史数据上的引用保留；需要时可恢复。
        </p>
        {usage === null ? (
          <div className="text-sm text-gray-400">查询引用数中…</div>
        ) : (
          <div className="text-sm space-y-1 p-3 rounded bg-gray-50 dark:bg-gray-800">
            <div>assets: <b>{usage.assets}</b></div>
            <div>themes: <b>{usage.themes}</b></div>
            <div>content facts: <b>{usage.facts}</b></div>
            <div>experts: <b>{usage.experts}</b></div>
            <div className="border-t pt-1 mt-1">总计: <b>{usage.total}</b></div>
          </div>
        )}
        <div className="flex justify-end gap-2 mt-4">
          <button
            className="px-3 py-2 text-sm rounded-lg border"
            onClick={onCancel}
            disabled={busy}
          >
            取消
          </button>
          <button
            className="px-3 py-2 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? '处理中...' : '确认弃用'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ExportModal({ text, onClose }: { text: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* ignore */ }
  };
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-xl p-5 max-w-3xl w-full shadow-xl">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">导出 taxonomyData.ts</h3>
          <div className="flex items-center gap-2">
            <button className="text-sm px-3 py-1.5 border rounded-lg" onClick={onCopy}>
              {copied ? '已复制' : '复制'}
            </button>
            <button className="text-sm px-3 py-1.5 border rounded-lg" onClick={onClose}>关闭</button>
          </div>
        </div>
        <pre className="text-xs bg-gray-50 dark:bg-gray-800 p-3 rounded max-h-[60vh] overflow-auto whitespace-pre-wrap">{text}</pre>
      </div>
    </div>
  );
}

function AuditDrawer({ rows, onClose }: { rows: TaxonomyAuditEntry[]; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30" />
      <aside
        className="absolute right-0 top-0 bottom-0 w-full max-w-md bg-white dark:bg-gray-900 shadow-xl p-4 overflow-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">审计日志</h3>
          <button className="text-sm px-2 py-1 border rounded" onClick={onClose}>关闭</button>
        </div>
        {rows.length === 0 ? (
          <div className="text-sm text-gray-400">暂无记录</div>
        ) : (
          <ul className="space-y-3 text-xs">
            {rows.map(r => (
              <li key={r.id} className="border-b pb-2">
                <div className="flex items-center gap-2">
                  <span className="font-mono">{r.code}</span>
                  <span className="text-indigo-600">{r.action}</span>
                  <span className="text-gray-400 ml-auto">{new Date(r.created_at).toLocaleString()}</span>
                </div>
                <div className="text-gray-500">by {r.actor || '-'}</div>
                {r.diff ? (
                  <pre className="mt-1 bg-gray-50 dark:bg-gray-800 p-2 rounded overflow-auto">
                    {JSON.stringify(r.diff, null, 2)}
                  </pre>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  );
}

export default AdminTaxonomy;
