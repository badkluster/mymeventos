import { z } from 'zod';

const guestTableSchema = z.object({
  id: z.string().trim().max(120).optional(),
  name: z.string().trim().min(1).max(120),
  capacity: z.coerce.number().int().positive().max(100).optional(),
  audience: z.enum(['children', 'family', 'open']).optional(),
  notes: z.string().trim().max(500).optional()
});

const guestSchema = z.object({
  id: z.string().trim().max(120).optional(),
  fullName: z.string().trim().min(1).max(160),
  tableId: z.string().trim().max(120).optional(),
  meal: z.string().trim().max(100).optional(),
  ageGroup: z.enum(['adult', 'child_1_4', 'child_5_9', 'minor_10_17']).optional(),
  dietaryPreference: z.enum(['vegetarian', 'vegan', 'celiac', 'lactose_free', 'none']).optional(),
  notes: z.string().trim().max(600).optional(),
  confirmed: z.boolean().optional()
});

export const guestListSchema = z.object({
  tables: z.array(guestTableSchema).max(100).default([]),
  guests: z.array(guestSchema).max(1000).default([]),
  notes: z.string().trim().max(2500).optional()
});
