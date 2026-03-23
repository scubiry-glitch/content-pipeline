// 任务详情 - 门户 Tab (v1.0 - Pipeline Overview Design)
// 布局逻辑: 1.内容预览 2.内容结构 3.市场情报 4.发布操作
import { useOutletContext } from 'react-router-dom';
import type { Task } from '../../types';

interface TaskContext {
  task: Task;
}

export function PortalTab() {
  const { task } = useOutletContext<TaskContext>();

  // 从 task 数据中提取大纲结构
  const outline = task.outline || {};
  const macro = outline.macro || { title: '暂无宏观主题', description: '' };
  const meso = outline.meso || [];
  const micro = outline.micro || [];

  // 获取任务状态颜色
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-100 text-green-700';
      case 'reviewing': return 'bg-amber-100 text-amber-700';
      case 'writing': return 'bg-blue-100 text-blue-700';
      case 'researching': return 'bg-purple-100 text-purple-700';
      case 'pending': return 'bg-slate-100 text-slate-700';
      default: return 'bg-slate-100 text-slate-700';
    }
  };

  // 获取状态显示文本
  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      'pending': '待开始',
      'researching': '研究中',
      'writing': '写作中',
      'reviewing': '评审中',
      'awaiting_approval': '待审批',
      'completed': '已完成',
      'failed': '失败'
    };
    return labels[status] || status;
  };

  return (
    <div className="tab-panel portal-panel animate-fade-in pb-24">
      {/* ========== Header ========== */}
      <header className="mb-8">
        <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 mb-2">
          <span className="text-xs font-bold uppercase tracking-wider text-primary dark:text-primary-light">Pipeline Portal</span>
          <span className="material-symbols-outlined text-sm">chevron_right</span>
          <span className="text-xs font-bold uppercase tracking-wider">内容发布中心</span>
        </div>
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-extrabold font-headline tracking-tight text-slate-900 dark:text-white mb-2">
              {task.topic || '内容门户'}
            </h1>
            <nav className="flex text-xs text-slate-500 dark:text-slate-400 gap-2 items-center">
              <span>{task.title || task.topic || 'Untitled'}</span>
              <span>/</span>
              <span className="font-mono bg-surface-container-high px-1.5 py-0.5 rounded">ID-{task.id?.slice(0, 8).toUpperCase() || '0000'}</span>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${getStatusColor(task.status)}`}>
                {getStatusLabel(task.status)}
              </span>
            </nav>
          </div>
          <div className="flex gap-3">
            <button 
              onClick={() => window.location.href = `/tasks/${task.id}/history`}
              className="bg-white dark:bg-slate-800 text-on-surface dark:text-white px-4 py-2 rounded-lg font-label text-sm flex items-center gap-2 border border-outline-variant hover:bg-surface-container-low transition-colors shadow-sm"
            >
              <span className="material-symbols-outlined text-lg">history</span>
              历史版本
            </button>
            <button 
              onClick={() => alert('导出功能即将上线')}
              className="bg-primary text-white px-4 py-2 rounded-lg font-label text-sm flex items-center gap-2 hover:bg-primary-dim transition-colors shadow-md"
            >
              <span className="material-symbols-outlined text-lg">download</span>
              导出报告
            </button>
          </div>
        </div>
      </header>

      {/* ========== Main Content ========== */}
      <div className="space-y-6">
        
        {/* Top: Content Preview Card */}
        <section className="bg-white dark:bg-slate-800 border border-outline-variant rounded-xl overflow-hidden shadow-sm">
          <div className="border-b border-outline-variant p-4 flex justify-between items-center bg-surface-bright dark:bg-slate-700/50">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-primary">article</span>
              <span className="font-headline font-bold text-sm text-on-surface dark:text-white">
                内容预览: {task.title || task.topic || '未命名内容'}
              </span>
            </div>
            <div className="flex gap-2">
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                task.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
              }`}>
                {task.status === 'completed' ? 'Ready' : 'In Progress'}
              </span>
            </div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3">
            <div className="lg:col-span-2 p-6 border-r border-outline-variant/30">
              <div className="aspect-[16/7] rounded-lg overflow-hidden relative mb-6 bg-gradient-to-br from-blue-100 to-purple-100 dark:from-blue-900/30 dark:to-purple-900/30 flex items-center justify-center">
                <span className="material-symbols-outlined text-6xl text-primary/30">image</span>
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 p-3">
                  <p className="text-white text-[11px]">主视觉: AI 生成的内容封面图</p>
                </div>
              </div>
              <div className="prose prose-sm max-w-none text-on-surface-variant dark:text-slate-400">
                <p className="line-clamp-3">
                  {task.outline?.macro?.description || 
                   '内容正在生成中。完成后的内容将在此处显示预览，包括核心论点、关键洞察和数据支撑。'}
                </p>
              </div>
            </div>
            <div className="p-6 space-y-4 bg-surface-container-lowest/50 dark:bg-slate-900/30">
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-white dark:bg-slate-700 border border-outline-variant/30 rounded-lg">
                  <div className="text-[9px] uppercase font-bold text-on-surface-variant mb-1">字数</div>
                  <div className="text-lg font-headline font-bold text-on-surface dark:text-white">
                    {task.word_count?.toLocaleString() || '2,450'}
                  </div>
                </div>
                <div className="p-3 bg-white dark:bg-slate-700 border border-outline-variant/30 rounded-lg">
                  <div className="text-[9px] uppercase font-bold text-on-surface-variant mb-1">SEO</div>
                  <div className="text-lg font-headline font-bold text-primary">
                    {task.evaluation?.score || '94'}/100
                  </div>
                </div>
              </div>
              <div className="space-y-2 pt-2">
                <div className="text-[10px] font-bold text-on-surface-variant uppercase">核心贡献者</div>
                <div className="flex -space-x-2">
                  <div className="w-7 h-7 rounded-full border-2 border-white dark:border-slate-800 bg-blue-100 flex items-center justify-center text-[10px] font-bold text-blue-700">AI</div>
                  <div className="w-7 h-7 rounded-full border-2 border-white dark:border-slate-800 bg-green-100 flex items-center justify-center text-[10px] font-bold text-green-700">RE</div>
                  <div className="w-7 h-7 rounded-full border-2 border-white dark:border-slate-800 bg-purple-100 flex items-center justify-center text-[10px] font-bold text-purple-700">WR</div>
                  <div className="w-7 h-7 rounded-full border-2 border-white dark:border-slate-800 bg-amber-100 flex items-center justify-center text-[10px] font-bold text-amber-700">BT</div>
                </div>
              </div>
              <button 
                onClick={() => window.location.href = `/tasks/${task.id}/edit`}
                className="w-full mt-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-dim transition-all flex items-center justify-center gap-2"
              >
                <span className="material-symbols-outlined text-sm">edit</span>
                打开编辑器
              </button>
            </div>
          </div>
        </section>

        {/* Middle: Outline & Insights */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Outline Preview (Macro, Meso, Micro) */}
          <section className="bg-white dark:bg-slate-800 border border-outline-variant rounded-xl p-6 shadow-sm">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-headline font-bold text-sm flex items-center gap-2 text-on-surface dark:text-white">
                <span className="material-symbols-outlined text-primary text-lg">account_tree</span>
                内容结构
              </h3>
              <button 
                onClick={() => window.location.href = `/tasks/${task.id}/planning`}
                className="text-xs text-primary font-medium hover:underline"
              >
                查看大纲
              </button>
            </div>
            <div className="space-y-4">
              {/* Macro */}
              <div className="p-3 bg-blue-50/50 dark:bg-blue-900/20 rounded-lg border border-blue-100 dark:border-blue-800">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[9px] font-bold bg-blue-200 dark:bg-blue-700 text-blue-800 dark:text-blue-200 px-1.5 py-0.5 rounded">宏观</span>
                  <span className="text-xs font-bold text-on-surface dark:text-white">{macro.title}</span>
                </div>
                <p className="text-[10px] text-on-surface-variant dark:text-slate-400">
                  {macro.description || '宏观主题描述'}
                </p>
              </div>
              
              {/* Meso */}
              {meso.length > 0 ? (
                meso.slice(0, 2).map((item: any, idx: number) => (
                  <div key={idx} className="pl-4 border-l-2 border-outline-variant dark:border-slate-700 space-y-3">
                    <div className="p-3 bg-surface-container-low dark:bg-slate-700/50 rounded-lg border border-outline-variant/30">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[9px] font-bold bg-gray-200 dark:bg-slate-600 text-gray-700 dark:text-gray-300 px-1.5 py-0.5 rounded">中观</span>
                        <span className="text-xs font-semibold text-on-surface dark:text-white">{item.title || `中观层级 ${idx + 1}`}</span>
                      </div>
                      {item.points && (
                        <div className="pl-4 mt-2 space-y-1">
                          {item.points.slice(0, 2).map((point: string, pidx: number) => (
                            <div key={pidx} className="flex items-center gap-2 text-[10px] text-on-surface-variant dark:text-slate-400">
                              <span className="w-1 h-1 rounded-full bg-primary"></span>
                              <span className="truncate">{point}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div className="pl-4 border-l-2 border-outline-variant dark:border-slate-700">
                  <div className="p-3 bg-surface-container-low dark:bg-slate-700/50 rounded-lg border border-outline-variant/30">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[9px] font-bold bg-gray-200 dark:bg-slate-600 text-gray-700 dark:text-gray-300 px-1.5 py-0.5 rounded">中观</span>
                      <span className="text-xs font-semibold text-on-surface dark:text-white">中观层级示例</span>
                    </div>
                    <div className="pl-4 mt-2 space-y-1">
                      <div className="flex items-center gap-2 text-[10px] text-on-surface-variant dark:text-slate-400">
                        <span className="w-1 h-1 rounded-full bg-primary"></span>
                        <span>子主题分析</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              
              {/* Micro */}
              {micro.length > 0 ? (
                micro.slice(0, 1).map((item: any, idx: number) => (
                  <div key={idx} className="pl-8 border-l-2 border-outline-variant/30 dark:border-slate-700/50">
                    <div className="p-3 bg-surface-container-lowest dark:bg-slate-800/50 border border-outline-variant/30 rounded-lg">
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] font-bold bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-gray-400 px-1.5 py-0.5 rounded">微观</span>
                        <span className="text-xs font-medium italic text-on-surface dark:text-white">{item.title || '微观细节'}</span>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="pl-8 border-l-2 border-outline-variant/30 dark:border-slate-700/50">
                  <div className="p-3 bg-surface-container-lowest dark:bg-slate-800/50 border border-outline-variant/30 rounded-lg">
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] font-bold bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-gray-400 px-1.5 py-0.5 rounded">微观</span>
                      <span className="text-xs font-medium italic text-on-surface dark:text-white">具体案例或数据点</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Market Intelligence Insights */}
          <section className="bg-white dark:bg-slate-800 border border-outline-variant rounded-xl p-6 shadow-sm">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-headline font-bold text-sm flex items-center gap-2 text-on-surface dark:text-white">
                <span className="material-symbols-outlined text-tertiary text-lg">query_stats</span>
                市场情报洞察
              </h3>
              <span className="text-[10px] text-on-surface-variant dark:text-slate-400">来源: 深度研究</span>
            </div>
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <div className="text-[10px] uppercase font-bold text-on-surface-variant dark:text-slate-400">研究深度</div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold font-headline text-green-600 dark:text-green-400">
                      {task.research_data?.sources?.length || 14}
                    </span>
                    <span className="material-symbols-outlined text-green-600 dark:text-green-400 text-sm">source</span>
                  </div>
                  <span className="text-[10px] text-on-surface-variant">个数据来源</span>
                </div>
                <div className="space-y-1">
                  <div className="text-[10px] uppercase font-bold text-on-surface-variant dark:text-slate-400">内容质量</div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold font-headline text-primary">
                      {task.evaluation?.score >= 80 ? '优秀' : task.evaluation?.score >= 60 ? '良好' : '一般'}
                    </span>
                    <span className="text-xs font-medium text-on-surface-variant dark:text-slate-400">
                      ({task.evaluation?.score || '--'}/100)
                    </span>
                  </div>
                </div>
              </div>
              
              <div className="p-4 bg-surface-container-low dark:bg-slate-700/30 rounded-xl border border-outline-variant/30">
                <h4 className="text-xs font-bold text-on-surface dark:text-white mb-3">核心研究洞察</h4>
                <ul className="space-y-3">
                  {task.research_data?.insights?.slice(0, 2).map((insight: string, idx: number) => (
                    <li key={idx} className="flex gap-3 items-start">
                      <span className="material-symbols-outlined text-primary text-sm mt-0.5">auto_awesome</span>
                      <p className="text-[11px] text-on-surface-variant dark:text-slate-400 leading-relaxed">
                        <span className="font-bold text-on-surface dark:text-white">洞察 {idx + 1}:</span> {insight}
                      </p>
                    </li>
                  )) || (
                    <>
                      <li className="flex gap-3 items-start">
                        <span className="material-symbols-outlined text-primary text-sm mt-0.5">auto_awesome</span>
                        <p className="text-[11px] text-on-surface-variant dark:text-slate-400 leading-relaxed">
                          <span className="font-bold text-on-surface dark:text-white">数据驱动:</span> 
                          基于多源数据的深度分析，确保内容的准确性和时效性。
                        </p>
                      </li>
                      <li className="flex gap-3 items-start">
                        <span className="material-symbols-outlined text-primary text-sm mt-0.5">auto_awesome</span>
                        <p className="text-[11px] text-on-surface-variant dark:text-slate-400 leading-relaxed">
                          <span className="font-bold text-on-surface dark:text-white">质量保障:</span> 
                          通过多轮 AI 评审和人工确认，确保输出内容的专业性。
                        </p>
                      </li>
                    </>
                  )}
                </ul>
              </div>
              
              <div className="flex items-center justify-between pt-2">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-sm text-on-surface-variant dark:text-slate-400">hub</span>
                  <span className="text-[10px] text-on-surface-variant dark:text-slate-400 font-medium">
                    已验证 {task.research_data?.sources?.length || 14} 个来源
                  </span>
                </div>
                <button 
                  onClick={() => window.location.href = `/tasks/${task.id}/research`}
                  className="text-[10px] bg-secondary-container dark:bg-slate-700 text-on-secondary-container dark:text-slate-300 px-2 py-1 rounded font-bold hover:bg-secondary-dim hover:text-white transition-colors"
                >
                  探索研究数据
                </button>
              </div>
            </div>
          </section>
        </div>

        {/* Pipeline Progress */}
        <section className="bg-white dark:bg-slate-800 border border-outline-variant rounded-xl p-6 shadow-sm">
          <div className="flex justify-between items-center mb-6">
            <h3 className="font-headline font-bold text-sm flex items-center gap-2 text-on-surface dark:text-white">
              <span className="material-symbols-outlined text-primary text-lg">view_timeline</span>
              流水线进度
            </h3>
            <span className="text-[10px] text-on-surface-variant dark:text-slate-400">
              当前: {getStatusLabel(task.status)}
            </span>
          </div>
          
          <div className="relative">
            {/* Progress Line */}
            <div className="absolute left-4 top-4 bottom-4 w-0.5 bg-gradient-to-b from-primary via-primary to-slate-200 dark:to-slate-700"></div>
            
            <div className="space-y-6 relative">
              {[
                { id: 'planning', label: '选题策划', icon: 'lightbulb', desc: '大纲定义完成', done: true },
                { id: 'research', label: '深度研究', icon: 'search', desc: `研究完成 (${task.research_data?.sources?.length || 14} 个来源)`, done: true },
                { id: 'writing', label: '文稿生成', icon: 'edit_note', desc: 'AI 初稿已完成', done: task.status !== 'researching' && task.status !== 'pending' },
                { id: 'reviews', label: '蓝军评审', icon: 'fact_check', desc: '多轮评审完成', done: task.status === 'completed' || task.status === 'reviewing' || task.status === 'awaiting_approval' },
                { id: 'publishing', label: '发布就绪', icon: 'publish', desc: '等待最终发布', done: task.status === 'completed' }
              ].map((step, idx) => (
                <div key={step.id} className="flex gap-4 items-start relative">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 z-10 ${
                    step.done 
                      ? 'bg-primary text-white' 
                      : task.status === step.id 
                        ? 'bg-primary-container text-primary ring-4 ring-primary/20'
                        : 'bg-slate-200 dark:bg-slate-700 text-slate-400'
                  }`}>
                    <span className="material-symbols-outlined text-[14px]">
                      {step.done ? 'check' : step.icon}
                    </span>
                  </div>
                  <div className="flex-1">
                    <h4 className={`font-headline font-bold text-sm ${
                      step.done || task.status === step.id ? 'text-on-surface dark:text-white' : 'text-slate-400'
                    }`}>
                      {step.label}
                    </h4>
                    <p className="text-[11px] text-on-surface-variant dark:text-slate-400">{step.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Version History */}
        {task.versions && task.versions.length > 0 && (
          <section className="bg-white dark:bg-slate-800 border border-outline-variant rounded-xl p-6 shadow-sm">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-headline font-bold text-sm flex items-center gap-2 text-on-surface dark:text-white">
                <span className="material-symbols-outlined text-primary text-lg">history</span>
                版本历史
              </h3>
            </div>
            <div className="space-y-3">
              {task.versions.slice(-3).reverse().map((version: any, idx: number) => (
                <div 
                  key={version.id || idx} 
                  className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                    idx === 0 
                      ? 'bg-surface-container-low dark:bg-slate-700/50 border-outline-variant/30' 
                      : 'border-transparent hover:bg-surface-container-low dark:hover:bg-slate-700/30'
                  }`}
                >
                  <div className="flex justify-between items-start mb-1">
                    <span className={`text-xs font-bold ${idx === 0 ? 'text-on-surface dark:text-white' : 'text-on-surface dark:text-white'}`}>
                      v{version.version || idx + 1} {idx === 0 && '(当前)'}
                    </span>
                    <span className="text-[10px] text-on-surface-variant dark:text-slate-400">
                      {new Date(version.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-[10px] text-on-surface-variant dark:text-slate-400">
                    {version.comment || '版本更新'}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      {/* ========== Bottom Action Bar ========== */}
      <div className="fixed bottom-0 left-[256px] right-0 h-20 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 z-40 flex items-center justify-center px-8 shadow-[0_-4px_20px_-10px_rgba(0,0,0,0.1)]">
        <div className="max-w-5xl w-full flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${task.status === 'completed' ? 'bg-green-500' : 'bg-primary animate-pulse'}`}></span>
              <span className="text-xs font-bold text-on-surface-variant dark:text-slate-400 uppercase tracking-wide">
                {task.status === 'completed' ? '已准备就绪，可发布到内容中心' : '流水线处理中...'}
              </span>
            </div>
          </div>
          
          <div className="flex gap-3">
            <button 
              onClick={() => window.location.reload()}
              className="px-6 py-2.5 rounded-lg font-label text-sm text-on-surface-variant dark:text-slate-400 hover:bg-surface-container-low dark:hover:bg-slate-800 border border-transparent transition-colors flex items-center gap-2"
            >
              <span className="material-symbols-outlined text-lg">replay</span>
              刷新状态
            </button>
            <button 
              onClick={() => alert('发布功能即将上线')}
              disabled={task.status !== 'completed'}
              className={`px-8 py-2.5 rounded-lg font-label text-sm shadow-lg transition-all active:scale-95 flex items-center gap-2 ${
                task.status === 'completed'
                  ? 'bg-inverse-surface dark:bg-white text-white dark:text-slate-900 hover:bg-black dark:hover:bg-slate-200'
                  : 'bg-slate-200 dark:bg-slate-700 text-slate-400 cursor-not-allowed'
              }`}
            >
              <span className="material-symbols-outlined text-lg">publish</span>
              发布最终版本
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
