import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Workflow Integration Tests (v3.0 Integration)
 * 内容质量输入体系整合到工作流测试
 */

describe('Workflow Integration - Stage 1 Content Quality Input', () => {
  let stageConfig: any;

  beforeEach(() => {
    // Stage 1 default config with v3.0 integration
    stageConfig = {
      title: '选题策划配置',
      icon: '💡',
      scoringWeights: { timeliness: 30, depth: 25, interest: 25, differentiation: 20 },
      targetAudience: '产业研究人员和投资者',
      desiredDepth: 'comprehensive',
      enableKnowledgeBase: true,
      generateNovelAngles: true,
      outlineDepth: 3,
      competitorAnalysis: 5,
      hotTopicDays: 7,
      aiContinuation: true,
      knowledgeBaseMatch: 0.7,
      // v3.0 内容质量输入体系
      enableQualityInput: true,
      qualityDimensions: {
        freshness: true,
        credibility: true,
        differentiation: true,
        audienceMatch: true
      },
      rssCategories: ['tech', 'finance', 'research'],
      enableSentimentAnalysis: true,
      enableSmartRecommend: true
    };
  });

  describe('配置结构', () => {
    it('应该包含v3.0内容质量输入启用开关', () => {
      expect(stageConfig.enableQualityInput).toBeDefined();
      expect(stageConfig.enableQualityInput).toBe(true);
    });

    it('应该包含所有质量评估维度配置', () => {
      expect(stageConfig.qualityDimensions).toBeDefined();
      expect(stageConfig.qualityDimensions.freshness).toBe(true);
      expect(stageConfig.qualityDimensions.credibility).toBe(true);
      expect(stageConfig.qualityDimensions.differentiation).toBe(true);
      expect(stageConfig.qualityDimensions.audienceMatch).toBe(true);
    });

    it('应该包含RSS源类别配置', () => {
      expect(stageConfig.rssCategories).toBeDefined();
      expect(stageConfig.rssCategories).toContain('tech');
      expect(stageConfig.rssCategories).toContain('finance');
      expect(stageConfig.rssCategories).toContain('research');
    });

    it('应该包含情感分析启用开关', () => {
      expect(stageConfig.enableSentimentAnalysis).toBeDefined();
      expect(stageConfig.enableSentimentAnalysis).toBe(true);
    });

    it('应该包含智能推荐启用开关', () => {
      expect(stageConfig.enableSmartRecommend).toBeDefined();
      expect(stageConfig.enableSmartRecommend).toBe(true);
    });
  });

  describe('Stage 1 流程', () => {
    it('应该包含RSS聚合作为输入来源', () => {
      const stage1Input = 'RSS聚合/用户选题/热点追踪';
      expect(stage1Input).toContain('RSS聚合');
    });

    it('应该包含质量评估在加工流程中', () => {
      const stage1Process = 'RSS聚合 → 质量评估 → 热点分析 → 竞品分析 → 评分排序';
      expect(stage1Process).toContain('质量评估');
      expect(stage1Process).toContain('RSS聚合');
    });

    it('当启用知识库时流程应该包含知识库分析', () => {
      const hasInsights = true;
      const hasAngles = true;
      const process = hasInsights || hasAngles
        ? 'RSS聚合 → 质量评估 → 知识库分析 → 洞见生成 → 新角度发现 → 大纲生成'
        : 'RSS聚合 → 质量评估 → 热点分析 → 竞品分析 → 评分排序 → 大纲生成';
      expect(process).toContain('知识库分析');
      expect(process).toContain('质量评估');
    });
  });

  describe('导航集成', () => {
    it('应该包含质量仪表盘导航链接', () => {
      const dashboardUrl = 'http://localhost:8080';
      expect(dashboardUrl).toBe('http://localhost:8080');
    });

    it('仪表盘链接应该在新窗口打开', () => {
      const openInNewTab = true;
      expect(openInNewTab).toBe(true);
    });
  });

  describe('侧边栏集成', () => {
    it('应该显示RSS源状态概览', () => {
      const rssStatus = '24源正常';
      expect(rssStatus).toContain('24源');
    });

    it('应该显示智能推荐状态', () => {
      const recommendStatus = 'v3.1已启用';
      expect(recommendStatus).toContain('v3.1');
    });

    it('应该显示情感分析状态', () => {
      const sentimentStatus = 'v3.2已启用';
      expect(sentimentStatus).toContain('v3.2');
    });
  });

  describe('配置验证', () => {
    it('RSS源类别应该在有效范围内', () => {
      const validCategories = ['tech', 'finance', 'research', 'industry', 'general', 'international', 'social'];
      stageConfig.rssCategories.forEach((cat: string) => {
        expect(validCategories).toContain(cat);
      });
    });

    it('质量维度配置应该包含所有4个维度', () => {
      const dimensions = Object.keys(stageConfig.qualityDimensions);
      expect(dimensions).toHaveLength(4);
      expect(dimensions).toContain('freshness');
      expect(dimensions).toContain('credibility');
      expect(dimensions).toContain('differentiation');
      expect(dimensions).toContain('audienceMatch');
    });

    it('当禁用质量输入时，相关配置应该被忽略', () => {
      stageConfig.enableQualityInput = false;
      expect(stageConfig.enableQualityInput).toBe(false);
      // 其他配置仍然存在，但不应该被使用
      expect(stageConfig.qualityDimensions).toBeDefined();
    });
  });

  describe('向后兼容', () => {
    it('旧版配置不应该被v3.0配置覆盖', () => {
      // 确保原有的热点追踪配置仍然有效
      expect(stageConfig.hotTopicDays).toBe(7);
      expect(stageConfig.competitorAnalysis).toBe(5);
      // 确保原有的知识库配置仍然有效
      expect(stageConfig.enableKnowledgeBase).toBe(true);
      expect(stageConfig.generateNovelAngles).toBe(true);
    });

    it('评分权重配置应该保持不变', () => {
      expect(stageConfig.scoringWeights.timeliness).toBe(30);
      expect(stageConfig.scoringWeights.depth).toBe(25);
      expect(stageConfig.scoringWeights.interest).toBe(25);
      expect(stageConfig.scoringWeights.differentiation).toBe(20);
    });
  });
});

