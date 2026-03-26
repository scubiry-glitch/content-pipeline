// 侧边栏统计组件 - 恢复原版 HTML 的详细统计功能
import { useState, useEffect } from 'react';
import { useTasks } from '../contexts/TasksContext';
import { reportsApi } from '../api/client';
import './SidebarStats.css';

export function SidebarStats() {
  const { tasks } = useTasks();
  const [hotTopicsCount, setHotTopicsCount] = useState<number>(0);
  const [qualityScore, setQualityScore] = useState<string>('-');

  useEffect(() => {
    loadHotTopics();
  }, []);

  const loadHotTopics = async () => {
    try {
      const response = await reportsApi.getAll({ limit: 100 });
      const reports = response.items || [];
      const highQualityCount = reports.filter((r: any) => (r.quality_score || 0) > 0.7).length;
      setHotTopicsCount(reports.length);
      setQualityScore(highQualityCount > 0 ? `${(highQualityCount / reports.length * 100).toFixed(0)}%` : '-');
    } catch {
      // Silently ignore errors
    }
  };

  // 计算统计数据
  const stats = {
    total: tasks.length,
    active: tasks.filter((t) =>
      ['planning', 'researching', 'writing', 'reviewing', 'converting'].includes(t.status)
    ).length,
    completed: tasks.filter((t) => t.status === 'completed').length,
    pending: tasks.filter((t) => t.status === 'pending').length,
  };

  // 计算本周新增
  const getWeeklyNew = () => {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    return tasks.filter((t) => new Date(t.created_at) > weekAgo).length;
  };

  // 计算平均完成时间
  const getAvgCompletionTime = () => {
    const completedTasks = tasks.filter(
      (t) => t.status === 'completed' && t.completed_at && t.created_at
    );
    if (completedTasks.length === 0) return '-';

    const totalHours = completedTasks.reduce((sum, t) => {
      const start = new Date(t.created_at).getTime();
      const end = new Date(t.completed_at!).getTime();
      return sum + (end - start) / (1000 * 60 * 60);
    }, 0);

    const avgHours = Math.round(totalHours / completedTasks.length);
    if (avgHours < 24) return `${avgHours}小时`;
    return `${(avgHours / 24).toFixed(1)}天`;
  };

  return (
    <aside className="sidebar-stats">
      {/* 数据统计 */}
      <div className="sidebar-section">
        <div className="sidebar-title">📊 数据统计</div>
        <div className="stats-list">
          <div className="stat-row">
            <span className="stat-name">总任务</span>
            <span className="stat-value">{stats.total}</span>
          </div>
          <div className="stat-row">
            <span className="stat-name">进行中</span>
            <span className="stat-value stat-active">{stats.active}</span>
          </div>
          <div className="stat-row">
            <span className="stat-name">已完成</span>
            <span className="stat-value stat-completed">{stats.completed}</span>
          </div>
          <div className="stat-row">
            <span className="stat-name">待处理</span>
            <span className="stat-value stat-pending">{stats.pending}</span>
          </div>
        </div>
      </div>

      {/* 快速概览 */}
      <div className="sidebar-section">
        <div className="sidebar-title">📈 快速概览</div>
        <div className="quick-info">
          <div className="quick-info-item">
            <span className="quick-info-label">本周新增</span>
            <span className="quick-info-value">{getWeeklyNew()}</span>
          </div>
          <div className="quick-info-item">
            <span className="quick-info-label">平均完成时间</span>
            <span className="quick-info-value">{getAvgCompletionTime()}</span>
          </div>
        </div>
      </div>

      {/* 内容质量输入 (v3.0) */}
      <div className="sidebar-section">
        <div className="sidebar-title">
          <span>📊 内容质量输入 (v3.0)</span>
        </div>
        <div className="quick-info">
          <div className="quick-info-item clickable" onClick={loadHotTopics}>
            <span className="quick-info-label">🕐 RSS源状态</span>
            <span className="quick-info-value small">24源正常</span>
          </div>
          <div className="quick-info-item clickable" onClick={loadHotTopics}>
            <span className="quick-info-label">🔥 热点话题</span>
            <span className="quick-info-value">{hotTopicsCount || '-'}</span>
          </div>
          <div className="quick-info-item clickable" onClick={loadHotTopics}>
            <span className="quick-info-label">📊 综合质量分</span>
            <span className="quick-info-value">{qualityScore}</span>
          </div>
          <div className="quick-info-item clickable">
            <span className="quick-info-label">💡 智能推荐</span>
            <span className="quick-info-value small success">v3.1已启用</span>
          </div>
          <div className="quick-info-item clickable">
            <span className="quick-info-label">😊 情感分析</span>
            <span className="quick-info-value small success">v3.2已启用</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
