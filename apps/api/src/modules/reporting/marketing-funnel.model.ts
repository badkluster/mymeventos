import { Schema, model, models } from 'mongoose';

// Meta no entrega una dimensión "salón" para una conversación iniciada. Esta
// asignación, cargada por una persona autorizada desde el producto, es la fuente
// explícita para repartir métricas de campaña entre las unidades comerciales.
// No se infiere a partir del nombre de la campaña ni se completa el histórico.
const metaCampaignSalonAssignmentSchema = new Schema({
  campaignId: { type: String, required: true, trim: true, unique: true, index: true },
  salonId: { type: Schema.Types.ObjectId, ref: 'Salon', required: true, index: true },
  active: { type: Boolean, default: true, index: true },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

metaCampaignSalonAssignmentSchema.index({ salonId: 1, active: 1 });

export const MetaCampaignSalonAssignment = models.MetaCampaignSalonAssignment
  || model('MetaCampaignSalonAssignment', metaCampaignSalonAssignmentSchema);
