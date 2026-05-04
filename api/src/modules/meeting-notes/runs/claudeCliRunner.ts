// runs/claudeCliRunner.ts — spawn `claude -p` 一次性生成会议纪要 + 多轴分析
//
// 由 runEngine.execute() 在 mode='claude-cli' 时调用。流程：
//   1. 拉转写正文（assets.content）
//   2. 用 promptTemplates/claudeCliFullPipeline.buildFullPrompt 拼整段 prompt
//   3. spawn('claude', ['-p', '--output-format', 'json', '--max-turns', '1'])
//   4. stdin 喂 prompt; 等进程结束; 解析 outer JSON 拿 result + usage
//   5. 解析 inner JSON; zod 校验
//   6. 返回 { meeting, participants, analysis, axes, cliPersonMap }
//      runEngine 接着调用 persistAnalysisToAsset + persistClaudeAxes 落库
//
// 错误处理：
//   - spawn 失败 / 超时 → throw with reason
//   - exit code != 0 → throw 包含 stderr
//   - JSON.parse 失败 → 把 raw stdout（截断 200KB）记到 mn_runs.metadata.cliRaw 再 throw
//   - zod 失败 → 同上 + reason='claude-cli-output-malformed'

import { spawn } from 'node:child_process';
import { writeFile, unlink, mkdir } from 'node:fs/promises';
import { tmpdir, hostname } from 'node:os';
import { join } from 'node:path';
import type { MeetingNotesDeps } from '../types.js';
import type { ExpertSnapshot, ExpertRoleAssignment } from './expertProfileLoader.js';
import { buildFullPrompt } from './promptTemplates/claudeCliFullPipeline.js';

// ============================================================
// 入参 / 出参
// ============================================================

export interface ClaudeCliRunnerCtx {
  expertRoles: ExpertRoleAssignment | null;
  expertSnapshots: Map<string, ExpertSnapshot>;
  preset: 'lite' | 'standard' | 'max';
  decoratorChain: string[];
  scopeConfig: null | { preset: string; strategies?: string[]; decorators?: string[] };
  meetingKind: string | null;
  meetingTitle: string;
  /** parseMeeting 返回的参会人（按 mn_people.id 已经入库） */
  participantsFromParse: Array<{ id: string; name: string }>;
  /** 续接已有 claude session（meeting / scope 各自维护）；首次跑为 null */
  resumeSessionId?: string | null;
  /** 'meeting' 用 claudeCliFullPipeline.buildFullPrompt；'scope' 用 claudeCliScope.buildScopePrompt */
  promptKind?: 'meeting' | 'scope';
  /** scope-level run 用：上层注入的预拼好的 prompt（this runner 不参与构造） */
  prebuiltPrompt?: string;
  /** scope 类型 ('meeting' | 'project' | 'client' | 'topic' | 'library')；
   *  跟 ctx.promptKind 不同语义 —— scopeKind 是 run 的 scope 维度，promptKind 是 prompt 选哪套模板。
   *  用来配合 MN_CLAUDE_CWD_BASE env 决定 spawn 时 cwd。 */
  scopeKind?: string | null;
  /** scope id (UUID)，meeting 类型下 = meetingId；project/client/topic 下 = scope row uuid。
   *  跟 scopeKind 一起决定 cwd 路径。 */
  scopeId?: string | null;
}

export interface ClaudeCliRunnerHooks {
  writeStep: (
    key: 'spawn' | 'streaming' | 'parsing' | 'persisting',
    ratio: number,
    msg?: string,
  ) => Promise<void>;
  bumpUsage: (input: number, output: number) => void;
  /** 把异常情况下的 raw stdout 记到 mn_runs.metadata.cliRaw（截断） */
  recordCliRaw: (raw: string) => Promise<void>;
}

