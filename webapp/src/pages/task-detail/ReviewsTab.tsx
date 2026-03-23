// 任务详情 - 蓝军评审 Tab
// 布局逻辑: 1.输入 2.加工 3.输出 4.辅助工具
import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { ExpertReviewPanel } from '../../components/ExpertReviewPanel';
import { SequentialReviewChain } from '../../components/SequentialReviewChain';
import { MarkdownRenderer } from '../../components/MarkdownRenderer';
import type { Task, BlueTeamReview } from '../../types';

interface TaskContext {
  task: Task;
  reviews: BlueTeamReview[];
  reviewSummary: {
    total: number;
    critical: number;
    warning: number;
    praise: number;
    accepted: number;
    ignored: number;
    pending: number;
  };
  onReviewDecision: (reviewId: string, questionId: string, decision: 'accept' | 'ignore' | 'manual_resolved', note?: string) => void;
  onBatchDecision: (decision: 'accept' | 'ignore') => void;
  onReReview: (expertRole: string) => void;
  onRedoReview: () => void;
}

const EXPERT_ROLES: Record<string, { name: string; icon: string; color: string; desc: string }> = {
  // 新版蓝军评审角色 (3×3×2 模式)
  challenger: { name: '批判者', icon: '🔍', color: '#ef4444', desc: '挑战逻辑漏洞、数据可靠性' },
  expander: { name: '拓展者', icon: '⚖️', color: '#f59e0b', desc: '扩展关联因素、国际对比' },
  synthesizer: { name: '提炼者', icon: '👔', color: '#06b6d4', desc: '归纳核心论点、结构优化' },
  // 兼容旧版角色
  fact_checker: { name: '事实核查员', icon: '🔍', color: '#ef4444', desc: '数据准确性' },
  logic_checker: { name: '逻辑检察官', icon: '⚖️', color: '#f59e0b', desc: '论证严密性' },
  domain_expert: { name: '行业专家', icon: '👔', color: '#06b6d4', desc: '专业深度' },
  reader_rep: { name: '读者代表', icon: '👁️', color: '#10b981', desc: '可读性' }
};

