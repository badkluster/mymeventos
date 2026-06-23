import { z } from 'zod';

export const ObjectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid ObjectId');

export const PaginationSchema = z.object({
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(20)
});

export const DateRangeSchema = z.object({
  startDate: z.coerce.date(),
  endDate: z.coerce.date()
}).refine(data => data.endDate >= data.startDate, {
  message: "End date must be after or equal to start date",
  path: ["endDate"]
});

export const MoneySchema = z.object({
  amount: z.number().nonnegative(),
  currency: z.string().length(3).default('ARS')
});

export const ContactDataSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().min(6, 'Phone is required')
});

export const AddressSchema = z.object({
  street: z.string().min(1),
  number: z.string(),
  city: z.string().min(1),
  state: z.string().min(1),
  zipCode: z.string().optional(),
  country: z.string().default('Argentina')
});

export const FileMediaSchema = z.object({
  url: z.string().url(),
  publicId: z.string(),
  format: z.string(),
  width: z.number().optional(),
  height: z.number().optional(),
  bytes: z.number()
});

export const AuditMetadataSchema = z.object({
  createdBy: ObjectIdSchema.optional(),
  updatedBy: ObjectIdSchema.optional(),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
  deletedAt: z.date().optional().nullable()
});
