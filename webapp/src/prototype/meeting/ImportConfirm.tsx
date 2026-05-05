// ImportConfirm — 把分享会议复制到当前工作区的确认弹层
// 由 SharedMeetingPage / SharedMeetingDetailShell 共用
//
// asset-only fork v1:复制会议元数据 + 原文 + analysis,不带 axis 数据。
// 副本里三轴空白,B 在自己 ws 点"重新分析"重新生成。

import './_tokens.css';

export function ImportConfirm({
  targetWorkspaceName,
  meetingTitle,
  importing,
  error,
  onConfirm,
  onCancel,
}: {
  targetWorkspaceName: string;
  meetingTitle: string;
  importing: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget && !importing) onCancel(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(0,0,0,0.35)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div style={{
        width: 480, maxWidth: 'calc(100vw - 32px)',
        background: 'var(--paper)', borderRadius: 10,
        border: '1px solid var(--line-2)', padding: '20px 22px',
        boxShadow: '0 10px 40px rgba(0,0,0,0.18)',
      }}>
        <div style={{
          fontFamily: 'var(--serif)', fontSize: 16, fontWeight: 700,
          color: 'var(--ink)', marginBottom: 10,
        }}>
          复制到工作区
        </div>

        <div style={{ fontFamily: 'var(--serif)', fontSize: 13.5, lineHeight: 1.65, color: 'var(--ink-2)', marginBottom: 14 }}>
          将把会议「<span style={{ fontWeight: 600 }}>{meetingTitle}</span>」的元数据和原文复制到你的工作区
          「<span style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{targetWorkspaceName}</span>」。
        </div>

        <div style={{
          padding: '10px 12px', borderRadius: 6, marginBottom: 14,
          background: 'oklch(0.97 0.02 90)', border: '1px solid oklch(0.86 0.06 90)',
          fontFamily: 'var(--serif)', fontSize: 12.5, lineHeight: 1.6, color: 'oklch(0.4 0.08 60)',
        }}>
          ⚠️ 导入后副本只含原文 + 摘要,
          <span style={{ fontWeight: 600 }}>三轴 (人物 / 项目 / 知识) 等分析数据不会带过来</span>
          ,你需要在新副本上点 "重新分析" 让引擎在你的工作区重新生成。
        </div>

        {error && (
          <div style={{
            padding: '8px 10px', borderRadius: 5, marginBottom: 12,
            background: 'oklch(0.96 0.05 25)', border: '1px solid oklch(0.78 0.13 25)',
            fontFamily: 'var(--serif)', fontSize: 12.5, color: 'oklch(0.4 0.18 25)',
          }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            onClick={onCancel}
            disabled={importing}
            style={{
              padding: '6px 14px', borderRadius: 6,
              border: '1px solid var(--line)', background: 'var(--paper-2)', color: 'var(--ink-2)',
              fontFamily: 'var(--sans)', fontSize: 12.5, fontWeight: 500,
              cursor: importing ? 'not-allowed' : 'pointer', opacity: importing ? 0.5 : 1,
            }}
          >
            取消
          </button>
          <button
            onClick={onConfirm}
            disabled={importing}
            style={{
              padding: '6px 16px', borderRadius: 6,
              border: '1px solid var(--ink)', background: 'var(--ink)', color: 'var(--paper)',
              fontFamily: 'var(--sans)', fontSize: 12.5, fontWeight: 600,
              cursor: importing ? 'not-allowed' : 'pointer', opacity: importing ? 0.6 : 1,
            }}
          >
            {importing ? '复制中…' : `复制到 ${targetWorkspaceName}`}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ImportConfirm;

/** Map import API error → 中文提示 */
export function importErrorMessage(e: any): string {
  const status = e?.status;
  if (status === 401) return '请先登录后再导入';
  if (status === 403) return '你的当前账号未加入任何工作区';
  if (status === 410) return '分享链接已过期';
  if (status === 404) return '链接失效或源会议已删除';
  return e?.message ?? '导入失败,请稍后重试';
}
