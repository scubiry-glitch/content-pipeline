#!/usr/bin/env node
// Migration 017a · 处理 017 跑完后 concepts/ 顶层残留的 89 文件
//
// 原因: 多个 free-text concepts (如 "金融_xxx" / "中国财富管理" / "对冲基金") 都映射到
// 同一 L2 (E02.ASSET), 第一个文件 rename 成功后, 其他 31 个 skip 留在原地。
//
// 处理策略: 把残留文件挪到 domains/<L1-code-name>/_<L2-code>-<原slug>.md
//   - 下划线前缀让 obsidian 默认排序时集中在 L2 主文件之后
//   - 保留所有数据可访问性, 不污染主 L2 节点
//   - 文件名带 L2 code 让用户一眼看出归属哪个 L2
//
// 用法: node api/migrations/017a-cleanup-residual-concepts.mjs           # dry-run
//      node api/migrations/017a-cleanup-residual-concepts.mjs --apply    # 真做

import { readFileSync } from 'node:fs';
import { readFile, mkdir, rename } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { readdirSync, existsSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..', '..');
const wikiRoot = resolve(repoRoot, 'data', 'content-wiki', 'default');
const APPLY = process.argv.includes('--apply');

// 从 taxonomyData.ts 读 SYNONYMS + TAXONOMY (复用 017 的解析逻辑)
const taxSrc = readFileSync(resolve(repoRoot, 'api/src/config/taxonomyData.ts'), 'utf8');

const TAXONOMY = (() => {
  const out = [];
  const taxStart = taxSrc.indexOf('export const TAXONOMY');
  const synStart = taxSrc.indexOf('export const SYNONYMS');
  const region = taxSrc.slice(taxStart, synStart > 0 ? synStart : taxSrc.length);
  const re = /\{\s*code:\s*'([^']+)',\s*name:\s*'([^']+)'(?:[\s\S]*?children:\s*\[([\s\S]*?)\][\s\S]*?)?\}/g;
  let m;
  while ((m = re.exec(region)) !== null) {
    if (!/^E\d+$/.test(m[1])) continue;
    const children = [];
    const cRe = /\{\s*code:\s*'([^']+)',\s*name:\s*'([^']+)'\s*\}/g;
    let cm;
    while ((cm = cRe.exec(m[3] ?? '')) !== null) {
      children.push({ code: cm[1], name: cm[2] });
    }
    out.push({ code: m[1], name: m[2], children });
  }
  return out;
})();
const taxByCode = new Map();
for (const l1 of TAXONOMY) {
  taxByCode.set(l1.code, { code: l1.code, name: l1.name, level: 1 });
  for (const c of l1.children ?? []) {
    taxByCode.set(c.code, { code: c.code, name: c.name, level: 2, parentCode: l1.code, parentName: l1.name });
  }
}

const SYNONYMS = (() => {
  const synStart = taxSrc.indexOf('export const SYNONYMS');
  const region = taxSrc.slice(synStart);
  const out = [];
  const re = /\{\s*tokens:\s*\[([^\]]+)\]\s*,\s*code:\s*'([^']+)'\s*\}/g;
  let m;
  while ((m = re.exec(region)) !== null) {
    const tokens = [];
    const tRe = /'([^']+)'/g;
    let tm;
    while ((tm = tRe.exec(m[1])) !== null) tokens.push(tm[1]);
    if (tokens.length > 0) out.push({ tokens, code: m[2] });
  }
  return out;
})();

function mapDomain(s) {
  if (!s) return null;
  const norm = String(s).toLowerCase();
  for (const e of SYNONYMS) for (const t of e.tokens) {
    const tn = t.toLowerCase();
    if (norm === tn || norm.includes(tn) || tn.includes(norm)) return e.code;
  }
  return null;
}

function slugify(name) {
  return String(name)
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const grn = (s) => `\x1b[32m${s}\x1b[0m`;
const yel = (s) => `\x1b[33m${s}\x1b[0m`;

async function main() {
  console.log(bold('Migration 017a · cleanup residual concepts/'));
  console.log(dim(`  apply: ${APPLY ? grn('YES') : yel('NO (dry-run)')}`));
  console.log();

  const concDir = join(wikiRoot, 'concepts');
  const files = readdirSync(concDir, { withFileTypes: true })
    .filter((d) => d.isFile() && d.name.endsWith('.md'))
    .map((d) => d.name);

  console.log(`  待处理残留文件数: ${files.length}`);

  const moves = [];
  for (const f of files) {
    const oldPath = join(concDir, f);
    let domain = f.replace(/\.md$/, '');
    try {
      const md = await readFile(oldPath, 'utf8');
      const dm = md.match(/^domain:\s*(.+)$/m);
      if (dm) domain = dm[1].trim().replace(/^["']|["']$/g, '');
    } catch {/**/}

    const code = mapDomain(domain) || 'E99.OTHER';
    let node = taxByCode.get(code);
    let parent = null;
    if (node?.level === 1) {
      // 命中 L1: 文件直接放在 L1 目录下加下划线前缀
      const l1Dir = `${node.code}-${slugify(node.name)}`;
      const newName = `_${slugify(domain)}.md`;
      moves.push({ oldPath, newPath: join(wikiRoot, 'domains', l1Dir, newName), code, domain });
      continue;
    }
    if (node?.level === 2) {
      parent = taxByCode.get(node.parentCode);
    }
    if (!node || !parent) {
      // 兜底 E99
      const newName = `_E99.OTHER-${slugify(domain)}.md`;
      moves.push({ oldPath, newPath: join(wikiRoot, 'domains', 'E99-其他', newName), code: 'E99.OTHER', domain });
      continue;
    }
    const l1Dir = `${parent.code}-${slugify(parent.name)}`;
    const newName = `_${node.code}-${slugify(domain)}.md`;
    moves.push({ oldPath, newPath: join(wikiRoot, 'domains', l1Dir, newName), code, domain });
  }

  // 按目标目录分组打印
  const byL1 = {};
  for (const m of moves) {
    const l1 = m.newPath.split('/domains/')[1]?.split('/')[0] ?? 'unknown';
    byL1[l1] = byL1[l1] ?? [];
    byL1[l1].push(m);
  }
  for (const [l1, list] of Object.entries(byL1).sort()) {
    console.log(`  domains/${l1}/  +${list.length} files`);
    if (list.length <= 5) {
      for (const m of list) console.log(dim(`      ${m.domain.slice(0, 30).padEnd(30)} → ${m.code}`));
    } else {
      console.log(dim(`      (${list.length} files, sample: ${list.slice(0, 3).map((m) => m.domain).join(', ')}, ...)`));
    }
  }

  if (!APPLY) {
    console.log();
    console.log(bold(yel('Dry-run 完成。加 --apply 真做。')));
    return;
  }

  console.log();
  console.log(bold(grn('▶ APPLY')));
  let moved = 0, conflict = 0;
  for (const m of moves) {
    if (existsSync(m.newPath)) {
      // 二次冲突: 同 L2 多个残留 → 加序号
      let i = 2;
      let path;
      do {
        path = m.newPath.replace(/\.md$/, `-${i}.md`);
        i++;
      } while (existsSync(path));
      await mkdir(dirname(path), { recursive: true });
      await rename(m.oldPath, path);
      conflict++;
    } else {
      await mkdir(dirname(m.newPath), { recursive: true });
      await rename(m.oldPath, m.newPath);
      moved++;
    }
  }
  console.log(`  ✓ moved: ${moved}, twice-collision (numeric suffix): ${conflict}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
