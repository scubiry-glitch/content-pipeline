import { useState, useEffect } from 'react';
import { useTasks } from '../contexts/TasksContext';
import './AISummary.css';

export function AISummary() {
  const { tasks } = useTasks();
  const [summary, setSummary] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [showReport, setShowReport] = useState(false);

  // 生成智能摘要
  const generateSummary = () => {
    setLoading(true);

    // 模拟AI生成摘要
    setTimeout(() => {
      const completedToday = tasks.filter(t => {
        if (t.status !== 'completed') return false;
        const completedDate = t.updated_at ? new Date(t.updated_at) : null;
        if (!completedDate) return false;
        const today = new Date();
        return completedDate.toDateString() === today.toDateString();
      }).length;

      const pendingTasks = tasks.filter(t => t.status === 'pending').length;
      const overdueTasks = tasks.filter(t => {
        if (t.status === 'completed') return false;
        if (!t.due_date) return false;
        return new Date(t.due_date) < new Date();
      }).length;

      const inProgressTasks = tasks.filter(t =>
        ['planning', 'researching', 'writing', 'reviewing'].includes(t.status)
      ).length;

      let summaryText = '';

      if (completedToday > 0) {
        summaryText += `🎉 今天已完成 ${completedToday} 个任务，`;
      } else {
        summaryText += '📋 今天还没有完成任务，';
      }

      if (overdueTasks > 0) {
        summaryText += `有 ${overdueTasks} 个任务已逾期，建议优先处理。`;
      } else if (pendingTasks > 0) {
        summaryText += `还有 ${pendingTasks} 个待处理任务。`;
      } else {
        summaryText += '所有任务都在正常推进中！';
      }

      if (inProgressTasks > 0) {
        summaryText += ` 目前 ${inProgressTasks} 个任务正在进行中。`;
      }

      // 添加智能建议
      if (overdueTasks > 3) {
        summaryText += '\n\n💡 **建议**: 逾期任务较多，建议调整优先级或分配资源。';
      } else if (pendingTasks > 10) {
        summaryText += '\n\n💡 **建议**: 待处理任务积压，建议批量处理或创建自动化规则。';
      } else if (completedToday >= 3) {
        summaryText += '\n\n🌟 **表现不错**: 今天效率很高，保持这个节奏！';
      }

      setSummary(summaryText);
      setLoading(false);
    }, 1500);
  };

  // 生成日报
  const generateDailyReport = () => {
    const today = new Date().toLocaleDateString('zh-CN');
    const completedToday = tasks.filter(t => {
      if (t.status !== 'completed') return false;
      const completedDate = t.updated_at ? new Date(t.updated_at) : null;
      if (!completedDate) return false;
      return completedDate.toDateString() === new Date().toDateString();
    });

    const inProgress = tasks.filter(t =>
      ['planning', 'researching', 'writing', 'reviewing'].includes(t.status)
    );

    const report = `# 工作日报 ${today}

## 今日完成情况
${completedToday.length > 0
  ? completedToday.map(t => `- ✅ ${t.topic}`).join('\n')
  : '- 今日暂无完成任务'}

## 进行中任务
${inProgress.length > 0
  ? inProgress.map(t => `- 🔄 ${t.topic} (${getStatusText(t.status)})`).join('\n')
  : '- 暂无进行中任务'}

## 明日计划
- 继续推进进行中的任务
- 处理优先级最高的待办事项

---
*由内容生产流水线系统自动生成*
`;

    // 复制到剪贴板
    navigator.clipboard.writeText(report);
    alert('日报已复制到剪贴板！');
  };

  const getStatusText = (status: string) => {
    const map: Record<string, string> = {
      planning: '策划中',
      researching: '研究中',
      writing: '写作中',
      reviewing: '评审中',
    };
    return map[status] || status;
  };

  useEffect(() => {
    generateSummary();
  }, [tasks]);

  return (
    <div className="ai-summary-card">
      <div className="ai-summary-header">
        <h3>🤖 AI智能摘要</h3>
        <div className="ai-summary-actions">
          <button
            className="btn-refresh"
            onClick={generateSummary}
            disabled={loading}
          >
            {loading ? '⏳' : '🔄'}
          </button>
          <button
            className="btn-report"
            onClick={generateDailyReport}
          >
            📋 复制日报
          </button>
        </div>
      </div>

      <div className="ai-summary-content">
        {loading ? (
          <div className="ai-summary-loading">
            <div className="ai-pulse"></div>
            <span>AI正在分析数据...</span>
          </div>
        ) : (
          <div className="ai-summary-text">
            {summary.split('\n\n').map((paragraph, index) => (
              <p key={index}>{paragraph}</p>
            ))}
          </div>
        )}
      </div>

      <div className="ai-summary-stats">
        <div className="stat-item">
          <span className="stat-value">
            {tasks.filter(t => t.status === 'completed').length}
          </span>
          <span className="stat-label">已完成</span>
        </div>
        <div className="stat-item">
          <span className="stat-value">
            {tasks.filter(t => ['planning', 'researching', 'writing', 'reviewing'].includes(t.status)).length}
          </span>
          <span className="stat-label">进行中</span>
        </div>
        <div className="stat-item">
          <span className="stat-value">
            {tasks.filter(t => {
              if (!t.due_date || t.status === 'completed') return false;
              return new Date(t.due_date) < new Date();
            }).length}
          </span>
          <span className="stat-label">已逾期</span>
        </div>
      </div>
    </div>
  );
}
