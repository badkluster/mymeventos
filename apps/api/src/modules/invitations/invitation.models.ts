import { model, models, Schema } from 'mongoose';

export const invitationStatuses = ['draft', 'published', 'unpublished', 'expired', 'cancelled'] as const;
export const invitationGuestStatuses = ['pending', 'sent', 'viewed', 'confirmed', 'declined', 'partially_confirmed', 'expired', 'cancelled'] as const;

const baseFields = {
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  deletedAt: { type: Date, default: null, index: true },
  deletedBy: { type: Schema.Types.ObjectId, ref: 'User' }
};

const digitalInvitationSchema = new Schema({
  ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  title: { type: String, required: true, trim: true },
  honoreeName: { type: String, trim: true },
  eventDate: Date,
  address: { type: String, trim: true },
  mapsUrl: { type: String, trim: true },
  coverImageUrl: { type: String, trim: true },
  gallery: { type: [String], default: [] },
  introduction: { type: String, trim: true },
  dressCode: { type: String, trim: true },
  additionalInfo: { type: String, trim: true },
  rsvpDeadline: Date,
  expiresAt: Date,
  status: { type: String, enum: invitationStatuses, default: 'draft', index: true },
  templateId: { type: Schema.Types.ObjectId, ref: 'InvitationTemplate', index: true },
  template: { type: String, trim: true, default: 'classic' },
  templateTier: { type: String, enum: ['basic', 'premium'], default: 'basic', index: true },
  templateFeatures: { type: Schema.Types.Mixed },
  celebrationType: { type: String, enum: ['wedding', 'fifteen', 'birthday', 'kids', 'baby_shower', 'baptism', 'communion', 'anniversary', 'corporate', 'general', 'other'], default: 'general', index: true },
  theme: { primaryColor: String, secondaryColor: String, backgroundColor: String, surfaceColor: String, textColor: String, mutedTextColor: String, accentColor: String, headingFont: String, bodyFont: String, headingWeight: Number, bodyWeight: Number, borderRadius: Number, buttonStyle: String, cardStyle: String, contentMaxWidth: Number },
  generalBackground: { type: Schema.Types.Mixed },
  content: { type: Schema.Types.Mixed, default: () => ({ sections: [] }) },
  media: { type: [Schema.Types.Mixed], default: [] },
  allowCompanions: { type: Boolean, default: true },
  maxCompanions: { type: Number, min: 0, default: 0 },
  allowMinors: { type: Boolean, default: true },
  allowResponseChanges: { type: Boolean, default: true },
  confirmationMessage: { type: String, trim: true },
  publicToken: { type: String, required: true, unique: true, index: true },
  publicTokenCreatedAt: { type: Date, default: Date.now },
  publishedAt: Date,
  unpublishedAt: Date,
  ...baseFields
}, { timestamps: true });
digitalInvitationSchema.index({ ownerId: 1, status: 1, deletedAt: 1 });

const invitationTemplateSchema = new Schema({
  ownerId: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  name: { type: String, required: true, trim: true, maxlength: 120 },
  slug: { type: String, required: true, trim: true, lowercase: true, maxlength: 120 },
  description: { type: String, trim: true, maxlength: 500 },
  category: { type: String, enum: ['wedding', 'fifteen', 'birthday', 'kids', 'baby_shower', 'baptism', 'communion', 'anniversary', 'corporate', 'general'], default: 'general', index: true },
  tier: { type: String, enum: ['basic', 'premium'], default: 'basic', index: true },
  status: { type: String, enum: ['draft', 'active', 'inactive'], default: 'active', index: true },
  tags: { type: [String], default: [] },
  allowedFeatures: { type: Schema.Types.Mixed },
  defaultContent: { type: Schema.Types.Mixed },
  previewImageUrl: { type: String, trim: true },
  theme: { primaryColor: String, secondaryColor: String, backgroundColor: String, surfaceColor: String, textColor: String, mutedTextColor: String, accentColor: String, headingFont: String, bodyFont: String, headingWeight: Number, bodyWeight: Number, borderRadius: Number, buttonStyle: String, cardStyle: String, contentMaxWidth: Number },
  isSystem: { type: Boolean, default: false, index: true },
  isGlobal: { type: Boolean, default: false, index: true },
  salonIds: { type: [Schema.Types.ObjectId], ref: 'Salon', default: [] },
  ...baseFields
}, { timestamps: true });
invitationTemplateSchema.index({ ownerId: 1, slug: 1 }, { unique: true, partialFilterExpression: { ownerId: { $type: 'objectId' } } });
invitationTemplateSchema.index({ isSystem: 1, slug: 1 }, { unique: true, partialFilterExpression: { isSystem: true } });

const invitationGuestSchema = new Schema({
  invitationId: { type: Schema.Types.ObjectId, ref: 'DigitalInvitation', required: true, index: true },
  firstName: { type: String, required: true, trim: true },
  lastName: { type: String, trim: true },
  phone: { type: String, trim: true },
  email: { type: String, trim: true, lowercase: true },
  assignedSeats: { type: Number, min: 1, default: 1 },
  adults: { type: Number, min: 0, default: 0 },
  minors: { type: Number, min: 0, default: 0 },
  companions: { type: Number, min: 0, default: 0 },
  status: { type: String, enum: invitationGuestStatuses, default: 'pending', index: true },
  respondedAt: Date,
  notes: { type: String, trim: true },
  dietaryRestrictions: { type: String, trim: true },
  musicRequest: { type: String, trim: true },
  guestMessage: { type: String, trim: true },
  deliveryChannel: { type: String, enum: ['manual', 'email', 'whatsapp', 'other'], default: 'manual' },
  sentAt: Date,
  viewedAt: Date,
  publicToken: { type: String, required: true, unique: true, index: true },
  publicTokenCreatedAt: { type: Date, default: Date.now },
  ...baseFields
}, { timestamps: true });
invitationGuestSchema.index({ invitationId: 1, deletedAt: 1, status: 1 });

export const DigitalInvitation = models.DigitalInvitation || model('DigitalInvitation', digitalInvitationSchema);
export const InvitationGuest = models.InvitationGuest || model('InvitationGuest', invitationGuestSchema);
export const InvitationTemplate = models.InvitationTemplate || model('InvitationTemplate', invitationTemplateSchema);

/** Removes the obsolete one-invitation-per-event index from the previous module version. */
export async function dropLegacyInvitationEventIdIndex(): Promise<void> {
  const db = DigitalInvitation.db.db;
  if (!db) return;
  const collections = await db.listCollections({ name: DigitalInvitation.collection.name }, { nameOnly: true }).toArray();
  if (!collections.length) return;
  const indexes = await DigitalInvitation.collection.indexes();
  const legacyIndex = indexes.find((index: any) => index.name === 'eventId_1' && index.key?.eventId === 1);
  if (legacyIndex?.name) {
    await DigitalInvitation.collection.dropIndex(legacyIndex.name);
    console.info('Removed obsolete DigitalInvitation eventId_1 index.');
  }
}