export interface ClaudeCliRunnerResult {
  /** Claude 输出的 meeting 元数据原样透传 */
  meeting: Record<string, any>;
  /** Claude 输出的 participants 数组（含 'p1'/'p2' localId + name + role + tone + speakingPct） */
  participants: Array<{
    id: string;
    name: string;
    role?: string;
    initials?: string;
    tone?: 'neutral' | 'warm' | 'cool';
    speakingPct?: number;
  }>;
  /** Claude 输出的 analysis 块（结构与 composeAnalysis.AnalysisObject 对齐） */
  analysis: Record<string, any>;
  /** Claude 输出的 axes 块（people / knowledge / meta / projects + tension） */
  axes: Record<string, any>;
  /** localId 'p1' → mn_people.id (UUID) 反查表，供 persistClaudeAxes 把 axes 里的 who 转成真实 person_id */
  cliPersonMap: Record<string, string>;
  /** Claude session id（从 outerJson.session_id 解析） */
  sessionId: string | null;
  /** 输入 token（用来检测 scope session 累积是否接近 200K context） */
  inputTokens: number;
  /** 是否命中 prompt cache（cache_read_input_tokens > 0 的话说明 --resume 起作用了） */
  cacheReadTokens: number;
  /** Claude 输出的 facts SPO 数组（直接透传，由 persistClaudeFacts 落 content_facts）
   *  Phase H: 每条多了 taxonomy_code (E07.LLM 等) */
  facts: Array<{
    subject?: string;
    predicate?: string;
    object?: string;
    confidence?: number;
    taxonomy_code?: string;
    context?: { quote?: string; [k: string]: unknown };
    [k: string]: unknown;
  }>;
  /** Claude 输出的 wikiMarkdown 块（sourceEntry + entityUpdates）
   *  Phase H: entityUpdates 改契约为 type/subtype/canonicalName/initialContent/blockContent */
  wikiMarkdown: {
    sourceEntry?: string;
    entityUpdates?: Array<{
      // Phase H 新形态
      type?: 'entity' | 'concept';
      subtype?: 'person' | 'org' | 'product' | 'project' | 'event'
              | 'mental-model' | 'judgment' | 'bias' | 'counterfactual';
      canonicalName?: string;
      aliases?: string[];
      initialContent?: string;
      blockContent?: string;
      // 旧契约（兼容老 prompt 输出，过渡期保留）
      entityName?: string;
      appendMarkdown?: string;
    }>;
  };
  /** scope-level run 才用：scopeUpdates 块 */
  scopeUpdates?: Record<string, any>;
}

// ============================================================
// 工具
// ============================================================

const DEFAULT_TIMEOUT_MS = Number(process.env.CLAUDE_CLI_TIMEOUT_MS ?? 600_000);
const CLAUDE_BIN = process.env.CLAUDE_CLI_BIN ?? 'claude';
// 默认 opus —— 16K context + 17 axes + facts + wikiMarkdown 单次输出, 需要 opus 级深度
// 'opus' / 'sonnet' alias 或完整 model id (claude-opus-4-7 等) 都行
// 设为空字符串可以走 CLI 自带的 default
const CLAUDE_MODEL = process.env.CLAUDE_CLI_MODEL ?? 'opus';

async function loadTranscript(deps: MeetingNotesDeps, assetId: string): Promise<string> {
  const r = await deps.db.query(
    `SELECT content FROM assets WHERE id = $1 LIMIT 1`,
    [assetId],
  );
  const content = (r.rows[0] as { content?: string | null } | undefined)?.content ?? '';
  return typeof content === 'string' ? content : '';
}

