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
import { writeFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
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
  /** Claude 输出的 facts SPO 数组（直接透传，由 persistClaudeFacts 落 content_facts） */
  facts: any[];
  /** Claude 输出的 wikiMarkdown 块（sourceEntry + entityUpdates） */
  wikiMarkdown: { sourceEntry?: string; entityUpdates?: Array<{ entityName: string; appendMarkdown: string }> };
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

function drainStream(stream: NodeJS.ReadableStream): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    stream.on('error', reject);
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
  const cmd = `${cliBinShell} -p${resumeFlag}${modelFlag} --output-format json --max-turns 1 < '${promptFile}'`;
  const proc = spawn('sh', ['-c', cmd], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    },
  });

  // 心跳：首次 stdout 字节翻到 streaming
  let firstByteSeen = false;
  proc.stdout.on('data', () => {
    if (!firstByteSeen) {
      firstByteSeen = true;
      void hooks.writeStep('streaming', 0.5, '等待 claude 生成');
    }
  });

  // 超时 SIGKILL（同时让 sh 子壳和 claude 一起死，detached=false 默认 SIGKILL 会传到子进程组）
  const timer = setTimeout(() => {
    try {
      proc.kill('SIGKILL');
    } catch {}
  }, DEFAULT_TIMEOUT_MS);

  // 收尾
  const [stdout, stderr, exitCode] = await Promise.all([
    drainStream(proc.stdout),
    drainStream(proc.stderr),
    new Promise<number>((res) => proc.on('close', (code) => res(code ?? -1))),
  ]);
  clearTimeout(timer);

  // 清理 tmpfile（无论成败）
  await unlink(promptFile).catch(() => {/* swallow */});

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
