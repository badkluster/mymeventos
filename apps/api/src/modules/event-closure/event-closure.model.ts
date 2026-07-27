import { Schema, model, models } from 'mongoose';

const closureStageSchema = new Schema({
  status: { type: String, enum: ['open', 'closed'], default: 'open', required: true },
  closedAt: Date,
  closedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  reopenedAt: Date,
  reopenedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  reopenReason: String,
  notes: String,
  checklistSnapshot: Schema.Types.Mixed,
}, { _id: false });

const eventClosureSchema = new Schema({
  eventId: { type: Schema.Types.ObjectId, ref: 'Event', required: true, unique: true, index: true },
  salonId: { type: Schema.Types.ObjectId, ref: 'Salon', required: true, index: true },
  operational: { type: closureStageSchema, default: () => ({ status: 'open' }) },
  financial: { type: closureStageSchema, default: () => ({ status: 'open' }) },
  administrative: { type: closureStageSchema, default: () => ({ status: 'open' }) },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  deletedAt: { type: Date, default: null, index: true },
  deletedBy: { type: Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

eventClosureSchema.index({ salonId: 1, 'administrative.status': 1, deletedAt: 1 });

export const EventClosure = models.EventClosure || model('EventClosure', eventClosureSchema);
