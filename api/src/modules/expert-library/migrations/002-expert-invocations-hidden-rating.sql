-- expert_invocations：辩论隐藏与用户评分（若 001 已执行过旧版，单独执行本文件即可）
ALTER TABLE expert_invocations ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN DEFAULT false;
ALTER TABLE expert_invocations ADD COLUMN IF NOT EXISTS user_rating SMALLINT;
ALTER TABLE expert_invocations ADD COLUMN IF NOT EXISTS rated_at TIMESTAMPTZ;
