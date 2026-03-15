// 素材库路由
// 支持: 上传素材、语义搜索、标签过滤

import { FastifyInstance } from 'fastify';
import { AssetService } from '../services/asset.js';
import { authenticate } from '../middleware/auth.js';

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
        tags: fields.tags ? fields.tags.split(',').map((t: string) => t.trim()) : []
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
    const { q, tags, limit = '10' } = request.query as any;

    return await assetService.search({
      query: q,
      tags: tags ? tags.split(',') : undefined,
      limit: parseInt(limit)
    });
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
}
