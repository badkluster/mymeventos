import { Schema, model, models } from 'mongoose';
import {
  WorkSessionStatus, TimePunchType, TimePunchSource, LocationValidationStatus,
  AttendanceAdjustmentStatus, AttendanceIncidentType, AttendanceIncidentStatus, AttendanceClassification
} from '@mym/shared';

// Attendance domain models. There is deliberately no `EmployeeProfile` collection here:
// the "employee profile" is the existing `User.staffProfile` + `User.attendanceConfig`
// sub-documents (apps/api/src/modules/users/user.model.ts) — see docs/ATTENDANCE_ARCHITECTURE.md
// for why a second, parallel profile collection was rejected.

const attachmentSchema = new Schema({
  url: { type: String, required: true },
  secureUrl: String,
  publicId: String,
  resourceType: { type: String, enum: ['image', 'video', 'raw'], default: 'image' },
  format: String,
  bytes: Number
}, { _id: false });

const geoPointSchema = new Schema({
  latitude: Number,
  longitude: Number,
  accuracy: Number,
  altitude: Number,
  heading: Number,
  speed: Number
}, { _id: false });

const punchDeviceSchema = new Schema({
  installationId: String,
  platform: String,
  isPhysicalDevice: Boolean,
  deviceType: String,
  brand: String,
  osVersion: String,
  osName: String,
  osBuildId: String,
  osInternalBuildId: String,
  osBuildFingerprint: String,
  platformApiLevel: Number,
  appVersion: String,
  appBuildVersion: String,
  applicationId: String,
  deviceModel: String,
  modelId: String,
  deviceName: String,
  manufacturer: String,
  designName: String,
  productName: String,
  deviceYearClass: Number,
  rooted: Boolean,
  appInstalledAt: Date,
  appLastUpdatedAt: Date
}, { _id: false });

const punchNetworkSchema = new Schema({
  connectionType: String,
  isConnected: Boolean,
  isInternetReachable: Boolean,
  reportedIp: String,
  airplaneMode: Boolean
}, { _id: false });

// Immutable log of a single clock action. Never updated by any route after creation
// (no PATCH/DELETE is ever exposed for this model) — corrections happen exclusively
// through an audited AttendanceAdjustmentRequest against the derived WorkSession.
const timePunchSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  workSessionId: { type: Schema.Types.ObjectId, ref: 'WorkSession', index: true },
  type: { type: String, enum: Object.values(TimePunchType), required: true },
  source: { type: String, enum: Object.values(TimePunchSource), default: TimePunchSource.MOBILE },
  clientOccurredAt: { type: Date, required: true },
  serverReceivedAt: { type: Date, required: true, default: () => new Date() },
  effectiveAt: { type: Date, required: true },
  location: geoPointSchema,
  locationPermissionStatus: String,
  locationCapturedAt: Date,
  publicIp: String,
  device: punchDeviceSchema,
  network: punchNetworkSchema,
  networkStatus: { type: String, enum: ['online', 'offline_sync'], default: 'online' },
  requestId: { type: String, required: true },
  salonId: { type: Schema.Types.ObjectId, ref: 'Salon', index: true },
  salonDistanceMeters: Number,
  locationValidationStatus: { type: String, enum: Object.values(LocationValidationStatus) },
  clockSkewMs: Number,
  rejected: { type: Boolean, default: false },
  rejectionReason: String,
  notes: String,
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: { createdAt: true, updatedAt: false } });

timePunchSchema.index({ requestId: 1 }, { unique: true });
timePunchSchema.index({ workSessionId: 1, type: 1 });
timePunchSchema.index({ userId: 1, effectiveAt: -1 });

// The derived, correctable "jornada". `startedAt`/`endedAt` may be updated exactly once
// per approved AttendanceAdjustmentRequest (see attendance.service.ts#applyAdjustment) —
// every such change is audited and the pre-adjustment values live on frozen in the
// adjustment request's `originalSnapshot`, so the derivation is always reconstructable.
const workSessionSchema = new Schema({
  // No field-level `index: true` here: the partial unique index below already covers
  // the {userId:1} key pattern (mongoose warns on an exact duplicate key pattern).
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  salonId: { type: Schema.Types.ObjectId, ref: 'Salon', index: true },
  eventId: { type: Schema.Types.ObjectId, ref: 'Event', index: true },
  assignmentId: { type: Schema.Types.ObjectId, ref: 'EventStaffAssignment', index: true },

  status: { type: String, enum: Object.values(WorkSessionStatus), default: WorkSessionStatus.ACTIVE, index: true },

  checkInPunchId: { type: Schema.Types.ObjectId, ref: 'TimePunch', required: true },
  checkOutPunchId: { type: Schema.Types.ObjectId, ref: 'TimePunch' },

  startedAt: { type: Date, required: true },
  endedAt: Date,

  workedMinutes: Number,
  breakMinutes: { type: Number, default: 0 },
  payableMinutes: Number,

  attendanceClassification: { type: String, enum: Object.values(AttendanceClassification) },

  hasIncident: { type: Boolean, default: false },
  requiresReview: { type: Boolean, default: false, index: true },

  closedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  closeReason: String,
  notes: String,

  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

// At most one active session per user, enforced at the database level (prevents the
// double-check-in race condition without needing a multi-document transaction).
workSessionSchema.index({ userId: 1 }, { unique: true, partialFilterExpression: { status: 'active' } });
workSessionSchema.index({ userId: 1, startedAt: -1 });
workSessionSchema.index({ salonId: 1, startedAt: -1 });
workSessionSchema.index({ eventId: 1, startedAt: -1 });
workSessionSchema.index({ requiresReview: 1, createdAt: -1 });

const attendanceIncidentSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  workSessionId: { type: Schema.Types.ObjectId, ref: 'WorkSession', index: true },
  assignmentId: { type: Schema.Types.ObjectId, ref: 'EventStaffAssignment' },
  type: { type: String, enum: Object.values(AttendanceIncidentType), required: true },
  description: { type: String, required: true, trim: true },
  attachments: { type: [attachmentSchema], default: [] },
  status: { type: String, enum: Object.values(AttendanceIncidentStatus), default: AttendanceIncidentStatus.PENDING, index: true },
  resolvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  resolvedAt: Date,
  resolution: String,
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

attendanceIncidentSchema.index({ status: 1, createdAt: -1 });
attendanceIncidentSchema.index({ userId: 1, createdAt: -1 });

const attendanceAdjustmentRequestSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  workSessionId: { type: Schema.Types.ObjectId, ref: 'WorkSession', required: true, index: true },
  requestedStartAt: Date,
  requestedEndAt: Date,
  reason: { type: String, required: true, trim: true },
  attachments: { type: [attachmentSchema], default: [] },
  status: { type: String, enum: Object.values(AttendanceAdjustmentStatus), default: AttendanceAdjustmentStatus.PENDING, index: true },
  reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  reviewedAt: Date,
  reviewNotes: String,
  originalSnapshot: Schema.Types.Mixed,
  appliedAt: Date,
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

attendanceAdjustmentRequestSchema.index({ status: 1, createdAt: -1 });
attendanceAdjustmentRequestSchema.index({ userId: 1, createdAt: -1 });

export const TimePunch = models.TimePunch || model('TimePunch', timePunchSchema);
export const WorkSession = models.WorkSession || model('WorkSession', workSessionSchema);
export const AttendanceIncident = models.AttendanceIncident || model('AttendanceIncident', attendanceIncidentSchema);
export const AttendanceAdjustmentRequest = models.AttendanceAdjustmentRequest || model('AttendanceAdjustmentRequest', attendanceAdjustmentRequestSchema);
