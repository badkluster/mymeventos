// Pure helpers for commercial conversion tracking. Kept free of React/DOM state so
// the GA4 dataLayer contract can be unit tested without a browser.

export type VenueCode = 'la_plata' | 'villa_elisa' | 'san_carlos';
export type ContactChannel = 'whatsapp' | 'phone' | 'form';

type VenueLike = { slug?: string; name?: string; publicTitle?: string; locality?: string; city?: string };

// Same codes the /whatsapp selector already sends (la_plata / villa_elisa / san_carlos).
// San Carlos and Villa Elisa are checked first because their city is often stored as
// "La Plata".
const venueTargets: Array<[VenueCode, string]> = [['san_carlos', 'san carlos'], ['villa_elisa', 'villa elisa'], ['la_plata', 'la plata']];

function normalize(value?: string) {
  return (value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/-/g, ' ').trim();
}

export function venueCodeForSalon(salon?: VenueLike | null): VenueCode | undefined {
  if (!salon) return undefined;
  const values = [salon.slug, salon.name, salon.publicTitle, salon.locality, salon.city].map(normalize).filter(Boolean);
  return venueTargets.find(([, target]) => values.some((value) => value === target || value.endsWith(` ${target}`)))?.[0];
}

// Only pages dedicated to one salon resolve to a venue. Generic La Plata landings
// (fiestas de 15, casamientos, etc.) intentionally stay unassigned; page_path keeps them
// distinguishable without inventing a venue.
const venuePaths: Record<string, VenueCode> = {
  '/salones/la-plata': 'la_plata',
  '/salones/villa-elisa': 'villa_elisa',
  '/salon-eventos-villa-elisa': 'villa_elisa',
  '/salones/san-carlos': 'san_carlos',
  '/salon-fiestas-san-carlos': 'san_carlos',
};

export function venueCodeFromPath(pathname: string): VenueCode | undefined {
  return venuePaths[pathname.replace(/\/+$/, '') || '/'];
}

// Stable reporting labels, independent of the editable public titles in the CMS.
export const venueNames: Record<VenueCode, string> = {
  la_plata: 'M&M La Plata',
  villa_elisa: 'M&M Villa Elisa',
  san_carlos: 'M&M San Carlos',
};

export function isVenueCode(value: unknown): value is VenueCode {
  return value === 'la_plata' || value === 'villa_elisa' || value === 'san_carlos';
}

const whatsappHosts = /(^|\.)(wa\.me|whatsapp\.com)$/i;

// Classifies a click by its real destination. Links to the internal /whatsapp selector
// or buttons that only open the salon picker are intermediate steps, not contacts, so
// they no longer count as whatsapp_click.
export function classifyContactHref(href: string): 'whatsapp_click' | 'phone_click' | null {
  if (!href) return null;
  if (/^tel:/i.test(href)) return 'phone_click';
  try {
    const url = new URL(href);
    if ((url.protocol === 'https:' || url.protocol === 'http:') && whatsappHosts.test(url.hostname)) return 'whatsapp_click';
    if (url.protocol === 'whatsapp:') return 'whatsapp_click';
  } catch {
    return null;
  }
  return null;
}

export type Ga4Detail = {
  sectionId?: string;
  elementId?: string;
  entityId?: string;
  venueId?: string;
};

export type Ga4Context = { pagePath: string; utm?: Record<string, string> };

const ga4EventMapping: Record<string, string> = {
  whatsapp_click: 'whatsapp_click',
  phone_click: 'phone_click',
  form_start: 'form_start',
  form_submit: 'form_submit',
  form_success: 'generate_lead',
  salon_view: 'salon_view',
  package_view: 'package_view',
  promotion_click: 'promotion_click',
};

const contactChannels: Record<string, ContactChannel> = {
  whatsapp_click: 'whatsapp',
  phone_click: 'phone',
  form_start: 'form',
  form_submit: 'form',
  generate_lead: 'form',
};

// Builds the dataLayer payload for one first-party analytics event. Returns null for
// events GA4 does not receive. Conversion events always carry venue_id, venue_name,
// contact_channel and page_path (explicitly undefined when unknown) so a value from a
// previous push never leaks into the next one through GTM's data layer model. No
// names, phones or emails ever reach this payload.
export function buildGa4Payload(eventName: string, detail: Ga4Detail, context: Ga4Context): Record<string, unknown> | null {
  const ga4EventName = ga4EventMapping[eventName];
  if (!ga4EventName) return null;
  const utm = context.utm ?? {};
  const payload: Record<string, unknown> = {
    event: ga4EventName,
    section_id: detail.sectionId,
    element_id: detail.elementId,
    entity_id: detail.entityId,
  };
  if (ga4EventName === 'generate_lead') payload.lead_id = detail.entityId;
  if (ga4EventName === 'salon_view') {
    payload.salon_id = detail.entityId;
    payload.salon_name = detail.elementId;
  }
  if (ga4EventName === 'package_view') {
    payload.package_id = detail.entityId;
    payload.package_name = detail.elementId;
  }
  if (ga4EventName === 'promotion_click') {
    payload.promotion_id = detail.entityId;
    payload.promotion_name = detail.elementId;
  }
  if (ga4EventName === 'whatsapp_click') {
    // Kept for the existing attribution consumers that read `salon`.
    payload.salon = detail.entityId;
    payload.utm_source = utm.utmSource || undefined;
    payload.utm_medium = utm.utmMedium || undefined;
    payload.utm_campaign = utm.utmCampaign || undefined;
    payload.utm_content = utm.utmContent || undefined;
    payload.utm_term = utm.utmTerm || undefined;
  }
  const channel = contactChannels[ga4EventName];
  if (channel) {
    const entityVenue = (ga4EventName === 'whatsapp_click' || ga4EventName === 'phone_click') && isVenueCode(detail.entityId) ? detail.entityId : undefined;
    const venueId = (isVenueCode(detail.venueId) ? detail.venueId : undefined) ?? entityVenue ?? venueCodeFromPath(context.pagePath);
    payload.venue_id = venueId;
    payload.venue_name = venueId ? venueNames[venueId] : undefined;
    payload.contact_channel = channel;
    payload.page_path = context.pagePath;
  }
  return payload;
}
