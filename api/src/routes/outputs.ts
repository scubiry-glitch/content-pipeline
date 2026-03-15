// 产出物路由
// 支持: 获取内容、下载文件

import { FastifyInstance } from 'fastify';
import { OutputService } from '../services/output.js';
import { authenticate } from '../middleware/auth.js';

export async function outputRoutes(fastify: FastifyInstance) {
  const outputService = new OutputService();

  // Get output content
  fastify.get('/:outputId', { preHandler: authenticate }, async (request, reply) => {
    const { outputId } = request.params as any;
    const output = await outputService.getById(outputId);

    if (!output) {
      reply.status(404);
      return { error: 'Output not found', code: 'OUTPUT_NOT_FOUND' };
    }

    return output;
  });

  // Download output as file
  fastify.get('/:outputId/download', { preHandler: authenticate }, async (request, reply) => {
    const { outputId } = request.params as any;
    const { content, filename, contentType } = await outputService.download(outputId);

    reply.header('Content-Type', contentType);
    reply.header('Content-Disposition', `attachment; filename="${filename}"`);
    return content;
  });
}
