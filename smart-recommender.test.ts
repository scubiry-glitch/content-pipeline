import { describe, it, expect, beforeEach, vi } from 'vitest';

// ==================== SmartRecommender 测试 ====================

describe('SmartRecommender', () => {
  let recommender: SmartRecommender;
  let mockDb: any;

  beforeEach(() => {
    mockDb = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
      recordBehavior: vi.fn().mockResolvedValue(undefined),
      getUserProfile: vi.fn().mockResolvedValue(null),
      saveUserProfile: vi.fn().mockResolvedValue(undefined)
    };
    recommender = new SmartRecommender(mockDb);
  });

  describe('用户行为追踪', () => {
    it('应该记录用户查看行为', async () => {
      await recommender.recordBehavior('user1', 'topic1', 'view');
      expect(mockDb.recordBehavior).toHaveBeenCalledWith('user1', 'topic1', 'view');
    });

    it('应该记录用户点赞行为', async () => {
      await recommender.recordBehavior('user1', 'topic1', 'like');
      const score = recommender.getBehaviorScore('like');
      expect(score).toBeGreaterThan(recommender.getBehaviorScore('view'));
    });

    it('应该记录用户分享行为', async () => {
      await recommender.recordBehavior('user1', 'topic1', 'share');
      const score = recommender.getBehaviorScore('share');
      expect(score).toBeGreaterThan(recommender.getBehaviorScore('like'));
    });

    it('应该支持批量记录行为', async () => {
      const behaviors = [
        { userId: 'user1', topicId: 'topic1', action: 'view' },
        { userId: 'user1', topicId: 'topic2', action: 'like' }
      ];
      await recommender.recordBatchBehaviors(behaviors);
      expect(mockDb.recordBehavior).toHaveBeenCalledTimes(2);
    });
  });

  describe('兴趣画像构建', () => {
    it('应该基于行为构建兴趣画像', async () => {
      const behaviors = [
        { topicId: 'AI', action: 'like', timestamp: new Date() },
        { topicId: 'AI', action: 'share', timestamp: new Date() },
        { topicId: 'Finance', action: 'view', timestamp: new Date() }
      ];

      const profile = await recommender.buildInterestProfile('user1', behaviors);
      expect(profile.getInterest('AI')).toBeGreaterThan(profile.getInterest('Finance'));
    });

    it('应该过滤低权重兴趣', async () => {
      const behaviors = Array(100).fill(null).map(() => ({
        topicId: 'Tech',
        action: 'view',
        timestamp: new Date()
      }));
      behaviors.push({ topicId: 'Rare', action: 'like', timestamp: new Date() });

      const profile = await recommender.buildInterestProfile('user1', behaviors);
      expect(profile.getInterest('Rare')).toBeGreaterThan(0);
    });

    it('应该保存用户画像到数据库', async () => {
      const profile = new UserInterestProfile('user1');
      profile.addInterest('AI', 0.8);
      await recommender.saveUserProfile('user1', profile);
      expect(mockDb.saveUserProfile).toHaveBeenCalledWith('user1', expect.any(Object));
    });

    it('应该从数据库加载用户画像', async () => {
      mockDb.getUserProfile.mockResolvedValue({
        user_id: 'user1',
        interests: { AI: 0.8, Finance: 0.5 }
      });

      const profile = await recommender.loadUserProfile('user1');
      expect(profile.interests['AI']).toBe(0.8);
    });
  });

  describe('协同过滤推荐', () => {
    it('应该找到相似用户', async () => {
      const userBehaviors = {
        'user1': ['AI', 'Blockchain', 'Finance'],
        'user2': ['AI', 'Blockchain', 'Tech'],
        'user3': ['Sports', 'Entertainment']
      };

      const similarUsers = recommender.findSimilarUsers('user1', userBehaviors);
      expect(similarUsers).toContain('user2');
      expect(similarUsers).not.toContain('user3');
    });

    it('应该计算用户相似度', () => {
      const similarity = recommender.calculateUserSimilarity(
        ['AI', 'Blockchain', 'Finance'],
        ['AI', 'Blockchain', 'Tech']
      );
      expect(similarity).toBeGreaterThanOrEqual(0.5);
      expect(similarity).toBeLessThan(1);
    });

    it('应该基于相似用户推荐话题', async () => {
      const similarUsers = ['user2', 'user3'];
      const theirBehaviors = {
        'user2': [{ topicId: 'new-topic', action: 'like' }],
        'user3': [{ topicId: 'other-topic', action: 'view' }]
      };

      const recommendations = await recommender.collaborativeFiltering(
        'user1',
        similarUsers,
        theirBehaviors
      );
      expect(recommendations.length).toBeGreaterThan(0);
    });
  });

  describe('内容相似度推荐', () => {
    it('应该提取话题关键词', () => {
      const topic = {
        title: 'AI breakthrough in healthcare',
        summary: 'New AI model helps doctors diagnose diseases',
        tags: ['AI', 'Healthcare', 'Technology']
      };

      const keywords = recommender.extractKeywords(topic);
      expect(keywords).toContain('AI');
      expect(keywords).toContain('Healthcare');
    });

    it('应该计算话题相似度', () => {
      const topic1 = { keywords: ['AI', 'Healthcare', 'Tech'], weight: 1 };
      const topic2 = { keywords: ['AI', 'Medical', 'Tech'], weight: 1 };

      const similarity = recommender.calculateTopicSimilarity(topic1, topic2);
      expect(similarity).toBeGreaterThan(0.3);
      expect(similarity).toBeLessThan(1);
    });

    it('应该基于历史喜好推荐相似话题', () => {
      const history = [
        { id: 't1', keywords: ['AI', 'Tech'] },
        { id: 't2', keywords: ['Finance', 'Stock'] }
      ];
      const candidates = [
        { id: 't3', keywords: ['AI', 'ML'] },
        { id: 't4', keywords: ['Sports', 'Game'] }
      ];

      const recommendations = recommender.contentBasedRecommendation(history, candidates);
      expect(recommendations[0].id).toBe('t3');
    });
  });

  describe('综合推荐引擎', () => {
    it('应该生成综合推荐分数', () => {
      const topic = { id: 't1', hotScore: 80 };
      const userProfile = { interests: { AI: 0.8 } };
      const topicRelevance = 0.9;
      const collaborativeScore = 0.7;

      const score = recommender.calculateRecommendationScore(
        topic,
        userProfile,
        topicRelevance,
        collaborativeScore
      );

      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThanOrEqual(100);
    });

    it('应该返回排序后的推荐列表', async () => {
      const hotTopics = [
        { id: 't1', title: 'AI News', category: 'Tech', hotScore: 90 },
        { id: 't2', title: 'Finance Update', category: 'Finance', hotScore: 85 },
        { id: 't3', title: 'Tech Review', category: 'Tech', hotScore: 80 }
      ];

      mockDb.getUserProfile.mockResolvedValue({
        interests: { Tech: 0.9, Finance: 0.3 }
      });

      const recommendations = await recommender.getRecommendations('user1', hotTopics, 5);
      expect(recommendations.length).toBeGreaterThan(0);
      expect(recommendations[0]).toHaveProperty('score');
      expect(recommendations[0]).toHaveProperty('reason');
    });

    it('应该提供推荐理由', async () => {
      const hotTopics = [{ id: 't1', title: 'AI News', category: 'Tech' }];
      mockDb.getUserProfile.mockResolvedValue({ interests: { Tech: 0.8 } });

      const recommendations = await recommender.getRecommendations('user1', hotTopics, 5);
      expect(recommendations[0].reason).toContain('Tech');
    });

    it('应该保证推荐多样性', async () => {
      const hotTopics = Array(20).fill(null).map((_, i) => ({
        id: `t${i}`,
        category: i < 15 ? 'Tech' : 'Finance'
      }));

      const recommendations = await recommender.getRecommendations('user1', hotTopics, 10);
      const categories = new Set(recommendations.map(r => r.category));
      expect(categories.size).toBeGreaterThan(1);
    });
  });

  describe('反馈学习', () => {
    it('应该根据反馈调整推荐权重', async () => {
      await recommender.recordFeedback('user1', 'topic1', 'like');
      const adjustment = recommender.calculateWeightAdjustment('like');
      expect(adjustment).toBeGreaterThan(0);
    });

    it('应该忽略不感兴趣的内容', async () => {
      await recommender.recordFeedback('user1', 'topic1', 'ignore');
      const adjustment = recommender.calculateWeightAdjustment('ignore');
      expect(adjustment).toBeLessThan(0);
    });

    it('应该支持实时学习', async () => {
      const initialProfile = { interests: { AI: 0.5 } };
      await recommender.updateProfileFromFeedback('user1', 'AI', 'like');
      expect(mockDb.saveUserProfile).toHaveBeenCalled();
    });
  });

  describe('性能要求', () => {
    it('推荐计算应该在100ms内完成', async () => {
      const hotTopics = Array(100).fill(null).map((_, i) => ({
        id: `t${i}`,
        title: `Topic ${i}`,
        category: 'Tech'
      }));

      const start = Date.now();
      await recommender.getRecommendations('user1', hotTopics, 10);
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(100);
    });

    it('应该支持批量推荐', async () => {
      const users = ['user1', 'user2', 'user3'];
      const topics = [{ id: 't1', title: 'Test' }];

      const results = await recommender.getBatchRecommendations(users, topics, 5);
      expect(Object.keys(results)).toHaveLength(3);
    });
  });
});

