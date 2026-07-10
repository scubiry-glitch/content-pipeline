# 会议实体统一解析层设计

> 日期：2026-07-10
> 范围：`api/src/modules/meeting-notes/` 的实体（entity）与聚合（scope）层
> 代码锚点：`meeting-notes/`、`content-library/consolidation/entityResolver.ts`、`content_entities`、`mn_people`

---

## 1. 背景与问题（为什么要做）

meeting 应用的"实体层"当前是**散**的，根因是**两套并行的实体子系统 + 一处散乱的生成路径**：

### 1.1 两个规范实体源并存

| | person | org / product / event / location / project |
|---|---|---|
| **content-library** | `content_entities` 有，但会议侧不写入 | `content_entities` + `EntityResolver`（已实现精确+别名+embedding 解析） |
| **meeting-notes** | `mn_people` + 自己的 upsert/merge（另一套） | ❌ 无规范路径，只有 LLM 吐出的名字字符串 |

- `content-library/consolidation/EntityResolver.resolveAndRegister()` 已是一个**全类型**实体解析器，写 `content_entities`，但**只被 `ContentLibraryEngine` 调用**。
- `meeting-notes` **从不调它**：`persistClaudeWiki` 只**只读**查 `content_entities`，未命中就放弃写 wiki（"必须 content_entities 命中"）；person 完全自成一套 `mn_people`。
- 结果：**person 在两边各存一份且不互链**；org/product 从会议出来后没有规范落点。

### 1.2 mn_people「生成很散」（更重要的根因）

`mn_people` 存在**两套创建哲学**：

- **散的路径 —— `ensurePersonByName(name)`**：至少 **8 个 axis computer 各自**拿 LLM 自由文本名字当场 mint 一条 `mn_people` 行：
  `meetingParser`、`roleTrajectoryComputer`、`speechQualityComputer`、`counterfactualsComputer`、`reusableJudgmentsComputer`、`cognitiveBiasesComputer`、`mentalModelsComputer`、`openQuestionsComputer`。
  彼此不共享归一化 → "张总 / 张伟 / 张总监" 在三个轴里变成三条记录。
- **干净的路径 —— `cliPersonMap` + `resolvePersonId`**（`persistClaudeAxes`）：claude-cli 一次出全量时 LLM 只认一次人、发 `p1/p2` 稳定 localId，全程一张映射表反查。**这条路本身不散。**

`mn_merge_people`（migration 016）目前是唯一的补救手段，纯手工触发（`POST /people/:id/merge`），实际在为散乱生成"擦屁股"。

---

## 2. 目标与非目标

**目标**
1. 全系统实体的**唯一解析/创建 seam**：`content_entities` + `EntityResolver`。
2. meeting-notes 的 6 类实体（person/org/product/event/location/project）都经此 seam 产出并携带 canonical id。
3. **源头治理** person 散生成：run 内单点造人，axis computer 退化为只读解析。
4. 保留并**降级**已有 merge 能力为"事后兜底网"（清存量 + 兜漏网）。

**非目标（YAGNI）**
- 不新建 `mn_entities` 表（`content_entities` 已是该多态表）。
- 不折表迁移 `mn_people`（采用桥接，见 §4）。
- 不把 `mn_merge_people` 扩成万能合并（org/product 用独立通用合并）。
- 不改 Obsidian wiki 为可人工编辑源（确认为纯机器产物，wiki/JSON 均为可重生成投影）。

---

## 3. 架构总览

```
                ┌─────────────────────────────────────────┐
                │  EntityResolver.resolveAndRegister()      │  ← 唯一实体 seam
                │  content_entities(entity_type, aliases,   │
                │  embedding, canonical_name)               │
                └───────────────▲───────────────▲──────────┘
                                │               │
          person（桥接）        │               │  org/product/event/location/project
                                │               │
        ┌───────────────────────┴──┐        ┌───┴───────────────────────┐
        │ mn_people                │        │ 会议 axis 抽取             │
        │  + content_entity_id FK  │        │ 直接过 resolver            │
        └───────────▲──────────────┘        └───────────────────────────┘
                    │
        ┌───────────┴───────────────┐
        │ run 花名册 (roster)        │  ← 源头单点造人
        │ 参会人 + 首轮 LLM 人名     │
        └───────────▲───────────────┘
                    │ roster.resolve(name)（只读）
        ┌───────────┴───────────────┐
        │ ~8 axis computer          │  ← 不再 ensurePersonByName 造人
        └───────────────────────────┘
```

---

## 4. 组件设计

