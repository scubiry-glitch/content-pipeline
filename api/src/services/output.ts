// 产出物服务
// 处理内容生成和下载

import { query } from '../db/connection.js';

export class OutputService {
  async getById(outputId: string) {
    const result = await query('SELECT * FROM outputs WHERE id = $1', [outputId]);

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0];
  }

  async download(outputId: string) {
    const output = await this.getById(outputId);

    if (!output) {
      throw Object.assign(new Error('Output not found'), { name: 'APIError', statusCode: 404 });
    }

    const extensions: Record<string, string> = {
      markdown: 'md',
      html: 'html'
    };

    const contentTypes: Record<string, string> = {
      markdown: 'text/markdown; charset=utf-8',
      html: 'text/html; charset=utf-8'
    };

    const filename = `content_${output.task_id}.${extensions[output.format] || 'txt'}`;

    return {
      content: output.content,
      filename,
      contentType: contentTypes[output.format] || 'text/plain'
    };
  }
}
