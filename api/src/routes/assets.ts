// 素材库路由
// 支持: 上传素材、语义搜索、标签过滤、编辑、置顶、主题分类、目录绑定

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AssetService } from '../services/asset.js';
import { authenticate } from '../middleware/auth.js';
import { query } from '../db/connection.js';
import { getDirectoryWatcherService } from '../services/directoryWatcher.js';
import { v4 as uuidv4 } from 'uuid';

const ASSET_TYPES = [
  'file','report','quote','data','rss_item',
  'chart','insight',
  'meeting_minutes','briefing','interview','transcript'
] as const;

const updateAssetSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  source: z.string().max(255).optional(),
  tags: z.array(z.string()).optional(),
  content: z.string().optional(),
  theme_id: z.string().nullable().optional(),
  domain: z.string().max(100).nullable().optional(),
  taxonomy_code: z.string().max(20).nullable().optional(),
  asset_type: z.enum(ASSET_TYPES).optional()
});

const createThemeSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  color: z.string().optional(),
  icon: z.string().optional(),
  domain: z.string().max(100).optional(),
  taxonomy_code: z.string().max(20).optional()
});

const deduplicateSchema = z.object({
  mode: z.enum(['dry-run', 'apply']).default('dry-run'),
  limit: z.number().int().min(1).max(10000).optional(),
  includeHidden: z.boolean().optional()
});

