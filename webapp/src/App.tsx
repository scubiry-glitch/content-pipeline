import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { TasksProvider } from './contexts/TasksContext';
import { SettingsProvider } from './contexts/SettingsContext';
import { NotificationProvider } from './contexts/NotificationContext';
import { ActivityProvider } from './contexts/ActivityContext';
import { AuthProvider } from './contexts/AuthContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ApiErrorContainer } from './components/ApiErrorToast';
import { Layout } from './components/Layout';
import { RequireAuth } from './components/RequireAuth';
import { Login } from './pages/Login';
import { WorkspaceList } from './pages/settings/WorkspaceList';
import { WorkspaceDetail } from './pages/settings/WorkspaceDetail';
import { initTheme } from './themes';

// 直接导入所有页面组件（不使用懒加载）
import { Dashboard } from './pages/Dashboard';
import { QualityDashboard } from './pages/QualityDashboard';
import { Tasks } from './pages/Tasks';
import { TaskDetailLayout } from './pages/TaskDetailLayout';
import { OverviewTab, PlanningTab, ResearchTab, WritingTab, ReviewsTab, QualityTab, PortalTab } from './pages/task-detail';
import { AssetsLayout } from './pages/AssetsLayout';
import { Assets } from './pages/Assets';
import { AssetDetail } from './pages/AssetDetail';
import { PopularAssets } from './pages/PopularAssets';
import { Reports } from './pages/Reports';
import { Experts } from './pages/Experts';
import { ExpertLibrary } from './pages/ExpertLibrary';
import { ReportDetail } from './pages/ReportDetail';
import { ReportCompare } from './pages/ReportCompare';
import { HotTopics } from './pages/HotTopics';
import { HotTopicDetail } from './pages/HotTopicDetail';
import { HotTopicInsights } from './pages/HotTopicInsights';
import { ExpertChat } from './pages/ExpertChat';
import { ExpertLibraryPanorama } from './pages/ExpertLibraryPanorama';
import { ExpertAdmin } from './pages/ExpertAdmin';
import { ExpertComparison } from './pages/ExpertComparison';
import { ExpertNetwork } from './pages/ExpertNetwork';
import { ExpertKnowledgeGraph } from './pages/ExpertKnowledgeGraph';
import { ExpertScheduling } from './pages/ExpertScheduling';
import { ExpertDebate } from './pages/ExpertDebate';
import { ExpertDebateDetail } from './pages/ExpertDebateDetail';
import { MentalModels } from './pages/MentalModels';
import { ContentLibrary } from './pages/ContentLibrary';
import { ContentLibraryFacts } from './pages/ContentLibraryFacts';
import { ContentLibraryEntities } from './pages/ContentLibraryEntities';
import { ContentLibraryContradictions } from './pages/ContentLibraryContradictions';
import { ContentLibrarySynthesis } from './pages/ContentLibrarySynthesis';
import { ContentLibraryConsensus } from './pages/ContentLibraryConsensus';
import { ContentLibraryBeliefs } from './pages/ContentLibraryBeliefs';
import { ContentLibraryCrossDomain } from './pages/ContentLibraryCrossDomain';
import { ContentLibraryTopics } from './pages/ContentLibraryTopics';
import { ContentLibraryTrends } from './pages/ContentLibraryTrends';
import { ContentLibraryDelta } from './pages/ContentLibraryDelta';
import { ContentLibraryFreshness } from './pages/ContentLibraryFreshness';
import { ContentLibraryCards } from './pages/ContentLibraryCards';
import { ContentLibraryWiki } from './pages/ContentLibraryWiki';
import { ContentLibraryBatchOps } from './pages/ContentLibraryBatchOps';
import { ContentLibraryPipeline } from './pages/ContentLibraryPipeline';
import { ContentLibraryMaterials } from './pages/ContentLibraryMaterials';
import { MeetingShell } from './prototype/meeting/MeetingShell';
import { MeetingDetailShell } from './prototype/meeting/MeetingDetailShell';
import { MeetingToday } from './prototype/meeting/MeetingToday';
import { Library as MeetingLibraryProto } from './prototype/meeting/Library';
import { NewMeeting as NewMeetingProto } from './prototype/meeting/NewMeeting';
import { LongitudinalView } from './prototype/meeting/LongitudinalView';
import { ScopeExpertConfig } from './prototype/meeting/ScopeExpertConfig';
import { StrategiesPanel } from './prototype/meeting/StrategiesPanel';
import { GenerationCenter as GenerationCenterProto } from './prototype/meeting/GenerationCenter';
import { AxisPeople as AxisPeopleProto } from './prototype/meeting/AxisPeople';
import { AxisProjects as AxisProjectsProto } from './prototype/meeting/AxisProjects';
import { AxisKnowledge as AxisKnowledgeProto } from './prototype/meeting/AxisKnowledge';
import { AxisMeta as AxisMetaProto } from './prototype/meeting/AxisMeta';
import { VariantEditorial } from './prototype/meeting/VariantEditorial';
import { VariantWorkbench } from './prototype/meeting/VariantWorkbench';
import { VariantThreads } from './prototype/meeting/VariantThreads';
import { WorldShell as CeoWorldShell } from './prototype/ceo/WorldShell';
import { ExternalMeetingsPane as CeoExternalMeetingsPane } from './prototype/ceo/external/ExternalMeetingsPane';
import { ExternalLibraryPane as CeoExternalLibraryPane } from './prototype/ceo/external/ExternalLibraryPane';
import { CEOHomePane } from './prototype/ceo/internal/CEOHomePane';
import { RoomStub as CeoRoomStub } from './prototype/ceo/internal/RoomStub';
import { Panorama as CeoPanorama } from './prototype/ceo/internal/Panorama';
import { BrainShell as CeoBrainShell } from './prototype/ceo/brain/BrainShell';
import { BrainStub as CeoBrainStub } from './prototype/ceo/brain/BrainStub';
import { Compass as CeoCompass } from './prototype/ceo/internal/rooms/Compass';
import { ProjectAtlas as CeoProjectAtlas } from './prototype/ceo/internal/rooms/Compass/ProjectAtlas';
import { Boardroom as CeoBoardroom } from './prototype/ceo/internal/rooms/Boardroom';
import { Tower as CeoTower } from './prototype/ceo/internal/rooms/Tower';
import { WarRoom as CeoWarRoom } from './prototype/ceo/internal/rooms/WarRoom';
import { SandboxDetail as CeoSandboxDetail } from './prototype/ceo/internal/rooms/WarRoom/SandboxDetail';
import { Situation as CeoSituation } from './prototype/ceo/internal/rooms/Situation';
import { Balcony as CeoBalcony } from './prototype/ceo/internal/rooms/Balcony';
import { SentimentAnalysisPage } from './pages/SentimentAnalysis';
import { Compliance } from './pages/Compliance';
import { Orchestrator } from './pages/Orchestrator';
import { Stage3Editor } from './pages/Stage3Editor';
import { CopilotChat } from './pages/CopilotChat';
import { Prediction } from './pages/Prediction';
import { I18nManager } from './pages/I18nManager';
import { RSSSources } from './pages/RSSSources';
import { MeetingNoteSources } from './pages/MeetingNoteSources';
import { RSSItems } from './pages/RSSItems';
import { RSSAssets } from './pages/RSSAssets';
import { AITaskRecommendations } from './pages/AITaskRecommendations';
import { Bindings } from './pages/Bindings';
import { HiddenTasks } from './pages/HiddenTasks';
import { RecycleBin } from './pages/RecycleBin';
import { Settings } from './pages/Settings';
import { Notifications } from './pages/Notifications';
import { LangGraphTasks } from './pages/LangGraphTasks';
import { LGTaskDetailLayout } from './pages/LGTaskDetailLayout';
import { LGOverviewTab, LGPlanningTab, LGResearchTab, LGWritingTab, LGReviewsTab, LGQualityTab, LGPortalTab } from './pages/lg-task-detail';
import { AdminTaxonomy } from './pages/AdminTaxonomy';
import { AdminGuard } from './components/AdminGuard';
import { AdminUsers } from './pages/admin/AdminUsers';
import { AdminAudit } from './pages/admin/AdminAudit';
import { FirstLoginGuide } from './components/FirstLoginGuide';

