// 任务详情页 - Task Detail Page (v3.0 完整复刻版)
// 功能：流程可视化、蓝军评审、选题策划增强

import { useState, useEffect } from 'react';
import { useParams, useNavigate, NavLink } from 'react-router-dom';
import {
  tasksApi,
  blueTeamApi,
  hotTopicsApi,
  sentimentApi,
  assetsApi,
  researchApi,
  complianceApi,
  type BlueTeamReview,
  type HotTopic,
  type Asset,
  type ResearchConfig,
  type ComplianceCheckResult
} from '../api/client';
import type { Task, NovelAngle } from '../types';
import './TaskDetail.css';

// 流程步骤定义
const STAGE_PIPELINES = {
  1: {
    name: '选题策划',
    steps: [
      { id: 'rss', name: 'RSS聚合', icon: '📡' },
      { id: 'quality', name: '质量评估', icon: '✅' },
      { id: 'hot', name: '热点分析', icon: '🔥' },
      { id: 'competitor', name: '竞品分析', icon: '⚔️' },
      { id: 'score', name: '评分排序', icon: '📊' }
    ]
  },
  2: {
    name: '深度研究',
    steps: [
      { id: 'collect', name: '数据采集', icon: '📥' },
      { id: 'clean', name: '数据清洗', icon: '🧹' },
      { id: 'analyze', name: '数据分析', icon: '🔬' },
      { id: 'insight', name: '洞察提炼', icon: '💡' }
    ]
  },
  3: {
    name: '文稿生成',
    steps: [
      { id: 'draft', name: '初稿生成', icon: '📝' },
      { id: 'polish', name: '内容润色', icon: '✨' },
      { id: 'fact', name: '事实核查', icon: '🔍' },
      { id: 'format', name: '格式调整', icon: '🎨' }
    ]
  },
  4: {
    name: '蓝军评审',
    steps: [
      { id: 'fact_check', name: '事实核查', icon: '🔍' },
      { id: 'logic_check', name: '逻辑检查', icon: '🧠' },
      { id: 'expert_review', name: '专家评审', icon: '👔' },
      { id: 'reader_test', name: '读者测试', icon: '👁️' }
    ]
  }
};

// 专家评审角色定义
const EXPERT_ROLES = {
  fact_checker: { name: '事实核查员', icon: '🔍', color: '#ef4444', desc: '数据准确性' },
  logic_checker: { name: '逻辑检察官', icon: '⚖️', color: '#f59e0b', desc: '论证严密性' },
  domain_expert: { name: '行业专家', icon: '👔', color: '#06b6d4', desc: '专业深度' },
  reader_rep: { name: '读者代表', icon: '👁️', color: '#10b981', desc: '可读性' }
};

