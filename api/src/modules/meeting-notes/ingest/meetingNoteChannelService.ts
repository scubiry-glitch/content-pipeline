// v7.6 会议纪要采集渠道 - MeetingNoteChannelService
// 与 api/src/routes/rss.ts + assetService.ts 同形的上游采集服务。
// 负责：
//   1. meeting_note_sources CRUD
//   2. 按 kind 分发到 adapter，拉草稿
//   3. 去重（source_id × external_id）后调用 assetService.createAsset
//   4. meeting_note_imports 作业审计（pending→running→succeeded/partial/failed）

import { query as defaultQuery } from '../../../db/connection.js';
import { AssetService } from '../../../services/assetService.js';
import { classifyMeeting } from './meetingClassifier.js';
import type {
  Asset,
  CreateAssetDTO,
  ImportedMeetingNoteDraft,
  MeetingNoteImport,
  MeetingNoteImportStatus,
  MeetingNoteSource,
  MeetingNoteSourceKind,
} from '../../../services/assetService.js';

const VALID_KINDS: readonly MeetingNoteSourceKind[] = [
  'lark', 'zoom', 'teams', 'upload', 'folder', 'manual',
] as const;

/** Adapter 契约：按 source 配置拉一批草稿。失败时抛错，由 service 捕获成 failed job。 */
export interface MeetingNoteAdapter {
  fetchDrafts(source: MeetingNoteSource): Promise<ImportedMeetingNoteDraft[]>;
}

export interface MeetingNoteChannelDeps {
  query?: typeof defaultQuery;
  createAsset?: (dto: CreateAssetDTO) => Promise<Asset>;
  adapters?: Partial<Record<MeetingNoteSourceKind, MeetingNoteAdapter>>;
  /** Fired after createSource/updateSource/deleteSource so the scheduler can re-sync. */
  onSourceChanged?: () => void | Promise<void>;
}

export interface ListSourceFilters {
  kind?: MeetingNoteSourceKind;
  isActive?: boolean;
  workspaceId?: string;
}

export interface CreateSourceInput {
  name: string;
  kind: MeetingNoteSourceKind;
  config: Record<string, any>;
  isActive?: boolean;
  scheduleCron?: string | null;
  createdBy?: string | null;
  workspaceId?: string;
}

export interface UpdateSourceInput {
  name?: string;
  config?: Record<string, any>;
  isActive?: boolean;
  scheduleCron?: string | null;
}

