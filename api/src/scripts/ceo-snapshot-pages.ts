/**
 * CEO 8 棱镜页面 JSON 快照备份
 *
 * 用法:
 *   cd api && npm run ceo:snapshot-pages
 *   cd api && npm run ceo:snapshot-pages -- --out=docs/ceo-app-samples-s/_backup-2026-05-03
 *   cd api && npm run ceo:snapshot-pages -- --scopes=美租
 *
 * 行为:
 *   1. 加载目标 scope（默认 4 个：业务支持/美租/养老/集团分析）
 *   2. in-process 调用各 prism 的 dashboard service 函数（不走 HTTP）
 *   3. 把响应写到 <out>/<prism>.json，结构与 docs/ceo-app-samples-s/ 现有 JSON 一致
 *   4. 同时写一份 all.json 把 8 个汇总
 *
 * 与 ceo-generate-real-content 的关系:
 *   - generate-real 跑 LLM 写表
 *   - snapshot-pages 是只读：读现有表 → 序列化为 page JSON
 *   - 重跑 generate-real 前先 snapshot-pages 一次，备份当前页面状态
 *
 * 还原:
 *   docs/ceo-app-samples-s/_backup-<date>/ 已与 samples-s 同结构，可作为
 *   ceo:seed-from-samples-s --dir=<out> 的输入还原数据。
 */
import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
for (const p of [resolve(process.cwd(), '.env'), resolve(process.cwd(), 'api', '.env'), join(__dirname, '../../.env')]) {
  try { dotenv.config({ path: p }); } catch { /* ignore */ }
}

const TARGET_SCOPE_NAMES = ['业务支持', '美租', '养老', '集团分析'];

async function main() {
  const args = process.argv.slice(2);
  const scopeFilter = args.find((a) => a.startsWith('--scopes='))?.slice('--scopes='.length).split(',');
  const outArg = args.find((a) => a.startsWith('--out='))?.slice('--out='.length);

  const { query, ensureDbPoolConnected } = await import('../db/connection.js');
  const { createCeoPipelineDeps } = await import('../modules/ceo/adapters/pipeline.js');
  const { getCompassDashboard } = await import('../modules/ceo/rooms/compass/service.js');
  const { getBoardroomDashboard } = await import('../modules/ceo/rooms/boardroom/service.js');
  const { getTowerDashboard } = await import('../modules/ceo/rooms/tower/service.js');
  const { getWarRoomDashboard } = await import('../modules/ceo/rooms/war-room/service.js');
  const { getSituationDashboard } = await import('../modules/ceo/rooms/situation/service.js');
  const { getBalconyDashboard } = await import('../modules/ceo/rooms/balcony/service.js');
  const { getPanoramaData } = await import('../modules/ceo/panorama/service.js');
  const { getBrainOverview } = await import('../modules/ceo/brain/tasks-service.js');

  await ensureDbPoolConnected();

  // 1. 拉目标 scope
  const targetNames = scopeFilter && scopeFilter.length > 0 ? scopeFilter : TARGET_SCOPE_NAMES;
  const placeholders = targetNames.map((_, i) => `$${i + 1}`).join(',');
  const scopeRes = await query(
    `SELECT s.id::text AS id, s.name, s.kind FROM mn_scopes s
      WHERE s.status = 'active' AND s.kind = 'project' AND s.name IN (${placeholders})
      ORDER BY s.name`,
    targetNames,
  );
  const scopes = (scopeRes.rows as any[]).map((r) => ({ id: String(r.id), name: String(r.name), kind: String(r.kind) }));
  if (scopes.length === 0) {
    console.error(`[ceo-snapshot] 没找到目标 scope: ${targetNames.join(', ')}`);
    process.exit(3);
  }
  console.log(`[ceo-snapshot] target scopes (${scopes.length}): ${scopes.map((s) => s.name).join(', ')}`);

  // 2. 决定输出目录
  const repoRoot = join(__dirname, '../../..');
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outDir = outArg
    ? (outArg.startsWith('/') ? outArg : join(repoRoot, outArg))
    : join(repoRoot, `docs/ceo-app-samples-s/_backup-${ts}`);
  mkdirSync(outDir, { recursive: true });
  console.log(`[ceo-snapshot] out=${outDir}`);

  // 3. 构造无 LLM 的 deps（只读 dashboard 不需要 LLM）
  const deps = createCeoPipelineDeps({
    dbQuery: (sql, params) => query(sql, params),
  });

  const scopeIds = scopes.map((s) => s.id);
  const primaryScopeId = scopeIds[0];

  // 4. 逐 prism 抓 dashboard
  const all: Record<string, unknown> = {};
  const meta = {
    $generated_at: new Date().toISOString(),
    $generated_by: 'ceo-snapshot-pages.ts',
    $scopes: scopes,
    $note: '页面快照备份；与 docs/ceo-app-samples-s 同结构，可作为 ceo:seed-from-samples-s --dir=<this> 还原',
  };

  type Probe = { name: string; key: string; fn: () => Promise<unknown> };
  const probes: Probe[] = [
    {
      name: 'compass', key: 'GET /api/v1/ceo/compass/dashboard',
      fn: () => getCompassDashboard(deps, primaryScopeId),
    },
    {
      name: 'boardroom', key: 'GET /api/v1/ceo/boardroom/dashboard?scopes=...',
      fn: () => getBoardroomDashboard(deps, scopeIds),
    },
    {
      name: 'tower', key: 'GET /api/v1/ceo/tower/dashboard',
      fn: () => getTowerDashboard(deps, primaryScopeId),
    },
    {
      name: 'war-room', key: 'GET /api/v1/ceo/war-room/dashboard',
      fn: () => getWarRoomDashboard(deps, primaryScopeId),
    },
    {
      name: 'situation', key: 'GET /api/v1/ceo/situation/dashboard',
      fn: () => getSituationDashboard(deps, primaryScopeId),
    },
    {
      name: 'balcony', key: 'GET /api/v1/ceo/balcony/dashboard',
      fn: () => getBalconyDashboard(deps, 'system'),
    },
    {
      name: 'panorama', key: 'GET /api/v1/ceo/panorama',
      fn: () => getPanoramaData(deps, scopeIds),
    },
    {
      name: 'brain', key: 'GET /api/v1/ceo/brain/overview',
      fn: () => getBrainOverview(deps),
    },
  ];

  for (const probe of probes) {
    try {
      const data = await probe.fn();
      const file = {
        ...meta,
        $page: `/ceo/internal/ceo/${probe.name}`,
        endpoints: { [probe.key]: data },
      };
      const path = join(outDir, `${probe.name}.json`);
      writeFileSync(path, JSON.stringify(file, null, 2) + '\n', 'utf8');
      all[probe.name] = data;
      console.log(`[ceo-snapshot] ✓ ${probe.name} → ${path}`);
    } catch (e) {
      console.warn(`[ceo-snapshot] ✗ ${probe.name}: ${(e as Error).message}`);
      all[probe.name] = { error: (e as Error).message };
    }
  }

  // 5. all.json 汇总
  const allFile = {
    ...meta,
    $page: '/ceo/internal/ceo (全部 8 棱镜聚合)',
    prisms: all,
  };
  writeFileSync(join(outDir, 'all.json'), JSON.stringify(allFile, null, 2) + '\n', 'utf8');
  console.log(`[ceo-snapshot] ✓ all.json`);

  console.log(`\n[ceo-snapshot] 完成 → ${outDir}`);
  process.exit(0);
}

main().catch((e) => {
  console.error('[ceo-snapshot] failed:', e);
  process.exit(1);
});
