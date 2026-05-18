#!/usr/bin/env node
/**
 * import-feishu-minutes.mjs
 * 导入50场飞书妙记到 pipeline assets 表 + 绑定三维 scope
 *
 * 用法: node scripts/import-feishu-minutes.mjs [--dry-run] [--db-host 115.190.221.164]
 */

import { readFileSync, readdirSync } from 'fs';
import { join, basename } from 'path';
import pg from 'pg';
import { randomUUID } from 'crypto';

// ---- 配置 ----
const DRY_RUN = process.argv.includes('--dry-run');
const DB_HOST = process.argv.find((a, i) => process.argv[i - 1] === '--db-host') || '115.190.221.164';
const WORKSPACE_ID = '61307c1b-f493-45d2-803d-1250ad26c14c';
const MINUTES_DIR = join(
  '/Users/scubiry/Documents/Scubiry/lab/pipeline/data/content-wiki',
  'feishu-minutes'
);

// ---- scope 绑定映射 (minute_token → { project, topic, client }) ----
// TODO: fill from scope-design
const SCOPE_BINDINGS = {};

// ---- 工具函数 ----
function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const fm = {};
  for (const line of match[1].split('\n')) {
    const m = line.match(/^(\w+):\s*["']?(.*?)["']?\s*$/);
    if (m) fm[m[1]] = m[2];
  }
  // handle tags array
  const tagsMatch = match[1].match(/tags:\s*\n(\s+- .*\n?)*/);
  if (tagsMatch) {
    fm.tags = tagsMatch[0]
      .split('\n')
      .filter((l) => l.trim().startsWith('-'))
      .map((l) => l.replace(/\s*-\s*/, '').trim());
  }
  return fm;
}

function parseBodyMeta(body) {
  const meta = { occurred_at: null, duration_min: 0, keywords: [], segments: [] };

  // 日期时间行: "2026-05-12 17:05:00 CST|17分钟 37秒"
  const dateMatch = body.match(/(\d{4}-\d{2}-\d{2})\s+\d{2}:\d{2}:\d{2}\s+\w+\|(.+)/);
  if (dateMatch) {
    meta.occurred_at = dateMatch[1];
    const durStr = dateMatch[2];
    const hours = (durStr.match(/(\d+)小时/) || [0, 0])[1] | 0;
    const mins = (durStr.match(/(\d+)分钟/) || [0, 0])[1] | 0;
    const secs = (durStr.match(/(\d+)秒/) || [0, 0])[1] | 0;
    meta.duration_min = hours * 60 + mins + Math.round(secs / 60);
  }

  // 关键词行: "关键词:\n风险、国企、..."
  const kwMatch = body.match(/关键词:\s*\n?([\S\s]*?)(?:\n\n|\n说话人)/);
  if (kwMatch) {
    meta.keywords = kwMatch[1]
      .replace(/\n/g, '')
      .split(/[、，,]/)
      .map((k) => k.trim())
      .filter(Boolean);
  }

  // 说话人分段
  const segPattern = /(说话人\s*\d+|未知)\s+([\d:.]+)\s+/g;
  let lastSpeaker = null;
  let lastTime = null;
  let segStart = 0;
  const segments = [];
  let m;
  while ((m = segPattern.exec(body)) !== null) {
    if (lastSpeaker !== null) {
      const text = body.slice(segStart, m.index).replace(/说话人\s*\d+\s+[\d:.]+\s*/g, '').trim();
      if (text) {
        segments.push({ speaker: lastSpeaker, text: text.slice(0, 2000) });
      }
    }
    lastSpeaker = m[1];
    lastTime = m[2];
    segStart = m.index + m[0].length;
  }
  // last segment
  if (lastSpeaker) {
    const text = body.slice(segStart).replace(/说话人\s*\d+\s+[\d:.]+\s*/g, '').trim();
    if (text) {
      segments.push({ speaker: lastSpeaker, text: text.slice(0, 2000) });
    }
  }
  meta.segments = segments;
  meta.segment_count = segments.length;

  return meta;
}

function guessMeetingKind(title, keywords) {
  const t = (title + ' ' + keywords.join(' ')).toLowerCase();
  if (t.includes('战略') || t.includes('方向') || t.includes('规划')) return 'strategy_roadshow';
  if (t.includes('经营') || t.includes('预算') || t.includes('盈利')) return 'internal_ops';
  if (t.includes('ai') || t.includes('算法') || t.includes('数字化')) return 'tech_review';
  if (t.includes('合作') || t.includes('谈判') || t.includes('银行')) return 'industry_research';
  return 'general';
}

// ---- 主逻辑 ----
async function main() {
  console.log(`\n🚀 Import Feishu Minutes → ${DRY_RUN ? 'DRY RUN' : DB_HOST}\n`);

  // 1. 扫描 .md 文件
  const files = readdirSync(MINUTES_DIR)
    .filter((f) => f.endsWith('.md') && !f.startsWith('_'))
    .sort();
  console.log(`Found ${files.length} .md files`);

  // 2. 解析每个文件
  const records = [];
  for (const file of files) {
    const filePath = join(MINUTES_DIR, file);
    const raw = readFileSync(filePath, 'utf-8');
    const fm = parseFrontmatter(raw);
    const bodyAfterFm = raw.replace(/^---\n[\s\S]*?\n---\n?/, '');
    const bodyMeta = parseBodyMeta(bodyAfterFm);

    const minuteToken = fm.minute_token || file.replace('.md', '').split('-').pop();
    const title = fm.title || file.replace('.md', '');

    records.push({
      file,
      title,
      content: raw,
      minute_token: minuteToken,
      feishu_link: fm.feishu_link || '',
      ...bodyMeta,
    });
  }
  console.log(`Parsed ${records.length} records`);

  if (DRY_RUN) {
    console.log('\n--- DRY RUN: first 3 records ---');
    for (const r of records.slice(0, 3)) {
      console.log(`  ${r.title} | ${r.occurred_at} | ${r.duration_min}min | ${r.segment_count} segs | kw: ${r.keywords.slice(0, 5).join(',')}`);
    }
    console.log(`\n  Total: ${records.length} records, ${records.filter((r) => r.duration_min >= 3).length} with duration ≥ 3min`);
    return;
  }

  // 3. 连接数据库
  const pool = new pg.Pool({
    host: DB_HOST,
    port: 5432,
    database: 'author',
    user: 'scubiry',
    password: '0tzgzmjUXWCgTed1N28iaA==',
  });

  // 4. 获取 scope slug→id 映射
  const { rows: scopes } = await pool.query(
    "SELECT id, slug, kind FROM mn_scopes WHERE status='active'"
  );
  const scopeMap = {};
  for (const s of scopes) scopeMap[s.slug] = s.id;
  console.log(`Active scopes: ${scopes.length}`);

  // 5. 获取现有 asset 的 external_id 列表（去重）
  const { rows: existing } = await pool.query(
    "SELECT metadata->>'external_id' AS eid FROM assets WHERE source='feishu-minutes'"
  );
  const existingIds = new Set(existing.map((r) => r.eid));
  console.log(`Existing feishu-minutes assets: ${existingIds.size}`);

  // 6. 逐条插入
  let inserted = 0;
  let skipped = 0;
  let bound = 0;

  for (const r of records) {
    const externalId = `feishu:${r.minute_token}`;
    if (existingIds.has(externalId)) {
      skipped++;
      continue;
    }

    const meetingKind = guessMeetingKind(r.title, r.keywords);

    // 构建 parse_segments
    const parseSegments = {
      count: r.segment_count,
      truncated: false,
      segments: r.segments.map((s, i) => ({
        speaker: s.speaker,
        text: s.text,
      })),
    };

    // 构建 metadata
    const metadata = {
      external_id: externalId,
      minute_token: r.minute_token,
      feishu_link: r.feishu_link,
      occurred_at: r.occurred_at ? `${r.occurred_at}T00:00:00+08:00` : null,
      duration_min: r.duration_min,
      keywords: r.keywords,
      meeting_kind: meetingKind,
      parse_segments: parseSegments,
      participants: [...new Set(r.segments.map((s) => s.speaker))].map((name) => ({ name })),
      parsed_at: new Date().toISOString(),
      parse: {
        segmentCount: r.segment_count,
        participants: [...new Set(r.segments.map((s) => s.speaker))].map((name) => ({ name })),
      },
    };

    const result = await pool.query(
      `INSERT INTO assets (id, type, title, content, content_type, source, metadata, workspace_id)
       VALUES (gen_random_uuid(), 'meeting_minutes', $1, $2, 'txt', 'feishu-minutes', $3, $4)
       RETURNING id`,
      [r.title, r.content, JSON.stringify(metadata), WORKSPACE_ID]
    );

    const assetId = result.rows[0].id;
    inserted++;

    // 绑定 scope
    const scopeBindings = getScopeBindingsForFile(r.file, r.title, r.keywords, scopeMap);
    for (const scopeId of scopeBindings) {
      try {
        await pool.query(
          `INSERT INTO mn_scope_members (scope_id, meeting_id, reason)
           VALUES ($1, $2, 'feishu-import') ON CONFLICT DO NOTHING`,
          [scopeId, assetId]
        );
        bound++;
      } catch (e) {
        console.warn(`  ⚠ bind failed: ${r.title} → ${scopeId}: ${e.message}`);
      }
    }

    console.log(`  ✓ ${r.title} (${r.duration_min}min, ${r.segment_count}segs) → ${scopeBindings.length} scopes`);
  }

  console.log(`\n📊 Import complete: ${inserted} inserted, ${skipped} skipped, ${bound} scope bindings`);

  // 7. 验证
  const { rows: verify } = await pool.query(
    "SELECT count(*) AS cnt FROM assets WHERE source='feishu-minutes'"
  );
  console.log(`Verify: ${verify[0].cnt} feishu-minutes assets in DB`);

  const { rows: scopeVerify } = await pool.query(
    `SELECT s.kind, s.name, count(sm.meeting_id) AS meetings
     FROM mn_scopes s
     LEFT JOIN mn_scope_members sm ON sm.scope_id = s.id
     WHERE s.status='active'
     GROUP BY s.kind, s.name
     ORDER BY s.kind, count DESC`
  );
  console.log('\nScope bindings:');
  for (const row of scopeVerify) {
    if (row.meetings > 0) console.log(`  ${row.kind}/${row.name}: ${row.meetings} meetings`);
  }

  await pool.end();
}

// ---- Scope 绑定逻辑 ----
function getScopeBindingsForFile(file, title, keywords, scopeMap) {
  const bindings = [];

  // 按 scope-design.md 映射表硬编码
  // minute_token → project/topic/client slug
  const MAPPING = {
    // TODO: fill mapping
  };

  // 基于标题关键词自动匹配
  const t = (title + ' ' + keywords.join(' ')).toLowerCase();

  // Project
  if (t.includes('装修') || t.includes('托管') || t.includes('信托') || t.includes('整装') || t.includes('发包') || t.includes('业主') || t.includes('家装') || t.includes('万华') || t.includes('供应链') || t.includes('风控') || t.includes('资金方案') || t.includes('报价') || t.includes('定价')) {
    if (scopeMap['meizu-renovation-custody']) bindings.push(scopeMap['meizu-renovation-custody']);
  } else if (t.includes('租赁') || t.includes('汇聚') || t.includes('链家') || t.includes('省心租') || t.includes('退租') || t.includes('公租房')) {
    if (scopeMap['meizu-rental-ops']) bindings.push(scopeMap['meizu-rental-ops']);
  } else if (t.includes('被窝')) {
    if (scopeMap['beiwo-home']) bindings.push(scopeMap['beiwo-home']);
  } else if (t.includes('全房通') || t.includes('澳洲') || t.includes('规则引擎')) {
    if (scopeMap['quanfangtong']) bindings.push(scopeMap['quanfangtong']);
  } else if (t.includes('内容运营') || t.includes('爬虫')) {
    if (scopeMap['content-ops']) bindings.push(scopeMap['content-ops']);
  } else if (t.includes('ai') || t.includes('知识库') || t.includes('转型')) {
    if (scopeMap['ai-product']) bindings.push(scopeMap['ai-product']);
  } else {
    // 默认归入装修托管
    if (scopeMap['meizu-renovation-custody']) bindings.push(scopeMap['meizu-renovation-custody']);
  }

  // Topic
  if (t.includes('信托') || t.includes('保证金') || t.includes('资金方案') || t.includes('保理') || t.includes('收益分配') || t.includes('资金成本') || t.includes('星图')) {
    if (scopeMap['funding-structure']) bindings.push(scopeMap['funding-structure']);
  } else if (t.includes('装修方案') || t.includes('报价') || t.includes('定价') || t.includes('产品方案') || t.includes('美租业务')) {
    if (scopeMap['renovation-product']) bindings.push(scopeMap['renovation-product']);
  } else if (t.includes('供应商') || t.includes('发包') || t.includes('结算') || t.includes('仓储') || t.includes('质检')) {
    if (scopeMap['supply-chain']) bindings.push(scopeMap['supply-chain']);
  } else if (t.includes('风险') || t.includes('违约') || t.includes('坏账') || t.includes('风控') || t.includes('担保')) {
    if (scopeMap['risk-control']) bindings.push(scopeMap['risk-control']);
  } else if (t.includes('经营') || t.includes('预算') || t.includes('盈利') || t.includes('毛利') || t.includes('成本') || t.includes('战略方向') || t.includes('组织管理') || t.includes('规模效应')) {
    if (scopeMap['business-review']) bindings.push(scopeMap['business-review']);
  } else if (t.includes('合作') || t.includes('战略') || t.includes('锦江') || t.includes('银行') || t.includes('谈判') || t.includes('新雅欣') || t.includes('城投') || t.includes('澳洲') || t.includes('日本') || t.includes('公租房')) {
    if (scopeMap['partnership-deal']) bindings.push(scopeMap['partnership-deal']);
  } else if (t.includes('流程') || t.includes('标准') || t.includes('退租') || t.includes('规则引擎')) {
    if (scopeMap['org-process']) bindings.push(scopeMap['org-process']);
  } else if (t.includes('ai') || t.includes('数字化') || t.includes('知识库') || t.includes('转型')) {
    if (scopeMap['ai-digital']) bindings.push(scopeMap['ai-digital']);
  } else {
    // 默认归入经营分析
    if (scopeMap['business-review']) bindings.push(scopeMap['business-review']);
  }

  // Client
  if (t.includes('宁波银行') || t.includes('银行')) {
    if (scopeMap['ningbo-bank']) bindings.push(scopeMap['ningbo-bank']);
  } else if (t.includes('上海信托') || t.includes('信托') && !t.includes('银行')) {
    if (scopeMap['s-v1pfw']) bindings.push(scopeMap['s-v1pfw']);
  } else if (t.includes('万华') || t.includes('零甲醛')) {
    if (scopeMap['wanhua']) bindings.push(scopeMap['wanhua']);
  } else if (t.includes('锦江')) {
    if (scopeMap['jinjiang']) bindings.push(scopeMap['jinjiang']);
  } else if (t.includes('城投') || t.includes('左海') || t.includes('福州')) {
    if (scopeMap['chengtou-zuohai']) bindings.push(scopeMap['chengtou-zuohai']);
  } else if (t.includes('新雅欣') || t.includes('中高端分散式')) {
    if (scopeMap['xinyaxin']) bindings.push(scopeMap['xinyaxin']);
  } else if (t.includes('如珩')) {
    if (scopeMap['s-74hxv']) bindings.push(scopeMap['s-74hxv']);
  }
  // 地区 client (slug kept from original: 上海=s-zgi8u, 北京=s-d4wg7, 成都=s-zgdwr)
  if (t.includes('北京') || t.includes('被窝')) {
    if (scopeMap['s-d4wg7']) bindings.push(scopeMap['s-d4wg7']);
  } else if (t.includes('成都')) {
    if (scopeMap['s-zgdwr']) bindings.push(scopeMap['s-zgdwr']);
  } else if (t.includes('上海') || t.includes('汇聚') || t.includes('江苏')) {
    if (scopeMap['s-zgi8u']) bindings.push(scopeMap['s-zgi8u']);
  }

  // 去重
  return [...new Set(bindings)];
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
