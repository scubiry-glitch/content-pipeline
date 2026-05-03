-- Meeting Notes Module · 029 — 把 axis 列从 VARCHAR(16) 拓宽到 VARCHAR(64)
--
-- 上下文:
--   - 022 把 axis 的 CHECK 改成 regex (^[a-z][a-z0-9_-]{0,63}$, 即支持 64 字符)
--     但只改了 CONSTRAINT，没改列宽。列宽还是 006 时代的 VARCHAR(16)。
--   - 实际 CEO 模块若干 axis 已经超 16 字符:
--       boardroom-annotations (20)
--       boardroom-annotation  (20)
--       panorama-aggregate    (18)
--       boardroom-rebuttal    (18)
--       compass-drift-alert   (19)
--     INSERT 时报 "value too long for type character varying(16)"。
--
-- 行为：把 mn_runs.axis / mn_run_schedules.axis / mn_axis_links.source_axis /
--       target_axis 全部拓到 VARCHAR(64)，与 022 的 regex 上限一致。
--       Postgres ALTER COLUMN ... TYPE 安全，不丢数据。

ALTER TABLE mn_runs
  ALTER COLUMN axis TYPE VARCHAR(64);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_name = 'mn_run_schedules' AND column_name = 'axis') THEN
    EXECUTE 'ALTER TABLE mn_run_schedules ALTER COLUMN axis TYPE VARCHAR(64)';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_name = 'mn_axis_links' AND column_name = 'source_axis') THEN
    EXECUTE 'ALTER TABLE mn_axis_links ALTER COLUMN source_axis TYPE VARCHAR(64)';
    EXECUTE 'ALTER TABLE mn_axis_links ALTER COLUMN target_axis TYPE VARCHAR(64)';
  END IF;
END $$;

-- mn_axis_versions.axis 同步
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_name = 'mn_axis_versions' AND column_name = 'axis') THEN
    EXECUTE 'ALTER TABLE mn_axis_versions ALTER COLUMN axis TYPE VARCHAR(64)';
  END IF;
END $$;

-- ============================================================
-- Rollback (manual):
--   ALTER TABLE mn_runs ALTER COLUMN axis TYPE VARCHAR(16);
--   等等
-- ============================================================
