// Content Library v7.1 — Wiki 页面模板
// 把 content_facts / content_entities 物化成 Obsidian 兼容的 markdown 页面
//
// Phase H 升级:
// - renderEntityPage 加 type/subtype/app/blocks frontmatter (preserveAppMeetingNotes 用)
// - 新加 renderL2DomainPage(node, facts) → domains/<L1>/<L2>.md
// - 新加 renderL1IndexPage(l1, l2Children, factsByCode) → domains/<L1>/_index.md
// - 旧 renderConceptPage 保留（迁移期 fallback），内部 alias 到新版本

import type { ContentEntity, ContentFact } from '../types.js';
import {
  renderFrontmatter,
  type WikiFrontmatter,
  type WikiBlockMeta,
  type TaxonomyFlatNode,
} from './wikiFrontmatter.js';

/** 把实体名转成文件名安全字符串 */
export function slugify(name: string): string {
  return name
    .replace(/[\\/:*?"<>|]/g, '_')  // 文件系统非法字符
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

/** 生成 [[wikilink]] */
export function wikilink(name: string): string {
  return `[[${slugify(name)}]]`;
}

/** YAML frontmatter 构建 */
function yamlFrontmatter(data: Record<string, unknown>): string {
  const lines: string[] = ['---'];
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined || v === null) continue;
    if (Array.isArray(v)) {
      if (v.length === 0) continue;
      lines.push(`${k}:`);
      for (const item of v) lines.push(`  - ${escapeYaml(String(item))}`);
    } else if (typeof v === 'object') {
      lines.push(`${k}: ${escapeYaml(JSON.stringify(v))}`);
    } else {
      lines.push(`${k}: ${escapeYaml(String(v))}`);
    }
  }
  lines.push('---');
  return lines.join('\n');
}

function escapeYaml(s: string): string {
  if (/[:#\n"']/.test(s)) return `"${s.replace(/"/g, '\\"')}"`;
  return s;
}

// ============================================================
// 1. 实体页 entities/{subtype}/{slug}.md  或  concepts/{subtype}/{slug}.md
// Phase H: subtype 细分 + frontmatter blocks 保留 + taxonomy_code 注入
// ============================================================

const ENTITY_SUBTYPES = ['person', 'org', 'product', 'project', 'event', 'location'] as const;
const CONCEPT_SUBTYPES = [
  'mental-model', 'judgment', 'bias', 'counterfactual',
  'metric', 'technology', 'financial-instrument', 'business-model',
  'regulation', 'demographic',
] as const;

/** 把 entity_type 字符串映射到 type/subtype (含中文 entity_type 别名) */
export function mapEntityTypeToTypeSubtype(entityType: string | undefined): {
  type: 'entity' | 'concept';
  subtype: string;
} {
  const t = String(entityType ?? 'concept').toLowerCase();

  // 直接命中标准 subtype
  if ((ENTITY_SUBTYPES as readonly string[]).includes(t)) return { type: 'entity', subtype: t };
  if ((CONCEPT_SUBTYPES as readonly string[]).includes(t)) return { type: 'concept', subtype: t };

  // entity 别名映射
  if (t === 'person' || t === '人物') return { type: 'entity', subtype: 'person' };
  if (
    t === 'company' || t === 'organization' ||
    t === '机构' || t === '研究机构' || t === '行业协会' ||
    t === '公司类型' || t === '企业群体' || t === '企业类型' ||
    t === '政府' || t === '政府部门' || t === '政府机构' ||
    t === '金融机构' || t === '金融机构部门' ||
    t === '服务提供商类型' || t === '平台类型' || t === '市场参与者'
  ) return { type: 'entity', subtype: 'org' };
  if (
    t === '金融产品' || t === '金融产品类别' || t === '金融服务' ||
    t === '户型' || t === '房产类型' || t === '土地类型' || t === '房源获取方式' ||
    t === '住房供应类型' || t === '门店类型'
  ) return { type: 'entity', subtype: 'product' };
  if (t === '政策' || t === '政策计划' || t === '政策试点范围' || t === '法律') {
    return { type: 'entity', subtype: 'event' };
  }
  if (t === '项目') return { type: 'entity', subtype: 'project' };
  if (
    t === '城市' || t === '城市类别' || t === '城市集合' || t === '城市群' ||
    t === '区域' || t === '国家' || t === '国家类别' || t === '经济部门'
  ) return { type: 'entity', subtype: 'location' };

  // concept 别名映射
  if (
    t === 'index' || t === '市场指标' || t === '经济指标' ||
    t === '市场模式' || t === '市场类别'
  ) return { type: 'concept', subtype: 'metric' };
  if (t === '技术' || t === '产业链' || t === '产业链环节' || t === '行业' || t === '行业领域') {
    return { type: 'concept', subtype: 'technology' };
  }

  // 兜底
  return { type: 'concept', subtype: 'mental-model' };
}

export function renderEntityPage(params: {
  entity: ContentEntity;
  facts: ContentFact[];             // 该实体为 subject 或 object 的事实
  neighbors: Array<{ name: string; relation: string; strength: number }>;
  /** Phase H · 显式覆盖 type/subtype（默认从 entity.entityType 推） */
  overrideType?: 'entity' | 'concept';
  overrideSubtype?: string;
  /** Phase H · 主属域 taxonomy_code（按事实里出现频次最高） */
  taxonomyCode?: string;
  taxonomyCodesSecondary?: string[];
  /** Phase H · 保留外来 app=meeting-notes 的 blocks（来自旧文件 body 提取） */
  preserveBlocks?: string[];        // 完整 <!-- block:xxx -->...<!-- /block:xxx --> 段
  preserveBlockMetas?: WikiBlockMeta[];
}): string {
  const { entity, facts, neighbors, preserveBlocks, preserveBlockMetas } = params;
  const sources = Array.from(new Set(facts.map(f => f.assetId).filter(Boolean)));
  const { type, subtype } = params.overrideType && params.overrideSubtype
    ? { type: params.overrideType, subtype: params.overrideSubtype }
    : mapEntityTypeToTypeSubtype(entity.entityType);

  // domains_legacy: 保留 free-text 兼容字段（旧 obsidian 查询不破）
  const domainsLegacy = Array.from(new Set(
    facts.map(f => String(f.context?.domain || '')).filter(Boolean)
  ));

  const ownBlock: WikiBlockMeta = {
    id: 'global-profile',
    app: 'knowledge-library',
    via: 'wiki-generator',
    addedAt: new Date().toISOString(),
  };
  const blocks: WikiBlockMeta[] = [ownBlock, ...(preserveBlockMetas ?? [])];

  const fm: WikiFrontmatter = {
    type,
    subtype,
    canonical_name: entity.canonicalName,
    aliases: entity.aliases || [],
    slug: slugify(entity.canonicalName),
    taxonomy_code: params.taxonomyCode,
    taxonomy_codes_secondary: params.taxonomyCodesSecondary,
    domains_legacy: domainsLegacy,
    app: 'knowledge-library',
    generatedBy: 'wiki-generator',
    lastEditedBy: 'wiki-generator',
    lastEditedAt: new Date().toISOString(),
    sources,
    blocks,
    // 旧字段兼容
    entityType: entity.entityType,
    domains: domainsLegacy,
    updatedAt: new Date().toISOString(),
  };
  const frontmatter = renderFrontmatter(fm);

  const out: string[] = [frontmatter, '', `# ${entity.canonicalName}`, ''];

  // 全局画像内容包在 <!-- block:global-profile --> 里，方便 phase H 重生时辨识 owner
  out.push('<!-- block:global-profile -->');

  if (entity.aliases && entity.aliases.length > 0) {
    out.push(`**别名**: ${entity.aliases.join(' · ')}`, '');
  }
  out.push(`**类型**: \`${entity.entityType}\``, '');

  // 该实体相关的所有事实，按置信度排序
  if (facts.length > 0) {
    out.push('## 关键事实', '');
    const sortedFacts = [...facts]
      .filter(f => f.isCurrent !== false)
      .sort((a, b) => (b.confidence || 0) - (a.confidence || 0))
      .slice(0, 30);
    for (const f of sortedFacts) {
      const other = f.subject === entity.canonicalName ? f.object : f.subject;
      const arrow = f.subject === entity.canonicalName ? '→' : '←';
      const conf = typeof f.confidence === 'number' ? ` (${Math.round(f.confidence * 100)}%)` : '';
      out.push(`- **${f.predicate}** ${arrow} ${wikilink(other)}: ${f.object !== other ? f.object : ''}${conf}`);
    }
    out.push('');
  }

  // 关联实体
  if (neighbors.length > 0) {
    out.push('## 相关实体', '');
    for (const n of neighbors.slice(0, 20)) {
      out.push(`- ${wikilink(n.name)} — *${n.relation}* (强度 ${n.strength.toFixed(1)})`);
    }
    out.push('');
  }

  // 来源
  if (sources.length > 0) {
    out.push('## 来源', '');
    for (const assetId of sources.slice(0, 15)) {
      out.push(`- [[sources/${slugify(assetId)}|${assetId}]]`);
    }
    out.push('');
  }

  out.push('<!-- /block:global-profile -->');

  // Phase H · 保留 app=meeting-notes 的 blocks（来自旧文件 body 提取）追加到末尾
  if (preserveBlocks && preserveBlocks.length > 0) {
    out.push('');
    for (const b of preserveBlocks) out.push(b, '');
  }

  return out.join('\n');
}

// ============================================================
// 2. 概念/领域页 concepts/{domain}.md
// ============================================================

export function renderConceptPage(params: {
  domain: string;
  facts: ContentFact[];
  topEntities: Array<{ name: string; factCount: number }>;
}): string {
  const { domain, facts, topEntities } = params;
  const frontmatter = yamlFrontmatter({
    type: 'concept',
    domain,
    factCount: facts.length,
    entityCount: topEntities.length,
    updatedAt: new Date().toISOString(),
  });

  const out: string[] = [frontmatter, '', `# ${domain}`, ''];
  out.push(`此页汇总 \`${domain}\` 领域的 ${facts.length} 条事实和 ${topEntities.length} 个实体。`, '');

  if (topEntities.length > 0) {
    out.push('## 主要实体', '');
    for (const e of topEntities.slice(0, 30)) {
      out.push(`- ${wikilink(e.name)} (${e.factCount} 条事实)`);
    }
    out.push('');
  }

  if (facts.length > 0) {
    out.push('## 近期事实', '');
    const recent = [...facts]
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
      .slice(0, 20);
    for (const f of recent) {
      out.push(`- ${wikilink(f.subject)} · **${f.predicate}** → ${f.object}`);
    }
  }

  return out.join('\n');
}

// ============================================================
// 3. 来源页 sources/{assetId}.md
// ============================================================

export function renderSourcePage(params: {
  assetId: string;
  title?: string;
  l0Summary?: string;
  source?: string;
  factCount: number;
  entityNames: string[];
}): string {
  const { assetId, title, l0Summary, source, factCount, entityNames } = params;
  const frontmatter = yamlFrontmatter({
    type: 'source',
    assetId,
    source,
    factCount,
    entityCount: entityNames.length,
    updatedAt: new Date().toISOString(),
  });

  const out: string[] = [frontmatter, '', `# ${title || assetId}`, ''];
  if (source) out.push(`**来源**: ${source}`, '');
  if (l0Summary) out.push('## L0 摘要', '', l0Summary, '');

  out.push(`**贡献**: ${factCount} 条事实 / ${entityNames.length} 个实体`, '');

  if (entityNames.length > 0) {
    out.push('## 涉及实体', '');
    for (const name of entityNames.slice(0, 30)) {
      out.push(`- ${wikilink(name)}`);
    }
  }

  return out.join('\n');
}

// ============================================================
// 4. index.md (分类目录)
// ============================================================

export function renderIndexPage(params: {
  entityCount: number;
  factCount: number;
  sourceCount: number;
  domains: string[];
  topEntities: Array<{ name: string; count: number }>;
}): string {
  const { entityCount, factCount, sourceCount, domains, topEntities } = params;
  const frontmatter = yamlFrontmatter({
    type: 'index',
    updatedAt: new Date().toISOString(),
  });

  const out: string[] = [
    frontmatter, '',
    '# 内容库 Wiki 索引', '',
    `- **实体**: ${entityCount} 个`,
    `- **事实**: ${factCount} 条`,
    `- **来源**: ${sourceCount} 个`,
    `- **领域**: ${domains.length} 个`,
    '',
    '## 领域 (concepts/)', '',
  ];
  for (const d of domains) out.push(`- [[concepts/${slugify(d)}|${d}]]`);
  out.push('');

  if (topEntities.length > 0) {
    out.push('## 高频实体 (entities/)', '');
    for (const e of topEntities.slice(0, 30)) {
      out.push(`- ${wikilink(e.name)} — ${e.count} 条事实`);
    }
  }
  out.push('', '---', '', '> 自动生成，由 Content Library v7.1 驱动。', '');

  return out.join('\n');
}

// ============================================================
// 5. overview.md (顶层摘要占位符，LLM 生成版本)
// ============================================================

export function renderOverviewPlaceholder(params: {
  entityCount: number;
  factCount: number;
  domains: string[];
}): string {
  const { entityCount, factCount, domains } = params;
  const frontmatter = yamlFrontmatter({
    type: 'overview',
    autoGenerated: true,
    updatedAt: new Date().toISOString(),
  });

  return [
    frontmatter, '',
    '# 概览',
    '',
    `本知识库共收录 **${entityCount} 个实体**、**${factCount} 条事实**，覆盖 ${domains.length} 个领域。`,
    '',
    '## 主要领域',
    '',
    ...domains.map(d => `- [[concepts/${slugify(d)}|${d}]]`),
    '',
    '## 下一步',
    '',
    '- 浏览 [[index|索引]] 查看全部实体与概念',
    '- 跳转到 entities/ 目录按实体查询',
    '- 在 Obsidian 打开此 vault 启用 graph view 可视化',
    '',
  ].join('\n');
}

// ============================================================
// Phase H · 7. domains/<L1>/<L2>.md  L2 领域聚合页
// ============================================================

export function renderL2DomainPage(params: {
  node: TaxonomyFlatNode;            // L2 节点 (含 parentCode/parentName)
  facts: ContentFact[];               // 该 L2 下所有 facts
  topEntities: Array<{ name: string; factCount: number }>;
  preserveBlocks?: string[];          // 保留外来 app=meeting-notes 的块
}): string {
  const { node, facts, topEntities, preserveBlocks } = params;

  const fm: WikiFrontmatter = {
    type: 'domain',
    subtype: node.code,                // L2 code 作为 subtype, 让 dataview 能 filter
    canonical_name: node.name,
    slug: slugify(node.code),
    taxonomy_code: node.code,
    app: 'knowledge-library',
    generatedBy: 'wiki-generator',
    lastEditedBy: 'wiki-generator',
    lastEditedAt: new Date().toISOString(),
    factCount: facts.length,
    entityCount: topEntities.length,
    blocks: [{ id: 'global-profile', app: 'knowledge-library', via: 'wiki-generator', addedAt: new Date().toISOString() }],
    // 旧字段兼容
    domain: node.name,
    updatedAt: new Date().toISOString(),
  };

  const out: string[] = [
    renderFrontmatter(fm), '',
    `# ${node.name}`, '',
    `> ${node.parentCode}-${node.parentName ?? ''} / ${node.code}-${node.name}`, '',
    '<!-- block:global-profile -->',
    `此页汇总 \`${node.code}\` (${node.name}) 域下的 ${facts.length} 条事实和 ${topEntities.length} 个实体。`, '',
  ];

  if (topEntities.length > 0) {
    out.push('## 主要实体', '');
    for (const e of topEntities.slice(0, 30)) {
      out.push(`- ${wikilink(e.name)} (${e.factCount} 条事实)`);
    }
    out.push('');
  }

  if (facts.length > 0) {
    out.push('## 近期事实', '');
    const recent = [...facts]
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
      .slice(0, 20);
    for (const f of recent) {
      out.push(`- ${wikilink(f.subject)} · **${f.predicate}** → ${f.object}`);
    }
  }

  out.push('', '<!-- /block:global-profile -->');

  if (preserveBlocks && preserveBlocks.length > 0) {
    out.push('');
    for (const b of preserveBlocks) out.push(b, '');
  }

  return out.join('\n');
}

// ============================================================
// Phase H · 8. domains/<L1>/_index.md  L1 父域聚合索引页
// ============================================================

export function renderL1IndexPage(params: {
  l1: TaxonomyFlatNode;                              // L1 节点
  l2Children: Array<{ node: TaxonomyFlatNode; factCount: number }>;
  totalFactCount: number;
  topEntities: Array<{ name: string; factCount: number }>;
}): string {
  const { l1, l2Children, totalFactCount, topEntities } = params;

  const fm: WikiFrontmatter = {
    type: 'domain',
    subtype: l1.code,
    canonical_name: l1.name,
    slug: slugify(l1.code),
    taxonomy_code: l1.code,
    app: 'knowledge-library',
    generatedBy: 'wiki-generator',
    lastEditedAt: new Date().toISOString(),
    factCount: totalFactCount,
    entityCount: topEntities.length,
    domain: l1.name,
  };

  const out: string[] = [
    renderFrontmatter(fm), '',
    `# ${l1.code} · ${l1.name}`, '',
    `本父域聚合了 ${l2Children.length} 个子域、${totalFactCount} 条事实、${topEntities.length} 个高频实体。`, '',
    '## 子域', '',
  ];

  for (const child of l2Children.sort((a, b) => b.factCount - a.factCount)) {
    const link = `${child.node.code}-${slugify(child.node.name)}`;
    out.push(`- [[${link}|${child.node.name}]] (${child.factCount} 条事实)`);
  }
  out.push('');

  if (topEntities.length > 0) {
    out.push('## 跨子域高频实体', '');
    for (const e of topEntities.slice(0, 30)) {
      out.push(`- ${wikilink(e.name)} (${e.factCount} 条)`);
    }
  }

  return out.join('\n');
}

// ============================================================
// 6. .obsidian/app.json (Obsidian vault 配置)
// ============================================================

export function renderObsidianConfig(): string {
  return JSON.stringify(
    {
      alwaysUpdateLinks: true,
      newFileLocation: 'folder',
      newFileFolderPath: 'entities',
      attachmentFolderPath: '.attachments',
      useMarkdownLinks: false,
      showLineNumber: true,
    },
    null,
    2
  );
}
