# P0 · 数据源契约（source 列）

## Why

`mn_*` 表原是「LLM 抽取」单向流，`replaceExisting=true` 即「LLM = source of truth」。但项目混入了「手工聚合 JSON 导入」第二条数据源。两者写同表无 source 字段区分 → LLM 重算永远「删人工/写自己」 → 人工数据天然受劫持。所有衍生症状（panel scopeId 缺失、queue 卡死、空跑 succeeded）都是这个核心契约缺失的副作用。

## What

给所有 axis 表加 `source` 列（enum），LLM computer 只 DELETE/UPDATE 自己产出的（`source='llm_extracted'`），从契约层正交两条数据源。

## Files

- 新建：`api/src/modules/meeting-notes/migrations/013-source-tracking.sql`
- 改 16 个 computer：`api/src/modules/meeting-notes/axes/{people,projects,knowledge,meta}/*.ts`
- 改导入脚本：`scripts/import-sh-ai-axes-all.mjs`

## Migration（013）

```sql
-- 给 16 张表加 source 列，DEFAULT 'llm_extracted'，CHECK enum
ALTER TABLE mn_commitments ADD COLUMN source VARCHAR(20) NOT NULL DEFAULT 'llm_extracted'
  CHECK (source IN ('llm_extracted','manual_import','human_edit','restored'));
-- 同上对 mn_role_trajectory_points / mn_speech_quality / mn_silence_signals
-- mn_decisions / mn_assumptions / mn_open_questions / mn_risks
-- mn_judgments / mn_mental_model_invocations / mn_cognitive_biases / mn_counterfactuals / mn_evidence_grades
-- mn_decision_quality / mn_meeting_necessity / mn_affect_curve

-- Backfill：按 metadata 里的 src_id 模式识别 manual_import 行
UPDATE mn_commitments SET source='manual_import' WHERE evidence_refs->>'src_id' LIKE 'K-%';
UPDATE mn_decisions SET source='manual_import' WHERE metadata->>'src_id' LIKE 'D-%';
UPDATE mn_assumptions SET source='manual_import' WHERE metadata->>'src_id' LIKE 'AS-%';
UPDATE mn_open_questions SET source='manual_import' WHERE metadata->>'src_id' LIKE 'Q-%';
UPDATE mn_risks SET source='manual_import' WHERE metadata->>'src_id' LIKE 'R-%';
UPDATE mn_judgments SET source='manual_import' WHERE metadata->>'src_id' LIKE 'J-%';
-- mn_role_trajectory / mn_speech_quality / mn_silence_signals / 4 个 meta singleton：
-- 没有 src_id 标记，按 meeting_id IN (1ace56ff, eff87d6c) + JSON 字段特征 backfill

CREATE INDEX idx_mn_commitments_source_meeting ON mn_commitments(source, meeting_id);
-- ……酌情
```

## Computer 改动模式（统一）

**DELETE-style 9 个**（commitments / role_trajectory / speech_quality / silence_signals / decisions / assumptions / cognitive_biases / counterfactuals / mental_model_invocations）：
```diff
- DELETE FROM mn_X WHERE meeting_id = $1
+ DELETE FROM mn_X WHERE meeting_id = $1 AND source = 'llm_extracted'
```

**UPSERT-style 4 个 singleton**（evidence_grades / decision_quality / meeting_necessity / affect_curve），加 ON CONFLICT WHERE：
```diff
  INSERT INTO mn_X ... ON CONFLICT (meeting_id) DO UPDATE SET ...
+ WHERE mn_X.source NOT IN ('manual_import','human_edit')
```

**UPDATE-then-INSERT 3 个**（open_questions / risks / judgments）：
```diff
- UPDATE mn_X SET ... WHERE [natural_key]
+ UPDATE mn_X SET ... WHERE [natural_key] AND source != 'manual_import'
```

INSERT 不显式传 source，享用 DEFAULT 'llm_extracted'。

## 导入脚本改动

`import-sh-ai-axes-all.mjs`：
1. 各 INSERT 加 `source='manual_import'` 字段（显式）。
2. 各 wipe DELETE 加 `AND source = 'manual_import'`（保护 LLM 数据，再跑 import 不连带删 LLM 行）。

## 验证

```sql
-- 1. 新列存在 + CHECK 生效
SELECT column_name, column_default FROM information_schema.columns
 WHERE table_name = 'mn_commitments' AND column_name = 'source';
-- expect: source · 'llm_extracted'::character varying

-- 2. backfill 正确：人工导入 8 条 R-* 都标 manual_import
SELECT source, count(*) FROM mn_risks WHERE metadata->>'src_id' LIKE 'R-%' GROUP BY source;
-- expect: manual_import · 8

-- 3. 模拟 LLM run DELETE 不会删人工数据
DELETE FROM mn_risks WHERE scope_id = 'f6cf3f51-...' AND source = 'llm_extracted';
SELECT count(*) FROM mn_risks WHERE scope_id = 'f6cf3f51-...';  -- 仍是 8（人工的没动）
```

## 风险与回滚

- 16 张表 ALTER COLUMN 在 dev DB ~秒级，prod 大表需 `lock_timeout` + 分批
- 回滚：`ALTER TABLE mn_X DROP COLUMN source` × 16
- 已运行的旧 LLM run 数据被错标 'llm_extracted' 是正确的（它本来就是 LLM 写的）
