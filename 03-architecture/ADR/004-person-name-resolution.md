# ADR-004: 会议人物名字解析 —— 多管道一致性设计

**日期**：2026-07-20  
**状态**：Accepted  
**涉及模块**：`api/src/modules/meeting-notes/parse/`、`content-library/consolidation/`、`meeting-notes/runs/`、`meeting-notes/review/`

---

## 背景

会议解析从 ASR 转录文本提取说话人。腾讯会议导出格式为 `说话人N HH:MM`，这些标签不是真人名，需要一套管道把它们注册、去重、关联到规范人物，并支持人工绑定。核心矛盾：

- **同「说话人3」跨会议 ≠ 同一人**（串场污染不可接受）
- **同会议里「齐波」和「齐波（PM）」应去重**（场内归一）
- **花名册合并会重建 person UUID** → 旧轴表行留悬空 id（事实表不跟 UUID 重建）

---

## 决策

### 管道五层架构

```
ASR 文本 → [1] transcriptParser → [2] ensurePersonByName → [3] EntityResolver
                ↓                        ↓                          ↓
          regex 提取说话人        去重/非人物过滤/建行      全局实体注册表
         (零 LLM, 纯正则)         INSERT mn_people         content_entities
                                                       
[4] 候选发现 (pgvector <=>) → [5] 人工审核/合并 → mn_merge_people (SQL函数)
    person 永不自动合并              ^             改 11 张 FK 表 → 删旧行
    (避免跨 workspace 同名塌缩)      |
                              content_entity_merge_candidates
```

### 第 1 层：正则提取（无 LLM）

文件：`api/src/modules/meeting-notes/parse/transcriptParser.ts`

- `parseTranscript(raw)`（line 109）：三种正则级联试，都不命中才降级到按段落切分
  - `RE_CN_SPEAKER`：`说话人N HH:MM`（腾讯会议格式，line 61）
  - `RE_BRACKET_SPEAKER`：`[Name] HH:MM`（line 62）
  - `RE_COLON_SPEAKER`：行首 `Name: content`（line 63）
- `cleanText(raw)`（line 46）：去 BOM、统换行、关键 — `说话人N HH:MM` 后补换行（docx→text 常粘在一起）
- 输出：`{ participants: [{name, segmentCount}] }` — 去重说话人列表

### 第 2 层：注册与去重（ensurePersonByName）

文件：`api/src/modules/meeting-notes/parse/participantExtractor.ts`

```ts
ensurePersonByName(deps, rawName, role?, org?, meetingId?)
```

流程：

1. **`normalizeName(raw)`**（line 10）→ trim、去空、去括号注释
2. **`isLikelyNonPerson(name)`**（line 30）→ 滤掉「第一部分」「地点」「参会人员」「录音时间」等结构性标签。**不滤 说话人N**（ASR 标签结构像人名）
3. **`EntityResolver.resolveAndRegister()`**（line 72-79）→ 挂全局实体（best-effort，失败则降级为 null）
4. **去重查询**（line 90-105）：
   ```sql
   SELECT FROM mn_people WHERE canonical_name = $1 OR $1 = ANY(aliases)
   -- meetingId 已知时通过 assets.workspace_id 限定 scope
   ```
5. **INSERT**（line 124-136）→ 建 `mn_people` 行，`first_seen_meeting_id` 触发 DB trigger 自动推导 `workspace_id`

### 第 3 层：场内解析（PersonRoster）

文件：`api/src/modules/meeting-notes/runs/personRoster.ts`

`PersonRoster` 是本场的只读缓存（line 31）：

| 方法 | 说明 |
|------|------|
| `build(deps, meetingId)`（line 50） | 加载 `mn_people LEFT JOIN content_entities` |
| `resolve(rawName)`（line 77） | 同步快捷路径：canonical_name / aliases 精确匹配 |
| `resolveAsync(rawName)`（line 87） | 完整路径：精确匹配 → bge-m3 1024d 余弦相似度（阈值 0.86） |
| `flushUnresolved()`（line 113） | 写入 `mn_unresolved_mentions` 待人工审核 |

### 第 4 层：候选发现（Embedding 语义相似）

