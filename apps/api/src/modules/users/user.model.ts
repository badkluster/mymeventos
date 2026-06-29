import { Schema, model, models, type InferSchemaType } from 'mongoose';
import { Permission, Role, StaffEmploymentStatus, StaffSubrole } from '@mym/shared';

export function normalizeUserEmail(value?: string): string | undefined {
  return value?.trim().toLowerCase() || undefined;
}
export function normalizeUserPhone(value?: string): string | undefined {
  const normalized = value?.replace(/\D/g, '') ?? '';
  return normalized || undefined;
}
export function buildUserFullName(firstName?: string, lastName?: string): string {
  return [firstName, lastName].map((part) => part?.trim()).filter(Boolean).join(' ');
}

const notificationPreferencesSchema = new Schema({
  emailNotificationsEnabled: { type: Boolean, default: true },
  systemNotificationsEnabled: { type: Boolean, default: true },
  whatsappNotificationsEnabled: { type: Boolean, default: false },
  notifyOnNewLead: { type: Boolean, default: true },
  notifyOnNewQuoteRequest: { type: Boolean, default: true },
  notifyOnQuoteApproved: { type: Boolean, default: true },
  notifyOnContractApproved: { type: Boolean, default: true },
  notifyOnPaymentReceived: { type: Boolean, default: true },
  notifyOnEventReminder: { type: Boolean, default: true },
  notifyOnAssignedTask: { type: Boolean, default: true },
  email: { type: Boolean },
  inApp: { type: Boolean },
  whatsapp: { type: Boolean },
  newLead: { type: Boolean },
  newQuoteRequest: { type: Boolean },
  quoteAccepted: { type: Boolean },
  eventReminder: { type: Boolean },
  paymentReminder: { type: Boolean }
}, { _id: false });

const allowedGeoLocationSchema = new Schema({
  salonId: { type: Schema.Types.ObjectId, ref: 'Salon' },
  label: String,
  latitude: Number,
  longitude: Number,
  radiusMeters: { type: Number, default: 100 }
}, { _id: false });

const attendanceConfigSchema = new Schema({
  enabled: { type: Boolean, default: false },
  canUseMobileApp: { type: Boolean, default: false },
  requiresGeolocation: { type: Boolean, default: false },
  requiresWifiOrIpValidation: { type: Boolean, default: false },
  allowedIpAddresses: { type: [String], default: [] },
  allowedGeoLocations: { type: [allowedGeoLocationSchema], default: [] },
  allowManualAdjustment: { type: Boolean, default: false },
  defaultWorkLocationSalonId: { type: Schema.Types.ObjectId, ref: 'Salon' },
  notes: String
}, { _id: false });

const employeeProfileSchema = new Schema({
  employeeCode: String,
  position: String,
  department: String,
  hireDate: Date,
  terminationDate: Date,
  employmentStatus: { type: String, enum: ['active', 'inactive', 'suspended', 'terminated'], default: 'active' },
  emergencyContactName: String,
  emergencyContactPhone: String,
  notes: String
}, { _id: false });

const staffProfileSchema = new Schema({
  staffCode: { type: String, trim: true, index: true },
  staffSubroles: { type: [{ type: String, enum: Object.values(StaffSubrole) }], default: [] },
  documentType: { type: String, trim: true },
  documentNumber: { type: String, trim: true },
  normalizedDocumentNumber: { type: String, trim: true, index: true },
  birthDate: Date,
  address: { type: String, trim: true },
  emergencyContactName: { type: String, trim: true },
  emergencyContactPhone: { type: String, trim: true },
  startDate: Date,
  endDate: Date,
  employmentStatus: { type: String, enum: Object.values(StaffEmploymentStatus), default: StaffEmploymentStatus.ACTIVE, index: true },
  notes: String
}, { _id: false });

const weeklyAvailabilitySchema = new Schema({
  dayOfWeek: { type: Number, min: 0, max: 6, required: true },
  enabled: { type: Boolean, default: false },
  startTime: { type: String, trim: true },
  endTime: { type: String, trim: true }
}, { _id: false });

const workScheduleSchema = new Schema({
  type: { type: String, enum: ['FIXED', 'FLEXIBLE', 'EVENT_BASED'], default: 'EVENT_BASED' },
  weeklyAvailability: { type: [weeklyAvailabilitySchema], default: [] },
  notes: String
}, { _id: false });

const payrollProfileSchema = new Schema({
  paymentType: { type: String, enum: ['PER_EVENT', 'PER_HOUR', 'MONTHLY', 'OTHER'], default: 'PER_EVENT' },
  hourlyRate: Number,
  eventRate: Number,
  monthlySalary: Number,
  currency: { type: String, default: 'ARS' },
  paymentNotes: String,
  active: { type: Boolean, default: true }
}, { _id: false });

const preferencesSchema = new Schema({
  theme: String,
  language: { type: String, default: 'es' },
  defaultAdminRoute: String,
  tablePageSize: { type: Number, default: 20 },
  compactMode: { type: Boolean, default: false }
}, { _id: false });

