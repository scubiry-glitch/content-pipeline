// 全局错误处理

import { FastifyRequest, FastifyReply } from 'fastify';
import { ZodError } from 'zod';

export function errorHandler(
  error: Error,
  request: FastifyRequest,
  reply: FastifyReply
) {
  // Zod validation errors
  if (error instanceof ZodError) {
    reply.status(400);
    return {
      error: 'Validation Error',
      message: 'Invalid request data',
      code: 'VALIDATION_ERROR',
      details: error.errors.map(e => ({
        path: e.path.join('.'),
        message: e.message
      }))
    };
  }

  // Known API errors
  if (error.name === 'APIError') {
    reply.status((error as any).statusCode || 500);
    return {
      error: error.message,
      code: (error as any).code || 'INTERNAL_ERROR'
    };
  }

  // Default: 500
  request.log.error(error);
  reply.status(500);
  return {
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong',
    code: 'INTERNAL_ERROR'
  };
}