文件：`api/src/modules/content-library/consolidation/autoMergeEntities.ts`

```ts
autoMergeContentEntities(deps, { minSimilarity, auto, limit })  // line 75
```

- `findMergeCandidatePairs()`（line 16）：pgvector `<=>` 算 `content_entities.embedding` 余弦相似度
- **person 实体从不自动合并**（line 91）：
  ```ts
  canAuto = p.entityType !== 'person' && p.similarity >= auto
  ```
  原因：`mn_people.canonical_name` 未经 email/手机 等强唯一标识验证，同一名字可能是不同 workspace 的两个人。误合并 alias 会**污染后续所有解析**，比假阴性难修得多。
- person 候选只写 `content_entity_merge_candidates`，等人审。

### 第 5 层：原子合并（SQL 函数）

文件：`api/src/modules/meeting-notes/migrations/031-merge-content-entity-link.sql`

```sql
mn_merge_people(target_id UUID, source_id UUID)  -- PostgreSQL 函数
```

合并步骤（单事务内）：

1. **三张 UNIQUE 约束表兜底** — 源行冲突则删（目标行胜出）：
   - `mn_role_trajectory_points(person_id, meeting_id, role_label)`
   - `mn_speech_quality(person_id, meeting_id)`
   - `mn_silence_signals(person_id, meeting_id)`

2. **三张无 UNIQUE 约束表直接改 FK**：`mn_commitments` 等

3. **七张列名不同的表单独改**：
   - `mn_decisions.proposer_person_id`
   - `mn_assumptions.verifier_person_id`
   - `mn_open_questions.owner_person_id`
   - `mn_judgments.author_person_id`
   - `mn_mental_model_invications.invoked_by_person_id`
   - `mn_cognitive_biases.by_person_id`
   - `mn_counterfactuals.rejected_by_person_id`

4. **合并别名**：`target.aliases ∪ {source.canonical_name} ∪ source.aliases`，去重，排除 target 自名

5. **继承 `content_entity_id`**（target 空缺时从 source 接）

6. **删除 source 行**

**副作用**：合并后旧 `source_id` 从 `mn_people` 消失，但轴表 `between_ids` / `supported_by` / `by_ids` 还是旧 UUID → 悬空引用。这是数据重建的必然代价（轴表 = 写入时锁定的语义事实，不跟人物重建同步变更）。前端/接口通过 `person-names` 端点 + `nonUuidParticipant` 兜底处理。

---

## 一致性保证

### 跨会议一致性

| 机制 | 文件 | 作用 |
|------|------|------|
| `content_entities` 全局注册表 | `entityResolver.ts` | 所有人物的跨会议唯一标识；按 canonical_name / aliases 查重用 |
| workspace 作用域限定 | `participantExtractor.ts:90-97` | `(name, org)` 唯一性通过 `assets.workspace_id` 限定 |
| per-meeting override | `router.ts:1741-1811` | `POST /meetings/:id/people/bind` 写 `participantOverrides[name]=personId`，存 `assets.metadata`，只本场生效 |
| 场级重指不加 alias | `reassignMeetingPerson.ts:25` | `reassignMeetingPerson(from,to)` 只改本场引用，注释写死 "源可能是泛指(说话人N)，加成全局别名会让名字解析在所有场次都错映射到目标（串场污染）" |
| person 永不自动合并 | `autoMergeEntities.ts:91` | 只入 candidate 表等人审；embedding 相似不足以证明是同一人 |
| 悬空留底 | `personRoster.ts:113` | `mn_unresolved_mentions` 记录解析不出的名字 + 出现次数 |

### 同一会议内一致性

| 机制 | 说明 |
|------|------|
| `normalizeName` | 去空格、括号 → 「齐波」和「齐波（PM）」归一 |
| `person-names` 端点 | `GET /meetings/:id/person-names` 聚合 analysis JSON + 轴表全部 UUID，统一返回 `{uuid: 姓名}` map，三视图 `P()` 统一消费 |
| `participantOverrides` | 本场硬绑定优先于任何自动解析 |

---

## "说话人N" 串场隔离设计（核心安全边界）

