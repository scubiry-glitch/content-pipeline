# Phase 7 · 反常沉默 mock → 真实派生

## 现状勘察

`webapp/src/prototype/meeting/AxisPeople.tsx` 的 `PSilence` 组件：

- 主矩阵（topics × persons → state 单元格）：✅ 已 API 化（`getMeetingSilence(meetingId)`）
- 底部 `<CalloutCard title="今日反常沉默 · 3 处">`（663-672 行）：❌ 完全硬编码 `<SilenceFinding p={P('p1')} />` × 3，note 也是写死的"过去 4 场合规话题平均发言 5+ 次..."等 mock 文案；标题"3 处"也是常量，跟矩阵真实数据脱钩
- 旁边 `<CalloutCard title="批判：沉默也会误报">`：产品文案 commentary（**留 Phase 9 i18n**）

后端 `/meetings/:id/silence` 已经返回完整 items：`{ id, person_id, topic_id, state, prior_topics_spoken, anomaly_score, person_name }`。本 phase 只需把 callout 改成派生。

## 改动

### `AxisPeople.tsx · PSilence`

1. useEffect 里把后端 `items` 整体存到新 state `silenceItems`（除了原本的 matrix 派生）
2. 派生 `abnormalFindings`（不在 mock 时）：
   ```ts
   const abnormalFindings = isMock ? [] : silenceItems
     .filter((it) => it.state === 'abnormal_silence')
     .sort((a, b) => Number(b.anomaly_score ?? 0) - Number(a.anomaly_score ?? 0))
     .slice(0, 3);
   ```
3. CalloutCard 渲染：
   - `isMock` → 保留原 hardcoded 3 个 SilenceFinding（demo 数据可读）
   - `abnormalFindings.length === 0` → "本场无反常沉默信号" 单行提示
   - 否则：title 改成 `今日反常沉默 · ${abnormalFindings.length} 处`；body 渲染 N 个 `SilenceFinding`，note 由后端字段合成：`过去发言记录 ${prior_topics_spoken} 次，本场归零；anomaly_score=${score}` 模板（用真实数字代替 hardcoded narrative）

### `SilenceFinding` 组件复用

签名维持 `{ p, topic, note }`：
- `p` 改成接受 `{ name: string; initials?: string }` 的轻量 shape，避免必须用 `_fixtures.PARTICIPANTS`
- `topic` 直接用后端 `topic_id`
- `note` 用上面合成的 string

> P() 的兜底：当 `personNames[pid]` 缺失时（meta 没传），从 `_fixtures.PARTICIPANTS` 找；都找不到则用 pid 前 8 字符 fallback。

### 不动

- 矩阵渲染（已就绪）
- "批判：沉默也会误报" callout（Phase 9 i18n）
- `_fixtures.PARTICIPANTS`（仍作 forceMock fallback）
- 后端

## AxisRegeneratePanel 同步

- `SUB_META.silence_signal`：保持 ✓
- `TAB_TO_SUBS.people.silence`：保持 `subs: ['silence_signal']` ✓
- 用户从 silence tab 点 ↻ → 触发 silence_signal 子维度 → 写 mn_silence_signals → 矩阵 + 反常 callout 同时刷新

无需改 panel。

## 回归

1. `cd webapp && npx tsc --noEmit` exit 0
2. dev：选有 abnormal_silence 行的 meeting → callout title "今日反常沉默 · N 处"，body 显示真实 person × topic
3. 选无 abnormal 的 meeting → callout 显示空态
4. forceMock → 保留原 mock 文案

## 提交

```
git add webapp/src/prototype/meeting/AxisPeople.tsx \
        docs/质量v2/phase-7-mock-silence.md
git commit -m "feat(web/mn): 反常沉默 callout 改派生自 mn_silence_signals（Phase 7）"
```

## 质量提升效果

- 移除 hardcoded "陈汀 / Wei Tan / 林雾" + "过去 4 场..." narrative
- 反常沉默卡片从 demo 演示数据 → 当前会议真实异常信号
- 卡片标题"N 处"反映真实计数，不再永远写死 3
- 与上方矩阵数据源同步（同一 silenceItems）
