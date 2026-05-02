-- Meeting Notes · 026 — mn_meeting_shares
-- 会议纪要分享：支持「知道链接即可访问」和「指定人员」两种模式
--
-- mode='link'     → 任何持有 share_token 的人都能只读访问该会议
-- mode='targeted' → targets[] 内的邮箱白名单，持有链接也需要邮箱验证（前端拦截即可）

CREATE TABLE IF NOT EXISTS mn_meeting_shares (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id    TEXT NOT NULL,
  share_token   UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),
  mode          TEXT NOT NULL DEFAULT 'link' CHECK (mode IN ('link', 'targeted')),
  targets       JSONB NOT NULL DEFAULT '[]',
  created_by    TEXT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at    TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_mn_meeting_shares_meeting
  ON mn_meeting_shares (meeting_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_mn_meeting_shares_token
  ON mn_meeting_shares (share_token);

-- ROLLBACK:
--   DROP TABLE IF EXISTS mn_meeting_shares;
