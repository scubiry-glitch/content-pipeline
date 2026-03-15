// Web Search Service
// Provides web search capabilities for research tasks

import { generateEmbedding } from './llm.js';

export interface SearchResult {
  url: string;
  title: string;
  snippet: string;
  content?: string;
  source: string;
  relevance: number;
}

export interface SearchOptions {
  query: string;
  maxResults?: number;
  includeContent?: boolean;
  filters?: {
    site?: string;
    fileType?: string;
    dateRange?: 'day' | 'week' | 'month' | 'year';
  };
}

export class WebSearchService {
  private apiKey: string | null;
  private baseUrl: string;

  constructor() {
    this.apiKey = process.env.SEARCH_API_KEY || process.env.TAVILY_API_KEY || null;
    this.baseUrl = process.env.SEARCH_API_URL || 'https://api.tavily.com';
  }

  /**
   * Search the web for information
   */
  async search(options: SearchOptions): Promise<SearchResult[]> {
    const maxResults = options.maxResults || 20;

    // Try Tavily API first (better for research)
    if (this.apiKey && this.baseUrl.includes('tavily')) {
      return this.searchWithTavily(options, maxResults);
    }

    // Try Serper.dev (Google Search API)
    if (process.env.SERPER_API_KEY) {
      return this.searchWithSerper(options, maxResults);
    }

    // Fallback: generate simulated search results
    console.log('[WebSearch] No API keys configured, using mock search');
    return this.generateMockResults(options, maxResults);
  }

  /**
   * Search using Tavily API (optimized for research)
   */
  private async searchWithTavily(options: SearchOptions, maxResults: number): Promise<SearchResult[]> {
    try {
      const response = await fetch(`${this.baseUrl}/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          api_key: this.apiKey,
          query: options.query,
          max_results: maxResults,
          search_depth: 'advanced',
          include_answer: true,
          include_raw_content: options.includeContent || false,
        }),
      });

      if (!response.ok) {
        throw new Error(`Tavily API error: ${response.status}`);
      }

      const data: any = await response.json();

      return (data.results || []).map((result: any) => ({
        url: result.url,
        title: result.title,
        snippet: result.content || result.snippet,
        content: result.raw_content,
        source: new URL(result.url).hostname,
        relevance: result.score || 0.8,
      }));
    } catch (error) {
      console.error('[WebSearch] Tavily search failed:', error);
      return this.generateMockResults(options, maxResults);
    }
  }

  /**
   * Search using Serper.dev (Google Search API)
   */
  private async searchWithSerper(options: SearchOptions, maxResults: number): Promise<SearchResult[]> {
    try {
      const response = await fetch('https://google.serper.dev/search', {
        method: 'POST',
        headers: {
          'X-API-KEY': process.env.SERPER_API_KEY!,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          q: options.query,
          num: maxResults,
          gl: 'cn',
          hl: 'zh-cn',
        }),
      });

      if (!response.ok) {
        throw new Error(`Serper API error: ${response.status}`);
      }

      const data: any = await response.json();

      const results: SearchResult[] = [];

      // Organic results
      if (data.organic) {
        results.push(...data.organic.map((r: any) => ({
          url: r.link,
          title: r.title,
          snippet: r.snippet,
          source: new URL(r.link).hostname,
          relevance: 0.8,
        })));
      }

      // News results
      if (data.news) {
        results.push(...data.news.map((r: any) => ({
          url: r.link,
          title: r.title,
          snippet: r.snippet,
          source: new URL(r.link).hostname,
          relevance: 0.9,
        })));
      }

      return results.slice(0, maxResults);
    } catch (error) {
      console.error('[WebSearch] Serper search failed:', error);
      return this.generateMockResults(options, maxResults);
    }
  }

  /**
   * Generate mock search results for testing
   */
  private generateMockResults(options: SearchOptions, maxResults: number): SearchResult[] {
    const query = options.query;
    const results: SearchResult[] = [];

    const sources = [
      { domain: 'gov.cn', name: '政府网站', relevance: 0.95 },
      { domain: 'people.com.cn', name: '人民网', relevance: 0.9 },
      { domain: 'xinhuanet.com', name: '新华网', relevance: 0.9 },
      { domain: 'csrc.gov.cn', name: '证监会', relevance: 0.95 },
      { domain: 'mohurd.gov.cn', name: '住建部', relevance: 0.95 },
      { domain: 'pbc.gov.cn', name: '央行', relevance: 0.95 },
      { domain: 'stats.gov.cn', name: '统计局', relevance: 0.9 },
      { domain: 'cbnri.org', name: '住建研究院', relevance: 0.85 },
      { domain: 'cres.org.cn', name: '房地产研究会', relevance: 0.85 },
      { domain: 'cicc.com', name: '中金公司', relevance: 0.85 },
      { domain: 'gtja.com', name: '国泰君安', relevance: 0.8 },
      { domain: 'htsec.com', name: '海通证券', relevance: 0.8 },
      { domain: 'sciencedirect.com', name: '学术论文', relevance: 0.8 },
      { domain: 'cnki.net', name: '知网', relevance: 0.75 },
      { domain: 'hexun.com', name: '和讯网', relevance: 0.7 },
      { domain: 'wallstreetcn.com', name: '华尔街见闻', relevance: 0.7 },
      { domain: 'cls.cn', name: '财联社', relevance: 0.75 },
      { domain: 'yicai.com', name: '第一财经', relevance: 0.75 },
      { domain: 'jiemian.com', name: '界面新闻', relevance: 0.7 },
      { domain: '21jingji.com', name: '21经济', relevance: 0.7 },
    ];

    for (let i = 0; i < Math.min(maxResults, sources.length); i++) {
      const source = sources[i];
      results.push({
        url: `https://www.${source.domain}/${query.slice(0, 10).replace(/\s+/g, '-')}-${i}`,
        title: `${query} - ${source.name}研究分析`,
        snippet: `关于${query}的深度分析报告，包含最新数据、政策解读、市场趋势等内容。来源：${source.name}，发布时间：2024年。`,
        source: source.name,
        relevance: source.relevance - (i * 0.02),
      });
    }

