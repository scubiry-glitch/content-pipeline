// v3.4 素材路由 - 素材库
import { FastifyInstance } from 'fastify';
import { assetService } from '../services/assetService.js';
import { authenticate } from '../middleware/auth.js';
import { assertRowInWorkspace, currentWorkspaceId } from '../db/repos/withWorkspace.js';

export async function v34AssetRoutes(fastify: FastifyInstance) {
  // Workspace 守卫 :id 跨 ws 一律 404
  fastify.addHook('preHandler', async (request, reply) => {
    const params = (request.params as Record<string, string> | undefined) ?? {};
    const id = params.id;
    if (!id) return;
    if (!request.auth) {
      await authenticate(request, reply);
      if (reply.sent) return;
    }
    const wsId = currentWorkspaceId(request);
    if (!wsId) return;
    const ok = await assertRowInWorkspace('assets', 'id', id, wsId);
    if (!ok) {
      reply.code(404).send({ error: 'Asset not found' });
    }
  });

  // 获取素材列表
  fastify.get('/', { preHandler: authenticate }, async (request) => {
    const { type, sourceId, search, page, limit } = request.query as any;

    const result = await assetService.getAssets({
      type,
      sourceId,
      search,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 20,
      workspaceId: currentWorkspaceId(request) ?? undefined,
    });

    return result;
  });

  // 获取素材详情
  fastify.get('/:id', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as any;
    const asset = await assetService.getAsset(id);

    if (!asset) {
      reply.status(404);
      return { error: 'Asset not found' };
    }

    return asset;
  });

  // 创建素材
  fastify.post('/', { preHandler: authenticate }, async (request, reply) => {
    const createData = request.body as any;

    try {
      const asset = await assetService.createAsset({
        ...createData,
        workspaceId: currentWorkspaceId(request) ?? undefined,
      });
      reply.status(201);
      return asset;
    } catch (error) {
      reply.status(400);
      return { error: (error as Error).message };
    }
  });

  // 从研报提取素材
  fastify.post('/extract', { preHandler: authenticate }, async (request, reply) => {
    const { reportId, selections } = request.body as any;

    if (!reportId || !selections || !Array.isArray(selections)) {
      reply.status(400);
      return { error: 'Invalid request data' };
    }

    try {
      const assets = await assetService.extractFromReport(reportId, selections);
      return { items: assets };
    } catch (error) {
      reply.status(400);
      return { error: (error as Error).message };
    }
  });

  // 一键引用素材
  fastify.post('/:id/quote', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as any;

    try {
      const result = await assetService.quickQuote(id);
      return result;
    } catch (error) {
      reply.status(404);
      return { error: (error as Error).message };
    }
  });

  // 更新素材
  fastify.put('/:id', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as any;
    const updateData = request.body as any;

    const asset = await assetService.updateAsset(id, updateData);
    if (!asset) {
      reply.status(404);
      return { error: 'Asset not found' };
    }

    return asset;
  });

  // 删除素材
  fastify.delete('/:id', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as any;
    const success = await assetService.deleteAsset(id);

    if (!success) {
      reply.status(404);
      return { error: 'Asset not found' };
    }

    return { success: true };
  });
}
