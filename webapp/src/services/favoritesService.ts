// 收藏服务 - Favorites Service
// 管理热点话题报告的收藏数据（持久化到后端）

import client from '../api/client';

export interface FavoriteReport {
  id: string;
  reportId: string;
  topicId: string;
  topicTitle: string;
  reportData: ExpertInsightReportData;
  createdAt: string;
}

export interface ExpertInsightReportData {
  id: string;
  topicId: string;
  topicTitle: string;
  generatedAt: string;
  seniorExpertReview?: {
    expertId: string;
    expertName: string;
    opinion: string;
    focusAreas: string[];
    suggestions: string[];
    confidence: number;
    timestamp: string;
  };
  domainExpertReviews: Array<{
    expertId: string;
    expertName: string;
    expertTitle: string;
    opinion: string;
    confidence: number;
  }>;
  synthesis: {
    keyInsights: string[];
    riskWarnings: string[];
    opportunities: string[];
    recommendations: string[];
  };
}

const STORAGE_KEY = 'favorite_reports';

// 获取用户收藏列表
export async function getFavorites(): Promise<FavoriteReport[]> {
  try {
    const response = await client.get('/favorites');
    return Array.isArray(response.data) ? response.data : [];
  } catch (error) {
    console.warn('API unavailable, falling back to localStorage');
    return getFavoritesFromLocal();
  }
}

// 添加收藏
export async function addFavorite(
  reportId: string,
  topicId: string,
  topicTitle: string,
  reportData: ExpertInsightReportData
): Promise<FavoriteReport> {
  try {
    const response = await client.post('/favorites', {
      reportId,
      topicId,
      topicTitle,
      reportData,
    });
    // 同步更新本地缓存
    addFavoriteToLocal(response.data);
    return response.data;
  } catch (error) {
    console.warn('API unavailable, using localStorage');
    return addFavoriteToLocal({
      id: `local-${Date.now()}`,
      reportId,
      topicId,
      topicTitle,
      reportData,
      createdAt: new Date().toISOString(),
    });
  }
}

// 取消收藏
export async function removeFavorite(reportId: string): Promise<void> {
  try {
    await client.delete(`/favorites/${reportId}`);
  } catch (error) {
    console.warn('API unavailable, removing from localStorage');
  }
  // 同时清理本地缓存
  removeFavoriteFromLocal(reportId);
}

// 检查是否已收藏
export async function isFavorite(reportId: string): Promise<boolean> {
  try {
    const response = await client.get(`/favorites/check/${reportId}`);
    return response.data.isFavorite;
  } catch (error) {
    return isFavoriteInLocal(reportId);
  }
}

// ===== localStorage 降级方案 =====

function getFavoritesFromLocal(): FavoriteReport[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
}

function addFavoriteToLocal(favorite: FavoriteReport): FavoriteReport {
  const favorites = getFavoritesFromLocal();
  if (!favorites.some((f) => f.reportId === favorite.reportId)) {
    favorites.push(favorite);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(favorites));
  }
  return favorite;
}

function removeFavoriteFromLocal(reportId: string): void {
  const favorites = getFavoritesFromLocal();
  const filtered = favorites.filter((f) => f.reportId !== reportId);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
}

function isFavoriteInLocal(reportId: string): boolean {
  const favorites = getFavoritesFromLocal();
  return favorites.some((f) => f.reportId === reportId);
}

// 同步本地缓存到服务器（网络恢复时使用）
export async function syncLocalFavorites(): Promise<void> {
  const local = getFavoritesFromLocal();
  for (const fav of local) {
    if (fav.id.startsWith('local-')) {
      try {
        await addFavorite(
          fav.reportId,
          fav.topicId,
          fav.topicTitle,
          fav.reportData
        );
      } catch (error) {
        console.error('Failed to sync favorite:', fav.reportId);
      }
    }
  }
}
