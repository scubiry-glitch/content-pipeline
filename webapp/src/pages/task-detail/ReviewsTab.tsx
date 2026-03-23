// 任务详情 - 蓝军评审 Tab
// 布局逻辑: 1.输入 2.加工 3.输出 4.辅助工具
import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { SequentialReviewChain } from '../../components/SequentialReviewChain';
import { MarkdownRenderer } from '../../components/MarkdownRenderer';
import { InlineAnnotationArea } from '../../components/content';
import type { Task, BlueTeamReview } from '../../types';
import type { Annotation } from '../../components/content';

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
    // 防止空或无效的 versionId
    if (!versionId || versionId === ':1' || versionId.startsWith(':')) {
      console.warn('[ReviewsTab] 无效的版本ID:', versionId);
      return;
    }
    
    setVersionLoading(true);
    try {
      const res = await fetch(`/api/v1/production/${task!.id}/drafts/${versionId}`, {
        headers: { 'x-api-key': 'dev-api-key' }
      });
      if (res.ok) {
        const data = await res.json();
        setSelectedVersion({
          id: versionId,
          content: data.content || '无内容',
          round: data.round
        });
      } else {
        console.error('[ReviewsTab] 加载版本失败:', res.status, await res.text());
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

  // 将 reviews 转换为 annotations 格式
  const convertToAnnotations = (): Annotation[] => {
    const annotations: Annotation[] = [];
    
    reviews.forEach(review => {
      const expertInfo = EXPERT_ROLES[review.expert_role] || { name: '专家', icon: '👤', color: '#666' };
      const reviewStatus = review.user_decision || review.status;
      
      review.questions?.forEach((q: any, idx: number) => {
        const severityMap: Record<string, Annotation['severity']> = {
          high: 'critical',
          medium: 'warning',
          low: 'info',
          praise: 'praise'
        };
        
        annotations.push({
          id: `${review.id}-${idx}`,
          content: q.question || 'No question provided',
          severity: severityMap[q.severity] || 'info',
          author: expertInfo.name,
          suggestion: q.suggestion,
          resolved: reviewStatus === 'accept' || reviewStatus === 'manual_resolved' || reviewStatus === 'ignore',
        });
      });
    });
    
    return annotations;
  };
  
  const handleAnnotationSelect = (annotation: Annotation) => {
    // 可以在这里添加选中批注的处理逻辑
    console.log('Selected annotation:', annotation);
  };
  
  const handleAnnotationResolve = (id: string) => {
    // 解析 reviewId 和 question index
    const [reviewId, questionIdx] = id.split('-');
    if (reviewId && questionIdx !== undefined) {
      onReviewDecision(reviewId, questionIdx, 'accept');
    }
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
         <div className="absolute left-1/2 top-0 bottom-0 w-[2px] opacity-20 hidden lg:block -translate-x-1/2" style={{ background: 'linear-gradient(180deg, #005bc1 0%, #fa7e1d 50%, #005bc1 100%)' }}></div>
         
         <div className="max-w-6xl mx-auto space-y-12 relative z-10">

            {/* ========== TOP: Input Section (Draft & Fact-Check) ========== */}
            <section className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
               {/* Last Draft Summary */}
               <div className="bg-white dark:bg-slate-900 p-6 shadow-sm border border-slate-200 dark:border-slate-800 rounded-lg relative z-10 flex flex-col h-full">
                  <div className="flex items-center justify-between mb-4">
                     <h2 className="font-headline font-bold text-lg flex items-center gap-2 text-on-surface dark:text-slate-200">
                        <span className="material-symbols-outlined text-primary">article</span>
                        Current Draft
                     </h2>
                     <span className="text-xs font-mono bg-surface-container dark:bg-slate-800 text-on-surface-variant dark:text-slate-400 px-2 py-1 rounded">ID: {task.id.slice(0,8).toUpperCase()}</span>
                  </div>
                  <div className="space-y-3 text-sm text-on-surface-variant dark:text-slate-400 leading-relaxed flex-1">
                     <p className="font-semibold text-on-surface dark:text-slate-200">Topic: {task.topic}</p>
                     <p>The current draft has been processed by the base generation engine and is awaiting multidimensional validation. Logical gaps, data inconsistencies, and narrative expansions are actively being flagged.</p>
                     <div className="h-1 bg-surface-container dark:bg-slate-800 rounded-full w-full overflow-hidden mt-auto">
                        <div className="h-full bg-primary w-[90%]"></div>
                     </div>
                  </div>
                  {/* 版本查看按钮 */}
                  {task?.versions?.[task.versions.length-1]?.id && !task.versions[task.versions.length-1].id.startsWith(':') && (
                    <div className="mt-4 text-center">
                       <button className="text-xs font-bold text-primary hover:text-primary-dim underline uppercase tracking-wider transition-colors" onClick={() => loadVersionContent(task.versions[task.versions.length-1].id)}>
                          View Full Draft Source
                       </button>
                    </div>
                  )}
               </div>

               {/* Fact-Check Preview */}
               <div className="bg-white dark:bg-slate-900 p-6 shadow-sm border border-slate-200 dark:border-slate-800 rounded-lg relative z-10 flex flex-col h-full">
                  <h2 className="font-headline font-bold text-lg flex items-center gap-2 mb-4 text-on-surface dark:text-slate-200">
                     <span className="material-symbols-outlined text-tertiary">fact_check</span>
                     Fact-Check Results
                  </h2>
                  <div className="space-y-4 overflow-y-auto max-h-[180px] pr-2">
                     {groupedReviews.critical.map((item, idx) => (
                        <div key={idx} className="flex items-start gap-3 p-3 bg-surface-container dark:bg-slate-800/50 rounded-lg">
                           <span className="material-symbols-outlined text-error mt-0.5" style={{fontVariationSettings: "'FILL' 1"}}>error</span>
                           <div>
                              <p className="text-sm font-bold text-on-surface dark:text-slate-200">{item.question}</p>
                              <p className="text-xs text-on-surface-variant dark:text-slate-400 mt-1 line-clamp-2">{item.suggestion}</p>
                           </div>
                           <span className="ml-auto text-[10px] font-bold text-error uppercase tracking-tighter bg-error-container/20 px-2 py-0.5 rounded text-error">High</span>
                        </div>
                     ))}
                     {groupedReviews.warning.map((item, idx) => (
                        <div key={idx} className="flex items-start gap-3 p-3 bg-surface-container dark:bg-slate-800/50 rounded-lg">
                           <span className="material-symbols-outlined text-tertiary mt-0.5" style={{fontVariationSettings: "'FILL' 1"}}>warning</span>
                           <div>
                              <p className="text-sm font-bold text-on-surface dark:text-slate-200">{item.question}</p>
                              <p className="text-xs text-on-surface-variant dark:text-slate-400 mt-1 line-clamp-2">{item.suggestion}</p>
                           </div>
                           <span className="ml-auto text-[10px] font-bold text-tertiary uppercase tracking-tighter bg-tertiary-container/10 px-2 py-0.5 rounded text-tertiary">Medium</span>
                        </div>
                     ))}
                     {groupedReviews.critical.length === 0 && groupedReviews.warning.length === 0 && (
                        <div className="text-center py-6 text-on-surface-variant dark:text-slate-500 italic text-sm">
                           No critical deviations or warnings detected.
                        </div>
                     )}
                  </div>
               </div>
            </section>

            {/* ========== MIDDLE: Process (The Review Chain) ========== */}
            <section className="space-y-8">
               <div className="text-center relative">
                  <span className="bg-background dark:bg-[#0c0f10] px-4 font-headline font-extrabold text-2xl relative z-10 text-on-surface dark:text-white">The Review Chain</span>
               </div>
               
               {reviews.filter(r => r.round === 1 || !r.round).length > 0 ? (
                 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {reviews.filter(r => r.round === 1 || !r.round).map((review) => {
                       const expert = EXPERT_ROLES[review.expert_role] || { name: 'Expert', icon: 'person', color: '#005bc1' };
                       const isChallenger = review.expert_role === 'challenger';
                       const isExpander = review.expert_role === 'expander';
                       const isSynthesizer = review.expert_role === 'synthesizer';
                       
                       const borderColor = isChallenger ? 'border-error/30 hover:border-error' : isExpander ? 'border-tertiary/30 hover:border-tertiary' : 'border-primary/30 hover:border-primary';
                       const iconColor = isChallenger ? 'text-error bg-error/10' : isExpander ? 'text-tertiary bg-tertiary/10' : 'text-primary bg-primary/10';
                       const materialIcon = isChallenger ? 'bolt' : isExpander ? 'open_in_full' : isSynthesizer ? 'hub' : 'fact_check';
                       
                       const firstQuestion = review.questions?.[0];
                       
                       return (
                          <div key={review.id} className={`bg-white dark:bg-slate-900 p-5 rounded-xl shadow-lg relative group transition-all border ${borderColor}`}>
                             <div className="flex items-center gap-3 mb-4">
                                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${iconColor}`}>
                                   <span className="material-symbols-outlined">{materialIcon}</span>
                                </div>
                                <div>
                                   <div className={`text-xs font-bold uppercase tracking-widest ${isChallenger ? 'text-error' : isExpander ? 'text-tertiary' : 'text-primary'}`}>AI Expert</div>
                                   <div className="font-headline font-bold text-on-surface dark:text-white">{expert.name}</div>
                                </div>
                             </div>
                             <p className="text-xs text-on-surface-variant dark:text-slate-400 mb-4 line-clamp-3">
                                {firstQuestion ? `"${firstQuestion.suggestion || firstQuestion.question}"` : "Pending feedback formulation..."}
                             </p>
                             <div className="flex justify-between items-center">
                                <span className="text-[10px] font-bold text-slate-400 uppercase">Status</span>
                                <span className={`w-2 h-2 rounded-full ${review.status === 'completed' ? 'bg-primary' : 'bg-surface-variant animate-pulse'}`}></span>
                             </div>
                          </div>
                       );
                    })}
                 </div>
               ) : (
                  <div className="text-center py-12 text-on-surface-variant dark:text-slate-500 bg-white/50 dark:bg-slate-900/50 rounded-xl border border-dashed border-outline-variant/30">
                     No expert reviews have been populated for this round.
                  </div>
               )}

               {/* Secondary Tools: Detailed Annotations & Timeline */}
               {reviewSummary.total > 0 && (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-8">
                     <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm overflow-hidden flex flex-col">
                        <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-4 flex items-center gap-2 shrink-0">
                           <span className="material-symbols-outlined text-primary">forum</span> Full Annotation Thread
                        </h3>
                        <div className="flex-1 overflow-y-auto max-h-[400px]">
                           <InlineAnnotationArea
                             annotations={convertToAnnotations()}
                             title=""
                             icon=""
                             onSelect={handleAnnotationSelect}
                             onResolve={task?.status === 'awaiting_approval' ? handleAnnotationResolve : undefined}
                             collapsible={false}
                           />
                        </div>
                     </div>
                     <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm flex flex-col">
                        <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-4 flex items-center gap-2 shrink-0">
                           <span className="material-symbols-outlined text-tertiary-fixed">account_tree</span> Red Team Activity Log
                        </h3>
                        <div className="flex-1 overflow-y-auto max-h-[400px] pr-2">
                           <SequentialReviewChain taskId={task!.id} onVersionSelect={loadVersionContent} />
                        </div>
                     </div>
                  </div>
               )}
            </section>

             {/* ========== BOTTOM: Output & Decision ========== */}
             <section className="grid grid-cols-1 lg:grid-cols-3 gap-8 pb-12">
               <div className="lg:col-span-2 bg-[#0c0f10] text-white p-8 rounded-2xl shadow-2xl relative overflow-hidden h-full flex flex-col">
                  <div className="absolute top-0 right-0 w-64 h-64 bg-primary/20 blur-3xl rounded-full -mr-32 -mt-32"></div>
                  <h2 className="font-headline font-extrabold text-xl mb-6 flex items-center gap-3 relative z-10 shrink-0">
                     <span className="material-symbols-outlined text-primary-fixed">summarize</span>
                     Final Review Report
                  </h2>
                  <div className="space-y-6 relative z-10 flex-1 flex flex-col">
                     <div className="grid grid-cols-2 gap-4 shrink-0">
                        <div className="bg-white/5 p-4 rounded-lg border border-white/10">
                           <div className="text-xs text-slate-400 uppercase tracking-widest mb-1">Score</div>
                           <div className="text-3xl font-black text-primary-fixed">{task.evaluation?.score || 92}<span className="text-sm font-normal text-slate-400">/100</span></div>
                        </div>
                        <div className="bg-white/5 p-4 rounded-lg border border-white/10">
                           <div className="text-xs text-slate-400 uppercase tracking-widest mb-1">Status</div>
                           <div className="text-2xl font-black text-tertiary-fixed capitalize truncate">{task.status.replace('_', ' ')}</div>
                        </div>
                     </div>
                     
                     <div className="flex-1 flex flex-col min-h-0">
                        <h3 className="text-sm font-bold border-b border-white/10 pb-2 mb-4 shrink-0">Key Action Items</h3>
                        <ul className="space-y-3 overflow-y-auto flex-1 pr-2">
                           {reviews.flatMap(r => r.questions || []).filter((q: any) => q.severity === 'high' || q.severity === 'medium').map((q: any, idx: number) => (
                              <li key={idx} className="flex items-start gap-3 text-sm text-slate-300 leading-snug">
                                 <span className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${q.severity === 'high' ? 'bg-error' : 'bg-tertiary'}`}></span>
                                 <span>{q.suggestion || q.question}</span>
                              </li>
                           ))}
                           {reviews.flatMap(r => r.questions || []).filter((q: any) => q.severity === 'high' || q.severity === 'medium').length === 0 && (
                              <li className="text-sm text-slate-500 italic">No critical action items flagged. Ready for finalization.</li>
                           )}
                        </ul>
                     </div>
                  </div>
               </div>

               <div className="flex flex-col gap-4 h-full">
                  <div className="bg-white dark:bg-slate-900 p-6 border border-slate-200 dark:border-slate-800 rounded-2xl flex-1 flex flex-col justify-center gap-4">
                     <h3 className="text-xs font-black uppercase tracking-widest text-slate-500 mb-2">Final Decision</h3>
                     <button className="w-full py-4 bg-primary text-white font-bold rounded-xl flex items-center justify-center gap-2 hover:bg-primary-dim active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-primary/20"
                        onClick={() => onBatchDecision('accept')}
                        disabled={reviewSummary.pending === 0}>
                        <span className="material-symbols-outlined" style={{fontVariationSettings: "'FILL' 1"}}>check_circle</span>
                        Accept & Finalize ({reviewSummary.pending})
                     </button>
                     <button className="w-full py-4 border-2 border-slate-200 dark:border-slate-700 text-on-surface dark:text-slate-300 font-bold rounded-xl flex items-center justify-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-800 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        onClick={() => onBatchDecision('ignore')}
                        disabled={reviewSummary.pending === 0}>
                        <span className="material-symbols-outlined">rule</span>
                        Override Actions
                     </button>
                     <button className="w-full py-4 text-error font-bold rounded-xl flex items-center justify-center gap-2 hover:bg-error-container/20 active:scale-95 transition-all mt-4"
                        onClick={onRedoReview}>
                        <span className="material-symbols-outlined">restart_alt</span>
                        Reject & Redo Draft
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
