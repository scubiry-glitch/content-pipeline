// Content Library v7.1 — Wiki Generator
// 读取 content_entities + content_facts + asset_library，物化成 Obsidian 兼容的 markdown vault
//
// 设计要点:
// - 只读物化视图: 不改动数据库数据
// - Adapter 注入: 依赖 DatabaseAdapter + StorageAdapter (可复用 ContentLibraryDeps)
// - 幂等: 每次 generate() 会覆盖 wikiRoot，等于重新物化一次

import { promises as fs } from 'fs';
import { existsSync } from 'fs';
import * as path from 'path';
import type { DatabaseAdapter, ContentEntity, ContentFact } from '../types.js';
import {
  renderEntityPage,
  renderConceptPage,
  renderSourcePage,
  renderIndexPage,
  renderOverviewPlaceholder,
  renderObsidianConfig,
  renderL2DomainPage,
  renderL1IndexPage,
  mapEntityTypeToTypeSubtype,
  slugify,
} from './templates.js';
import {
  flattenTaxonomy,
  getTaxonomyNode,
  parseFrontmatter,
  extractBlocks,
  type WikiBlockMeta,
  type TaxonomyFlatNode,
} from './wikiFrontmatter.js';

// ============================================================
// Phase H+ · 来源 kind 路由
// ============================================================

/** wiki 内 source 的 kind 分类, 决定写入 sources/<kind>/ 子目录 */
export type SourceKind = 'meeting' | 'research-report' | 'rss' | 'document';

export interface AssetMeta {
  kind: SourceKind;
  rawType?: string;          // 原始 assets.type 或 asset_library.content_type
  source?: string;
  title?: string;
  l0_summary?: string;
}

/** assets.type → SourceKind */
export function mapAssetTypeToKind(type: string | null | undefined): SourceKind {
  const t = String(type ?? '').toLowerCase();
  if (t === 'meeting_note' || t === 'meeting_minutes' || t === 'transcript') return 'meeting';
  if (t === 'report') return 'research-report';
  if (t === 'rss' || t === 'rss_item') return 'rss';
  if (t === 'file' || t === 'document') return 'document';
  return 'document';
}

/** asset_library.content_type → SourceKind */
export function mapContentTypeToKind(ct: string | null | undefined): SourceKind {
  const t = String(ct ?? '').toLowerCase();
  if (t.includes('meeting')) return 'meeting';
  if (t === 'rss' || t === 'rss_item' || t.includes('rss')) return 'rss';
  if (t === 'report' || t === 'research_report' || t === 'research-report') return 'research-report';
  return 'document';
}

export interface WikiGenerateOptions {
  /** 本地文件系统根目录 (绝对路径) */
  wikiRoot: string;
  /** 可选: 只生成指定 domain */
  domainFilter?: string;
  /** 实体上限 (避免全库生成时爆炸) */
  maxEntities?: number;
  /** 每实体的事实上限 */
  maxFactsPerEntity?: number;
  /** Phase H · 跳过 sources/.md 写入 (claude-cli 全权写) */
  skipSources?: boolean;
  /** Phase H · 重生时保留 frontmatter.app === 'meeting-notes' 的整文件不覆盖,
   *  以及 body 中 app=meeting-notes 的 blocks (来自 frontmatter.blocks 标记的) */
  preserveAppMeetingNotes?: boolean;
  /** Phase H · 旧扁平布局兜底: entities/<slug>.md (不进 subtype 子目录).
   *  默认 false (新分级布局) */
  legacyFlatLayout?: boolean;
}

export interface WikiGenerateResult {
  wikiRoot: string;
  filesWritten: number;
  entities: number;
  concepts: number;             // 旧字段 (legacyConceptPage 数量, Phase H 不再写)
  domains: number;              // Phase H · L2 domain page 数量
  domainIndexes: number;        // Phase H · L1 _index.md 数量
  sources: number;
  sourceKindBreakdown?: Record<string, number>;  // Phase H+ · 按 kind 拆分的 source page 数
  preservedFiles: number;       // Phase H · 因 app=meeting-notes 而被跳过的文件数
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
    let preservedFiles = 0;

