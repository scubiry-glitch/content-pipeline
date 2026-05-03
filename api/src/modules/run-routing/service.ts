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
  /** 质量v2 · 双胞胎防御：额外的 host 标识（hostname / 内网 IP / 别名等）。
   *  worker 启动自检会用 host + host_aliases 的并集去匹配 os.hostname() / 接口 IP。
   *  当 host 是公网 IP 时（NAT 场景），必须把内网 IP / hostname 也列出来才能匹配本机。 */
  host_aliases?: string[];
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
let cachedRegistryAudit: { ok: boolean; warnings: string[] } | null = null;

/** 注册表一致性审计：同一 host 标识不能出现在多个 worker 的 host/host_aliases 中。
 *  在 loadConfig 后执行一次，结果缓存。检测到冲突会打 console.warn 并把冲突项忽略。 */
function auditWorkersRegistry(workers: Record<string, WorkerSpec>): { ok: boolean; warnings: string[] } {
  const warnings: string[] = [];
  const aliasOwner = new Map<string, string>(); // alias → first worker id seen
  for (const [id, spec] of Object.entries(workers)) {
    if (spec.enabled === false) continue;
    const candidates = [spec.host, ...(spec.host_aliases ?? [])].filter((x): x is string => !!x && x !== 'localhost');
    for (const c of candidates) {
      const prev = aliasOwner.get(c);
      if (prev && prev !== id) {
        warnings.push(`alias "${c}" is registered to BOTH workers.${prev} and workers.${id}; auto-detect cannot disambiguate this host. Fix run-routing.json to keep aliases unique.`);
      } else {
        aliasOwner.set(c, id);
      }
    }
  }
  if (warnings.length > 0) {
    for (const w of warnings) console.warn('[run-routing] registry audit · ' + w);
  }
  return { ok: warnings.length === 0, warnings };
}

/** 按本机 hostname / IP 在 workers 注册表里反向查找匹配的 WORKER_ID。
 *  - 0 命中 → null（运行时走 fallback）
 *  - 1 命中 → 返回该 id（推荐情形：注册表唯一映射）
 *  - 2+ 命中 → null + 警告（注册表配错，多 alias 重叠） */
function autoDetectWorkerId(): string | null {
  const cfg = loadConfig();
  if (!cfg.workers) return null;
  if (!cachedRegistryAudit) cachedRegistryAudit = auditWorkersRegistry(cfg.workers);
  const localIds = getLocalHostIdentifiers();
  const matches: string[] = [];
  for (const [id, spec] of Object.entries(cfg.workers)) {
    if (spec.enabled === false) continue;
    const candidates = [spec.host, ...(spec.host_aliases ?? [])].filter((x): x is string => !!x && x !== 'localhost');
    if (candidates.some((c) => localIds.has(c))) matches.push(id);
  }
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) {
    console.warn(`[run-routing] auto-detect ambiguous: this host matches workers ${matches.join(', ')}. Set WORKER_ID env explicitly OR fix overlapping host_aliases.`);
  }
  return null;
}

/** 收集本机所有可用作 host 标识的字符串（hostname + 所有非 loopback IPv4）。 */
function getLocalHostIdentifiers(): Set<string> {
  const ids = new Set<string>();
  try {
    const hn = os.hostname();
    if (hn) {
      ids.add(hn);
      // 加 'localhost' 兼容 workers.local-mac 这类把 host 写成 'localhost' 的注册
      ids.add('localhost');
    }
    const nets = os.networkInterfaces();
    for (const arr of Object.values(nets ?? {})) {
      for (const ni of arr ?? []) {
        if (!ni.internal && (ni.family === 'IPv4' || (ni as any).family === 4)) {
          ids.add(ni.address);
        }
      }
    }
  } catch { /* ignore */ }
  return ids;
}

