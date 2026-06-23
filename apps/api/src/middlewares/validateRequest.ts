import type { RequestHandler } from 'express';
import type { ZodTypeAny } from 'zod';
export const validateRequest = (schema: ZodTypeAny): RequestHandler => (request, _response, next) => { const parsed = schema.parse({ body: request.body, params: request.params, query: request.query }); request.body = parsed.body; request.params = parsed.params; request.query = parsed.query; next(); };