export function TaskDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  // 基础状态
  const [task, setTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'planning' | 'research' | 'writing' | 'reviews' | 'quality'>('overview');

  // 评审相关状态
  const [reviews, setReviews] = useState<BlueTeamReview[]>([]);
  const [reviewSummary, setReviewSummary] = useState({
    total: 0, critical: 0, warning: 0, praise: 0,
    accepted: 0, ignored: 0, pending: 0
  });

  // 质量分析状态
  const [hotTopics, setHotTopics] = useState<HotTopic[]>([]);
  const [alerts, setAlerts] = useState<Array<{type: string; severity: string; message: string; suggestion?: string}>>([]);
  const [suggestions, setSuggestions] = useState<Array<{area: string; suggestion: string; priority: string; impact: string}>>([]);
  const [sentiment, setSentiment] = useState<{msiIndex: number; trendDirection: string; positive: number; negative: number; neutral: number} | null>(null);

  // 素材关联状态
  const [availableAssets, setAvailableAssets] = useState<Asset[]>([]);
  const [selectedAssets, setSelectedAssets] = useState<string[]>([]);
  const [showAssetModal, setShowAssetModal] = useState(false);

  // 内容分析状态
  const [analyzeText, setAnalyzeText] = useState('');
  const [analyzeResult, setAnalyzeResult] = useState<any>(null);

  // 编辑状态
  const [editingOutline, setEditingOutline] = useState(false);
  const [outlineDraft, setOutlineDraft] = useState('');

  // 外部链接添加状态
  const [showAddLinkModal, setShowAddLinkModal] = useState(false);
  const [newLinkUrl, setNewLinkUrl] = useState('');
  const [newLinkTitle, setNewLinkTitle] = useState('');

  // 操作加载状态
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // 合规检查状态
  const [complianceResult, setComplianceResult] = useState<ComplianceCheckResult | null>(null);
  const [checkingCompliance, setCheckingCompliance] = useState(false);

  // 深度研究配置状态
  const [researchConfig, setResearchConfig] = useState<ResearchConfig>({
    autoCollect: true,
    sources: ['web', 'rss'],
    maxResults: 20,
    minCredibility: 0.5,
    keywords: [],
    excludeKeywords: [],
    timeRange: '30d',
  });
  const [showResearchConfig, setShowResearchConfig] = useState(false);
  const [collectedItems, setCollectedItems] = useState<any[]>([]);

  useEffect(() => {
    if (id) {
      loadTask();
      loadAssets();
      loadResearchConfig();
      loadCollectedResearch();
    }
  }, [id]);

  const loadTask = async () => {
    try {
      setLoading(true);
      const data = await tasksApi.getById(id!);
      setTask(data);

      // 加载蓝军评审
      if (['reviewing', 'completed', 'awaiting_approval'].includes(data.status)) {
        await loadReviews();
      }

      // 加载热点话题
      try {
        const topicsData = await hotTopicsApi.getAll({ limit: 5 });
        setHotTopics(topicsData.items || []);
      } catch (e) { /* 忽略错误 */ }

      // 加载情感分析
      try {
        const sentimentData = await sentimentApi.getStats();
        setSentiment(sentimentData);
      } catch (e) { /* 忽略错误 */ }

      // 生成优化建议和预警
      generateSuggestions(data);
      generateAlerts(data);
    } catch (error) {
      console.error('加载任务失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadReviews = async () => {
    try {
      const reviewsData = await blueTeamApi.getReviews(id!);
      const items = reviewsData.items || [];
      setReviews(items);

      // 计算评审统计
      const summary = {
        total: 0, critical: 0, warning: 0, praise: 0,
        accepted: 0, ignored: 0, pending: 0
      };

      items.forEach((review: BlueTeamReview) => {
        review.questions?.forEach((q: any) => {
          summary.total++;
          if (q.severity === 'high') summary.critical++;
          else if (q.severity === 'medium') summary.warning++;
          else if (q.severity === 'praise') summary.praise++;

          if (q.status === 'accepted') summary.accepted++;
          else if (q.status === 'ignored') summary.ignored++;
          else summary.pending++;
        });
      });

      setReviewSummary(summary);
    } catch (error) {
      console.error('加载评审失败:', error);
    }
  };

  const loadAssets = async () => {
    try {
      const data = await assetsApi.getAll();
      setAvailableAssets(data.items || []);
    } catch (error) {
      console.error('加载素材失败:', error);
    }
  };

  const loadResearchConfig = async () => {
    try {
      const config = await researchApi.getConfig(id!);
      setResearchConfig(config);
    } catch (error) {
      console.error('加载研究配置失败:', error);
    }
  };

  const loadCollectedResearch = async () => {
    try {
      const data = await researchApi.getCollected(id!, { limit: 20 });
      setCollectedItems(data.items || []);
    } catch (error) {
      console.error('加载采集结果失败:', error);
    }
  };

  const handleSaveResearchConfig = async () => {
    try {
      setActionLoading('save-research-config');
      await researchApi.saveConfig(id!, researchConfig);
      alert('研究配置已保存');
      setShowResearchConfig(false);
    } catch (error) {
      alert('保存失败: ' + (error instanceof Error ? error.message : '未知错误'));
    } finally {
      setActionLoading(null);
    }
  };

  const handleCollectResearch = async () => {
    try {
      setActionLoading('collect-research');
      await researchApi.collect(id!);
      alert('研究采集已启动，请稍后刷新查看结果');
    } catch (error) {
      alert('采集失败: ' + (error instanceof Error ? error.message : '未知错误'));
    } finally {
      setActionLoading(null);
    }
  };

  const generateSuggestions = (taskData: Task) => {
    const newSuggestions: Array<{area: string; suggestion: string; priority: string; impact: string}> = [];

    if (!taskData.outline) {
      newSuggestions.push({
        area: '大纲', suggestion: '任务尚未生成大纲，建议进入选题策划阶段',
        priority: 'high', impact: '明确写作方向'
      });
    }

    if (!taskData.research_data?.sources?.length) {
      newSuggestions.push({
        area: '研究', suggestion: '缺少引用来源，建议进行深度研究收集资料',
        priority: 'medium', impact: '提升内容可信度'
      });
    }

    if (taskData.evaluation && taskData.evaluation.score < 70) {
      newSuggestions.push({
        area: '质量', suggestion: '选题评分较低，建议优化选题或寻找差异化角度',
        priority: 'high', impact: '提高内容竞争力'
      });
    }

    setSuggestions(newSuggestions);
  };

  const generateAlerts = (taskData: Task) => {
    const newAlerts: Array<{type: string; severity: string; message: string; suggestion?: string}> = [];

    const lastUpdate = new Date(taskData.updated_at);
    const now = new Date();
    const daysDiff = Math.floor((now.getTime() - lastUpdate.getTime()) / (1000 * 60 * 60 * 24));

    if (daysDiff > 7) {
      newAlerts.push({
        type: 'freshness', severity: 'warning',
        message: `任务已${daysDiff}天未更新`,
        suggestion: '建议检查任务状态或更新进度'
      });
    }

    const pendingReviews = reviews.filter(r => r.status === 'pending');
    if (pendingReviews.length > 0) {
      newAlerts.push({
        type: 'review', severity: 'info',
        message: `有${pendingReviews.length}条评审意见待处理`,
        suggestion: '请及时处理蓝军评审意见'
      });
    }

    setAlerts(newAlerts);
  };

  // 评审决策处理
  const handleReviewDecision = async (reviewId: string, questionId: string, decision: 'accept' | 'ignore' | 'manual_resolved', note?: string) => {
    try {
      await blueTeamApi.submitDecision(id!, reviewId, {
        questionId, decision, note
      });
      await loadReviews();
    } catch (error) {
      console.error('提交决策失败:', error);
      alert('操作失败，请重试');
    }
  };

  const handleBatchDecision = async (decision: 'accept' | 'ignore') => {
    if (!confirm(`确定要${decision === 'accept' ? '全部接受' : '全部忽略'}所有待处理的评审意见吗？`)) {
      return;
    }

    try {
      await blueTeamApi.batchDecide(id!, { decision });
      await loadReviews();
    } catch (error) {
      console.error('批量决策失败:', error);
      alert('操作失败');
    }
  };

  const handleReReview = async (expertRole: string) => {
    if (!confirm(`确定要申请${EXPERT_ROLES[expertRole as keyof typeof EXPERT_ROLES]?.name || expertRole}重新评审吗？`)) {
      return;
    }

    try {
      await blueTeamApi.requestReReview(id!, { expertRole });
      alert('重新评审已申请，请稍后刷新查看');
    } catch (error) {
      console.error('申请重新评审失败:', error);
      alert('申请失败');
    }
  };

  // 任务审批
  const handleApprove = async (approved: boolean) => {
    // 检查是否有严重问题未处理
    if (approved && reviewSummary.critical > reviewSummary.accepted) {
      alert(`有 ${reviewSummary.critical - reviewSummary.accepted} 个严重问题未处理，处理后才能确认通过`);
      return;
    }

    try {
      await tasksApi.approve(id!, approved);
      loadTask();
    } catch (error) {
      console.error('审批失败:', error);
      alert('审批失败');
    }
  };

  // 大纲编辑
  const handleEditOutline = () => {
    if (task?.outline) {
      setOutlineDraft(JSON.stringify(task.outline, null, 2));
      setEditingOutline(true);
    }
  };

  const handleSaveOutline = async () => {
    try {
      const newOutline = JSON.parse(outlineDraft);
      await tasksApi.update(id!, { outline: newOutline });
      setEditingOutline(false);
      loadTask();
    } catch (error) {
      alert('保存失败：JSON格式错误');
    }
  };

  // 素材关联
  const handleToggleAsset = (assetId: string) => {
    setSelectedAssets(prev =>
      prev.includes(assetId)
        ? prev.filter(a => a !== assetId)
        : [...prev, assetId]
    );
  };

  const handleConfirmAssets = async () => {
    try {
      await tasksApi.update(id!, { asset_ids: selectedAssets });
      setShowAssetModal(false);
      loadTask();
    } catch (error) {
      console.error('关联素材失败:', error);
      alert('关联失败');
    }
  };

  // 内容分析
  const handleAnalyzeContent = async () => {
    if (!analyzeText.trim()) return;
    try {
      const result = await sentimentApi.analyze('temp', analyzeText);
      setAnalyzeResult(result);
    } catch (error) {
      console.error('分析失败:', error);
    }
  };

  // 确认大纲并继续
  const handleConfirmOutline = async () => {
    setActionLoading('confirm-outline');
    try {
      await tasksApi.confirmOutline(id!);
      alert('大纲已确认，开始研究阶段');
      loadTask();
    } catch (error) {
      console.error('确认大纲失败:', error);
      alert('确认大纲失败，请重试');
    } finally {
      setActionLoading(null);
    }
  };

  // 重做文稿生成
  const handleRedoWriting = async () => {
    if (!confirm('确定要重做文稿生成吗？这将重新生成初稿，之前的版本将被删除。')) return;
    setActionLoading('redo-writing');
    try {
      await tasksApi.redoStage(id!, 'writing');
      alert('文稿生成重做已启动，请稍后刷新查看结果');
      loadTask();
    } catch (error) {
      console.error('重做文稿生成失败:', error);
      alert('操作失败');
    } finally {
      setActionLoading(null);
    }
  };

  // 重做指定阶段
  const handleRedoStage = async (stage: 'planning' | 'research' | 'writing' | 'review') => {
    const stageNames: Record<string, string> = {
      planning: '选题策划',
      research: '深度研究',
      writing: '文稿生成',
      review: '蓝军评审'
    };
    if (!confirm(`确定要重做${stageNames[stage]}吗？`)) return;
    setActionLoading(`redo-${stage}`);
    try {
      await tasksApi.redoStage(id!, stage);
      alert(`${stageNames[stage]}重做已启动`);
      loadTask();
    } catch (error) {
      console.error(`重做${stageNames[stage]}失败:`, error);
      alert('操作失败');
    } finally {
      setActionLoading(null);
    }
  };

  // 合规检查
  const handleComplianceCheck = async () => {
    const content = task?.writing_data?.draft;
    if (!content) {
      alert('暂无文稿内容可检查');
      return;
    }
    setCheckingCompliance(true);
    try {
      const result = await complianceApi.checkContent(content);
      setComplianceResult(result);
      if (result.overallScore >= 80) {
        alert(`✅ 合规检查通过！得分: ${result.overallScore}`);
      } else if (result.overallScore >= 60) {
        alert(`⚠️ 合规检查需关注，发现 ${result.issues.length} 个问题。得分: ${result.overallScore}`);
      } else {
        alert(`❌ 合规检查高风险，发现 ${result.issues.length} 个问题。得分: ${result.overallScore}`);
      }
    } catch (error) {
      console.error('合规检查失败:', error);
      alert('合规检查失败');
    } finally {
      setCheckingCompliance(false);
    }
  };

  // 触发研究采集
  const handleTriggerResearch = async () => {
    if (!confirm('确定要启动深度研究采集吗？这将执行网页搜索和素材检索。')) return;
    setActionLoading('trigger-research');
    try {
      await tasksApi.redoStage(id!, 'research');
      alert('深度研究采集已启动，请稍后刷新查看结果');
      loadTask();
    } catch (error) {
      console.error('启动研究采集失败:', error);
      alert('操作失败');
    } finally {
      setActionLoading(null);
    }
  };

  // 添加外部链接
  const handleAddExternalLink = async () => {
    if (!newLinkUrl.trim() || !newLinkTitle.trim()) {
      alert('请填写链接标题和URL');
      return;
    }
    setActionLoading('add-link');
    try {
      await tasksApi.update(id!, {
        external_links: [...(task?.external_links || []), { title: newLinkTitle, url: newLinkUrl }]
      });
      setShowAddLinkModal(false);
      setNewLinkUrl('');
      setNewLinkTitle('');
      loadTask();
    } catch (error) {
      console.error('添加外部链接失败:', error);
      alert('添加失败');
    } finally {
      setActionLoading(null);
    }
  };

  // 辅助函数
  const getStageProgress = (status: string) => {
    const stageMap: Record<string, number> = {
      pending: 0, planning: 25, researching: 50, writing: 75,
      reviewing: 90, awaiting_approval: 95, converting: 95, completed: 100
    };
    return stageMap[status] || 0;
  };

  const getStageName = (status: string) => {
    const nameMap: Record<string, string> = {
      pending: '待处理', planning: '选题策划', researching: '深度研究',
      writing: '文稿生成', reviewing: '蓝军评审', awaiting_approval: '等待确认',
      converting: '多态转换', completed: '已完成', failed: '失败'
    };
    return nameMap[status] || status;
  };

  const getCurrentStageNum = (status: string) => {
    const stageMap: Record<string, number> = {
      pending: 0, planning: 1, researching: 2, writing: 3,
      reviewing: 4, awaiting_approval: 4, converting: 4, completed: 5
    };
    return stageMap[status] || 0;
  };

  // 渲染流程可视化
  const renderStagePipeline = () => {
    const currentStage = getCurrentStageNum(task?.status || '');

    return (
      <div className="stage-pipeline-section">
        <h3 className="section-title">🔄 生产流水线</h3>

        {Object.entries(STAGE_PIPELINES).map(([stageNum, stage]) => {
          const stageNumber = parseInt(stageNum);
          const isActive = currentStage >= stageNumber;
          const isCurrent = currentStage === stageNumber;
          const isCompleted = currentStage > stageNumber;

          return (
            <div
              key={stageNum}
              className={`pipeline-stage ${isActive ? 'active' : ''} ${isCurrent ? 'current' : ''}`}
            >
              <div className="stage-header">
                <div className={`stage-icon ${isCompleted ? 'completed' : ''}`}>
                  {isCompleted ? '✓' : stageNumber}
                </div>
                <div className="stage-info">
                  <span className="stage-name">{stage.name}</span>
                  <span className="stage-status">
                    {isCompleted ? '已完成' : isCurrent ? '进行中...' : '等待中'}
                  </span>
                </div>
              </div>

              <div className="pipeline-steps">
                {stage.steps.map((step, idx) => (
                  <div
                    key={step.id}
                    className={`pipeline-step ${isCompleted || (isCurrent && idx <= 1) ? 'active' : ''}`}
                  >
                    <span className="step-icon">{step.icon}</span>
                    <span className="step-name">{step.name}</span>
                    {(isCompleted || (isCurrent && idx === 1)) && (
                      <span className="step-status">✓</span>
                    )}
                    {isCurrent && idx === 2 && (
                      <span className="step-status running">⋯</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  // 渲染选题策划Tab
  const renderPlanningTab = () => {
    if (!task) return null;

    const outline = task.outline || {};
    const evaluation = task.evaluation;
    const competitorAnalysis = task.competitor_analysis || {};

    return (
      <div className="tab-panel planning-panel">
        {/* 选题质量评估 */}
        {evaluation && (
          <div className="info-card evaluation-card">
            <h3 className="card-title">📊 选题质量评估</h3>
            <div className="evaluation-content">
              <div className="score-circle-container">
                <div
                  className="score-circle"
                  style={{
                    background: `conic-gradient(
                      ${evaluation.score >= 80 ? '#10b981' : evaluation.score >= 60 ? '#f59e0b' : '#ef4444'} ${evaluation.score * 3.6}deg,
                      #e5e7eb 0deg
                    )`
                  }}
                >
                  <div className="score-circle-inner">
                    <span className="score-value">{evaluation.score}</span>
                    <span className="score-label">分</span>
                  </div>
                </div>
                <div className={`score-verdict ${evaluation.score >= 60 ? 'pass' : 'fail'}`}>
                  {evaluation.score >= 80 ? '✅ 强烈推荐' :
                   evaluation.score >= 60 ? '⚠️ 可以写' :
                   evaluation.score >= 40 ? '❌ 有风险' : '❌ 不建议'}
                </div>
              </div>

              <div className="dimension-scores">
                {Object.entries(evaluation.dimensions || {}).map(([key, value]) => {
                  const labels: Record<string, string> = {
                    dataAvailability: '数据可得性 (40%)',
                    topicHeat: '话题热度 (25%)',
                    differentiation: '差异化 (20%)',
                    timeliness: '时效性 (15%)'
                  };
                  const colors: Record<string, string> = {
                    dataAvailability: '#6366f1',
                    topicHeat: '#f59e0b',
                    differentiation: '#06b6d4',
                    timeliness: '#10b981'
                  };

                  return (
                    <div key={key} className="dimension-item">
                      <div className="dimension-header">
                        <span className="dimension-label">{labels[key] || key}</span>
                        <span className="dimension-value">{value}分</span>
                      </div>
                      <div className="dimension-bar-bg">
                        <div
                          className="dimension-bar-fill"
                          style={{ width: `${value}%`, background: colors[key] || '#6366f1' }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {evaluation.analysis && (
              <div className="evaluation-analysis">
                <strong>分析：</strong>{evaluation.analysis}
              </div>
            )}

            {evaluation.suggestions?.length > 0 && (
              <div className={`evaluation-suggestions ${evaluation.score >= 60 ? 'positive' : 'warning'}`}>
                <div className="suggestions-title">💡 建议</div>
                {evaluation.suggestions.map((s: string, i: number) => (
                  <div key={i} className="suggestion-item">• {s}</div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 竞品分析 */}
        {competitorAnalysis.reports?.length > 0 && (
          <div className="info-card competitor-card">
            <h3 className="card-title">⚔️ 竞品分析</h3>
            <p className="competitor-summary">
              找到 {competitorAnalysis.summary?.totalFound || competitorAnalysis.reports.length} 篇相关研报，
              建议通过以下角度形成差异化：
            </p>

            {competitorAnalysis.differentiationSuggestions?.length > 0 && (
              <div className="differentiation-suggestions">
                {competitorAnalysis.differentiationSuggestions.map((s: any, i: number) => (
                  <div key={i} className="diff-suggestion-card">
                    <div className="diff-header">
                      <span className="diff-angle">{s.angle}</span>
                      <span className={`diff-value ${s.potentialValue}`}>
                        {s.potentialValue === 'high' ? '高价值' : s.potentialValue === 'medium' ? '中价值' : '低价值'}
                      </span>
                    </div>
                    <p className="diff-rationale">{s.rationale}</p>
                  </div>
                ))}
              </div>
            )}

            <div className="competitor-reports">
              <h4>📄 竞品研报列表</h4>
              {competitorAnalysis.reports.map((r: any, i: number) => (
                <div key={i} className="competitor-report-item">
                  <div className="report-header">
                    <a href={r.url || '#'} target="_blank" rel="noopener noreferrer" className="report-title">
                      {r.title}
                    </a>
                    <span className="report-meta">{r.source} · {r.publishDate}</span>
                  </div>
                  <p className="report-view">{r.coreView || r.keyPoints?.[0]}</p>
                  <div className="report-relevance">
                    <span>相关度</span>
                    <div className="relevance-bar">
                      <div className="relevance-fill" style={{ width: `${r.relevance}%` }} />
                    </div>
                    <span>{r.relevance}%</span>
                  </div>
                </div>
              ))}
            </div>

            {competitorAnalysis.summary?.gaps?.length > 0 && (
              <div className="market-gaps">
                <h4>🎯 市场空白点</h4>
                {competitorAnalysis.summary.gaps.map((g: string, i: number) => (
                  <div key={i} className="gap-item">• {g}</div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 大纲展示 */}
        <div className="info-card outline-card">
          <div className="card-header-with-actions">
            <h3 className="card-title">📝 文章大纲</h3>
            <div className="card-actions">
              {(task.status === 'planning' || task.status === 'outline_pending') && (
                <button
                  className="btn btn-success"
                  onClick={handleConfirmOutline}
                  disabled={actionLoading === 'confirm-outline'}
                >
                  {actionLoading === 'confirm-outline' ? '确认中...' : '✓ 确认大纲并继续'}
                </button>
              )}
              <button className="btn btn-primary" onClick={handleEditOutline}>
                ✏️ 编辑
              </button>
            </div>
          </div>

          {editingOutline ? (
            <div className="outline-editor">
              <textarea
                value={outlineDraft}
                onChange={(e) => setOutlineDraft(e.target.value)}
                className="outline-textarea"
                rows={20}
              />
              <div className="editor-actions">
                <button className="btn btn-secondary" onClick={() => setEditingOutline(false)}>
                  取消
                </button>
                <button className="btn btn-primary" onClick={handleSaveOutline}>
                  保存
                </button>
              </div>
            </div>
          ) : (
            <div className="outline-preview-detailed">
              {outline.sections?.map((section: any, idx: number) => (
                <div key={idx} className="outline-section-detailed">
                  <h4 className="section-title-main">
                    {idx + 1}. {section.title}
                  </h4>
                  <p className="section-content">{section.content}</p>
                  {section.subsections?.length > 0 && (
                    <div className="subsections">
                      {section.subsections.map((sub: any, sidx: number) => (
                        <div key={sidx} className="subsection">
                          <h5>{idx + 1}.{sidx + 1} {sub.title}</h5>
                          <p>{sub.content}</p>
                        </div>
                      ))}
                    </div>
                  )}
                  {section.key_points?.length > 0 && (
                    <ul className="key-points-list">
                      {section.key_points.map((point: string, pidx: number) => (
                        <li key={pidx}>{point}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 知识库洞见 */}
        {(outline.knowledgeInsights?.length > 0 || outline.novelAngles?.length > 0) && (
          <div className="info-card insights-card">
            <h3 className="card-title">💡 知识库洞见与新观点</h3>

            {outline.knowledgeInsights?.length > 0 && (
              <div className="insights-section">
                <h4>📚 基于历史研究的发现</h4>
                {outline.knowledgeInsights.map((insight: any, i: number) => (
                  <div
                    key={i}
                    className="insight-card"
                    style={{ borderLeftColor: insight.type === 'trend' ? '#10b981' : insight.type === 'gap' ? '#f59e0b' : '#06b6d4' }}
                  >
                    <div className="insight-header-row">
                      <span className="insight-type-badge">
                        {insight.type === 'trend' ? '📈 趋势延续' : insight.type === 'gap' ? '🔍 研究空白' : '📖 观点演变'}
                      </span>
                      <span className="insight-relevance">相关度 {(insight.relevance * 100).toFixed(0)}%</span>
                    </div>
                    <p className="insight-content-text">{insight.content}</p>
                    {insight.source && <p className="insight-source-text">来源: {insight.source}</p>}
                  </div>
                ))}
              </div>
            )}

            {outline.novelAngles?.length > 0 && (
              <div className="novel-angles-section">
                <h4>✨ 建议的新研究角度</h4>
                {outline.novelAngles.map((angle: NovelAngle, i: number) => {
                  const impact = angle.potentialImpact || (angle.differentiation_score >= 8 ? 'high' : angle.differentiation_score >= 5 ? 'medium' : 'low');
                  return (
                    <div key={i} className="angle-card">
                      <div className="angle-header">
                        <strong>{angle.angle}</strong>
                        <span className={`impact-badge ${impact}`}>
                          {impact === 'high' ? '高影响力' : impact === 'medium' ? '中影响力' : '低影响力'}
                        </span>
                      </div>
                      <p><strong>理由:</strong> {angle.description}</p>
                      <p><strong>差异化评分:</strong> {angle.differentiation_score}/10</p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  // 渲染蓝军评审Tab
  const renderReviewsTab = () => {
    const groupedReviews = {
      critical: [] as any[],
      warning: [] as any[],
      praise: [] as any[]
    };

    reviews.forEach(review => {
      review.questions?.forEach((q: any) => {
        const item = { ...q, reviewId: review.id };
        if (q.severity === 'high') groupedReviews.critical.push(item);
        else if (q.severity === 'medium') groupedReviews.warning.push(item);
        else if (q.severity === 'praise') groupedReviews.praise.push(item);
      });
    });

    const canProceed = reviewSummary.critical === 0 || reviewSummary.accepted >= reviewSummary.critical;

    return (
      <div className="tab-panel reviews-panel">
        {/* 评审统计概览 */}
        <div className="info-card review-stats-card">
          <div className="card-header-with-actions">
            <h3 className="card-title">🔥 蓝军评审概览</h3>
            {task?.status === 'awaiting_approval' && (
              <button className="btn btn-warning" onClick={() => tasksApi.redoStage(id!, 'review')}>
                🔄 重做评审
              </button>
            )}
          </div>

          <div className="review-stats-grid">
            <div className="stat-box critical">
              <div className="stat-number">{reviewSummary.critical}</div>
              <div className="stat-label">🔴 严重问题</div>
            </div>
            <div className="stat-box warning">
              <div className="stat-number">{reviewSummary.warning}</div>
              <div className="stat-label">🟡 改进建议</div>
            </div>
            <div className="stat-box praise">
              <div className="stat-number">{reviewSummary.praise}</div>
              <div className="stat-label">🟢 亮点</div>
            </div>
            <div className="stat-box total">
              <div className="stat-number">{reviewSummary.total}</div>
              <div className="stat-label">总评审数</div>
            </div>
          </div>

          {/* 处理进度 */}
          <div className="review-progress-section">
            <div className="progress-header">
              <span>处理进度</span>
              <span className="progress-count">
                已处理: {reviewSummary.accepted + reviewSummary.ignored} / {reviewSummary.total}
              </span>
            </div>
            <div className="review-progress-bar">
              <div
                className="progress-segment accepted"
                style={{ width: `${(reviewSummary.accepted / reviewSummary.total) * 100}%` }}
              />
              <div
                className="progress-segment ignored"
                style={{ width: `${(reviewSummary.ignored / reviewSummary.total) * 100}%` }}
              />
              <div
                className="progress-segment pending"
                style={{ width: `${(reviewSummary.pending / reviewSummary.total) * 100}%` }}
              />
            </div>
            <div className="progress-legend">
              <span className="legend-item accepted">✓ 已接受 {reviewSummary.accepted}</span>
              <span className="legend-item ignored">⊘ 已忽略 {reviewSummary.ignored}</span>
              <span className="legend-item pending">⏳ 待处理 {reviewSummary.pending}</span>
            </div>

            {task?.status === 'awaiting_approval' && (
              <>
                {!canProceed ? (
                  <div className="cannot-proceed-warning">
                    ⚠️ 有 {reviewSummary.critical - reviewSummary.accepted} 个严重问题未处理，处理后才能进入确认环节
                  </div>
                ) : (
                  <div className="can-proceed-notice">
                    ✓ 所有严重问题已处理，可以进入确认环节
                  </div>
                )}

                {/* 批量操作 */}
                <div className="batch-actions">
                  <button className="btn btn-success" onClick={() => handleBatchDecision('accept')}>
                    ✓ 全部接受
                  </button>
                  <button className="btn btn-secondary" onClick={() => handleBatchDecision('ignore')}>
                    ⊘ 全部忽略
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* 专家评审分工 */}
        <div className="info-card experts-card">
          <h3 className="card-title">👥 专家评审分工</h3>
          <div className="experts-grid">
            {Object.entries(EXPERT_ROLES).map(([role, info]) => (
              <div key={role} className="expert-role-card" style={{ borderLeftColor: info.color }}>
                <div className="expert-icon">{info.icon}</div>
                <div className="expert-info">
                  <div className="expert-name">{info.name}</div>
                  <div className="expert-desc">{info.desc}</div>
                </div>
                {task?.status === 'awaiting_approval' && (
                  <button
                    className="btn-retry"
                    onClick={() => handleReReview(role)}
                    title="申请重新评审"
                  >
                    🔄
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* 评审意见列表 */}
        {groupedReviews.critical.length > 0 && (
          <div className="info-card review-group critical-group">
            <h3 className="card-title critical-title">🔴 严重问题（必须修改）</h3>
            {groupedReviews.critical.map((item, idx) => renderReviewItem(item, idx))}
          </div>
        )}

        {groupedReviews.warning.length > 0 && (
          <div className="info-card review-group warning-group">
            <h3 className="card-title warning-title">🟡 改进建议</h3>
            {groupedReviews.warning.map((item, idx) => renderReviewItem(item, idx))}
          </div>
        )}

        {groupedReviews.praise.length > 0 && (
          <div className="info-card review-group praise-group">
            <h3 className="card-title praise-title">🟢 亮点</h3>
            {groupedReviews.praise.map((item, idx) => renderReviewItem(item, idx))}
          </div>
        )}

        {reviewSummary.total === 0 && (
          <div className="empty-state">
            <div className="empty-icon">👥</div>
            <div className="empty-title">暂无评审记录</div>
            <p>任务进入评审阶段后将显示蓝军评审意见</p>
          </div>
        )}
      </div>
    );
  };

  // 渲染单个评审意见
  const renderReviewItem = (item: any, idx: number) => {
    const statusLabels: Record<string, { text: string; class: string }> = {
      pending: { text: '⏳ 待处理', class: 'pending' },
      accepted: { text: '✓ 已接受', class: 'accepted' },
      ignored: { text: '⊘ 已忽略', class: 'ignored' },
      manual_resolved: { text: '✓ 已手动处理', class: 'manual' }
    };
    const status = statusLabels[item.status || 'pending'];

    return (
      <div
        key={`${item.reviewId}-${idx}`}
        className={`review-question-item ${item.status || 'pending'}`}
        style={{ opacity: item.status && item.status !== 'pending' ? 0.7 : 1 }}
      >
        <div className="review-question-header">
          <div className="reviewer-badge">
            <span className="reviewer-icon">
              {item.expertRole === 'challenger' ? '🔍' :
               item.expertRole === 'expander' ? '⚖️' :
               item.expertRole === 'synthesizer' ? '👔' : '👁️'}
            </span>
            <span>{item.expertName || '专家'}</span>
            {item.location && <span className="location">📍 {item.location}</span>}
          </div>
          <div className="review-badges">
            <span className={`status-badge ${status.class}`}>{status.text}</span>
            <span className={`severity-badge ${item.severity}`}>{item.severity}</span>
          </div>
        </div>

        <div className="review-question-body">
          <p><strong>问题：</strong>{item.question}</p>
          <p className="suggestion"><strong>建议：</strong>{item.suggestion}</p>
          {item.rationale && <p className="rationale">依据：{item.rationale}</p>}
          {item.decisionNote && <p className="decision-note">备注：{item.decisionNote}</p>}
        </div>

        {task?.status === 'awaiting_approval' && (!item.status || item.status === 'pending') && item.severity !== 'praise' && (
          <div className="review-actions">
            <button
              className="btn btn-success btn-sm"
              onClick={() => handleReviewDecision(item.reviewId, item.id, 'accept')}
            >
              ✓ 接受修改
            </button>
            <button
              className="btn btn-info btn-sm"
              onClick={() => handleReviewDecision(item.reviewId, item.id, 'manual_resolved')}
            >
              ✓ 已手动处理
            </button>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => handleReviewDecision(item.reviewId, item.id, 'ignore')}
            >
              ⊘ 忽略
            </button>
          </div>
        )}
      </div>
    );
  };

  // 渲染素材关联弹窗
  const renderAssetModal = () => {
    if (!showAssetModal) return null;

    return (
      <div className="modal-overlay" onClick={() => setShowAssetModal(false)}>
        <div className="modal asset-modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h3>选择素材文件</h3>
            <button className="btn-close" onClick={() => setShowAssetModal(false)}>✕</button>
          </div>
          <div className="modal-body">
            <div className="asset-grid">
              {availableAssets.map(asset => (
                <div
                  key={asset.id}
                  className={`asset-select-item ${selectedAssets.includes(asset.id) ? 'selected' : ''}`}
                  onClick={() => handleToggleAsset(asset.id)}
                >
                  <div className="asset-icon">📄</div>
                  <div className="asset-info">
                    <div className="asset-title">{asset.title}</div>
                    <div className="asset-meta">{asset.source} · {asset.theme_id}</div>
                  </div>
                  <div className="asset-checkbox">
                    {selectedAssets.includes(asset.id) ? '☑️' : '⬜'}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="modal-footer">
            <button className="btn btn-secondary" onClick={() => setShowAssetModal(false)}>
              取消
            </button>
            <button className="btn btn-primary" onClick={handleConfirmAssets}>
              确认选择 ({selectedAssets.length})
            </button>
          </div>
        </div>
      </div>
    );
  };

  // 添加外部链接弹窗
  const renderAddLinkModal = () => {
    if (!showAddLinkModal) return null;

    return (
      <div className="modal-overlay" onClick={() => setShowAddLinkModal(false)}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h3>添加外部链接</h3>
            <button className="btn-close" onClick={() => setShowAddLinkModal(false)}>✕</button>
          </div>
          <div className="modal-body">
            <div className="form-group">
              <label className="form-label">链接标题 *</label>
              <input
                type="text"
                className="form-input"
                value={newLinkTitle}
                onChange={(e) => setNewLinkTitle(e.target.value)}
                placeholder="例如：住建部保租房政策文件"
              />
            </div>
            <div className="form-group">
              <label className="form-label">链接URL *</label>
              <input
                type="url"
                className="form-input"
                value={newLinkUrl}
                onChange={(e) => setNewLinkUrl(e.target.value)}
                placeholder="https://..."
              />
            </div>
          </div>
          <div className="modal-footer">
            <button className="btn btn-secondary" onClick={() => setShowAddLinkModal(false)}>
              取消
            </button>
            <button
              className="btn btn-primary"
              onClick={handleAddExternalLink}
              disabled={actionLoading === 'add-link' || !newLinkUrl.trim() || !newLinkTitle.trim()}
            >
              {actionLoading === 'add-link' ? '添加中...' : '添加链接'}
            </button>
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="task-detail">
        <div className="loading">
          <span className="loading-spinner"></span>
          加载中...
        </div>
      </div>
    );
  }

  if (!task) {
    return (
      <div className="task-detail">
        <div className="empty-state">
          <div className="empty-icon">📭</div>
          <div className="empty-title">任务不存在</div>
          <button className="btn btn-primary" onClick={() => navigate('/tasks')}>
            返回任务列表
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="task-detail">
      {/* 头部导航 */}
      <div className="detail-header">
        <div className="header-breadcrumb">
          <NavLink to="/tasks">任务管理</NavLink>
          <span className="separator">/</span>
          <span className="current">任务详情</span>
        </div>
        <div className="header-actions">
          {task.status === 'awaiting_approval' && (
            <>
              <button className="btn btn-success" onClick={() => handleApprove(true)}>
                ✅ 确认发布
              </button>
              <button className="btn btn-danger" onClick={() => handleApprove(false)}>
                ❌ 打回修改
              </button>
              <button className="btn btn-primary" onClick={() => {/* 编辑终稿 */}}>
                ✏️ 编辑终稿
              </button>
            </>
          )}
          <button className="btn btn-secondary" onClick={() => { setShowAssetModal(true); setSelectedAssets(task.asset_ids || []); }}>
            📎 关联素材
          </button>
          <button className="btn btn-secondary" onClick={handleDelete}>
            🗑️ 删除
          </button>
        </div>
      </div>

      {/* 任务标题区 */}
      <div className="task-title-section">
        <h1 className="task-topic">{task.topic}</h1>
        <div className="task-meta">
          <span className={`status-badge status-${task.status}`}>
            {getStageName(task.status)}
          </span>
          <span className="task-id">ID: {task.id}</span>
          <span className="task-date">
            创建于 {new Date(task.created_at).toLocaleDateString('zh-CN')}
          </span>
        </div>
      </div>

      {/* 阶段进度条 */}
      <div className="stage-progress">
        <div className="progress-bar">
          <div
            className="progress-fill"
            style={{ width: `${getStageProgress(task.status)}%` }}
          ></div>
        </div>
        <div className="stage-steps">
          {['待处理', '选题策划', '深度研究', '文稿生成', '蓝军评审', '已完成'].map(
            (stage, index) => {
              const progress = getStageProgress(task.status);
              const stepProgress = (index / 5) * 100;
              const isActive = progress >= stepProgress;
              const isCurrent = progress >= stepProgress && progress < stepProgress + 20;

              return (
                <div
                  key={stage}
                  className={`stage-step ${isActive ? 'active' : ''} ${isCurrent ? 'current' : ''}`}
                >
                  <div className="step-dot"></div>
                  <span className="step-name">{stage}</span>
                </div>
              );
            }
          )}
        </div>
      </div>

      {/* 流程可视化 */}
      {renderStagePipeline()}

      {/* 标签切换 */}
      <div className="detail-tabs">
        <button className={`tab-btn ${activeTab === 'overview' ? 'active' : ''}`} onClick={() => setActiveTab('overview')}>
          📋 概览
        </button>
        <button className={`tab-btn ${activeTab === 'planning' ? 'active' : ''}`} onClick={() => setActiveTab('planning')}>
          💡 选题策划
        </button>
        <button className={`tab-btn ${activeTab === 'research' ? 'active' : ''}`} onClick={() => setActiveTab('research')}>
          🔍 深度研究
        </button>
        <button className={`tab-btn ${activeTab === 'writing' ? 'active' : ''}`} onClick={() => setActiveTab('writing')}>
          ✍️ 文稿生成
        </button>
        <button className={`tab-btn ${activeTab === 'reviews' ? 'active' : ''}`} onClick={() => setActiveTab('reviews')}>
          👥 蓝军评审 {reviewSummary.total > 0 && `(${reviewSummary.total})`}
        </button>
        <button className={`tab-btn ${activeTab === 'quality' ? 'active' : ''}`} onClick={() => setActiveTab('quality')}>
          📊 质量分析
        </button>
      </div>

      {/* 内容区 */}
      <div className="detail-content">
        {activeTab === 'overview' && (
          <div className="tab-panel overview-panel">
            <div className="panel-grid">
              {/* 基础信息 */}
              <div className="info-card">
                <h3 className="card-title">📊 基础信息</h3>
                <div className="info-list">
                  <div className="info-item">
                    <span className="label">目标格式</span>
                    <span className="value">{task.target_formats?.join(', ') || 'markdown'}</span>
                  </div>
                  <div className="info-item">
                    <span className="label">进度</span>
                    <span className="value">{task.progress}%</span>
                  </div>
                  <div className="info-item">
                    <span className="label">当前阶段</span>
                    <span className="value">{task.current_stage || '-'}</span>
                  </div>
                  {task.asset_ids && task.asset_ids.length > 0 && (
                    <div className="info-item">
                      <span className="label">关联素材</span>
                      <span className="value">{task.asset_ids.length} 个</span>
                    </div>
                  )}
                </div>
              </div>

              {/* 快速操作 */}
              <div className="info-card quick-actions-card">
                <h3 className="card-title">⚡ 快捷操作</h3>
                <div className="quick-actions">
                  {(task.status === 'planning' || task.status === 'outline_pending') && (
                    <button
                      className="btn btn-primary"
                      onClick={handleConfirmOutline}
                      disabled={actionLoading === 'confirm-outline'}
                    >
                      {actionLoading === 'confirm-outline' ? '处理中...' : '✓ 确认大纲并继续'}
                    </button>
                  )}
                  <button
                    className="btn btn-secondary"
                    onClick={() => handleRedoStage('planning')}
                    disabled={actionLoading === 'redo-planning'}
                  >
                    {actionLoading === 'redo-planning' ? '重算中...' : '🔄 重做选题策划'}
                  </button>
                  <button
                    className="btn btn-secondary"
                    onClick={() => handleRedoStage('research')}
                    disabled={actionLoading === 'redo-research'}
                  >
                    {actionLoading === 'redo-research' ? '重启中...' : '🔄 重做深度研究'}
                  </button>
                </div>
              </div>

              {/* 大纲预览 */}
              {task.outline && (
                <div className="info-card full-width">
                  <h3 className="card-title">📝 文章大纲</h3>
                  <div className="outline-preview">
                    {task.outline.sections?.map((section: any, idx: number) => (
                      <div key={idx} className="outline-section">
                        <h4 className="section-title">{idx + 1}. {section.title}</h4>
                        <ul className="key-points">
                          {section.key_points?.map((point: string, pidx: number) => (
                            <li key={pidx}>{point}</li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'planning' && renderPlanningTab()}

        {activeTab === 'research' && (
          <div className="tab-panel research-panel">
            {/* 操作按钮区 */}
            <div className="info-card actions-card">
              <h3 className="card-title">⚡ 研究操作</h3>
              <div className="research-actions">
                <button
                  className="btn btn-primary"
                  onClick={handleCollectResearch}
                  disabled={actionLoading === 'collect-research'}
                >
                  {actionLoading === 'collect-research' ? '采集中...' : '🔄 启动研究采集'}
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={() => tasksApi.redoStage(id!, 'research')}
                >
                  🔄 重做深度研究
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={() => setShowAddLinkModal(true)}
                >
                  ➕ 添加外部链接
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={() => setShowResearchConfig(!showResearchConfig)}
                >
                  ⚙️ 配置采集参数
                </button>
              </div>
              {task.research_data?.searchStats && (
                <div className="search-stats">
                  <span>📊 网页来源: {task.research_data.searchStats.webSources || 0}</span>
                  <span>📁 素材来源: {task.research_data.searchStats.assetSources || 0}</span>
                </div>
              )}
            </div>

            {/* 研究配置面板 */}
            {showResearchConfig && (
              <div className="info-card config-card">
                <h3 className="card-title">⚙️ 深度研究配置</h3>
                <div className="research-config-form">
                  <div className="form-row">
                    <div className="form-group">
                      <label className="checkbox-label">
                        <input
                          type="checkbox"
                          checked={researchConfig.autoCollect}
                          onChange={(e) => setResearchConfig({ ...researchConfig, autoCollect: e.target.checked })}
                        />
                        自动采集
                      </label>
                    </div>
                    <div className="form-group">
                      <label>最大结果数</label>
                      <input
                        type="number"
                        min={5}
                        max={50}
                        value={researchConfig.maxResults}
                        onChange={(e) => setResearchConfig({ ...researchConfig, maxResults: parseInt(e.target.value) || 20 })}
                      />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>最低可信度 (0-1)</label>
                      <input
                        type="number"
                        step={0.1}
                        min={0}
                        max={1}
                        value={researchConfig.minCredibility}
                        onChange={(e) => setResearchConfig({ ...researchConfig, minCredibility: parseFloat(e.target.value) || 0.5 })}
                      />
                    </div>
                    <div className="form-group">
                      <label>时间范围</label>
                      <select
                        value={researchConfig.timeRange}
                        onChange={(e) => setResearchConfig({ ...researchConfig, timeRange: e.target.value })}
                      >
                        <option value="7d">最近7天</option>
                        <option value="30d">最近30天</option>
                        <option value="90d">最近3个月</option>
                        <option value="1y">最近1年</option>
                      </select>
                    </div>
                  </div>
                  <div className="form-group">
                    <label>数据源</label>
                    <div className="checkbox-group">
                      {['web', 'rss', 'asset'].map((source) => (
                        <label key={source} className="checkbox-label">
                          <input
                            type="checkbox"
                            checked={researchConfig.sources.includes(source)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setResearchConfig({ ...researchConfig, sources: [...researchConfig.sources, source] });
                              } else {
                                setResearchConfig({ ...researchConfig, sources: researchConfig.sources.filter((s) => s !== source) });
                              }
                            }}
                          />
                          {source === 'web' ? '网页搜索' : source === 'rss' ? 'RSS源' : '素材库'}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="form-group">
                    <label>关键词 (用逗号分隔)</label>
                    <input
                      type="text"
                      value={researchConfig.keywords.join(', ')}
                      onChange={(e) => setResearchConfig({ ...researchConfig, keywords: e.target.value.split(',').map((k) => k.trim()).filter(Boolean) })}
                      placeholder="输入关键词以精确搜索..."
                    />
                  </div>
                  <div className="form-group">
                    <label>排除关键词 (用逗号分隔)</label>
                    <input
                      type="text"
                      value={researchConfig.excludeKeywords.join(', ')}
                      onChange={(e) => setResearchConfig({ ...researchConfig, excludeKeywords: e.target.value.split(',').map((k) => k.trim()).filter(Boolean) })}
                      placeholder="输入要排除的关键词..."
                    />
                  </div>
                  <div className="form-actions">
                    <button
                      className="btn btn-primary"
                      onClick={handleSaveResearchConfig}
                      disabled={actionLoading === 'save-research-config'}
                    >
                      {actionLoading === 'save-research-config' ? '保存中...' : '保存配置'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {task.research_data ? (
              <div className="research-content">
                {/* 研究洞察 */}
                {task.research_data.insights?.length > 0 && (
                  <div className="info-card">
                    <h3 className="card-title">💡 研究洞察</h3>
                    <div className="insights-list">
                      {task.research_data.insights.map((insight: any) => (
                        <div key={insight.id} className="insight-item">
                          <div className="insight-header">
                            <span className={`insight-type type-${insight.type}`}>
                              {insight.type === 'data' ? '数据' :
                               insight.type === 'trend' ? '趋势' :
                               insight.type === 'case' ? '案例' : '专家'}
                            </span>
                            <span className="insight-source">来源: {insight.source}</span>
                          </div>
                          <p className="insight-content">{insight.content}</p>
                          <div className="insight-confidence">置信度: {(insight.confidence * 100).toFixed(0)}%</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 引用来源 */}
                {task.research_data.sources?.length > 0 && (
                  <div className="info-card">
                    <h3 className="card-title">📚 引用来源</h3>
                    <div className="sources-list">
                      {task.research_data.sources.map((source: any, idx: number) => {
                        // 信源分级
                        const reliability = source.reliability || 0.6;
                        const level = reliability >= 0.9 ? 'A' : reliability >= 0.7 ? 'B' : reliability >= 0.5 ? 'C' : 'D';
                        const levelColors: Record<string, { bg: string; color: string }> = {
                          A: { bg: 'rgba(16,185,129,0.1)', color: '#10b981' },
                          B: { bg: 'rgba(59,130,246,0.1)', color: '#3b82f6' },
                          C: { bg: 'rgba(245,158,11,0.1)', color: '#f59e0b' },
                          D: { bg: 'rgba(107,114,128,0.1)', color: '#6b7280' }
                        };
                        const style = levelColors[level];

                        return (
                          <div key={idx} className="source-item">
                            <div className="source-info">
                              <span className="source-name">{source.name}</span>
                              <span
                                className="source-level"
                                style={{ background: style.bg, color: style.color }}
                              >
                                {level}级 · {(reliability * 100).toFixed(0)}%
                              </span>
                            </div>
                            <a href={source.url} target="_blank" rel="noopener noreferrer" className="source-link">
                              查看原文 →
                            </a>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="empty-state">
                <div className="empty-icon">🔍</div>
                <div className="empty-title">暂无研究数据</div>
                <p>任务进入深度研究阶段后将自动采集相关内容</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'writing' && (
          <div className="tab-panel writing-panel">
            {/* 操作按钮区 */}
            <div className="info-card actions-card">
              <h3 className="card-title">⚡ 文稿操作</h3>
              <div className="writing-actions">
                <button
                  className="btn btn-warning"
                  onClick={handleRedoWriting}
                  disabled={actionLoading === 'redo-writing'}
                >
                  {actionLoading === 'redo-writing' ? '启动中...' : '🔄 重做文稿生成'}
                </button>
                {task.writing_data?.draft && (
                  <button
                    className="btn btn-primary"
                    onClick={handleComplianceCheck}
                    disabled={checkingCompliance}
                  >
                    {checkingCompliance ? '检查中...' : '🛡️ 合规检查'}
                  </button>
                )}
              </div>
              <p className="action-hint">重做将删除当前版本并重新生成初稿</p>
            </div>

            {/* 合规检查结果 */}
            {complianceResult && (
              <div className="info-card compliance-result-card">
                <h3 className="card-title">🛡️ 合规检查结果</h3>
                <div className="compliance-summary">
                  <div
                    className={`compliance-score ${complianceResult.overallScore >= 80 ? 'pass' : complianceResult.overallScore >= 60 ? 'warning' : 'fail'}`}
                  >
                    <span className="score-value">{complianceResult.overallScore}</span>
                    <span className="score-label">
                      {complianceResult.overallScore >= 80 ? '合规' : complianceResult.overallScore >= 60 ? '需关注' : '高风险'}
                    </span>
                  </div>
                  <div className="compliance-stats">
                    <span>问题数: {complianceResult.issues.length}</span>
                    <span>状态: {complianceResult.passed ? '✅ 通过' : '❌ 未通过'}</span>
                  </div>
                </div>
                {complianceResult.issues.length > 0 && (
                  <div className="compliance-issues">
                    <h4>发现问题</h4>
                    {complianceResult.issues.map((issue, idx) => (
                      <div key={idx} className={`issue-item ${issue.level}`}>
                        <div className="issue-header">
                          <span className="issue-type">{issue.type}</span>
                          <span className={`issue-level ${issue.level}`}>{issue.level}</span>
                        </div>
                        <div className="issue-content">{issue.content}</div>
                        <div className="issue-suggestion">💡 {issue.suggestion}</div>
                      </div>
                    ))}
                  </div>
                )}
                <button className="btn btn-secondary" onClick={() => setComplianceResult(null)}>
                  清除结果
                </button>
              </div>
            )}

            {task.writing_data ? (
              <div className="writing-content">
                <div className="info-card">
                  <h3 className="card-title">📝 生成内容</h3>
                  <div className="writing-draft">
                    {task.writing_data.draft || '文稿正在生成中...'}
                  </div>
                </div>
              </div>
            ) : (
              <div className="empty-state">
                <div className="empty-icon">✍️</div>
                <div className="empty-title">文稿生成</div>
                <p>任务进入文稿生成阶段后可查看生成的内容</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'reviews' && renderReviewsTab()}

        {activeTab === 'quality' && (
          <div className="tab-panel quality-panel">
            <div className="quality-grid">
              {/* 情感分析 (MSI) */}
              {sentiment && (
                <div className="info-card sentiment-card">
                  <h3 className="card-title">📊 市场情绪指数 (MSI)</h3>
                  <div className="sentiment-display">
                    <div className="msi-gauge-small">
                      <span className="msi-value-small">{sentiment.msiIndex}</span>
                      <span className="msi-level-small">MSI</span>
                    </div>
                    <div className="msi-change">
                      <span className={`change-badge ${sentiment.trendDirection}`}>
                        趋势 {sentiment.trendDirection === 'up' ? '📈 上升' : sentiment.trendDirection === 'down' ? '📉 下降' : '➡️ 稳定'}
                      </span>
                    </div>
                  </div>
                  <div className="sentiment-distribution">
                    {(() => {
                      const total = sentiment.positive + sentiment.neutral + sentiment.negative;
                      const safeTotal = total > 0 ? total : 1;
                      return (
                        <>
                          <div className="dist-bar">
                            <span className="dist-label">😊 正面</span>
                            <div className="dist-progress">
                              <div className="dist-fill positive" style={{ width: `${(sentiment.positive / safeTotal) * 100}%` }}></div>
                            </div>
                            <span className="dist-percent">{sentiment.positive}</span>
                          </div>
                          <div className="dist-bar">
                            <span className="dist-label">😐 中性</span>
                            <div className="dist-progress">
                              <div className="dist-fill neutral" style={{ width: `${(sentiment.neutral / safeTotal) * 100}%` }}></div>
                            </div>
                            <span className="dist-percent">{sentiment.neutral}</span>
                          </div>
                          <div className="dist-bar">
                            <span className="dist-label">😞 负面</span>
                            <div className="dist-progress">
                              <div className="dist-fill negative" style={{ width: `${(sentiment.negative / safeTotal) * 100}%` }}></div>
                            </div>
                            <span className="dist-percent">{sentiment.negative}</span>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </div>
              )}

              {/* 热点话题 */}
              <div className="info-card">
                <h3 className="card-title">🔥 热点话题</h3>
                {hotTopics.length > 0 ? (
                  <div className="hot-topics-list">
                    {hotTopics.slice(0, 5).map((topic) => (
                      <div key={topic.id} className="hot-topic-item">
                        <span className="topic-name">{topic.title}</span>
                        <span className="topic-heat">{topic.hotScore || 0}°</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="empty-text">暂无热点数据</p>
                )}
              </div>

              {/* 优化建议 */}
              {suggestions.length > 0 && (
                <div className="info-card full-width">
                  <h3 className="card-title">💡 优化建议</h3>
                  <div className="suggestions-list">
                    {suggestions.map((s, idx) => (
                      <div key={idx} className={`suggestion-card priority-${s.priority}`}>
                        <div className="suggestion-header">
                          <span className="suggestion-area">{s.area}</span>
                          <span className={`priority-badge ${s.priority}`}>
                            {s.priority === 'high' ? '高' : s.priority === 'medium' ? '中' : '低'}
                          </span>
                        </div>
                        <p className="suggestion-text">{s.suggestion}</p>
                        <span className="suggestion-impact">影响: {s.impact}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 预警信息 */}
              {alerts.length > 0 && (
                <div className="info-card full-width">
                  <h3 className="card-title">⚠️ 预警信息</h3>
                  <div className="alerts-list">
                    {alerts.map((alert, idx) => (
                      <div key={idx} className={`alert-item severity-${alert.severity}`}>
                        <span className="alert-icon">
                          {alert.severity === 'critical' ? '🔴' : alert.severity === 'warning' ? '🟡' : '🔵'}
                        </span>
                        <div className="alert-content">
                          <p className="alert-message">{alert.message}</p>
                          {alert.suggestion && <p className="alert-suggestion">建议: {alert.suggestion}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 内容分析器 */}
              <div className="info-card full-width">
                <h3 className="card-title">📝 内容分析器</h3>
                <div className="content-analyzer">
                  <textarea
                    value={analyzeText}
                    onChange={(e) => setAnalyzeText(e.target.value)}
                    placeholder="粘贴文章内容进行分析..."
                    className="analyze-input"
                    rows={5}
                  />
                  <button className="btn btn-primary" onClick={handleAnalyzeContent}>
                    分析内容
                  </button>
                  {analyzeResult && (
                    <div className="analyze-result">
                      <h4>分析结果</h4>
                      <pre>{JSON.stringify(analyzeResult, null, 2)}</pre>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 素材选择弹窗 */}
      {renderAssetModal()}
      {renderAddLinkModal()}
    </div>
  );
}
