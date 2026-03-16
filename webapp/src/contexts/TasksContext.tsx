import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import type { Task } from '../types';
import { tasksApi } from '../api/client';

interface TasksContextType {
  tasks: Task[];
  loading: boolean;
  error: string | null;
  fetchTasks: () => Promise<void>;
  createTask: (topic: string, formats: string[]) => Promise<Task>;
  updateTask: (id: string, data: Partial<Task>) => Promise<Task>;
  refreshTask: (id: string) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  hideTask: (id: string) => Promise<void>;
  unhideTask: (id: string) => Promise<void>;
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

  const updateTask = useCallback(async (id: string, data: Partial<Task>): Promise<Task> => {
    const response = await tasksApi.update(id, data);
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...response } : t)));
    return response;
  }, []);

  const refreshTask = useCallback(async (id: string) => {
    try {
      const task = await tasksApi.getById(id);
      setTasks((prev) => prev.map((t) => (t.id === id ? task : t)));
    } catch (err) {
      console.error('Failed to refresh task:', err);
    }
  }, []);

  const deleteTask = useCallback(async (id: string) => {
    try {
      await tasksApi.delete(id);
      setTasks((prev) => prev.filter((t) => t.id !== id));
    } catch (err) {
      console.error('Failed to delete task:', err);
      throw err;
    }
  }, []);

  const hideTask = useCallback(async (id: string) => {
    try {
      await tasksApi.hide(id);
      setTasks((prev) =>
        prev.map((t) => (t.id === id ? { ...t, is_hidden: true } : t))
      );
    } catch (err) {
      console.error('Failed to hide task:', err);
      throw err;
    }
  }, []);

  const unhideTask = useCallback(async (id: string) => {
    try {
      await tasksApi.hide(id); // API toggle hide status
      setTasks((prev) =>
        prev.map((t) => (t.id === id ? { ...t, is_hidden: false } : t))
      );
    } catch (err) {
      console.error('Failed to unhide task:', err);
      throw err;
    }
  }, []);

  // 自动刷新
  useEffect(() => {
    fetchTasks();
    const interval = setInterval(fetchTasks, 5000);
    return () => clearInterval(interval);
  }, [fetchTasks]);

  return (
    <TasksContext.Provider value={{ tasks, loading, error, fetchTasks, createTask, updateTask, refreshTask, deleteTask, hideTask, unhideTask }}>
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
