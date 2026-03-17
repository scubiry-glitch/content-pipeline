import { BrowserRouter, Routes, Route, Navigate, Suspense } from 'react-router-dom';
import { TasksProvider } from './contexts/TasksContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ApiErrorContainer } from './components/ApiErrorToast';
import { Layout } from './components/Layout';
import { lazy } from 'react';
import './App.css';

// 懒加载所有页面组件
const Dashboard = lazy(() => import('./pages/Dashboard'));
const QualityDashboard = lazy(() => import('./pages/QualityDashboard'));
const Tasks = lazy(() => import('./pages/Tasks'));
const TaskDetail = lazy(() => import('./pages/TaskDetail'));
const Assets = lazy(() => import('./pages/Assets'));
const AssetDetail = lazy(() => import('./pages/AssetDetail'));
const Experts = lazy(() => import('./pages/Experts'));
const Reports = lazy(() => import('./pages/Reports'));
const ReportDetail = lazy(() => import('./pages/ReportDetail'));
const ReportCompare = lazy(() => import('./pages/ReportCompare'));
const HotTopics = lazy(() => import('./pages/HotTopics'));
const HotTopicDetail = lazy(() => import('./pages/HotTopicDetail'));
const SentimentAnalysisPage = lazy(() => import('./pages/SentimentAnalysis'));
const Compliance = lazy(() => import('./pages/Compliance'));
const Orchestrator = lazy(() => import('./pages/Orchestrator'));
const Stage3Editor = lazy(() => import('./pages/Stage3Editor'));
const CopilotChat = lazy(() => import('./pages/CopilotChat'));
const Prediction = lazy(() => import('./pages/Prediction'));
const I18nManager = lazy(() => import('./pages/I18nManager'));
const RSSSources = lazy(() => import('./pages/RSSSources'));
const HiddenTasks = lazy(() => import('./pages/HiddenTasks'));
const RecycleBin = lazy(() => import('./pages/RecycleBin'));

// Loading 组件
function PageLoading() {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      height: '100vh',
      flexDirection: 'column',
      gap: '16px'
    }}>
      <div style={{
        width: '40px',
        height: '40px',
        border: '3px solid #f3f3f3',
        borderTop: '3px solid #1890ff',
        borderRadius: '50%',
        animation: 'spin 1s linear infinite'
      }} />
      <span style={{ color: '#666', fontSize: '14px' }}>页面加载中...</span>
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <TasksProvider>
        <BrowserRouter>
          <Suspense fallback={<PageLoading />}>
            <Routes>
              <Route path="/" element={<Layout />}>
                <Route index element={<Dashboard />} />
                <Route path="tasks" element={<Tasks />} />
                <Route path="tasks/:id" element={<TaskDetail />} />
                <Route path="tasks/:id/edit" element={<Stage3Editor />} />
                <Route path="assets" element={<Assets />} />
                <Route path="assets/:id" element={<AssetDetail />} />
                <Route path="experts" element={<Experts />} />
                <Route path="reports" element={<Reports />} />
                <Route path="reports/compare" element={<ReportCompare />} />
                <Route path="reports/:id" element={<ReportDetail />} />
                <Route path="hot-topics" element={<HotTopics />} />
                <Route path="hot-topics/:id" element={<HotTopicDetail />} />
                <Route path="sentiment" element={<SentimentAnalysisPage />} />
                <Route path="compliance" element={<Compliance />} />
                <Route path="orchestrator" element={<Orchestrator />} />
                <Route path="copilot" element={<CopilotChat />} />
                <Route path="prediction" element={<Prediction />} />
                <Route path="i18n" element={<I18nManager />} />
                <Route path="rss-sources" element={<RSSSources />} />
                <Route path="archive/hidden" element={<HiddenTasks />} />
                <Route path="archive/recycle-bin" element={<RecycleBin />} />
                <Route path="quality-dashboard" element={<QualityDashboard />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Routes>
          </Suspense>
        </BrowserRouter>
        <ApiErrorContainer />
      </TasksProvider>
    </ErrorBoundary>
  );
}

export default App;
