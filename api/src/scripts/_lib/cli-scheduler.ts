// 通用 DAG 调度器：给一组任务（含依赖关系）按拓扑序、并发上限调度执行
//
// 设计目标 (CEO 模块 claude-cli 批量场景):
//   1. 同时最多跑 N 条 LLM 任务（claude -p 子进程是重资源，~200MB 一个）
//   2. DAG 依赖：compass-stars 必须先 OK，drift-alert / echo / narrative 才能开
//   3. 失败传播：依赖失败 → 下游标 skipped，不再跑（不浪费 LLM 调用）
//   4. 两类资源池：'llm' 走 LLM concurrency；'fast' 走轻量 concurrency（聚合器/SQL）
//
// 不依赖 p-limit / p-queue 第三方库 — 单文件简单实现，便于在脚本内复用。

export interface CliTask {
  /** 唯一 key，建议 "<scope>/<axis>[/<sub>]" 形式 */
  key: string;
  /** 必须在 succeeded 集合中的依赖 key 列表（在同 scope / 跨 scope 都行） */
  deps: string[];
  /** 资源类别：'llm' = 走 claude-cli 子进程；'fast' = 纯 SQL/聚合 */
  group: 'llm' | 'fast';
  /** 实际执行函数；返回 { ok, error } */
  run: () => Promise<{ ok: boolean; error?: string; result?: unknown }>;
}

export interface CliSchedulerOpts {
  llmConcurrency: number;
  fastConcurrency: number;
  /** 进度日志 */
  onTaskStart?: (task: CliTask) => void;
  onTaskEnd?: (task: CliTask, ok: boolean, ms: number, error?: string) => void;
  onSkip?: (task: CliTask, reason: string) => void;
}

export interface CliTaskResult {
  key: string;
  group: 'llm' | 'fast';
  ok: boolean;
  ms: number;
  error?: string;
  skipped?: boolean;
}

/**
 * 调度器主循环：拓扑可调度的就 launch，否则等任意 inflight 完成。
 * 失败的任务标 completed=true / succeeded=false，下游通过 deps 检测后被 skip。
 */
export async function runCliScheduler(
  tasks: CliTask[],
  opts: CliSchedulerOpts,
): Promise<CliTaskResult[]> {
  const byKey = new Map(tasks.map((t) => [t.key, t]));

  // 校验 deps 引用都能在 byKey 找到（容错：未知 dep 不阻塞，视为已完成）
  for (const t of tasks) {
    for (const d of t.deps) {
      if (!byKey.has(d)) {
        console.warn(`[scheduler] task=${t.key} 引用未知依赖 ${d}，将忽略此 dep`);
      }
    }
  }

  const completed = new Set<string>();
  const succeeded = new Set<string>();
  const skipped = new Set<string>();
  const inflight = new Map<string, Promise<void>>();
  const results: CliTaskResult[] = [];
  let activeLlm = 0;
  let activeFast = 0;

  const isResolved = (k: string) => completed.has(k) || skipped.has(k);

  while (results.length + skipped.size < tasks.length) {
    // 1. 检查并标 skipped: 依赖里有 failed/skipped 的下游
    for (const t of tasks) {
      if (isResolved(t.key) || inflight.has(t.key)) continue;
      const failedDep = t.deps.find(
        (d) => byKey.has(d) && (skipped.has(d) || (completed.has(d) && !succeeded.has(d))),
      );
      if (failedDep) {
        skipped.add(t.key);
        const reason = `dep failed: ${failedDep}`;
        results.push({ key: t.key, group: t.group, ok: false, ms: 0, error: reason, skipped: true });
        opts.onSkip?.(t, reason);
      }
    }

    // 2. 找出 ready 任务（deps 全部 succeeded 或 dep 不在 byKey）
    const ready = tasks.filter((t) => {
      if (isResolved(t.key) || inflight.has(t.key)) return false;
      return t.deps.every((d) => !byKey.has(d) || succeeded.has(d));
    });

    // 3. 按资源池容量启动
    let launched = 0;
    for (const task of ready) {
      if (task.group === 'llm' && activeLlm >= opts.llmConcurrency) continue;
      if (task.group === 'fast' && activeFast >= opts.fastConcurrency) continue;
      if (task.group === 'llm') activeLlm++;
      else activeFast++;
      const t0 = Date.now();
      opts.onTaskStart?.(task);
      const p = (async () => {
        let ok = false;
        let error: string | undefined;
        try {
          const r = await task.run();
          ok = r.ok;
          error = r.error;
        } catch (e) {
          ok = false;
          error = (e as Error).message;
        }
        const ms = Date.now() - t0;
        completed.add(task.key);
        if (ok) succeeded.add(task.key);
        results.push({ key: task.key, group: task.group, ok, ms, error });
        opts.onTaskEnd?.(task, ok, ms, error);
        if (task.group === 'llm') activeLlm--;
        else activeFast--;
        inflight.delete(task.key);
      })();
      inflight.set(task.key, p);
      launched++;
    }

    // 4. 没启动新任务 + 没 inflight → 死锁（应该是 deps 引用了不存在的 key
    //    或者全部 skip 了）→ 把剩余全部标 unschedulable
    if (launched === 0 && inflight.size === 0) {
      const remaining = tasks.filter((t) => !isResolved(t.key));
      for (const t of remaining) {
        skipped.add(t.key);
        results.push({
          key: t.key,
          group: t.group,
          ok: false,
          ms: 0,
          error: 'unschedulable (deps cycle or all deps failed)',
          skipped: true,
        });
        opts.onSkip?.(t, 'unschedulable');
      }
      break;
    }

    // 5. 等任意 inflight 完成（用 Promise.race；完成的会从 inflight Map 删除）
    if (inflight.size > 0) {
      await Promise.race(Array.from(inflight.values()));
    }
  }

  return results;
}

/** 简单进度打印 hook 工厂；在脚本顶层用 */
export function defaultProgressHooks(label = 'scheduler'): {
  onTaskStart: NonNullable<CliSchedulerOpts['onTaskStart']>;
  onTaskEnd: NonNullable<CliSchedulerOpts['onTaskEnd']>;
  onSkip: NonNullable<CliSchedulerOpts['onSkip']>;
} {
  return {
    onTaskStart: (t) => console.log(`[${label}] ▶  ${t.key} (${t.group})`),
    onTaskEnd: (t, ok, ms, err) =>
      console.log(`[${label}] ${ok ? '✓ ' : '✗ '} ${t.key} (${ms}ms)${err ? ` — ${err.slice(0, 200)}` : ''}`),
    onSkip: (t, reason) => console.log(`[${label}] ⊘  ${t.key} — ${reason}`),
  };
}
