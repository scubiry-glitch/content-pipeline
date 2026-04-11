// Content Library v7.1 — Wiki 页面模板
// 把 content_facts / content_entities 物化成 Obsidian 兼容的 markdown 页面

import type { ContentEntity, ContentFact } from '../types.js';

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
// 1. 实体页 entities/{name}.md
// ============================================================

export function renderEntityPage(params: {
  entity: ContentEntity;
  facts: ContentFact[];             // 该实体为 subject 或 object 的事实
  neighbors: Array<{ name: string; relation: string; strength: number }>;
}): string {
  const { entity, facts, neighbors } = params;
  const sources = Array.from(new Set(facts.map(f => f.assetId).filter(Boolean)));
  const entityDomains = Array.from(new Set(
    facts.map(f => String(f.context?.domain || '')).filter(Boolean)
  ));

  const frontmatter = yamlFrontmatter({
    type: 'entity',
    entityType: entity.entityType,
    aliases: entity.aliases || [],
    sources,
    domains: entityDomains,
    updatedAt: new Date().toISOString(),
  });

  const out: string[] = [frontmatter, '', `# ${entity.canonicalName}`, ''];

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
