// LG Writing Tab - 文稿生成
// 草稿 Markdown 预览 + 字数统计 + 多轮修订对比

import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import type { LGTaskContext } from '../LGTaskDetailLayout';
import { LivePreviewMarkdown } from '../../components/content/LivePreviewMarkdown';

export function LGWritingTab() {
  const { detail } = useOutletContext<LGTaskContext>();
  const [selectedRound, setSelectedRound] = useState<number | null>(null);

  if (!detail) {
    return <div className="tab-panel"><p style={{ color: 'var(--text-muted)' }}>暂无任务数据</p></div>;
  }

  const draftContent = detail.draftContent;
  const blueTeamRounds = detail.blueTeamRounds || [];

  if (!draftContent) {
    return (
      <div className="tab-panel">
        <div className="info-card full-width" style={{ textAlign: 'center', padding: '48px 24px' }}>
          <span className="material-icons-outlined" style={{ fontSize: '48px', color: 'var(--text-muted)', marginBottom: '16px', display: 'block' }}>
            edit_note
          </span>
          <h3 style={{ color: 'var(--text-secondary)', marginBottom: '8px' }}>草稿尚未生成</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
            完成研究阶段后，Pipeline 将自动进入写作阶段
          </p>
          <div className="lg-progress-bar" style={{ maxWidth: '300px', margin: '16px auto 0', height: '4px', borderRadius: '2px' }}>
            <div className="lg-progress-fill" style={{ width: `${detail.progress || 0}%`, height: '100%', borderRadius: '2px' }} />
          </div>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>当前进度: {detail.progress || 0}%</span>
        </div>
      </div>
    );
  }

  // 当前展示的内容：选中的修订轮次 或 最终草稿
  const displayContent = selectedRound !== null
    ? (blueTeamRounds[selectedRound]?.revisionContent || draftContent)
    : draftContent;

  const wordCount = displayContent.replace(/\s/g, '').length;

  return (
    <div className="tab-panel">
      {/* 草稿统计 */}
      <div className="panel-grid" style={{ marginBottom: '24px' }}>
        <div className="section-header">
          <div className="section-title">
            <span className="material-icons-outlined">edit_note</span>
            文稿内容
          </div>
          <div className="section-desc">
            {blueTeamRounds.length > 0
              ? `经过 ${blueTeamRounds.length} 轮蓝军评审修订`
              : '初稿'
            }
          </div>
        </div>

        <div className="info-card">
          <div className="card-title">
            <span className="material-icons-outlined">analytics</span>
            文稿统计
          </div>
          <div className="info-item">
            <span className="label">字数</span>
            <span className="value highlight">{wordCount.toLocaleString()}</span>
          </div>
          <div className="info-item">
            <span className="label">修订轮数</span>
            <span className="value">{blueTeamRounds.length}</span>
          </div>
          <div className="info-item">
            <span className="label">评审状态</span>
            <span className="value" style={{ color: detail.reviewPassed ? 'var(--success)' : 'var(--warning, #f59e0b)' }}>
              {detail.reviewPassed ? '已通过' : '审核中'}
            </span>
          </div>
        </div>

        {/* 版本选择器 */}
        {blueTeamRounds.length > 0 && (
          <div className="info-card">
            <div className="card-title">
              <span className="material-icons-outlined">history</span>
              版本历史
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <button
                onClick={() => setSelectedRound(null)}
                style={{
                  padding: '8px 12px', borderRadius: 'var(--radius-sm)',
                  border: selectedRound === null ? '2px solid var(--primary)' : '1px solid var(--divider)',
                  background: selectedRound === null ? 'var(--primary-alpha)' : 'var(--surface)',
                  color: 'var(--text)', cursor: 'pointer', textAlign: 'left',
                  fontSize: '13px', fontWeight: selectedRound === null ? 600 : 400,
                }}
              >
                最终版本（当前）
              </button>
              {blueTeamRounds.map((round: any, i: number) => (
                <button
                  key={i}
                  onClick={() => setSelectedRound(i)}
                  style={{
                    padding: '8px 12px', borderRadius: 'var(--radius-sm)',
                    border: selectedRound === i ? '2px solid var(--primary)' : '1px solid var(--divider)',
                    background: selectedRound === i ? 'var(--primary-alpha)' : 'var(--surface)',
                    color: 'var(--text)', cursor: 'pointer', textAlign: 'left',
                    fontSize: '13px', fontWeight: selectedRound === i ? 600 : 400,
                  }}
                >
                  第 {round.round} 轮修订
                  {round.revisionSummary && (
                    <span style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                      {round.revisionSummary.substring(0, 60)}{round.revisionSummary.length > 60 ? '...' : ''}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Markdown 预览 */}
      <LivePreviewMarkdown
        title={selectedRound !== null ? `第 ${blueTeamRounds[selectedRound]?.round || '?'} 轮修订稿` : '最终草稿'}
        content={displayContent}
        showHeader={true}
        minHeight="500px"
      />
    </div>
  );
}
