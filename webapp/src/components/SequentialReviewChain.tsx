// 串行评审版本链组件 - Sequential Review Chain
// 展示从初稿到终稿的完整串行评审流程

import { useState, useEffect } from 'react';
import './SequentialReviewChain.css';

interface ReviewChainItem {
  round: number;
  expertName: string;
  expertRole: string;
  inputDraftId: string;
  outputDraftId: string;
  score: number;
  status: string;
  createdAt: string;
}

interface DraftVersion {
  id: string;
  version: number;
  round: number;
  expertName?: string;
  expertRole?: string;
  changeSummary?: string;
  createdAt: string;
}

interface SequentialReviewChainProps {
  taskId: string;
  onVersionSelect?: (versionId: string) => void;
  selectedVersionId?: string;
}

const EXPERT_ROLE_INFO: Record<string, { name: string; icon: string; color: string; description: string }> = {
  challenger: { 
    name: '批判者', 
    icon: '🔍', 
    color: '#ef4444',
    description: '挑战逻辑漏洞、数据可靠性'
  },
  expander: { 
    name: '拓展者', 
    icon: '⚖️', 
    color: '#f59e0b',
    description: '扩展关联因素、国际对比'
  },
  synthesizer: { 
    name: '提炼者', 
    icon: '👔', 
    color: '#06b6d4',
    description: '归纳核心论点、结构优化'
  },
};

export function SequentialReviewChain({ 
  taskId, 
  onVersionSelect,
  selectedVersionId 
}: SequentialReviewChainProps) {
  const [chain, setChain] = useState<ReviewChainItem[]>([]);
  const [versions, setVersions] = useState<DraftVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadChain();
  }, [taskId]);

  const loadChain = async () => {
    try {
      setLoading(true);
      
      // 获取评审链
      const chainRes = await fetch(`/api/v1/production/${taskId}/sequential-review/chain`, {
        headers: { 'x-api-key': 'dev-api-key' }
      });
      
      if (chainRes.ok) {
        const chainData = await chainRes.json();
        setChain(chainData.chain || []);
      }
      
      // 获取版本列表
      const versionsRes = await fetch(`/api/v1/production/${taskId}/sequential-review/versions`, {
        headers: { 'x-api-key': 'dev-api-key' }
      });
      
      if (versionsRes.ok) {
        const versionsData = await versionsRes.json();
        setVersions(versionsData.versions || []);
      }
    } catch (err) {
      setError('加载评审链失败');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="review-chain-loading">⏳ 加载评审链...</div>;
  }

  if (error) {
    return <div className="review-chain-error">❌ {error}</div>;
  }

  if (chain.length === 0) {
    return (
      <div className="review-chain-empty">
        <div className="empty-icon">📋</div>
        <div className="empty-title">暂无串行评审记录</div>
        <p>启动串行评审后将显示完整的版本演进链</p>
      </div>
    );
  }

  // 构建完整的版本链（包含初始版本）
  const initialVersion = versions.find(v => v.round === 0) || versions[0];
  const chainVersions = chain.map((item, index) => {
    const outputVersion = versions.find(v => v.id === item.outputDraftId);
    return {
      ...item,
      outputVersion,
      isFirst: index === 0,
      isLast: index === chain.length - 1,
    };
  });

  return (
    <div className="sequential-review-chain">
      <div className="chain-header">
        <h3>📜 串行评审版本链</h3>
        <span className="chain-stats">
          共 {chain.length} 轮评审，{versions.length} 个版本
        </span>
      </div>

      <div className="chain-timeline">
        {/* 初始版本 */}
        {initialVersion && (
          <div className="chain-node initial-node">
            <div className="node-marker start-marker">📝</div>
            <div className="node-content">
              <div className="version-card initial-version">
                <div className="version-header">
                  <span className="version-label">初始版本</span>
                  <span className="version-id">{initialVersion.id?.slice(-6)}</span>
                </div>
                <div className="version-meta">
                  <span className="version-time">
                    {new Date(initialVersion.createdAt).toLocaleString('zh-CN')}
                  </span>
                </div>
                <button 
                  className={`version-select-btn ${selectedVersionId === initialVersion.id ? 'active' : ''}`}
                  onClick={() => onVersionSelect?.(initialVersion.id)}
                >
                  查看
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 评审链 */}
        {chainVersions.map((item, index) => {
          const expertInfo = EXPERT_ROLE_INFO[item.expertRole] || { 
            name: item.expertName, 
            icon: '👤', 
            color: '#666',
            description: ''
          };

          return (
            <div key={item.round} className="chain-segment">
              {/* 连接线 */}
              <div className="chain-connector">
                <div className="connector-line" />
                <div className="connector-arrow">↓</div>
              </div>

              {/* 评审节点 */}
              <div className="chain-node review-node">
                <div 
                  className="node-marker expert-marker"
                  style={{ backgroundColor: expertInfo.color + '20', borderColor: expertInfo.color }}
                >
                  <span className="expert-icon">{expertInfo.icon}</span>
                </div>
                
                <div className="node-content">
                  <div className="review-info">
                    <div className="review-header">
                      <span className="round-badge">第 {item.round} 轮</span>
                      <span 
                        className="expert-role-badge"
                        style={{ backgroundColor: expertInfo.color + '20', color: expertInfo.color }}
                      >
                        {expertInfo.name}
                      </span>
                      <span className="score-badge">
                        评分: {item.score || '-'}/100
                      </span>
                    </div>
                    <div className="expert-description">
                      {expertInfo.description}
                    </div>
                  </div>

                  {/* 输出版本 */}
                  {item.outputVersion && (
                    <div className="version-card output-version">
                      <div className="version-header">
                        <span className="version-label">修订后版本</span>
                        <span className="version-id">
                          {item.outputVersion.id?.slice(-6)}
                        </span>
                      </div>
                      <div className="version-changes">
                        {item.outputVersion.changeSummary || '基于专家评审意见自动修订'}
                      </div>
                      <div className="version-actions">
                        <button 
                          className={`version-select-btn ${selectedVersionId === item.outputVersion.id ? 'active' : ''}`}
                          onClick={() => onVersionSelect?.(item.outputVersion.id)}
                        >
                          查看此版本
                        </button>
                        {!item.isFirst && (
                          <button 
                            className="version-compare-btn"
                            onClick={() => {
                              // 打开对比视图
                              const prevVersion = chainVersions[index - 1]?.outputVersion || initialVersion;
                              if (prevVersion && item.outputVersion) {
                                window.open(
                                  `/tasks/${taskId}/compare?from=${prevVersion.id}&to=${item.outputVersion.id}`,
                                  '_blank'
                                );
                              }
                            }}
                          >
                            对比上一版
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {/* 最终版本标记 */}
        {chainVersions.length > 0 && chainVersions[chainVersions.length - 1].outputVersion && (
          <div className="chain-node final-node">
            <div className="node-marker end-marker">🏁</div>
            <div className="node-content">
              <div className="final-version-label">
                最终版本 (第 {chainVersions.length} 轮评审后)
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