// ==================== UserInterestProfile 测试 ====================

describe('UserInterestProfile', () => {
  let profile: UserInterestProfile;

  beforeEach(() => {
    profile = new UserInterestProfile('user1');
  });

  it('应该初始化空兴趣图谱', () => {
    expect(profile.getInterests()).toEqual({});
  });

  it('应该添加兴趣', () => {
    profile.addInterest('AI', 0.8);
    expect(profile.getInterest('AI')).toBe(0.8);
  });

  it('应该更新兴趣权重', () => {
    profile.addInterest('AI', 0.5);
    profile.addInterest('AI', 0.3);
    expect(profile.getInterest('AI')).toBeGreaterThan(0.5);
  });

  it('应该获取TopN兴趣', () => {
    profile.addInterest('AI', 0.9);
    profile.addInterest('Finance', 0.7);
    profile.addInterest('Sports', 0.3);

    const topInterests = profile.getTopInterests(2);
    expect(topInterests).toHaveLength(2);
    expect(topInterests[0].topic).toBe('AI');
  });

  it('应该支持兴趣衰减', () => {
    profile.addInterest('AI', 0.8);
    profile.applyDecay(0.9);
    expect(profile.getInterest('AI')).toBeLessThan(0.8);
  });

  it('应该序列化为JSON', () => {
    profile.addInterest('AI', 0.8);
    const json = profile.toJSON();
    expect(json).toEqual({ AI: 0.8 });
  });

  it('应该从JSON加载', () => {
    const loaded = UserInterestProfile.fromJSON('user1', { AI: 0.8 });
    expect(loaded.getInterest('AI')).toBe(0.8);
  });
});

