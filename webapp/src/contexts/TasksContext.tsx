import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import type { Task } from '../types';
import { tasksApi } from '../api/client';

interface TasksContextType {
  tasks: Task[];
  loading: boolean;
  error: string | null;
  fetchTasks: () => Promise<void>;
  createTask: (topic: string, formats: string[]) => Promise<Task>;
  refreshTask: (id: string) => Promise<void>;
}

const TasksContext = createContext<TasksContextType | undefined>(undefined);

export function TasksProvider({ children }: { children: React.ReactNode }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await tasksApi.getAll({ limit: 50 });
      setTasks(response.items || []);
    } catch (err) {
      setError('获取任务列表失败');
      console.error('Failed to fetch tasks:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const createTask = useCallback(async (topic: string, formats: string[]): Promise<Task> => {
    const response = await tasksApi.create({
      topic,
      target_formats: formats,
      source_materials: [],
    });
    await fetchTasks();
    return response;
  }, [fetchTasks]);

  const refreshTask = useCallback(async (id: string) => {
    try {
      const task = await tasksApi.getById(id);
      setTasks((prev) => prev.map((t) => (t.id === id ? task : t)));
    } catch (err) {
      console.error('Failed to refresh task:', err);
    }
  }, []);

  // 自动刷新
  useEffect(() => {
    fetchTasks();
    const interval = setInterval(fetchTasks, 5000);
    return () => clearInterval(interval);
  }, [fetchTasks]);

  return (
    <TasksContext.Provider value={{ tasks, loading, error, fetchTasks, createTask, refreshTask }}>
      {children}
    </TasksContext.Provider>
  );
}

export function useTasks() {
  const context = useContext(TasksContext);
  if (!context) {
    throw new Error('useTasks must be used within TasksProvider');
  }
  return context;
}
