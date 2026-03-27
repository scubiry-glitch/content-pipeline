// 任务详情 - 文稿生成 Tab (v5.0 - 流式分段设计整合版)
import { useEffect, useState } from 'react';

// Tab 类型
type EditorTab = 'preview' | 'export';
type AssetTab = 'outline' | 'insights' | 'assets' | null;
type SidebarView = 'timeline' | 'compare';

// Tab 按钮组件
function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: string; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-md transition-all ${
        active 
          ? 'bg-primary text-on-primary' 
          : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'
      }`}
    >
      <span className="material-symbols-outlined text-sm">{icon}</span>
      {label}
    </button>
  );
}
import { useOutletContext } from 'react-router-dom';
import { ExportPanel } from '../../components/ExportPanel';
import { DraftGenerationProgress } from '../../components/DraftGenerationProgress';
import { LivePreviewMarkdown, VersionTimeline } from '../../components/content';
import { VersionComparePanel } from '../../components/VersionComparePanel';
import { blueTeamApi, tasksApi } from '../../api/client';
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
  
  // 编辑器 Tab 状态
  const [editorTab, setEditorTab] = useState<EditorTab>('preview');
  const [expandedAsset, setExpandedAsset] = useState<AssetTab>(null);
  const [sidebarView, setSidebarView] = useState<SidebarView>('timeline');
  const [compareVersions, setCompareVersions] = useState<[number, number] | undefined>(undefined);
  const [checkpointVersions, setCheckpointVersions] = useState<any[]>([]);
  
  const isGenerating = task.status === 'writing' || task.current_stage === 'generating_draft';
  useEffect(() => {
    let active = true;
    if (!task?.id) return;

    tasksApi.getRevisionTimeline(task.id)
      .then((timeline) => {
        if (!active) return;
        const items = (timeline.items || []).map((item, idx) => ({
          id: `timeline-${item.id}`,
          // 用高位版本号确保轨迹项置顶，同时不与正式版本冲突
          version: 2000000 - idx,
          display_version: item.type === 'batch_revision' ? 'BR' : 'CP',
          created_at: item.createdAt,
          change_summary: item.changeSummary,
          created_by: 'revision-agent',
          is_transient: true,
        }));
        setCheckpointVersions(items);
      })
      .catch(() => {
        // 兼容未发布新接口的后端：回退到 apply-revisions-status
        blueTeamApi.getApplyRevisionsStatus(task.id).then((status) => {
          if (!active) return;
          if (status.status !== 'doing') {
            setCheckpointVersions([]);
            return;
          }
          const progressText = typeof status.progress === 'number' ? `${status.progress}%` : '';
          const sectionText = status.totalSections
            ? `，章节 ${status.sectionIndex || 0}/${status.totalSections}`
            : '';
          setCheckpointVersions([{
            id: `checkpoint-${task.id}`,
            version: 1000000,
            display_version: 'CP',
            created_at: status.lastHeartbeatAt || status.startedAt || new Date().toISOString(),
            change_summary: `改稿进行中 ${progressText}${sectionText}：${status.message || '处理中'}`,
            created_by: 'revision-agent',
            is_transient: true,
          }]);
        }).catch(() => {
          if (!active) return;
          setCheckpointVersions([]);
        });
      });

    return () => {
      active = false;
    };
  }, [task?.id, task?.updated_at]);

  // 规范化版本数据，确保字段与 VersionTimeline 组件兼容
  const rawVersions = task.versions || (task as any).draft_versions || [];
  const normalizedFormalVersions = rawVersions
    .map((v: any) => ({
      ...v,
      created_at: v.created_at || v.createdAt || new Date().toISOString(),
      change_summary: v.change_summary || v.changeSummary || (v.expert_role ? `${v.expert_role} 修订 (R${v.round || 0})` : ''),
    }));

  // 保留所有版本记录（不再按 version 去重），重复版本号使用子版本展示
  const formalVersions = (() => {
    const byVersion = new Map<number, any[]>();
    normalizedFormalVersions.forEach((v: any) => {
      const key = Number(v.version || 0);
      if (!byVersion.has(key)) byVersion.set(key, []);
      byVersion.get(key)!.push(v);
    });

    const result: any[] = [];
    byVersion.forEach((list, majorVersion) => {
      const sorted = [...list].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
      if (sorted.length === 1) {
        result.push({
          ...sorted[0],
          display_version: `v${majorVersion}`,
        });
        return;
      }
      sorted.forEach((item, idx) => {
        result.push({
          ...item,
          display_version: `v${majorVersion}.${idx + 1}`,
        });
      });
    });

    return result;
  })();

  const versions = [...checkpointVersions, ...formalVersions];

  return (
    <div className="flex-1 flex flex-col gap-4 p-6 overflow-y-auto animate-fade-in pb-32">
      {/* 1. Input Section: Drafting Configuration */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4 shrink-0">
        <div className="md:col-span-2 bg-surface-container-lowest p-5 rounded-lg border border-outline-variant/50 shadow-sm">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-sm font-bold flex items-center gap-2 text-on-surface">
              <span className="material-symbols-outlined text-primary text-lg">settings_input_component</span>
              Drafting Configuration
            </h3>
            <span className="text-[10px] font-bold text-outline uppercase tracking-tight">Stage 3.1</span>
          </div>
          <div className="p-3 bg-surface-container-low rounded-lg mb-4 border border-outline-variant/30 text-sm font-medium text-on-surface">
            {task.topic || 'Untitled Topic'}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-outline-variant uppercase">Audience Persona</label>
              <div className="flex items-center justify-between p-2.5 bg-surface-container-low rounded border border-transparent hover:border-primary-dim cursor-pointer transition-all">
                <span className="text-xs font-medium text-on-surface">Enterprise Tech Decision Makers</span>
                <span className="material-symbols-outlined text-xs text-on-surface-variant">expand_more</span>
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-outline-variant uppercase">Tone & Style</label>
              <div className="flex items-center justify-between p-2.5 bg-surface-container-low rounded border border-transparent hover:border-primary-dim cursor-pointer transition-all">
                <span className="text-xs font-medium text-on-surface">Authoritative & Insightful</span>
                <span className="material-symbols-outlined text-xs text-on-surface-variant">tune</span>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-surface-container-lowest p-5 rounded-lg border border-outline-variant/50 shadow-sm">
          <h3 className="text-sm font-bold flex items-center gap-2 mb-4 text-on-surface">
            <span className="material-symbols-outlined text-tertiary text-lg">description</span>
            Asset Reference
          </h3>
          <div className="space-y-2">
            {/* Approved Outline */}
            <div className="rounded bg-surface-container-low border border-outline-variant/30 overflow-hidden">
              <button 
                onClick={() => setExpandedAsset(expandedAsset === 'outline' ? null : 'outline')}
                className="w-full flex items-center gap-2 p-2 hover:bg-surface-container-lowest transition-colors"
              >
                <span className="material-symbols-outlined text-primary text-base">task_alt</span>
                <span className="text-xs font-medium truncate text-on-surface flex-1 text-left">Approved Outline - {task.outline?.sections?.length || 0} Sections</span>
                <span className="material-symbols-outlined text-xs text-on-surface-variant transition-transform" style={{ transform: expandedAsset === 'outline' ? 'rotate(180deg)' : 'rotate(0deg)' }}>expand_more</span>
              </button>
              {expandedAsset === 'outline' && task.outline?.sections && (
                <div className="px-2 pb-2 border-t border-outline-variant/20">
                  <div className="pt-2 space-y-1 max-h-32 overflow-y-auto">
                    {task.outline.sections.map((section: any, idx: number) => (
                      <div key={idx} className="text-xs text-on-surface-variant flex items-start gap-1.5 p-1.5 rounded hover:bg-surface-container-lowest">
                        <span className="text-primary font-bold min-w-[16px]">{idx + 1}.</span>
                        <span className="truncate">{section.title}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Research Insights */}
            <div className="rounded bg-surface-container-low border border-outline-variant/30 overflow-hidden">
              <button 
                onClick={() => setExpandedAsset(expandedAsset === 'insights' ? null : 'insights')}
                className="w-full flex items-center gap-2 p-2 hover:bg-surface-container-lowest transition-colors"
              >
                <span className="material-symbols-outlined text-tertiary text-base">analytics</span>
                <span className="text-xs font-medium truncate text-on-surface flex-1 text-left">Research Insights - {task.research_data?.insights?.length || 0} Items</span>
                <span className="material-symbols-outlined text-xs text-on-surface-variant transition-transform" style={{ transform: expandedAsset === 'insights' ? 'rotate(180deg)' : 'rotate(0deg)' }}>expand_more</span>
              </button>
              {expandedAsset === 'insights' && task.research_data?.insights && (
                <div className="px-2 pb-2 border-t border-outline-variant/20">
                  <div className="pt-2 space-y-1 max-h-32 overflow-y-auto">
                    {task.research_data.insights.map((insight: any, idx: number) => (
                      <div key={idx} className="text-xs text-on-surface-variant p-1.5 rounded hover:bg-surface-container-lowest">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className={`w-1.5 h-1.5 rounded-full ${
                            insight.type === 'data' ? 'bg-blue-500' :
                            insight.type === 'trend' ? 'bg-orange-500' :
                            insight.type === 'case' ? 'bg-purple-500' : 'bg-slate-400'
                          }`} />
                          <span className="font-medium text-on-surface capitalize">{insight.type}</span>
                        </div>
                        <p className="line-clamp-2 text-[10px] opacity-80">{insight.content}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Hard Requirements / Assets */}
            <div className="rounded bg-surface-container-low border border-outline-variant/30 overflow-hidden">
              <button 
                onClick={() => setExpandedAsset(expandedAsset === 'assets' ? null : 'assets')}
                className="w-full flex items-center gap-2 p-2 hover:bg-surface-container-lowest transition-colors"
              >
                <span className="material-symbols-outlined text-error text-base">folder_special</span>
                <span className="text-xs font-medium truncate text-on-surface flex-1 text-left">Hard Requirements - {task.asset_ids?.length || 0} Assets</span>
                <span className="material-symbols-outlined text-xs text-on-surface-variant transition-transform" style={{ transform: expandedAsset === 'assets' ? 'rotate(180deg)' : 'rotate(0deg)' }}>expand_more</span>
              </button>
              {expandedAsset === 'assets' && (
                <div className="px-2 pb-2 border-t border-outline-variant/20">
                  <div className="pt-2 space-y-1">
                    {task.asset_ids && task.asset_ids.length > 0 ? (
                      task.asset_ids.map((assetId: string, idx: number) => (
                        <div key={idx} className="text-xs text-on-surface-variant flex items-center gap-1.5 p-1.5 rounded hover:bg-surface-container-lowest">
                          <span className="material-symbols-outlined text-error text-sm">description</span>
                          <span className="truncate font-mono">{assetId}</span>
                        </div>
                      ))
                    ) : (
                      <div className="text-xs text-on-surface-variant/60 text-center py-2">
                        No assets linked
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* 2. Process Section: AI Streaming Engine */}
      <section className="bg-surface-container-lowest rounded-lg border border-primary/20 shadow-lg shadow-primary/5 overflow-hidden flex flex-col shrink-0 min-h-[160px]">
        {isGenerating && !draftContent?.content ? (
          <>
            <div className="bg-primary/5 p-4 border-b border-primary/10 flex justify-between items-center">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-primary animate-pulse"></div>
                  <h3 className="text-sm font-bold text-primary">AI Streaming Drafting Engine</h3>
                </div>
              </div>
            </div>
            <div className="p-6">
              <DraftGenerationProgress taskId={task.id} onComplete={() => window.location.reload()} onError={(error) => alert(`Error: ${error}`)} />
            </div>
          </>
        ) : draftContent?.content ? (
           <div className="flex items-center gap-3 p-6 bg-surface-container-lowest text-on-surface rounded-lg">
             <span className="material-symbols-outlined text-primary text-3xl" style={{fontVariationSettings: "'FILL' 1"}}>check_circle</span>
             <div>
               <h3 className="text-base font-bold text-on-surface mb-1">Base Draft Generation Completed</h3>
               <p className="text-sm text-on-surface-variant">The content has been fully generated based on the approved outline and research materials.</p>
             </div>
           </div>
        ) : (
          <div className="flex flex-col items-center justify-center p-8 bg-surface-container-low text-on-surface-variant min-h-[200px]">
            <span className="material-symbols-outlined text-5xl mb-4 opacity-40">network_node</span>
            <p className="font-bold mb-1">Process Standard By</p>
            <p className="text-sm">Initiate the generation process from the action bar to begin the streaming draft.</p>
          </div>
        )}

        {/* 合规检查结果 */}
        {complianceResult && (
          <div className="border-t border-outline-variant/20 p-6 bg-surface-container-lowest">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-bold flex items-center gap-2 text-on-surface"><span className="material-symbols-outlined text-tertiary-fixed">policy</span> AI Compliance Analysis</h3>
              <button className="text-xs font-bold text-on-surface-variant hover:text-on-surface" onClick={onClearComplianceResult}>Dismiss</button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
               <div className="md:col-span-1 border-r border-outline-variant/20 pr-6 flex flex-col justify-center items-center">
                   <div className={`text-6xl font-black mb-2 ${complianceResult.overallScore >= 80 ? 'text-primary' : complianceResult.overallScore >= 60 ? 'text-tertiary-fixed' : 'text-error'}`}>
                     {complianceResult.overallScore}
                   </div>
                   <div className={`px-3 py-1 text-xs font-bold rounded-full uppercase tracking-widest ${complianceResult.overallScore >= 80 ? 'bg-primary-container/20 text-primary' : complianceResult.overallScore >= 60 ? 'bg-tertiary-container/20 text-tertiary-fixed' : 'bg-error-container/20 text-error'}`}>
                     {complianceResult.overallScore >= 80 ? 'Compliant' : complianceResult.overallScore >= 60 ? 'Warning' : 'High Risk'}
                   </div>
               </div>
               <div className="md:col-span-3 space-y-4">
                   <h4 className="text-xs font-bold text-on-surface-variant uppercase">Found Issues ({complianceResult.issues.length})</h4>
                   {complianceResult.issues.map((issue: any, idx: number) => (
                     <div key={idx} className="bg-surface-container-low p-4 rounded-xl border border-outline-variant/20">
                       <div className="flex items-center gap-2 mb-2">
                          <span className={`px-2 py-0.5 text-[10px] font-bold rounded uppercase ${issue.level === 'high' ? 'bg-error-container/20 text-error' : issue.level === 'medium' ? 'bg-tertiary-container/20 text-tertiary-fixed' : 'bg-primary-container/20 text-primary'}`}>{issue.level} Risk</span>
                          <span className="text-xs font-bold text-on-surface">{issue.type}</span>
                       </div>
                       <p className="text-sm text-on-surface mb-2">{issue.content}</p>
                       <p className="text-xs text-primary font-medium">💡 Suggestion: {issue.suggestion}</p>
                     </div>
                   ))}
                   {complianceResult.issues.length === 0 && (
                       <div className="text-sm text-on-surface-variant italic">No significant compliance issues detected.</div>
                   )}
               </div>
            </div>
          </div>
        )}
      </section>

      {/* 3. Output Section: Live Markdown Preview / Version Compare */}
      <section className="flex-1 flex flex-col lg:flex-row gap-4 min-h-[500px]">
        {sidebarView === 'compare' ? (
          <div className="flex-1 bg-surface-container-lowest rounded-lg border border-outline-variant/40 shadow-sm flex flex-col overflow-hidden">
            <VersionComparePanel
              versions={versions}
              currentVersion={draftContent?.version}
              onRollback={(versionId) => console.log('Rollback to:', versionId)}
              onApprove={() => setSidebarView('timeline')}
              initialCompareVersions={compareVersions}
            />
          </div>
        ) : (
          <>
            {/* Markdown Editor/Preview */}
            <div className="flex-1 bg-surface-container-lowest rounded-lg border border-outline-variant/40 shadow-sm flex flex-col">
              <div className="flex items-center justify-between p-3 border-b border-surface-container">
                <div className="flex items-center gap-2">
                  <TabButton 
                    active={editorTab === 'preview'} 
                    onClick={() => setEditorTab('preview')}
                    icon="visibility"
                    label="Preview"
                  />
                  <TabButton 
                    active={editorTab === 'export'} 
                    onClick={() => setEditorTab('export')}
                    icon="download"
                    label="Export"
                  />
                </div>
                {draftContent?.version && (
                  <span className="text-xs font-bold text-on-surface-variant">Version {draftContent.version}</span>
                )}
              </div>
              
              <div className="flex-1 overflow-y-auto bg-white">
                {!draftContent?.content ? (
                   <div className="empty-state py-32 text-center flex flex-col items-center h-full justify-center">
                     <div className="material-symbols-outlined text-6xl mb-4 text-outline-variant/30">edit_document</div>
                     <div className="text-lg font-bold text-on-surface mb-2">Editor Standby</div>
                     <p className="text-sm text-on-surface-variant">Draft content will populate here chronologically.</p>
                   </div>
                ) : editorTab === 'export' ? (
                   <div className="p-6">
                     <ExportPanel content={draftContent.content} title={task.topic} taskId={task.id} />
                   </div>
                ) : (
                    <LivePreviewMarkdown
                      content={draftContent.content}
                      version={draftContent.version}
                      minHeight="100%"
                      className="h-full border-none shadow-none"
                      showFooter={false}
                    />
                )}
              </div>
            </div>

            {/* Version History Sidebar */}
            <div className="w-full lg:w-80 bg-surface-container-lowest rounded-lg border border-outline-variant/40 shadow-sm flex flex-col shrink-0">
              <div className="p-4 border-b border-surface-container">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-on-surface-variant flex items-center gap-2">
                    <span className="material-symbols-outlined text-sm">history</span>
                    Version History
                  </h3>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-0">
                 {versions.length === 0 && !draftContent?.content ? (
                    <div className="p-6 text-center text-sm text-on-surface-variant italic">No versions recorded yet.</div>
                 ) : (
                    <VersionTimeline
                       versions={versions}
                       currentVersion={draftContent?.version}
                       onRollback={(version) => console.log('Rollback to:', version)}
                       maxHeight="100%"
                       enableCompare={true}
                       onCompare={(selectedVersions) => {
                         // 切换到对比视图
                         setCompareVersions(selectedVersions);
                         setSidebarView('compare');
                       }}
                     />
                 )}
              </div>
            </div>
          </>
        )}
      </section>

      {/* Footer Toolbox (Fixed Global Action Bar analog) */}
      <div className="fixed bottom-0 left-[256px] right-0 h-20 bg-surface-container-lowest/80 backdrop-blur-md border-t border-outline-variant/20 z-40 flex items-center justify-between px-8 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
        <div className="flex items-center gap-4">
           {draftContent?.content ? (
             <button className="flex items-center gap-2 px-6 py-2.5 bg-error/10 text-error rounded-lg font-headline text-sm font-bold hover:bg-error/20 transition-all active:scale-95" onClick={onRedoWriting} disabled={actionLoading === 'redo-writing'}>
               <span className="material-symbols-outlined text-sm">restart_alt</span>
               {actionLoading === 'redo-writing' ? 'Restarting...' : 'Discard & Regenerate'}
             </button>
           ) : (
             <button className="flex items-center gap-2 px-8 py-2.5 bg-primary text-on-primary rounded-lg font-headline text-sm font-bold shadow-lg shadow-primary/20 hover:bg-primary-dim transition-all active:scale-95" onClick={onRedoWriting} disabled={actionLoading === 'redo-writing' || isGenerating}>
               <span className="material-symbols-outlined text-sm" style={{fontVariationSettings: "'FILL' 1"}}>play_arrow</span>
               {isGenerating ? 'Streaming...' : 'Start Draft Generation'}
             </button>
           )}
        </div>
        
        <div className="flex items-center gap-6">
           {draftContent?.content && (
              <>
               <div className="flex flex-col items-end mr-4">
                 <span className="text-[10px] font-bold text-outline uppercase tracking-wider">Quality Core</span>
                 <div className="flex items-center gap-1.5">
                   <span className="text-sm font-black text-on-surface">{task.evaluation?.score || 92} / 100</span>
                 </div>
               </div>
               <button className="flex items-center gap-2 px-6 py-2.5 bg-on-surface text-surface-container-lowest rounded-lg font-headline text-sm font-bold hover:bg-inverse-surface transition-all active:scale-95" onClick={onComplianceCheck} disabled={checkingCompliance}>
                 <span className="material-symbols-outlined text-sm">rule</span>
                 {checkingCompliance ? 'Auditing...' : 'Audit Draft'}
               </button>
              </>
           )}
        </div>
      </div>
    </div>
  );
}