// ==================== 类型定义 ====================

interface UserBehavior {
  userId: string;
  topicId: string;
  action: 'view' | 'like' | 'share' | 'ignore';
  timestamp: Date;
}

interface UserProfile {
  userId: string;
  interests: Record<string, number>;
  updatedAt: Date;
}

interface HotTopic {
  id: string;
  title: string;
  category: string;
  hotScore: number;
  keywords?: string[];
}

interface RecommendedTopic {
  id: string;
  title: string;
  category: string;
  score: number;
  reason: string;
  hotScore: number;
}

// ==================== 实现 ====================

class UserInterestProfile {
  private interests: Map<string, number> = new Map();

  constructor(private userId: string) {}

  addInterest(topic: string, weight: number): void {
    const current = this.interests.get(topic) || 0;
    // 使用sigmoid-like函数平滑增长
    const increase = weight * (1 - current);
    this.interests.set(topic, Math.min(1, current + increase));
  }

  getInterest(topic: string): number {
    return this.interests.get(topic) || 0;
  }

  getInterests(): Record<string, number> {
    return Object.fromEntries(this.interests);
  }

  getTopInterests(n: number): Array<{ topic: string; weight: number }> {
    return Array.from(this.interests.entries())
      .map(([topic, weight]) => ({ topic, weight }))
      .sort((a, b) => b.weight - a.weight)
      .slice(0, n);
  }

  applyDecay(factor: number): void {
    for (const [topic, weight] of this.interests) {
      this.interests.set(topic, weight * factor);
    }
    // 移除过低的兴趣
    for (const [topic, weight] of this.interests) {
      if (weight < 0.1) this.interests.delete(topic);
    }
  }

  toJSON(): Record<string, number> {
    return this.getInterests();
  }

  static fromJSON(userId: string, data: Record<string, number>): UserInterestProfile {
    const profile = new UserInterestProfile(userId);
    for (const [topic, weight] of Object.entries(data)) {
      profile.addInterest(topic, weight);
    }
    return profile;
  }
}

