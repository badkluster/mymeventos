import type { Response } from 'express';

export function sendSuccess<T>(response: Response, data: T, status = 200, message?: string): Response { return response.status(status).json({ success: true, ...(message ? { message } : {}), data }); }
export function sendError(response: Response, status: number, code: string, message: string, details?: unknown): Response { return response.status(status).json({ success: false, error: { code, message, ...(details ? { details } : {}) } }); }