function drainStream(stream: NodeJS.ReadableStream, label = 'stream', runId = ''): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let bytesSeen = 0;
    let lastDataAt = Date.now();
    stream.on('data', (c) => {
      const buf = Buffer.isBuffer(c) ? c : Buffer.from(c);
      chunks.push(buf);
      bytesSeen += buf.length;
      lastDataAt = Date.now();
      if (bytesSeen <= 256 || bytesSeen === buf.length) {
        console.log(`[claudeCliRunner ${runId.slice(0, 8)}] ${label}: first/early bytes ${bytesSeen}B`);
      }
    });
    stream.on('end', () => {
      const total = Buffer.concat(chunks).toString('utf8');
      console.log(`[claudeCliRunner ${runId.slice(0, 8)}] ${label}: end · total ${bytesSeen}B (lastData ${Date.now() - lastDataAt}ms ago)`);
      resolve(total);
    });
    stream.on('error', (err) => {
      console.warn(`[claudeCliRunner ${runId.slice(0, 8)}] ${label}: error · ${(err as Error).message}`);
      reject(err);
    });
    stream.on('close', () => {
      console.log(`[claudeCliRunner ${runId.slice(0, 8)}] ${label}: close (bytes=${bytesSeen})`);
    });
  });
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n) + `\n…[truncated, total ${s.length}]`;
}

/**
 * 把 parseMeeting 出来的 participants（含真实 UUID）映射成 'p1'/'p2'/'p3' 序号 →
 * 同时返回正向 prompt 用的 [{localId, name}] 列表 + 反向 cliPersonMap (localId → UUID)
 */
function buildLocalIdMapping(
  parseParticipants: Array<{ id: string; name: string }>,
): { promptList: Array<{ localId: string; name: string }>; cliPersonMap: Record<string, string> } {
  const promptList: Array<{ localId: string; name: string }> = [];
  const cliPersonMap: Record<string, string> = {};
  parseParticipants.forEach((p, i) => {
    const localId = `p${i + 1}`;
    promptList.push({ localId, name: p.name });
    cliPersonMap[localId] = p.id;
  });
  return { promptList, cliPersonMap };
}

// ============================================================
// 输出形态校验（手写, 不引入 zod 避免新依赖；只校 critical 字段）
// ============================================================

function validateInner(parsed: any, kind: 'meeting' | 'scope'): { ok: true } | { ok: false; reason: string } {
  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, reason: 'inner JSON is not an object' };
  }
  if (kind === 'scope') {
    // scope mode 只需要 scopeUpdates 对象
    if (!parsed.scopeUpdates || typeof parsed.scopeUpdates !== 'object') {
      return { ok: false, reason: 'missing scopeUpdates object' };
    }
    return { ok: true };
  }
  // meeting mode 校验
  if (!parsed.analysis || typeof parsed.analysis !== 'object') {
    return { ok: false, reason: 'missing analysis object' };
  }
  if (!parsed.axes || typeof parsed.axes !== 'object') {
    return { ok: false, reason: 'missing axes object' };
  }
  if (!Array.isArray(parsed.participants)) {
    return { ok: false, reason: 'missing or non-array participants' };
  }
  const a = parsed.analysis;
  if (!a.summary || typeof a.summary !== 'object') {
    return { ok: false, reason: 'analysis.summary missing' };
  }
  if (!Array.isArray(a.summary?.actionItems)) {
    return { ok: false, reason: 'analysis.summary.actionItems must be array' };
  }
  for (const k of ['tension', 'newCognition', 'focusMap', 'consensus', 'crossView']) {
    if (!Array.isArray(a[k])) {
      return { ok: false, reason: `analysis.${k} must be array` };
    }
  }
  return { ok: true };
}

// ============================================================
// 主入口
// ============================================================

