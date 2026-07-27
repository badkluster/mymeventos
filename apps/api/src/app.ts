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
import { sendSuccess } from './utils/api';

export const app = express();

// Middleware
app.use(helmet());
app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
// `verify` stashes the raw bytes on the request so webhook handlers (e.g. Resend's
// Svix-signed marketing webhook) can HMAC the exact payload instead of a
// re-serialized (and potentially non-identical) JSON.stringify of req.body.
app.use(express.json({ verify: (request, _response, buffer) => { (request as express.Request).rawBody = buffer; } }));
app.use(cookieParser());
app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// Basic health route
app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'mymeventos-backend' }));
app.get('/api/health', (_req, res) => res.json({ status: 'ok', service: 'mymeventos-backend' }));
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
app.use(notFoundHandler); app.use(errorHandler);

export default app;
