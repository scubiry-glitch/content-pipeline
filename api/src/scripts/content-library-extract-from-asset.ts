#!/usr/bin/env npx tsx
/**
 * 从素材库 `assets` 表挑一篇（或指定 id）做内容库事实抽取，写入 content_facts / content_entities。
 *
 * 用法（在 api/ 下）:
 *   npx tsx src/scripts/content-library-extract-from-asset.ts
 *   npx tsx src/scripts/content-library-extract-from-asset.ts --id=asset_xxxx
 *
 * 依赖: api/.env 数据库 + 任一可用 LLM（与 server 相同）
 */
import * as dotenv from 'dotenv';
import * as path from 'path';
import { initDatabase, query } from '../db/connection.js';
import { generate, generateEmbedding } from '../services/llm.js';
import { createContentLibraryEngine } from '../modules/content-library/index.js';
import { createContentLibraryPipelineDeps } from '../modules/content-library/adapters/pipeline.js';

const API_ROOT = process.cwd();
dotenv.config({ path: path.join(API_ROOT, '.env') });

const MIN_CONTENT_LEN = 80;
const MAX_EXTRACT_CHARS = 12_000;

function argId(): string | undefined {
  const a = process.argv.find((x) => x.startsWith('--id='));
  return a ? a.slice('--id='.length).trim() || undefined : undefined;
}

async function main() {
  console.log('[ContentLibrary:ExtractFromAsset] 初始化数据库…');
  await initDatabase();

  const idArg = argId();
  let row: { id: string; title: string; content: string } | undefined;

  if (idArg) {
    const r = await query(
      `SELECT id, title, content FROM assets WHERE id = $1 AND (is_deleted IS NOT TRUE)`,
      [idArg]
    );
    row = r.rows[0];
    if (!row?.content?.trim()) {
      console.error(`未找到可用素材或正文为空: ${idArg}`);
      process.exit(1);
    }
  } else {
    const r = await query(
      `SELECT id, title, content FROM assets
       WHERE (is_deleted IS NOT TRUE)
         AND content IS NOT NULL
         AND length(trim(content)) >= $1
       ORDER BY RANDOM()
       LIMIT 1`,
      [MIN_CONTENT_LEN]
    );
    row = r.rows[0];
    if (!row) {
      console.error(
        `[ContentLibrary:ExtractFromAsset] 没有符合条件的素材（正文字数 ≥ ${MIN_CONTENT_LEN}）。请先上传素材到 assets。`
      );
      process.exit(1);
    }
  }

  const snippet = row.content.trim().slice(0, MAX_EXTRACT_CHARS);
  console.log(`[ContentLibrary:ExtractFromAsset] 选中素材 id=${row.id} title=${(row.title || '').slice(0, 80)}…`);
  console.log(`[ContentLibrary:ExtractFromAsset] 抽取正文长度=${snippet.length}（上限 ${MAX_EXTRACT_CHARS}）`);

  const deps = createContentLibraryPipelineDeps(query, generate, generateEmbedding);
  const engine = createContentLibraryEngine(deps);

  console.log('[ContentLibrary:ExtractFromAsset] 调用 LLM 抽取事实（可能需数十秒）…');
  const out = await engine.extractFacts({
    content: snippet,
    assetId: row.id,
  });

  console.log('[ContentLibrary:ExtractFromAsset] 完成。');
  console.log(`  - 返回事实条数(本轮压缩后): ${out.facts.length}`);
  console.log(`  - 返回实体数: ${out.entities.length}`);
  console.log('  请在 Web「内容库」/facts、/entities 刷新查看；议题推荐需实体与事实已入库。');
}

main().catch((e) => {
  console.error('[ContentLibrary:ExtractFromAsset] 失败:', e);
  process.exit(1);
});
