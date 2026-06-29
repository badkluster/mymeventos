import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const booleanSchema = z.enum(['true', 'false']).transform((value) => value === 'true');
const sameSiteSchema = z.enum(['lax', 'strict', 'none']);

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  MONGODB_URI: z.string().min(1),
  CORS_ORIGIN: z.string().url(),
  ACCESS_TOKEN_SECRET: z.string().min(32),
  REFRESH_TOKEN_SECRET: z.string().min(32),
  ACCESS_TOKEN_EXPIRES_IN: z.string().default('15m'),
  REFRESH_TOKEN_EXPIRES_IN: z.string().default('7d'),
  COOKIE_DOMAIN: z.string().optional(),
  COOKIE_SECURE: booleanSchema.default('false'),
  COOKIE_SAME_SITE: sameSiteSchema.default('lax'),
  SMTP_HOST: z.string().optional(), SMTP_PORT: z.coerce.number().int().positive().optional(),
  SMTP_USER: z.string().optional(), SMTP_PASS: z.string().optional(), SMTP_FROM: z.string().optional(),
  EMAIL_NOTIFICATIONS_ENABLED: booleanSchema.default('false'),
  CLOUDINARY_CLOUD_NAME: z.string().optional(), CLOUDINARY_API_KEY: z.string().optional(), CLOUDINARY_API_SECRET: z.string().optional(), CLOUDINARY_URL: z.string().optional(),
  SEED_ADMIN_USERNAME: z.string().optional(), SEED_ADMIN_EMAIL: z.string().optional(), SEED_ADMIN_PASSWORD: z.string().optional()
});

const testDefaults = {
  MONGODB_URI: 'mongodb://127.0.0.1:27017/mymeventos-test', CORS_ORIGIN: 'http://localhost:3000',
  ACCESS_TOKEN_SECRET: 'test-access-token-secret-that-is-at-least-32-chars',
  REFRESH_TOKEN_SECRET: 'test-refresh-token-secret-that-is-at-least-32-chars'
};

export type Environment = z.infer<typeof environmentSchema>;
const environmentValues = process.env.NODE_ENV === 'test'
  ? { ...testDefaults, ...process.env, SEED_ADMIN_USERNAME: undefined, SEED_ADMIN_EMAIL: undefined, SEED_ADMIN_PASSWORD: undefined }
  : process.env;
const parsedEnvironment = environmentSchema.safeParse(environmentValues);
if (!parsedEnvironment.success) {
  const invalidVariables = parsedEnvironment.error.issues.map((issue) => issue.path.join('.')).join(', ');
  throw new Error(`Configuración de entorno inválida: ${invalidVariables}`);
}
export const env: Environment = parsedEnvironment.data;