class SmartRecommender {
  private behaviorWeights: Record<string, number> = {
    view: 1,
    like: 3,
    share: 5,
    ignore: -2
  };

  constructor(private db: any) {}

  getBehaviorScore(action: string): number {
    return this.behaviorWeights[action] || 0;
  }

  async recordBehavior(userId: string, topicId: string, action: string): Promise<void> {
    await this.db.recordBehavior(userId, topicId, action);
  }

  async recordBatchBehaviors(behaviors: UserBehavior[]): Promise<void> {
    for (const b of behaviors) {
      await this.recordBehavior(b.userId, b.topicId, b.action);
    }
  }

  async buildInterestProfile(userId: string, behaviors: UserBehavior[]): Promise<UserInterestProfile> {
    const profile = new UserInterestProfile(userId);

    for (const behavior of behaviors) {
      const weight = this.getBehaviorScore(behavior.action);
      if (weight > 0) {
        profile.addInterest(behavior.topicId, weight * 0.01);
      }
    }

    return profile;
  }

  async saveUserProfile(userId: string, profile: UserInterestProfile): Promise<void> {
    await this.db.saveUserProfile(userId, profile.toJSON());
  }

  async loadUserProfile(userId: string): Promise<UserInterestProfile> {
    const data = await this.db.getUserProfile(userId);
    if (!data) return new UserInterestProfile(userId);
    return UserInterestProfile.fromJSON(userId, data.interests);
  }

