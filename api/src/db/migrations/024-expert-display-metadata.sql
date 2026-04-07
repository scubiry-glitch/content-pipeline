-- 为 expert_profiles 表增加 display_metadata 列
-- 存放前端展示专用字段: level, domainCode, domainName, philosophy, achievements, angle 等
-- 与 persona/method/emm 等引擎专用字段分离

ALTER TABLE expert_profiles ADD COLUMN IF NOT EXISTS display_metadata JSONB DEFAULT '{}';

-- 确保 expert_profiles 表有 updated_at 字段（部分旧迁移可能缺失）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'expert_profiles' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE expert_profiles ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
  END IF;
END $$;