const userSchema = new Schema({
  username: { type: String, required: true, trim: true, lowercase: true, unique: true, index: true },
  email: { type: String, trim: true, lowercase: true, unique: true, sparse: true, index: true },
  normalizedEmail: { type: String, trim: true, lowercase: true, index: true },
  passwordHash: { type: String, select: false },
  firstName: { type: String, required: true, trim: true },
  lastName: { type: String, required: true, trim: true },
  fullName: { type: String, trim: true, index: true },
  phone: { type: String, trim: true },
  normalizedPhone: { type: String, trim: true, index: true },
  documentType: { type: String, trim: true },
  documentNumber: { type: String, trim: true },
  avatarUrl: { type: String, trim: true },
  roles: { type: [{ type: String, enum: Object.values(Role) }], default: [Role.STAFF], index: true },
  permissionOverrides: { type: [{ type: String, enum: Object.values(Permission) }], default: [] },
  permissionDeniedOverrides: { type: [{ type: String, enum: Object.values(Permission) }], default: [] },
  primaryRole: { type: String, enum: Object.values(Role) },
  accessLevel: { type: String, trim: true },
  salonIds: { type: [{ type: Schema.Types.ObjectId, ref: 'Salon' }], default: [], index: true },
  primarySalonId: { type: Schema.Types.ObjectId, ref: 'Salon' },
  managedSalonIds: { type: [{ type: Schema.Types.ObjectId, ref: 'Salon' }], default: [], index: true },
  primaryManagedSalonId: { type: Schema.Types.ObjectId, ref: 'Salon' },
  canAccessBackoffice: { type: Boolean, index: true },
  canReceiveLeadNotifications: { type: Boolean, default: true },
  canReceiveQuoteRequestNotifications: { type: Boolean, default: true },
  active: { type: Boolean, default: true, index: true },
  mustChangePassword: { type: Boolean, default: false },
  lastLoginAt: Date,
  lastPasswordChangeAt: Date,
  passwordResetTokenHash: String,
  passwordResetExpiresAt: Date,
  failedLoginAttempts: { type: Number, default: 0 },
  lockedUntil: Date,
  notificationPreferences: {
    type: notificationPreferencesSchema,
    default: () => ({})
  },
  employeeProfile: { type: employeeProfileSchema, default: undefined },
  staffProfile: { type: staffProfileSchema, default: undefined },
  workSchedule: { type: workScheduleSchema, default: undefined },
  payrollProfile: { type: payrollProfileSchema, default: undefined },
  attendanceConfig: {
    type: attendanceConfigSchema,
    default: () => ({})
  },
  preferences: { type: preferencesSchema, default: () => ({ language: 'es', tablePageSize: 20, compactMode: false }) },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  deletedAt: { type: Date, default: null, index: true },
  deletedBy: { type: Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

userSchema.index({ email: 1, deletedAt: 1 });
userSchema.index({ username: 1, deletedAt: 1 });
userSchema.index({ firstName: 'text', lastName: 'text', fullName: 'text', email: 'text', phone: 'text' });
userSchema.index({ roles: 1, active: 1, deletedAt: 1 });
userSchema.index({ salonIds: 1, active: 1, deletedAt: 1 });
userSchema.index({ managedSalonIds: 1, active: 1, deletedAt: 1 });

userSchema.pre('validate', function normalizeUser(next) {
  this.username = this.username?.trim().toLowerCase();
  this.email = normalizeUserEmail(this.email ?? undefined) ?? this.email;
  this.normalizedEmail = normalizeUserEmail(this.email ?? undefined);
  this.normalizedPhone = normalizeUserPhone(this.phone ?? undefined);
  this.fullName = buildUserFullName(this.firstName, this.lastName);
  this.primaryRole = this.primaryRole || this.roles?.[0];
  if (this.canAccessBackoffice === undefined || this.canAccessBackoffice === null) {
    this.canAccessBackoffice = (this.roles ?? []).some((role: Role) => [Role.ADMIN, Role.MANAGER, Role.SALON_MANAGER].includes(role));
  }
  if ((this.roles ?? []).includes(Role.STAFF) && this.roles?.length === 1 && this.canAccessBackoffice === undefined) this.canAccessBackoffice = false;
  if (this.staffProfile?.documentNumber) this.staffProfile.normalizedDocumentNumber = String(this.staffProfile.documentNumber).replace(/\D/g, '') || undefined;
  const salonIds = (this.salonIds ?? []).map((id: { toString(): string }) => id.toString());
  const managedSalonIds = (this.managedSalonIds ?? []).map((id: { toString(): string }) => id.toString());
  if (this.primarySalonId && !salonIds.includes(this.primarySalonId.toString())) return next(new Error('primarySalonId must belong to salonIds.'));
  if (this.primaryManagedSalonId && !managedSalonIds.includes(this.primaryManagedSalonId.toString())) return next(new Error('primaryManagedSalonId must belong to managedSalonIds.'));
  return next();
});

export type UserDocument = InferSchemaType<typeof userSchema>;
export const User = models.User || model('User', userSchema);
