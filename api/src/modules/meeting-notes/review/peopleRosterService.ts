// 全局人物花名册：列 mn_people（跨 workspace），供花名册页。只读。
type Db = { query(sql: string, params?: any[]): Promise<{ rows: any[] }> };

export interface PeopleRosterRow {
  id: string;
  canonicalName: string;
  aliases: string[];
  role: string | null;
  org: string | null;
  description: string | null;  // 合并参考语言(metadata.description)
  contentEntityId: string | null;
  bridged: boolean;           // 是否已桥接到 content_entities
  personKind: string | null;  // 分类：person|role|topic|section|metadata|placeholder|unclear
  workspaceId: string | null;
  createdAt: string;
}

export interface PeopleRosterResult {
  items: PeopleRosterRow[];
  total: number; // 满足过滤条件的真实总数（不受 limit 截断）
}

export interface PersonMeeting {
  id: string;
  title: string;
  date: string | null;
}

// 组装 WHERE：名字/别名模糊 + 默认排除硬 junk(is_person=false) + 可选 person_kind 精确过滤
function buildWhere(qParam: string, kindParam: string | null, includeJunk: boolean): string {
  const parts = [
    `(${qParam}::text IS NULL
      OR canonical_name ILIKE '%' || ${qParam} || '%'
      OR EXISTS (SELECT 1 FROM unnest(aliases) a WHERE a ILIKE '%' || ${qParam} || '%'))`,
  ];
  if (!includeJunk) parts.push(`(metadata->>'is_person') IS DISTINCT FROM 'false'`);
  if (kindParam) parts.push(`metadata->>'person_kind' = ${kindParam}`);
  return parts.join(' AND ');
}

export async function listPeopleRoster(
  db: Db,
  opts?: { limit?: number; offset?: number; q?: string; kind?: string; includeJunk?: boolean },
): Promise<PeopleRosterResult> {
  const limit = Math.min(2000, Math.max(1, opts?.limit ?? 50));
  const offset = Math.max(0, opts?.offset ?? 0);
  const q = opts?.q && opts.q.trim() ? opts.q.trim() : null;
  const kind = opts?.kind && opts.kind.trim() ? opts.kind.trim() : null;
  const includeJunk = opts?.includeJunk === true;

  // list: $1=limit $2=offset $3=q [$4=kind]；count: $1=q [$2=kind]
  const listParams: any[] = [limit, offset, q];
  const countParams: any[] = [q];
  const listKindP = kind ? (listParams.push(kind), '$4') : null;
  const countKindP = kind ? (countParams.push(kind), '$2') : null;

  const [listRes, countRes] = await Promise.all([
    db.query(
      `SELECT id, canonical_name, aliases, role, org, content_entity_id,
              metadata->>'description' AS description,
              metadata->>'person_kind' AS person_kind, workspace_id, created_at
         FROM mn_people
        WHERE ${buildWhere('$3', listKindP, includeJunk)}
        ORDER BY canonical_name ASC
        LIMIT $1 OFFSET $2`,
      listParams,
    ),
    db.query(`SELECT count(*)::int AS total FROM mn_people WHERE ${buildWhere('$1', countKindP, includeJunk)}`, countParams),
  ]);

  const items = (listRes.rows ?? []).map((r: any) => ({
    id: String(r.id),
    canonicalName: String(r.canonical_name),
    aliases: Array.isArray(r.aliases) ? r.aliases : [],
    role: r.role ?? null,
    org: r.org ?? null,
    description: r.description ?? null,
    contentEntityId: r.content_entity_id ?? null,
    bridged: r.content_entity_id != null,
    personKind: r.person_kind ?? null,
    workspaceId: r.workspace_id ?? null,
    createdAt: String(r.created_at),
  }));
  return { items, total: Number(countRes.rows?.[0]?.total ?? items.length) };
}

/**
 * 某人物出现过的会议（去重）+ 会议标题/日期，供花名册展开看"会议场次名 + 会议链接"。
 * UNION 所有含 (person_col, meeting_id) 的事实表 + mn_people.first_seen_meeting_id。
 * 注：单场会议里此人被称呼的具体别名未落库(仅 aliases 集合)，精确 alias↔meeting 需重解析 transcript。
 */
export async function getPersonMeetings(db: Db, personId: string): Promise<PersonMeeting[]> {
  const res = await db.query(
    `WITH mtgs AS (
       SELECT meeting_id::text AS mid FROM mn_commitments            WHERE person_id            = $1
       UNION SELECT meeting_id::text FROM mn_role_trajectory_points   WHERE person_id            = $1
       UNION SELECT meeting_id::text FROM mn_speech_quality           WHERE person_id            = $1
       UNION SELECT meeting_id::text FROM mn_silence_signals          WHERE person_id            = $1
       UNION SELECT meeting_id::text FROM mn_focus_map                WHERE person_id            = $1
       UNION SELECT meeting_id::text FROM mn_decisions                WHERE proposer_person_id   = $1
       UNION SELECT meeting_id::text FROM mn_assumptions              WHERE verifier_person_id   = $1
       UNION SELECT meeting_id::text FROM mn_cognitive_biases         WHERE by_person_id         = $1
       UNION SELECT meeting_id::text FROM mn_counterfactuals          WHERE rejected_by_person_id = $1
       UNION SELECT meeting_id::text FROM mn_mental_model_invocations WHERE invoked_by_person_id = $1
       UNION SELECT first_raised_meeting_id::text FROM mn_open_questions WHERE owner_person_id = $1
       UNION SELECT last_raised_meeting_id::text  FROM mn_open_questions WHERE owner_person_id = $1
       UNION SELECT first_seen_meeting_id::text   FROM mn_people         WHERE id = $1
       -- 本场绑定(泛指参会人识别成该人):assets.metadata.participantOverrides 里 value 命中 personId
       UNION SELECT a2.id::text FROM assets a2
              WHERE a2.metadata ? 'participantOverrides'
                AND EXISTS (SELECT 1 FROM jsonb_each_text(a2.metadata->'participantOverrides') e WHERE e.value = $1::text)
     )
     SELECT m.mid AS id,
            COALESCE(NULLIF(trim(a.title), ''), NULLIF(trim(a.metadata->>'title'), ''), '未命名会议') AS title,
            a.created_at
       FROM mtgs m
       LEFT JOIN assets a ON a.id::text = m.mid
      WHERE m.mid IS NOT NULL
      ORDER BY a.created_at DESC NULLS LAST`,
    [personId],
  );
  return (res.rows ?? []).map((r: any) => ({
    id: String(r.id),
    title: String(r.title),
    date: r.created_at ? String(r.created_at) : null,
  }));
}
