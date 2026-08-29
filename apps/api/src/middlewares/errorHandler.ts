import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { sendError } from '../utils/api';
import { getApiMessage } from '../utils/messages';
import { isDatabaseUnavailableError } from '../db/connection';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message = getApiMessage(code),
    public details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export const notFoundHandler: RequestHandler = (_request, response) => sendError(response, 404, 'ROUTE_NOT_FOUND', getApiMessage('ROUTE_NOT_FOUND'));
export const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  if (error instanceof ZodError) {
    const fields = error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    }));
    const firstMessage = fields.find((field) => field.message.trim())?.message;
    return sendError(
      response,
      400,
      'VALIDATION_ERROR',
      firstMessage ?? getApiMessage('VALIDATION_ERROR'),
      { fields },
    );
  }
  if (error instanceof ApiError) return sendError(response, error.status, error.code, error.message, error.details);
  if (isDatabaseUnavailableError(error)) {
    console.error(JSON.stringify({
      event: 'database_operation_failed',
      errorName: error instanceof Error ? error.name : 'UnknownError',
      errorMessage: error instanceof Error ? error.message : String(error),
    }));
    return sendError(response, 503, 'DATABASE_UNAVAILABLE', 'La base de datos no está disponible temporalmente. Reintentá en unos segundos.');
  }
  if (typeof error === 'object' && error && (error as { code?: number }).code === 11000) {
    const duplicateFields = Object.keys((error as { keyPattern?: Record<string, unknown> }).keyPattern ?? {});
    if (duplicateFields.includes('email') || duplicateFields.includes('normalizedEmail')) return sendError(response, 409, 'EMAIL_ALREADY_EXISTS', getApiMessage('EMAIL_ALREADY_EXISTS'));
    if (duplicateFields.includes('username')) return sendError(response, 409, 'USERNAME_ALREADY_EXISTS', getApiMessage('USERNAME_ALREADY_EXISTS'));
  }
  console.error(error);
  return sendError(response, 500, 'INTERNAL_ERROR', getApiMessage('INTERNAL_ERROR'));
};
