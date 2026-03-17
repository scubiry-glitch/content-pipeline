import useSWR, { SWRConfiguration, mutate as swrMutate } from 'swr';
import { useEffect, useState } from 'react';

// 全局 SWR 配置
export const swrConfig: SWRConfiguration = {
  // 数据缓存 5 分钟
  dedupingInterval: 5 * 60 * 1000,
  // 错误重试间隔
  errorRetryInterval: 5000,
  // 最大重试次数
  errorRetryCount: 3,
  // 聚焦时重新验证
  revalidateOnFocus: true,
  // 重新连接时重新验证
  revalidateOnReconnect: true,
  // 缓存清理时间
  focusThrottleInterval: 5000,
};

// 网络状态检测 hook
export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isOfflineMode, setIsOfflineMode] = useState(false);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setIsOfflineMode(false);
      console.log('[SWR] 网络已恢复，重新验证数据...');
    };

    const handleOffline = () => {
      setIsOnline(false);
      setIsOfflineMode(true);
      console.log('[SWR] 网络已断开，使用缓存数据...');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return { isOnline, isOfflineMode };
}

// 自定义 fetcher，支持离线检测
export function createFetcher<T>(apiCall: () => Promise<T>) {
  return async (): Promise<T> => {
    if (!navigator.onLine) {
      throw new Error('offline');
    }
    return apiCall();
  };
}

// 封装 useSWR hook，添加离线支持
export function useCachedData<T>(
  key: string | null,
  fetcher: () => Promise<T>,
  options?: SWRConfiguration
) {
  const { isOnline } = useNetworkStatus();

  const { data, error, isLoading, mutate } = useSWR<T>(
    key,
    createFetcher(fetcher),
    {
      ...swrConfig,
      ...options,
      // 离线时不重新验证
      revalidateOnFocus: isOnline && swrConfig.revalidateOnFocus,
      revalidateOnReconnect: isOnline,
      // 错误时保留缓存数据
      keepPreviousData: true,
    }
  );

  return {
    data,
    error: error?.message === 'offline' ? null : error,
    isLoading,
    isOffline: !isOnline && !!data,
    mutate,
    refresh: () => mutate(),
  };
}

// 手动触发全局数据刷新
export { swrMutate as mutateCache };
