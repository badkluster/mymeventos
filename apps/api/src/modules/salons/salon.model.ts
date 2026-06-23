import { Schema, model, models } from 'mongoose';
const salonSchema = new Schema({ name: { type: String, required: true, trim: true, unique: true }, address: String, phone: String, email: String, active: { type: Boolean, default: true, index: true }, createdBy: { type: Schema.Types.ObjectId, ref: 'User' }, updatedBy: { type: Schema.Types.ObjectId, ref: 'User' }, deletedAt: { type: Date, default: null, index: true }, deletedBy: { type: Schema.Types.ObjectId, ref: 'User' } }, { timestamps: true });
export const Salon = models.Salon || model('Salon', salonSchema);
