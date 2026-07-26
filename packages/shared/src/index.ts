export * from './constants/roles';
export * from './constants/permissions';
export * from './constants/statuses';
export * from './constants/operations';
export * from './constants/marketing';
export * from './constants/attendance';
export * from './schemas/common';
export * from './utils/permissionHelpers';

import { z } from 'zod';
import { 
  PaginationSchema, 
  DateRangeSchema, 
  MoneySchema, 
  ContactDataSchema, 
  AddressSchema, 
  FileMediaSchema, 
  AuditMetadataSchema 
} from './schemas/common';

export type PaginationInfo = z.infer<typeof PaginationSchema>;
export type DateRange = z.infer<typeof DateRangeSchema>;
export type Money = z.infer<typeof MoneySchema>;
export type ContactData = z.infer<typeof ContactDataSchema>;
export type Address = z.infer<typeof AddressSchema>;
export type FileMedia = z.infer<typeof FileMediaSchema>;
export type AuditMetadata = z.infer<typeof AuditMetadataSchema>;
