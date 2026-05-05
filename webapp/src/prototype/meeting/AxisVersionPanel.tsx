// AxisVersionPanel.tsx — 版本时间轴 · 挂在 4 轴页面右上角的「版本历史」浮层
//
// 列出 mn_axis_versions（按 scope×axis）→ 用户可对任一历史版本点「回滚」
// 后端 POST /versions/:id/restore 把 snapshot 反写到 mn_*（带 source='restored'，
// 保留 manual_import / human_edit 不动）→ 同时再写一行 restored-from-vN 作锚点
// 整个流程是 P3 闭环的前端入口

import { useEffect, useState } from 'react';
import { meetingNotesApi } from '../../api/meetingNotes';
import { useMeetingScope } from './_scopeContext';
import { MonoMeta } from './_atoms';

interface VersionRow {
  id: string;
  runId: string;
  scope: { kind: string; id: string | null };
  axis: string;
  versionLabel: string;
  createdAt: string;
}

type RestoreState =
  | { kind: 'idle' }
  | { kind: 'previewing'; versionId: string; versionLabel: string }
  | { kind: 'previewed'; versionId: string; versionLabel: string; affected: any }
  | { kind: 'restoring'; versionId: string; versionLabel: string }
  | { kind: 'done'; versionId: string; newLabel: string }
  | { kind: 'error'; versionId: string; message: string };

