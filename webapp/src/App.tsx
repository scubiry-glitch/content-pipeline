import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { TasksProvider } from './contexts/TasksContext';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { QualityDashboard } from './pages/QualityDashboard';
import { Tasks } from './pages/Tasks';
import { TaskDetail } from './pages/TaskDetail';
import { Assets } from './pages/Assets';
import { Experts } from './pages/Experts';
import { Reports } from './pages/Reports';
import { ReportDetail } from './pages/ReportDetail';
import { HotTopics } from './pages/HotTopics';
import { HotTopicDetail } from './pages/HotTopicDetail';
import { SentimentAnalysisPage } from './pages/SentimentAnalysis';
import { Compliance } from './pages/Compliance';
import { Orchestrator } from './pages/Orchestrator';
import { Stage3Editor } from './pages/Stage3Editor';
import { CopilotChat } from './pages/CopilotChat';
import { Prediction } from './pages/Prediction';
import { I18nManager } from './pages/I18nManager';
import { RSSSources } from './pages/RSSSources';
import { HiddenTasks } from './pages/HiddenTasks';
import { RecycleBin } from './pages/RecycleBin';
import './App.css';

function App() {
  return (
    <TasksProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="tasks" element={<Tasks />} />
            <Route path="tasks/:id" element={<TaskDetail />} />
            <Route path="tasks/:id/edit" element={<Stage3Editor />} />
            <Route path="assets" element={<Assets />} />
            <Route path="experts" element={<Experts />} />
            <Route path="reports" element={<Reports />} />
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
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </TasksProvider>
  );
}

export default App;