/**
 * 当前进程的 WORKER_ID — 一次解析后缓存。
 *
 * 解析策略（按优先级）：
 *   1) env WORKER_ID 已设 → 用 host_aliases 校验"声明的 ID"在注册表里是否
 *      属于本机（host_aliases 命中本机 hostname / 内网 IPv4）。命中保留 env；
 *      不命中 → fallback 到 host-derived id，避免冒名抢任务。
 *   2) env 未设 → 自动从 workers 注册表反查（autoDetectWorkerId）：本机的
 *      hostname / 内网 IP 命中哪个 worker 的 host/host_aliases，就用那个 id。
 *      唯一命中 → 用之；0 命中或多命中 → fallback。
 *   3) 都未命中 → host-derived id (`host-<hostname>`)，仅消费 target_worker
 *      = NULL 或 = 本机自己生成的 host-X 的 run。
 *
 * 注册表一致性：启动时 auditWorkersRegistry 会检查 workers.{} 里有没有
 * alias 重复（即同一 host 标识被多个 worker 声明）。重复 → 警告，多命中
 * 时 autoDetect 不敢猜，强制 env 显式覆盖。
 *
 * 实测背景：VM-0-11-opencloudos (IP 221.195.29.81) 与 VM-4-6-opencloudos
 * (IP 43.156.49.59) 都设了 WORKER_ID=prod-TencentOpenClaw 同时 poll DB，
 * 抢任务跑老代码。注册表 prod-TencentOpenClaw.host_aliases 只列 VM-4-6 的
 * 标识，VM-0-11 启动时校验失败 → fallback 到 host-vm-0-11-opencloudos。
 */
export function getWorkerId(): string {
  if (cachedWorkerId) return cachedWorkerId;
  const env = (process.env.WORKER_ID ?? '').trim();
  const fallback = (() => {
    try { return `host-${(os.hostname() || 'unknown').toLowerCase()}`; }
    catch { return 'host-unknown'; }
  })();

  if (env) {
    // 模式 1：env 显式声明 → 校验声明的 ID 是否属于本机
    const cfg = loadConfig();
    if (cfg.workers && !cachedRegistryAudit) {
      cachedRegistryAudit = auditWorkersRegistry(cfg.workers);
    }
    const spec = cfg.workers?.[env];
    const declared = spec?.host;
    const aliases = spec?.host_aliases ?? [];
    if (declared && declared !== 'localhost') {
      const localIds = getLocalHostIdentifiers();
      const expected = new Set<string>([declared, ...aliases]);
      const matched = [...expected].some((e) => localIds.has(e));
      if (!matched) {
        console.warn(
          `[run-routing] WORKER_ID env="${env}" but workers.${env}.host="${declared}"`
          + (aliases.length > 0 ? ` (aliases: ${aliases.join(',')})` : '')
          + ` does not match this machine (${[...localIds].slice(0, 5).join(',')}). `
          + `Falling back to "${fallback}" to prevent twin-worker race. `
          + `Fix: set a unique WORKER_ID on this host, or add this host to `
          + `workers.${env}.host_aliases in run-routing.json `
          + `(e.g. ["${[...localIds][0] ?? 'this-hostname'}"]).`,
        );
        cachedWorkerId = fallback;
        return cachedWorkerId;
      }
    }
    cachedWorkerId = env;
    console.log(`[run-routing] WORKER_ID resolved: "${env}" (env, registry-validated)`);
  } else {
    // 模式 2：env 未设 → 从注册表反查
    const detected = autoDetectWorkerId();
    if (detected) {
      cachedWorkerId = detected;
      console.log(`[run-routing] WORKER_ID resolved: "${detected}" (auto-detected from workers registry)`);
    } else {
      cachedWorkerId = fallback;
      console.log(`[run-routing] WORKER_ID resolved: "${fallback}" (fallback, no env + no registry match)`);
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
  const raw = rule?.worker_id ?? null;
  // 质量v2 · Fix A：sentinel "${WORKER_ID}" 解析为本进程的 env WORKER_ID。
  // 把入队 run 钉到具体 worker，避免 target_worker IS NULL 让任意 worker 抢
  // （pm2 restart 期间双进程过渡期 race 来源之一）。
  if (raw === '${WORKER_ID}') return getWorkerId();
  return raw;
}
