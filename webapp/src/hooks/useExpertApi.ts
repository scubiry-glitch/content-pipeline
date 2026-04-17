// 专家库数据 hooks — 统一 SWR 入口
// 页面通过这里消费专家/调度/辩论的远端数据，替代散落的 useEffect + useState 拉取
//
// 与 services/expertService 保持独立：本层仅封装 API 访问，不修改 expertService
// 内存缓存；expertService 的本地派生计算（embeddings/feedback/workload）仍由
// 其自身的 initExpertsFromApi() 流程管理，互不干扰。

import { useCachedData } from './useSWRConfig';
import { expertLibraryApi } from '../api/client';
import type { Expert } from '../types';

// SWR 缓存 key — 与 URL 对齐，便于跨页共享缓存
const KEYS = {
  experts: (domain?: string) => `experts/full${domain ? `?domain=${domain}` : ''}`,
  workloads: 'scheduling/workloads',
  workload: (id: string) => `scheduling/workload/${id}`,
  availableExperts: (domain?: string) =>
    `scheduling/available${domain ? `?domain=${domain}` : ''}`,
  debates: (limit?: number) => `debates${limit ? `?limit=${limit}` : ''}`,
  debate: (id: string) => `debates/${id}`,
} as const;

export function useExperts(domain?: string) {
  const result = useCachedData(KEYS.experts(domain), () =>
    expertLibraryApi.getExpertsFull(domain),
  );
  const experts = (result.data?.experts ?? []) as Expert[];
  return {
    ...result,
    experts,
    total: result.data?.total ?? experts.length,
  };
}

export function useExpertWorkloads() {
  const result = useCachedData(KEYS.workloads, () =>
    expertLibraryApi.getWorkloads(),
  );
  return {
    ...result,
    workloads: result.data?.workloads ?? [],
    total: result.data?.total ?? 0,
  };
}

export function useExpertWorkload(expertId: string | null) {
  return useCachedData(
    expertId ? KEYS.workload(expertId) : null,
    () => expertLibraryApi.getWorkload(expertId!),
  );
}

export function useAvailableExperts(domain?: string) {
  const result = useCachedData(KEYS.availableExperts(domain), () =>
    expertLibraryApi.getAvailableExperts(domain),
  );
  return {
    ...result,
    experts: result.data?.experts ?? [],
    total: result.data?.total ?? 0,
  };
}

export function useDebateHistory(limit?: number) {
  const result = useCachedData(KEYS.debates(limit), () =>
    expertLibraryApi.listDebates(limit),
  );
  return {
    ...result,
    debates: result.data?.debates ?? [],
    total: result.data?.total ?? 0,
  };
}

export function useDebate(id: string | null) {
  return useCachedData(
    id ? KEYS.debate(id) : null,
    () => expertLibraryApi.getDebate(id!),
  );
}

// 手动失效缓存（提交反馈、创建/更新专家后调用）
export { mutateCache } from './useSWRConfig';
export const EXPERT_API_KEYS = KEYS;
