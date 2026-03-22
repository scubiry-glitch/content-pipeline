// 流式大纲生成路由 - Streaming Outline Routes
// API endpoints for streaming outline generation in Stage1

import { FastifyInstance } from 'fastify';
import { getStreamingOutlineService, StreamingOutlineConfig, OutlineProgress } from '../services/streamingOutline.js';

// 懒加载服务实例，避免在模块导入时初始化
let streamingService: ReturnType<typeof getStreamingOutlineService> | null = null;
function getService() {
  if (!streamingService) {
    streamingService = getStreamingOutlineService();
  }
  return streamingService;
}

// ===== Schema Definitions =====

const outlineSectionSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    title: { type: 'string' },
    level: { type: 'number' },
    content: { type: 'string' },
    subsections: {
      type: 'array',
      items: { type: 'object' },
    },
  },
};

const outlineLayerSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    name: { type: 'string', enum: ['macro', 'meso', 'micro'] },
    title: { type: 'string' },
    sections: { type: 'array', items: outlineSectionSchema },
    status: { type: 'string', enum: ['pending', 'generating', 'completed', 'error'] },
    generatedAt: { type: 'string', format: 'date-time' },
  },
};

const outlineProgressSchema = {
  type: 'object',
  properties: {
    currentLayer: { type: 'string' },
    layerProgress: {
      type: 'object',
      properties: {
        macro: { type: 'number' },
        meso: { type: 'number' },
        micro: { type: 'number' },
      },
    },
    status: { type: 'string', enum: ['pending', 'processing', 'completed', 'error'] },
    layers: { type: 'array', items: outlineLayerSchema },
    accumulatedOutline: { type: 'array', items: outlineSectionSchema },
  },
};

// ===== Routes =====

export default async function streamingOutlineRoutes(fastify: FastifyInstance) {

  // POST /api/v1/planning/stream - 流式生成大纲 (WebSocket/SSE)
  fastify.post('/stream', {
    schema: {
      description: '流式生成大纲 - 分层递进生成，支持实时进度推送',
      tags: ['Planning', 'Streaming'],
      body: {
        type: 'object',
        properties: {
          taskId: { type: 'string', description: '任务ID' },
          topic: { type: 'string', description: '研究主题' },
          context: { type: 'string', description: '背景信息' },
          targetAudience: { type: 'string', description: '目标受众' },
          desiredDepth: { type: 'string', enum: ['macro', 'meso', 'micro', 'comprehensive'] },
          comments: { type: 'array', items: { type: 'string' } },
          options: {
            type: 'object',
            properties: {
              enableStreaming: { type: 'boolean', default: true },
              saveProgress: { type: 'boolean', default: true },
            },
          },
        },
        required: ['taskId', 'topic'],
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            outlineId: { type: 'string' },
            outline: { type: 'array', items: outlineSectionSchema },
            layers: { type: 'array', items: outlineLayerSchema },
            insights: { type: 'array' },
            novelAngles: { type: 'array' },
            dataRequirements: { type: 'array' },
          },
        },
      },
    },
  }, async (request, reply) => {
    const config = request.body as StreamingOutlineConfig;

    try {
      // 收集所有进度更新
      const progressUpdates: OutlineProgress[] = [];
      
      const result = await getService().generateOutlineStreaming(
        config,
        (progress) => {
          progressUpdates.push(progress);
          // 可以在这里添加 WebSocket/SSE 推送逻辑
          console.log(`[StreamingOutline] Progress: ${progress.currentLayer} - ${progress.status}`);
        }
      );

      return {
        success: true,
        outlineId: result.outlineId,
        outline: result.outline,
        layers: result.layers,
        insights: result.insights,
        novelAngles: result.novelAngles,
        dataRequirements: result.dataRequirements,
      };
    } catch (error) {
      reply.status(500);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Outline generation failed',
      };
    }
  });

  // POST /api/v1/planning/stream/sse - SSE 流式生成
  fastify.post('/stream/sse', {
    schema: {
      description: '使用 SSE (Server-Sent Events) 流式生成大纲',
      tags: ['Planning', 'Streaming'],
      body: {
        type: 'object',
        properties: {
          taskId: { type: 'string' },
          topic: { type: 'string' },
          context: { type: 'string' },
          targetAudience: { type: 'string' },
          desiredDepth: { type: 'string' },
          comments: { type: 'array', items: { type: 'string' } },
        },
        required: ['taskId', 'topic'],
      },
    },
  }, async (request, reply) => {
    const config = request.body as StreamingOutlineConfig;

    // 设置 SSE 头
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    try {
      await getService().generateOutlineStreaming(
        config,
        (progress) => {
          // 发送 SSE 事件
          reply.raw.write(`data: ${JSON.stringify({
            type: 'progress',
            data: progress,
          })}\n\n`);
        }
      );

      // 发送完成事件
      reply.raw.write(`data: ${JSON.stringify({
        type: 'completed',
      })}\n\n`);
      
      reply.raw.end();
    } catch (error) {
      // 发送错误事件
      reply.raw.write(`data: ${JSON.stringify({
        type: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
      })}\n\n`);
      reply.raw.end();
    }
  });

  // GET /api/v1/planning/stream/progress/:taskId - 查询生成进度
  fastify.get('/stream/progress/:taskId', {
    schema: {
      description: '查询大纲生成进度',
      tags: ['Planning', 'Streaming'],
      params: {
        type: 'object',
        properties: {
          taskId: { type: 'string' },
        },
        required: ['taskId'],
      },
      response: {
        200: {
          type: 'object',
          properties: {
            progress: outlineProgressSchema,
          },
        },
      },
    },
  }, async (request, reply) => {
    const { taskId } = request.params as { taskId: string };

    const progress = await getService().getOutlineProgress(taskId);

    if (!progress) {
      reply.status(404);
      return { error: 'No progress found for this task' };
    }

    return { progress };
  });

  // GET /api/v1/planning/stream/versions/:taskId - 获取大纲版本历史
  fastify.get('/stream/versions/:taskId', {
    schema: {
      description: '获取大纲版本历史',
      tags: ['Planning', 'Streaming'],
      params: {
        type: 'object',
        properties: {
          taskId: { type: 'string' },
        },
        required: ['taskId'],
      },
      response: {
        200: {
          type: 'object',
          properties: {
            versions: { type: 'array', items: { type: 'object' } },
          },
        },
      },
    },
  }, async (request) => {
    const { taskId } = request.params as { taskId: string };

    const versions = await getService().getOutlineVersions(taskId);

    return { versions };
  });

  // POST /api/v1/planning/stream/layer - 单独生成某一层
  fastify.post('/stream/layer', {
    schema: {
      description: '单独生成大纲的某一层（用于部分更新）',
      tags: ['Planning', 'Streaming'],
      body: {
        type: 'object',
        properties: {
          taskId: { type: 'string' },
          topic: { type: 'string' },
          layer: { type: 'string', enum: ['macro', 'meso', 'micro'] },
          context: { type: 'string' },
          previousLayers: { type: 'array' },
          comments: { type: 'array', items: { type: 'string' } },
        },
        required: ['taskId', 'topic', 'layer'],
      },
    },
  }, async (request, reply) => {
    // 这里可以实现单独生成某一层的逻辑
    // 用于用户只想要更新某一层的情况
    reply.status(501);
    return { error: 'Not implemented yet' };
  });
}
