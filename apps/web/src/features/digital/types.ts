export type InvitationGuest = {
  _id: string;
  firstName?: string;
  lastName?: string;
  fullName?: string;
  email?: string;
  phone?: string;
  assignedSeats?: number;
  adults?: number;
  minors?: number;
  companions?: number;
  status?: string;
  rsvpStatus?: string;
  dietaryRestrictions?: string;
  musicRequest?: string;
  guestMessage?: string;
  publicToken?: string;
  confirmedAt?: string;
};
export type InvitationTemplateCategory =
  | "wedding"
  | "fifteen"
  | "birthday"
  | "kids"
  | "baby_shower"
  | "baptism"
  | "communion"
  | "anniversary"
  | "corporate"
  | "general";
export type InvitationTemplateTier = "basic" | "premium";
export type InvitationTemplateFeatures = {
  maxGalleryImages: number;
  maxSections: number;
  allowCustomColors: boolean;
  allowCustomFonts: boolean;
  allowCustomBackgrounds: boolean;
  allowSectionBackgrounds: boolean;
  allowMusic: boolean;
  allowVideoHero: boolean;
  allowAnimations: boolean;
  allowAdvancedAnimations: boolean;
  allowCountdown: boolean;
  allowSchedule: boolean;
  allowGiftSection: boolean;
  allowMap: boolean;
  allowPersonalizedRecipients: boolean;
  allowAdvancedGallery: boolean;
  allowCustomDividers: boolean;
  allowMultipleLocations: boolean;
};
export type InvitationTheme = {
  primaryColor?: string;
  secondaryColor?: string;
  backgroundColor?: string;
  surfaceColor?: string;
  textColor?: string;
  mutedTextColor?: string;
  accentColor?: string;
  headingFont?: string;
  bodyFont?: string;
  headingWeight?: number;
  bodyWeight?: number;
  borderRadius?: number;
  buttonStyle?: "solid" | "outline" | "soft" | "pill";
  cardStyle?: "flat" | "bordered" | "elevated" | "glass";
  contentMaxWidth?: number;
};
export type InvitationSectionBackground = {
  type: "transparent" | "solid" | "gradient" | "image" | "video";
  color?: string;
  gradient?: { direction: string; from: string; to: string };
  image?: {
    url: string;
    storageKey?: string;
    altText?: string;
    positionX?: number;
    positionY?: number;
    fit?: "cover" | "contain";
    overlayColor?: string;
    overlayOpacity?: number;
    blur?: number;
  };
  video?: {
    url: string;
    posterUrl?: string;
    muted: true;
    loop: boolean;
    overlayColor?: string;
    overlayOpacity?: number;
  };
};
export type InvitationMedia = {
  id: string;
  type: "image" | "video" | "audio";
  url: string;
  storageKey?: string;
  filename?: string;
  mimeType?: string;
  size?: number;
  width?: number;
  height?: number;
  altText?: string;
  caption?: string;
  focalPoint?: { x: number; y: number };
};
export type InvitationSectionType =
  | "opening"
  | "hero"
  | "welcome"
  | "hosts"
  | "event_details"
  | "countdown"
  | "message"
  | "custom"
  | "gallery"
  | "schedule"
  | "venue"
  | "map"
  | "dress_code"
  | "gift_registry"
  | "music"
  | "rsvp"
  | "contact"
  | "share"
  | "footer";
