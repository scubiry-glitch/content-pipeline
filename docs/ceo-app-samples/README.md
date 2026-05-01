# CEO 应用样例数据

每个页面对应一个 JSON 样例，描述：

1. **endpoints** — 页面调用的 `/api/v1/ceo/*` 端点的真实响应结构（含示例值）
2. **tables** — 该页面读写的 `ceo_*` / `mn_*` 表的代表性行（与 seed 数据对齐）

样例值参考 `07-archive/会议纪要 (20260501)/` 下的原型设计稿，并与 `api/src/modules/ceo/seeds/demo.sql` 保持语义一致。

---

## 文件清单

| 页面 | 文件 | 主要 endpoint |
|---|---|---|
| 方向 · Compass | [compass.json](compass.json) | `/api/v1/ceo/compass/*` (含 `/atlas` 子房间) |
| 董事会 · Boardroom | [boardroom.json](boardroom.json) | `/api/v1/ceo/boardroom/*` |
| 协调 · Tower | [tower.json](tower.json) | `/api/v1/ceo/tower/*` |
| 团队 · War Room | [war-room.json](war-room.json) | `/api/v1/ceo/war-room/*` |
| 各方 · Situation | [situation.json](situation.json) | `/api/v1/ceo/situation/*` |
| 个人 · Balcony | [balcony.json](balcony.json) | `/api/v1/ceo/balcony/*` |
| Panorama 全景 | [panorama.json](panorama.json) | `/api/v1/ceo/panorama` |
| 外脑图书馆 · Brain | [brain.json](brain.json) | `/api/v1/ceo/brain/*` |
| **全部合并** | [all.json](all.json) | 上述 8 项汇总 |

---

## 用法

### 1. 看页面消费什么

打开任一文件，找 `endpoints` 节查响应 shape。前端 fetch 后的 `dash` 变量长这个样子。

### 2. 看页面读写什么表

`tables` 节列出代表性行。开发本地 seed 后跑 `psql -c "SELECT * FROM ceo_directors LIMIT 5"` 应能看到匹配行。

### 3. 跨页面对照

用 `all.json` 一次拿到全套 — 适合做 fixture 注入或前端回放调试。

### 4. Seed 数据库以匹配样例

```bash
cd api && npm run ceo:seed-demo
```

幂等，可重复跑。Seed 后所有 `/api/v1/ceo/*/dashboard` 应返回与样例 JSON 高度相似的结构（具体 UUID、时间戳由数据库生成）。

---

## 数据语义对照（核心字段）

| 概念 | ceo_* 表 | mn_* 复用 | 说明 |
|---|---|---|---|
| 战略线 | `ceo_strategic_lines` | — | main / branch / drift |
| 回响 | `ceo_strategic_echos` | — | confirm / refute / pending |
| 注意力分配 | `ceo_attention_alloc` | — | main / branch / firefighting (按周) |
| 董事画像 | `ceo_directors` | — | weight 表董事影响力 |
| 关切雷达 | `ceo_director_concerns` | — | pending / answered / superseded |
| 预读包 | `ceo_briefs` | — | toc jsonb，含 future_tagged 章节 |
| 反方演练 | `ceo_rebuttal_rehearsals` | `mn_runs.metadata` | g3 LLM 任务产物 |
| 承诺看板 | — | `mn_commitments` | Tower 复用 mn 现有 |
| 阵型 | `ceo_formation_snapshots` | `mn_silence_signals + mn_judgments` | 数据底仍是 mn |
| 利益相关方 | `ceo_stakeholders` | — | customer/regulator/investor/press/partner |
| 外部信号 | `ceo_external_signals` | content-library `assets` | sentiment ∈ [-1, 1] |
| Rubric | `ceo_rubric_scores` | — | 5 维 × N 利益方 × score ∈ [0, 1] |
| 反思 | `ceo_balcony_reflections` | — | user_id × week_start × prism |
| 时间 ROI | `ceo_time_roi` | — | weekly_roi = deep_focus / target_focus |
| 六棱镜 | `ceo_prisms` | — | g5 加工产物，按 (scope, week) 唯一 |
| 任务队列 | — | `mn_runs WHERE module IN ('mn','ceo')` | Brain TasksRoom 跨模块 |
