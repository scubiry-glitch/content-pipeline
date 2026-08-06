-- Meeting Notes Module · 035 — meeting-local participant bindings / review queue
-- 本场参会人标签是权威：先推荐候选，人工确认后才绑定到全局 mn_people。

CREATE TABLE IF NOT EXISTS mn_meeting_participants (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id          VARCHAR(50) NOT NULL,
  raw_label           TEXT NOT NULL,
  normalized_label    TEXT NOT NULL,
  label_kind          TEXT NOT NULL DEFAULT 'unknown', -- generic_asr | named | unknown
  role                TEXT,
  occurrences         INTEGER NOT NULL DEFAULT 1,
  status              TEXT NOT NULL DEFAULT 'pending', -- pending | confirmed | rejected
  confirmed_person_id UUID REFERENCES mn_people(id) ON DELETE SET NULL,
  metadata            JSONB NOT NULL DEFAULT '{}'::jsonb,
  confirmed_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (meeting_id, normalized_label)
);

-- 早期开发库可能已按 UUID 建过这张表；assets.id 实际是 VARCHAR，统一收敛为文本键。
ALTER TABLE mn_meeting_participants
  ALTER COLUMN meeting_id TYPE VARCHAR(50) USING meeting_id::text;

CREATE INDEX IF NOT EXISTS idx_mn_meeting_participants_meeting_status
  ON mn_meeting_participants(meeting_id, status);
CREATE INDEX IF NOT EXISTS idx_mn_meeting_participants_confirmed_person
  ON mn_meeting_participants(confirmed_person_id);

-- 从历史 metadata.participants 回填本场观察到的参会人标签
INSERT INTO mn_meeting_participants (meeting_id, raw_label, normalized_label, label_kind, role, occurrences, metadata)
SELECT
  a.id,
  p.raw_label,
  p.normalized_label,
  CASE
    WHEN p.normalized_label ~* '^(说话人|speaker)\s*[0-9]+$' THEN 'generic_asr'
    ELSE 'named'
  END,
  p.role,
  1,
  jsonb_build_object('seededFrom', 'assets.metadata.participants')
FROM assets a
CROSS JOIN LATERAL (
  SELECT
    COALESCE(NULLIF(trim(x->>'name'), ''), trim(x::text, '"')) AS raw_label,
    NULLIF(trim(regexp_replace(COALESCE(NULLIF(trim(x->>'name'), ''), trim(x::text, '"')), '[（(][^）)]*[)）]', '', 'g')), '') AS normalized_label,
    NULLIF(trim(x->>'role'), '') AS role
  FROM jsonb_array_elements(COALESCE(a.metadata->'participants', '[]'::jsonb)) x
) p
WHERE p.raw_label IS NOT NULL
  AND p.raw_label <> ''
  AND p.normalized_label IS NOT NULL
  AND p.normalized_label <> ''
ON CONFLICT (meeting_id, normalized_label)
DO UPDATE SET
  raw_label = EXCLUDED.raw_label,
  role = COALESCE(mn_meeting_participants.role, EXCLUDED.role),
  updated_at = NOW();

-- 从历史 participantOverrides 导入已确认绑定；override 即使 metadata.participants 缺失也保留为本场标签。
INSERT INTO mn_meeting_participants (
  meeting_id, raw_label, normalized_label, label_kind, status, confirmed_person_id, confirmed_at, metadata
)
SELECT
  a.id,
  e.key,
  trim(regexp_replace(e.key, '[（(][^）)]*[)）]', '', 'g')),
  CASE
    WHEN trim(regexp_replace(e.key, '[（(][^）)]*[)）]', '', 'g')) ~* '^(说话人|speaker)\s*[0-9]+$' THEN 'generic_asr'
    ELSE 'named'
  END,
  'confirmed',
  e.value::uuid,
  NOW(),
  jsonb_build_object('seededOverride', true)
FROM assets a
CROSS JOIN LATERAL jsonb_each_text(COALESCE(a.metadata->'participantOverrides', '{}'::jsonb)) e
WHERE e.value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
ON CONFLICT (meeting_id, normalized_label)
DO UPDATE SET
  confirmed_person_id = EXCLUDED.confirmed_person_id,
  status = 'confirmed',
  confirmed_at = COALESCE(mn_meeting_participants.confirmed_at, EXCLUDED.confirmed_at),
  metadata = COALESCE(mn_meeting_participants.metadata, '{}'::jsonb) || EXCLUDED.metadata,
  updated_at = NOW();

-- 没有 metadata.participants、但 unresolved mentions 里已有的，也建出本场 review 记录
INSERT INTO mn_meeting_participants (meeting_id, raw_label, normalized_label, label_kind, occurrences, metadata)
SELECT
  um.meeting_id::text,
  um.raw_name,
  um.normalized_name,
  CASE
    WHEN um.normalized_name ~* '^(说话人|speaker)\s*[0-9]+$' THEN 'generic_asr'
    ELSE 'unknown'
  END,
  um.occurrences,
  jsonb_build_object('seededFrom', 'mn_unresolved_mentions')
FROM mn_unresolved_mentions um
WHERE um.meeting_id IS NOT NULL
ON CONFLICT (meeting_id, normalized_label)
DO UPDATE SET
  occurrences = GREATEST(mn_meeting_participants.occurrences, EXCLUDED.occurrences),
  updated_at = NOW();
