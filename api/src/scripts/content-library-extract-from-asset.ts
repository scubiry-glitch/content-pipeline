#!/usr/bin/env npx tsx
/**
 * 从素材库 `assets` 表挑一篇（或指定 id）做内容库事实抽取，写入 content_facts / content_entities。
 *
 * 用法（在 api/ 下）:
 *   npx tsx src/scripts/content-library-extract-from-asset.ts
 *   npx tsx src/scripts/content-library-extract-from-asset.ts --id=asset_xxxx
 *   npx tsx src/scripts/content-library-extract-from-asset.ts --top=10
 *     （按 assets.quality_score、ai_quality_score 综合排序，对前 N 条各跑一遍抽取）
 *
 * 依赖: api/.env 数据库 + 任一可用 LLM（与 server 相同）
 */
import * as dotenv from 'dotenv';
import * as path from 'path';
import { initDatabase, query } from '../db/connection.js';
import { generateEmbedding } from '../services/llm.js';
import { initLLMRouter, isClaudeCodeEnvironment } from '../providers/index.js';
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

function argTop(): number | undefined {
  const a = process.argv.find((x) => x.startsWith('--top='));
  if (!a) return undefined;
  const n = parseInt(a.slice('--top='.length).trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const claudeApiKey = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
  const openaiApiKey = process.env.OPENAI_API_KEY;
  const inClaudeCode = isClaudeCodeEnvironment();
  const kimiApiKey =
    process.env.KIMI_API_KEY || (claudeApiKey?.startsWith('sk-kimi') ? claudeApiKey : undefined);
  initLLMRouter({
    kimiApiKey,
    claudeApiKey: claudeApiKey?.startsWith('sk-kimi') ? undefined : claudeApiKey,
    openaiApiKey,
    useClaudeCode: inClaudeCode && !claudeApiKey,
  });

  console.log('[ContentLibrary:ExtractFromAsset] 初始化数据库…');
  await initDatabase();

  const idArg = argId();
  const topN = argTop();

  const deps = createContentLibraryPipelineDeps(query, undefined, generateEmbedding);
  const engine = createContentLibraryEngine(deps);

  type AssetRow = { id: string; title: string; content: string };

  let rows: AssetRow[] = [];

  if (idArg) {
    const r = await query(
      `SELECT id, title, content FROM assets WHERE id = $1 AND (is_deleted IS NOT TRUE)`,
      [idArg]
    );
    const row = r.rows[0];
    if (!row?.content?.trim()) {
      console.error(`未找到可用素材或正文为空: ${idArg}`);
      process.exit(1);
    }
    rows = [row];
  } else if (topN) {
    const r = await query(
      `SELECT id, title, content,
              COALESCE(quality_score, 0)::float AS q,
              COALESCE(ai_quality_score, 0)::float AS ai_q
       FROM assets
       WHERE (is_deleted IS NOT TRUE)
         AND content IS NOT NULL
         AND length(trim(content)) >= $1
       ORDER BY
         GREATEST(
           COALESCE(quality_score, 0)::float,
           LEAST(1.0, COALESCE(ai_quality_score, 0)::float / 100.0)
         ) DESC,
         COALESCE(quality_score, 0) DESC,
         COALESCE(ai_quality_score, 0) DESC
       LIMIT $2`,
      [MIN_CONTENT_LEN, topN]
    );
    rows = r.rows;
    if (rows.length === 0) {
      console.error(
        `[ContentLibrary:ExtractFromAsset] 没有符合条件的素材（正文字数 ≥ ${MIN_CONTENT_LEN}）。请先上传素材到 assets。`
      );
      process.exit(1);
    }
    console.log(
      `[ContentLibrary:ExtractFromAsset] 按质量排序取前 ${rows.length} 条（--top=${topN}）`
    );
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
    const row = r.rows[0];
    if (!row) {
      console.error(
        `[ContentLibrary:ExtractFromAsset] 没有符合条件的素材（正文字数 ≥ ${MIN_CONTENT_LEN}）。请先上传素材到 assets。`
      );
      process.exit(1);
    }
    rows = [row];
  }

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const snippet = row.content.trim().slice(0, MAX_EXTRACT_CHARS);
    console.log(
      `\n[ContentLibrary:ExtractFromAsset] [${i + 1}/${rows.length}] id=${row.id} title=${(row.title || '').slice(0, 80)}…`
    );
    console.log(`[ContentLibrary:ExtractFromAsset] 抽取正文长度=${snippet.length}（上限 ${MAX_EXTRACT_CHARS}）`);

    console.log('[ContentLibrary:ExtractFromAsset] 调用 LLM 抽取事实（可能需数十秒）…');
    const out = await engine.extractFacts({
      content: snippet,
      assetId: row.id,
    });

    console.log('[ContentLibrary:ExtractFromAsset] 本条完成。');
    console.log(`  - 返回事实条数(本轮压缩后): ${out.facts.length}`);
    console.log(`  - 返回实体数: ${out.entities.length}`);

    if (i < rows.length - 1) {
      await sleep(1500);
    }
  }

  console.log('\n[ContentLibrary:ExtractFromAsset] 全部完成。');
  console.log('  请在 Web「内容库」/facts、/entities 刷新查看；议题推荐需实体与事实已入库。');
}

main().catch((e) => {
  console.error('[ContentLibrary:ExtractFromAsset] 失败:', e);
  process.exit(1);
});
