import { randomUUID } from 'node:crypto';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { env } from './config/env';
import routes from './routes';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler';
import { pingDatabase } from './db/connection';

export const app = express();

// Middleware
app.use(helmet());
app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
// `verify` stashes the raw bytes on the request so webhook handlers (e.g. Resend's
// Svix-signed marketing webhook) can HMAC the exact payload instead of a
// re-serialized (and potentially non-identical) JSON.stringify of req.body.
app.use(express.json({ verify: (request, _response, buffer) => { (request as express.Request).rawBody = buffer; } }));
app.use(cookieParser());

// Structured timing is intentionally separate from morgan: morgan remains useful for
// access logs while this entry tells us whether a slow/failed request spent its time in
// authentication or in the controller after the DB connection was already established.
app.use((request, response, next) => {
  const startedAt = Date.now();
  const requestId = request.get('x-vercel-id') || request.get('x-request-id') || randomUUID();
  response.setHeader('X-Request-Id', requestId);
  response.on('finish', () => {
    const elapsedMs = Date.now() - startedAt;
    if (elapsedMs < 750 && response.statusCode < 500) return;
    const log = {
      event: 'api_request_timing',
      requestId,
      method: request.method,
      path: request.originalUrl || request.url,
      statusCode: response.statusCode,
      elapsedMs,
      authMs: typeof response.locals.authMs === 'number' ? response.locals.authMs : null,
      region: process.env.VERCEL_REGION ?? null,
    };
    if (response.statusCode >= 500) console.error(JSON.stringify(log));
    else console.warn(JSON.stringify(log));
  });
  next();
});

app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// Liveness never depends on MongoDB. Readiness does.
const liveResponse = (_req: express.Request, res: express.Response) => res.json({
  status: 'ok',
  service: 'mymeventos-backend',
  region: process.env.VERCEL_REGION ?? null,
});
app.get('/health', liveResponse);
app.get('/api/health', liveResponse);
app.get('/health/live', liveResponse);
app.get('/api/health/live', liveResponse);
const readyResponse = async (_req: express.Request, res: express.Response) => {
  try {
    const databasePingMs = await pingDatabase();
    res.setHeader('Server-Timing', `db;dur=${databasePingMs}`);
    return res.status(200).json({ status: 'ready', service: 'mymeventos-backend', databasePingMs });
  } catch (error) {
    console.error(JSON.stringify({
      event: 'database_readiness_failed',
      errorName: error instanceof Error ? error.name : 'UnknownError',
      errorMessage: error instanceof Error ? error.message : String(error),
    }));
    return res.status(503).json({
      success: false,
      error: { code: 'DATABASE_UNAVAILABLE', message: 'La base de datos no está disponible temporalmente.' },
    });
  }
};
app.get('/health/ready', readyResponse);
app.get('/api/health/ready', readyResponse);

app.use('/api', routes);
if (env.NODE_ENV === 'development') {
  const secure = [{ cookieAuth: [] }];
  const openapi = swaggerJsdoc({ definition: {
    openapi: '3.0.0',
    info: { title: 'M&M Eventos API', version: '1.0.0', description: 'Base de autenticación, usuarios, salones, configuración, notificaciones, presupuestos y liquidación administrativa.' },
    components: { securitySchemes: { cookieAuth: { type: 'apiKey', in: 'cookie', name: 'accessToken' } } },
    paths: {
      '/api/auth/login': { post: { summary: 'Iniciar sesión' } }, '/api/auth/refresh': { post: { summary: 'Rotar credenciales' } }, '/api/auth/me': { get: { summary: 'Usuario actual', security: secure } },
      '/api/users': { get: { summary: 'Listar usuarios', security: secure }, post: { summary: 'Crear usuario', security: secure } }, '/api/salons': { get: { summary: 'Listar salones', security: secure }, post: { summary: 'Crear salón', security: secure } },
      '/api/quotes': { get: { summary: 'Listar presupuestos', security: secure }, post: { summary: 'Crear uno o varios presupuestos', security: secure } }, '/api/quotes/packages': { get: { summary: 'Listar plantillas de paquetes', security: secure } },
      '/api/settings': { get: { summary: 'Obtener configuración', security: secure }, patch: { summary: 'Actualizar configuración', security: secure } }, '/api/notifications': { get: { summary: 'Listar notificaciones', security: secure } },
      '/api/payroll/dashboard': { get: { summary: 'Resumen de liquidaciones', security: secure } }, '/api/payroll/profiles': { get: { summary: 'Listar perfiles salariales versionados', security: secure }, post: { summary: 'Crear versión de perfil salarial', security: secure } },
      '/api/payroll/attendance': { get: { summary: 'Listar asistencias para liquidación', security: secure } }, '/api/payroll/concepts': { get: { summary: 'Listar conceptos de liquidación', security: secure }, post: { summary: 'Crear concepto', security: secure } },
      '/api/payroll/runs': { get: { summary: 'Listar lotes de liquidación', security: secure }, post: { summary: 'Crear lote', security: secure } }, '/api/payroll/settlements': { get: { summary: 'Listar liquidaciones', security: secure } },
      '/api/mobile/payroll/settlements': { get: { summary: 'Consultar liquidaciones aprobadas propias', security: secure } }
    }
  }, apis: [] });
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(openapi));
}
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
