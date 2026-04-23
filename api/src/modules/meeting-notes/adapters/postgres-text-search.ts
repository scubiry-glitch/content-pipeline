// TextSearchAdapter — PostgreSQL tsvector 的占位实现
// PR3 起 axis computer 若需全文检索再补齐；此处保留接口与 content-library 一致

import type {
  DatabaseAdapter,
  TextSearchAdapter,
  TextSearchOptions,
  TextSearchResult,
} from '../types.js';

export class PostgresTextSearch implements TextSearchAdapter {
  constructor(private readonly db: DatabaseAdapter) {}

  async search(_query: string, _options?: TextSearchOptions): Promise<TextSearchResult[]> {
    // PR3 起按需落地（mn_judgments / mn_decisions / mn_open_questions 等 tsvector 查询）
    return [];
  }

  async index(_id: string, _content: string, _metadata?: Record<string, any>): Promise<void> {
    // 写入由各 axis computer 直接做；本 adapter 仅留接口
  }
}
