import { Schema, model, models } from 'mongoose';

const base = {
  active: { type: Boolean, default: true, index: true },
  displayOrder: { type: Number, default: 0, index: true },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  deletedAt: { type: Date, default: null, index: true },
  deletedBy: { type: Schema.Types.ObjectId, ref: 'User' },
};

const landingSettingsSchema = new Schema({
  key: { type: String, default: 'default', unique: true, index: true },
  heroTitle: { type: String, default: 'Tu evento, en el lugar que siempre soñaste' },
  heroSubtitle: { type: String, default: 'Salones únicos, catering premium, ambientación, DJ y organización integral para que disfrutes sin preocupaciones.' },
  heroImageUrl: String,
  heroPrimaryCtaLabel: { type: String, default: 'Solicitá presupuesto' },
  heroSecondaryCtaLabel: { type: String, default: 'Ver salones' },
  whatsappNumber: String,
  whatsappDefaultMessage: { type: String, default: 'Hola M&M Eventos, quiero solicitar un presupuesto para mi evento.' },
  contactEmail: String,
  contactPhone: String,
  instagramUrl: String,
  facebookUrl: String,
  tiktokUrl: String,
  footerText: String,
  seoTitle: String,
  seoDescription: String,
  openGraphImageUrl: String,
  ...base,
}, { timestamps: true });

const promotionSchema = new Schema({
  title: { type: String, required: true, trim: true, index: true },
  subtitle: String,
  description: String,
  imageUrl: String,
  badgeText: String,
  startsAt: Date,
  endsAt: Date,
  visibleOnHome: { type: Boolean, default: true, index: true },
  ctaLabel: String,
  ctaLink: String,
  applicableSalonIds: [{ type: Schema.Types.ObjectId, ref: 'Salon', index: true }],
  applicablePackageIds: [{ type: Schema.Types.ObjectId, ref: 'PackageTemplate', index: true }],
  highlightColor: String,
  ...base,
}, { timestamps: true });

const galleryItemSchema = new Schema({
  title: { type: String, required: true, trim: true },
  description: String,
  imageUrl: { type: String, required: true },
  altText: String,
  category: { type: String, default: 'Otros', index: true },
  salonId: { type: Schema.Types.ObjectId, ref: 'Salon', index: true },
  eventType: String,
  featured: { type: Boolean, default: false, index: true },
  ...base,
}, { timestamps: true });

const testimonialSchema = new Schema({
  quote: { type: String, required: true, trim: true },
  customerName: { type: String, required: true, trim: true },
  eventType: String,
  rating: { type: Number, min: 1, max: 5, default: 5 },
  imageUrl: String,
  featured: { type: Boolean, default: false, index: true },
  ...base,
}, { timestamps: true });

const faqSchema = new Schema({
  question: { type: String, required: true, trim: true },
  answer: { type: String, required: true, trim: true },
  category: String,
  ...base,
}, { timestamps: true });

const serviceBlockSchema = new Schema({
  title: { type: String, required: true, trim: true },
  description: String,
  icon: { type: String, default: 'Sparkles' },
  section: { type: String, default: 'services', index: true },
  ...base,
}, { timestamps: true });

const eventTypeSchema = new Schema({
  title: { type: String, required: true, trim: true },
  description: String,
  icon: { type: String, default: 'Sparkles' },
  imageUrl: String,
  ...base,
}, { timestamps: true });

export const LandingSettings = models.LandingSettings || model('LandingSettings', landingSettingsSchema);
export const LandingPromotion = models.LandingPromotion || model('LandingPromotion', promotionSchema);
export const LandingGalleryItem = models.LandingGalleryItem || model('LandingGalleryItem', galleryItemSchema);
export const LandingTestimonial = models.LandingTestimonial || model('LandingTestimonial', testimonialSchema);
export const LandingFaq = models.LandingFaq || model('LandingFaq', faqSchema);
export const LandingServiceBlock = models.LandingServiceBlock || model('LandingServiceBlock', serviceBlockSchema);
export const LandingEventType = models.LandingEventType || model('LandingEventType', eventTypeSchema);
