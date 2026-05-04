/**
 * 从 api/config/run-routing.json 输出可 SSH 同步的 worker 行（TSV）。
 * 列：worker_id \t user@host \t repo \t pm2_app \t worker_log \t ssh_port \t sync_mode
 * sync_mode：deploy.sync_mode，git（默认）| scp
 *
 * 入选条件：enabled !== false、有 ssh、有 deploy.repo、host 存在且非 localhost。
 * pm2_app / worker_log 缺省为 "-"（由 shell 侧解释为「跳过」）。
 */
import fs from 'node:fs';

const routingPath = process.argv[2];
if (!routingPath) {
  console.error('usage: node scripts/parse-run-routing-remote-hosts.mjs <path/to/run-routing.json>');
  process.exit(1);
}

const j = JSON.parse(fs.readFileSync(routingPath, 'utf8'));
const workers = j.workers ?? {};

for (const [id, spec] of Object.entries(workers)) {
  if (spec.enabled === false) continue;
  if (!spec.ssh || !spec.deploy?.repo) continue;
  const host = spec.host;
  if (!host || host === 'localhost') continue;
  const user = spec.ssh.user ?? 'root';
  const port = spec.ssh.port ?? 22;
  const repo = String(spec.deploy.repo).replace(/\/+$/, '');
  const pm2 = spec.deploy.pm2_app != null && spec.deploy.pm2_app !== '' ? String(spec.deploy.pm2_app) : '-';
  const log = spec.deploy.worker_log != null && spec.deploy.worker_log !== '' ? String(spec.deploy.worker_log) : '-';
  const rawMode = spec.deploy.sync_mode;
  const syncMode = rawMode === 'scp' ? 'scp' : 'git';
  process.stdout.write([id, `${user}@${host}`, repo, pm2, log, String(port), syncMode].join('\t') + '\n');
}
