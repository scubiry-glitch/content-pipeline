// Zep 可选增强模块 — 客户端初始化
// 设计原则: ZEP_API_KEY 环境变量存在时启用，不存在时所有调用静默跳过
// 零依赖: 不安装 @getzep/zep-cloud SDK, 直接用 fetch 调用 REST API

const ZEP_BASE_URL = process.env.ZEP_BASE_URL || 'https://api.getzep.com';
const ZEP_GRAPH_ID = process.env.ZEP_GRAPH_ID || 'default';

/** Zep 是否启用 */
export function isZepEnabled(): boolean {
  return !!process.env.ZEP_API_KEY;
}

/** 获取 API Key (调用前应先检查 isZepEnabled) */
function getApiKey(): string {
  return process.env.ZEP_API_KEY || '';
}

/** Zep REST API 通用请求 */
async function zepFetch(path: string, options: {
  method?: string;
  body?: any;
  params?: Record<string, string>;
} = {}): Promise<any> {
  if (!isZepEnabled()) return null;

  const url = new URL(path, ZEP_BASE_URL);
  if (options.params) {
    for (const [k, v] of Object.entries(options.params)) {
      url.searchParams.set(k, v);
    }
  }

  const res = await fetch(url.toString(), {
    method: options.method || 'GET',
    headers: {
      'Authorization': `Api-Key ${getApiKey()}`,   // Zep Cloud 用 Api-Key，不是 Bearer
      'Content-Type': 'application/json',
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.warn(`[Zep] ${options.method || 'GET'} ${path} → ${res.status}: ${text.slice(0, 200)}`);
    return null;
  }

  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return res.json();
  }
  return res.text();
}

// ============================================================
// User / Group 管理
// ============================================================

/** 确保 Zep 用户存在 (用于关联 graph) */
export async function ensureZepUser(userId: string, meta?: { firstName?: string }): Promise<boolean> {
  if (!isZepEnabled()) return false;
  try {
    const existing = await zepFetch(`/api/v2/users/${userId}`);
    if (existing) return true;
    await zepFetch('/api/v2/users', {
      method: 'POST',
      body: { user_id: userId, first_name: meta?.firstName || userId },
    });
    return true;
  } catch {
    return false;
  }
}

// ============================================================
// Graph API — Episode 写入
// ============================================================

export interface ZepEpisode {
  type: 'text' | 'json' | 'message';
  data: string;
  group_id?: string;
  user_id?: string;
  graph_id?: string;
}

/** 向 Zep Graph 添加 Episode (写入知识)
 *  正确端点: POST /api/v2/graph — user_id 放在 body 里
 *  （/api/v2/users/{id}/graph/episodes 不存在，返回 404）
 */
export async function addGraphEpisode(
  userId: string,
  episode: ZepEpisode
): Promise<any> {
  if (!isZepEnabled()) return null;
  return zepFetch('/api/v2/graph', {
    method: 'POST',
    // OpenZep self-host requires graph_id; Zep Cloud v2 ignores unknown/extra fields.
    body: { ...episode, user_id: userId, graph_id: episode.graph_id || ZEP_GRAPH_ID },
  });
}

/** 批量添加多条文本 Episode */
export async function addGraphEpisodes(
  userId: string,
  texts: string[]
): Promise<number> {
  if (!isZepEnabled()) return 0;
  let added = 0;
  for (const text of texts) {
    const result = await addGraphEpisode(userId, { type: 'text', data: text, user_id: userId });
    if (result) added++;
  }
  return added;
}

// ============================================================
// Graph API — 搜索
// ============================================================

export interface ZepGraphSearchOptions {
  query: string;
  userId: string;
  scope?: 'edges' | 'nodes';
  maxFacts?: number;
  reranker?: string;
}

export interface ZepSearchResult {
  facts?: Array<{
    uuid: string;
    name: string;
    fact: string;
    valid_at?: string;
    invalid_at?: string;
    created_at: string;
    source_node?: { uuid: string; name: string };
    target_node?: { uuid: string; name: string };
  }>;
  nodes?: Array<{
    uuid: string;
    name: string;
    summary?: string;
    labels?: string[];
  }>;
}

export interface ZepGraphNode {
  uuid: string;
  name: string;
  group_id?: string;
  summary?: string;
  labels?: string[];
}

export interface ZepGraphEdge {
  uuid: string;
  fact: string;
  source_node_uuid: string;
  target_node_uuid: string;
  valid_at?: string | null;
  invalid_at?: string | null;
}

/** 搜索 Zep Graph (语义 + 图遍历) */
export async function searchGraph(options: ZepGraphSearchOptions): Promise<ZepSearchResult | null> {
  if (!isZepEnabled()) return null;
  return zepFetch(`/api/v2/users/${options.userId}/graph/search`, {
    method: 'POST',
    body: {
      query: options.query,
      scope: options.scope || 'edges',
      max_facts: options.maxFacts || 10,
      reranker: options.reranker,
    },
  });
}

/** OpenZep: 列出指定图谱内节点 */
export async function listGraphNodes(limit = 100, uuidCursor?: string): Promise<ZepGraphNode[]> {
  if (!isZepEnabled()) return [];
  const result = await zepFetch(`/api/v2/graph/node/graph/${encodeURIComponent(ZEP_GRAPH_ID)}`, {
    method: 'POST',
    body: {
      limit,
      ...(uuidCursor ? { uuid_cursor: uuidCursor } : {}),
    },
  });
  return Array.isArray(result) ? result : [];
}

/** OpenZep: 获取单个节点详情 */
export async function getGraphNode(uuid: string): Promise<ZepGraphNode | null> {
  if (!isZepEnabled()) return null;
  return zepFetch(`/api/v2/graph/node/${encodeURIComponent(uuid)}`);
}

/** OpenZep: 获取节点关系边 */
export async function getGraphNodeEdges(uuid: string): Promise<ZepGraphEdge[]> {
  if (!isZepEnabled()) return [];
  const result = await zepFetch(`/api/v2/graph/node/${encodeURIComponent(uuid)}/entity-edges`, {
    params: { group_id: ZEP_GRAPH_ID },
  });
  return Array.isArray(result) ? result : [];
}

/** 搜索 Zep Graph 节点 (实体) */
export async function searchGraphNodes(userId: string, query: string, limit = 10): Promise<ZepSearchResult | null> {
  return searchGraph({ userId, query, scope: 'nodes', maxFacts: limit });
}

// ============================================================
// Graph API — 获取实体关系 (N 跳)
// ============================================================

/** 获取实体的直接关系 (edges) */
export async function getEntityEdges(userId: string, entityName: string, limit = 20): Promise<ZepSearchResult | null> {
  if (!isZepEnabled()) return null;
  return searchGraph({
    userId,
    query: entityName,
    scope: 'edges',
    maxFacts: limit,
    reranker: 'episode_mentions',
  });
}

// ============================================================
// Memory API — 上下文获取
// ============================================================

/** 获取 Zep Memory 上下文 (综合语义+图遍历+全文搜索) */
export async function getMemoryContext(userId: string, query: string): Promise<string | null> {
  if (!isZepEnabled()) return null;
  const result = await zepFetch(`/api/v2/users/${userId}/memory`, {
    method: 'POST',
    body: { query },
  });
  return result?.context || null;
}

console.log(`[Zep] Module loaded. Enabled: ${isZepEnabled()}`);
