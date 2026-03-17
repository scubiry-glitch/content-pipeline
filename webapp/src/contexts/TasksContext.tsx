import React, { createContext, useContext, useCallback } from 'react';
import type { Task } from '../types';
import { tasksApi } from '../api/client';
import { useCachedData, mutateCache } from '../hooks/useSWRConfig';

interface TasksContextType {
  tasks: Task[];
  loading: boolean;
  error: string | null;
  isOffline: boolean;
  fetchTasks: () => Promise<void>;
  createTask: (topic: string, formats: string[]) => Promise<Task>;
  updateTask: (id: string, data: Partial<Task>) => Promise<Task>;
  refreshTask: (id: string) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  hideTask: (id: string) => Promise<void>;
  unhideTask: (id: string) => Promise<void>;
}

const TasksContext = createContext<TasksContextType | undefined>(undefined);

// SWR key for tasks list
const TASKS_KEY = 'tasks/list';

export function TasksProvider({ children }: { children: React.ReactNode }) {
  // 使用 SWR 缓存任务列表数据（5分钟缓存）
  const {
    data: tasksData,
    error,
    isLoading,
    isOffline,
    mutate,
  } = useCachedData(
    TASKS_KEY,
    async () => {
      const response = await tasksApi.getAll({ limit: 50 });
      return response.items || [];
    },
    {
      // 每30秒自动刷新（对应 Dashboard 自动刷新需求）
      refreshInterval: 30000,
    }
  );

  const tasks = tasksData || [];

  const fetchTasks = useCallback(async () => {
    await mutate();
  }, [mutate]);

  const createTask = useCallback(
    async (topic: string, formats: string[]): Promise<Task> => {
      const response = await tasksApi.create({
        topic,
        target_formats: formats,
        source_materials: [],
      });
      // 创建后刷新缓存
      await mutate();
      return response;
    },
    [mutate]
  );

  const updateTask = useCallback(
    async (id: string, data: Partial<Task>): Promise<Task> => {
      const response = await tasksApi.update(id, data);
      // 乐观更新本地缓存
      await mutate(
        (currentTasks) =>
          currentTasks?.map((t) => (t.id === id ? { ...t, ...response } : t)),
        false
      );
      return response;
    },
    [mutate]
  );

  const refreshTask = useCallback(
    async (id: string) => {
      try {
        const task = await tasksApi.getById(id);
        await mutate(
          (currentTasks) =>
            currentTasks?.map((t) => (t.id === id ? task : t)),
          false
        );
      } catch (err) {
        console.error('Failed to refresh task:', err);
      }
    },
    [mutate]
  );

  const deleteTask = useCallback(
    async (id: string) => {
      try {
        await tasksApi.delete(id);
        // 乐观更新：从缓存中移除
        await mutate(
          (currentTasks) => currentTasks?.filter((t) => t.id !== id),
          false
        );
      } catch (err) {
        console.error('Failed to delete task:', err);
        throw err;
      }
    },
    [mutate]
  );

  const hideTask = useCallback(
    async (id: string) => {
      try {
        await tasksApi.hide(id);
        // 乐观更新
        await mutate(
          (currentTasks) =>
            currentTasks?.map((t) =>
              t.id === id ? { ...t, is_hidden: true } : t
            ),
          false
        );
      } catch (err) {
        console.error('Failed to hide task:', err);
        throw err;
      }
    },
    [mutate]
  );

  const unhideTask = useCallback(
    async (id: string) => {
      try {
        await tasksApi.hide(id);
        // 乐观更新
        await mutate(
          (currentTasks) =>
            currentTasks?.map((t) =>
              t.id === id ? { ...t, is_hidden: false } : t
            ),
          false
        );
      } catch (err) {
        console.error('Failed to unhide task:', err);
        throw err;
      }
    },
    [mutate]
  );

  return (
    <TasksContext.Provider
      value={{
        tasks,
        loading: isLoading,
        error: error ? '获取任务列表失败' : null,
        isOffline,
        fetchTasks,
        createTask,
        updateTask,
        refreshTask,
        deleteTask,
        hideTask,
        unhideTask,
      }}
    >
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

// 导出供其他组件使用的 hook：获取单个任务详情（带缓存）
export function useTaskDetail(taskId: string | null) {
  return useCachedData(
    taskId ? `tasks/detail/${taskId}` : null,
    () => tasksApi.getById(taskId!),
    {
      // 任务详情页不需要自动刷新
      refreshInterval: 0,
    }
  );
}
