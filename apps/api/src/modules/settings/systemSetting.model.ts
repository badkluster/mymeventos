import { Schema, model, models } from 'mongoose';
const systemSettingSchema = new Schema({ key: { type: String, required: true, unique: true }, value: { type: Schema.Types.Mixed, required: true }, description: String, createdBy: { type: Schema.Types.ObjectId, ref: 'User' }, updatedBy: { type: Schema.Types.ObjectId, ref: 'User' } }, { timestamps: true });
export const SystemSetting = models.SystemSetting || model('SystemSetting', systemSettingSchema);