export async function runClaudeCliMode(
  deps: MeetingNotesDeps,
  payload: { runId: string; meetingId: string; assetId: string },
  ctx: ClaudeCliRunnerCtx,
  hooks: ClaudeCliRunnerHooks,
): Promise<ClaudeCliRunnerResult> {
  // ── 1. 准备 prompt + localId 映射 ─────────────────────────────
  // promptKind='scope' 时由上层提供 prebuiltPrompt，跳过 transcript 加载 + buildFullPrompt
  let prompt: string;
  let cliPersonMap: Record<string, string> = {};
  if (ctx.promptKind === 'scope') {
    if (!ctx.prebuiltPrompt) throw new Error('scope mode requires ctx.prebuiltPrompt');
    prompt = ctx.prebuiltPrompt;
  } else {
    const transcript = await loadTranscript(deps, payload.assetId);
    if (!transcript || transcript.trim().length < 50) {
      throw new Error('transcript too short or empty (assets.content)');
    }
    const mapping = buildLocalIdMapping(ctx.participantsFromParse);
    cliPersonMap = mapping.cliPersonMap;
    prompt = buildFullPrompt({
      meetingId: payload.meetingId,
      meetingTitle: ctx.meetingTitle,
      meetingKind: ctx.meetingKind,
      participants: mapping.promptList,
      transcript,
      expertRoles: ctx.expertRoles,
      expertSnapshots: ctx.expertSnapshots,
      preset: ctx.preset,
      decoratorChain: ctx.decoratorChain,
      scopeConfig: ctx.scopeConfig,
    });
  }

  // ── 2. 写 prompt 到 tmpfile，再用 shell `< file` 重定向喂 stdin ──
  // 这跟手动 `echo "..." | claude -p` 同链路（OS 内核 pipe），消除 Node stdin
  // 写入大 prompt 时的 backpressure / drain 不确定性。
  await hooks.writeStep('spawn', 0.1, ctx.promptKind === 'scope' ? '启动 claude · scope session' : '启动 claude 进程');
  const promptFile = join(tmpdir(), `mn-claude-prompt-${payload.runId}-${ctx.promptKind ?? 'meeting'}.txt`);
  await writeFile(promptFile, prompt, 'utf8');

  // shell escape：path 用单引号包住即可（runId 是 UUID，无 ' " 等特殊字符）
  const cliBinShell = CLAUDE_BIN.includes(' ') ? `"${CLAUDE_BIN}"` : CLAUDE_BIN;
  const modelFlag = CLAUDE_MODEL && CLAUDE_MODEL.trim() ? ` --model '${CLAUDE_MODEL.replace(/'/g, "'\\''")}'` : '';
  // session resume：sessionId 是 UUID，shell-safe
  const resumeFlag = ctx.resumeSessionId ? ` --resume '${ctx.resumeSessionId}'` : '';
  // --no-session-persistence: 不写 session 到 ~/.claude/projects/，避免下一次 -p 自动续接被截断的会话。
  // (注: --bare 会要求 ANTHROPIC_API_KEY 环境变量, 本机 OAuth 登录场景会 401, 故不用)
  // 仅在 fresh run 时加（resumeSessionId 模式下需要 session 持久化才能续接）。
  const isolationFlags = ctx.resumeSessionId ? '' : ' --no-session-persistence';
  const cmd = `${cliBinShell} -p${resumeFlag}${modelFlag}${isolationFlags} --output-format json --max-turns 1 < '${promptFile}'`;

  // ─ 决定 cwd ─
  // 默认（env 未配置）继承 worker 进程的 cwd（一般 = repo/api），保留旧行为。
  // 配 MN_CLAUDE_CWD_BASE 后，落到 <base>/<scopeKind>/<scopeId>，让每条 run 跑在自己的目录下，
  // 隔离 claude 的 .claude/ session、CLAUDE.md、相对路径产物（wiki .md 等）。
  // 使用场景：远程 worker 上跑大量并发 run，需要工作目录隔离，避免互相覆盖。
  let cwd: string | undefined;
  const cwdBase = process.env.MN_CLAUDE_CWD_BASE;
  if (cwdBase && ctx.scopeKind) {
    const safeKind = ctx.scopeKind.replace(/[^a-zA-Z0-9_-]/g, '_');
    const safeId = (ctx.scopeId ?? '_').replace(/[^a-zA-Z0-9_-]/g, '_');
    cwd = join(cwdBase, safeKind, safeId);
    try {
      await mkdir(cwd, { recursive: true });
    } catch (e) {
      console.warn(`[claudeCliRunner ${payload.runId.slice(0, 8)}] mkdir cwd ${cwd} failed: ${(e as Error).message}; falling back to inherited cwd`);
      cwd = undefined;
    }
  }

  // detached:true → spawn 时调 setpgid(0,0)，sh + claude 落到一个新进程组（pgid = sh.pid）。
  // 超时时 process.kill(-proc.pid, SIGKILL) 才能整组通杀。
  // 之前默认 detached:false 时 proc.kill('SIGKILL') 只杀到 sh，孙子 claude 变孤儿，
  // 仍持有 stdout/stderr 写端 → drainStream 永远收不到 EOF → Promise.all 永挂 →
  // runEngine 永远不进 catch → state 永远停在 'running'。
  const proc = spawn('sh', ['-c', cmd], {
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
    cwd,
    env: {
      ...process.env,
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    },
  });

  // 持久化 cliPid/cliPgid/apiPid 到 mn_runs.metadata，让后续 API 进程在 recoverOrphanCliRuns
  // 时能找到这条 run 对应的 sh 进程组并 SIGKILL（哪怕本 API 已经被 SIGKILL 了，下个 API 起来 60s 内
  // 就能精确收尾，不用等 15min heartbeat 兜底）
  if (proc.pid) {
    try {
      await deps.db.query(
        `UPDATE mn_runs SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
           'cliPid', $2::int,
           'cliPgid', $2::int,
           'apiPid', $3::int,
           'apiHost', $4::text,
           'cliStartedAt', NOW()::text
         ) WHERE id = $1`,
        [payload.runId, proc.pid, process.pid, hostname()],
      );
    } catch (e) {
      console.warn(`[claudeCliRunner ${payload.runId.slice(0, 8)}] persist cliPid failed: ${(e as Error).message}`);
    }
  }

  // 心跳：首次 stdout 字节翻到 streaming
  let firstByteSeen = false;
  proc.stdout.on('data', () => {
    if (!firstByteSeen) {
      firstByteSeen = true;
      void hooks.writeStep('streaming', 0.5, '等待 claude 生成');
    }
  });

  // 杀整组（detached + 负 pid）；同时 destroy stdio，防御进程组死后管道仍被持有的极端情况
  let killed = false;
  let killReason = '';
  const killGroup = (reason: string): void => {
    if (killed) return;
    killed = true;
    killReason = reason;
    console.warn(`[claudeCliRunner ${payload.runId.slice(0, 8)}] killing process group: ${reason}`);
    if (proc.pid) {
      try {
        process.kill(-proc.pid, 'SIGKILL');
      } catch (e) {
        console.warn(`[claudeCliRunner ${payload.runId.slice(0, 8)}] kill -group failed (${(e as Error).message}); falling back to proc.kill`);
        try { proc.kill('SIGKILL'); } catch {}
      }
    }
    try { (proc.stdout as any)?.destroy?.(new Error(`killed: ${reason}`)); } catch {}
    try { (proc.stderr as any)?.destroy?.(new Error(`killed: ${reason}`)); } catch {}
  };

  // 软超时：到时间杀整组
  const softTimer = setTimeout(() => killGroup(`soft timeout ${DEFAULT_TIMEOUT_MS}ms`), DEFAULT_TIMEOUT_MS);
  // 硬截止：软超时后再给 30s 缓冲让进程退；还没退就再杀一次 + 让 await 链路彻底放手
  const HARD_GRACE_MS = 30_000;
  const hardTimer = setTimeout(() => killGroup(`hard deadline ${DEFAULT_TIMEOUT_MS + HARD_GRACE_MS}ms`), DEFAULT_TIMEOUT_MS + HARD_GRACE_MS);

  // best-effort：API 进程正常 exit 时顺手收掉孤儿（tsx watch 用 SIGKILL 重启 API 这条路救不了，
  // 那种情况只能靠 startup 时的 zombie 兜底，不在本 runner 范围内）
  const onExit = (): void => {
    if (proc.pid && !killed && proc.exitCode === null) {
      try { process.kill(-proc.pid, 'SIGKILL'); } catch {}
    }
  };
  process.on('exit', onExit);

  // 收尾日志（Phase H+ debug · 加大量日志看卡哪）
  console.log(`[claudeCliRunner ${payload.runId.slice(0, 8)}] spawn pid=${proc.pid} pgid=${proc.pid} cwd=${cwd ?? '(inherited)'} cmd=${cmd.slice(0, 120)}...`);
  proc.on('exit', (code, sig) => {
    console.log(`[claudeCliRunner ${payload.runId.slice(0, 8)}] proc exit code=${code} sig=${sig}`);
  });
  proc.on('close', (code, sig) => {
    console.log(`[claudeCliRunner ${payload.runId.slice(0, 8)}] proc close code=${code} sig=${sig}`);
  });
  proc.on('error', (err) => {
    console.warn(`[claudeCliRunner ${payload.runId.slice(0, 8)}] proc error ${(err as Error).message}`);
  });

  const t0 = Date.now();
  // 终极兜底：硬截止 + 5s 后还没 resolve 就强 reject —— 防止 stdio 在内核层泄漏到无关进程时
  // 'close' 事件永不到。能走到这一步说明系统已经处于不可恢复状态，throw 出去让 runEngine 写 failed。
  const ABANDON_MS = DEFAULT_TIMEOUT_MS + HARD_GRACE_MS + 5_000;
  let stdout = '', stderr = '', exitCode = -1;
  try {
    [stdout, stderr, exitCode] = await Promise.race([
      Promise.all([
        // 被 destroy 时 drainStream 会 reject —— 我们当成空串吞掉，外层 killed 标志统一处理失败
        drainStream(proc.stdout, 'stdout', payload.runId).catch(() => ''),
        drainStream(proc.stderr, 'stderr', payload.runId).catch(() => ''),
        new Promise<number>((res) => proc.on('close', (code) => res(code ?? -1))),
      ]) as Promise<[string, string, number]>,
      new Promise<[string, string, number]>((_, rej) => {
        const t = setTimeout(() => rej(new Error(
          `claude CLI abandoned after ${ABANDON_MS}ms — process group killed but pipes still hung`,
        )), ABANDON_MS);
        t.unref();
      }),
    ]);
  } finally {
    clearTimeout(softTimer);
    clearTimeout(hardTimer);
    process.removeListener('exit', onExit);
  }
  console.log(`[claudeCliRunner ${payload.runId.slice(0, 8)}] all done (${Date.now() - t0}ms) · exitCode=${exitCode} · stdout=${stdout.length}B stderr=${stderr.length}B${killed ? ` · KILLED(${killReason})` : ''}`);

  // 清理 tmpfile（无论成败）
  await unlink(promptFile).catch(() => {/* swallow */});

  if (killed) {
    await hooks.recordCliRaw(truncate(stdout || stderr, 200_000));
    throw new Error(
      `claude CLI killed: ${killReason}${stderr ? ` · stderr: ${truncate(stderr, 500)}` : ''}`,
    );
  }

  if (exitCode !== 0) {
    await hooks.recordCliRaw(truncate(stdout || stderr, 200_000));
    throw new Error(
      `claude CLI exit ${exitCode}${stderr ? `: ${truncate(stderr, 500)}` : ''}`,
    );
  }

  // ── 4. parse outer JSON (claude wrapper) ─────────────────────
  await hooks.writeStep('parsing', 0.85, '解析 JSON');
  let outerJson: any;
  try {
    outerJson = JSON.parse(stdout);
  } catch (e) {
    await hooks.recordCliRaw(truncate(stdout, 200_000));
    throw new Error(`claude CLI outer JSON.parse failed: ${(e as Error).message}`);
  }

  // 兼容两种形态：
  //   - { type: 'result', subtype: 'success', result: '<assistant text>', usage: {...} }
  //   - { result: '<text>', usage: {...} } (老版)
  const resultText: string =
    typeof outerJson.result === 'string'
      ? outerJson.result
      : typeof outerJson.message?.content === 'string'
        ? outerJson.message.content
        : '';
  const usage = outerJson.usage ?? outerJson.message?.usage ?? {};
  const inputTokens = Number(usage.input_tokens ?? usage.inputTokens ?? 0) || 0;
  const outputTokens = Number(usage.output_tokens ?? usage.outputTokens ?? 0) || 0;
  const cacheReadTokens = Number(usage.cache_read_input_tokens ?? usage.cacheReadInputTokens ?? 0) || 0;
  hooks.bumpUsage(inputTokens, outputTokens);
  // outerJson.session_id 是 claude CLI 写到结果里的 session UUID（即使没有 --resume 也会返回新建的）
  const sessionId: string | null = typeof outerJson.session_id === 'string' && outerJson.session_id.length > 0
    ? outerJson.session_id
    : null;

  if (!resultText) {
    await hooks.recordCliRaw(truncate(stdout, 200_000));
    throw new Error('claude CLI: outer JSON has no .result text');
  }

  // ── 5. parse inner JSON (assistant 实际产出) ─────────────────
  // 防御 markdown 代码栅栏 / leading prose（即使提示了 "no markdown" 偶有偷跑）
  let innerText = resultText.trim();
  if (innerText.startsWith('```')) {
    // 剥 ```json … ``` 围栏
    const m = innerText.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (m) innerText = m[1].trim();
  }
  // 容错：找 JSON object 起止位置
  const firstBrace = innerText.indexOf('{');
  const lastBrace = innerText.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    innerText = innerText.slice(firstBrace, lastBrace + 1);
  }

  let inner: any;
  try {
    inner = JSON.parse(innerText);
  } catch (e) {
    await hooks.recordCliRaw(truncate(resultText, 200_000));
    throw new Error(`claude CLI inner JSON.parse failed: ${(e as Error).message}`);
  }

  // ── 6. 校验输出形态 ───────────────────────────────────────────
  const promptKind = ctx.promptKind ?? 'meeting';
  const v = validateInner(inner, promptKind);
  if (!v.ok) {
    await hooks.recordCliRaw(truncate(JSON.stringify(inner).slice(0, 200_000), 200_000));
    throw new Error(`claude CLI output malformed: ${v.reason}`);
  }
  // 成功路径也记录 cliRaw (debug schema 字段缺失 / 数量下限未达成等问题)
  // truncate 200KB; 单次会议典型 30-60KB, 留 buffer
  await hooks.recordCliRaw(truncate(JSON.stringify(inner), 200_000));

  // scope mode：跳过 meeting 字段构造
  if (promptKind === 'scope') {
    return {
      meeting: {},
      participants: [],
      analysis: {},
      axes: {},
      cliPersonMap: {},
      sessionId,
      inputTokens,
      cacheReadTokens,
      facts: [],
      wikiMarkdown: {},
      scopeUpdates: inner.scopeUpdates ?? {},
    };
  }

  // meeting mode：完整结果
  return {
    meeting: inner.meeting ?? { id: payload.meetingId, title: ctx.meetingTitle },
    participants: inner.participants,
    analysis: inner.analysis,
    axes: inner.axes,
    cliPersonMap,
    sessionId,
    inputTokens,
    cacheReadTokens,
    facts: Array.isArray(inner.facts) ? inner.facts : [],
    wikiMarkdown: inner.wikiMarkdown && typeof inner.wikiMarkdown === 'object' ? inner.wikiMarkdown : {},
  };
}
