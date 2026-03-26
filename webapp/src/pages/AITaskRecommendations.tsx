// AI 任务推荐工作台
// v6.1 展示 AI 生成的任务推荐

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { aiProcessingApi, tasksApi, type AIProcessingStats } from '../api/client';
import { AIQualityBadge, AICategoryTag, AISentimentTag } from '../components/AIQualityBadge';
import './AITaskRecommendations.css';

interface TaskRecommendationItem {
  id: number;
  rss_item_id: string;
  recommendation_data: {
    title: string;
    format: 'report' | 'article' | 'brief' | 'thread';
    priority: 'high' | 'medium' | 'low';
    reason: string;
    content: {
      angle: string;
      keyPoints: string[];
      targetAudience: string;
      estimatedReadTime: number;
      suggestedLength: string;
    };
    timeline: {
      suggestedPublishTime: string;
      urgency: 'immediate' | 'today' | 'this_week' | 'flexible';
      timeWindowReason: string;
    };
  };
  status: string;
  rss_title: string;
  source_name: string;
  hot_score: number;
  quality_score: number;
  primary_category: string;
  sentiment_score: number;
}

export function AITaskRecommendations() {
  const navigate = useNavigate();
  const [recommendations, setRecommendations] = useState<TaskRecommendationItem[]>([]);
  const [stats, setStats] = useState<AIProcessingStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    status: 'pending' as 'pending' | 'accepted' | 'rejected' | 'all',
    priority: '' as '' | 'high' | 'medium' | 'low',
  });
  const [rejectingItem, setRejectingItem] = useState<TaskRecommendationItem | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  useEffect(() => {
    loadData();
  }, [filters.status, filters.priority]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [recsData, statsData] = await Promise.all([
        aiProcessingApi.getTaskRecommendations({
          status: filters.status,
          priority: filters.priority || undefined,
          limit: 50,
        }),
        aiProcessingApi.getStats(),
      ]);
      setRecommendations(recsData.items);
      setStats(statsData);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTask = async (item: TaskRecommendationItem) => {
    try {
      // 创建任务
      const task = await tasksApi.create({
        topic: item.recommendation_data.title,
        source_materials: [{
          type: 'url',
          url: `/rss-items/${item.rss_item_id}`,
          title: item.rss_title,
        }],
        target_formats: [item.recommendation_data.format],
      });

      // 标记推荐为已接受
      await aiProcessingApi.acceptRecommendation(item.id, { taskId: task.id });

      // 跳转到任务详情
      navigate(`/tasks/${task.id}`);
    } catch (error) {
      console.error('Failed to create task:', error);
      alert('创建任务失败');
    }
  };

  const handleReject = async () => {
    if (!rejectingItem || !rejectReason.trim()) return;

    try {
      await aiProcessingApi.rejectRecommendation(rejectingItem.id, rejectReason);
      setRejectingItem(null);
      setRejectReason('');
      loadData();
    } catch (error) {
      console.error('Failed to reject recommendation:', error);
      alert('操作失败');
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('zh-CN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="ai-task-recommendations-page">
      <div className="page-header">
        <h1>
          <span>💡</span>
          <span>AI 任务推荐</span>
        </h1>
        <div className="header-actions">
          <button className="btn btn-primary" onClick={loadData}>
            🔄 刷新
          </button>
        </div>
      </div>

      {/* 统计卡片 */}
      {stats && (
        <div className="stats-grid">
          <div className="stat-card primary">
            <div className="stat-value">{stats.pendingRecommendations}</div>
            <div className="stat-label">待处理推荐</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{stats.totalAnalyzed}</div>
            <div className="stat-label">已分析文章</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{stats.analyzedToday}</div>
            <div className="stat-label">今日分析</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{stats.averageQualityScore}</div>
            <div className="stat-label">平均质量分</div>
          </div>
        </div>
      )}

      {/* 筛选器 */}
      <div className="filters-bar">
        <div className="filter-group">
          <label>状态:</label>
          <select 
            value={filters.status} 
            onChange={(e) => setFilters({ ...filters, status: e.target.value as any })}
          >
            <option value="pending">待处理</option>
            <option value="accepted">已接受</option>
            <option value="rejected">已拒绝</option>
            <option value="all">全部</option>
          </select>
        </div>
        <div className="filter-group">
          <label>优先级:</label>
          <select 
            value={filters.priority} 
            onChange={(e) => setFilters({ ...filters, priority: e.target.value as any })}
          >
            <option value="">全部</option>
            <option value="high">高</option>
            <option value="medium">中</option>
            <option value="low">低</option>
          </select>
        </div>
      </div>

      {/* 推荐列表 */}
      {loading ? (
        <div className="loading-state">加载中...</div>
      ) : recommendations.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">💡</div>
          <div className="empty-title">暂无任务推荐</div>
          <div className="empty-desc">
            AI 会根据高质量 RSS 内容自动生成创作建议
          </div>
        </div>
      ) : (
        <div className="recommendations-list">
          {recommendations.map((item) => (
            <div key={item.id} className="recommendation-card">
              <div className="card-header">
                <div className="source-info">
                  <span className="source-badge">{item.source_name}</span>
                  <span className="date">热度分: {item.hot_score}</span>
                </div>
                <span className={`priority-badge ${item.recommendation_data.priority}`}>
                  {item.recommendation_data.priority === 'high' ? '高优先级' :
                   item.recommendation_data.priority === 'medium' ? '中优先级' : '低优先级'}
                </span>
              </div>

              <h3 className="card-title">{item.rss_title}</h3>

              <div className="scores-row">
                <div className="score-badge quality">
                  <span className="label">AI质量:</span>
                  <span className="value">{item.quality_score}分</span>
                </div>
                <div className="score-badge hot">
                  <span className="label">热度:</span>
                  <span className="value">{item.hot_score}</span>
                </div>
                <div className="score-badge sentiment">
                  <span className="label">情感:</span>
                  <span className="value">{item.sentiment_score > 0 ? '+' : ''}{item.sentiment_score}</span>
                </div>
                <AICategoryTag category={item.primary_category} />
              </div>

              <div className="recommendation-content">
                <div className="rec-reason">{item.recommendation_data.reason}</div>
                <div className="rec-angle">
                  建议角度: {item.recommendation_data.content.angle}
                </div>
                <ul className="rec-keypoints">
                  {item.recommendation_data.content.keyPoints.slice(0, 3).map((point, i) => (
                    <li key={i}>{point}</li>
                  ))}
                </ul>
                <div className="rec-meta">
                  <span>预计阅读: {item.recommendation_data.content.estimatedReadTime}分钟</span>
                  <span>建议篇幅: {item.recommendation_data.content.suggestedLength}</span>
                  <span>urgency: {
                    item.recommendation_data.timeline.urgency === 'immediate' ? '立即' :
                    item.recommendation_data.timeline.urgency === 'today' ? '今日' :
                    item.recommendation_data.timeline.urgency === 'this_week' ? '本周' : '灵活'
                  }</span>
                </div>
              </div>

              {filters.status === 'pending' && (
                <div className="card-actions">
                  <button 
                    className="btn-create"
                    onClick={() => handleCreateTask(item)}
                  >
                    创建任务
                  </button>
                  <button 
                    className="btn-reject"
                    onClick={() => setRejectingItem(item)}
                  >
                    忽略
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 拒绝理由弹窗 */}
      {rejectingItem && (
        <div className="reject-modal-overlay" onClick={() => setRejectingItem(null)}>
          <div className="reject-modal" onClick={(e) => e.stopPropagation()}>
            <h3>忽略推荐</h3>
            <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '12px' }}>
              请提供忽略理由，帮助改进 AI 推荐算法
            </p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="请输入理由（如：话题不感兴趣、已类似内容、时效性不足等）"
              autoFocus
            />
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setRejectingItem(null)}>
                取消
              </button>
              <button 
                className="btn btn-danger" 
                onClick={handleReject}
                disabled={!rejectReason.trim()}
              >
                确认忽略
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
