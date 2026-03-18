import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { predictionApi, type PerformancePrediction, type ScheduledPublish } from '../api/client';
import './Prediction.css';

// 热点洞察Tab导航
function HotTopicsTabs() {
  const navigate = useNavigate();
  const location = useLocation();
  
  const tabs = [
    { id: 'topics', label: '热点列表', icon: '🔥', path: '/hot-topics' },
    { id: 'insights', label: '专家解读', icon: '👨‍💼', path: '/hot-topics/insights' },
    { id: 'sentiment', label: '情感分析', icon: '😊', path: '/sentiment' },
    { id: 'prediction', label: '预测分析', icon: '🔮', path: '/prediction' },
  ];
  
  const activeTab = tabs.find(t => location.pathname.startsWith(t.path))?.id || 'prediction';
  
  return (
    <div className="hot-topics-tabs">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
          onClick={() => navigate(tab.path)}
        >
          <span className="tab-icon">{tab.icon}</span>
          <span className="tab-label">{tab.label}</span>
        </button>
      ))}
    </div>
  );
}

export function Prediction() {
  const [activeTab, setActiveTab] = useState<'predict' | 'scheduled' | 'history'>('predict');
  const [loading, setLoading] = useState(false);
  const [predictions, setPredictions] = useState<PerformancePrediction[]>([]);
  const [schedules, setSchedules] = useState<ScheduledPublish[]>([]);

  // Prediction form state
  const [form, setForm] = useState({
    draftId: '',
    title: '',
    content: '',
    contentType: 'article',
    features: {
      hasImages: false,
      hasVideo: false,
      isOriginal: true,
      authorFollowers: 1000,
    },
  });

  const [result, setResult] = useState<PerformancePrediction | null>(null);

  useEffect(() => {
    if (activeTab === 'scheduled') {
      loadSchedules();
    } else if (activeTab === 'history') {
      loadPredictions();
    }
  }, [activeTab]);

  const loadPredictions = async () => {
    if (!form.draftId) return;
    setLoading(true);
    try {
      const res = await predictionApi.getPredictions(form.draftId);
      setPredictions(res.items || []);
    } catch (error) {
      console.error('Failed to load predictions:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadSchedules = async () => {
    if (!form.draftId) return;
    setLoading(true);
    try {
      const res = await predictionApi.getSchedules(form.draftId);
      setSchedules(res.items || []);
    } catch (error) {
      console.error('Failed to load schedules:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePredict = async () => {
    if (!form.draftId || !form.title || !form.content) return;

    setLoading(true);
    try {
      const res = await predictionApi.predictPerformance({
        draftId: form.draftId,
        title: form.title,
        content: form.content,
        contentType: form.contentType,
        features: form.features,
      });
      setResult(res);
    } catch (error) {
      console.error('Prediction failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSchedule = async (platform: string, time: string) => {
    if (!result) return;

    try {
      await predictionApi.schedulePublish({
        draftId: form.draftId,
        platform,
        scheduledTime: time,
        predictionId: result.id,
      });
      alert('预约发布成功!');
      loadSchedules();
    } catch (error) {
      console.error('Schedule failed:', error);
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return '#52c41a';
    if (score >= 60) return '#faad14';
    return '#ff4d4f';
  };

  const getScoreText = (score: number) => {
    if (score >= 80) return '优秀';
    if (score >= 60) return '良好';
    return '需改进';
  };

  const getRiskLevelText = (level: string) => {
    const map: Record<string, string> = {
      low: '低风险',
      medium: '中风险',
      high: '高风险',
    };
    return map[level] || level;
  };

  const getRiskLevelClass = (level: string) => {
    return `risk-${level}`;
  };

  return (
    <div className="prediction">
      <div className="page-header">
        <h1>📈 内容表现预测</h1>
        <p className="page-desc">AI 预测内容传播效果，推荐最佳发布时间</p>
      </div>

      <div className="tabs">
        <button className={`tab ${activeTab === 'predict' ? 'active' : ''}`} onClick={() => setActiveTab('predict')}>
          🔮 效果预测
        </button>
        <button className={`tab ${activeTab === 'scheduled' ? 'active' : ''}`} onClick={() => setActiveTab('scheduled')}>
          ⏰ 预约发布 ({schedules.length})
        </button>
        <button className={`tab ${activeTab === 'history' ? 'active' : ''}`} onClick={() => setActiveTab('history')}>
          📊 历史预测
        </button>
      </div>

      {activeTab === 'predict' && (
        <div className="predict-section">
          <div className="input-panel">
            <div className="form-group">
              <label>文稿ID</label>
              <input
                type="text"
                value={form.draftId}
                onChange={(e) => setForm({ ...form, draftId: e.target.value })}
                placeholder="输入文稿ID"
              />
            </div>

            <div className="form-group">
              <label>标题</label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="输入内容标题"
              />
            </div>

            <div className="form-group">
              <label>内容类型</label>
              <select value={form.contentType} onChange={(e) => setForm({ ...form, contentType: e.target.value })}>
                <option value="article">文章</option>
                <option value="video">视频</option>
                <option value="news">快讯</option>
                <option value="report">研报</option>
              </select>
            </div>

            <div className="form-group">
              <label>内容正文</label>
              <textarea
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
                placeholder="输入内容正文..."
                rows={8}
              />
            </div>

            <div className="form-group">
              <label>内容特征</label>
              <div className="checkbox-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={form.features.hasImages}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        features: { ...form.features, hasImages: e.target.checked },
                      })
                    }
                  />
                  包含图片
                </label>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={form.features.hasVideo}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        features: { ...form.features, hasVideo: e.target.checked },
                      })
                    }
                  />
                  包含视频
                </label>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={form.features.isOriginal}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        features: { ...form.features, isOriginal: e.target.checked },
                      })
                    }
                  />
                  原创内容
                </label>
              </div>
            </div>

            <button className="btn btn-primary predict-btn" onClick={handlePredict} disabled={loading}>
              {loading ? '预测中...' : '🔮 开始预测'}
            </button>
          </div>

          {result && (
            <div className="result-panel">
              <div className="score-section">
                <div className="overall-score" style={{ color: getScoreColor(result.overallScore) }}>
                  <div className="score-value">{result.overallScore}</div>
                  <div className="score-label">{getScoreText(result.overallScore)}</div>
                </div>

                <div className="dimension-scores">
                  <div className="dim-score">
                    <span className="dim-name">阅读完成率</span>
                    <div className="dim-bar">
                      <div
                        className="dim-fill"
                        style={{ width: `${result.predictedReadRate}%` }}
                      />
                    </div>
                    <span className="dim-value">{result.predictedReadRate.toFixed(1)}%</span>
                  </div>
                  <div className="dim-score">
                    <span className="dim-name">互动率</span>
                    <div className="dim-bar">
                      <div
                        className="dim-fill"
                        style={{ width: `${result.predictedEngagement * 10}%` }}
                      />
                    </div>
                    <span className="dim-value">{(result.predictedEngagement * 100).toFixed(1)}%</span>
                  </div>
                  <div className="dim-score">
                    <span className="dim-name">分享率</span>
                    <div className="dim-bar">
                      <div
                        className="dim-fill"
                        style={{ width: `${result.predictedShareRate * 10}%` }}
                      />
                    </div>
                    <span className="dim-value">{(result.predictedShareRate * 100).toFixed(1)}%</span>
                  </div>
                </div>
              </div>

              <div className="prediction-details">
                <div className="detail-card">
                  <h4>📊 预计数据</h4>
                  <div className="detail-row">
                    <span>预计阅读量</span>
                    <span className="highlight">{result.predictedViews.toLocaleString()}</span>
                  </div>
                  <div className="detail-row">
                    <span>预计点赞</span>
                    <span className="highlight">{result.predictedLikes.toLocaleString()}</span>
                  </div>
                  <div className="detail-row">
                    <span>预计评论</span>
                    <span className="highlight">{result.predictedComments.toLocaleString()}</span>
                  </div>
                  <div className="detail-row">
                    <span>预计分享</span>
                    <span className="highlight">{result.predictedShares.toLocaleString()}</span>
                  </div>
                </div>

                <div className="detail-card">
                  <h4>⚠️ 风险评估</h4>
                  <div className={`risk-level ${getRiskLevelClass(result.riskLevel)}`}>
                    {getRiskLevelText(result.riskLevel)}
                  </div>
                  {result.riskWarnings && result.riskWarnings.length > 0 && (
                    <ul className="risk-warnings">
                      {result.riskWarnings.map((warning, idx) => (
                        <li key={idx}>{warning}</li>
                      ))}
                    </ul>
                  )}
                </div>

                {result.recommendedTimes && result.recommendedTimes.length > 0 && (
                  <div className="detail-card">
                    <h4>⏰ 最佳发布时间</h4>
                    <div className="recommended-times">
                      {result.recommendedTimes.map((time, idx) => (
                        <div key={idx} className="time-slot">
                          <span className="time">{new Date(time).toLocaleString()}</span>
                          <button
                            className="btn btn-sm"
                            onClick={() => handleSchedule('wechat', time)}
                          >
                            预约
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {result.platformBreakdown && (
                  <div className="detail-card">
                    <h4>📱 平台适配度</h4>
                    <div className="platform-fits">
                      {Object.entries(result.platformBreakdown).map(([platform, score]) => (
                        <div key={platform} className="platform-fit">
                          <span className="platform-name">{platform}</span>
                          <div className="fit-bar">
                            <div className="fit-fill" style={{ width: `${score as number}%` }} />
                          </div>
                          <span className="fit-score">{score as number}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'scheduled' && (
        <div className="scheduled-section">
          {schedules.length === 0 ? (
            <div className="empty-state">暂无预约发布</div>
          ) : (
            <div className="schedule-list">
              {schedules.map((schedule) => (
                <div key={schedule.id} className={`schedule-card ${schedule.status}`}>
                  <div className="schedule-platform">
                    <span className="platform-icon">📱</span>
                    {schedule.platform}
                  </div>
                  <div className="schedule-time">
                    {new Date(schedule.scheduledTime).toLocaleString()}
                  </div>
                  <div className={`schedule-status ${schedule.status}`}>
                    {schedule.status === 'pending' && '待发布'}
                    {schedule.status === 'published' && '已发布'}
                    {schedule.status === 'cancelled' && '已取消'}
                  </div>
                  {schedule.status === 'pending' && (
                    <button
                      className="btn btn-sm btn-danger"
                      onClick={() => predictionApi.cancelSchedule(schedule.id)}
                    >
                      取消
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'history' && (
        <div className="history-section">
          {predictions.length === 0 ? (
            <div className="empty-state">暂无历史预测</div>
          ) : (
            <div className="prediction-history-list">
              {predictions.map((pred) => (
                <div key={pred.id} className="history-card">
                  <div className="history-score" style={{ color: getScoreColor(pred.overallScore) }}>
                    {pred.overallScore}
                  </div>
                  <div className="history-info">
                    <div className="history-title">{pred.title}</div>
                    <div className="history-meta">
                      <span>{pred.contentType}</span>
                      <span>{new Date(pred.createdAt).toLocaleString()}</span>
                    </div>
                  </div>
                  <div className="history-views">
                    预计阅读: {pred.predictedViews.toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
