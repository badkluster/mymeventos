import { z } from 'zod';
export const loginSchema = z.object({ body: z.object({ username: z.string().min(3).max(100), password: z.string().min(1).max(256) }), params: z.object({}), query: z.object({}) });
