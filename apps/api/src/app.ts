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
app.use(express.json());
app.use(cookieParser());
app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// Basic health route
app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'mymeventos-backend' }));
app.use('/api', routes);
if (env.NODE_ENV === 'development') {
  const openapi = swaggerJsdoc({ definition: { openapi: '3.0.0', info: { title: 'M&M Eventos API', version: '1.0.0', description: 'Base de autenticación, usuarios, salones, configuración, notificaciones y presupuestos.' }, components: { securitySchemes: { cookieAuth: { type: 'apiKey', in: 'cookie', name: 'accessToken' } } }, paths: { '/api/auth/login': { post: { summary: 'Iniciar sesión' } }, '/api/auth/refresh': { post: { summary: 'Rotar credenciales' } }, '/api/auth/me': { get: { summary: 'Usuario actual', security: [{ cookieAuth: [] }] } }, '/api/users': { get: { summary: 'Listar usuarios', security: [{ cookieAuth: [] }] }, post: { summary: 'Crear usuario', security: [{ cookieAuth: [] }] } }, '/api/salons': { get: { summary: 'Listar salones', security: [{ cookieAuth: [] }] }, post: { summary: 'Crear salón', security: [{ cookieAuth: [] }] } }, '/api/quotes': { get: { summary: 'Listar presupuestos', security: [{ cookieAuth: [] }] }, post: { summary: 'Crear uno o varios presupuestos', security: [{ cookieAuth: [] }] } }, '/api/quotes/packages': { get: { summary: 'Listar plantillas de paquetes', security: [{ cookieAuth: [] }] } }, '/api/settings': { get: { summary: 'Obtener configuración', security: [{ cookieAuth: [] }] }, patch: { summary: 'Actualizar configuración', security: [{ cookieAuth: [] }] } }, '/api/notifications': { get: { summary: 'Listar notificaciones', security: [{ cookieAuth: [] }] } } } }, apis: [] });
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(openapi));
}
app.use(notFoundHandler); app.use(errorHandler);

export default app;
