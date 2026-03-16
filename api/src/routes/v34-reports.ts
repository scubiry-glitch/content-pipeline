// v3.4 研报路由 - 内容质量输入体系
import { FastifyInstance } from 'fastify';
import { reportService } from '../services/reportService.js';
import { authenticate } from '../middleware/auth.js';

export async function v34ReportRoutes(fastify: FastifyInstance) {
  // 获取研报列表
  fastify.get('/', { preHandler: authenticate }, async (request) => {
    const { page, limit, institution, minQuality, search } = request.query as any;

    const result = await reportService.getReports({
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 20,
      institution,
      minQuality: minQuality ? parseInt(minQuality) : undefined,
      search
    });

    return result;
  });

  // 获取研报详情
  fastify.get('/:id', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as any;
    const report = await reportService.getReport(id);

    if (!report) {
      reply.status(404);
      return { error: 'Report not found' };
    }

    return report;
  });

  // 上传研报
  fastify.post('/upload', { preHandler: authenticate }, async (request, reply) => {
    const data = await request.file();
    if (!data) {
      reply.status(400);
      return { error: 'No file uploaded' };
    }

    // 保存文件
    const { saveUploadFile } = await import('../services/fileStorage.js');
    const fileUrl = await saveUploadFile(data);

    // 创建研报记录
    const report = await reportService.createReport({
      title: data.filename,
      fileUrl
    });

    return {
      id: report.id,
      status: report.status,
      message: 'Report uploaded successfully, parsing started'
    };
  });

  // 触发研报解析
  fastify.post('/:id/parse', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as any;
    const report = await reportService.getReport(id);

    if (!report) {
      reply.status(404);
      return { error: 'Report not found' };
    }

    // 异步解析（使用LLM）
    const { parseReportWithLLM } = await import('../services/reportParser.js');

    // 更新状态为解析中
    await reportService.updateParseResult(id, { status: 'parsing' });

    // 异步执行解析
    parseReportWithLLM(id, report.fileUrl).catch(console.error);

    return {
      id,
      status: 'parsing',
      message: 'Report parsing started'
    };
  });

  // 获取关联内容
  fastify.get('/:id/related', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as any;
    const report = await reportService.getReport(id);

    if (!report) {
      reply.status(404);
      return { error: 'Report not found' };
    }

    const related = await reportService.getRelatedContent(id);
    return related;
  });

  // 更新研报
  fastify.put('/:id', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as any;
    const updateData = request.body as any;

    const report = await reportService.updateReport(id, updateData);
    if (!report) {
      reply.status(404);
      return { error: 'Report not found' };
    }

    return report;
  });

  // 删除研报
  fastify.delete('/:id', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as any;
    const success = await reportService.deleteReport(id);

    if (!success) {
      reply.status(404);
      return { error: 'Report not found' };
    }

    return { success: true };
  });
}