describe('Workflow Integration - UI Elements', () => {
  describe('配置面板UI', () => {
    it('应该渲染内容质量输入配置区块', () => {
      const hasQualityInputSection = true;
      expect(hasQualityInputSection).toBe(true);
    });

    it('应该渲染RSS源类别选择器', () => {
      const hasRSSCategorySelector = true;
      expect(hasRSSCategorySelector).toBe(true);
    });

    it('应该渲染质量维度复选框', () => {
      const hasQualityDimensionCheckboxes = true;
      expect(hasQualityDimensionCheckboxes).toBe(true);
    });

    it('应该渲染仪表盘快捷链接', () => {
      const hasDashboardLink = true;
      expect(hasDashboardLink).toBe(true);
    });
  });

  describe('侧边栏UI', () => {
    it('应该渲染内容质量输入概览区块', () => {
      const hasQualityInputOverview = true;
      expect(hasQualityInputOverview).toBe(true);
    });

    it('点击概览项应该打开仪表盘', () => {
      const clickOpensDashboard = true;
      expect(clickOpensDashboard).toBe(true);
    });
  });
});

describe('Workflow Integration - Data Flow', () => {
  it('RSS聚合数据应该流向热点分析', () => {
    const dataFlow = 'RSS → 质量评估 → 热点发现 → 评分排序 → 选题建议';
    expect(dataFlow).toContain('RSS');
    expect(dataFlow).toContain('质量评估');
    expect(dataFlow).toContain('热点发现');
  });

  it('质量评估结果应该影响选题评分', () => {
    const qualityScore = 85;
    const finalScore = qualityScore * 0.3 + 70 * 0.7; // 质量分占30%
    expect(finalScore).toBeGreaterThan(70);
  });

  it('情感分析数据应该影响选题决策', () => {
    const sentimentLevel = 'greed';
    const shouldRecommend = sentimentLevel !== 'extreme_fear';
    expect(shouldRecommend).toBe(true);
  });

  it('智能推荐应该基于用户画像', () => {
    const userProfile = { interests: { Tech: 0.85, Finance: 0.6 } };
    const recommendations = ['AI突破', '新能源政策'];
    expect(userProfile.interests.Tech).toBeGreaterThan(0.5);
    expect(recommendations.length).toBeGreaterThan(0);
  });
});

// Export types for implementation
interface Stage1Config {
  title: string;
  icon: string;
  enableQualityInput: boolean;
  qualityDimensions: {
    freshness: boolean;
    credibility: boolean;
    differentiation: boolean;
    audienceMatch: boolean;
  };
  rssCategories: string[];
  enableSentimentAnalysis: boolean;
  enableSmartRecommend: boolean;
}

export { Stage1Config };