    // 1. 准备目录结构 (Phase H · 加 subtype 子目录 + domains)
    await fs.mkdir(wikiRoot, { recursive: true });
    await fs.mkdir(path.join(wikiRoot, '.obsidian'), { recursive: true });
    if (options.legacyFlatLayout) {
      await fs.mkdir(path.join(wikiRoot, 'entities'), { recursive: true });
      await fs.mkdir(path.join(wikiRoot, 'concepts'), { recursive: true });
    } else {
      for (const sub of ['person', 'org', 'product', 'project', 'event', 'location']) {
        await fs.mkdir(path.join(wikiRoot, 'entities', sub), { recursive: true });
      }
      for (const sub of [
        'mental-model', 'judgment', 'bias', 'counterfactual',
        'metric', 'technology', 'financial-instrument', 'business-model',
        'regulation', 'demographic',
      ]) {
        await fs.mkdir(path.join(wikiRoot, 'concepts', sub), { recursive: true });
      }
      // domains/<L1-code-name>/ 在写入时按需 mkdir (避免空目录)
    }
    if (!options.skipSources) {
      await fs.mkdir(path.join(wikiRoot, 'sources'), { recursive: true });
    }

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
      if (f.object) {
        const objList = factsBySubject.get(f.object) || [];
        objList.push(f);
        factsBySubject.set(f.object, objList);
      }
    }

    // 4. 生成实体页 (Phase H · 路由到 entities/<subtype>/<slug>.md 或 concepts/<subtype>/<slug>.md)
    let entityCount = 0;
    for (const entity of entities) {
      const entityFacts = (factsBySubject.get(entity.canonicalName) || []).slice(0, maxFactsPerEntity);
      const neighbors = this.computeNeighbors(entity.canonicalName, entityFacts);

      // 路由路径
      const filePath = options.legacyFlatLayout
        ? path.join(wikiRoot, 'entities', `${slugify(entity.canonicalName)}.md`)
        : (() => {
            const { type, subtype } = mapEntityTypeToTypeSubtype(entity.entityType);
            const dir = type === 'entity' ? `entities/${subtype}` : `concepts/${subtype}`;
            return path.join(wikiRoot, dir, `${slugify(entity.canonicalName)}.md`);
          })();

      // Phase H · preserveAppMeetingNotes 检查
      let preserveBlocks: string[] | undefined;
      let preserveBlockMetas: WikiBlockMeta[] | undefined;
      if (options.preserveAppMeetingNotes && existsSync(filePath)) {
        try {
          const cur = await fs.readFile(filePath, 'utf8');
          const { frontmatter, body } = parseFrontmatter(cur);
          if (frontmatter.app === 'meeting-notes') {
            // 整文件由 meeting-notes 拥有 → 跳过
            preservedFiles += 1;
            continue;
          }
          // 只保留 app=meeting-notes 的 blocks
          const blockMetas = ((frontmatter.blocks ?? []) as WikiBlockMeta[]).filter((b) => b?.app === 'meeting-notes');
          if (blockMetas.length > 0) {
            const allBlocks = extractBlocks(body);
            preserveBlocks = blockMetas
              .map((m) => allBlocks.find((b) => b.id === m.id)?.raw)
              .filter((x): x is string => Boolean(x));
            preserveBlockMetas = blockMetas;
          }
        } catch (err) {
          errors.push(`preserve check ${entity.canonicalName}: ${(err as Error).message}`);
        }
      }

      // 选 taxonomy_code (出现频次最高的 L2)
      const taxonomyCounts = new Map<string, number>();
      for (const f of entityFacts) {
        const code = String(f.context?.taxonomy_code ?? '');
        if (code && code !== 'E99.OTHER') {
          taxonomyCounts.set(code, (taxonomyCounts.get(code) ?? 0) + 1);
        }
      }
      const taxonomyCode = Array.from(taxonomyCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0];
      const taxonomyCodesSecondary = Array.from(taxonomyCounts.entries())
        .filter(([c]) => c !== taxonomyCode)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([c]) => c);

      const content = renderEntityPage({
        entity,
        facts: entityFacts,
        neighbors,
        taxonomyCode,
        taxonomyCodesSecondary,
        preserveBlocks,
        preserveBlockMetas,
      });

      try {
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, content, 'utf8');
        filesWritten++;
        entityCount++;
      } catch (err) {
        errors.push(`entity ${entity.canonicalName}: ${(err as Error).message}`);
      }
    }

    // 5. Phase H · 按 taxonomy_code 分组 facts → 生成 domains/<L1>/<L2>.md + _index.md
    let domainCount = 0;
    let domainIndexCount = 0;
    let conceptCount = 0;  // 仅当 legacyFlatLayout 写老 concepts/ 时

    if (options.legacyFlatLayout) {
      // 旧路径：concepts/<free-text-domain>.md
      const factsByDomain = new Map<string, ContentFact[]>();
      for (const f of facts) {
        const domain = String(f.context?.domain || 'uncategorized');
        const list = factsByDomain.get(domain) || [];
        list.push(f);
        factsByDomain.set(domain, list);
      }
      for (const [domain, domainFacts] of factsByDomain.entries()) {
        if (domainFacts.length < 2) continue;
        const entityCountMap = new Map<string, number>();
        for (const f of domainFacts) {
          if (f.subject) entityCountMap.set(f.subject, (entityCountMap.get(f.subject) || 0) + 1);
        }
        const topEntities = Array.from(entityCountMap.entries())
          .map(([name, count]) => ({ name, factCount: count }))
          .sort((a, b) => b.factCount - a.factCount)
          .slice(0, 30);
        try {
          await fs.writeFile(
            path.join(wikiRoot, 'concepts', `${slugify(domain)}.md`),
            renderConceptPage({ domain, facts: domainFacts, topEntities }),
            'utf8',
          );
          filesWritten++;
          conceptCount++;
        } catch (err) {
          errors.push(`concept ${domain}: ${(err as Error).message}`);
        }
      }
    } else {
      // Phase H · 新路径：按 taxonomy_code 分组
      const taxonomy = flattenTaxonomy();
      const factsByCode = new Map<string, ContentFact[]>();
      for (const f of facts) {
        const code = String(f.context?.taxonomy_code ?? 'E99.OTHER');
        const list = factsByCode.get(code) || [];
        list.push(f);
        factsByCode.set(code, list);
      }

      // 5a) L2 domain page · domains/<L1>/<L2>.md
      const l1Stats = new Map<string, { l1: TaxonomyFlatNode; l2List: Array<{ node: TaxonomyFlatNode; factCount: number }>; total: number }>();
      for (const [code, codeFacts] of factsByCode.entries()) {
        if (codeFacts.length < 2) continue;
        const node = getTaxonomyNode(code);
        if (!node || node.level !== 2 || !node.parentCode) continue;

        const l1 = getTaxonomyNode(node.parentCode);
        if (!l1) continue;

        // 累计到 L1 stats
        let l1Stat = l1Stats.get(l1.code);
        if (!l1Stat) {
          l1Stat = { l1, l2List: [], total: 0 };
          l1Stats.set(l1.code, l1Stat);
        }
        l1Stat.l2List.push({ node, factCount: codeFacts.length });
        l1Stat.total += codeFacts.length;

        // 写 L2 文件
        const entityCountMap = new Map<string, number>();
        for (const f of codeFacts) {
          if (f.subject) entityCountMap.set(f.subject, (entityCountMap.get(f.subject) || 0) + 1);
        }
        const topEntities = Array.from(entityCountMap.entries())
          .map(([name, count]) => ({ name, factCount: count }))
          .sort((a, b) => b.factCount - a.factCount)
          .slice(0, 30);

        const l1Dir = `${l1.code}-${slugify(l1.name)}`;
        const l2Filename = `${node.code}-${slugify(node.name)}.md`;
        const filePath = path.join(wikiRoot, 'domains', l1Dir, l2Filename);

        // preserveAppMeetingNotes
        let preserveBlocks: string[] | undefined;
        if (options.preserveAppMeetingNotes && existsSync(filePath)) {
          try {
            const cur = await fs.readFile(filePath, 'utf8');
            const { frontmatter, body } = parseFrontmatter(cur);
            if (frontmatter.app === 'meeting-notes') { preservedFiles += 1; continue; }
            const metas = ((frontmatter.blocks ?? []) as WikiBlockMeta[]).filter((b) => b?.app === 'meeting-notes');
            if (metas.length > 0) {
              const allBlocks = extractBlocks(body);
              preserveBlocks = metas.map((m) => allBlocks.find((b) => b.id === m.id)?.raw).filter((x): x is string => Boolean(x));
            }
          } catch { /* skip preserve on error */ }
        }

        try {
          await fs.mkdir(path.dirname(filePath), { recursive: true });
          await fs.writeFile(
            filePath,
            renderL2DomainPage({ node, facts: codeFacts, topEntities, preserveBlocks }),
            'utf8',
          );
          filesWritten++;
          domainCount++;
        } catch (err) {
          errors.push(`domain L2 ${node.code}: ${(err as Error).message}`);
        }
      }

      // 5b) L1 _index.md (只为有 L2 内容的 L1 生成)
      for (const stat of l1Stats.values()) {
        const l1Dir = `${stat.l1.code}-${slugify(stat.l1.name)}`;
        const indexPath = path.join(wikiRoot, 'domains', l1Dir, '_index.md');

        // 跨 L2 高频 entity
        const allEntities = new Map<string, number>();
        for (const l2 of stat.l2List) {
          const codeFacts = factsByCode.get(l2.node.code) ?? [];
          for (const f of codeFacts) {
            if (f.subject) allEntities.set(f.subject, (allEntities.get(f.subject) ?? 0) + 1);
          }
        }
        const topEntities = Array.from(allEntities.entries())
          .map(([name, count]) => ({ name, factCount: count }))
          .sort((a, b) => b.factCount - a.factCount)
          .slice(0, 30);

        try {
          await fs.mkdir(path.dirname(indexPath), { recursive: true });
          await fs.writeFile(
            indexPath,
            renderL1IndexPage({
              l1: stat.l1,
              l2Children: stat.l2List,
              totalFactCount: stat.total,
              topEntities,
            }),
            'utf8',
          );
          filesWritten++;
          domainIndexCount++;
        } catch (err) {
          errors.push(`domain L1 ${stat.l1.code}: ${(err as Error).message}`);
        }
      }
      // 标避免 unused 警告
      void taxonomy;
    }

    // 6. Phase H+ · 生成来源页 · 按 kind 路由 sources/<kind>/<id>(.md|/_index.md)
    //    skipSources=true 时跳过整个 6 步 (claude-cli 全权).
    //    meeting kind 单独跳过 (始终由 claude-cli 写, 不论 skipSources).
    let sourceCount = 0;
    const sourceKindCounts: Record<string, number> = { meeting: 0, 'research-report': 0, rss: 0, document: 0 };
    if (!options.skipSources) {
      // 创建 sources/<kind>/ 子目录
      for (const kind of ['research-report', 'rss', 'document'] as const) {
        await fs.mkdir(path.join(wikiRoot, 'sources', kind), { recursive: true });
      }

      const factsByAsset = new Map<string, ContentFact[]>();
      for (const f of facts) {
        if (!f.assetId) continue;
        const list = factsByAsset.get(f.assetId) || [];
        list.push(f);
        factsByAsset.set(f.assetId, list);
      }

      for (const [assetId, assetFacts] of factsByAsset.entries()) {
        const meta = assetRows.get(assetId);
        const kind: SourceKind = meta?.kind ?? 'document';

        // meeting kind: 永远 skip (claude-cli 全权写到 sources/meeting/<id>/_index.md)
        if (kind === 'meeting') {
          preservedFiles += 1;
          continue;
        }

        const entityNames = Array.from(new Set([
          ...assetFacts.map(f => f.subject).filter(Boolean),
          ...assetFacts.map(f => f.object).filter(Boolean),
        ])).slice(0, 30);

        const filePath = path.join(wikiRoot, 'sources', kind, `${slugify(assetId)}.md`);
        // preserveAppMeetingNotes: claude-cli 写过的 source 跳过
        if (options.preserveAppMeetingNotes && existsSync(filePath)) {
          try {
            const cur = await fs.readFile(filePath, 'utf8');
            const { frontmatter } = parseFrontmatter(cur);
            if (frontmatter.app === 'meeting-notes') { preservedFiles += 1; continue; }
          } catch { /* fall through */ }
        }

        // 按 kind 选模板 (P0: 沿用 renderSourcePage; 后续可加 renderResearchReportPage / renderRssItemPage)
        const content = renderSourcePage({
          assetId,
          title: meta?.title || meta?.source || assetId,
          l0Summary: meta?.l0_summary,
          source: meta?.source,
          factCount: assetFacts.length,
          entityNames,
        });

        try {
          await fs.writeFile(filePath, content, 'utf8');
          filesWritten++;
          sourceCount++;
          sourceKindCounts[kind] = (sourceKindCounts[kind] ?? 0) + 1;
        } catch (err) {
          errors.push(`source [${kind}] ${assetId}: ${(err as Error).message}`);
        }
      }
    }

    // 7. index.md + overview.md
    const topEntitiesGlobal = Array.from(factsBySubject.entries())
      .map(([name, list]) => ({ name, count: list.length }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 50);

    // Phase H · domains 列表：legacyFlatLayout 时按 free-text，否则用 taxonomy_code
    const domainsList: string[] = [];
    if (options.legacyFlatLayout) {
      const seen = new Set<string>();
      for (const f of facts) {
        const d = String(f.context?.domain || '');
        if (d && !seen.has(d)) { seen.add(d); domainsList.push(d); }
      }
    } else {
      const codeCount = new Map<string, number>();
      for (const f of facts) {
        const c = String(f.context?.taxonomy_code ?? '');
        if (c) codeCount.set(c, (codeCount.get(c) ?? 0) + 1);
      }
      for (const [c, n] of codeCount.entries()) if (n >= 2) domainsList.push(c);
    }
    const indexContent = renderIndexPage({
      entityCount,
      factCount: facts.length,
      sourceCount,
      domains: domainsList,
      topEntities: topEntitiesGlobal,
    });
    await fs.writeFile(path.join(wikiRoot, 'index.md'), indexContent, 'utf8');
    filesWritten++;

    const overviewContent = renderOverviewPlaceholder({
      entityCount,
      factCount: facts.length,
      domains: domainsList,
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
      domains: domainCount,
      domainIndexes: domainIndexCount,
      sources: sourceCount,
      sourceKindBreakdown: sourceKindCounts,
      preservedFiles,
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

  /** 列出 wiki 目录下所有 markdown 文件 (Phase H · 递归到子目录) */
  /** Phase H+ · 递归列出所有 .md (深度 ≤3 适配 sources/meeting/<id>/_index.md 结构) */
  async listFiles(wikiRoot: string): Promise<Array<{ path: string; category: string }>> {
    const out: Array<{ path: string; category: string }> = [];

    const TOP_CATS = ['entities', 'concepts', 'domains', 'sources', 'axes', 'scopes'];

    for (const cat of TOP_CATS) {
      const catPath = path.join(wikiRoot, cat);
      try {
        await this.recurseDir(catPath, cat, out, /* maxDepth */ 4);
      } catch { /* 目录不存在 */ }
    }

    // 顶层 index/overview
    try {
      for (const f of ['index.md', 'overview.md']) {
        await fs.stat(path.join(wikiRoot, f));
        out.push({ path: f, category: 'root' });
      }
    } catch { /* ignore */ }
    return out;
  }

  /** 递归收集 .md 文件 (相对 wikiRoot 的路径) */
  private async recurseDir(
    dir: string,
    category: string,
    out: Array<{ path: string; category: string }>,
    maxDepth: number,
  ): Promise<void> {
    if (maxDepth <= 0) return;
    let items;
    try {
      items = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const it of items) {
      if (it.name.startsWith('.')) continue;  // 跳过 .obsidian 等
      const sub = path.join(dir, it.name);
      if (it.isDirectory()) {
        await this.recurseDir(sub, category, out, maxDepth - 1);
      } else if (it.name.endsWith('.md')) {
        // 计算相对路径 (相对 category 之上的 wikiRoot)
        // 简单做法: 反向找出 category 在 sub 里的位置
        const rel = sub.split(`/${category}/`).slice(-1)[0];
        out.push({ path: `${category}/${rel}`, category });
      }
    }
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

  /**
   * Phase H+ · 双表 loadAssets · 同时查 assets 和 asset_library, 拼出 { kind, source, title, l0_summary }
   *
   * content_facts.asset_id 现在有两类:
   *   - UUID (8-4-4-4-12) 形态 → assets.id (主要是 type=meeting_note / report / file)
   *   - asset_xxxxxxxx (varchar prefix) → asset_library.id (主要是 content_type=...)
   *
   * 路由 kind 字段决定 sources/<kind>/<id>(.md|/_index.md) 落地位置。
   */
  private async loadAssets(facts: ContentFact[]): Promise<Map<string, AssetMeta>> {
    const assetIds = Array.from(new Set(facts.map((f) => f.assetId).filter(Boolean) as string[]));
    if (assetIds.length === 0) return new Map();
    const out = new Map<string, AssetMeta>();

    // 1. assets 表 (UUID id, 字段 type)
    try {
      const r = await this.db.query(
        `SELECT id::text AS id, type, COALESCE(title, metadata->>'title') AS title,
                metadata->>'source' AS source, content
         FROM assets WHERE id::text = ANY($1::text[])`,
        [assetIds],
      );
      for (const row of r.rows) {
        out.set(row.id, {
          kind: mapAssetTypeToKind(row.type),
          rawType: row.type,
          source: row.source,
          title: row.title,
          l0_summary: typeof row.content === 'string' ? row.content.slice(0, 200) : undefined,
        });
      }
    } catch (err) {
      console.warn('[WikiGenerator] loadAssets (assets) failed:', err);
    }

    // 2. asset_library 表 (varchar id, 字段 content_type)
    try {
      const r = await this.db.query(
        `SELECT id, content_type, source, content
         FROM asset_library WHERE id = ANY($1::varchar[])`,
        [assetIds],
      );
      for (const row of r.rows) {
        if (out.has(row.id)) continue;  // assets 已有, 不覆盖
        out.set(row.id, {
          kind: mapContentTypeToKind(row.content_type),
          rawType: row.content_type,
          source: row.source,
          title: undefined,
          l0_summary: typeof row.content === 'string' ? row.content.slice(0, 200) : undefined,
        });
      }
    } catch (err) {
      console.warn('[WikiGenerator] loadAssets (asset_library) failed:', err);
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
