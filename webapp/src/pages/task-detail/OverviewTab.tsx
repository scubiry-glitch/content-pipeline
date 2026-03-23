// 任务详情 - 概览 Tab (v5.0 - Material Design 3)
// 布局逻辑: 1.输入 2.加工 3.输出 4.辅助工具
import { useOutletContext, Link } from 'react-router-dom';
import type { Task } from '../../types';

interface TaskContext {
  task: Task;
  workflowRules: any[];
  latestOutput: any;
  actionLoading: string | null;
  onConfirmOutline: () => void;
  onRedoStage: (stage: 'planning' | 'research' | 'writing' | 'review') => void;
}

export function OverviewTab() {
  const { task, workflowRules, latestOutput, actionLoading, onConfirmOutline, onRedoStage } = useOutletContext<TaskContext>();

  const getStageLabel = (stage: string) => {
    const labels: Record<string, string> = {
      pending: '待处理',
      planning: '选题策划',
      researching: '深度研究',
      writing: '文稿生成',
      reviewing: '蓝军评审',
      awaiting_approval: '待审核',
      completed: '已完成',
      failed: '已失败'
    };
    return labels[stage] || stage;
  };

  const getStageProgress = (status: string) => {
    const stageMap: Record<string, number> = {
      pending: 0,
      planning: 25,
      researching: 50,
      writing: 75,
      reviewing: 90,
      awaiting_approval: 95,
      completed: 100
    };
    return stageMap[status] || 0;
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      pending: 'bg-slate-100 text-slate-600',
      planning: 'bg-blue-100 text-blue-700',
      researching: 'bg-indigo-100 text-indigo-700',
      writing: 'bg-purple-100 text-purple-700',
      reviewing: 'bg-amber-100 text-amber-700',
      awaiting_approval: 'bg-orange-100 text-orange-700',
      completed: 'bg-green-100 text-green-700',
      failed: 'bg-red-100 text-red-700'
    };
    return colors[status] || 'bg-slate-100 text-slate-600';
  };

  const getStatusIcon = (status: string) => {
    const icons: Record<string, string> = {
      pending: 'hourglass_empty',
      planning: 'lightbulb',
      researching: 'search',
      writing: 'edit_note',
      reviewing: 'fact_check',
      awaiting_approval: 'pending_actions',
      completed: 'check_circle',
      failed: 'error'
    };
    return icons[status] || 'help';
  };

  const progress = getStageProgress(task.status);
  const stages = [
    { id: 'pending', label: '待处理', icon: 'hourglass_empty' },
    { id: 'planning', label: '选题策划', icon: 'lightbulb' },
    { id: 'researching', label: '深度研究', icon: 'search' },
    { id: 'writing', label: '文稿生成', icon: 'edit_note' },
    { id: 'reviewing', label: '蓝军评审', icon: 'fact_check' },
    { id: 'completed', label: '已完成', icon: 'check_circle' }
  ];

  const isProcessing = ['planning', 'researching', 'writing', 'reviewing'].includes(task.status);

  return (
    <div className="tab-panel overview-panel animate-fade-in pb-32">
      {/* ========== Header ========== */}
      <header className="mb-12">
        <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 mb-2">
          <span className="text-xs font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">Task Overview</span>
          <span className="material-symbols-outlined text-sm">chevron_right</span>
          <span className="text-xs font-bold uppercase tracking-wider">Production Dashboard</span>
        </div>
        <div className="flex justify-between items-end">
          <div>
            <h1 className="text-4xl font-extrabold font-headline tracking-tight text-slate-900 dark:text-white mb-2">Task Overview</h1>
            <p className="text-slate-500 dark:text-slate-400 max-w-2xl">Comprehensive view of task progress, outline preview, and production status.</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <span className="text-3xl font-black text-slate-900 dark:text-white">{progress}%</span>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Progress</p>
            </div>
            <div className={`w-12 h-12 rounded-full flex items-center justify-center ${getStatusColor(task.status)}`}>
              <span className="material-symbols-outlined text-2xl">{getStatusIcon(task.status)}</span>
            </div>
          </div>
        </div>
      </header>

      {/* ========== Stepper Container ========== */}
      <div className="space-y-16">
        
        {/* ========== Section 1: Input ========== */}
        <section className="relative step-line step-line-active pl-12">
          <div className="absolute left-0 top-0 w-10 h-10 bg-blue-600 text-white rounded-full flex items-center justify-center z-10 shadow-lg">
            <span className="material-symbols-outlined">input</span>
          </div>
          <div className="flex items-baseline justify-between mb-6">
            <h3 className="text-xl font-bold font-headline">Input: Task Configuration</h3>
            <span className="px-3 py-1 bg-blue-100 text-blue-700 text-xs font-bold rounded-full">
              ID: {task.id.slice(-8).toUpperCase()}
            </span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Task Info Card */}
            <div className="bg-surface-container-lowest p-6 rounded-2xl border border-outline-variant/30 shadow-sm">
              <div className="flex items-center justify-between mb-6">
                <h4 className="font-bold text-lg text-on-surface flex items-center gap-2">
                  <span className="material-symbols-outlined text-blue-500">info</span>
                  Basic Information
                </h4>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between p-3 bg-surface-container-low rounded-xl">
                  <span className="text-sm text-slate-500">Current Stage</span>
                  <span className={`px-3 py-1 text-xs font-bold rounded-full ${getStatusColor(task.status)}`}>
                    {getStageLabel(task.status)}
                  </span>
                </div>
                <div className="flex items-center justify-between p-3 bg-surface-container-low rounded-xl">
                  <span className="text-sm text-slate-500">Progress</span>
                  <div className="flex items-center gap-2">
                    <div className="w-24 h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-blue-500 rounded-full transition-all duration-500" 
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <span className="text-sm font-bold text-slate-700 dark:text-slate-300">{progress}%</span>
                  </div>
                </div>
                <div className="flex items-center justify-between p-3 bg-surface-container-low rounded-xl">
                  <span className="text-sm text-slate-500">Created</span>
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    {new Date(task.created_at).toLocaleString()}
                  </span>
                </div>
                <div className="flex items-center justify-between p-3 bg-surface-container-low rounded-xl">
                  <span className="text-sm text-slate-500">Topic</span>
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300 text-right max-w-[200px] truncate">
                    {task.topic}
                  </span>
                </div>
              </div>
            </div>

            {/* Production Pipeline Card */}
            <div className="bg-surface-container-lowest p-6 rounded-2xl border border-outline-variant/30 shadow-sm">
              <div className="flex items-center justify-between mb-6">
                <h4 className="font-bold text-lg text-on-surface flex items-center gap-2">
                  <span className="material-symbols-outlined text-indigo-500">route</span>
                  Production Pipeline
                </h4>
              </div>

              <div className="relative">
                {/* Progress Bar Background */}
                <div className="absolute left-0 right-0 top-[19px] h-1 bg-slate-100 dark:bg-slate-800 rounded-full">
                  <div 
                    className="h-full bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 rounded-full transition-all duration-700"
                    style={{ width: `${progress}%` }}
                  />
                </div>

                {/* Stage Steps */}
                <div className="relative flex justify-between">
                  {stages.map((stage, index) => {
                    const stepProgress = (index / (stages.length - 1)) * 100;
                    const isActive = progress >= stepProgress;
                    const isCurrent = task.status === stage.id;
                    
                    return (
                      <div key={stage.id} className="flex flex-col items-center gap-2">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center z-10 transition-all ${
                          isCurrent 
                            ? 'bg-blue-600 text-white shadow-lg scale-110' 
                            : isActive 
                              ? 'bg-blue-500 text-white' 
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-400'
                        }`}>
                          <span className="material-symbols-outlined text-lg">{stage.icon}</span>
                        </div>
                        <span className={`text-[10px] font-bold uppercase tracking-wider ${
                          isCurrent ? 'text-blue-600' : isActive ? 'text-slate-600' : 'text-slate-400'
                        }`}>
                          {stage.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Active Stage Info */}
              <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-100 dark:border-blue-800">
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-blue-600 animate-pulse">autorenew</span>
                  <div>
                    <span className="text-xs font-bold text-blue-600 uppercase tracking-wider">Active Stage</span>
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                      {getStageLabel(task.status)} • {task.progress}% complete
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ========== Section 2: Process ========== */}
        {isProcessing && (
          <section className="relative step-line step-line-active pl-12">
            <div className="absolute left-0 top-0 w-10 h-10 bg-indigo-600 text-white rounded-full flex items-center justify-center z-10 shadow-lg">
              <span className="material-symbols-outlined">psychology</span>
            </div>
            <div className="flex items-baseline justify-between mb-6">
              <h3 className="text-xl font-bold font-headline">Process: AI Production</h3>
              <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                {task.current_stage || 'Processing...'}
              </span>
            </div>

            <div className="bg-surface-container-lowest p-6 rounded-2xl border border-outline-variant/30 shadow-sm">
              <div className="flex items-center gap-6">
                <div className="relative w-20 h-20">
                  <div className="absolute inset-0 rounded-full border-4 border-slate-100 dark:border-slate-800"></div>
                  <div 
                    className="absolute inset-0 rounded-full border-4 border-indigo-500 border-t-transparent animate-spin"
                    style={{ transform: 'rotate(45deg)' }}
                  ></div>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-2xl font-black text-indigo-600">{task.progress}</span>
                  </div>
                </div>
                <div className="flex-1">
                  <h4 className="font-bold text-lg text-on-surface mb-2">
                    {task.current_stage?.replace(/_/g, ' ') || 'Processing'}
                  </h4>
                  <div className="w-full h-3 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden mb-3">
                    <div 
                      className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-700"
                      style={{ width: `${task.progress}%` }}
                    />
                  </div>
                  <p className="text-sm text-slate-500">
                    AI is actively processing your content. Please wait while we generate high-quality output.
                  </p>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ========== Section 3: Output ========== */}
        <section className="relative pl-12">
          <div className={`absolute left-0 top-0 w-10 h-10 rounded-full flex items-center justify-center z-10 shadow-lg ${
            task.outline || latestOutput ? 'bg-purple-600 text-white' : 'bg-slate-200 dark:bg-slate-800 text-slate-400'
          }`}>
            <span className="material-symbols-outlined">output</span>
          </div>
          <div className="flex items-baseline justify-between mb-6">
            <h3 className="text-xl font-bold font-headline">Output: Content Assets</h3>
            <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">
              {task.outline ? 'Assets Available' : 'No Output Yet'}
            </span>
          </div>

          <div className="space-y-6">
            {/* Outline Preview Card */}
            <div className="bg-surface-container-lowest p-6 rounded-2xl border border-outline-variant/30 shadow-sm">
              <div className="flex items-center justify-between mb-6">
                <h4 className="font-bold text-lg text-on-surface flex items-center gap-2">
                  <span className="material-symbols-outlined text-tertiary">description</span>
                  Outline Preview
                </h4>
                {task.outline && (
                  <Link 
                    to={`/tasks/${task.id}/planning`}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                  >
                    View Full <span className="material-symbols-outlined text-sm">arrow_forward</span>
                  </Link>
                )}
              </div>

              {task.outline?.sections && task.outline.sections.length > 0 ? (
                <div className="space-y-4">
                  {task.outline.sections.slice(0, 3).map((section: any, idx: number) => (
                    <div key={idx} className="p-4 bg-surface-container-low rounded-xl border-l-4 border-tertiary">
                      <h5 className="font-bold text-sm text-on-surface mb-2">
                        {idx + 1}. {section.title}
                      </h5>
                      {section.key_points && section.key_points.length > 0 && (
                        <ul className="space-y-1">
                          {section.key_points.slice(0, 2).map((point: string, pidx: number) => (
                            <li key={pidx} className="text-xs text-slate-500 flex items-start gap-2">
                              <span className="text-tertiary">•</span>
                              {point}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                  {task.outline.sections.length > 3 && (
                    <div className="text-center py-2">
                      <span className="text-xs text-slate-400">
                        + {task.outline.sections.length - 3} more sections
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="py-12 text-center">
                  <span className="material-symbols-outlined text-5xl text-slate-300 mb-4">description</span>
                  <h5 className="text-lg font-bold text-slate-700 dark:text-slate-300 mb-2">No Outline Generated</h5>
                  <p className="text-sm text-slate-500 max-w-sm mx-auto">
                    The outline will be generated during the Topic Planning stage.
                  </p>
                </div>
              )}
            </div>

            {/* Latest Draft Preview Card */}
            {latestOutput && (
              <div className="bg-surface-container-lowest p-6 rounded-2xl border border-outline-variant/30 shadow-sm">
                <div className="flex items-center justify-between mb-6">
                  <h4 className="font-bold text-lg text-on-surface flex items-center gap-2">
                    <span className="material-symbols-outlined text-green-500">article</span>
                    Latest Draft Preview
                    {latestOutput.version && (
                      <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs font-bold rounded">
                        v{latestOutput.version}
                      </span>
                    )}
                  </h4>
                  <Link 
                    to={`/tasks/${task.id}/writing`}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                  >
                    Open Editor <span className="material-symbols-outlined text-sm">arrow_forward</span>
                  </Link>
                </div>

                <div className="relative">
                  <div className="bg-surface-container-low p-5 rounded-xl max-h-64 overflow-hidden">
                    <div className="text-sm text-on-surface leading-relaxed whitespace-pre-line">
                      {latestOutput.content.length > 600 
                        ? `${latestOutput.content.substring(0, 600)}...` 
                        : latestOutput.content}
                    </div>
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-surface-container-lowest to-transparent rounded-b-xl"></div>
                </div>
              </div>
            )}

            {/* Workflow Rules */}
            {workflowRules.length > 0 && (
              <div className="bg-surface-container-lowest p-6 rounded-2xl border border-outline-variant/30 shadow-sm">
                <h4 className="font-bold text-lg text-on-surface mb-4 flex items-center gap-2">
                  <span className="material-symbols-outlined text-amber-500">rule</span>
                  Active Workflow Rules ({workflowRules.filter((r: any) => r.isEnabled).length})
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {workflowRules.filter((r: any) => r.isEnabled).slice(0, 4).map((rule: any) => (
                    <div key={rule.id} className="p-3 bg-surface-container-low rounded-xl">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-on-surface">{rule.name}</span>
                        <span className={`px-2 py-0.5 text-[10px] font-bold rounded ${
                          rule.actionType === 'block_and_notify' ? 'bg-red-100 text-red-700' :
                          rule.actionType === 'notify' ? 'bg-blue-100 text-blue-700' :
                          'bg-slate-100 text-slate-700'
                        }`}>
                          {rule.actionType}
                        </span>
                      </div>
                      {rule.description && (
                        <p className="text-xs text-slate-500">{rule.description}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* ========== Section 4: Tools ========== */}
        <section className="relative pl-12">
          <div className="absolute left-0 top-0 w-10 h-10 bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-full flex items-center justify-center z-10 shadow-lg">
            <span className="material-symbols-outlined">build</span>
          </div>
          <h3 className="text-xl font-bold font-headline mb-6">Quick Actions</h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Confirm Outline Button */}
            {(task.status === 'planning' || (task as any).status === 'outline_pending') && (
              <button 
                onClick={onConfirmOutline}
                disabled={actionLoading === 'confirm-outline'}
                className="flex items-center gap-4 p-5 bg-surface-container-lowest rounded-2xl border border-blue-200 hover:shadow-lg hover:border-blue-300 transition-all text-left group disabled:opacity-50"
              >
                <div className="w-12 h-12 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <span className="material-symbols-outlined text-2xl">play_arrow</span>
                </div>
                <div>
                  <h4 className="font-bold text-on-surface">
                    {actionLoading === 'confirm-outline' ? 'Processing...' : 'Confirm Outline'}
                  </h4>
                  <p className="text-xs text-slate-500 mt-1">Proceed to research stage</p>
                </div>
              </button>
            )}

            {/* Redo Planning Button */}
            <button 
              onClick={() => onRedoStage('planning')}
              disabled={actionLoading === 'redo-planning'}
              className="flex items-center gap-4 p-5 bg-surface-container-lowest rounded-2xl border border-outline-variant/30 hover:shadow-md transition-all text-left group disabled:opacity-50"
            >
              <div className="w-12 h-12 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center group-hover:scale-110 transition-transform">
                <span className="material-symbols-outlined text-2xl">refresh</span>
              </div>
              <div>
                <h4 className="font-bold text-on-surface">
                  {actionLoading === 'redo-planning' ? 'Restarting...' : 'Redo Planning'}
                </h4>
                <p className="text-xs text-slate-500 mt-1">Regenerate topic and outline</p>
              </div>
            </button>

            {/* Redo Research Button */}
            <button 
              onClick={() => onRedoStage('research')}
              disabled={actionLoading === 'redo-research'}
              className="flex items-center gap-4 p-5 bg-surface-container-lowest rounded-2xl border border-outline-variant/30 hover:shadow-md transition-all text-left group disabled:opacity-50"
            >
              <div className="w-12 h-12 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center group-hover:scale-110 transition-transform">
                <span className="material-symbols-outlined text-2xl">search</span>
              </div>
              <div>
                <h4 className="font-bold text-on-surface">
                  {actionLoading === 'redo-research' ? 'Restarting...' : 'Redo Research'}
                </h4>
                <p className="text-xs text-slate-500 mt-1">Recollect research data</p>
              </div>
            </button>

            {/* Redo Writing Button */}
            <button 
              onClick={() => onRedoStage('writing')}
              disabled={actionLoading === 'redo-writing'}
              className="flex items-center gap-4 p-5 bg-surface-container-lowest rounded-2xl border border-outline-variant/30 hover:shadow-md transition-all text-left group disabled:opacity-50"
            >
              <div className="w-12 h-12 rounded-xl bg-purple-100 text-purple-600 flex items-center justify-center group-hover:scale-110 transition-transform">
                <span className="material-symbols-outlined text-2xl">edit_note</span>
              </div>
              <div>
                <h4 className="font-bold text-on-surface">
                  {actionLoading === 'redo-writing' ? 'Restarting...' : 'Redo Writing'}
                </h4>
                <p className="text-xs text-slate-500 mt-1">Regenerate draft content</p>
              </div>
            </button>

            {/* Navigation Links */}
            <Link 
              to={`/tasks/${task.id}/planning`}
              className="flex items-center gap-4 p-5 bg-surface-container-lowest rounded-2xl border border-outline-variant/30 hover:shadow-md transition-all text-left group"
            >
              <div className="w-12 h-12 rounded-xl bg-green-100 text-green-600 flex items-center justify-center group-hover:scale-110 transition-transform">
                <span className="material-symbols-outlined text-2xl">lightbulb</span>
              </div>
              <div className="flex-1">
                <h4 className="font-bold text-on-surface">Go to Planning</h4>
                <p className="text-xs text-slate-500 mt-1">Edit outline and topic</p>
              </div>
              <span className="material-symbols-outlined text-slate-400">arrow_forward</span>
            </Link>

            <Link 
              to={`/tasks/${task.id}/research`}
              className="flex items-center gap-4 p-5 bg-surface-container-lowest rounded-2xl border border-outline-variant/30 hover:shadow-md transition-all text-left group"
            >
              <div className="w-12 h-12 rounded-xl bg-cyan-100 text-cyan-600 flex items-center justify-center group-hover:scale-110 transition-transform">
                <span className="material-symbols-outlined text-2xl">travel_explore</span>
              </div>
              <div className="flex-1">
                <h4 className="font-bold text-on-surface">Go to Research</h4>
                <p className="text-xs text-slate-500 mt-1">View collected data</p>
              </div>
              <span className="material-symbols-outlined text-slate-400">arrow_forward</span>
            </Link>
          </div>
        </section>
      </div>

      {/* ========== Bottom Global Action Bar ========== */}
      <div className="fixed bottom-0 left-[256px] right-0 h-20 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 z-40 flex items-center justify-center px-8 shadow-[0_-4px_20px_-10px_rgba(0,0,0,0.1)]">
        <div className="max-w-5xl w-full flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium text-slate-500">
              Stage: <span className="uppercase font-bold text-slate-700 dark:text-slate-300">{task.status.replace('_', ' ')}</span>
            </span>
            <span className="text-sm text-slate-400">|</span>
            <span className="text-sm font-medium text-slate-500">
              Progress: <span className="font-bold text-blue-600">{progress}%</span>
            </span>
          </div>
          
          <div className="flex items-center gap-4">
            {(task.status === 'planning' || (task as any).status === 'outline_pending') && (
              <button 
                className="px-6 py-2.5 bg-blue-600 text-white font-bold text-sm rounded-lg shadow-md hover:bg-blue-700 transition-all flex items-center gap-2 disabled:opacity-50"
                onClick={onConfirmOutline}
                disabled={actionLoading === 'confirm-outline'}
              >
                <span className="material-symbols-outlined text-lg">play_arrow</span>
                {actionLoading === 'confirm-outline' ? 'Processing...' : 'Confirm & Proceed'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
