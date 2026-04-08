#!/usr/bin/env npx tsx
/**
 * 按 loadExpertsData() 顺序，跳过 data/*.ts 已有 ExpertProfile 的 id，至多 34 位生成待审 JSON。
 * 输出：api/src/modules/expert-library/data/generated/pending-review/{id}.json + manifest.json
 *
 * LLM：与在线专家库一致，经 initLLMRouter + task `expert_library`（火山优先 → SiliconFlow → 已注册 Provider，见 providers/index.ts）。
 *
 * 用法：cd api && npx tsx src/scripts/batch-generate-expert-profiles.ts [--force] [--id=E08-08]
 * --force：覆盖已存在的 pending-review/{id}.json
 * --id=：仅生成指定 expert_id（须存在于 loadExpertsData 且非内置 SKIP 集合）
 */
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { pathToFileURL } from 'url';
import { initLLMRouter, getLLMRouter, isClaudeCodeEnvironment } from '../providers/index.js';
import { SKIP_GENERATE_IDS } from '../modules/expert-library/builtinExpertIds.js';
import { assertExpertProfile } from '../modules/expert-library/expertProfileDb.js';
import type { ExpertProfile } from '../modules/expert-library/types.js';

/** 请在仓库 `api/` 目录下执行：npm run expert:gen-batch */
const API_ROOT = process.cwd();
dotenv.config({ path: path.join(API_ROOT, '.env') });

function initRouterLikeServer() {
  const claudeApiKey = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
  const openaiApiKey = process.env.OPENAI_API_KEY;
  const inClaudeCode = isClaudeCodeEnvironment();
  const kimiApiKey =
    process.env.KIMI_API_KEY || (claudeApiKey?.startsWith('sk-kimi') ? claudeApiKey : undefined);
  // 与 server.ts 一致；VOLCANO / SILICONFLOW 等由 initLLMRouter 读取 process.env
  initLLMRouter({
    kimiApiKey,
    claudeApiKey: claudeApiKey?.startsWith('sk-kimi') ? undefined : claudeApiKey,
    openaiApiKey,
    useClaudeCode: inClaudeCode && !claudeApiKey,
  });
}

const BATCH_LIMIT = 34;
const OUT_DIR = path.join(API_ROOT, 'src/modules/expert-library/data/generated/pending-review');

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  const fence = /```(?:json)?\s*([\s\S]*?)```/;
  const m = trimmed.match(fence);
  const body = m ? m[1].trim() : trimmed;
  return JSON.parse(body);
}

function buildPrompt(card: {
  id: string;
  name: string;
  domainName: string;
  title: string;
  background: string;
  personality: string;
  philosophyCore: string[];
  philosophyQuotes: string[];
  reviewDimensions: string[];
}): string {
  return `你是专家库架构师。根据以下「薄档案」卡片，生成一个完整、可机读的 ExpertProfile JSON（不要 markdown，不要代码块外多余文字）。

## 卡片数据
- expert_id（必须原样）: ${card.id}
- name（必须原样）: ${card.name}
- 领域名: ${card.domainName}
- title: ${card.title}
- background: ${card.background}
- personality: ${card.personality}
- philosophy.core: ${JSON.stringify(card.philosophyCore)}
- philosophy.quotes: ${JSON.stringify(card.philosophyQuotes)}
- reviewDimensions: ${JSON.stringify(card.reviewDimensions)}

## JSON Schema 要求（字段必须齐全）
顶层: expert_id, name, domain(字符串数组，含领域与评审取向标签), persona{style,tone,bias[],cognition{mentalModel,decisionStyle,riskAttitude,timeHorizon},values{excites[],irritates[],qualityBar,dealbreakers[]},taste{admires[],disdains[],benchmark},voice{disagreementStyle,praiseStyle},blindSpots{knownBias[],weakDomains[],selfAwareness}}, method{frameworks[],reasoning,analysis_steps[],reviewLens{firstGlance,deepDive[],killShot,bonusPoints[]},dataPreference,evidenceStandard}, emm{critical_factors[],factor_hierarchy(权重和=1),veto_rules[],aggregation_logic}, constraints{must_conclude,allow_assumption}, output_schema{format,sections[],rubrics可选}, anti_patterns[], signature_phrases[]

认知与 EMM 必须贴合该人物卡片，可推理但不要宣称「本人亲自说过」。aggregation_logic 用 "weighted_score + 一票否决"。
constraints.must_conclude 与 constraints.allow_assumption 必须为布尔值 true/false（不能用文字说明替代）。

只输出一个 JSON 对象。`;
}

function parseOnlyId(): string | null {
  const arg = process.argv.find((a) => a.startsWith('--id='));
  return arg ? arg.slice('--id='.length).trim() || null : null;
}

