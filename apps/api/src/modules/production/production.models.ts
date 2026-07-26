import { Schema, model, models } from 'mongoose';

const auditFields = {
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  deletedAt: { type: Date, default: null, index: true },
  deletedBy: { type: Schema.Types.ObjectId, ref: 'User' },
};

const productionPlanSchema = new Schema({
  eventId: { type: Schema.Types.ObjectId, ref: 'Event', required: true, index: true },
  contractId: { type: Schema.Types.ObjectId, ref: 'Contract', index: true },
  salonId: { type: Schema.Types.ObjectId, ref: 'Salon', required: true, index: true },
  customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
  eventDate: { type: Date, required: true, index: true },
  guestCounts: { type: Schema.Types.Mixed, default: {} },
  status: { type: String, enum: ['pending', 'in_progress', 'ready', 'checked', 'blocked', 'cancelled', 'closed'], default: 'pending', index: true },
  generatedAt: { type: Date, required: true, default: Date.now },
  generatedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  startedAt: Date,
  completedAt: Date,
  closedAt: Date,
  reopenedAt: Date,
  reopenedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  reopenReason: String,
  notes: String,
  version: { type: Number, default: 1 },
  isCurrent: { type: Boolean, default: true, index: true },
  sourceSnapshot: { type: Schema.Types.Mixed, required: true },
  ...auditFields,
}, { timestamps: true });
productionPlanSchema.index({ eventId: 1, version: 1 }, { unique: true });
productionPlanSchema.index({ eventId: 1, isCurrent: 1 }, { unique: true, partialFilterExpression: { isCurrent: true, deletedAt: null } });
productionPlanSchema.index({ salonId: 1, eventDate: 1, status: 1, deletedAt: 1 });

const productionSectionSchema = new Schema({
  productionPlanId: { type: Schema.Types.ObjectId, ref: 'ProductionPlan', required: true, index: true },
  type: { type: String, enum: ['savory', 'sweet', 'beverages', 'cake', 'bakery', 'kitchen', 'bar', 'miscellaneous'], required: true, index: true },
  name: { type: String, required: true, trim: true },
  order: { type: Number, default: 0 },
  ...auditFields,
}, { timestamps: true });
productionSectionSchema.index({ productionPlanId: 1, type: 1, deletedAt: 1 }, { unique: true });

const itemTransitionSchema = new Schema({
  fromStatus: String,
  toStatus: String,
  changedAt: { type: Date, required: true },
  changedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  reason: String,
}, { _id: false });

const productionItemSchema = new Schema({
  productionPlanId: { type: Schema.Types.ObjectId, ref: 'ProductionPlan', required: true, index: true },
  sectionId: { type: Schema.Types.ObjectId, ref: 'ProductionSection', required: true, index: true },
  productId: { type: Schema.Types.ObjectId, ref: 'CatalogItem', index: true },
  normalizedProductName: { type: String, required: true, trim: true, index: true },
  productNameSnapshot: { type: String, required: true, trim: true },
  category: String,
  plannedQuantity: { type: Number, required: true, min: 0 },
  unit: { type: String, required: true, trim: true },
  completedQuantity: { type: Number, default: 0, min: 0 },
  status: { type: String, enum: ['pending', 'in_progress', 'ready', 'checked', 'blocked', 'cancelled'], default: 'pending', index: true },
  ready: { type: Boolean, default: false },
  checked: { type: Boolean, default: false },
  readyAt: Date,
  readyBy: { type: Schema.Types.ObjectId, ref: 'User' },
  checkedAt: Date,
  checkedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  responsibleId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
  dueAt: Date,
  observations: String,
  sourceType: { type: String, enum: ['rule', 'contract', 'menu', 'service', 'extra', 'legacy_snapshot', 'manual'], required: true },
  sourceId: String,
  isManual: { type: Boolean, default: false },
  order: { type: Number, default: 0 },
  transitions: { type: [itemTransitionSchema], default: [] },
  ...auditFields,
}, { timestamps: true });
productionItemSchema.index({ productionPlanId: 1, normalizedProductName: 1, unit: 1, deletedAt: 1 }, { unique: true });
productionItemSchema.index({ productionPlanId: 1, status: 1, dueAt: 1, deletedAt: 1 });

const productionRuleSchema = new Schema({
  name: { type: String, required: true, trim: true, index: true },
  packageId: { type: Schema.Types.ObjectId, ref: 'PackageTemplate', index: true },
  serviceId: { type: Schema.Types.ObjectId, ref: 'ServiceExtra', index: true },
  productId: { type: Schema.Types.ObjectId, ref: 'CatalogItem', required: true, index: true },
  eventType: { type: String, trim: true, index: true },
  guestsFrom: { type: Number, min: 0 },
  guestsTo: { type: Number, min: 0 },
  quantityPerGuest: { type: Number, min: 0, default: 0 },
  fixedQuantity: { type: Number, min: 0, default: 0 },
  roundingMode: { type: String, enum: ['none', 'ceil', 'floor', 'round', 'package_size'], default: 'ceil' },
  packageSize: { type: Number, min: 0 },
  wastePercentage: { type: Number, min: 0, max: 100, default: 0 },
  salonId: { type: Schema.Types.ObjectId, ref: 'Salon', index: true },
  sectionType: { type: String, enum: ['savory', 'sweet', 'beverages', 'cake', 'bakery', 'kitchen', 'bar', 'miscellaneous'], default: 'miscellaneous' },
  isActive: { type: Boolean, default: true, index: true },
  validFrom: Date,
  validUntil: Date,
  notes: String,
  ...auditFields,
}, { timestamps: true });
productionRuleSchema.index({ salonId: 1, eventType: 1, isActive: 1, validFrom: 1, validUntil: 1 });

export const ProductionPlan = models.ProductionPlan || model('ProductionPlan', productionPlanSchema);
export const ProductionSection = models.ProductionSection || model('ProductionSection', productionSectionSchema);
export const ProductionItem = models.ProductionItem || model('ProductionItem', productionItemSchema);
export const ProductionRule = models.ProductionRule || model('ProductionRule', productionRuleSchema);
