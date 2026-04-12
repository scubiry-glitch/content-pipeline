// Content Library v7.1 — Wiki Generator
// 读取 content_entities + content_facts + asset_library，物化成 Obsidian 兼容的 markdown vault
//
// 设计要点:
// - 只读物化视图: 不改动数据库数据
// - Adapter 注入: 依赖 DatabaseAdapter + StorageAdapter (可复用 ContentLibraryDeps)
// - 幂等: 每次 generate() 会覆盖 wikiRoot，等于重新物化一次

import { promises as fs } from 'fs';
import * as path from 'path';
import type { DatabaseAdapter, ContentEntity, ContentFact } from '../types.js';
import {
  renderEntityPage,
  renderConceptPage,
  renderSourcePage,
  renderIndexPage,
  renderOverviewPlaceholder,
  renderObsidianConfig,
  slugify,
} from './templates.js';

export interface WikiGenerateOptions {
  /** 本地文件系统根目录 (绝对路径) */
  wikiRoot: string;
  /** 可选: 只生成指定 domain */
  domainFilter?: string;
  /** 实体上限 (避免全库生成时爆炸) */
  maxEntities?: number;
  /** 每实体的事实上限 */
  maxFactsPerEntity?: number;
}

export interface WikiGenerateResult {
  wikiRoot: string;
  filesWritten: number;
  entities: number;
  concepts: number;
  sources: number;
  durationMs: number;
  errors: string[];
}

export class WikiGenerator {
  private db: DatabaseAdapter;

  constructor(db: DatabaseAdapter) {
    this.db = db;
  }