async function main() {
  const force = process.argv.includes('--force');
  const onlyId = parseOnlyId();
  fs.mkdirSync(OUT_DIR, { recursive: true });

  initRouterLikeServer();
  const llmRouter = getLLMRouter();

  const expertServicePath = path.join(API_ROOT, '../webapp/src/services/expertService.ts');
  if (!fs.existsSync(expertServicePath)) {
    console.error('找不到 webapp expertService:', expertServicePath);
    process.exit(1);
  }

  const { loadExpertsData } = await import(pathToFileURL(expertServicePath).href);

  const all = loadExpertsData() as Array<{
    id: string;
    name: string;
    domainName: string;
    profile: { title: string; background: string; personality: string };
    philosophy: { core: string[]; quotes: string[] };
    reviewDimensions: string[];
  }>;

  const eligible = all.filter((e) => !SKIP_GENERATE_IDS.has(e.id));
  let targets: typeof all;
  if (onlyId) {
    const one = eligible.filter((e) => e.id === onlyId);
    if (one.length === 0) {
      if (!all.some((e) => e.id === onlyId)) {
        console.error(`找不到专家: ${onlyId}`);
        process.exit(1);
      }
      if (SKIP_GENERATE_IDS.has(onlyId)) {
        console.error(`${onlyId} 为代码内置画像，无需批量生成`);
        process.exit(1);
      }
      console.error(`${onlyId} 无法进入生成列表`);
      process.exit(1);
    }
    targets = one;
    console.log(`单专家模式: ${onlyId}`);
  } else {
    targets = eligible.slice(0, BATCH_LIMIT);
  }

  console.log(`将处理 ${targets.length} 位专家${onlyId ? '' : `（上限 ${BATCH_LIMIT}）`}，输出目录: ${OUT_DIR}`);

  const manifest: {
    generatedAt: string;
    batchLimit: number;
    modelNotes: string;
    items: Array<{ expert_id: string; status: string; path?: string; error?: string }>;
  } = {
    generatedAt: new Date().toISOString(),
    batchLimit: onlyId ? 1 : BATCH_LIMIT,
    modelNotes: onlyId
      ? `single:${onlyId};llm=LLMRouter:expert_library`
      : 'batch-generate-expert-profiles;llm=LLMRouter:expert_library',
    items: [],
  };

  for (const e of targets) {
    const outFile = path.join(OUT_DIR, `${e.id}.json`);
    if (fs.existsSync(outFile) && !force) {
      console.log(`跳过(已存在) ${e.id}`);
      manifest.items.push({ expert_id: e.id, status: 'skipped_exists', path: outFile });
      continue;
    }

    const prompt = buildPrompt({
      id: e.id,
      name: e.name,
      domainName: e.domainName,
      title: e.profile.title,
      background: e.profile.background,
      personality: e.profile.personality,
      philosophyCore: e.philosophy.core,
      philosophyQuotes: e.philosophy.quotes,
      reviewDimensions: e.reviewDimensions,
    });

    try {
      const { content, model } = await llmRouter.generate(prompt, 'expert_library', {
        maxTokens: 8192,
        temperature: 0.35,
      });
      let parsed: unknown;
      try {
        parsed = extractJsonObject(content);
      } catch (parseErr: any) {
        const errPath = path.join(OUT_DIR, `${e.id}.error.json`);
        fs.writeFileSync(
          errPath,
          JSON.stringify({ expert_id: e.id, raw: content, error: String(parseErr.message) }, null, 2),
          'utf-8'
        );
        manifest.items.push({ expert_id: e.id, status: 'parse_error', error: parseErr.message });
        console.error(`解析失败 ${e.id}，见 ${errPath}`);
        continue;
      }

      if (!assertExpertProfile(parsed)) {
        const errPath = path.join(OUT_DIR, `${e.id}.error.json`);
        fs.writeFileSync(errPath, JSON.stringify({ expert_id: e.id, parsed, error: 'assertExpertProfile failed' }, null, 2), 'utf-8');
        manifest.items.push({ expert_id: e.id, status: 'validation_error' });
        console.error(`校验失败 ${e.id}，见 ${errPath}`);
        continue;
      }

      const prof = parsed as ExpertProfile;
      if (prof.expert_id !== e.id || prof.name !== e.name) {
        prof.expert_id = e.id;
        prof.name = e.name;
      }

      fs.writeFileSync(outFile, JSON.stringify(prof, null, 2), 'utf-8');
      manifest.items.push({ expert_id: e.id, status: 'ok', path: outFile });
      console.log(`已生成 ${e.id} (${model})`);
      await new Promise((r) => setTimeout(r, 1500));
    } catch (err: any) {
      manifest.items.push({ expert_id: e.id, status: 'llm_error', error: err.message });
      console.error(`LLM 失败 ${e.id}:`, err.message);
    }
  }

  fs.writeFileSync(path.join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8');
  console.log('manifest 已写入 manifest.json');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
