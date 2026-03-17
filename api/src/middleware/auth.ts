// 认证中间件
// MVP: 简单API Key认证

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

const API_KEY = process.env.ADMIN_API_KEY || 'dev-api-key-change-in-production';

export function setupAuth(fastify: FastifyInstance) {
  // No global auth setup needed for MVP
}

export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  const apiKey = request.headers['x-api-key'];

  if (!apiKey || apiKey !== API_KEY) {
    reply.status(401);
    return {
      error: 'Unauthorized',
      message: 'Invalid or missing API key',
      code: 'UNAUTHORIZED'
    };
  }
}

// 可选认证 - 支持匿名和登录用户
export async function optionalAuth(request: FastifyRequest, reply: FastifyReply) {
  const apiKey = request.headers['x-api-key'];

  if (apiKey && apiKey === API_KEY) {
    // 认证通过，设置用户标识
    (request as any).user = { id: 'authenticated', role: 'user' };
  }
  // 未认证也继续执行
}
