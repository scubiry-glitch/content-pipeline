// 任务详情 - 文稿生成 Tab (v5.0 - 流式分段生成)
// 布局逻辑: 1.输入 2.加工 3.输出 4.辅助工具
import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { VersionComparePanel } from '../../components/VersionComparePanel';
import { ExportPanel } from '../../components/ExportPanel';
import { MarkdownRenderer } from '../../components/MarkdownRenderer';
import { DraftGenerationProgress } from '../../components/DraftGenerationProgress';
import { ConfigCard, GlobalActionBar } from '../../components/common';
import type { Task } from '../../types';

interface TaskContext {
  task: Task;
  complianceResult: any;
  checkingCompliance: boolean;
  actionLoading: string | null;
  getDraftFromTask: () => { content: string; version?: number } | null;
  onRedoWriting: () => void;
  onComplianceCheck: () => void;
  onClearComplianceResult: () => void;
}

export function WritingTab() {
  const {
    task,
    complianceResult,
    checkingCompliance,
    actionLoading,
    getDraftFromTask,
    onRedoWriting,
    onComplianceCheck,
    onClearComplianceResult,
  } = useOutletContext<TaskContext>();

  const draftContent = getDraftFromTask();
  
  // 视图模式切换：rendered(渲染) | source(源码)
  const [viewMode, setViewMode] = useState<'rendered' | 'source'>('rendered');
  
  // 是否正在生成（用于显示进度面板）
  const isGenerating = task.status === 'writing' || task.current_stage === 'generating_draft';

  return (
    <div className="tab-panel writing-panel animate-fade-in pb-32">
      {/* ========== Header ========== */}
      <header className="mb-12">
        <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 mb-2">
          <span className="text-xs font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">Stage 3</span>
          <span className="material-symbols-outlined text-sm">chevron_right</span>
          <span className="text-xs font-bold uppercase tracking-wider">Copy Generation Engine</span>
        </div>
        <div className="flex justify-between items-end">
          <div>
            <h1 className="text-4xl font-extrabold font-headline tracking-tight text-slate-900 dark:text-white mb-2">Draft Generation</h1>
            <p className="text-slate-500 dark:text-slate-400 max-w-2xl">Streaming multi-layer content drafts based on finalized macro-topics and deep research intel.</p>
          </div>
          <div className="flex gap-3">
             <button className="flex items-center gap-2 px-4 py-2 rounded-full border border-slate-200 dark:border-slate-700 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                <span className="material-symbols-outlined text-[18px]">tune</span> AI Settings
             </button>
          </div>
        </div>
      </header>

      {/* ========== Stepper Container ========== */}
      <div className="space-y-16 flex flex-col">
        {/* ========== Section 1: Input ========== */}
        <section className="relative step-line step-line-active pl-12">
          <div className="absolute left-0 top-0 w-10 h-10 bg-blue-600 text-white rounded-full flex items-center justify-center z-10 shadow-lg">
            <span className="material-symbols-outlined">settings_input_component</span>
          </div>
          <div className="flex items-baseline justify-between mb-6">
            <h3 className="text-xl font-bold font-headline">Input: Drafting Configuration</h3>
            <span className="text-xs font-bold text-slate-500 uppercase tracking-widest text-right">Pre-flight Checks</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <ConfigCard title="Target Topic" icon="edit_document" className="md:col-span-2">
               <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-dashed border-slate-200 dark:border-slate-700">
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300 leading-relaxed">{task.topic}</p>
               </div>
               <div className="grid grid-cols-2 gap-4 mt-6">
                  <div className="space-y-1">
                     <label className="text-[10px] font-bold text-slate-500 uppercase">Audience Persona</label>
                     <div className="flex items-center justify-between p-2.5 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-blue-500 cursor-pointer transition-all">
                        <span className="text-xs font-medium dark:text-slate-300">General Public / Tech Enthusiasts</span>
                        <span className="material-symbols-outlined text-xs text-slate-400">expand_more</span>
                     </div>
                  </div>
                  <div className="space-y-1">
                     <label className="text-[10px] font-bold text-slate-500 uppercase">Tone & Style</label>
                     <div className="flex items-center justify-between p-2.5 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-blue-500 cursor-pointer transition-all">
                        <span className="text-xs font-medium dark:text-slate-300">Objective & Professional</span>
                        <span className="material-symbols-outlined text-xs text-slate-400">tune</span>
                     </div>
                  </div>
               </div>
            </ConfigCard>

            <ConfigCard title="Asset Reference Context" icon="database">
               <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700">
                     <div className="flex items-center gap-3">
                        <span className="material-symbols-outlined text-orange-500 text-base">lightbulb</span>
                        <span className="text-sm font-medium dark:text-slate-300">研究洞察 (Insights)</span>
                     </div>
                     <span className="font-black text-slate-700 dark:text-slate-200">{task.research_data?.insights?.length || 0}</span>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700">
                     <div className="flex items-center gap-3">
                        <span className="material-symbols-outlined text-blue-500 text-base">link</span>
                        <span className="text-sm font-medium dark:text-slate-300">引用来源 (Citations)</span>
                     </div>
                     <span className="font-black text-slate-700 dark:text-slate-200">{task.research_data?.sources?.length || 0}</span>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700">
                     <div className="flex items-center gap-3">
                        <span className="material-symbols-outlined text-purple-500 text-base">folder_special</span>
                        <span className="text-sm font-medium dark:text-slate-300">强制素材 (Assets)</span>
                     </div>
                     <span className="font-black text-slate-700 dark:text-slate-200">{task.asset_ids?.length || 0}</span>
                  </div>
               </div>
            </ConfigCard>
          </div>
        </section>

        {/* ========== Section 2: Process (Streaming) ========== */}
        <section className={`relative step-line pl-12 ${draftContent?.content || isGenerating ? 'step-line-active' : ''}`}>
          <div className={`absolute left-0 top-0 w-10 h-10 rounded-full flex items-center justify-center z-10 shadow-lg ${isGenerating ? 'bg-indigo-600 text-white animate-pulse' : (draftContent?.content ? 'bg-indigo-600 text-white' : 'bg-slate-200 dark:bg-slate-800 text-slate-400')}`}>
            <span className="material-symbols-outlined">network_node</span>
          </div>
          <div className="flex items-center justify-between mb-8">
            <div>
              <h3 className="text-xl font-bold font-headline">Process: AI Streaming & Validation</h3>
              <p className="text-sm text-slate-500 mt-1">Real-time content generation and multi-dimensional compliance checks.</p>
            </div>
            {isGenerating && (
                 <div className="text-right">
                    <span className="text-2xl font-black text-indigo-500 animate-pulse">Streaming...</span>
                 </div>
            )}
          </div>

          {!draftContent?.content && !isGenerating ? (
             <div className="bg-slate-50 dark:bg-slate-900 rounded-2xl p-8 border border-slate-200 dark:border-slate-800 text-center">
               <span className="material-symbols-outlined text-4xl text-slate-300 dark:text-slate-700 mb-2">article</span>
               <p className="text-slate-500">Initiate generation from the bottom action bar to begin drafting workflow.</p>
             </div>
          ) : isGenerating && !draftContent?.content ? (
             <div className="bg-white dark:bg-slate-900 rounded-2xl border border-indigo-200 dark:border-indigo-900 shadow-xl shadow-indigo-500/5 overflow-hidden flex flex-col shrink-0">
               <div className="bg-indigo-50 dark:bg-indigo-900/20 p-4 border-b border-indigo-100 dark:border-indigo-800 flex justify-between items-center">
                  <div className="flex items-center gap-4">
                     <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full bg-indigo-500 animate-pulse"></div>
                        <h3 className="text-sm font-bold text-indigo-700 dark:text-indigo-400">AI Streaming Drafting Engine</h3>
                     </div>
                  </div>
               </div>
               <div className="p-8">
                  <DraftGenerationProgress taskId={task.id} onComplete={() => window.location.reload()} onError={(error) => alert(`Error: ${error}`)} />
               </div>
             </div>
          ) : (
             <div className="space-y-6">
                {/* 已经生成完毕 */}
                <div className="flex items-center gap-3 p-4 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 rounded-xl border border-green-200 dark:border-green-800/50">
                   <span className="material-symbols-outlined">check_circle</span>
                   <span className="text-sm font-bold">Base Draft Generation Completed Successfully.</span>
                </div>

                {/* 合规检查结果 */}
                {complianceResult && (
                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
                    <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
                      <h3 className="font-bold flex items-center gap-2 text-slate-800 dark:text-slate-200"><span className="material-symbols-outlined text-orange-500">policy</span> AI Compliance Analysis</h3>
                      <button className="text-xs font-bold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200" onClick={onClearComplianceResult}>Dismiss</button>
                    </div>
                    <div className="p-6 grid grid-cols-1 md:grid-cols-4 gap-8">
                       <div className="md:col-span-1 border-r border-slate-100 dark:border-slate-800 pr-6 flex flex-col justify-center items-center">
                           <div className={`text-6xl font-black mb-2 ${complianceResult.overallScore >= 80 ? 'text-green-500' : complianceResult.overallScore >= 60 ? 'text-orange-500' : 'text-red-500'}`}>
                             {complianceResult.overallScore}
                           </div>
                           <div className={`px-3 py-1 text-xs font-bold rounded-full uppercase tracking-widest ${complianceResult.overallScore >= 80 ? 'bg-green-100 text-green-700' : complianceResult.overallScore >= 60 ? 'bg-orange-100 text-orange-700' : 'bg-red-100 text-red-700'}`}>
                             {complianceResult.overallScore >= 80 ? 'Compliant' : complianceResult.overallScore >= 60 ? 'Warning' : 'High Risk'}
                           </div>
                           <p className="text-xs text-slate-500 mt-4 text-center">Status: {complianceResult.passed ? '✅ Passed' : '❌ Failed'}</p>
                       </div>
                       <div className="md:col-span-3 space-y-4">
                           <h4 className="text-xs font-bold text-slate-500 uppercase">Found Issues ({complianceResult.issues.length})</h4>
                           {complianceResult.issues.map((issue: any, idx: number) => (
                             <div key={idx} className="bg-slate-50 dark:bg-slate-800 p-4 rounded-xl border border-slate-200/50 dark:border-slate-700">
                               <div className="flex items-center gap-2 mb-2">
                                  <span className={`px-2 py-0.5 text-[10px] font-bold rounded uppercase ${issue.level === 'high' ? 'bg-red-100 text-red-700' : issue.level === 'medium' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'}`}>{issue.level} Risk</span>
                                  <span className="text-xs font-bold dark:text-slate-300">{issue.type}</span>
                               </div>
                               <p className="text-sm text-slate-700 dark:text-slate-300 mb-2">{issue.content}</p>
                               <p className="text-xs text-indigo-600 dark:text-indigo-400 font-medium">💡 Suggestion: {issue.suggestion}</p>
                             </div>
                           ))}
                           {complianceResult.issues.length === 0 && (
                               <div className="text-sm text-slate-500 italic">No significant compliance issues detected.</div>
                           )}
                       </div>
                    </div>
                  </div>
                )}
             </div>
          )}
        </section>

        {/* ========== Section 3: Output ========== */}
        <section className="relative pl-12 flex-1 flex flex-col mb-12">
          <div className={`absolute left-0 top-0 w-10 h-10 rounded-full flex items-center justify-center z-10 shadow-lg ${draftContent?.content ? 'bg-orange-600 text-white' : 'bg-slate-200 dark:bg-slate-800 text-slate-400'}`}>
            <span className="material-symbols-outlined">edit_square</span>
          </div>
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-bold font-headline">Output: Live Markdown Workspace</h3>
          </div>

          {!draftContent?.content ? (
             <div className="empty-state py-20 text-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl">
               <div className="empty-icon text-6xl mb-4 opacity-50">✍️</div>
               <div className="empty-title text-xl font-bold text-slate-700 dark:text-slate-300 mb-2">Editor Standby</div>
               <p className="text-slate-500">Draft content will populate here chronologically.</p>
             </div>
          ) : (
             <div className="flex flex-col lg:flex-row gap-6 mt-4 items-stretch h-full">
               {/* 主编辑器/预览舱 */}
               <div className="flex-1 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl shadow-black/[0.03] flex flex-col min-h-[600px]">
                 <div className="flex items-center justify-between p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 rounded-t-2xl">
                    <div className="flex items-center gap-4">
                       <span className="text-xs font-bold uppercase tracking-widest text-slate-500">Live Editor Preview</span>
                       <div className="flex gap-1 bg-white dark:bg-slate-800 p-0.5 rounded shadow-sm border border-slate-200 dark:border-slate-700">
                          <button onClick={() => setViewMode('rendered')} className={`px-3 py-1 text-xs font-bold rounded transition-colors ${viewMode === 'rendered' ? 'bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white' : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800'}`}>Preview</button>
                          <button onClick={() => setViewMode('source')} className={`px-3 py-1 text-xs font-bold rounded transition-colors ${viewMode === 'source' ? 'bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white' : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800'}`}>Source</button>
                       </div>
                    </div>
                    <div className="flex items-center gap-3">
                       <div className="px-3 py-1 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 text-xs font-bold rounded border border-indigo-100 dark:border-indigo-800">
                          Version {draftContent.version || 1}
                       </div>
                    </div>
                 </div>
                 
                 <div className="flex-1 p-8 overflow-y-auto bg-slate-50/30 dark:bg-slate-900/30 relative">
                     {viewMode === 'rendered' ? (
                        <div className="prose prose-sm dark:prose-invert max-w-none">
                            <MarkdownRenderer content={draftContent.content} />
                        </div>
                     ) : (
                        <pre className="w-full h-full whitespace-pre-wrap font-mono text-sm text-slate-700 dark:text-slate-300">
                           <code>{draftContent.content}</code>
                        </pre>
                     )}
                 </div>

                 {/* Export Panel Embedded at bottom of Document */}
                 <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/80 rounded-b-2xl">
                     <ExportPanel content={draftContent.content} title={task.topic} taskId={task.id} />
                 </div>
               </div>

               {/* 右侧比对与历史舱 */}
               <div className="w-full lg:w-80 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col shrink-0">
                  <div className="p-5 border-b border-slate-100 dark:border-slate-800">
                     <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
                        <span className="material-symbols-outlined text-sm">history</span> Timeline & Version Control
                     </h3>
                  </div>
                  <div className="flex-1 overflow-y-auto p-0">
                     <VersionComparePanel versions={task.versions || (task as any).draft_versions || []} currentVersion={draftContent?.version} onRollback={(versionId) => console.log('Rollback to:', versionId)} />
                  </div>
               </div>
             </div>
          )}
        </section>
      </div>

      <GlobalActionBar
        customLeftContent={
          <div className="flex items-center gap-4">
             <span className="text-sm font-medium text-slate-500">
               Status: <span className={`uppercase font-bold ${isGenerating ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-700 dark:text-slate-300'}`}>{task.status.replace('_', ' ')}</span>
             </span>
             {draftContent?.content && (
                <div className="flex items-center gap-2 text-xs font-bold text-slate-400 ml-4 border-l border-slate-200 dark:border-slate-700 pl-4">
                   <span className="material-symbols-outlined text-[16px]">cloud_done</span> Auto-Saved
                </div>
             )}
          </div>
        }
        extraActions={
          draftContent?.content ? [{
            label: checkingCompliance ? 'Auditing...' : 'Run Compliance Audit',
            onClick: onComplianceCheck,
            disabled: checkingCompliance,
            icon: 'policy',
            variant: 'secondary'
          }] : []
        }
        primaryAction={{
          label: draftContent?.content ? 'Discard & Regenerate' : 'Start Deep Draft Engine',
          onClick: onRedoWriting,
          disabled: actionLoading === 'redo-writing' ? true : false,
          loading: actionLoading === 'redo-writing' ? true : false,
          icon: draftContent?.content ? 'restart_alt' : 'play_arrow',
          variant: draftContent?.content ? 'danger' : 'primary'
        }}
      />
    </div>
  );
}
