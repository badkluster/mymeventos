import { Schema, model, models } from 'mongoose';

export const CompensationTypes = ['hourly', 'daily', 'monthly', 'per_event', 'mixed'] as const;
export const PayrollFrequencies = ['weekly', 'biweekly', 'monthly', 'custom'] as const;
export const PayrollConceptTypes = ['earning', 'deduction'] as const;
export const PayrollConceptSources = ['attendance', 'overtime', 'event', 'bonus', 'advance', 'reimbursement', 'manual', 'adjustment'] as const;
export const PayrollRunStatuses = ['draft', 'calculated', 'under_review', 'approved', 'partially_paid', 'paid', 'cancelled'] as const;
export const PayrollSettlementStatuses = ['draft', 'under_review', 'approved', 'cancelled'] as const;
export const PayrollPaymentStatuses = ['unpaid', 'paid'] as const;
export const PayrollAttendanceStatuses = ['pending', 'approved', 'rejected'] as const;
export const PaymentMethods = ['cash', 'bank_transfer', 'mercado_pago', 'card', 'other'] as const;

const attachmentSchema = new Schema({
  url: { type: String, required: true },
  secureUrl: String,
  publicId: String,
  resourceType: { type: String, enum: ['image', 'video', 'raw'], default: 'raw' },
  format: String,
  bytes: Number,
  filename: String
}, { _id: false });

const payrollProfileSchema = new Schema({
  employeeId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  compensationType: { type: String, enum: CompensationTypes, required: true },
  payrollFrequency: { type: String, enum: PayrollFrequencies, required: true },
  currency: { type: String, required: true, default: 'ARS', minlength: 3, maxlength: 3 },
  hourlyRateMinor: { type: Number, min: 0 },
  dailyRateMinor: { type: Number, min: 0 },
  monthlySalaryMinor: { type: Number, min: 0 },
  eventRateMinor: { type: Number, min: 0 },
  expectedMonthlyHours: { type: Number, min: 0 },
  overtimeAfterMinutes: { type: Number, min: 0, default: 480 },
  overtimeMultiplier: { type: Number, min: 1, default: 1.5 },
  nightMultiplier: { type: Number, min: 1, default: 1 },
  weekendMultiplier: { type: Number, min: 1, default: 1 },
  holidayMultiplier: { type: Number, min: 1, default: 1 },
  nightStartHour: { type: Number, min: 0, max: 23, default: 22 },
  nightEndHour: { type: Number, min: 0, max: 23, default: 6 },
  graceMinutes: { type: Number, min: 0, default: 0 },
  roundingRule: { type: String, enum: ['none', 'nearest_5', 'floor_5', 'ceil_5', 'nearest_15', 'floor_15', 'ceil_15'], default: 'none' },
  breakPolicy: { type: String, enum: ['unpaid', 'paid', 'manual'], default: 'unpaid' },
  paymentMethod: { type: String, enum: PaymentMethods, default: 'bank_transfer' },
  effectiveFrom: { type: Date, required: true, index: true },
  effectiveTo: { type: Date, index: true },
  isActive: { type: Boolean, default: true, index: true },
  salonIds: { type: [{ type: Schema.Types.ObjectId, ref: 'Salon' }], default: [], index: true },
  notes: { type: String, trim: true, maxlength: 2000 },
  version: { type: Number, required: true, default: 1 },
  supersedesProfileId: { type: Schema.Types.ObjectId, ref: 'PayrollProfile' },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });
payrollProfileSchema.index({ employeeId: 1, effectiveFrom: -1, version: -1 });
payrollProfileSchema.index({ employeeId: 1, effectiveTo: 1, isActive: 1 });

const payrollConceptSchema = new Schema({
  code: { type: String, required: true, trim: true, uppercase: true, unique: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 120 },
  description: { type: String, trim: true, maxlength: 1000 },
  type: { type: String, enum: PayrollConceptTypes, required: true, index: true },
  source: { type: String, enum: PayrollConceptSources, required: true, index: true },
  isAutomatic: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true, index: true },
  requiresReason: { type: Boolean, default: false },
  displayOrder: { type: Number, default: 0, index: true },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

const payrollRunSchema = new Schema({
  name: { type: String, required: true, trim: true, maxlength: 180 },
  periodStart: { type: Date, required: true, index: true },
  periodEnd: { type: Date, required: true, index: true },
  paymentDate: Date,
  frequency: { type: String, enum: PayrollFrequencies, required: true },
  salonIds: { type: [{ type: Schema.Types.ObjectId, ref: 'Salon' }], default: [] },
  employeeIds: { type: [{ type: Schema.Types.ObjectId, ref: 'User' }], default: [] },
  eventId: { type: Schema.Types.ObjectId, ref: 'Event', index: true },
  status: { type: String, enum: PayrollRunStatuses, default: 'draft', index: true },
  idempotencyKey: { type: String, trim: true, sparse: true, unique: true },
  generatedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  calculatedAt: Date,
  approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  approvedAt: Date,
  paidAt: Date,
  notes: { type: String, trim: true, maxlength: 2000 },
  totals: {
    settlements: { type: Number, default: 0 },
    baseAmountMinor: { type: Number, default: 0 },
    earningsAmountMinor: { type: Number, default: 0 },
    deductionsAmountMinor: { type: Number, default: 0 },
    grossAmountMinor: { type: Number, default: 0 },
    netAmountMinor: { type: Number, default: 0 },
    paidAmountMinor: { type: Number, default: 0 }
  },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });
payrollRunSchema.index({ periodStart: 1, periodEnd: 1, status: 1 });
payrollRunSchema.index({ salonIds: 1, periodStart: -1 });

const payrollItemSchema = new Schema({
  conceptId: { type: Schema.Types.ObjectId, ref: 'PayrollConcept' },
  conceptCode: { type: String, required: true },
  conceptName: { type: String, required: true },
  conceptType: { type: String, enum: PayrollConceptTypes, required: true },
  source: { type: String, enum: PayrollConceptSources, required: true },
  sourceId: Schema.Types.ObjectId,
  quantity: { type: Number, required: true, min: 0 },
  unit: { type: String, required: true },
  unitAmountMinor: { type: Number, required: true, min: 0 },
  subtotalMinor: { type: Number, required: true, min: 0 },
  description: { type: String, trim: true, maxlength: 1000 },
  isManual: { type: Boolean, default: false },
  reason: { type: String, trim: true, maxlength: 1000 },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: () => new Date() }
}, { _id: true });

