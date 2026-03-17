// assetUsageService.ts
// v3.0.2: 素材引用统计服务

import { assetsApi, type AssetUsage, type PopularAsset } from '../api/client';

export interface AssetUsageReport {
  totalAssets: number;
  quotedAssets: number;
  totalQuotes: number;
  topAssets: PopularAsset[];
  unusedAssets: string[];
}

class AssetUsageService {
  private static instance: AssetUsageService;

  static getInstance(): AssetUsageService {
    if (!AssetUsageService.instance) {
      AssetUsageService.instance = new AssetUsageService();
    }
    return AssetUsageService.instance;
  }

  // 获取单个素材的使用统计
  async getUsageStats(assetId: string): Promise<AssetUsage | null> {
    try {
      const stats = await assetsApi.getUsageStats(assetId);
      return stats;
    } catch (err) {
      console.error('Failed to get usage stats:', err);
      return null;
    }
  }

  // 获取热门素材TopN
  async getPopularAssets(limit: number = 10): Promise<PopularAsset[]> {
    try {
      const result = await assetsApi.getPopularAssets(limit);
      return result.items || [];
    } catch (err) {
      console.error('Failed to get popular assets:', err);
      return [];
    }
  }

  // 生成素材使用报告
  async generateReport(allAssetIds: string[]): Promise<AssetUsageReport> {
    const [popularAssets, ...allStats] = await Promise.all([
      this.getPopularAssets(10),
      ...allAssetIds.map(id => this.getUsageStats(id)),
    ]);

    const stats = allStats.filter(Boolean) as AssetUsage[];
    const quotedAssets = stats.filter(s => s.quoteCount > 0);
    const totalQuotes = stats.reduce((sum, s) => sum + s.quoteCount, 0);
    const unusedAssets = allAssetIds.filter(id =>
      !stats.some(s => s.assetId === id && s.quoteCount > 0)
    );

    return {
      totalAssets: allAssetIds.length,
      quotedAssets: quotedAssets.length,
      totalQuotes,
      topAssets: popularAssets,
      unusedAssets,
    };
  }

  // 记录素材引用
  async recordQuote(assetId: string, taskId: string): Promise<boolean> {
    try {
      await assetsApi.quote(assetId);
      return true;
    } catch (err) {
      console.error('Failed to record quote:', err);
      return false;
    }
  }
}

export const assetUsageService = AssetUsageService.getInstance();
export default assetUsageService;