export async function assetRoutes(fastify: FastifyInstance) {
  const assetService = new AssetService();

  // Upload asset
  fastify.post('/', { preHandler: authenticate }, async (request, reply) => {
    try {
      const data = await request.file();

      if (!data) {
        reply.status(400);
        return { error: 'No file uploaded', code: 'NO_FILE' };
      }

      const buffer = await data.toBuffer();

      // Get form fields from multipart
      const fields: Record<string, string> = {};
      // @ts-ignore - fastify-multipart types
      if (data.fields) {
        // @ts-ignore
        for (const [key, field] of Object.entries(data.fields)) {
          // @ts-ignore
          if (field && typeof field === 'object' && 'value' in field) {
            // @ts-ignore
            fields[key] = field.value;
          }
        }
      }

      console.log('[Assets] Uploading file:', data.filename, 'Fields:', fields);

      const asset = await assetService.upload({
        buffer,
        filename: data.filename,
        mimetype: data.mimetype,
        title: fields.title || data.filename.replace(/\.[^/.]+$/, ''),
        source: fields.source,
        tags: fields.tags ? fields.tags.split(',').map((t: string) => t.trim()) : [],
        domain: fields.domain,
        taxonomy_code: fields.taxonomy_code,
        asset_type: fields.asset_type || fields.type,
        theme_id: fields.theme_id
      });

      reply.status(201);
      return asset;
    } catch (error: any) {
      console.error('[Assets] Upload failed:', error);
      reply.status(500);
      return { error: 'Upload failed', message: error?.message || 'Unknown error' };
    }
  });

  // Search assets
  fastify.get('/', { preHandler: authenticate }, async (request) => {
    const { q, tags, limit = '10', offset = '0', domain, taxonomy_code, type, asset_type } = request.query as any;

    return await assetService.search({
      query: q,
      tags: tags ? tags.split(',') : undefined,
      limit: parseInt(limit),
      offset: parseInt(offset),
      domain: domain || undefined,
      taxonomy_code: taxonomy_code || undefined,
      asset_type: asset_type || type || undefined
    });
  });

  // Search assets (alias for frontend compatibility)
  fastify.get('/search', { preHandler: authenticate }, async (request) => {
    const { q, tags, limit = '10', domain, taxonomy_code, type, asset_type } = request.query as any;

    return await assetService.search({
      query: q,
      tags: tags ? tags.split(',') : undefined,
      limit: parseInt(limit),
      domain: domain || undefined,
      taxonomy_code: taxonomy_code || undefined,
      asset_type: asset_type || type || undefined
    });
  });

  // Deduplicate assets (exact duplicate of normalized title + content)
  fastify.post('/deduplicate', { preHandler: authenticate }, async (request, reply) => {
    try {
      const body = deduplicateSchema.parse(request.body || {});
      return await assetService.deduplicateAssets(body);
    } catch (error: any) {
      reply.status(400);
      return { error: 'Invalid deduplicate request', message: error?.message || 'Unknown error' };
    }
  });

  // Get asset detail
  fastify.get('/:assetId', { preHandler: authenticate }, async (request, reply) => {
    const { assetId } = request.params as any;
    const asset = await assetService.getById(assetId);

    if (!asset) {
      reply.status(404);
      return { error: 'Asset not found', code: 'ASSET_NOT_FOUND' };
    }

    return asset;
  });

  // Delete asset
  fastify.delete('/:assetId', { preHandler: authenticate }, async (request, reply) => {
    const { assetId } = request.params as any;
    await assetService.delete(assetId);
    reply.status(204);
  });

  // Update asset
  fastify.patch('/:assetId', { preHandler: authenticate }, async (request, reply) => {
    const { assetId } = request.params as any;
    const body = updateAssetSchema.parse(request.body);

    const asset = await assetService.update(assetId, body);
    if (!asset) {
      reply.status(404);
      return { error: 'Asset not found', code: 'ASSET_NOT_FOUND' };
    }
    return asset;
  });

  // Toggle pin asset
  fastify.post('/:assetId/pin', { preHandler: authenticate }, async (request) => {
    const { assetId } = request.params as any;
    const { pinned } = request.body as { pinned: boolean };

    return await assetService.togglePin(assetId, pinned);
  });

  // Theme Routes

  // Create theme
  fastify.post('/themes', { preHandler: authenticate }, async (request) => {
    const body = createThemeSchema.parse(request.body);
    return await assetService.createTheme(body);
  });

  // Get all themes
  fastify.get('/themes', { preHandler: authenticate }, async () => {
    return await assetService.getThemes();
  });

  // Get assets by theme
  fastify.get('/themes/:themeId/assets', { preHandler: authenticate }, async (request) => {
    const { themeId } = request.params as any;
    const { limit = '20', offset = '0', includeHidden = 'false', includeDeleted = 'false' } = request.query as any;

    return await assetService.getAssetsByTheme(themeId, {
      limit: parseInt(limit),
      offset: parseInt(offset)
    }, {
      includeHidden: includeHidden === 'true',
      includeDeleted: includeDeleted === 'true'
    });
  });

  // Get uncategorized assets
  fastify.get('/uncategorized', { preHandler: authenticate }, async (request) => {
    const { limit = '20', offset = '0', includeHidden = 'false', includeDeleted = 'false' } = request.query as any;

    return await assetService.getAssetsByTheme(null, {
      limit: parseInt(limit),
      offset: parseInt(offset)
    }, {
      includeHidden: includeHidden === 'true',
      includeDeleted: includeDeleted === 'true'
    });
  });

  // Update theme
  fastify.patch('/themes/:themeId', { preHandler: authenticate }, async (request, reply) => {
    const { themeId } = request.params as any;
    const body = createThemeSchema.partial().parse(request.body);

    const theme = await assetService.updateTheme(themeId, body);
    if (!theme) {
      reply.status(404);
      return { error: 'Theme not found', code: 'THEME_NOT_FOUND' };
    }
    return theme;
  });

  // Toggle pin theme
  fastify.post('/themes/:themeId/pin', { preHandler: authenticate }, async (request) => {
    const { themeId } = request.params as any;
    const { pinned } = request.body as { pinned: boolean };

    return await assetService.toggleThemePin(themeId, pinned);
  });

  // Delete theme
  fastify.delete('/themes/:themeId', { preHandler: authenticate }, async (request, reply) => {
    const { themeId } = request.params as any;
    await assetService.deleteTheme(themeId);
    reply.status(204);
  });

  // Directory Binding Routes

  // Get all directory bindings
  fastify.get('/bindings', { preHandler: authenticate }, async () => {
    // batch-ops Step 1 局部生成: 加 tracked_count 让前端能显示"已 import N 文件"
    // 让用户一眼看出哪些 binding 有数据 / 哪些是空 (路径失效)
    const result = await query(
      `SELECT b.*, t.name as theme_name, t.icon as theme_icon, t.color as theme_color,
              COALESCE(tc.cnt, 0)::int AS tracked_count
       FROM asset_directory_bindings b
       LEFT JOIN asset_themes t ON b.theme_id = t.id
       LEFT JOIN (
         SELECT binding_id, COUNT(*) AS cnt
           FROM asset_tracked_files
          GROUP BY binding_id
       ) tc ON tc.binding_id = b.id
       ORDER BY b.created_at DESC`
    );
    return result.rows;
  });

  // Create directory binding
  fastify.post('/bindings', { preHandler: authenticate }, async (request, reply) => {
    const body = request.body as any;
    const bindingId = `binding_${uuidv4().slice(0, 8)}`;

    await query(
      `INSERT INTO asset_directory_bindings (
        id, name, path, theme_id, auto_import, include_subdirs, file_patterns, is_active, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())`,
      [
        bindingId,
        body.name,
        body.path,
        body.theme_id || null,
        body.auto_import !== false,
        body.include_subdirs !== false,
        JSON.stringify(body.file_patterns || ['*.pdf', '*.txt', '*.md', '*.docx', '*.doc']),
        body.is_active !== false
      ]
    );

    // Trigger initial scan
    const watcherService = getDirectoryWatcherService();
    await watcherService.triggerScan(bindingId);

    reply.status(201);
    return { id: bindingId, message: '目录绑定创建成功' };
  });

  // Get binding details
  fastify.get('/bindings/:bindingId', { preHandler: authenticate }, async (request, reply) => {
    const { bindingId } = request.params as any;

    const result = await query(
      `SELECT b.*, t.name as theme_name, t.icon as theme_icon, t.color as theme_color
       FROM asset_directory_bindings b
       LEFT JOIN asset_themes t ON b.theme_id = t.id
       WHERE b.id = $1`,
      [bindingId]
    );

    if (result.rows.length === 0) {
      reply.status(404);
      return { error: 'Binding not found', code: 'BINDING_NOT_FOUND' };
    }

    // Get tracked files count
    const countResult = await query(
      `SELECT COUNT(*) as file_count FROM asset_tracked_files WHERE binding_id = $1`,
      [bindingId]
    );

    return {
      ...result.rows[0],
      file_count: parseInt(countResult.rows[0].file_count)
    };
  });

  // Update directory binding
  fastify.patch('/bindings/:bindingId', { preHandler: authenticate }, async (request, reply) => {
    const { bindingId } = request.params as any;
    const body = request.body as any;

    const updates: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (body.name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      params.push(body.name);
    }
    if (body.path !== undefined) {
      updates.push(`path = $${paramIndex++}`);
      params.push(body.path);
    }
    if (body.theme_id !== undefined) {
      updates.push(`theme_id = $${paramIndex++}`);
      params.push(body.theme_id);
    }
    if (body.auto_import !== undefined) {
      updates.push(`auto_import = $${paramIndex++}`);
      params.push(body.auto_import);
    }
    if (body.include_subdirs !== undefined) {
      updates.push(`include_subdirs = $${paramIndex++}`);
      params.push(body.include_subdirs);
    }
    if (body.file_patterns !== undefined) {
      updates.push(`file_patterns = $${paramIndex++}`);
      params.push(JSON.stringify(body.file_patterns));
    }
    if (body.is_active !== undefined) {
      updates.push(`is_active = $${paramIndex++}`);
      params.push(body.is_active);
    }

    if (updates.length === 0) {
      reply.status(400);
      return { error: 'No fields to update' };
    }

    updates.push(`updated_at = NOW()`);
    params.push(bindingId);

    await query(
      `UPDATE asset_directory_bindings SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
      params
    );

    return { message: '绑定更新成功' };
  });

  // Delete directory binding
  fastify.delete('/bindings/:bindingId', { preHandler: authenticate }, async (request, reply) => {
    const { bindingId } = request.params as any;

    // Delete tracked files first
    await query(`DELETE FROM asset_tracked_files WHERE binding_id = $1`, [bindingId]);

    // Delete binding
    await query(`DELETE FROM asset_directory_bindings WHERE id = $1`, [bindingId]);

    reply.status(204);
  });

  // Trigger manual scan
  fastify.post('/bindings/:bindingId/scan', { preHandler: authenticate }, async (request, reply) => {
    const { bindingId } = request.params as any;
    // batch-ops Step 1 局部生成:
    // - sinceMtime: ISO 时间戳 / 'last_scan' 关键字 → 只扫 mtime > since 的文件，避免大目录全量 stat
    // - dryRun: 不真 import，只统计将命中的文件数（前端预估面板）
    const body = (request.body ?? {}) as {
      sinceMtime?: string;
      dryRun?: boolean;
    };

    try {
      const watcherService = getDirectoryWatcherService();
      const result = await watcherService.triggerScan(bindingId, {
        sinceMtime: body.sinceMtime,
        dryRun: body.dryRun === true,
      });

      return {
        message: result.dryRun ? '预估完成（未真扫描）' : '扫描完成',
        scanned: result.scanned,
        added: result.added,
        imported: result.imported,
        errors: result.errors,
        filtered: result.filtered,
        unchanged: result.unchanged,
        skipped: result.skipped,
        addedAssetIds: result.addedAssetIds ?? [],
        dryRun: result.dryRun ?? false,
      };
    } catch (error: any) {
      reply.status(500);
      return { error: '扫描失败', message: error.message };
    }
  });

  // Get tracked files for a binding
  fastify.get('/bindings/:bindingId/files', { preHandler: authenticate }, async (request) => {
    const { bindingId } = request.params as any;
    const { limit = '50', offset = '0' } = request.query as any;

    const result = await query(
      `SELECT tf.*, a.title as asset_title, a.content_type
       FROM asset_tracked_files tf
       LEFT JOIN assets a ON tf.asset_id = a.id
       WHERE tf.binding_id = $1
       ORDER BY tf.modified_at DESC
       LIMIT $2 OFFSET $3`,
      [bindingId, parseInt(limit), parseInt(offset)]
    );

    const countResult = await query(
      `SELECT COUNT(*) FROM asset_tracked_files WHERE binding_id = $1`,
      [bindingId]
    );

    return {
      total: parseInt(countResult.rows[0].count),
      items: result.rows
    };
  });

  // v3.0.2: 素材引用统计相关路由

  // 获取素材使用统计
  fastify.get('/:assetId/usage', { preHandler: authenticate }, async (request, reply) => {
    const { assetId } = request.params as any;

    const usageResult = await query(
      `SELECT
        a.id as asset_id,
        COUNT(DISTINCT aq.task_id) as quote_count,
        MAX(aq.created_at) as last_used_at,
        ARRAY_AGG(DISTINCT aq.task_id) FILTER (WHERE aq.task_id IS NOT NULL) as used_in_tasks
      FROM assets a
      LEFT JOIN asset_quotes aq ON a.id = aq.asset_id
      WHERE a.id = $1
      GROUP BY a.id`,
      [assetId]
    );

    if (usageResult.rows.length === 0) {
      reply.status(404);
      return { error: 'Asset not found', code: 'ASSET_NOT_FOUND' };
    }

    const usage = usageResult.rows[0];

    // 获取详细使用历史
    const historyResult = await query(
      `SELECT
        aq.task_id,
        p.topic as task_title,
        aq.created_at as used_at
      FROM asset_quotes aq
      LEFT JOIN production_tasks p ON aq.task_id = p.id
      WHERE aq.asset_id = $1
      ORDER BY aq.created_at DESC
      LIMIT 20`,
      [assetId]
    );

    return {
      assetId: usage.asset_id,
      quoteCount: parseInt(usage.quote_count) || 0,
      lastUsedAt: usage.last_used_at,
      usedInTasks: usage.used_in_tasks || [],
      usageHistory: historyResult.rows
    };
  });

  // 记录素材引用
  fastify.post('/:assetId/quote', { preHandler: authenticate }, async (request, reply) => {
    const { assetId } = request.params as any;
    const body = request.body as { taskId?: string } || {};
    const { taskId } = body;

    await query(
      `INSERT INTO asset_quotes (asset_id, task_id, created_at)
       VALUES ($1, $2, NOW())`,
      [assetId, taskId || null]
    );

    // 更新素材的引用计数
    await query(
      `UPDATE assets SET quote_count = quote_count + 1, last_quoted_at = NOW()
       WHERE id = $1`,
      [assetId]
    );

    return { success: true, message: '引用记录已保存' };
  });

  // 获取热门素材
  fastify.get('/popular', { preHandler: authenticate }, async (request) => {
    const { limit = '10' } = request.query as any;

    const result = await query(
      `SELECT
        a.*,
        COUNT(DISTINCT aq.task_id) as quote_count,
        MAX(aq.created_at) as last_used_at
      FROM assets a
      LEFT JOIN asset_quotes aq ON a.id = aq.asset_id
      GROUP BY a.id
      HAVING COUNT(DISTINCT aq.task_id) > 0
      ORDER BY quote_count DESC, last_used_at DESC
      LIMIT $1`,
      [parseInt(limit)]
    );

    return {
      items: result.rows.map(row => ({
        asset: row,
        quoteCount: parseInt(row.quote_count),
        lastUsedAt: row.last_used_at
      }))
    };
  });

  // v3.0.3: 智能标签补全相关路由

  // 自动标签建议
  fastify.post('/:assetId/auto-tag', { preHandler: authenticate }, async (request, reply) => {
    const { assetId } = request.params as any;

    const assetResult = await query(
      `SELECT title, content, source, tags FROM assets WHERE id = $1`,
      [assetId]
    );

    if (assetResult.rows.length === 0) {
      reply.status(404);
      return { error: 'Asset not found', code: 'ASSET_NOT_FOUND' };
    }

    const asset = assetResult.rows[0];
    const suggestedTags: string[] = [];

    // 从标题提取关键词
    const industryKeywords = [
      '新能源', '半导体', '人工智能', 'AI', '芯片', '电动车',
      '光伏', '储能', '电池', '医疗', '医药', '金融',
      '房地产', '消费', '零售', '制造', '科技', '互联网'
    ];

    const title = asset.title || '';
    industryKeywords.forEach(keyword => {
      if (title.toLowerCase().includes(keyword.toLowerCase())) {
        suggestedTags.push(keyword);
      }
    });

    // 提取年份
    const yearMatch = title.match(/20\d{2}/g);
    if (yearMatch) {
      suggestedTags.push(...yearMatch);
    }

    // 提取季度
    const quarterMatch = title.match(/Q[1-4]|第[一二三四]季度/g);
    if (quarterMatch) {
      suggestedTags.push(...quarterMatch);
    }

    // 添加来源标签
    if (asset.source && !suggestedTags.includes(asset.source)) {
      suggestedTags.push(asset.source);
    }

    return { suggestedTags: [...new Set(suggestedTags)] };
  });

  // 更新素材标签
  fastify.put('/:assetId/tags', { preHandler: authenticate }, async (request, reply) => {
    const { assetId } = request.params as any;
    const { tags } = request.body as { tags: string[] };

    const result = await query(
      `UPDATE assets SET tags = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [tags, assetId]
    );

    if (result.rows.length === 0) {
      reply.status(404);
      return { error: 'Asset not found', code: 'ASSET_NOT_FOUND' };
    }

    return result.rows[0];
  });
}
