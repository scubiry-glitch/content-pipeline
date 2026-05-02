/**
 * Meeting Notes 模块 DDL 在 initDatabase/setupMVPSchema 中执行，
 * 避免未手动 psql 迁移时 /api/v1/meeting-notes/runs 等路由因缺表返回 500。
 *
 * 全部 migration 都是 idempotent（CREATE TABLE/INDEX IF NOT EXISTS）→ 可重复执行。
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const FILES = [
  '001-scope-and-memberships.sql',
  '002-people-axis.sql',
  '003-projects-axis.sql',
  '004-knowledge-axis.sql',
  '005-meta-axis.sql',
  '006-runs-and-versions.sql',
  '007-longitudinal.sql',
  '008-cross-axis-links.sql',
  '009-migrate-existing.sql',
  '010-tension-consensus-nebula.sql',
  '011-schedules.sql',
  '012-tension-axis.sql',
  '013-source-tracking.sql',
  '014-claude-cli-source.sql',
  '015-runs-heartbeat.sql',
  '016-people-merge-fn.sql',
  '017-detail-perf-indexes.sql',
  '018-library-list-perf.sql',
  '019-scope-hierarchy.sql',
  '020-runs-module.sql',
  '021-runs-axis-ceo.sql',
  '022-runs-axis-relax.sql',
  '023-knowledge-axis-extension.sql',
  '024-runs-dag.sql',
  '025-run-routing.sql',
] as const;

function firstExistingDir(candidates: string[]): string | null {
  for (const dir of candidates) {
    const probe = join(dir, FILES[0]);
    if (existsSync(probe)) return dir;
  }
  return null;
}

/** 按常见工作目录解析迁移 SQL 所在目录（api 目录、仓库根、仅 dist 的 Docker 镜像）。 */
export function resolveMeetingNotesMigrationsDir(): string {
  const cwd = process.cwd();
  const dir = firstExistingDir([
    join(cwd, 'src/modules/meeting-notes/migrations'),
    join(cwd, 'api/src/modules/meeting-notes/migrations'),
    join(cwd, 'meeting-notes-migrations'),
  ]);
  if (!dir) {
    throw new Error(
      '未找到 meeting-notes SQL 迁移目录（期望含 001-scope-and-memberships.sql）。' +
        '请从 `api/` 启动服务，或将仓库根作为 cwd；Docker 请将 migrations 复制到 /app/meeting-notes-migrations。',
    );
  }
  return dir;
}

export async function ensureMeetingNotesModuleSchema(
  runSql: (sql: string) => Promise<unknown>,
): Promise<void> {
  const migrationsDir = resolveMeetingNotesMigrationsDir();
  for (const name of FILES) {
    const path = join(migrationsDir, name);
    const sql = readFileSync(path, 'utf8');
    await runSql(sql);
  }
  console.log(`[DB] meeting-notes 模块表结构已就绪（共 ${FILES.length} 个 migration）`);
}
