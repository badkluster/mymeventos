import { Schema, model, models } from 'mongoose';

const eventTypes = ['birthday', 'wedding', 'fifteen', 'graduates', 'corporate', 'baptism_communion', 'other'] as const;

const extraServiceSchema = new Schema({
  name: { type: String, required: true, trim: true },
  description: String,
  basePrice: { type: Number, default: 0 },
  active: { type: Boolean, default: true },
  applicablePackageIds: [{ type: Schema.Types.ObjectId, ref: 'PackageTemplate' }],
  includedByDefault: { type: Boolean, default: false },
  publicVisible: { type: Boolean, default: false }
}, { _id: true });

const salonMediaSchema = new Schema({
  url: { type: String, required: true },
  secureUrl: String,
  publicId: String,
  resourceType: { type: String, enum: ['image', 'video', 'raw'], default: 'image' },
  format: String,
  title: String,
  altText: String,
  displayOrder: { type: Number, default: 0 },
  publicVisible: { type: Boolean, default: true },
  bytes: Number,
  width: Number,
  height: Number,
  duration: Number
}, { _id: true });

const attendanceLocationRuleSchema = new Schema({
  latitude: Number,
  longitude: Number,
  allowedRadiusMeters: { type: Number, default: 150 },
  requireLocation: { type: Boolean, default: false },
  // What happens to a clock-in/out captured outside allowedRadiusMeters:
  //  - 'allow': accepted and treated as valid.
  //  - 'flag': accepted but the WorkSession is marked requiresReview.
  //  - 'block': rejected outright (ATTENDANCE_OUTSIDE_GEOFENCE).
  //  - 'require_reason': accepted only if the punch includes a note; otherwise blocked.
  outsideAreaPolicy: { type: String, enum: ['allow', 'flag', 'block', 'require_reason'], default: 'flag' }
}, { _id: false });

const salonSchema = new Schema({
  name: { type: String, required: true, trim: true, unique: true },
  slug: { type: String, required: true, trim: true, lowercase: true, unique: true, index: true },
  address: String,
  city: String,
  locality: String,
  province: String,
  phone: String,
  whatsapp: String,
  email: String,
  instagramUrl: String,
  facebookUrl: String,
  tiktokUrl: String,
  managerUserId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
  active: { type: Boolean, default: true, index: true },
  internalDescription: String,
  publicTitle: String,
  publicDescription: String,
  publicShortDescription: String,
  visibleOnWebsite: { type: Boolean, default: true, index: true },
  displayOrder: { type: Number, default: 0, index: true },
  minCapacity: { type: Number, default: 0 },
  maxCapacity: { type: Number, default: 0 },
  recommendedCapacity: { type: Number, default: 0 },
  allowedEventTypes: { type: [{ type: String, enum: eventTypes }], default: [] },
  defaultStartTime: String,
  defaultEndTime: String,
  defaultDurationHours: { type: Number, default: 8 },
  allowsExtraHour: { type: Boolean, default: true },
  extraHourPrice: { type: Number, default: 0 },
  operationalNotes: String,
  defaultDepositAmount: { type: Number, default: 0 },
  minimumDepositAmount: { type: Number, default: 0 },
  defaultSecurityDepositAmount: { type: Number, default: 0 },
  defaultLateFeePercentage: { type: Number, default: 0 },
  defaultPaymentTerms: String,
  defaultQuoteValidityDays: { type: Number, default: 7 },
  defaultContractTerms: String,
  commercialNotes: String,
  activePromotionIds: [{ type: Schema.Types.ObjectId }],
  heroImageUrl: String,
  galleryImageUrls: { type: [String], default: [] },
  mediaGallery: { type: [salonMediaSchema], default: [] },
  seoTitle: String,
  seoDescription: String,
  locationText: String,
  mapUrl: String,
  extraServices: { type: [extraServiceSchema], default: [] },
  attendanceLocationRule: { type: attendanceLocationRuleSchema, default: undefined },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  deletedAt: { type: Date, default: null, index: true },
  deletedBy: { type: Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

export const Salon = models.Salon || model('Salon', salonSchema);
