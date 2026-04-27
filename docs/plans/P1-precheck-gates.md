# P1 · 重算前置闸门

## Why

当前 AxisRegeneratePanel 入队的 LLM run 经常「假成功」：state=succeeded、duration=1s、created/llmCalls=0。原因：
1. `scope.kind=project` 但 `scope.id` 没传 → runEngine 拿不到 meetings
2. 用了短 subDim id（如 `mmodel/bias`）不在 registry → computer 直接 skip
3. 即使前两个修了，meeting 的 `assets.content` 为空（如 kickoff 0 字符）→ LLM 无可抽取

P0 解决了「不破坏人工数据」，但不阻止「跑出空集→白白等几分钟」。P1 在前端+后端加 **3 道前置校验**，让用户在「点了之后才发现没用」之前就被拒绝。

## What

后端 `POST /runs` 增加：
- 校验 `scope.kind != 'meeting'` 时必须有 `scope.id`
- 校验 scope 下所有 meetings 的 `assets.content` 总字数 ≥ MIN_TRANSCRIPT_CHARS（建议 2000）
- 校验 subDims 都在 `AXIS_SUBDIMS[axis]` 注册表里（已有此校验则强化错误信息）

前端 AxisRegeneratePanel：
- handleEnqueue 必传 `scope.id = meetingScope.effectiveScopeId`
- 失败时弹窗里红色报错条用人话告诉用户「先上传 transcript」「先选具体 project」

## Files

- 后端：`api/src/modules/meeting-notes/router.ts`（POST /runs handler L928-995 增加 precheck）
- 后端：`api/src/modules/meeting-notes/runs/runEngine.ts`（enqueue 前 transcript 校验，或放 router 里）
- 前端：`webapp/src/prototype/meeting/AxisRegeneratePanel.tsx`（handleEnqueue scope payload + 错误展示）

## 后端 precheck 详细

在 `/runs` POST handler 校验 scopeKind/axis 之后，新增：

```ts
// Gate 1: project/client/topic/library 都需要能列出 meetings
if (scope.kind !== 'meeting' && scope.kind !== 'library' && !scope.id) {
  return reply.status(400).send({
    error: 'Bad Request',
    code: 'SCOPE_ID_REQUIRED',
    message: `scope.id required for kind=${scope.kind}`,
  });
}

// Gate 2: 解析涉及的 meeting ids
const meetingIds = await collectMeetingsInScope(engine.deps.db, scope);
if (meetingIds.length === 0) {
  return reply.status(400).send({
    error: 'Bad Request',
    code: 'EMPTY_SCOPE',
    message: '该 scope 下没有任何会议绑定。请先到会议库绑定会议。',
  });
}

// Gate 3: transcript 总字数充足
const MIN_TRANSCRIPT_CHARS = 2000;
const sumLen = await engine.deps.db.query(
  `SELECT COALESCE(SUM(LENGTH(content)), 0)::int AS total FROM assets WHERE id = ANY($1::text[])`,
  [meetingIds],
);
const total = sumLen.rows[0]?.total ?? 0;
if (total < MIN_TRANSCRIPT_CHARS) {
  return reply.status(400).send({
    error: 'Bad Request',
    code: 'INSUFFICIENT_TRANSCRIPT',
    message: `scope 下 ${meetingIds.length} 场会议 transcript 共 ${total} 字符，不足 ${MIN_TRANSCRIPT_CHARS}。请先上传完整文本到 assets.content。`,
    detail: { totalChars: total, meetingCount: meetingIds.length, requiredMin: MIN_TRANSCRIPT_CHARS },
  });
}

// Gate 4: subDims 必须能映射到 computer
const validSubDims = AXIS_SUBDIMS[axis] ?? [];
const invalid = (body.subDims ?? []).filter((sd: string) => !validSubDims.includes(sd));
if (invalid.length > 0) {
  return reply.status(400).send({
    error: 'Bad Request',
    code: 'UNKNOWN_SUBDIMS',
    message: `subDims 含未注册项: ${invalid.join(', ')}. 合法值: ${validSubDims.join(', ')}.`,
  });
}
```

## 前端改动

```ts
async function handleEnqueue() {
  ...
  try {
    const r = await meetingNotesApi.enqueueRun({
      scope: {
        kind: scope.toLowerCase(),
        id: scope === 'library' ? undefined : meetingScope.effectiveScopeId,  // ← 新加
      },
      axis,
      subDims: selected,
      preset,
      triggeredBy: 'axis-regenerate-panel',
    });
    ...
  } catch (e) {
    // 解析后端 4xx 的 code 字段，区分提示文案
    const msg = e?.message ?? String(e);
    if (msg.includes('INSUFFICIENT_TRANSCRIPT')) setEnqueueError({ kind: 'transcript', text: msg });
    else if (msg.includes('SCOPE_ID_REQUIRED')) setEnqueueError({ kind: 'scope', text: msg });
    else setEnqueueError({ kind: 'unknown', text: msg });
  }
}
```

错误条 UI：在确认弹窗的「快照状态」下方，加一个 `enqueueError` 渲染区，红底，文案具体（包含字符数、缺失字段等）。

## 验证

```bash
# Gate 1: scope.kind=project 不传 scope.id → 400
curl -X POST .../runs -d '{"scope":{"kind":"project"},"axis":"knowledge","subDims":["mental_models"]}'
# expect: 400 SCOPE_ID_REQUIRED

# Gate 3: 我们当前的 sh-ai-2026 scope（kickoff content=0, april ~10k）
curl -X POST .../runs -d '{"scope":{"kind":"project","id":"f6cf3f51-..."},"axis":"knowledge","subDims":["mental_models"]}'
# expect: 200（因为 april ~10k 字符 > 2000 阈值）
# OR: 400 INSUFFICIENT_TRANSCRIPT 如果 kickoff 拉低均值，看实现选总和还是均值。建议总和。

# Gate 4: 短 id
curl -X POST .../runs -d '{"scope":{"kind":"project","id":"..."},"axis":"knowledge","subDims":["mmodel"]}'
# expect: 400 UNKNOWN_SUBDIMS
```

## 风险

- 阈值 2000 字符可能太严或太松，先取保守值，做参数化（env `MN_MIN_TRANSCRIPT_CHARS`）便于调
- 校验可绕过：用户直接调 API 时仍可绕过；前端只是 UX 兜底，后端是真正闸门
