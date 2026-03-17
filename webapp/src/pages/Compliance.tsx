import { useState, useEffect } from 'react';
import { complianceApi, type ComplianceCheckResult, type ComplianceRule } from '../api/client';
import './Compliance.css';

export function Compliance() {
  const [activeTab, setActiveTab] = useState<'check' | 'rules' | 'history'>('check');
  const [content, setContent] = useState('');
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<ComplianceCheckResult | null>(null);
  const [rules, setRules] = useState<ComplianceRule[]>([]);
  const [history, setHistory] = useState<ComplianceCheckResult[]>([]);

  useEffect(() => {
    if (activeTab === 'rules') {
      fetchRules();
    } else if (activeTab === 'history') {
      fetchHistory();
    }
  }, [activeTab]);

  const fetchRules = async () => {
    try {
      const res = await complianceApi.getRules();
      setRules(res.items || []);
    } catch (error) {
      console.error('Failed to fetch rules:', error);
    }
  };

  const fetchHistory = async () => {
    try {
      const res = await complianceApi.getHistory();
      setHistory(res.items || []);
    } catch (error) {
      console.error('Failed to fetch history:', error);
    }
  };

  const handleCheck = async () => {
    if (!content.trim()) return;
    try {
      setChecking(true);
      const res = await complianceApi.checkContent(content);
      setResult(res);
    } catch (error) {
      console.error('Check failed:', error);
    } finally {
      setChecking(false);
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return '#52c41a';
    if (score >= 60) return '#faad14';
    return '#ff4d4f';
  };

  const getScoreText = (score: number) => {
    if (score >= 80) return '合规';
    if (score >= 60) return '需关注';
    return '高风险';
  };

  return (
    <div className="compliance">
      <div className="page-header">
        <h1>🛡️ 智能合规审核</h1>
        <p className="page-desc">自动检测内容中的敏感词、广告法违规、隐私泄露等风险</p>
      </div>

      <div className="tabs">
        <button className={`tab ${activeTab === 'check' ? 'active' : ''}`} onClick={() => setActiveTab('check')}>
          🔍 内容检测
        </button>
        <button className={`tab ${activeTab === 'rules' ? 'active' : ''}`} onClick={() => setActiveTab('rules')}>
          📋 规则管理
        </button>
        <button className={`tab ${activeTab === 'history' ? 'active' : ''}`} onClick={() => setActiveTab('history')}>
          📜 检测历史
        </button>
      </div>

      {activeTab === 'check' && (
        <div className="check-section">
          <div className="input-area">
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="输入要检测的内容..."
              rows={10}
            />
            <button className="btn btn-primary check-btn" onClick={handleCheck} disabled={checking || !content.trim()}>
              {checking ? '检测中...' : '开始检测'}
            </button>
          </div>

          {result && (
            <div className="result-panel">
              <div className="score-card" style={{ borderColor: getScoreColor(result.overallScore) }}>
                <div className="score-value" style={{ color: getScoreColor(result.overallScore) }}>
                  {result.overallScore}
                </div>
                <div className="score-label">{getScoreText(result.overallScore)}</div>
              </div>

              <div className="issues-list">
                <h3>检测结果 ({result.issues.length} 项)</h3>
                {result.issues.length === 0 ? (
                  <div className="no-issues">✅ 未发现问题</div>
                ) : (
                  result.issues.map((issue, idx) => (
                    <div key={idx} className={`issue-item ${issue.level}`}>
                      <div className="issue-header">
                        <span className="issue-type">{issue.type}</span>
                        <span className={`issue-level ${issue.level}`}>{issue.level}</span>
                      </div>
                      <div className="issue-content">{issue.content}</div>
                      <div className="issue-suggestion">💡 {issue.suggestion}</div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'rules' && (
        <div className="rules-section">
          <div className="rules-stats">
            <div className="stat-card">
              <span className="stat-value">{rules.length}</span>
              <span className="stat-label">总规则</span>
            </div>
            <div className="stat-card">
              <span className="stat-value">{rules.filter((r) => r.category === 'sensitive').length}</span>
              <span className="stat-label">敏感词</span>
            </div>
            <div className="stat-card">
              <span className="stat-value">{rules.filter((r) => r.category === 'ad_law').length}</span>
              <span className="stat-label">广告法</span>
            </div>
          </div>

          <div className="rules-list">
            {rules.map((rule) => (
              <div key={rule.id} className="rule-card">
                <div className="rule-header">
                  <span className="rule-category">{rule.category}</span>
                  <span className={`rule-level ${rule.level}`}>{rule.level}</span>
                </div>
                <div className="rule-pattern">{rule.pattern}</div>
                <div className="rule-suggestion">{rule.suggestion}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'history' && (
        <div className="history-section">
          <div className="history-list">
            {history.map((item) => (
              <div key={item.id} className="history-item">
                <div className="history-score" style={{ color: getScoreColor(item.overallScore) }}>
                  {item.overallScore}
                </div>
                <div className="history-info">
                  <div className="history-time">{new Date(item.checkedAt).toLocaleString()}</div>
                  <div className="history-issues">{item.issues.length} 个问题</div>
                </div>
                <div className={`history-status ${item.passed ? 'passed' : 'failed'}`}>
                  {item.passed ? '通过' : '未通过'}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
