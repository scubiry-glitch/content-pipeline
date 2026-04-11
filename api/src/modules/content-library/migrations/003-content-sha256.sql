-- Content Library v7.1 — T1.1: SHA256 内容哈希缓存
-- 目的: 避免对相同内容重复调用 LLM 做事实提取/实体解析
--
-- 用法:
--   psql -f 003-content-sha256.sql
--
-- 回滚:
--   ALTER TABLE asset_library DROP COLUMN content_sha256;
--   DROP INDEX IF EXISTS idx_asset_library_sha256;

ALTER TABLE asset_library
  ADD COLUMN IF NOT EXISTS content_sha256 VARCHAR(64);

-- 索引用于快速去重查找
CREATE INDEX IF NOT EXISTS idx_asset_library_sha256
  ON asset_library(content_sha256)
  WHERE content_sha256 IS NOT NULL;

COMMENT ON COLUMN asset_library.content_sha256 IS
  'SHA256 of normalized content. Used by importAsset to skip duplicate LLM calls.';
