#!/usr/bin/env node
// Migration 022 · concepts/mental-model/ 用关键词启发式继续细分 (161 → ~40)
//
// 在 020 / 021 之后, 161 个文件全都是 entity_type='concept', 无更细 DB 元数据.
// 用文件名关键词启发式归类:
//   *券 / *贷 / *险 / *产品 / *账户 / *收单 / *基金 → concepts/financial-instrument/
//   *率 / *income / value / AUM / BV / 估值 / 费率 / margin / revenue / spread → concepts/metric/ (扩)
//   *端 / *网络 / *业务 / *化 / *模式 / *零售 → concepts/business-model/
//   *牌照 / *通 / *板 / 法律 / license / 制 (注册制/做市制) → concepts/regulation/
//   *技术 / 支付 / API / clearing / 寻址 → concepts/technology/ (扩)
//   *客户 / *家庭 / households / unbanked / 大众 / 富裕 / 私人 → concepts/demographic/
//   其余 → 留 mental-model/ (真抽象方法论)
//
// 用法:
//   node api/migrations/022-keyword-split-mental-model.mjs              # dry-run
//   node api/migrations/022-keyword-split-mental-model.mjs --apply

import { existsSync } from 'node:fs';
import { readdir, rename, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..', '..');
const wikiRoot = resolve(repoRoot, 'data', 'content-wiki', 'default');
const APPLY = process.argv.includes('--apply');

const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const grn = (s) => `\x1b[32m${s}\x1b[0m`;
const yel = (s) => `\x1b[33m${s}\x1b[0m`;

// 关键词匹配规则 · 顺序敏感 (前面的优先匹配)
const RULES = [
  // demographic 在前 (避免被 metric 等抢)
  { subtype: 'demographic', match: (n) => /客户|家庭|households|unbanked|富裕|私人|大众|人群|分类|人口统计/i.test(n) },
  // financial-instrument
  { subtype: 'financial-instrument', match: (n) => /券$|贷$|险$|账户|产品|基金|股$|收单|信托|理财|储蓄|tokens?$|libra|finance$/i.test(n) },
  // regulation / 制度
  { subtype: 'regulation', match: (n) => /牌照|license|licence|港股通|沪深|板$|制度|法律|条例|监管|注册制|做市制|清算/i.test(n) },
  // technology
  { subtype: 'technology', match: (n) => /技术|API|支付|寻址|加密|coding|网关|架构|协议|算法|p2p|networks/i.test(n) },
  // metric
  { subtype: 'metric', match: (n) => /率$|费$|estimate|spread|income|revenue|aum|bv|p_|margin$|margin\s|valuation|估值|激励|金额|占比|增长率/i.test(n) },
  // business-model
  { subtype: 'business-model', match: (n) => /[BC]端|网络|业务|化$|模式|零售|代理|分销|架构|连锁|工具化|机构化/i.test(n) },
];

function classify(name) {
  for (const rule of RULES) {
    if (rule.match(name)) return rule.subtype;
  }
  return null;  // 留 mental-model
}

async function main() {
  console.log(bold('Migration 022 · 关键词细分 mental-model'));
  console.log(dim(`  apply: ${APPLY ? grn('YES') : yel('NO (dry-run)')}`));
  console.log();

  const dir = join(wikiRoot, 'concepts/mental-model');
  if (!existsSync(dir)) {
    console.log(yel('  concepts/mental-model/ 不存在')); return;
  }
  const files = (await readdir(dir, { withFileTypes: true }))
    .filter((d) => d.isFile() && d.name.endsWith('.md'))
    .map((d) => d.name);

  console.log(`  待处理文件数: ${files.length}`);

  const moves = [];
  const counts = {};
  let kept = 0;
  for (const f of files) {
    const name = f.replace(/\.md$/, '');
    const subtype = classify(name);
    if (!subtype) { kept++; continue; }
    counts[subtype] = (counts[subtype] ?? 0) + 1;
    moves.push({
      oldPath: join(dir, f),
      newPath: join(wikiRoot, 'concepts', subtype, f),
      subtype,
      name,
    });
  }

  console.log();
  console.log(bold('§1. 汇总'));
  console.log(`  需移动: ${moves.length}`);
  console.log(`  留 (无关键词命中): ${kept}`);
  console.log();
  console.log(bold('§2. 目标分布'));
  for (const [k, n] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
    console.log(`  concepts/${k.padEnd(22)} ${n} files`);
  }
  console.log();
  console.log(bold('§3. 抽样 (前 20)'));
  for (const m of moves.slice(0, 20)) {
    console.log(`  ${m.subtype.padEnd(22)} ${m.name}`);
  }
  if (moves.length > 20) console.log(dim(`  ... +${moves.length - 20}`));

  if (!APPLY) {
    console.log();
    console.log(bold(yel('Dry-run 完成. 加 --apply 真做.')));
    return;
  }

  console.log();
  console.log(bold(grn('▶ APPLY')));
  let moved = 0, skipped = 0;
  for (const m of moves) {
    if (existsSync(m.newPath)) { skipped++; continue; }
    await mkdir(dirname(m.newPath), { recursive: true });
    await rename(m.oldPath, m.newPath);
    moved++;
  }
  console.log(`  ✓ moved: ${moved}, skipped: ${skipped}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
