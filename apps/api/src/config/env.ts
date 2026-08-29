import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';

dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), '../../.env'), override: false });

const booleanSchema = z.enum(['true', 'false']).transform((value) => value === 'true');
const sameSiteSchema = z.enum(['lax', 'strict', 'none']);

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  MONGODB_URI: z.string().min(1),
  CORS_ORIGIN: z.string().url().optional(),
  VERCEL_URL: z.string().optional(),
  ACCESS_TOKEN_SECRET: z.string().min(32),
  REFRESH_TOKEN_SECRET: z.string().min(32),
  ACCESS_TOKEN_EXPIRES_IN: z.string().default('15m'),
  REFRESH_TOKEN_EXPIRES_IN: z.string().default('7d'),
  COOKIE_DOMAIN: z.string().optional(),
  COOKIE_SECURE: booleanSchema.default('false'),
  COOKIE_SAME_SITE: sameSiteSchema.default('lax'),
  META_DATASET_ID: z.string().trim().min(1).optional(),
  META_CONVERSIONS_API_TOKEN: z.string().trim().min(1).optional(),
  META_AD_ACCOUNT_ID: z.string().trim().min(1).optional(),
  META_MARKETING_ACCESS_TOKEN: z.string().trim().min(1).optional(),
  META_MARKETING_API_TIMEOUT_MS: z.coerce.number().int().positive().max(30_000).default(8_000),
  META_GRAPH_API_VERSION: z.string().regex(/^v\d+\.\d+$/).default('v26.0'),
  GOOGLE_SEARCH_CONSOLE_PROPERTY: z.string().trim().min(1).optional(),
  GOOGLE_SEARCH_CONSOLE_PROJECT_ID: z.string().trim().min(1).optional(),
  GOOGLE_SEARCH_CONSOLE_CLIENT_EMAIL: z.string().trim().email().optional(),
  GOOGLE_SEARCH_CONSOLE_PRIVATE_KEY: z.string().trim().min(1).optional(),
  GOOGLE_SEARCH_CONSOLE_TIMEOUT_MS: z.coerce.number().int().positive().max(30_000).default(10_000),
  SMTP_HOST: z.string().optional(), SMTP_PORT: z.coerce.number().int().positive().optional(),
  SMTP_USER: z.string().optional(), SMTP_PASS: z.string().optional(), SMTP_FROM: z.string().optional(),
  SUPPORT_EMAIL: z.string().email().optional(),
  EMAIL_NOTIFICATIONS_ENABLED: booleanSchema.default('false'),
  CLOUDINARY_CLOUD_NAME: z.string().optional(), CLOUDINARY_API_KEY: z.string().optional(), CLOUDINARY_API_SECRET: z.string().optional(), CLOUDINARY_URL: z.string().optional(),
  MERCADO_PAGO_ACCESS_TOKEN: z.string().optional(), MERCADO_PAGO_WEBHOOK_SECRET: z.string().optional(),
  MERCADO_PAGO_ENVIRONMENT: z.enum(['test', 'production']).default('test'), TICKET_PAYMENT_PROVIDER: z.enum(['mock', 'mercado_pago']).default('mock'),
  MARKETING_EMAIL_PROVIDER: z.enum(['mock', 'resend']).default('mock'),
  RESEND_API_KEY: z.string().optional(), RESEND_WEBHOOK_SECRET: z.string().optional(),
  MARKETING_FROM_EMAIL: z.string().optional(), MARKETING_FROM_NAME: z.string().optional(), MARKETING_REPLY_TO: z.string().optional(),
  MARKETING_BATCH_SIZE: z.coerce.number().int().positive().max(500).default(25),
  MARKETING_CRON_SECRET: z.string().optional(),
  CRON_SECRET: z.string().optional(),
  TICKET_AUTOMATION_CRON_SECRET: z.string().optional(),
  MOBILE_ACCESS_TOKEN_TTL: z.string().default('30m'),
  MOBILE_REFRESH_TOKEN_TTL: z.string().default('30d'),
  MOBILE_DEEP_LINK_SCHEME: z.string().default('mymeventos'),
  ATTENDANCE_DEFAULT_TIMEZONE: z.string().default('America/Argentina/Buenos_Aires'),
  ATTENDANCE_DEFAULT_LOCATION_ACCURACY_METERS: z.coerce.number().positive().default(50),
  ATTENDANCE_DEFAULT_GEOFENCE_RADIUS_METERS: z.coerce.number().positive().default(150)
});

const testDefaults = {
  MONGODB_URI: 'mongodb://127.0.0.1:27017/mymeventos-test', CORS_ORIGIN: 'http://localhost:3000',
  ACCESS_TOKEN_SECRET: 'test-access-token-secret-that-is-at-least-32-chars',
  REFRESH_TOKEN_SECRET: 'test-refresh-token-secret-that-is-at-least-32-chars'
};

export type Environment = z.infer<typeof environmentSchema>;
const environmentValues = process.env.NODE_ENV === 'test'
  ? { ...testDefaults, ...process.env }
  : process.env;
const parsedEnvironment = environmentSchema.safeParse(environmentValues);
if (!parsedEnvironment.success) {
  const invalidVariables = parsedEnvironment.error.issues.map((issue) => issue.path.join('.')).join(', ');
  throw new Error(`Configuración de entorno inválida: ${invalidVariables}`);
}
export const env: Environment & { CORS_ORIGIN: string } = {
  ...parsedEnvironment.data,
  CORS_ORIGIN: parsedEnvironment.data.CORS_ORIGIN ?? (parsedEnvironment.data.VERCEL_URL ? `https://${parsedEnvironment.data.VERCEL_URL}` : 'http://localhost:3000')
};
