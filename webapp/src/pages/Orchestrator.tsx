import { useState, useEffect } from 'react';
import { orchestratorApi, type WorkflowRule, type TaskSchedule } from '../api/client';
import './Orchestrator.css';

export function Orchestrator() {
  const [activeTab, setActiveTab] = useState<'rules' | 'queue'>('rules');
  const [rules, setRules] = useState<WorkflowRule[]>([]);
  const [queue, setQueue] = useState<TaskSchedule[]>([]);
  const [loading, setLoading] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [simulationResult, setSimulationResult] = useState<any>(null);

  // Simulation form state
  const [simForm, setSimForm] = useState({
    taskId: '',
    currentStage: 2,
    qualityScore: 85,
    hotScore: 70,
    wordCount: 1500,
    sentiment: 'neutral',
    complianceScore: 90,
    contentType: 'article',
  });

  useEffect(() => {
    if (activeTab === 'rules') {
      fetchRules();
    } else {
      fetchQueue();
    }
  }, [activeTab]);

  const fetchRules = async () => {
    setLoading(true);
    try {
      const res = await orchestratorApi.getRules();
      setRules(res.items || []);
    } catch (error) {
      console.error('Failed to fetch rules:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchQueue = async () => {
    setLoading(true);
    try {
      const res = await orchestratorApi.getQueue();
      setQueue(res.items || []);
    } catch (error) {
      console.error('Failed to fetch queue:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSimulate = async () => {
    setSimulating(true);
    try {
      const res = await orchestratorApi.processWorkflow({
        taskId: simForm.taskId || `task-${Date.now()}`,
        currentStage: simForm.currentStage,
        qualityScore: simForm.qualityScore,
        hotScore: simForm.hotScore,
        wordCount: simForm.wordCount,
        sentiment: simForm.sentiment,
        complianceScore: simForm.complianceScore,
        contentType: simForm.contentType,
      });
      setSimulationResult(res);
    } catch (error) {
      console.error('Simulation failed:', error);
    } finally {
      setSimulating(false);
    }
  };

  const getActionTypeText = (type: string) => {
    const map: Record<string, string> = {
      back_to_stage: '退回阶段',
      skip_step: '跳过步骤',
      add_warning: '添加警告',
      notify: '发送通知',
      split_output: '输出分割',
      block_and_notify: '阻断并通知',
    };
    return map[type] || type;
  };

  const getStatusText = (status: string) => {
    const map: Record<string, string> = {
      pending: '待处理',
      processing: '处理中',
      completed: '已完成',
      failed: '失败',
    };
    return map[status] || status;
  };

  const getStatusClass = (status: string) => {
    return `status-${status}`;
  };

  return (
    <div className="orchestrator">
      <div className="page-header">
        <h1>🔄 智能流水线编排</h1>
        <p className="page-desc">工作流规则管理与任务队列调度</p>
      </div>

      <div className="tabs">
        <button className={`tab ${activeTab === 'rules' ? 'active' : ''}`} onClick={() => setActiveTab('rules')}>
          📋 工作流规则
        </button>
        <button className={`tab ${activeTab === 'queue' ? 'active' : ''}`} onClick={() => setActiveTab('queue')}>
          ⏳ 任务队列 ({queue.length})
        </button>
      </div>

      {activeTab === 'rules' && (
        <div className="rules-section">
          <div className="section-grid">
            <div className="rules-list-panel">
              <div className="panel-header">
                <h3>规则列表 ({rules.length})</h3>
                <span className="hint">已启用规则将自动应用于对应阶段</span>
              </div>

              {loading ? (
                <div className="loading">加载中...</div>
              ) : rules.length === 0 ? (
                <div className="empty-state">暂无工作流规则</div>
              ) : (
                <div className="rules-list">
                  {rules.map((rule) => (
                    <div key={rule.id} className={`rule-card ${rule.isEnabled ? 'enabled' : 'disabled'}`}>
                      <div className="rule-header">
                        <span className="rule-name">{rule.name}</span>
                        <span className={`rule-status ${rule.isEnabled ? 'enabled' : 'disabled'}`}>
                          {rule.isEnabled ? '已启用' : '已禁用'}
                        </span>
                      </div>
                      {rule.description && <div className="rule-desc">{rule.description}</div>}
                      <div className="rule-condition">
                        <span className="label">条件:</span>
                        <code>{rule.conditionExpression}</code>
                      </div>
                      <div className="rule-action">
                        <span className="label">动作:</span>
                        <span className="action-badge">{getActionTypeText(rule.actionType)}</span>
                      </div>
                      <div className="rule-meta">
                        <span>优先级: {rule.priority}</span>
                        {rule.triggerStage && <span>触发阶段: {rule.triggerStage}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="simulation-panel">
              <div className="panel-header">
                <h3>🧪 规则模拟器</h3>
                <span className="hint">测试工作流规则执行效果</span>
              </div>

              <div className="sim-form">
                <div className="form-row">
                  <div className="form-group">
                    <label>当前阶段</label>
                    <select
                      value={simForm.currentStage}
                      onChange={(e) => setSimForm({ ...simForm, currentStage: parseInt(e.target.value) })}
                    >
                      <option value={1}>Stage 1 - 策划</option>
                      <option value={2}>Stage 2 - 研究</option>
                      <option value={3}>Stage 3 - 文稿</option>
                      <option value={4}>Stage 4 - 审核</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>内容类型</label>
                    <select
                      value={simForm.contentType}
                      onChange={(e) => setSimForm({ ...simForm, contentType: e.target.value })}
                    >
                      <option value="article">文章</option>
                      <option value="report">研报</option>
                      <option value="news">快讯</option>
                      <option value="video">视频</option>
                    </select>
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>质量评分 ({simForm.qualityScore})</label>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={simForm.qualityScore}
                      onChange={(e) => setSimForm({ ...simForm, qualityScore: parseInt(e.target.value) })}
                    />
                  </div>
                  <div className="form-group">
                    <label>热度评分 ({simForm.hotScore})</label>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={simForm.hotScore}
                      onChange={(e) => setSimForm({ ...simForm, hotScore: parseInt(e.target.value) })}
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>合规评分 ({simForm.complianceScore})</label>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={simForm.complianceScore}
                      onChange={(e) => setSimForm({ ...simForm, complianceScore: parseInt(e.target.value) })}
                    />
                  </div>
                  <div className="form-group">
                    <label>字数 ({simForm.wordCount})</label>
                    <input
                      type="number"
                      value={simForm.wordCount}
                      onChange={(e) => setSimForm({ ...simForm, wordCount: parseInt(e.target.value) })}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label>情感倾向</label>
                  <div className="radio-group">
                    {['positive', 'neutral', 'negative'].map((s) => (
                      <label key={s} className="radio-label">
                        <input
                          type="radio"
                          name="sentiment"
                          value={s}
                          checked={simForm.sentiment === s}
                          onChange={(e) => setSimForm({ ...simForm, sentiment: e.target.value })}
                        />
                        {s === 'positive' ? '正面' : s === 'neutral' ? '中性' : '负面'}
                      </label>
                    ))}
                  </div>
                </div>

                <button className="btn btn-primary simulate-btn" onClick={handleSimulate} disabled={simulating}>
                  {simulating ? '模拟中...' : '▶️ 运行模拟'}
                </button>
              </div>

              {simulationResult && (
                <div className="simulation-result">
                  <h4>模拟结果</h4>
                  <div className={`result-status ${simulationResult.shouldProceed ? 'success' : 'blocked'}`}>
                    {simulationResult.shouldProceed ? '✅ 流程继续' : '⛔ 流程被阻断'}
                  </div>

                  {simulationResult.appliedRules.length > 0 && (
                    <div className="applied-rules">
                      <h5>触发的规则 ({simulationResult.appliedRules.length})</h5>
                      {simulationResult.appliedRules.map((rule: WorkflowRule, idx: number) => (
                        <div key={idx} className="applied-rule-item">
                          <span className="rule-name">{rule.name}</span>
                          <span className="action-type">{getActionTypeText(rule.actionType)}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {simulationResult.messages.length > 0 && (
                    <div className="result-messages">
                      <h5>执行消息</h5>
                      {simulationResult.messages.map((msg: string, idx: number) => (
                        <div key={idx} className="message-item">{msg}</div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'queue' && (
        <div className="queue-section">
          <div className="queue-stats">
            <div className="stat-card">
              <span className="stat-value">{queue.filter((t) => t.status === 'pending').length}</span>
              <span className="stat-label">待处理</span>
            </div>
            <div className="stat-card">
              <span className="stat-value">{queue.filter((t) => t.status === 'processing').length}</span>
              <span className="stat-label">处理中</span>
            </div>
            <div className="stat-card">
              <span className="stat-value">{queue.length}</span>
              <span className="stat-label">总任务</span>
            </div>
          </div>

          <div className="queue-list">
            {loading ? (
              <div className="loading">加载中...</div>
            ) : queue.length === 0 ? (
              <div className="empty-state">任务队列为空</div>
            ) : (
              queue.map((task) => (
                <div key={task.id} className="queue-item">
                  <div className="queue-item-main">
                    <div className="task-info">
                      <span className="task-type">{task.taskType}</span>
                      <span className={`task-status ${getStatusClass(task.status)}`}>
                        {getStatusText(task.status)}
                      </span>
                    </div>
                    <div className="task-stage">Stage {task.stage}</div>
                  </div>

                  <div className="queue-item-meta">
                    <div className="priority-badge" style={{ '--priority': task.priority } as any}>
                      P{task.priority}
                    </div>
                    {task.assignedTo && (
                      <div className="assigned-to">分配给: {task.assignedTo}</div>
                    )}
                    {task.dueTime && (
                      <div className="due-time">
                        截止: {new Date(task.dueTime).toLocaleString()}
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
