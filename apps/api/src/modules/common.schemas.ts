import { z } from 'zod';
import { ObjectIdSchema } from '@mym/shared';
export const idParams = z.object({ body: z.unknown(), params: z.object({ id: ObjectIdSchema }), query: z.object({}) });
export const emptyRequest = z.object({ body: z.unknown().optional(), params: z.object({}), query: z.object({}) });