1. **ASR 标签直接入库** — `isLikelyNonPerson` 不阻止 说话人N（逻辑上它是人物占位），每场各自建独立的 `mn_people` 行

2. **本场 override 在 `assets.metadata`** — 不写 `mn_people` 全局列，其他会议不受影响

3. **`reassignMeetingPerson` 不加 aliases** — 如果「说话人3」被指认是「张三」，只改**这一场**的 FK，不在张三的 aliases 写「说话人3」。若写入 aliases，下一场 ASR 也输出「说话人3」就会被全局解析成张三——而下一场的说话人3完全是另一个人

4. **合并换 UUID → 悬空是预期行为** — 花名册 ⑤ 合并正确删了旧行；但事实性质的轴表 `between_ids` 不跟 UUID 重建。通过 `person-names` 端点（可解析 UUID → 姓名）+ `nonUuidParticipant` 兜底（真悬空 → 参会人）在显示层抹平

5. **宁可两个会议各自「说话人3」，也不把两个不同的人误绑成一个。** 假阳性（误合并）不可逆（alias 污染全局）；假阴性（真人未关联）可补（`/people/bind`）

---

## 悬空 person UUID 的处理现状

| 层面 | 做法 |
|------|------|
| DELETE /people/:id | 删人时 `array_remove` 三张 UUID[] 数组列 (`between_ids`/`supported_by`/`by_ids`) —— commit `01071d29` |
| 存量悬空（12 个 id） | **不清理**（dry-run 发现 blanket prune 会清空 55%/53%/90% 的行） |
| 显示兜底 | `person-names` 端点 → 可解析 UUID 返回「说话人N」/真人名；悬空 id 不在 map 里 → `nonUuidParticipant()` → 「参会人」 |
| 清理脚本 | `api/src/scripts/prune-dangling-person-refs.ts`（dry-run 默认，`--apply` 执行） |

---

## 相关文件索引

| 文件 | 关键函数/行 |
|------|------------|
| `parse/transcriptParser.ts` | `parseTranscript()`:109, `cleanText()`:46 |
| `parse/participantExtractor.ts` | `ensurePersonByName()`:51, `normalizeName()`:10, `isLikelyNonPerson()`:30 |
| `runs/personRoster.ts` | `resolve()`:77, `resolveAsync()`:87, `flushUnresolved()`:113 |
| `content-library/consolidation/entityResolver.ts` | `resolveAndRegister()`:16 |
| `content-library/consolidation/autoMergeEntities.ts` | `autoMergeContentEntities()`:75 |
| `content-library/consolidation/mergeEntities.ts` | `mergeContentEntities()`:11 |
| `review/reassignMeetingPerson.ts` | `reassignMeetingPerson()`:25 |
| `review/peopleRosterService.ts` | `getPersonMeetings()`:92 |
| `router.ts`:1741-1811 | `GET/POST /meetings/:id/people/bind` |
| `router.ts`:3385-3414 | `GET /meetings/:id/tensions` (between_names) |
| `router.ts`:~3416 | `GET /meetings/:id/person-names` (全量 UUID→姓名 map) |
| `migrations/031-merge-content-entity-link.sql` | `mn_merge_people()` SQL 函数 |
| `scripts/prune-dangling-person-refs.ts` | 悬空 id 清理工具（dry-run 默认） |

---

## 后果

- **正面**：
  - 假阳性（误合并）风险受控：person 不自动合并 + 场级重指不加 aliases
  - 可解析:悬空比 16:5（7825d82a…实例），真名（齐波/张玮珈）和 ASR 标签均能解析
  - 删人安全：自动清三张 UUID[] 数组列，不再新增悬空引用
- **负面**：
  - 同一个人跨会议显示为两个不同记录（直到人工合并）——这是设计取舍
  - 花名册合并 → 悬空 UUID —— 事实性轴表不跟 UUID 重建的副作用
  - ASR-only 会议（无真人绑定）名字永远是 说话人N

---

*关联 ADR：[ADR-003 花名册实体系统](../花名册实体系统.md)*  
*相关 memory：[[project_meeting_data_integrity_gaps]] · [[project_meeting_entity_phases]]*