  findSimilarUsers(userId: string, allBehaviors: Record<string, string[]>): string[] {
    const userInterests = allBehaviors[userId] || [];
    const similarities: Array<{ userId: string; similarity: number }> = [];

    for (const [otherId, interests] of Object.entries(allBehaviors)) {
      if (otherId === userId) continue;
      const similarity = this.calculateUserSimilarity(userInterests, interests);
      if (similarity > 0.3) {
        similarities.push({ userId: otherId, similarity });
      }
    }

    return similarities
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 5)
      .map(s => s.userId);
  }

  calculateUserSimilarity(interests1: string[], interests2: string[]): number {
    const set1 = new Set(interests1);
    const set2 = new Set(interests2);

    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);

    return intersection.size / union.size;
  }

  async collaborativeFiltering(
    userId: string,
    similarUsers: string[],
    theirBehaviors: Record<string, UserBehavior[]>
  ): Promise<RecommendedTopic[]> {
    const recommendations: Map<string, RecommendedTopic> = new Map();

    for (const similarUser of similarUsers) {
      const behaviors = theirBehaviors[similarUser] || [];
      for (const behavior of behaviors) {
        if (behavior.action === 'like' || behavior.action === 'share') {
          const existing = recommendations.get(behavior.topicId);
          if (existing) {
            existing.score += this.getBehaviorScore(behavior.action);
          } else {
            recommendations.set(behavior.topicId, {
              id: behavior.topicId,
              title: '',
              category: '',
              score: this.getBehaviorScore(behavior.action),
              reason: '相似用户喜欢',
              hotScore: 0
            });
          }
        }
      }
    }

    return Array.from(recommendations.values()).sort((a, b) => b.score - a.score);
  }

  extractKeywords(topic: any): string[] {
    const keywords: string[] = [];
    if (topic.tags) keywords.push(...topic.tags);
    if (topic.category) keywords.push(topic.category);

    // 简单的关键词提取（实际应用需要NLP）
    const text = `${topic.title} ${topic.summary || ''}`;
    const words = text.toLowerCase().match(/\b[a-z]+\b/g) || [];
    const commonWords = new Set(['the', 'a', 'an', 'in', 'on', 'at', 'to', 'for', 'of']);
    const importantWords = words.filter(w => !commonWords.has(w) && w.length > 3);

    keywords.push(...new Set(importantWords));
    return keywords.slice(0, 10);
  }

  calculateTopicSimilarity(topic1: any, topic2: any): number {
    const keywords1 = new Set(topic1.keywords || []);
    const keywords2 = new Set(topic2.keywords || []);

    const intersection = new Set([...keywords1].filter(x => keywords2.has(x)));
    const union = new Set([...keywords1, ...keywords2]);

    return union.size === 0 ? 0 : intersection.size / union.size;
  }

  contentBasedRecommendation(history: any[], candidates: any[]): RecommendedTopic[] {
    // 构建用户历史关键词偏好
    const userKeywords = new Map<string, number>();
    for (const item of history) {
      for (const kw of item.keywords || []) {
        userKeywords.set(kw, (userKeywords.get(kw) || 0) + 1);
      }
    }

    // 计算候选话题与历史的相似度
    const scored = candidates.map(candidate => {
      const candidateKeywords = new Set(candidate.keywords || []);
      let score = 0;
      for (const [kw, weight] of userKeywords) {
        if (candidateKeywords.has(kw)) {
          score += weight;
        }
      }
      return { ...candidate, score };
    });

    return scored
      .filter(c => c.score > 0)
      .sort((a, b) => b.score - a.score)
      .map(c => ({
        id: c.id,
        title: c.title,
        category: c.category,
        score: c.score,
        reason: '与您感兴趣的话题相似',
        hotScore: c.hotScore || 0
      }));
  }

  calculateRecommendationScore(
    topic: HotTopic,
    userProfile: UserProfile,
    topicRelevance: number,
    collaborativeScore: number
  ): number {
    const contentWeight = 0.4;
    const collaborativeWeight = 0.3;
    const trendingWeight = 0.2;
    const diversityWeight = 0.1;

    const normalizedHotScore = (topic.hotScore || 50) / 100;
    const interestBonus = userProfile.interests[topic.category] || 0;

    const score =
      topicRelevance * contentWeight * 100 +
      collaborativeScore * collaborativeWeight * 100 +
      normalizedHotScore * trendingWeight * 100 +
      interestBonus * diversityWeight * 100;

    return Math.min(100, Math.round(score));
  }

  async getRecommendations(
    userId: string,
    hotTopics: HotTopic[],
    limit: number
  ): Promise<RecommendedTopic[]> {
    const userProfile = await this.loadUserProfile(userId);
    const recommendations: RecommendedTopic[] = [];

    for (const topic of hotTopics) {
      const topicRelevance = userProfile.getInterest(topic.category) * 0.5 +
        (topic.keywords || []).filter(kw => userProfile.getInterest(kw) > 0).length * 0.1;

      const score = this.calculateRecommendationScore(
        topic,
        { userId, interests: userProfile.getInterests(), updatedAt: new Date() },
        topicRelevance,
        0.5 // 简化：固定协同分数
      );

      recommendations.push({
        id: topic.id,
        title: topic.title,
        category: topic.category,
        score,
        reason: this.generateReason(topic, userProfile),
        hotScore: topic.hotScore
      });
    }

    // 排序并加入多样性
    return this.diversifyRecommendations(
      recommendations.sort((a, b) => b.score - a.score),
      limit
    );
  }

  generateReason(topic: HotTopic, profile: UserInterestProfile): string {
    const interest = profile.getInterest(topic.category);
    if (interest > 0.7) return `基于您的${topic.category}偏好推荐`;
    if (topic.hotScore > 90) return '当前热门话题';
    return '您可能感兴趣';
  }

  diversifyRecommendations(recommendations: RecommendedTopic[], limit: number): RecommendedTopic[] {
    const result: RecommendedTopic[] = [];
    const categoryCount: Record<string, number> = {};

    for (const rec of recommendations) {
      const count = categoryCount[rec.category] || 0;
      // 每个类别最多3个
      if (count < 3 && result.length < limit) {
        result.push(rec);
        categoryCount[rec.category] = count + 1;
      }
    }

    return result;
  }

  calculateWeightAdjustment(action: string): number {
    const adjustments: Record<string, number> = {
      like: 0.1,
      share: 0.15,
      ignore: -0.05,
      view: 0.02
    };
    return adjustments[action] || 0;
  }

  async recordFeedback(userId: string, topicId: string, action: string): Promise<void> {
    await this.recordBehavior(userId, topicId, action as any);
  }

  async updateProfileFromFeedback(userId: string, topic: string, action: string): Promise<void> {
    const profile = await this.loadUserProfile(userId);
    const adjustment = this.calculateWeightAdjustment(action);
    profile.addInterest(topic, adjustment);
    await this.saveUserProfile(userId, profile);
  }

  async getBatchRecommendations(
    userIds: string[],
    topics: HotTopic[],
    limit: number
  ): Promise<Record<string, RecommendedTopic[]>> {
    const results: Record<string, RecommendedTopic[]> = {};

    for (const userId of userIds) {
      results[userId] = await this.getRecommendations(userId, topics, limit);
    }

    return results;
  }
}

export { SmartRecommender, UserInterestProfile };