export function ReviewsTab() {
  const {
    task,
    reviews,
    reviewSummary,
    onReviewDecision,
    onBatchDecision,
    onReReview,
    onRedoReview,
  } = useOutletContext<TaskContext>();

  // 版本查看弹窗状态
  const [selectedVersion, setSelectedVersion] = useState<{ id: string; content: string; round?: number } | null>(null);
  const [versionLoading, setVersionLoading] = useState(false);

  // 加载版本内容
  const loadVersionContent = async (versionId: string) => {
    setVersionLoading(true);
    try {
      const res = await fetch(`/api/v1/production/${task!.id}/drafts/${versionId}`, {
        headers: { 'x-api-key': 'dev-api-key' }
      });
      if (res.ok) {
        const data = await res.json();
        setSelectedVersion({
          id: versionId,
          content: data.content || data.draft?.content || '无内容',
          round: data.round
        });
      } else {
        alert('加载版本内容失败');
      }
    } catch (err) {
      console.error('加载版本失败:', err);
      alert('加载版本内容失败');
    } finally {
      setVersionLoading(false);
    }
  };

  const groupedReviews = {
    critical: [] as any[],
    warning: [] as any[],
    praise: [] as any[]
  };

  reviews.forEach(review => {
    const expertInfo = EXPERT_ROLES[review.expert_role] || { name: '专家', icon: '👤', color: '#666' };
    // 将 review 级别的状态映射到 question 级别
    // user_decision 优先于 status（如果用户已做出决策）
    const reviewStatus = review.user_decision || review.status;
    review.questions?.forEach((q: any) => {
      const item = { 
        ...q, 
        reviewId: review.id,
        expertRole: review.expert_role,
        expertName: expertInfo.name,
        expertIcon: expertInfo.icon,
        status: reviewStatus  // 添加 review 的状态到 question
      };
      if (q.severity === 'high') groupedReviews.critical.push(item);
      else if (q.severity === 'medium') groupedReviews.warning.push(item);
      else if (q.severity === 'praise') groupedReviews.praise.push(item);
    });
  });

  const canProceed = reviewSummary.critical === 0 || reviewSummary.accepted >= reviewSummary.critical;

  const renderReviewItem = (item: any, idx: number) => {
    const statusLabels: Record<string, { text: string; class: string }> = {
      pending: { text: '⏳ Pending', class: 'bg-slate-100 text-slate-600' },
      accepted: { text: '✓ Accepted', class: 'bg-green-100 text-green-700' },
      accept: { text: '✓ Accepted', class: 'bg-green-100 text-green-700' },
      ignored: { text: '⊘ Ignored', class: 'bg-slate-200 text-slate-500' },
      manual_resolved: { text: '✓ Manual Res.', class: 'bg-blue-100 text-blue-700' },
      completed: { text: '✓ Completed', class: 'bg-green-100 text-green-700' },
      reject: { text: '✗ Rejected', class: 'bg-red-100 text-red-700' },
      revise: { text: '↻ Revise', class: 'bg-orange-100 text-orange-700' }
    };
    const status = statusLabels[item.status || 'pending'] || statusLabels['pending'];

    // Map severity to colors
    const severityColor = item.severity === 'high' || item.severity === 'critical' ? 'bg-red-500 animate-pulse' : 
                          item.severity === 'medium' || item.severity === 'warning' ? 'bg-orange-500' : 'bg-slate-300';

    return (
      <div key={`${item.reviewId}-${idx}`} className="bg-white dark:bg-slate-900 p-5 border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg relative group transition-all flex flex-col justify-between">
         <div>
            <div className="flex items-center gap-3 mb-4">
               <div className={`w-10 h-10 rounded-full flex items-center justify-center ${item.expertRole === 'challenger' ? 'bg-red-50 dark:bg-red-900/30 text-red-600' : item.expertRole === 'expander' ? 'bg-orange-50 dark:bg-orange-900/30 text-orange-600' : item.expertRole === 'synthesizer' ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600' : 'bg-slate-100 dark:bg-slate-800 text-slate-600'}`}>
                  <span className="material-symbols-outlined text-lg">{item.expertIcon || 'person'}</span>
               </div>
               <div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{item.expertRole || 'EXPERT'}</div>
                  <div className="font-headline font-bold text-slate-800 dark:text-slate-200">{item.expertName || 'Reviewer'}</div>
               </div>
               <span className={`ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full ${status.class}`}>
                  {status.text}
               </span>
            </div>
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-2">Q: {item.question}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4 bg-slate-50 dark:bg-slate-800/50 p-3 rounded-lg border border-slate-100 dark:border-slate-700/50 italic">
               "{item.suggestion}"
            </p>
         </div>

         <div>
             <div className="flex justify-between items-center bg-slate-50 dark:bg-slate-800 p-2 rounded mb-3">
                <span className="text-[10px] font-bold text-slate-400">SEVERITY</span>
                <span className={`w-2.5 h-2.5 rounded-full ${severityColor}`}></span>
             </div>

             {task?.status === 'awaiting_approval' && (!item.status || item.status === 'pending') && item.severity !== 'praise' && (
               <div className="grid grid-cols-2 gap-2 mt-2">
                 <button className="py-1.5 bg-green-50 hover:bg-green-100 text-green-700 border border-green-200 text-xs font-bold rounded flex items-center justify-center gap-1 transition-colors"
                    onClick={() => onReviewDecision(item.reviewId, item.id, 'accept')}>
                    <span className="material-symbols-outlined text-[14px]">check</span> Accept
                 </button>
                 <button className="py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200 text-xs font-bold rounded flex items-center justify-center gap-1 transition-colors"
                    onClick={() => onReviewDecision(item.reviewId, item.id, 'ignore')}>
                    <span className="material-symbols-outlined text-[14px]">close</span> Ignore
                 </button>
                 <button className="col-span-2 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-xs font-bold rounded flex items-center justify-center gap-1 transition-colors"
                    onClick={() => onReviewDecision(item.reviewId, item.id, 'manual_resolved')}>
                    <span className="material-symbols-outlined text-[14px]">edit</span> Manual Res.
                 </button>
               </div>
             )}
         </div>
      </div>
    );
  };

  return (
    <div className="tab-panel reviews-panel animate-fade-in pb-32">
      {/* ========== Header ========== */}
      <header className="mb-12">
        <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 mb-2">
          <span className="text-xs font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">Stage 4</span>
          <span className="material-symbols-outlined text-sm">chevron_right</span>
          <span className="text-xs font-bold uppercase tracking-wider">Expert Review Process</span>
        </div>
        <div className="flex justify-between items-end">
          <div>
            <h1 className="text-4xl font-extrabold font-headline tracking-tight text-slate-900 dark:text-white mb-2">Multi-Dimensional Review</h1>
            <p className="text-slate-500 dark:text-slate-400 max-w-2xl">3x3x2 Red Team evaluation pipeline identifying logic gaps, expanding scope, and synthesizing final output.</p>
          </div>
          <div className="flex gap-3">
             <button className="flex items-center gap-2 px-4 py-2 rounded-full border border-slate-200 dark:border-slate-700 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors" onClick={onRedoReview}>
                <span className="material-symbols-outlined text-[18px]">restart_alt</span> Restart Review
             </button>
          </div>
        </div>
      </header>

      {/* ========== Content Container ========== */}
      <div className="relative">
         {/* Vertical Journey Line (Desktop only) */}
         <div className="absolute left-[50%] top-0 bottom-0 w-0.5 bg-gradient-to-b from-blue-500 via-orange-400 to-indigo-600 opacity-20 hidden lg:block transform -translate-x-1/2"></div>
         
         <div className="space-y-16 relative z-10">

            {/* ========== Section 1: Input (Draft & Checks) ========== */}
            <section className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-stretch pt-4">
               {/* Last Draft Summary */}
               <div className="bg-white dark:bg-slate-900 p-6 shadow-sm border border-slate-200 dark:border-slate-800 rounded-2xl relative">
                  <div className="flex items-center justify-between mb-6">
                     <h2 className="font-headline font-bold text-xl flex items-center gap-2 text-slate-800 dark:text-slate-200">
                        <span className="material-symbols-outlined text-blue-600">article</span> Subject Draft
                     </h2>
                     <span className="text-xs font-mono font-bold bg-slate-100 dark:bg-slate-800 text-slate-500 px-3 py-1 rounded-full uppercase tracking-wider border border-slate-200 dark:border-slate-700">TID: {task.id.slice(0,8)}</span>
                  </div>
                  <div className="space-y-4">
                     <div>
                        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Topic</div>
                        <p className="font-semibold text-slate-800 dark:text-slate-200 text-sm">{task.topic}</p>
                     </div>
                     <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-xl border border-dashed border-slate-200 dark:border-slate-700">
                        <p className="text-xs text-slate-500 dark:text-slate-400 italic font-mono truncate max-w-full">
                           Subject content loaded into evaluation engine...
                        </p>
                     </div>
                  </div>
               </div>

               {/* Fact-Check Preview */}
               <div className="bg-white dark:bg-slate-900 p-6 shadow-sm border border-slate-200 dark:border-slate-800 rounded-2xl relative flex flex-col justify-between">
                  <h2 className="font-headline font-bold text-xl flex items-center gap-2 mb-6 text-slate-800 dark:text-slate-200">
                     <span className="material-symbols-outlined text-orange-500">fact_check</span> Pre-Flight Status
                  </h2>
                  <div className="flex-1 grid grid-cols-3 gap-4 mb-4">
                     <div className="bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/30 p-4 rounded-xl flex flex-col items-center justify-center">
                        <span className="text-3xl font-black text-red-600 dark:text-red-400">{groupedReviews.critical.length}</span>
                        <span className="text-[10px] uppercase font-bold text-red-800 dark:text-red-300 tracking-wider mt-1">Critical</span>
                     </div>
                     <div className="bg-orange-50 dark:bg-orange-900/10 border border-orange-100 dark:border-orange-900/30 p-4 rounded-xl flex flex-col items-center justify-center">
                        <span className="text-3xl font-black text-orange-600 dark:text-orange-400">{groupedReviews.warning.length}</span>
                        <span className="text-[10px] uppercase font-bold text-orange-800 dark:text-orange-300 tracking-wider mt-1">Warnings</span>
                     </div>
                     <div className="bg-green-50 dark:bg-green-900/10 border border-green-100 dark:border-green-900/30 p-4 rounded-xl flex flex-col items-center justify-center">
                        <span className="text-3xl font-black text-green-600 dark:text-green-400">{groupedReviews.praise.length}</span>
                        <span className="text-[10px] uppercase font-bold text-green-800 dark:text-green-300 tracking-wider mt-1">Praise</span>
                     </div>
                  </div>
                  
                  {/* 版本查看按钮 */}
                  <div className="mt-2 text-center">
                     <button className="text-xs font-bold text-blue-600 hover:text-blue-800 underline uppercase tracking-wider" onClick={() => loadVersionContent(task?.versions?.[task.versions.length-1]?.id || '')}>
                        🔍 View Full Draft Source
                     </button>
                  </div>
               </div>
            </section>

            {/* ========== Section 2: Process (Review Chain) ========== */}
            <section className="space-y-8 py-8">
               <div className="text-center relative mb-12">
                  <span className="bg-surface dark:bg-[#0c0f10] px-6 font-headline font-extrabold text-2xl relative z-10 text-slate-700 dark:text-slate-300 inline-flex items-center gap-2">
                     <span className="material-symbols-outlined absolute -left-6 text-slate-300 dark:text-slate-700">link</span>
                     The Review Chain
                     <span className="material-symbols-outlined absolute -right-6 text-slate-300 dark:text-slate-700">link</span>
                  </span>
               </div>

               {reviewSummary.total === 0 ? (
                  <div className="empty-state py-20 text-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-4xl mx-auto shadow-sm">
                     <div className="empty-icon text-6xl mb-4 opacity-50">👥</div>
                     <div className="empty-title text-xl font-bold text-slate-700 dark:text-slate-300 mb-2">No Active Reviews</div>
                     <p className="text-slate-500 max-w-sm mx-auto">Expert review pipeline has not been initiated or contains no recorded feedback at this moment.</p>
                  </div>
               ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                     {/* Show mixed critical/warning unhandled up top? Or just map all. */}
                     {groupedReviews.critical.concat(groupedReviews.warning, groupedReviews.praise).map((item: any, idx: number) => renderReviewItem(item, idx))}
                  </div>
               )}
               
               {/* Sequential Review Chain (Mini Timeline Version) */}
               {reviewSummary.total > 0 && (
                  <div className="mt-12 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
                     <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-4 flex items-center gap-2">
                        <span className="material-symbols-outlined text-indigo-500">account_tree</span> Red Team Activity Log
                     </h3>
                     <SequentialReviewChain taskId={task!.id} onVersionSelect={loadVersionContent} />
                  </div>
               )}
            </section>

            {/* ========== Section 3: Output (Final Report) ========== */}
            <section className="grid grid-cols-1 lg:grid-cols-3 gap-8 pb-12">
               <div className="lg:col-span-2 bg-slate-900 text-white p-8 rounded-3xl shadow-xl relative overflow-hidden flex flex-col justify-between">
                  <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-blue-500/20 blur-[80px] rounded-full transform translate-x-1/2 -translate-y-1/2"></div>
                  
                  <div>
                     <h2 className="font-headline font-extrabold text-2xl mb-8 flex items-center gap-3 relative z-10">
                        <span className="material-symbols-outlined text-blue-400">task_alt</span>
                        Final Review Report
                     </h2>
                     <div className="space-y-8 relative z-10">
                        <div className="grid grid-cols-3 gap-4">
                           <div className="bg-white/5 p-5 rounded-2xl border border-white/10 flex flex-col justify-between">
                              <div className="text-[10px] text-slate-400 uppercase tracking-widest font-bold mb-2">Resolved</div>
                              <div className="text-3xl font-black text-white">{reviewSummary.accepted + reviewSummary.ignored}</div>
                           </div>
                           <div className="bg-white/5 p-5 rounded-2xl border border-white/10 flex flex-col justify-between">
                              <div className="text-[10px] text-slate-400 uppercase tracking-widest font-bold mb-2">Pending</div>
                              <div className="text-3xl font-black text-orange-400">{reviewSummary.pending}</div>
                           </div>
                           <div className="bg-white/5 p-5 rounded-2xl border border-white/10 flex flex-col justify-between">
                              <div className="text-[10px] text-slate-400 uppercase tracking-widest font-bold mb-2">Health</div>
                              <div className="text-3xl font-black text-blue-400">
                                 {reviewSummary.total > 0 ? Math.round(((reviewSummary.accepted + reviewSummary.ignored) / reviewSummary.total) * 100) : 100}%
                              </div>
                           </div>
                        </div>

                        {reviewSummary.pending > 0 && (
                           <div className="bg-orange-500/10 border border-orange-500/30 rounded-xl p-4">
                              <div className="flex items-start gap-3">
                                 <span className="material-symbols-outlined text-orange-400 mt-0.5">warning</span>
                                 <div>
                                    <h4 className="text-sm font-bold text-orange-100">Action Required</h4>
                                    <p className="text-xs text-orange-200/80 mt-1">There are {reviewSummary.pending} pending feedback items from the review chain. Address them to finalize the stage.</p>
                                 </div>
                              </div>
                           </div>
                        )}
                        {reviewSummary.total > 0 && reviewSummary.pending === 0 && (
                           <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4">
                              <div className="flex items-start gap-3">
                                 <span className="material-symbols-outlined text-green-400 mt-0.5">check_circle</span>
                                 <div>
                                    <h4 className="text-sm font-bold text-green-100">All Clear</h4>
                                    <p className="text-xs text-green-200/80 mt-1">All feedback items have been resolved. The draft is ready for finalization.</p>
                                 </div>
                              </div>
                           </div>
                        )}
                     </div>
                  </div>
               </div>

               {/* Right Side Workflow Actions */}
               <div className="flex flex-col gap-4">
                  <div className="bg-white dark:bg-slate-900 p-8 border border-slate-200 dark:border-slate-800 rounded-3xl flex-1 flex flex-col justify-center gap-4 shadow-sm">
                     <h3 className="text-xs font-black uppercase tracking-widest text-slate-500 mb-4 text-center">Batch Decisions</h3>
                     
                     <button className="w-full py-4 bg-slate-900 dark:bg-blue-600 text-white font-bold rounded-xl flex items-center justify-center gap-2 hover:bg-slate-800 dark:hover:bg-blue-700 active:scale-95 transition-all shadow-lg shadow-black/10 dark:shadow-blue-900/20"
                        onClick={() => onBatchDecision('accept')}
                        disabled={reviewSummary.pending === 0}>
                        <span className="material-symbols-outlined" style={{fontVariationSettings: "'FILL' 1"}}>check_circle</span>
                        Accept All Outstanding
                     </button>
                     
                     <button className="w-full py-4 border-2 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold rounded-xl flex items-center justify-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-800 active:scale-95 transition-all"
                        onClick={() => onBatchDecision('ignore')}
                        disabled={reviewSummary.pending === 0}>
                        <span className="material-symbols-outlined">block</span>
                        Ignore All Outstanding
                     </button>
                     
                     <div className="my-4 flex items-center gap-4">
                        <div className="flex-1 h-px bg-slate-200 dark:bg-slate-800"></div>
                        <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Expertise</span>
                        <div className="flex-1 h-px bg-slate-200 dark:bg-slate-800"></div>
                     </div>

                     <div className="grid grid-cols-2 gap-2">
                         {Object.entries(EXPERT_ROLES).slice(0, 3).map(([role, info]) => (
                           <button key={role} className="col-span-1 py-3 bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-[10px] font-bold uppercase tracking-wider rounded-lg flex flex-col items-center justify-center gap-1 transition-colors group"
                              onClick={() => onReReview(role)}
                              title={`Request Re-Review from ${info.name}`}>
                              <span className="material-symbols-outlined text-lg opacity-50 group-hover:opacity-100 transition-opacity">{info.icon === '🔍' ? 'search' : info.icon === '⚖️' ? 'balance' : 'hub'}</span>
                              Recall {info.name}
                           </button>
                         ))}
                     </div>
                  </div>
               </div>
            </section>
         </div>
      </div>

      {/* ========== Version Modal (Preserved) ========== */}
      {selectedVersion && (
         <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in" onClick={() => setSelectedVersion(null)}>
            <div className="bg-white dark:bg-slate-900 w-full max-w-4xl rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden border border-slate-200 dark:border-slate-800" onClick={e => e.stopPropagation()}>
               <div className="flex items-center justify-between p-6 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
                  <div className="flex items-end gap-3">
                     <h3 className="text-xl font-bold font-headline text-slate-800 dark:text-slate-200 flex items-center gap-2">
                        <span className="material-symbols-outlined text-blue-500">description</span> 
                        Draft Snapshot {selectedVersion.round ? `(Round ${selectedVersion.round})` : ''}
                     </h3>
                     <span className="text-xs font-mono text-slate-500 bg-slate-200 dark:bg-slate-800 px-2 py-0.5 rounded tracking-widest">{selectedVersion.id.slice(-8)}</span>
                  </div>
                  <button onClick={() => setSelectedVersion(null)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 transition-colors">
                     <span className="material-symbols-outlined">close</span>
                  </button>
               </div>
               <div className="flex-1 overflow-y-auto p-8 bg-slate-50/30 dark:bg-[#0c0f10]">
                  {versionLoading ? (
                     <div className="flex flex-col items-center justify-center h-64 text-slate-400 gap-4">
                        <span className="material-symbols-outlined text-4xl animate-spin">refresh</span>
                        <p className="text-sm font-bold tracking-widest uppercase">Fetching Snapshot...</p>
                     </div>
                  ) : (
                     <div className="prose prose-sm dark:prose-invert max-w-none">
                        <MarkdownRenderer content={selectedVersion.content} />
                     </div>
                  )}
               </div>
            </div>
         </div>
      )}
    </div>
  );
}
