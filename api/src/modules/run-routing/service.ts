// Run routing service — 解析 (module, scope_id, axis, model) → target_worker_id
//
// 规则源：api/config/run-routing.json (JSON 配置文件，非 DB 表)
//   - 启动时读一次，缓存到内存
//   - 通过 RUN_ROUTING_CONFIG env 可指向不同路径（部署时覆盖）
//   - 支持 SIGHUP 热重载（可选，先不实现）
//
// 调用时机：在 enqueue 阶段（写 mn_runs INSERT 前）解析 target_worker，
// 写到 mn_runs.target_worker。Worker 轮询时按 WORKER_ID 过滤。
//
// 匹配语义（按 priority ASC，先命中的胜出）：
//   - 字段缺省 / null = 通配
//   - axis_pattern / model_pattern：glob 风格 (* 匹配任意串)
//   - scope_id：精确匹配 UUID 字符串
//   - 没匹配上 → 返回 null（worker 端 SQL `target_worker IS NULL OR ...` 兜底，
//     任意 worker 都能消费）
//
// WORKER_ID env：
//   - 设了 → 用之
//   - 没设 → 回退 os.hostname()
//   - 都没 → 'unknown-worker'

import * as os from 'node:os';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { DatabaseAdapter } from '../ceo/types.js';

export interface RoutingCriteria {
  module: 'mn' | 'ceo' | 'expert' | string;
  scopeId?: string | null;
  axis?: string | null;
  model?: string | null;
  /** 显式覆盖：metadata.workerHint 直通，绕过所有规则匹配 (策略 #1) */
  workerHint?: string | null;
}

interface RoutingRule {
  module?: string;
  scope_id?: string;
  axis_pattern?: string;
  model_pattern?: string;
  /** worker_id = string → 写入 mn_runs.target_worker；
   *  worker_id = null → 命中规则但不限定 worker，target_worker = NULL，任意 worker 可拿
   *  (用于纯规则计算如 g5 panorama-aggregate，谁先轮询到谁跑) */
  worker_id: string | null;
  priority?: number;
  enabled?: boolean;
  notes?: string;
}

export interface WorkerSpec {
  enabled?: boolean;
  tags?: string[];
  host?: string;
  ssh?: { user?: string; port?: number; key?: string };
  deploy?: {
    repo?: string;
    api_dir?: string;
    node_bin?: string;
    tsx_bin?: string;
    worker_log?: string;
    claude_cwd_base?: string;
  };
  claude_cli?: { bin?: string; creds?: string };
  runtime?: {
    concurrency?: number;
    /** 白名单：本 worker 只接受这些 module 的任务；空/缺省 = 接受所有 */
    accept_modules?: string[];
    /** 黑名单：本 worker 拒收这些 module 的任务（accept 优先级更高） */
    reject_modules?: string[];
    env_extra?: Record<string, string>;
  };
  health?: { url?: string | null; comment?: string };
  notes?: string;
}

interface RoutingConfig {
  rules: RoutingRule[];
  workers?: Record<string, WorkerSpec>;
}

let cachedWorkerId: string | null = null;
let cachedConfig: RoutingConfig | null = null;

/** 当前进程的 WORKER_ID — 一次解析后缓存 */
export function getWorkerId(): string {
  if (cachedWorkerId) return cachedWorkerId;
  const env = process.env.WORKER_ID;
  if (env && env.trim().length > 0) {
    cachedWorkerId = env.trim();
  } else {
    try {
      cachedWorkerId = os.hostname() || 'unknown-worker';
    } catch {
      cachedWorkerId = 'unknown-worker';
    }
  }
  return cachedWorkerId;
}

/** glob 风格匹配 ('claude-cli*' 匹配 'claude-cli-3.7') */
function globMatch(pattern: string, value: string): boolean {
  // 转义 regex 元字符，再把 * 替换为 .* 、? 替换为 .
  const re = new RegExp(
    '^' + pattern.replace(/[-/\\^$+.()|[\]{}]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$',
  );
  return re.test(value);
}

/** 把候选规则按优先级升序排序，第一条 enabled & 命中的胜出 */
function pickRule(rules: RoutingRule[], c: RoutingCriteria): RoutingRule | null {
  const sorted = [...rules].sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));
  for (const r of sorted) {
    if (r.enabled === false) continue;
    if (r.module && r.module !== c.module) continue;
    if (r.scope_id && r.scope_id !== (c.scopeId ?? '')) continue;
    if (r.axis_pattern && !globMatch(r.axis_pattern, c.axis ?? '')) continue;
    if (r.model_pattern) {
      if (!c.model) continue;
      if (!globMatch(r.model_pattern, c.model)) continue;
    }
    return r;
  }
  return null;
}

/** 找候选配置路径 — 支持 env 指定 + 几种常见 cwd */
function resolveConfigPath(): string | null {
  const envPath = process.env.RUN_ROUTING_CONFIG;
  if (envPath && existsSync(envPath)) return envPath;
  const cwd = process.cwd();
  const candidates = [
    join(cwd, 'config/run-routing.json'),
    join(cwd, 'api/config/run-routing.json'),
    join(cwd, '../config/run-routing.json'),
  ];
  return candidates.find((p) => existsSync(p)) ?? null;
}

function loadConfig(): RoutingConfig {
  if (cachedConfig) return cachedConfig;
  const path = resolveConfigPath();
  if (!path) {
    console.warn('[run-routing] no config file found; falling back to empty rules (target_worker = null for all)');
    cachedConfig = { rules: [] };
    return cachedConfig;
  }
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as Partial<RoutingConfig>;
    cachedConfig = {
      rules: Array.isArray(raw.rules) ? raw.rules : [],
      workers: raw.workers ?? {},
    };
    console.log(`[run-routing] loaded ${cachedConfig.rules.length} rules from ${path}`);
    return cachedConfig;
  } catch (e) {
    console.warn(`[run-routing] failed to parse ${path}:`, (e as Error).message);
    cachedConfig = { rules: [] };
    return cachedConfig;
  }
}

/** 测试用 / SIGHUP 热重载入口 */
export function reloadRoutingConfig(): void {
  cachedConfig = null;
  loadConfig();
}

/** 当前 worker 自己的 spec（accept/reject 过滤用） */
export function getOwnWorkerSpec(): WorkerSpec | null {
  const cfg = loadConfig();
  return cfg.workers?.[getWorkerId()] ?? null;
}

/** 给定 module，本 worker 是否接受 (accept_modules 白名单 + reject_modules 黑名单) */
export function workerAcceptsModule(module: string): boolean {
  const spec = getOwnWorkerSpec();
  if (!spec) return true; // 没配 spec → 默认接受
  const rt = spec.runtime;
  if (!rt) return true;
  if (rt.reject_modules && rt.reject_modules.includes(module)) return false;
  if (rt.accept_modules && rt.accept_modules.length > 0) {
    return rt.accept_modules.includes(module);
  }
  return true;
}

/**
 * 解析 (criteria) → target_worker_id
 * 找不到匹配规则 → 返回 null（任意 worker 都能消费）
 *
 * @param _db 保留参数兼容旧调用点签名 (现在不再走 DB)
 */
export async function resolveTargetWorker(
  _db: DatabaseAdapter,
  criteria: RoutingCriteria,
): Promise<string | null> {
  // 策略 #1：显式 workerHint 短路所有规则
  if (criteria.workerHint && criteria.workerHint.trim().length > 0) {
    return criteria.workerHint.trim();
  }
  const cfg = loadConfig();
  const rule = pickRule(cfg.rules, criteria);
  return rule?.worker_id ?? null;
}
