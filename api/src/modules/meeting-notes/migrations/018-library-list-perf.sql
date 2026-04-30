-- Meeting Notes Module · 018 — /meeting/library 列表查询性能索引
--
-- 背景：GET /meetings 主查询遇到两条性能瓶颈：
--   1. 顶层过滤 `WHERE (a.type = 'meeting_note' OR (a.metadata ? 'meeting_kind'))`
--      — 没有 GIN 索引时 JSONB ? 操作要全表扫
--      — assets.type 没单列索引时要按 OR 走两次 seq scan
--   2. 历史 SQL 普遍写成 `meeting_id::text = a.id::text`，类型转换让 UUID 索引失效
--      → 已在 router.ts 同步去掉所有 ::text 强转
--
-- 本 migration 补两个索引帮助 layer-1（router 改动）真正命中索引：
--   - GIN(metadata jsonb_path_ops) — 让 `metadata ? 'meeting_kind'` 直接走索引
--   - btree(type) WHERE type IS NOT NULL — 加速 'meeting_note' 类型筛选
--
-- 真实数据（万级 assets）下，预期 /meetings 列表从 N 次相关子查询全表扫
-- (P99 ~1-2s) 降到 ~50-100ms。

-- jsonb_path_ops 比默认 jsonb_ops 索引体积小约 30%，且对 ? 操作同样高效；
-- 我们只需要 ? / @> 这类「键存在」查询，不需要 ?| / ?& 的多键支持，所以选 path_ops。
CREATE INDEX IF NOT EXISTS idx_assets_metadata_gin
  ON assets USING GIN (metadata jsonb_path_ops);

-- 部分索引 — type IS NOT NULL 时才入索引，避免大量 NULL 拉低选择率
CREATE INDEX IF NOT EXISTS idx_assets_type_partial
  ON assets(type) WHERE type IS NOT NULL;

-- ROLLBACK:
--   DROP INDEX IF EXISTS idx_assets_metadata_gin;
--   DROP INDEX IF EXISTS idx_assets_type_partial;
