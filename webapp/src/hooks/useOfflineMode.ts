import { useState, useEffect, useCallback } from 'react';

interface QueuedAction {
  id: string;
  type: string;
  payload: unknown;
  timestamp: number;
  retryCount: number;
}

const QUEUE_KEY = 'offline_action_queue';

export function useOfflineMode() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [queue, setQueue] = useState<QueuedAction[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);

  // 监听网络状态
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // 从localStorage加载队列
  useEffect(() => {
    const saved = localStorage.getItem(QUEUE_KEY);
    if (saved) {
      try {
        setQueue(JSON.parse(saved));
      } catch {
        console.error('Failed to parse offline queue');
      }
    }
  }, []);

  // 保存队列到localStorage
  const saveQueue = useCallback((newQueue: QueuedAction[]) => {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(newQueue));
    setQueue(newQueue);
  }, []);

  // 添加操作到队列
  const queueAction = useCallback(
    (type: string, payload: unknown) => {
      const action: QueuedAction = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type,
        payload,
        timestamp: Date.now(),
        retryCount: 0,
      };
      const newQueue = [...queue, action];
      saveQueue(newQueue);
      return action.id;
    },
    [queue, saveQueue]
  );

  // 移除操作
  const removeAction = useCallback(
    (id: string) => {
      const newQueue = queue.filter((a) => a.id !== id);
      saveQueue(newQueue);
    },
    [queue, saveQueue]
  );

  // 清空队列
  const clearQueue = useCallback(() => {
    localStorage.removeItem(QUEUE_KEY);
    setQueue([]);
  }, []);

  // 同步队列
  const syncQueue = useCallback(
    async (processor: (action: QueuedAction) => Promise<boolean>) => {
      if (queue.length === 0 || !isOnline) return;

      setIsSyncing(true);
      const failedActions: QueuedAction[] = [];

      for (const action of queue) {
        try {
          const success = await processor(action);
          if (!success) {
            failedActions.push({ ...action, retryCount: action.retryCount + 1 });
          }
        } catch {
          failedActions.push({ ...action, retryCount: action.retryCount + 1 });
        }
      }

      // 只保留重试次数少于3次的
      const newQueue = failedActions.filter((a) => a.retryCount < 3);
      saveQueue(newQueue);
      setIsSyncing(false);
    },
    [queue, isOnline, saveQueue]
  );

  return {
    isOnline,
    queue,
    isSyncing,
    queueLength: queue.length,
    queueAction,
    removeAction,
    clearQueue,
    syncQueue,
  };
}
