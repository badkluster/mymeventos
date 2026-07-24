import type { RequestHandler } from 'express';
import { ApiError } from './errorHandler';

type Bucket = { count: number; resetAt: number };

/**
 * Protección local para formularios públicos. En despliegues con más de una
 * instancia debe reemplazarse por un almacén compartido (por ejemplo Redis).
 */
export function publicRateLimit(options: { windowMs: number; max: number }): RequestHandler {
  const buckets = new Map<string, Bucket>();
  return (request, response, next) => {
    const now = Date.now();
    // request.path (not just baseUrl) so distinct public endpoints — e.g. Mercado
    // Pago's payment webhook vs. buyer checkout/resume-payment — get separate budgets.
    const key = `${request.ip}:${request.baseUrl}${request.path}:${request.method}`;
    const current = buckets.get(key);
    const bucket = !current || current.resetAt <= now ? { count: 0, resetAt: now + options.windowMs } : current;
    bucket.count += 1;
    buckets.set(key, bucket);
    response.setHeader('X-RateLimit-Remaining', Math.max(0, options.max - bucket.count));
    if (bucket.count > options.max) {
      response.setHeader('Retry-After', Math.ceil((bucket.resetAt - now) / 1000));
      return next(new ApiError(429, 'PUBLIC_RATE_LIMITED', 'Demasiadas solicitudes. Intentá nuevamente en unos minutos.'));
    }
    next();
  };
}