### 4.1 唯一实体 seam
- `EntityResolver` 定为 meeting-notes 与 content-library 共用的实体入口。meeting-notes 直接 import content-library 的 `EntityResolver`（依赖已存在：`persistClaudeWiki` 已引用 content-library 的 wiki helper）。
- `entity_type` 取值扩展到 `person|org|product|event|location|project`（现默认 `concept`）。

### 4.2 person：桥接（不迁移）
- `mn_people` 加列 `content_entity_id UUID REFERENCES content_entities(id)`。
- `ensurePersonByName` 内部改为：先过 `EntityResolver.resolveAndRegister({entity_type:'person'})` 拿全局 canonical id，再写/查 `mn_people` 并落 `content_entity_id`。
- 11 张 person 外键表、`mn_merge_people` **本体不动**；person 从"两边各存"变"互链"。

### 4.3 源头治理：每 run 一份花名册（核心）
- run 开始（parse 后）**只解析一次**：参会人 + 首个 LLM 输出里的人名 → roster（`name/alias → {mn_people.id, content_entity_id}`）。
- ~8 个 axis computer 里的 `ensurePersonByName(item.who)` **全部替换为 `roster.resolve(name)`**：只在 roster 内做 canonical+alias+embedding 模糊匹配。
- **硬约束：命不中不造人**。超阈值 → 挂到最近 roster 成员；否则 → 标记 `unresolved` 入队，交兜底网。**唯一造人点 = roster builder。**

### 4.4 事后兜底网
- (a) **embedding 自动合并任务**：同 `entity_type` 且 cosine > 阈值 → person 走 `mn_merge_people`；其它类型走通用实体合并（§4.6）。
- (b) **人工复核**：已有 `POST /people/:id/merge`；新增 "unresolved 人名" 复核队列，一键 attach/新建。

### 4.5 org/product/event/location/project
- run 内这 5 类由 knowledge/projects 轴抽出后**统一过 `EntityResolver.resolveAndRegister`**，带 `content_entity_id` 进 axes JSON + wiki。
- `persistClaudeWiki` 不再因 "content_entities 未命中" 放弃写页（resolver 保证已注册）。

### 4.6 合并功能在新架构下的定位
- `mn_merge_people` = **事后那条腿**，功能保留、角色由"主力"降级为"兜底"（源头 roster 负责不再产生新散）。
- **自动合并复用它**：#4.4(a) 底层即调 `mn_merge_people`，只是配对由人工点选换为 cosine 超阈值自动。
- **唯一必须改它的地方（P1）**：mn_people 加 `content_entity_id` 后，合并两条指向不同 content_entities 的 person 时，需一并归一 `content_entity_id`（或级联触发一次 content_entities 合并）。
- **org/product 不归它管**：需一个 **content_entities 版通用合并函数**（reassign `content_facts` / `entity_relations` 等），`mn_merge_people` 保持 person 专用。

---

## 5. 分期落地（每期可独立上线、可回滚）

| 期 | 内容 | 破坏性 |
|---|---|---|
| **P1** | `mn_people` 加 `content_entity_id`；`ensurePersonByName` 回填；`mn_merge_people` 扩展维护该列一致性；backfill 历史 | 无 |
| **P2** | 引入 run roster，~8 axis computer 换 `roster.resolve`（先 multi-axis 路径；claude-cli 已干净）；flag 灰度 | 行为变化，flag 兜 |
| **P3** | org/product 等 5 类走 resolver；修 `persistClaudeWiki`；配 content_entities 通用合并函数 | 低 |
| **P4** | 兜底网：embedding 自动合并任务 + unresolved 复核 UI | 无 |

---

## 6. 测试策略（TDD）

- **单测 · roster.resolve**：同 run 内「张总/张伟/张总监」归一到同 id；roster 外名字**只 park 不 mint**。
- **单测 · 桥接**：`ensurePersonByName` 落 `content_entity_id`；merge 两条不同 content_entity 时归一该列。
- **集成 · 单会议 fixture**：跑一场会议，断言 `mn_people` 新增行数 == roster size；跨轴无重复造人；wiki 页均带 canonical id。
- **回归**：claude-cli 路径（本已干净）行为不变。

---

## 7. 关键取舍（已与用户确认）

1. 实体 6 类全覆盖；存储采用现成 `content_entities`（不新建 `mn_entities`）。
2. person 用**桥接**（加 FK）而非折表迁移 —— 低风险、11 张外键表不动。
3. 源头硬约束**"命不中不造人、park 入队"** —— 牺牲一点召回换零散乱。
4. 分四期、P2 用 flag 灰度。
5. 已有 `mn_merge_people` 保留并降级为兜底；仅 P1 扩展 `content_entity_id` 一致性。
