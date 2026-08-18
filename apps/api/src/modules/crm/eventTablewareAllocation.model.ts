import { Schema, model, models } from 'mongoose';

/**
 * A reservation is intentionally separate from the physical salon stock.  The
 * same plate can be used by another event on a different day, while the
 * availability for a given event day remains accurate.
 */
const eventTablewareAllocationSchema = new Schema({
  eventId: { type: Schema.Types.ObjectId, ref: 'Event', required: true, index: true },
  salonId: { type: Schema.Types.ObjectId, ref: 'Salon', required: true, index: true },
  salonStockItemId: { type: Schema.Types.ObjectId, ref: 'SalonStockItem', index: true },
  source: { type: String, enum: ['salon_stock', 'external'], required: true },
  itemName: { type: String, required: true, trim: true },
  category: { type: String, default: 'Vajilla', trim: true },
  unit: { type: String, default: 'unidad', trim: true },
  quantity: { type: Number, required: true, min: 1, validate: Number.isInteger },
  eventDay: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/, index: true },
  notes: { type: String, trim: true },
  releasedAt: { type: Date, default: null, index: true },
  releasedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  releaseReason: { type: String, trim: true },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

eventTablewareAllocationSchema.index({ eventId: 1, salonStockItemId: 1 }, { unique: true, partialFilterExpression: { salonStockItemId: { $exists: true } } });
eventTablewareAllocationSchema.index({ salonStockItemId: 1, eventDay: 1, releasedAt: 1 });
eventTablewareAllocationSchema.index({ salonId: 1, eventDay: 1, releasedAt: 1 });

export const EventTablewareAllocation = models.EventTablewareAllocation || model('EventTablewareAllocation', eventTablewareAllocationSchema);