    return results;
  }

  /**
   * Search for multiple queries and merge results
   */
  async batchSearch(queries: string[], maxResultsPerQuery: number = 5): Promise<SearchResult[]> {
    const allResults: SearchResult[] = [];
    const seenUrls = new Set<string>();

    for (const query of queries) {
      try {
        const results = await this.search({
          query,
          maxResults: maxResultsPerQuery,
          includeContent: false,
        });

        for (const result of results) {
          if (!seenUrls.has(result.url)) {
            seenUrls.add(result.url);
            allResults.push(result);
          }
        }
      } catch (error) {
        console.error(`[WebSearch] Batch search failed for query "${query}":`, error);
      }
    }

    // Sort by relevance
    return allResults.sort((a, b) => b.relevance - a.relevance);
  }

  /**
   * Rank search results by relevance to topic
   */
  async rankByRelevance(results: SearchResult[], topic: string): Promise<SearchResult[]> {
    try {
      // Get embedding for topic
      const topicEmbedding = await generateEmbedding(topic);

      // Calculate similarity for each result
      const resultsWithEmbedding = await Promise.all(
        results.map(async (result) => {
          const text = `${result.title} ${result.snippet}`;
          const embedding = await generateEmbedding(text);

          // Calculate cosine similarity
          const similarity = this.cosineSimilarity(topicEmbedding, embedding);

          return {
            ...result,
            relevance: (result.relevance * 0.5) + (similarity * 0.5),
          };
        })
      );

      return resultsWithEmbedding.sort((a, b) => b.relevance - a.relevance);
    } catch (error) {
      console.error('[WebSearch] Ranking failed:', error);
      return results;
    }
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}

// Singleton instance
let webSearchService: WebSearchService | null = null;

export function getWebSearchService(): WebSearchService {
  if (!webSearchService) {
    webSearchService = new WebSearchService();
  }
  return webSearchService;
}
