// 任务详情页 - 左右分栏布局（带独立路由Tab）
import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  tasksApi,
  blueTeamApi,
  hotTopicsApi,
  sentimentApi,
  assetsApi,
  researchApi,
  complianceApi,
  orchestratorApi,
  type BlueTeamReview,
  type HotTopic,
  type ResearchConfig,
  type ComplianceCheckResult,
  type WorkflowRule
} from '../api/client';
import type { Task, Asset } from '../types';
import './TaskDetailLayout.css';
import './TaskDetail.css';

// Tab 配置 (映射为左侧边导航)
const TABS = [
  { id: 'overview', label: '概览', materialIcon: 'dashboard', path: 'overview' },
  { id: 'planning', label: '选题策划', materialIcon: 'lightbulb', path: 'planning' },
  { id: 'research', label: '深度研究', materialIcon: 'search', path: 'research' },
  { id: 'writing', label: '文稿生成', materialIcon: 'edit_note', path: 'writing' },
  { id: 'reviews', label: '蓝军评审', materialIcon: 'fact_check', path: 'reviews' },
  { id: 'quality', label: '质量分析', materialIcon: 'analytics', path: 'quality' },
  { id: 'portal', label: '发布预览', materialIcon: 'preview', path: 'portal' },
];

export function TaskDetailLayout() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  // 基础状态
  const [task, setTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(true);

  // 评审相关状态
  const [reviews, setReviews] = useState<BlueTeamReview[]>([]);
  const [reviewSummary, setReviewSummary] = useState({
    total: 0, critical: 0, warning: 0, praise: 0,
    accepted: 0, ignored: 0, pending: 0
  });

  // 质量分析状态
  const [hotTopics, setHotTopics] = useState<HotTopic[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [sentiment, setSentiment] = useState<any>(null);

  // 素材关联状态
  const [availableAssets, setAvailableAssets] = useState<Asset[]>([]);
  const [selectedAssets, setSelectedAssets] = useState<string[]>([]);
  const [showAssetModal, setShowAssetModal] = useState(false);

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

  // 工作流规则状态
  const [workflowRules, setWorkflowRules] = useState<WorkflowRule[]>([]);

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

  // 获取文稿内容
  const getDraftFromTask = useCallback((): { content: string; version?: number } | null => {
    if (!task) return null;

    const writingDraft = (task as any).writing_data?.draft;
    if (typeof writingDraft === 'string' && writingDraft.trim()) {
      return { content: writingDraft, version: (task as any).writing_data?.version };
    }

    const versions = (task as any).versions || (task as any).draft_versions || [];
    if (versions.length === 0) return null;

    // 按版本号降序，同版本按内容长度降序（取最完整的版本）
    const sorted = [...versions].sort((a: any, b: any) => {
      const versionDiff = (b.version ?? 0) - (a.version ?? 0);
      if (versionDiff !== 0) return versionDiff;
      // 同版本号时，优先选内容最长的（最完整的修订稿）
      const aLen = typeof a.content === 'string' ? a.content.length : 0;
      const bLen = typeof b.content === 'string' ? b.content.length : 0;
      return bLen - aLen;
    });
    const latest = sorted[0];
    if (typeof latest?.content === 'string' && latest.content.trim()) {
      return { content: latest.content, version: latest.version };
    }

    return null;
  }, [task]);

  // 生成优化建议
  const generateSuggestions = useCallback((taskData: Task) => {
    const newSuggestions: any[] = [];
    if (!taskData.outline) {
      newSuggestions.push({ area: '大纲', suggestion: '任务尚未生成大纲，建议进入选题策划阶段', priority: 'high', impact: '明确写作方向' });
    }
    if (!taskData.research_data?.sources?.length) {
      newSuggestions.push({ area: '研究', suggestion: '缺少引用来源，建议进行深度研究收集资料', priority: 'medium', impact: '提升内容可信度' });
    }
    if (taskData.evaluation && taskData.evaluation.score < 70) {
      newSuggestions.push({ area: '质量', suggestion: '选题评分较低，建议优化选题或寻找差异化角度', priority: 'high', impact: '提高内容竞争力' });
    }
    setSuggestions(newSuggestions);
  }, []);

  // 生成预警信息
  const generateAlerts = useCallback((taskData: Task, currentReviews: BlueTeamReview[]) => {
    const newAlerts: any[] = [];
    
    // 安全检查 updated_at 是否存在
    if (taskData.updated_at) {
      const lastUpdate = new Date(taskData.updated_at);
      const now = new Date();
      const daysDiff = Math.floor((now.getTime() - lastUpdate.getTime()) / (1000 * 60 * 60 * 24));

      if (daysDiff > 7) {
        newAlerts.push({ type: 'freshness', severity: 'warning', message: `任务已${daysDiff}天未更新`, suggestion: '建议检查任务状态或更新进度' });
      }
    }

    const pendingReviews = currentReviews.filter(r => r.status === 'pending');
    if (pendingReviews.length > 0) {
      newAlerts.push({ type: 'review', severity: 'info', message: `有${pendingReviews.length}条评审意见待处理`, suggestion: '请及时处理蓝军评审意见' });
    }

    setAlerts(newAlerts);
  }, []);

  // 加载蓝军评审
  const loadReviews = useCallback(async (taskId: string) => {
    try {
      const reviewsData = await blueTeamApi.getReviews(taskId);
      // API returns { taskId, status, summary, experts, rawReviews }
      const apiSummary = (reviewsData as any).summary || {};
      
      // Try rawReviews first, then experts array
      let rawReviews = (reviewsData as any).rawReviews || [];
      const experts = (reviewsData as any).experts || [];
      
      // If no rawReviews but has experts, convert from experts format
      if (rawReviews.length === 0 && experts.length > 0) {
        // Convert from experts/issues format to BlueTeamReview format
        let reviewId = 1;
        experts.forEach((expert: any) => {
          const issues = expert.issues || [];
          issues.forEach((issue: any) => {
            rawReviews.push({
              id: issue.id || `review_${reviewId++}`,
              task_id: taskId,
              round: issue.round || 1,
              expert_role: issue.expert || expert.role || 'domain_expert',
              questions: [{
                id: issue.id || `q_${reviewId}`,
                question: issue.question || '',
                severity: issue.severity || 'medium',
                suggestion: issue.suggestion || '',
                location: issue.location || ''
              }],
              status: issue.status || 'pending',
              user_decision: issue.userDecision || null,
              decision_note: issue.decisionNote || null,
              decided_at: issue.decidedAt || null
            });
          });
        });
      }
      
      // Convert to BlueTeamReview format
      const items: BlueTeamReview[] = rawReviews.map((row: any) => ({
        id: row.id,
        task_id: row.task_id,
        round: row.round,
        expert_role: row.expert_role,
        questions: Array.isArray(row.questions) ? row.questions : 
                   typeof row.questions === 'string' ? JSON.parse(row.questions) : [],
        status: row.status,
        user_decision: row.user_decision,
        decision_note: row.decision_note,
        decided_at: row.decided_at,
        created_at: row.created_at
      }));
      
      console.log('[TaskDetailLayout] Loaded reviews:', items.length);
      setReviews(items);

      // Calculate accepted/ignored/pending from comments (questions) data
      let accepted = 0, ignored = 0, pending = 0;
      items.forEach(review => {
        const questions = Array.isArray(review.questions) ? review.questions : [];
        questions.forEach((q: any) => {
          // 每个 question 可能有独立的状态，或者继承 review 的状态
          const questionStatus = q.status || review.user_decision || review.status;
          if (questionStatus === 'accept' || questionStatus === 'accepted' || questionStatus === 'completed') {
            accepted++;
          } else if (questionStatus === 'ignore' || questionStatus === 'ignored') {
            ignored++;
          } else {
            pending++;
          }
        });
      });

      // Total should be sum of accepted + ignored + pending
      const calculatedTotal = accepted + ignored + pending;

      // Use API summary for severity counts, but calculated counts for status
      const summary = { 
        total: calculatedTotal, 
        critical: apiSummary.critical || 0, 
        warning: apiSummary.warning || 0, 
        praise: apiSummary.praise || 0, 
        accepted,
        ignored,
        pending
      };

      setReviewSummary(summary);
      return items;
    } catch (error) {
      console.error('加载评审失败:', error);
      return [];
    }
  }, []);

  // 加载任务数据
  const loadTask = useCallback(async () => {
    if (!id) return;
    
    try {
      setLoading(true);
      const data = await tasksApi.getById(id);
      
      // 加载 draft versions
      let versions: any[] = [];
      try {
        const versionsRes = await fetch(`/api/v1/production/${id}/versions`, {
          headers: { 'x-api-key': 'dev-api-key' }
        });
        if (versionsRes.ok) {
          versions = await versionsRes.json();
        }
      } catch (e) {
        console.log('[TaskDetailLayout] No versions loaded');
      }
      
      // 合并 versions 到 task
      const taskWithVersions = { ...data, versions };
      setTask(taskWithVersions);

      let loadedReviews: BlueTeamReview[] = [];
      
      // 加载蓝军评审 (所有状态都可能需要显示评审意见)
      loadedReviews = await loadReviews(id);

      // 加载热点话题
      try {
        const topicsData = await hotTopicsApi.getAll({ limit: 5 });
        setHotTopics(topicsData.items || []);
      } catch (e) {
        setHotTopics([]);
      }

      // 加载情感分析
      try {
        const sentimentData = await sentimentApi.getStats();
        setSentiment(sentimentData);
      } catch (e) {
        setSentiment({ msiIndex: 50, trendDirection: 'stable', positive: 0, negative: 0, neutral: 0 });
      }

      // 生成优化建议和预警
      generateSuggestions(data);
      generateAlerts(data, loadedReviews);
    } catch (error) {
      console.error('加载任务失败:', error);
    } finally {
      setLoading(false);
    }
  }, [id, loadReviews, generateSuggestions, generateAlerts]);

  // 加载素材
  const loadAssets = useCallback(async () => {
    try {
      const data = await assetsApi.getAll();
      setAvailableAssets(data.items || []);
    } catch (error) {
      console.error('加载素材失败:', error);
    }
  }, []);

  // 加载工作流规则
  const loadWorkflowRules = useCallback(async () => {
    try {
      const data = await orchestratorApi.getRules();
      setWorkflowRules(data.items || []);
    } catch (error) {
      console.error('加载工作流规则失败:', error);
    }
  }, []);

  // 初始加载
  useEffect(() => {
    if (id) {
      loadTask();
      loadAssets();
      loadWorkflowRules();
    }
  }, [id, loadTask, loadAssets, loadWorkflowRules]);

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

  // 各种处理函数
  const handleReviewDecision = async (reviewId: string, questionId: string, decision: 'accept' | 'ignore' | 'manual_resolved', note?: string) => {
    try {
      await blueTeamApi.submitDecision(id!, reviewId, { questionId, decision, note });
      await loadReviews(id!);
    } catch (error) {
      console.error('提交决策失败:', error);
      alert('操作失败，请重试');
    }
  };

  const handleBatchDecision = async (decision: 'accept' | 'ignore') => {
    if (!confirm(`确定要${decision === 'accept' ? '全部接受' : '全部忽略'}所有待处理的评审意见吗？`)) return;
    try {
      // 构建 decisions 数组，包含所有待处理的评审项
      const pendingReviews = reviews.filter(r => r.status === 'pending');
      const decisions = pendingReviews.map(r => ({
        reviewId: r.id,
        decision,
      }));
      await blueTeamApi.batchDecide(id!, { decisions });
      await loadReviews(id!);
    } catch (error) {
      console.error('批量决策失败:', error);
      alert('操作失败');
    }
  };

  const handleReReview = async (expertRole: string) => {
    if (!confirm(`确定要申请重新评审吗？`)) return;
    try {
      await blueTeamApi.requestReReview(id!, { expertRole });
      alert('重新评审已申请，请稍后刷新查看');
    } catch (error) {
      console.error('申请重新评审失败:', error);
      alert('申请失败');
    }
  };

  const handleApprove = async (approved: boolean) => {
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

  const handleRedoStage = async (stage: 'planning' | 'research' | 'writing' | 'review', data?: any) => {
    const stageNames: Record<string, string> = { planning: '选题策划', research: '深度研究', writing: '文稿生成', review: '蓝军评审' };
    
    // planning 阶段有特殊处理（通过对话框），不需要确认
    if (stage !== 'planning' && !confirm(`确定要重做${stageNames[stage]}吗？`)) return;
    
    setActionLoading(`redo-${stage}`);
    try {
      await tasksApi.redoStage(id!, stage, data);
      alert(`${stageNames[stage]}重做已在后台启动，请稍后刷新查看进度`);
      loadTask();
      const pollInterval = setInterval(() => { loadTask(); }, 3000);
      setTimeout(() => clearInterval(pollInterval), 30000);
    } catch (error) {
      console.error(`重做${stageNames[stage]}失败:`, error);
      alert('操作失败，请检查网络连接或稍后重试');
    } finally {
      setActionLoading(null);
    }
  };

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

  const handleComplianceCheck = async () => {
    const draft = getDraftFromTask();
    if (!draft?.content) {
      alert('暂无文稿内容可检查');
      return;
    }
    setCheckingCompliance(true);
    try {
      const result = await complianceApi.checkContent(task?.id || 'temp', draft.content);
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

  const handleDelete = async () => {
    if (!confirm('确定要删除此任务吗？删除后将进入回收站。')) return;
    try {
      await tasksApi.delete(id!);
      alert('任务已删除');
      navigate('/tasks');
    } catch (error) {
      console.error('删除任务失败:', error);
      alert('删除失败，请重试');
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

  if (loading) {
    return (
      <div className="task-detail-layout">
        <div className="loading">
          <span className="loading-spinner"></span>
          加载中...
        </div>
      </div>
    );
  }

  if (!task) {
    return (
      <div className="task-detail-layout">
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

  const currentStage = getCurrentStageNum(task.status);

  // 准备context传递给子路由
  const taskContext = {
    task,
    workflowRules,
    reviews,
    reviewSummary,
    sentiment,
    hotTopics,
    suggestions,
    alerts,
    latestOutput: getDraftFromTask(),
    researchConfig,
    showResearchConfig,
    complianceResult,
    checkingCompliance,
    actionLoading,
    editingOutline,
    outlineDraft,
    getDraftFromTask,
    // 回调函数
    onConfirmOutline: handleConfirmOutline,
    onRedoStage: handleRedoStage,
    onRedoWriting: handleRedoWriting,
    onComplianceCheck: handleComplianceCheck,
    onClearComplianceResult: () => setComplianceResult(null),
    onResearchConfigChange: setResearchConfig,
    onShowResearchConfigChange: setShowResearchConfig,
    onSaveResearchConfig: handleSaveResearchConfig,
    onCollectResearch: handleCollectResearch,
    onAddExternalLink: () => setShowAddLinkModal(true),
    onEditOutline: handleEditOutline,
    onSaveOutline: handleSaveOutline,
    onCancelEdit: () => setEditingOutline(false),
    onOutlineChange: setOutlineDraft,
    onReviewDecision: handleReviewDecision,
    onBatchDecision: handleBatchDecision,
    onReReview: handleReReview,
    onRedoReview: (config?: any) => handleRedoStage('review', { config }),
  };

  return (
    <div className="task-detail-layout">
      {/* 左侧边栏 - 复用新版 HTML 样式架构 */}
      <aside className="task-sidebar-new">
        <div className="task-header-info mb-6 px-2 pt-4">
          <h1 className="task-topic-preview" title={task.topic}>{task.topic || 'Untitled Task'}</h1>
        </div>

        <nav className="sidebar-nav-menu">
          {TABS.map((tab) => (
            <NavLink
              key={tab.id}
              to={`/tasks/${id}/${tab.path}`}
              className={({ isActive }) => `sidebar-nav-item ${isActive ? 'active' : ''}`}
              end={tab.id === 'overview'}
            >
              <span className="material-symbols-outlined nav-item-icon" style={{ fontVariationSettings: "'FILL' 1" }}>
                {tab.materialIcon}
              </span>
              <span>{tab.label}</span>
              {tab.id === 'reviews' && reviewSummary.total > 0 && (
                <span className="nav-item-badge">{reviewSummary.total}</span>
              )}
            </NavLink>
          ))}
        </nav>

        {/* 快捷操作 (移到底部) */}
        <div className="sidebar-bottom-actions mt-auto p-2 border-t border-slate-200 dark:border-slate-800 pt-4 flex flex-col gap-2">
          <button className="w-full flex items-center justify-center gap-2 py-2.5 bg-white border border-slate-300 dark:bg-slate-800 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-lg font-semibold shadow-sm hover:bg-slate-50 transition-all text-sm" onClick={() => setShowAssetModal(true)}>
            <span className="material-symbols-outlined text-sm">attach_file</span>
            <span>关联素材</span>
          </button>
          
          {(task.status === 'planning' || task.status === 'outline_pending') && (
            <button
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-blue-600 text-white rounded-lg font-semibold shadow-md hover:bg-blue-700 transition-all text-sm"
              onClick={handleConfirmOutline}
              disabled={actionLoading === 'confirm-outline'}
            >
              <span className="material-symbols-outlined text-sm">play_arrow</span>
              <span>{actionLoading === 'confirm-outline' ? '处理中...' : '确认大纲'}</span>
            </button>
          )}

          <button className="w-full flex items-center justify-center gap-2 py-2 bg-transparent text-slate-400 hover:text-red-500 rounded-lg font-semibold transition-all text-xs mt-2" onClick={handleDelete}>
            <span className="material-symbols-outlined text-sm">delete</span>
            <span>删除任务</span>
          </button>
        </div>
      </aside>
      {/* 右侧主内容区 */}
      <main className="task-main-content-new">
        {/* Tab 内容 - 通过 Outlet 渲染，各 Tab 自身维护 Input/Process/Output 的 UI 结构 */}
        <div className="tab-content-wrapper-new">
          <Outlet context={taskContext} />
        </div>
      </main>

      {/* 素材关联弹窗 */}
      {showAssetModal && (
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
                    onClick={() => setSelectedAssets(prev =>
                      prev.includes(asset.id)
                        ? prev.filter(a => a !== asset.id)
                        : [...prev, asset.id]
                    )}
                  >
                    <div className="asset-icon">📄</div>
                    <div className="asset-info">
                      <div className="asset-title">{asset.title}</div>
                      <div className="asset-meta">{asset.source}</div>
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
              <button
                className="btn btn-primary"
                onClick={async () => {
                  try {
                    await tasksApi.update(id!, { asset_ids: selectedAssets });
                    setShowAssetModal(false);
                    loadTask();
                  } catch (error) {
                    alert('关联失败');
                  }
                }}
              >
                确认选择 ({selectedAssets.length})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 添加外部链接弹窗 */}
      {showAddLinkModal && (
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
      )}
    </div>
  );
}
