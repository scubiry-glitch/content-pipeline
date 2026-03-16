// 信源分级服务 - Source Credibility Service
// FR-009 ~ FR-010: 数据源可信度分级与过滤

export type SourceLevel = 'A' | 'B' | 'C' | 'D';

export interface SourceCredibilityConfig {
  minLevel: SourceLevel;
  autoFilter: boolean;
}

export interface CredibilityResult {
  level: SourceLevel;
  score: number; // 0-1
  source: string;
  reason: string;
}

// 预定义信源等级库
const SOURCE_LEVELS: Record<SourceLevel, { domains: string[]; score: number; description: string }> = {
  'A': {
    domains: [
      // 政府机构
      'gov.cn',
      'mohurd.gov.cn',
      'csrc.gov.cn',
      'pbc.gov.cn',
      'stats.gov.cn',
      'ndrc.gov.cn',
      'mof.gov.cn',
      'miit.gov.cn',
      'samr.gov.cn',
      'cbirc.gov.cn',
      // 官方交易所
      'sse.com.cn',
      'szse.cn',
      'hkexnews.hk',
      'cninfo.com.cn',
      // 官方财报
      'ir.baidu.com',
      'investor.alibaba.com',
      // 国际组织
      'worldbank.org',
      'imf.org',
      'wto.org',
    ],
    score: 0.95,
    description: '政府官网、官方财报、权威国际组织'
  },
  'B': {
    domains: [
      // 权威媒体
      'people.com.cn',
      'xinhuanet.com',
      'cctv.com',
      'chinanews.com',
      'caixin.com',
      '21cbh.com',
      'yicai.com',
      'jiemian.com',
      'cls.cn',
      'wallstreetcn.com',
      'hexun.com',
      'stcn.com',
      // 知名智库
      'cbnri.org',
      'cres.org.cn',
      'cass.org.cn',
      'cci.org.cn',
      // 头部券商
      'cicc.com',
      'gtja.com',
      'htsec.com',
      'xyzq.com.cn',
      'swsresearch.com',
      'cmschina.com',
      // 学术
      'sciencedirect.com',
      'springer.com',
      'cnki.net',
      'wanfangdata.com.cn',
    ],
    score: 0.8,
    description: '权威媒体、知名智库、头部券商、学术期刊'
  },
  'C': {
    domains: [
      // 行业媒体
      'cri.cn',
      'cs.com.cn',
      'time-weekly.com',
      'eeo.com.cn',
      'nbd.com.cn',
      'icaijing.com',
      'huxiu.com',
      'pedaily.cn',
      'chinaventure.com.cn',
      '36kr.com',
      'iheima.com',
      'tmtpost.com',
      // 自媒体平台
      'zhihu.com',
      'weibo.com',
      'mp.weixin.qq.com',
      'sohu.com',
      'sina.com.cn',
      'ifeng.com',
      'qq.com',
    ],
    score: 0.6,
    description: '行业媒体、自媒体平台'
  },
  'D': {
    domains: [
      // 论坛、问答
      'tieba.baidu.com',
      'zhihu.com/question',
      'douban.com',
      'tianya.cn',
      'mop.com',
      'bbs.',
      'forum.',
      // 未知来源
      'github.io',
      'wordpress.com',
      'blog.',
    ],
    score: 0.4,
    description: '论坛、问答社区、个人博客、未知来源'
  }
};

// 域名到等级的映射缓存
const domainLevelCache = new Map<string, SourceLevel>();

/**
 * 根据URL判断信源等级
 */
export function evaluateSource(url: string): CredibilityResult {
  const domain = extractDomain(url);

  // 检查缓存
  if (domainLevelCache.has(domain)) {
    const level = domainLevelCache.get(domain)!;
    return {
      level,
      score: SOURCE_LEVELS[level].score,
      source: domain,
      reason: SOURCE_LEVELS[level].description
    };
  }

  // 按优先级检查等级
  for (const level of ['A', 'B', 'C', 'D'] as SourceLevel[]) {
    const config = SOURCE_LEVELS[level];
    if (config.domains.some(d => domain.includes(d) || d.includes(domain))) {
      domainLevelCache.set(domain, level);
      return {
        level,
        score: config.score,
        source: domain,
        reason: config.description
      };
    }
  }

  // 默认C级
  domainLevelCache.set(domain, 'C');
  return {
    level: 'C',
    score: SOURCE_LEVELS['C'].score,
    source: domain,
    reason: '未识别的来源，默认按行业媒体处理'
  };
}

/**
 * 批量评估信源
 */
export function evaluateSources(urls: string[]): CredibilityResult[] {
  return urls.map(url => evaluateSource(url));
}

/**
 * 根据最低等级过滤数据
 */
export function filterByCredibility<T extends { url?: string; source?: string }>(
  items: T[],
  minLevel: SourceLevel
): T[] {
  const levelOrder: SourceLevel[] = ['D', 'C', 'B', 'A'];
  const minIndex = levelOrder.indexOf(minLevel);

  return items.filter(item => {
    const url = item.url || item.source || '';
    if (!url) return false;

    const result = evaluateSource(url);
    const itemIndex = levelOrder.indexOf(result.level);
    return itemIndex >= minIndex;
  });
}

/**
 * 获取信源等级配置
 */
export function getSourceLevelConfig(level: SourceLevel) {
  return SOURCE_LEVELS[level];
}

/**
 * 检查是否满足最低等级要求
 */
export function meetsCredibilityRequirement(url: string, minLevel: SourceLevel): boolean {
  const result = evaluateSource(url);
  const levelOrder: SourceLevel[] = ['D', 'C', 'B', 'A'];
  return levelOrder.indexOf(result.level) >= levelOrder.indexOf(minLevel);
}

/**
 * 提取域名
 */
function extractDomain(url: string): string {
  try {
    const urlObj = new URL(url.startsWith('http') ? url : `https://${url}`);
    return urlObj.hostname.toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

/**
 * 添加自定义信源规则
 */
export function addCustomSourceRule(domain: string, level: SourceLevel): void {
  SOURCE_LEVELS[level].domains.push(domain);
  // 清除缓存
  domainLevelCache.delete(domain);
}

/**
 * 获取所有信源等级说明
 */
export function getCredibilityGuide() {
  return {
    'A': { label: 'A级 - 权威', score: '0.9+', color: '#10b981', description: '政府官网、官方财报、国际组织' },
    'B': { label: 'B级 - 可信', score: '0.7-0.9', color: '#3b82f6', description: '权威媒体、知名智库、头部券商' },
    'C': { label: 'C级 - 参考', score: '0.5-0.7', color: '#f59e0b', description: '行业媒体、自媒体平台' },
    'D': { label: 'D级 - 谨慎', score: '<0.5', color: '#6b7280', description: '论坛、问答、个人博客' },
  };
}