export type InvitationSection = {
  id: string;
  type: InvitationSectionType;
  enabled: boolean;
  order: number;
  variant?: string;
  layout?: "full" | "contained" | "split" | "overlap";
  background: InvitationSectionBackground;
  textStyle?: {
    alignment?: "left" | "center" | "right";
    headingColor?: string;
    textColor?: string;
    headingFont?: string;
    bodyFont?: string;
    headingSize?: number;
    bodySize?: number;
  };
  spacing?: {
    paddingTop?: number;
    paddingBottom?: number;
    paddingLeft?: number;
    paddingRight?: number;
  };
  animation?: {
    type?: "none" | "fade" | "slide_up" | "zoom" | "reveal";
    duration?: number;
    delay?: number;
  };
  data: Record<string, unknown>;
};
export type InvitationContent = { sections: InvitationSection[] };
export type InvitationTemplate = {
  _id: string;
  name: string;
  slug: string;
  description?: string;
  category?: InvitationTemplateCategory;
  tier?: InvitationTemplateTier;
  status?: "draft" | "active" | "inactive";
  tags?: string[];
  previewImageUrl?: string;
  theme?: InvitationTheme;
  allowedFeatures?: InvitationTemplateFeatures;
  defaultContent?: InvitationContent;
  isSystem?: boolean;
  isGlobal?: boolean;
  salonIds?: string[];
};
export type DigitalInvitation = {
  _id: string;
  ownerId?: string;
  linkedEventId?: string;
  templateId?: string | InvitationTemplate;
  template?: string;
  templateTier?: InvitationTemplateTier;
  templateFeatures?: InvitationTemplateFeatures;
  celebrationType?: InvitationTemplateCategory | "other";
  title?: string;
  honoreeName?: string;
  eventDate?: string;
  startTime?: string;
  venueName?: string;
  address?: string;
  mapsUrl?: string;
  coverImage?: string;
  coverImageUrl?: string;
  gallery?: string[];
  introText?: string;
  introduction?: string;
  dressCode?: string;
  additionalInfo?: string;
  rsvpDeadline?: string;
  status?: string;
  publicToken?: string;
  slug?: string;
  theme?: InvitationTheme;
  generalBackground?: InvitationSectionBackground;
  content?: InvitationContent;
  media?: InvitationMedia[];
  allowCompanions?: boolean;
  maxCompanions?: number;
  confirmationMessage?: string;
  guests?: InvitationGuest[];
};
export type TicketType = {
  _id: string;
  name: string;
  description?: string;
  price?: number;
  promotionalPrice?: number;
  promotionalStartsAt?: string;
  promotionalEndsAt?: string;
  currentPrice?: number;
  isPromotionActive?: boolean;
  capacity?: number;
  soldCount?: number;
  reservedCount?: number;
  minPerOrder?: number;
  maxPerOrder?: number;
  color?: string;
  status?: string;
  available?: number;
  availableCount?: number;
};
export type TicketPublication = {
  _id: string;
  title: string;
  slug?: string;
  status?: string;
  startsAt?: string;
  endsAt?: string;
  venueName?: string;
  address?: string;
  mapsUrl?: string;
  coverImage?: string;
  description?: string;
  shortDescription?: string;
  fullDescription?: string;
  gallery?: string[];
  accessInfo?: string;
  restrictions?: string;
  termsAndConditions?: string;
  cancellationPolicy?: string;
  refundPolicy?: string;
  organizer?: {
    name?: string;
    email?: string;
    phone?: string;
    website?: string;
    instagram?: string;
  };
  appearance?: {
    primaryColor?: string;
    secondaryColor?: string;
    backgroundColor?: string;
    textColor?: string;
  };
  capacity?: number;
  availableCount?: number;
  maxTicketsPerOrder?: number;
  internalName?: string;
  category?: string;
  soldCount?: number;
  reservedCount?: number;
  revenue?: number;
  updatedAt?: string;
  visibility?: {
    isPublic?: boolean;
    showInPublicCatalog?: boolean;
  };
  location?: { mapsUrl?: string };
  ticketTypes?: TicketType[];
};
export type TicketOrder = {
  _id: string;
  orderNumber?: string;
  buyerName?: string;
  buyerEmail?: string;
  buyerPhone?: string;
  status?: string;
  paymentStatus?: string;
  totalAmount?: number;
  tickets?: DigitalTicket[];
  createdAt?: string;
};
export type DigitalTicket = {
  _id: string;
  publicToken?: string;
  ticketCode?: string;
  attendeeName?: string;
  status?: string;
  ticketTypeId?: string | TicketType;
  ticketTypeName?: string;
  publicationName?: string;
  startsAt?: string;
  venueName?: string;
  address?: string;
  qrCodeDataUrl?: string;
  qrDataUrl?: string;
  usedAt?: string;
  orderId?: string | TicketOrder;
  type?: TicketType;
};
export type CheckInResult = {
  ticket?: {
    _id?: string;
    ticketCode?: string;
    attendeeName?: string;
    status?: string;
    ticketTypeName?: string;
    checkedInAt?: string;
  };
  status?: string;
  message?: string;
  alreadyUsed?: boolean;
  valid?: boolean;
};
export const fullName = (person: Partial<InvitationGuest>) =>
  person.fullName ||
  [person.firstName, person.lastName].filter(Boolean).join(" ") ||
  "Invitado sin nombre";
// `startsAt`/`endsAt` son instantes reales (fecha y hora de la entrada/publicación) — se
// muestran en hora de Argentina siempre, sin depender del huso horario del navegador de quien
// mira la pantalla (staff viajando, etc.).
export const formatDateTime = (value?: string) =>
  value
    ? new Intl.DateTimeFormat("es-AR", {
        dateStyle: "full",
        timeStyle: "short",
        timeZone: "America/Argentina/Buenos_Aires",
      }).format(new Date(value))
    : "Fecha a confirmar";
export const money = (value?: number) =>
  new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(value ?? 0);