function mapSourceRow(row: Record<string, any>): MeetingNoteSource {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    config: row.config ?? {},
    isActive: row.is_active,
    scheduleCron: row.schedule_cron,
    lastImportedAt: row.last_imported_at,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapImportRow(row: Record<string, any>): MeetingNoteImport {
  return {
    id: row.id,
    sourceId: row.source_id,
    status: row.status,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    itemsDiscovered: row.items_discovered ?? 0,
    itemsImported: row.items_imported ?? 0,
    duplicates: row.duplicates ?? 0,
    errors: row.errors ?? 0,
    errorMessage: row.error_message,
    assetIds: row.asset_ids ?? [],
    triggeredBy: row.triggered_by,
  };
}

export class MeetingNoteChannelService {
  private query: typeof defaultQuery;
  private createAsset: (dto: CreateAssetDTO) => Promise<Asset>;
  private adapters: Partial<Record<MeetingNoteSourceKind, MeetingNoteAdapter>>;
  private onSourceChanged: (() => void | Promise<void>) | undefined;

  constructor(deps: MeetingNoteChannelDeps = {}) {
    this.query = deps.query ?? defaultQuery;
    this.adapters = deps.adapters ?? {};
    this.onSourceChanged = deps.onSourceChanged;
    if (deps.createAsset) {
      this.createAsset = deps.createAsset;
    } else {
      const svc = new AssetService();
      this.createAsset = (dto) => svc.createAsset(dto);
    }
  }

  /** Late-bind the scheduler callback (server.ts wires this post-construction). */
  setOnSourceChanged(cb: () => void | Promise<void>): void {
    this.onSourceChanged = cb;
  }

  private async fireChanged(): Promise<void> {
    if (!this.onSourceChanged) return;
    try { await this.onSourceChanged(); }
    catch (err) {
      console.warn('[MeetingNoteChannel] onSourceChanged failed:', (err as Error).message);
    }
  }

  // ========= CRUD =========

  async listSources(filter: ListSourceFilters = {}): Promise<MeetingNoteSource[]> {
    const where: string[] = [];
    const params: any[] = [];
    if (filter.workspaceId) {
      params.push(filter.workspaceId);
      where.push(`(workspace_id = $${params.length} OR workspace_id IN (SELECT id FROM workspaces WHERE is_shared))`);
    }
    if (filter.kind) {
      params.push(filter.kind);
      where.push(`kind = $${params.length}`);
    }
    if (filter.isActive !== undefined) {
      params.push(filter.isActive);
      where.push(`is_active = $${params.length}`);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const result = await this.query(
      `SELECT * FROM meeting_note_sources ${whereSql} ORDER BY created_at DESC`,
      params,
    );
    return result.rows.map(mapSourceRow);
  }

  async getSource(id: string): Promise<MeetingNoteSource | null> {
    const result = await this.query(
      `SELECT * FROM meeting_note_sources WHERE id = $1`,
      [id],
    );
    return result.rows[0] ? mapSourceRow(result.rows[0]) : null;
  }

  async createSource(input: CreateSourceInput): Promise<MeetingNoteSource> {
    if (!VALID_KINDS.includes(input.kind)) {
      throw new Error(`Unsupported source kind: ${input.kind}`);
    }
    // workspace_id 显式传入；不传时由表的 DEFAULT (default workspace) 兜底
    const result = input.workspaceId
      ? await this.query(
          `INSERT INTO meeting_note_sources
             (name, kind, config, is_active, schedule_cron, created_by, workspace_id)
           VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7)
           RETURNING *`,
          [
            input.name,
            input.kind,
            JSON.stringify(input.config ?? {}),
            input.isActive ?? true,
            input.scheduleCron ?? null,
            input.createdBy ?? null,
            input.workspaceId,
          ],
        )
      : await this.query(
          `INSERT INTO meeting_note_sources
             (name, kind, config, is_active, schedule_cron, created_by)
           VALUES ($1, $2, $3::jsonb, $4, $5, $6)
           RETURNING *`,
          [
            input.name,
            input.kind,
            JSON.stringify(input.config ?? {}),
            input.isActive ?? true,
            input.scheduleCron ?? null,
            input.createdBy ?? null,
          ],
        );
    const created = mapSourceRow(result.rows[0]);
    await this.fireChanged();
    return created;
  }

  async updateSource(id: string, patch: UpdateSourceInput): Promise<MeetingNoteSource | null> {
    const sets: string[] = [];
    const params: any[] = [];
    if (patch.name !== undefined) {
      params.push(patch.name);
      sets.push(`name = $${params.length}`);
    }
    if (patch.config !== undefined) {
      params.push(JSON.stringify(patch.config));
      sets.push(`config = $${params.length}::jsonb`);
    }
    if (patch.isActive !== undefined) {
      params.push(patch.isActive);
      sets.push(`is_active = $${params.length}`);
    }
    if (patch.scheduleCron !== undefined) {
      params.push(patch.scheduleCron);
      sets.push(`schedule_cron = $${params.length}`);
    }
    if (sets.length === 0) {
      return this.getSource(id);
    }
    params.push(id);
    const result = await this.query(
      `UPDATE meeting_note_sources SET ${sets.join(', ')}
       WHERE id = $${params.length}
       RETURNING *`,
      params,
    );
    const updated = result.rows[0] ? mapSourceRow(result.rows[0]) : null;
    if (updated) await this.fireChanged();
    return updated;
  }

  async deleteSource(id: string): Promise<boolean> {
    const result = await this.query(
      `DELETE FROM meeting_note_sources WHERE id = $1`,
      [id],
    );
    const deleted = (result.rowCount ?? 0) > 0;
    if (deleted) await this.fireChanged();
    return deleted;
  }

  // ========= Import pipeline =========

  async runImport(
    sourceId: string,
    triggeredBy: string = 'manual',
  ): Promise<MeetingNoteImport> {
    const source = await this.getSource(sourceId);
    if (!source) {
      throw new Error(`Meeting-note source not found: ${sourceId}`);
    }

    // 1. Insert a pending job
    const jobResult = await this.query(
      `INSERT INTO meeting_note_imports (source_id, status, triggered_by)
       VALUES ($1, 'pending', $2)
       RETURNING id, started_at`,
      [sourceId, triggeredBy],
    );
    const jobId = jobResult.rows[0].id;

    // 2. Fetch drafts via adapter (stub adapters return [])
    let drafts: ImportedMeetingNoteDraft[] = [];
    let fetchError: Error | null = null;
    try {
      const adapter = this.adapters[source.kind];
      drafts = adapter ? await adapter.fetchDrafts(source) : [];
    } catch (err) {
      fetchError = err instanceof Error ? err : new Error(String(err));
    }

    // 3. If fetch blew up, mark failed and bail
    if (fetchError) {
      await this.query(
        `UPDATE meeting_note_imports
           SET status = 'failed',
               finished_at = NOW(),
               error_message = $2,
               errors = 1
         WHERE id = $1`,
        [jobId, fetchError.message],
      );
      await this.query(
        `UPDATE meeting_note_sources SET last_imported_at = NOW() WHERE id = $1`,
        [sourceId],
      );
      return {
        id: jobId,
        sourceId,
        status: 'failed',
        startedAt: jobResult.rows[0].started_at,
        finishedAt: new Date(),
        itemsDiscovered: 0,
        itemsImported: 0,
        duplicates: 0,
        errors: 1,
        errorMessage: fetchError.message,
        assetIds: [],
        triggeredBy,
      };
    }

    // 4. Process drafts: dedup → createAsset → accumulate
    const assetIds: string[] = [];
    let imported = 0;
    let duplicates = 0;
    let errors = 0;
    const errorMessages: string[] = [];

    for (const draft of drafts) {
      try {
        const dup = await this.query(
          `SELECT id FROM assets
           WHERE source_id = $1
             AND metadata->>'external_id' = $2
           LIMIT 1`,
          [sourceId, draft.externalId],
        );
        if (dup.rows.length > 0) {
          const existingId = String(dup.rows[0].id || '');
          if (existingId) assetIds.push(existingId);
          duplicates += 1;
          continue;
        }
        // meeting_kind 优先级：draft 显式传入 > classifier 自动识别
        const meetingKind = draft.metadata?.meeting_kind
          ?? classifyMeeting(draft.title, draft.content).kind;
        const asset = await this.createAsset({
          type: 'meeting_minutes',
          title: draft.title,
          content: draft.content,
          source: source.name,
          sourceId,
          domain: draft.domain,
          metadata: {
            ...(draft.metadata || {}),
            external_id: draft.externalId,
            meeting_kind: meetingKind,
            occurred_at: draft.occurredAt?.toISOString(),
            participants: draft.participants,
            import_job_id: jobId,
          },
        });
        assetIds.push(asset.id);
        imported += 1;
      } catch (err) {
        errors += 1;
        errorMessages.push(err instanceof Error ? err.message : String(err));
      }
    }

    // 5. Finalize job status
    let status: MeetingNoteImportStatus;
    if (errors > 0 && imported > 0) status = 'partial';
    else if (errors > 0 && imported === 0) status = 'failed';
    else status = 'succeeded';

    await this.query(
      `UPDATE meeting_note_imports
         SET status = $2,
             finished_at = NOW(),
             items_discovered = $3,
             items_imported   = $4,
             duplicates       = $5,
             errors           = $6,
             error_message    = $7,
             asset_ids        = $8::uuid[]
       WHERE id = $1`,
      [
        jobId,
        status,
        drafts.length,
        imported,
        duplicates,
        errors,
        errorMessages.join('\n') || null,
        assetIds,
      ],
    );
    await this.query(
      `UPDATE meeting_note_sources SET last_imported_at = NOW() WHERE id = $1`,
      [sourceId],
    );

    return {
      id: jobId,
      sourceId,
      status,
      startedAt: jobResult.rows[0].started_at,
      finishedAt: new Date(),
      itemsDiscovered: drafts.length,
      itemsImported: imported,
      duplicates,
      errors,
      errorMessage: errorMessages.join('\n') || null,
      assetIds,
      triggeredBy,
    };
  }

  // ========= History / progress =========

  async getHistory(sourceId?: string, limit = 50): Promise<MeetingNoteImport[]> {
    const where = sourceId ? `WHERE source_id = $1` : '';
    const params = sourceId ? [sourceId, limit] : [limit];
    const limitIdx = sourceId ? 2 : 1;
    try {
      const result = await this.query(
        `SELECT * FROM meeting_note_imports ${where}
         ORDER BY started_at DESC LIMIT $${limitIdx}`,
        params,
      );
      return result.rows.map(mapImportRow);
    } catch (err: any) {
      const msg = (err?.message || '').toLowerCase();
      if (
        msg.includes('connection terminated') ||
        msg.includes('connection timeout') ||
        msg.includes('timeout exceeded') ||
        msg.includes('connect econnrefused') ||
        msg.includes('connect etimedout')
      ) {
        return [];
      }
      throw err;
    }
  }

  async getActiveJobs(): Promise<MeetingNoteImport[]> {
    const result = await this.query(
      `SELECT * FROM meeting_note_imports
        WHERE status IN ('pending','running')
        ORDER BY started_at DESC`,
      [],
    );
    return result.rows.map(mapImportRow);
  }
}