export function AxisVersionPanel({
  axis,
  scopeKind,
  scopeIdOverride,
  onClose,
}: {
  axis: string;
  scopeKind: 'project' | 'library' | 'meeting';
  /** scopeKind='meeting' 时由调用方传入 meetingId；scopeKind='project' 时可用于 URL ?scopeId 直链场景覆盖 ScopePill */
  scopeIdOverride?: string;
  onClose?: () => void;
}) {
  const meetingScope = useMeetingScope();
  const scopeId =
    scopeKind === 'library'  ? null :
    scopeKind === 'meeting'  ? (scopeIdOverride ?? null) :
    (scopeIdOverride ?? meetingScope.effectiveScopeId);

  const [versions, setVersions] = useState<VersionRow[] | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [restore, setRestore] = useState<RestoreState>({ kind: 'idle' });
  const [confirmText, setConfirmText] = useState('');

  async function reload() {
    setLoadErr(null);
    setVersions(null);
    try {
      const r = await meetingNotesApi.listVersions(scopeKind, axis, scopeId ?? undefined, 30);
      setVersions(r.items as VersionRow[]);
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => { reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [axis, scopeKind, scopeId]);

  async function previewRestore(v: VersionRow) {
    setRestore({ kind: 'previewing', versionId: v.id, versionLabel: v.versionLabel });
    setConfirmText('');
    try {
      const r = await meetingNotesApi.restoreVersion(v.id, { dryRun: true });
      setRestore({
        kind: 'previewed',
        versionId: v.id,
        versionLabel: v.versionLabel,
        affected: r.affected,
      });
    } catch (e) {
      setRestore({ kind: 'error', versionId: v.id, message: e instanceof Error ? e.message : String(e) });
    }
  }

  async function confirmRestore() {
    if (restore.kind !== 'previewed') return;
    if (confirmText.trim() !== '回滚') return;
    setRestore({ kind: 'restoring', versionId: restore.versionId, versionLabel: restore.versionLabel });
    try {
      const r = await meetingNotesApi.restoreVersion(restore.versionId, {});
      setRestore({
        kind: 'done',
        versionId: restore.versionId,
        newLabel: r.newVersionLabel ?? '',
      });
      reload();
    } catch (e) {
      setRestore({ kind: 'error', versionId: restore.versionId, message: e instanceof Error ? e.message : String(e) });
    }
  }

  function totalAffected(affected: any): { deleted: number; inserted: number; skipped: number } {
    let d = 0, i = 0, s = 0;
    for (const ax of Object.values(affected ?? {})) {
      for (const sub of Object.values(ax as any)) {
        const x = sub as any;
        d += x.deleted ?? 0;
        i += x.inserted ?? 0;
        s += x.skipped ?? 0;
      }
    }
    return { deleted: d, inserted: i, skipped: s };
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        paddingTop: 60, fontFamily: 'var(--sans)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--paper)', borderRadius: 10, width: 720, maxHeight: '80vh',
          overflow: 'hidden', boxShadow: '0 24px 64px -16px rgba(0,0,0,0.4)',
          display: 'flex', flexDirection: 'column',
        }}
      >
        <div style={{
          padding: '14px 22px', borderBottom: '1px solid var(--line-2)',
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <span style={{ fontSize: 18 }}>📚</span>
          <div>
            <div style={{ fontFamily: 'var(--serif)', fontSize: 17, fontWeight: 600 }}>
              版本历史 · 「{axis}」轴
            </div>
            <MonoMeta style={{ fontSize: 10.5, color: 'var(--ink-3)' }}>
              scope={scopeKind}{scopeId ? ` · id=${scopeId.slice(0, 8)}…` : ''}
            </MonoMeta>
          </div>
          <button
            onClick={onClose}
            style={{
              marginLeft: 'auto', border: 0, background: 'transparent', cursor: 'pointer',
              fontSize: 16, color: 'var(--ink-3)', padding: '4px 8px',
            }}
          >×</button>
        </div>

        {/* Body：版本列表 */}
        <div style={{ overflow: 'auto', padding: '12px 22px' }}>
          {loadErr && <div style={{ color: '#991b1b', fontSize: 13 }}>加载失败：{loadErr}</div>}
          {!versions && !loadErr && <div style={{ color: 'var(--ink-3)', fontSize: 13 }}>载入中…</div>}
          {versions?.length === 0 && (
            <div style={{ color: 'var(--ink-3)', fontSize: 13, padding: '20px 0', textAlign: 'center' }}>
              尚无快照。点 ↻ 重算时会自动写一份临时版本，那时这里会出现。
            </div>
          )}
          {versions?.map((v) => (
            <div key={v.id} style={{
              padding: '10px 0', borderBottom: '1px solid var(--line-2)',
              display: 'flex', alignItems: 'center', gap: 12,
            }}>
              <span style={{
                fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 600,
                background: 'var(--paper-2)', padding: '3px 8px', borderRadius: 4,
                color: v.versionLabel.startsWith('restored') ? '#7c2d12' : 'var(--ink-2)',
              }}>{v.versionLabel}</span>
              <span style={{ fontSize: 11.5, color: 'var(--ink-3)', fontFamily: 'var(--mono)' }}>
                {new Date(v.createdAt).toLocaleString()}
              </span>
              <span style={{ fontSize: 11, color: 'var(--ink-4)', fontFamily: 'var(--mono)' }}>
                run {v.runId.slice(0, 8)}…
              </span>
              <button
                onClick={() => previewRestore(v)}
                disabled={restore.kind === 'restoring' || restore.kind === 'previewing'}
                style={{
                  marginLeft: 'auto',
                  padding: '5px 11px', border: '1px solid var(--line)',
                  background: 'var(--paper)', borderRadius: 4, fontSize: 11.5,
                  cursor: 'pointer', color: 'var(--ink-2)', fontFamily: 'var(--sans)',
                }}
              >
                ↺ 回滚到此版本
              </button>
            </div>
          ))}
        </div>

        {/* Restore confirm panel */}
        {restore.kind === 'previewing' && (
          <div style={{
            padding: '12px 22px', background: '#fffbeb', borderTop: '1px solid #fde68a',
            fontSize: 12.5, color: '#78350f',
          }}>
            ⏳ 估算 <b>{restore.versionLabel}</b> 回滚影响…
          </div>
        )}
        {restore.kind === 'previewed' && (() => {
          const t = totalAffected(restore.affected);
          return (
            <div style={{
              padding: '14px 22px', background: '#fef2f2', borderTop: '2px solid #fecaca',
              fontSize: 12.5, color: '#991b1b',
            }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>
                ⚠ 即将回滚到 <b>{restore.versionLabel}</b>
              </div>
              <div style={{ marginBottom: 8 }}>
                估算覆盖：删除 <b>{t.deleted}</b> 行 LLM 数据 ·
                写入 <b>{t.inserted}</b> 行（标 source=restored）·
                <span style={{ color: '#065f46' }}>跳过 <b>{t.skipped}</b> 行 manual_import / human_edit（保留不动）</span>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10 }}>
                <input
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder="输入「回滚」解锁"
                  autoFocus
                  style={{
                    flex: 1, padding: '7px 10px', border: '1px solid #fca5a5',
                    borderRadius: 4, fontSize: 13, fontFamily: 'var(--sans)',
                  }}
                />
                <button
                  onClick={confirmRestore}
                  disabled={confirmText.trim() !== '回滚'}
                  style={{
                    padding: '7px 14px', borderRadius: 4, fontSize: 12.5, fontWeight: 600,
                    border: '1px solid #991b1b',
                    background: confirmText.trim() === '回滚' ? '#b91c1c' : '#fca5a5',
                    color: 'var(--paper)',
                    cursor: confirmText.trim() === '回滚' ? 'pointer' : 'not-allowed',
                  }}
                >执行回滚</button>
                <button
                  onClick={() => { setRestore({ kind: 'idle' }); setConfirmText(''); }}
                  style={{
                    padding: '7px 12px', borderRadius: 4, fontSize: 12.5,
                    border: '1px solid var(--line)', background: 'var(--paper)',
                    color: 'var(--ink-2)', cursor: 'pointer',
                  }}
                >取消</button>
              </div>
            </div>
          );
        })()}
        {restore.kind === 'restoring' && (
          <div style={{ padding: '14px 22px', background: 'var(--paper-2)', fontSize: 13 }}>
            ⏳ 正在写回 mn_* 表…
          </div>
        )}
        {restore.kind === 'done' && (
          <div style={{
            padding: '14px 22px', background: '#ecfdf5', borderTop: '1px solid #a7f3d0',
            fontSize: 13, color: '#065f46',
          }}>
            ✓ 回滚完成，新锚点版本：<b>{restore.newLabel}</b>。
            <button
              onClick={() => setRestore({ kind: 'idle' })}
              style={{ marginLeft: 12, padding: '4px 10px', borderRadius: 3, fontSize: 12, cursor: 'pointer' }}
            >好的</button>
          </div>
        )}
        {restore.kind === 'error' && (
          <div style={{
            padding: '14px 22px', background: '#fef2f2', borderTop: '1px solid #fecaca',
            fontSize: 12.5, color: '#991b1b',
          }}>
            ✗ 回滚失败：{restore.message}
            <button
              onClick={() => setRestore({ kind: 'idle' })}
              style={{ marginLeft: 12, padding: '4px 10px', borderRadius: 3, fontSize: 12, cursor: 'pointer' }}
            >关闭</button>
          </div>
        )}
      </div>
    </div>
  );
}