const payrollSettlementSchema = new Schema({
  settlementCode: { type: String, required: true, unique: true, index: true },
  payrollRunId: { type: Schema.Types.ObjectId, ref: 'PayrollRun', index: true },
  employeeId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  payrollProfileSnapshot: { type: Schema.Types.Mixed, required: true },
  periodStart: { type: Date, required: true, index: true },
  periodEnd: { type: Date, required: true, index: true },
  status: { type: String, enum: PayrollSettlementStatuses, default: 'draft', index: true },
  salonIds: { type: [{ type: Schema.Types.ObjectId, ref: 'Salon' }], default: [], index: true },
  attendanceRecordIds: { type: [{ type: Schema.Types.ObjectId, ref: 'WorkSession' }], default: [] },
  items: { type: [payrollItemSchema], default: [] },
  baseAmountMinor: { type: Number, default: 0, min: 0 },
  earningsAmountMinor: { type: Number, default: 0, min: 0 },
  deductionsAmountMinor: { type: Number, default: 0, min: 0 },
  grossAmountMinor: { type: Number, default: 0, min: 0 },
  netAmountMinor: { type: Number, default: 0, min: 0 },
  currency: { type: String, required: true, minlength: 3, maxlength: 3 },
  paymentStatus: { type: String, enum: PayrollPaymentStatuses, default: 'unpaid', index: true },
  paymentMethod: { type: String, enum: PaymentMethods },
  paymentReference: { type: String, trim: true, maxlength: 300 },
  paidAt: Date,
  approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  approvedAt: Date,
  calculationVersion: { type: String, required: true },
  calculationDetails: { type: Schema.Types.Mixed, default: () => ({}) },
  notes: { type: String, trim: true, maxlength: 2000 },
  receipt: attachmentSchema,
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });
payrollSettlementSchema.index({ employeeId: 1, periodStart: 1, periodEnd: 1, status: 1 });
payrollSettlementSchema.index({ payrollRunId: 1, employeeId: 1 }, { unique: true, sparse: true });
payrollSettlementSchema.index({ attendanceRecordIds: 1, status: 1 });

const salaryAdvanceSchema = new Schema({
  employeeId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  date: { type: Date, required: true, index: true },
  amountMinor: { type: Number, required: true, min: 1 },
  currency: { type: String, required: true, default: 'ARS', minlength: 3, maxlength: 3 },
  reason: { type: String, required: true, trim: true, minlength: 3, maxlength: 1000 },
  status: { type: String, enum: ['pending', 'deducted', 'cancelled'], default: 'pending', index: true },
  payrollSettlementId: { type: Schema.Types.ObjectId, ref: 'PayrollSettlement', index: true },
  attachment: attachmentSchema,
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  cancelledBy: { type: Schema.Types.ObjectId, ref: 'User' },
  cancelledAt: Date,
  cancellationReason: { type: String, trim: true, maxlength: 1000 }
}, { timestamps: true });
salaryAdvanceSchema.index({ employeeId: 1, status: 1, date: -1 });

const payrollAdjustmentSchema = new Schema({
  settlementId: { type: Schema.Types.ObjectId, ref: 'PayrollSettlement', required: true, index: true },
  employeeId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  conceptId: { type: Schema.Types.ObjectId, ref: 'PayrollConcept', required: true },
  amountMinor: { type: Number, required: true, min: 1 },
  quantity: { type: Number, min: 0 },
  reason: { type: String, required: true, trim: true, minlength: 3, maxlength: 1000 },
  appliedItemId: { type: Schema.Types.ObjectId },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });
payrollAdjustmentSchema.index({ settlementId: 1, createdAt: -1 });

export const PayrollProfile = models.PayrollProfile || model('PayrollProfile', payrollProfileSchema);
export const PayrollConcept = models.PayrollConcept || model('PayrollConcept', payrollConceptSchema);
export const PayrollRun = models.PayrollRun || model('PayrollRun', payrollRunSchema);
export const PayrollSettlement = models.PayrollSettlement || model('PayrollSettlement', payrollSettlementSchema);
export const SalaryAdvance = models.SalaryAdvance || model('SalaryAdvance', salaryAdvanceSchema);
export const PayrollAdjustment = models.PayrollAdjustment || model('PayrollAdjustment', payrollAdjustmentSchema);
