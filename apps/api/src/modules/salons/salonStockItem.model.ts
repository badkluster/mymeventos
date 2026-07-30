import { Schema, model, models } from 'mongoose';

export const salonStockCategories = ['PLATES', 'GLASSWARE', 'DRINKWARE', 'CUTLERY', 'LINENS', 'CLEANING', 'MINOR_EQUIPMENT', 'MISCELLANEOUS'] as const;
export type SalonStockCategory = typeof salonStockCategories[number];

const salonStockItemSchema = new Schema({
  salonId: { type: Schema.Types.ObjectId, ref: 'Salon', required: true, index: true },
  itemKey: { type: String, required: true, trim: true },
  name: { type: String, required: true, trim: true, index: true },
  category: { type: String, enum: salonStockCategories, required: true, index: true },
  currentQuantity: { type: Number, required: true, default: 0, min: 0, validate: Number.isInteger },
  unitOfMeasure: { type: String, required: true, trim: true, default: 'unidad' },
  displayOrder: { type: Number, default: 0, min: 0 },
  stockAsOf: Date,
  active: { type: Boolean, default: true, index: true },
  notes: String,
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  deletedAt: { type: Date, default: null, index: true },
  deletedBy: { type: Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

salonStockItemSchema.index({ salonId: 1, itemKey: 1 }, { unique: true });
salonStockItemSchema.index({ salonId: 1, deletedAt: 1, displayOrder: 1 });

export const SalonStockItem = models.SalonStockItem || model('SalonStockItem', salonStockItemSchema);
