import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { TasksProvider } from './contexts/TasksContext';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { Tasks } from './pages/Tasks';
import { Assets } from './pages/Assets';
import { Experts } from './pages/Experts';
import { Reports } from './pages/Reports';
import './App.css';

function App() {
  return (
    <TasksProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="tasks" element={<Tasks />} />
            <Route path="assets" element={<Assets />} />
            <Route path="experts" element={<Experts />} />
            <Route path="reports" element={<Reports />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </TasksProvider>
  );
}

export default App;