import './App.css';

function App() {
  // 初始化主题系统
  useEffect(() => {
    initTheme();
  }, []);
  return (
    <ErrorBoundary>
      <SettingsProvider>
        <NotificationProvider>
          <ActivityProvider>
          <TasksProvider>
          <BrowserRouter>
          <AuthProvider>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route element={<RequireAuth />}>
              <Route path="/" element={<Layout />}>
              <Route path="settings/workspaces" element={<WorkspaceList />} />
              <Route path="settings/workspaces/:id" element={<WorkspaceDetail />} />
              <Route index element={<Dashboard />} />
              <Route path="tasks" element={<Tasks />} />
              <Route path="tasks/:id" element={<TaskDetailLayout />}>
                <Route index element={<Navigate to="overview" replace />} />
                <Route path="overview" element={<OverviewTab />} />
                <Route path="planning" element={<PlanningTab />} />
                <Route path="research" element={<ResearchTab />} />
                <Route path="writing" element={<WritingTab />} />
                <Route path="reviews" element={<ReviewsTab />} />
                <Route path="quality" element={<QualityTab />} />
                <Route path="portal" element={<PortalTab />} />
              </Route>
              <Route path="tasks/:id/edit" element={<Stage3Editor />} />
              {/* 内容资产模块 - 嵌套路由 */}
              <Route path="assets" element={<AssetsLayout />}>
                <Route index element={<Assets />} />
                <Route path="reports" element={<Reports />} />
                <Route path="reports/:id" element={<ReportDetail />} />
                <Route path="reports/compare" element={<ReportCompare />} />
                <Route path="popular" element={<PopularAssets />} />
                <Route path="rss" element={<RSSAssets />} />
                <Route path="bindings" element={<Bindings />} />
                <Route path=":id" element={<AssetDetail />} />
              </Route>
              {/* 旧路由重定向 */}
              <Route path="reports" element={<Navigate to="/assets/reports" replace />} />
              <Route path="reports/:id" element={<Navigate to="/assets/reports/:id" replace />} />
              <Route path="reports/compare" element={<Navigate to="/assets/reports/compare" replace />} />
              
              <Route path="experts" element={<Experts />} />
              <Route path="expert-library" element={<ExpertLibrary />} />
              <Route path="expert-panorama" element={<ExpertLibraryPanorama />} />
              <Route path="hot-topics" element={<HotTopics />} />
              <Route path="hot-topics/insights" element={<HotTopicInsights />} />
              <Route path="hot-topics/insights/:topicId" element={<HotTopicInsights />} />
              <Route path="hot-topics/:id" element={<HotTopicDetail />} />
              <Route path="expert-chat" element={<ExpertChat />} />
              <Route path="expert-admin/:expertId" element={<ExpertAdmin />} />
              <Route path="expert-comparison" element={<ExpertComparison />} />
              <Route path="expert-network" element={<ExpertNetwork />} />
              <Route path="expert-knowledge-graph" element={<ExpertKnowledgeGraph />} />
              <Route path="expert-scheduling" element={<ExpertScheduling />} />
              <Route path="expert-debate" element={<ExpertDebate />} />
              <Route path="expert-debate/:id" element={<ExpertDebateDetail />} />
              <Route path="mental-models" element={<MentalModels />} />
              {/* 内容库模块 (v7.0) — 嵌套路由，保证 /content-library/* 子路径稳定匹配 Outlet */}
              <Route path="content-library" element={<Outlet />}>
                <Route index element={<ContentLibrary />} />
                <Route path="facts" element={<ContentLibraryFacts />} />
                <Route path="entities" element={<ContentLibraryEntities />} />
                <Route path="contradictions" element={<ContentLibraryContradictions />} />
                <Route path="synthesis" element={<ContentLibrarySynthesis />} />
                <Route path="consensus" element={<ContentLibraryConsensus />} />
                <Route path="beliefs" element={<ContentLibraryBeliefs />} />
                <Route path="cross-domain" element={<ContentLibraryCrossDomain />} />
                <Route path="topics" element={<ContentLibraryTopics />} />
                <Route path="trends" element={<ContentLibraryTrends />} />
                <Route path="delta" element={<ContentLibraryDelta />} />
                <Route path="freshness" element={<ContentLibraryFreshness />} />
                <Route path="cards" element={<ContentLibraryCards />} />
                <Route path="wiki" element={<ContentLibraryWiki />} />
                <Route path="batch-ops" element={<ContentLibraryBatchOps />} />
                <Route path="pipeline" element={<ContentLibraryPipeline />} />
                <Route path="materials" element={<ContentLibraryMaterials />} />
              </Route>
              {/* /meeting-notes 旧路由已下线，归档于 webapp/_legacy/pages-meeting-notes-2026q2/；
                  新路由 /meeting/* 由 prototype/meeting/* 提供。 */}


              <Route path="sentiment" element={<SentimentAnalysisPage />} />
              <Route path="compliance" element={<Compliance />} />
              <Route path="orchestrator" element={<Orchestrator />} />
              <Route path="copilot" element={<CopilotChat />} />
              <Route path="prediction" element={<Prediction />} />
              <Route path="i18n" element={<I18nManager />} />
              <Route path="rss-sources" element={<RSSSources />} />
              <Route path="meeting-note-sources" element={<MeetingNoteSources />} />
<Route path="rss-items" element={<RSSItems />} />
              <Route path="archive/hidden" element={<HiddenTasks />} />
              <Route path="archive/recycle-bin" element={<RecycleBin />} />
              <Route path="quality-dashboard" element={<QualityDashboard />} />
              <Route path="settings" element={<Settings />} />
              <Route path="notifications" element={<Notifications />} />
              <Route path="ai-task-recommendations" element={<AITaskRecommendations />} />
              <Route path="admin/taxonomy" element={<AdminTaxonomy />} />
              <Route path="admin" element={<AdminGuard />}>
                <Route path="users" element={<AdminUsers />} />
                <Route path="audit" element={<AdminAudit />} />
              </Route>
              {/* LangGraph 流水线独立页面 */}
              <Route path="lg-tasks" element={<LangGraphTasks />} />
              <Route path="lg-tasks/:threadId" element={<LGTaskDetailLayout />}>
                <Route index element={<Navigate to="overview" replace />} />
                <Route path="overview" element={<LGOverviewTab />} />
                <Route path="planning" element={<LGPlanningTab />} />
                <Route path="research" element={<LGResearchTab />} />
                <Route path="writing" element={<LGWritingTab />} />
                <Route path="reviews" element={<LGReviewsTab />} />
                <Route path="quality" element={<LGQualityTab />} />
                <Route path="portal" element={<LGPortalTab />} />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>

            {/* 会议纪要 v2 原型 — /meeting/* 独立于主站 Layout，全屏原型壳 */}
            <Route path="/meeting" element={<MeetingShell />}>
              <Route index element={<Navigate to="today" replace />} />
              <Route path="today" element={<MeetingToday />} />
              <Route path="new" element={<NewMeetingProto />} />
              <Route path="library" element={<MeetingLibraryProto />} />
              <Route path="generation-center" element={<GenerationCenterProto />} />
              <Route path="longitudinal" element={<LongitudinalView />} />
              <Route path="scopes" element={<ScopeExpertConfig />} />
              <Route path="strategies" element={<StrategiesPanel />} />
              <Route path="axes/people" element={<AxisPeopleProto />} />
              <Route path="axes/projects" element={<AxisProjectsProto />} />
              <Route path="axes/knowledge" element={<AxisKnowledgeProto />} />
              <Route path="axes/meta" element={<AxisMetaProto />} />
            </Route>
            {/* 会议详情 A/B/C —— 独立 shell，顶栏 + tab，不显示主导航侧栏 */}
            <Route path="/meeting/:id" element={<MeetingDetailShell />}>
              <Route index element={<Navigate to="a" replace />} />
              <Route path="a" element={<VariantEditorial />} />
              <Route path="b" element={<VariantWorkbench />} />
              <Route path="c" element={<VariantThreads />} />
            </Route>

            {/* CEO 应用 —— 双模主壳，独立于主站 Layout */}
            <Route path="/ceo" element={<CeoWorldShell />}>
              <Route index element={<Navigate to="internal/ceo" replace />} />
              <Route path="external" element={<Navigate to="meetings" replace />} />
              <Route path="external/meetings" element={<CeoExternalMeetingsPane />} />
              <Route path="external/library" element={<CeoExternalLibraryPane />} />
              <Route path="internal" element={<Navigate to="ceo" replace />} />
              <Route path="internal/ceo" element={<CEOHomePane />} />
              <Route path="internal/ceo/panorama" element={<CeoPanorama />} />
              <Route path="internal/ceo/compass" element={<CeoCompass />} />
              <Route path="internal/ceo/compass/atlas" element={<CeoProjectAtlas />} />
              <Route path="internal/ceo/boardroom" element={<CeoBoardroom />} />
              <Route path="internal/ceo/tower" element={<CeoTower />} />
              <Route path="internal/ceo/war-room" element={<CeoWarRoom />} />
              <Route path="internal/ceo/war-room/sandbox/:id" element={<CeoSandboxDetail />} />
              <Route path="internal/ceo/situation" element={<CeoSituation />} />
              <Route path="internal/ceo/balcony" element={<CeoBalcony />} />
              <Route path="internal/ceo/:room" element={<CeoRoomStub />} />
              <Route path="internal/brain" element={<CeoBrainShell />}>
                <Route index element={<Navigate to="expert-library" replace />} />
                <Route path=":sub" element={<CeoBrainStub />} />
              </Route>
            </Route>
              </Route>
            </Routes>
          </AuthProvider>
        </BrowserRouter>
        <ApiErrorContainer />
      </TasksProvider>
      </ActivityProvider>
      </NotificationProvider>
      </SettingsProvider>
    </ErrorBoundary>
  );
}

export default App;
