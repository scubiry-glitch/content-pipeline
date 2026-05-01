/**
 * CEO 模块 DDL 在 initDatabase/setupMVPSchema 中执行，
 * 避免未手动 psql 迁移时 /api/v1/ceo/* 路由因缺表返回 500。
 *
 * 全部 migration 都是 idempotent (CREATE TABLE/INDEX IF NOT EXISTS) → 可重复执行。
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const FILES = [
  '001-prism-and-rooms.sql',
  '002-room-metrics.sql',
  '003-annotations-and-briefs.sql',
  '004-stakeholders.sql',
  '005-balcony-reflections.sql',
  '006-person-agent-links.sql',
  '007-war-room-sparks.sql',
  '008-sandbox-runs.sql',
] as const;

function firstExistingDir(candidates: string[]): string | null {
  for (const dir of candidates) {
    const probe = join(dir, FILES[0]);
    if (existsSync(probe)) return dir;
  }
  return null;
}

export function resolveCeoMigrationsDir(): string {
  const cwd = process.cwd();
  const dir = firstExistingDir([
    join(cwd, 'src/modules/ceo/migrations'),
    join(cwd, 'api/src/modules/ceo/migrations'),
    join(cwd, 'ceo-migrations'),
  ]);
  if (!dir) {
    throw new Error(
      '未找到 CEO SQL 迁移目录 (期望含 001-prism-and-rooms.sql)。请从 `api/` 启动服务，或将仓库根作为 cwd。',
    );
  }
  return dir;
}

export async function ensureCeoModuleSchema(
  runSql: (sql: string) => Promise<unknown>,
): Promise<void> {
  const migrationsDir = resolveCeoMigrationsDir();
  for (const name of FILES) {
    const path = join(migrationsDir, name);
    const sql = readFileSync(path, 'utf8');
    await runSql(sql);
  }
  console.log(`[DB] CEO 模块表结构已就绪（共 ${FILES.length} 个 migration）`);
}
