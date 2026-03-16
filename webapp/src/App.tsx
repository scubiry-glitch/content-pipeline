import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { TasksProvider } from './contexts/TasksContext';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { Tasks } from './pages/Tasks';
import { TaskDetail } from './pages/TaskDetail';
import { Assets } from './pages/Assets';
import { Experts } from './pages/Experts';
import { Reports } from './pages/Reports';
import { HotTopics } from './pages/HotTopics';
import { SentimentAnalysisPage } from './pages/SentimentAnalysis';
import { Compliance } from './pages/Compliance';
import { Orchestrator } from './pages/Orchestrator';
import { Stage3Editor } from './pages/Stage3Editor';
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
            <Route path="hot-topics" element={<HotTopics />} />
            <Route path="sentiment" element={<SentimentAnalysisPage />} />
            <Route path="compliance" element={<Compliance />} />
            <Route path="orchestrator" element={<Orchestrator />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </TasksProvider>
  );
}

export default App;
