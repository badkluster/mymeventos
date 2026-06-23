import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { sendError } from '../utils/api';
import { getApiMessage } from '../utils/messages';
export class ApiError extends Error { constructor(public status: number, public code: string, message = getApiMessage(code)) { super(message); } }
export const notFoundHandler: RequestHandler = (_request, response) => sendError(response, 404, 'ROUTE_NOT_FOUND', getApiMessage('ROUTE_NOT_FOUND'));
export const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  if (error instanceof ZodError) return sendError(response, 400, 'VALIDATION_ERROR', getApiMessage('VALIDATION_ERROR'), { fields: error.issues.map((issue) => ({ path: issue.path.join('.'), message: 'El valor enviado no es válido.' })) });
  if (error instanceof ApiError) return sendError(response, error.status, error.code, error.message);
  console.error(error); return sendError(response, 500, 'INTERNAL_ERROR', getApiMessage('INTERNAL_ERROR'));
};