  async generate(options: WikiGenerateOptions): Promise<WikiGenerateResult> {
    const started = Date.now();
    const wikiRoot = path.resolve(options.wikiRoot);
    const maxEntities = options.maxEntities || 500;
    const maxFactsPerEntity = options.maxFactsPerEntity || 50;
    const errors: string[] = [];
    let filesWritten = 0;

    // 1. 准备目录结构
    await fs.mkdir(wikiRoot, { recursive: true });
    await fs.mkdir(path.join(wikiRoot, 'entities'), { recursive: true });
    await fs.mkdir(path.join(wikiRoot, 'concepts'), { recursive: true });
    await fs.mkdir(path.join(wikiRoot, 'sources'), { recursive: true });
    await fs.mkdir(path.join(wikiRoot, '.obsidian'), { recursive: true });

    // 2. 加载数据
    const entities = await this.loadEntities(options.domainFilter, maxEntities);
    const facts = await this.loadFacts(options.domainFilter);
    const assetRows = await this.loadAssets(facts);

    // 3. 按 entity 分组 facts
    const factsBySubject = new Map<string, ContentFact[]>();
    for (const f of facts) {
      if (!f.subject) continue;
      const list = factsBySubject.get(f.subject) || [];
      list.push(f);
      factsBySubject.set(f.subject, list);
      // object 也可能是一个实体
      if (f.object) {
        const objList = factsBySubject.get(f.object) || [];
        objList.push(f);
        factsBySubject.set(f.object, objList);
      }
    }

    // 4. 生成实体页
    let entityCount = 0;
    for (const entity of entities) {
      const entityFacts = (factsBySubject.get(entity.canonicalName) || []).slice(0, maxFactsPerEntity);
      const neighbors = this.computeNeighbors(entity.canonicalName, entityFacts);
      const content = renderEntityPage({ entity, facts: entityFacts, neighbors });
      const filename = `${slugify(entity.canonicalName)}.md`;
      try {
        await fs.writeFile(path.join(wikiRoot, 'entities', filename), content, 'utf8');
        filesWritten++;
        entityCount++;
      } catch (err) {
        errors.push(`entity ${entity.canonicalName}: ${(err as Error).message}`);
      }
    }

    // 5. 按 domain 分组 facts → 生成概念页
    const factsByDomain = new Map<string, ContentFact[]>();
    for (const f of facts) {
      const domain = String(f.context?.domain || 'uncategorized');
      const list = factsByDomain.get(domain) || [];
      list.push(f);
      factsByDomain.set(domain, list);
    }
    let conceptCount = 0;
    for (const [domain, domainFacts] of factsByDomain.entries()) {
      if (domainFacts.length < 2) continue;  // 太少的领域不生成页面
      const entityCountMap = new Map<string, number>();
      for (const f of domainFacts) {
        if (f.subject) entityCountMap.set(f.subject, (entityCountMap.get(f.subject) || 0) + 1);
      }
      const topEntities = Array.from(entityCountMap.entries())
        .map(([name, count]) => ({ name, factCount: count }))
        .sort((a, b) => b.factCount - a.factCount)
        .slice(0, 30);

      const content = renderConceptPage({ domain, facts: domainFacts, topEntities });
      const filename = `${slugify(domain)}.md`;
      try {
        await fs.writeFile(path.join(wikiRoot, 'concepts', filename), content, 'utf8');
        filesWritten++;
        conceptCount++;
      } catch (err) {
        errors.push(`concept ${domain}: ${(err as Error).message}`);
      }
    }

    // 6. 生成来源页 (每个独立 asset_id)
    let sourceCount = 0;
    const factsByAsset = new Map<string, ContentFact[]>();
    for (const f of facts) {
      if (!f.assetId) continue;
      const list = factsByAsset.get(f.assetId) || [];
      list.push(f);
      factsByAsset.set(f.assetId, list);
    }
    for (const [assetId, assetFacts] of factsByAsset.entries()) {
      const row = assetRows.get(assetId);
      const entityNames = Array.from(new Set([
        ...assetFacts.map(f => f.subject).filter(Boolean),
        ...assetFacts.map(f => f.object).filter(Boolean),
      ])).slice(0, 30);
      const content = renderSourcePage({
        assetId,
        title: row?.source || assetId,
        l0Summary: row?.l0_summary,
        source: row?.source,
        factCount: assetFacts.length,
        entityNames,
      });
      const filename = `${slugify(assetId)}.md`;
      try {
        await fs.writeFile(path.join(wikiRoot, 'sources', filename), content, 'utf8');
        filesWritten++;
        sourceCount++;
      } catch (err) {
        errors.push(`source ${assetId}: ${(err as Error).message}`);
      }
    }

    // 7. index.md + overview.md
    const topEntitiesGlobal = Array.from(factsBySubject.entries())
      .map(([name, list]) => ({ name, count: list.length }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 50);
    const domains = Array.from(factsByDomain.keys()).filter(d => (factsByDomain.get(d) || []).length >= 2);
    const indexContent = renderIndexPage({
      entityCount,
      factCount: facts.length,
      sourceCount,
      domains,
      topEntities: topEntitiesGlobal,
    });
    await fs.writeFile(path.join(wikiRoot, 'index.md'), indexContent, 'utf8');
    filesWritten++;

    const overviewContent = renderOverviewPlaceholder({
      entityCount,
      factCount: facts.length,
      domains,
    });
    await fs.writeFile(path.join(wikiRoot, 'overview.md'), overviewContent, 'utf8');
    filesWritten++;

    // 8. .obsidian 配置
    await fs.writeFile(
      path.join(wikiRoot, '.obsidian', 'app.json'),
      renderObsidianConfig(),
      'utf8'
    );
    filesWritten++;

    return {
      wikiRoot,
      filesWritten,
      entities: entityCount,
      concepts: conceptCount,
      sources: sourceCount,
      durationMs: Date.now() - started,
      errors,
    };
  }

  /** 列出已生成的 wiki 目录 */
  async listWikis(rootDir: string): Promise<Array<{ name: string; path: string; mtime: string }>> {
    try {
      const items = await fs.readdir(rootDir, { withFileTypes: true });
      const results: Array<{ name: string; path: string; mtime: string }> = [];
      for (const it of items) {
        if (!it.isDirectory()) continue;
        const full = path.join(rootDir, it.name);
        try {
          // 检测是否是 wiki (含 index.md)
          const indexPath = path.join(full, 'index.md');
          const stat = await fs.stat(indexPath);
          results.push({
            name: it.name,
            path: full,
            mtime: stat.mtime.toISOString(),
          });
        } catch { /* 不是 wiki */ }
      }
      return results.sort((a, b) => b.mtime.localeCompare(a.mtime));
    } catch {
      return [];
    }
  }

  /** 读取一个 markdown 文件 (用于预览) */
  async readMarkdown(wikiRoot: string, relPath: string): Promise<string | null> {
    try {
      const safe = path.normalize(relPath).replace(/^(\.\.[/\\])+/, '');
      const resolvedRoot = path.resolve(wikiRoot);
      const full = path.resolve(resolvedRoot, safe);
      // 必须在 wiki 根目录内（相对路径 + 绝对路径混用时，不能用 startsWith 比较未 resolve 的 full）
      const rel = path.relative(resolvedRoot, full);
      if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
      return await fs.readFile(full, 'utf8');
    } catch {
      return null;
    }
  }

  /** 列出 wiki 目录下所有 markdown 文件 */
  async listFiles(wikiRoot: string): Promise<Array<{ path: string; category: string }>> {
    const out: Array<{ path: string; category: string }> = [];
    for (const cat of ['entities', 'concepts', 'sources']) {
      try {
        const files = await fs.readdir(path.join(wikiRoot, cat));
        for (const f of files.filter(f => f.endsWith('.md'))) {
          out.push({ path: `${cat}/${f}`, category: cat });
        }
      } catch { /* 目录不存在 */ }
    }
    // 顶层
    try {
      for (const f of ['index.md', 'overview.md']) {
        await fs.stat(path.join(wikiRoot, f));
        out.push({ path: f, category: 'root' });
      }
    } catch { /* ignore */ }
    return out;
  }

  // =================================================================
  // 私有方法: 数据加载
  // =================================================================

  private async loadEntities(domainFilter: string | undefined, maxEntities: number): Promise<ContentEntity[]> {
    const sql = domainFilter
      ? `SELECT * FROM content_entities WHERE taxonomy_domain_id = $1 ORDER BY created_at DESC LIMIT $2`
      : `SELECT * FROM content_entities ORDER BY created_at DESC LIMIT $1`;
    const params = domainFilter ? [domainFilter, maxEntities] : [maxEntities];
    const result = await this.db.query(sql, params);
    return result.rows.map((row: any) => ({
      id: row.id,
      canonicalName: row.canonical_name,
      aliases: Array.isArray(row.aliases) ? row.aliases : [],
      entityType: row.entity_type,
      taxonomyDomainId: row.taxonomy_domain_id,
      metadata: row.metadata || {},
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    }));
  }

  private async loadFacts(domainFilter: string | undefined): Promise<ContentFact[]> {
    const sql = domainFilter
      ? `SELECT * FROM content_facts WHERE is_current = true AND context->>'domain' = $1 ORDER BY created_at DESC LIMIT 5000`
      : `SELECT * FROM content_facts WHERE is_current = true ORDER BY created_at DESC LIMIT 5000`;
    const params = domainFilter ? [domainFilter] : [];
    const result = await this.db.query(sql, params);
    return result.rows.map((row: any) => ({
      id: row.id,
      assetId: row.asset_id,
      subject: row.subject,
      predicate: row.predicate,
      object: row.object,
      context: row.context || {},
      confidence: Number(row.confidence),
      isCurrent: row.is_current,
      supersededBy: row.superseded_by,
      sourceChunkIndex: row.source_chunk_index,
      createdAt: new Date(row.created_at),
    }));
  }

  private async loadAssets(facts: ContentFact[]): Promise<Map<string, any>> {
    const assetIds = Array.from(new Set(facts.map(f => f.assetId).filter(Boolean)));
    if (assetIds.length === 0) return new Map();
    const out = new Map<string, any>();
    try {
      const result = await this.db.query(
        `SELECT id, source, content FROM asset_library WHERE id = ANY($1::varchar[])`,
        [assetIds]
      );
      for (const row of result.rows) {
        out.set(row.id, {
          source: row.source,
          l0_summary: typeof row.content === 'string' ? row.content.slice(0, 200) : undefined,
        });
      }
    } catch (err) {
      console.warn('[WikiGenerator] loadAssets failed:', err);
    }
    return out;
  }

  /** 从事实中计算某实体的邻居 (谁共现最多) */
  private computeNeighbors(
    entityName: string,
    facts: ContentFact[]
  ): Array<{ name: string; relation: string; strength: number }> {
    const neighborMap = new Map<string, { relation: string; count: number }>();
    for (const f of facts) {
      const other = f.subject === entityName ? f.object : f.subject;
      if (!other || other === entityName) continue;
      const existing = neighborMap.get(other);
      if (existing) {
        existing.count++;
      } else {
        neighborMap.set(other, { relation: f.predicate, count: 1 });
      }
    }
    return Array.from(neighborMap.entries())
      .map(([name, info]) => ({ name, relation: info.relation, strength: info.count }))
      .sort((a, b) => b.strength - a.strength);
  }
}
