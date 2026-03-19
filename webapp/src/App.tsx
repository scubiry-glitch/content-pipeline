import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { TasksProvider } from './contexts/TasksContext';
import { SettingsProvider } from './contexts/SettingsContext';
import { NotificationProvider } from './contexts/NotificationContext';
import { ActivityProvider } from './contexts/ActivityContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ApiErrorContainer } from './components/ApiErrorToast';
import { Layout } from './components/Layout';
import { initTheme } from './themes';

// 直接导入所有页面组件（不使用懒加载）
import { Dashboard } from './pages/Dashboard';
import { QualityDashboard } from './pages/QualityDashboard';
import { Tasks } from './pages/Tasks';
import { TaskDetailLayout } from './pages/TaskDetailLayout';
import { OverviewTab, PlanningTab, ResearchTab, WritingTab, ReviewsTab, QualityTab } from './pages/task-detail';
import { Assets } from './pages/Assets';
import { AssetDetail } from './pages/AssetDetail';
import { Experts } from './pages/Experts';
import { ExpertLibrary } from './pages/ExpertLibrary';
import { ReportDetail } from './pages/ReportDetail';
import { ReportCompare } from './pages/ReportCompare';
import { HotTopics } from './pages/HotTopics';
import { HotTopicDetail } from './pages/HotTopicDetail';
import { HotTopicInsights } from './pages/HotTopicInsights';
import { ExpertComparison } from './pages/ExpertComparison';
import { ExpertNetwork } from './pages/ExpertNetwork';
import { ExpertKnowledgeGraph } from './pages/ExpertKnowledgeGraph';
import { SentimentAnalysisPage } from './pages/SentimentAnalysis';
import { Compliance } from './pages/Compliance';
import { Orchestrator } from './pages/Orchestrator';
import { Stage3Editor } from './pages/Stage3Editor';
import { CopilotChat } from './pages/CopilotChat';
import { Prediction } from './pages/Prediction';
import { I18nManager } from './pages/I18nManager';
import { RSSSources } from './pages/RSSSources';
import { RSSItems } from './pages/RSSItems';
import { HiddenTasks } from './pages/HiddenTasks';
import { RecycleBin } from './pages/RecycleBin';
import { Settings } from './pages/Settings';
import { Notifications } from './pages/Notifications';

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
            <Routes>
              <Route path="/" element={<Layout />}>
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
              </Route>
              <Route path="tasks/:id/edit" element={<Stage3Editor />} />
              {/* 内容资产模块 - 整合素材和研报 */}
              <Route path="assets" element={<Assets />} />
              <Route path="assets/:id" element={<AssetDetail />} />
              {/* 研报子路由 - 整合到内容资产 */}
              <Route path="assets/reports/:id" element={<ReportDetail />} />
              <Route path="assets/reports/compare" element={<ReportCompare />} />
              {/* 旧研报路由重定向到新路由 */}
              <Route path="reports" element={<Navigate to="/assets" replace />} />
              <Route path="reports/:id" element={<Navigate to="/assets/reports/:id" replace />} />
              <Route path="reports/compare" element={<Navigate to="/assets/reports/compare" replace />} />
              
              <Route path="experts" element={<Experts />} />
              <Route path="expert-library" element={<ExpertLibrary />} />
              <Route path="hot-topics" element={<HotTopics />} />
              <Route path="hot-topics/insights" element={<HotTopicInsights />} />
              <Route path="hot-topics/insights/:topicId" element={<HotTopicInsights />} />
              <Route path="hot-topics/:id" element={<HotTopicDetail />} />
              <Route path="expert-comparison" element={<ExpertComparison />} />
              <Route path="expert-network" element={<ExpertNetwork />} />
<Route path="expert-knowledge-graph" element={<ExpertKnowledgeGraph />} />
              <Route path="sentiment" element={<SentimentAnalysisPage />} />
              <Route path="compliance" element={<Compliance />} />
              <Route path="orchestrator" element={<Orchestrator />} />
              <Route path="copilot" element={<CopilotChat />} />
              <Route path="prediction" element={<Prediction />} />
              <Route path="i18n" element={<I18nManager />} />
              <Route path="rss-sources" element={<RSSSources />} />
<Route path="rss-items" element={<RSSItems />} />
              <Route path="archive/hidden" element={<HiddenTasks />} />
              <Route path="archive/recycle-bin" element={<RecycleBin />} />
              <Route path="quality-dashboard" element={<QualityDashboard />} />
              <Route path="settings" element={<Settings />} />
              <Route path="notifications" element={<Notifications />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
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
