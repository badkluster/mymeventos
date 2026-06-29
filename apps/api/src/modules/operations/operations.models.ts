import { Schema, model, models } from 'mongoose';
import {
  BeverageType,
  CatalogItemType,
  ConsumptionRuleTarget,
  InventoryAdjustmentType,
  InventoryCategory,
  InventoryItemType,
  RoundingMode,
  ServiceExtraType,
  SupplierCategory,
} from '@mym/shared';

const base = {
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  deletedAt: { type: Date, default: null, index: true },
  deletedBy: { type: Schema.Types.ObjectId, ref: 'User' },
};

const supplierSchema = new Schema({
  name: { type: String, required: true, trim: true, index: true },
  businessName: { type: String, trim: true },
  taxId: { type: String, trim: true, index: true },
  phone: String,
  whatsapp: String,
  email: String,
  address: String,
  category: { type: String, enum: Object.values(SupplierCategory), default: SupplierCategory.OTHER, index: true },
  contactPerson: String,
  notes: String,
  active: { type: Boolean, default: true, index: true },
  ...base,
}, { timestamps: true });

const catalogItemSchema = new Schema({
  name: { type: String, required: true, trim: true, index: true },
  description: String,
  type: { type: String, enum: Object.values(CatalogItemType), required: true, index: true },
  category: { type: String, enum: Object.values(InventoryCategory), default: InventoryCategory.OTHER, index: true },
  beverageType: { type: String, enum: Object.values(BeverageType) },
  unitOfMeasure: { type: String, required: true, trim: true },
  unitSize: Number,
  unitCost: { type: Number, default: 0 },
  suggestedSalePrice: { type: Number, default: 0 },
  markupPercentage: Number,
  supplierId: { type: Schema.Types.ObjectId, ref: 'Supplier', index: true },
  active: { type: Boolean, default: true, index: true },
  notes: String,
  ...base,
}, { timestamps: true });

const serviceExtraSchema = new Schema({
  name: { type: String, required: true, trim: true, index: true },
  description: String,
  type: { type: String, enum: Object.values(ServiceExtraType), default: ServiceExtraType.FIXED_PRICE, index: true },
  basePrice: { type: Number, default: 0 },
  cost: { type: Number, default: 0 },
  pricePerPerson: Number,
  pricePerHour: Number,
  pricePerUnit: Number,
  applicableSalonIds: [{ type: Schema.Types.ObjectId, ref: 'Salon', index: true }],
  supplierId: { type: Schema.Types.ObjectId, ref: 'Supplier', index: true },
  active: { type: Boolean, default: true, index: true },
  notes: String,
  ...base,
}, { timestamps: true });

const inventoryItemSchema = new Schema({
  name: { type: String, required: true, trim: true, index: true },
  description: String,
  type: { type: String, enum: Object.values(InventoryItemType), required: true, index: true },
  category: { type: String, enum: Object.values(InventoryCategory), required: true, index: true },
  catalogItemId: { type: Schema.Types.ObjectId, ref: 'CatalogItem', index: true },
  salonId: { type: Schema.Types.ObjectId, ref: 'Salon', index: true },
  unitOfMeasure: { type: String, required: true, trim: true },
  currentQuantity: { type: Number, default: 0 },
  minimumQuantity: { type: Number, default: 0 },
  reservedQuantity: { type: Number, default: 0 },
  damagedQuantity: { type: Number, default: 0 },
  lostQuantity: { type: Number, default: 0 },
  replacementCost: Number,
  rentalPrice: Number,
  active: { type: Boolean, default: true, index: true },
  notes: String,
  ...base,
}, { timestamps: true });

const inventoryAdjustmentSchema = new Schema({
  inventoryItemId: { type: Schema.Types.ObjectId, ref: 'InventoryItem', required: true, index: true },
  type: { type: String, enum: Object.values(InventoryAdjustmentType), required: true, index: true },
  quantity: { type: Number, required: true, min: 0 },
  reason: String,
  eventId: { type: Schema.Types.ObjectId, ref: 'Event', index: true },
  supplierId: { type: Schema.Types.ObjectId, ref: 'Supplier', index: true },
  notes: String,
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: { createdAt: true, updatedAt: false } });

const consumptionRuleSchema = new Schema({
  name: { type: String, required: true, trim: true, index: true },
  description: String,
  active: { type: Boolean, default: true, index: true },
  salonId: { type: Schema.Types.ObjectId, ref: 'Salon', index: true },
  eventType: { type: String, trim: true, index: true },
  catalogItemId: { type: Schema.Types.ObjectId, ref: 'CatalogItem', index: true },
  serviceExtraId: { type: Schema.Types.ObjectId, ref: 'ServiceExtra', index: true },
  target: { type: String, enum: Object.values(ConsumptionRuleTarget), required: true, index: true },
  quantityPerTarget: { type: Number, required: true, min: 0 },
  unitOfMeasure: { type: String, required: true, trim: true },
  minimumQuantity: Number,
  roundingMode: { type: String, enum: Object.values(RoundingMode), default: RoundingMode.CEIL },
  packageSize: Number,
  appliesWhen: {
    includesAlcohol: Boolean,
    eventType: String,
    minGuests: Number,
    maxGuests: Number,
  },
  notes: String,
  ...base,
}, { timestamps: true });

export const Supplier = models.Supplier || model('Supplier', supplierSchema);
export const CatalogItem = models.CatalogItem || model('CatalogItem', catalogItemSchema);
export const ServiceExtra = models.ServiceExtra || model('ServiceExtra', serviceExtraSchema);
export const InventoryItem = models.InventoryItem || model('InventoryItem', inventoryItemSchema);
export const InventoryAdjustment = models.InventoryAdjustment || model('InventoryAdjustment', inventoryAdjustmentSchema);
export const ConsumptionRule = models.ConsumptionRule || model('ConsumptionRule', consumptionRuleSchema);
