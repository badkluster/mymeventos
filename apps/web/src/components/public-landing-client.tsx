'use client';

/* eslint-disable @next/next/no-img-element */

import Image from 'next/image';
import Link from 'next/link';
import { FormEvent, type MouseEvent, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useMotionValueEvent, useReducedMotion, useScroll, useTransform, type Variants } from 'framer-motion';
import { ArrowRight, Baby, BriefcaseBusiness, CakeSlice, CalendarDays, Camera, Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Clock3, Crown, ExternalLink, Gift, GlassWater, GraduationCap, Heart, LogIn, MapPin, Menu, MessageCircle, Music, PackageCheck, PartyPopper, Send, Sparkles, Star, Utensils, Users, X } from 'lucide-react';
import { api } from '@/lib/api';
import { brandAssets } from '@/lib/brand-assets';
import { localSeoPages, salonSeoPages } from '@/lib/local-seo';
import { analyticsAttributionId, emitAnalyticsEvent } from '@/components/analytics-tracker';

type Media = { url: string; secureUrl?: string; title?: string; altText?: string; resourceType?: string; displayOrder?: number };
type ExtraService = { _id?: string; name: string; description?: string; basePrice?: number; includedByDefault?: boolean };
type SalonManager = { _id?: string; firstName?: string; lastName?: string; fullName?: string; phone?: string; email?: string };
type Salon = { _id: string; name: string; publicTitle?: string; publicShortDescription?: string; publicDescription?: string; heroImageUrl?: string; galleryImageUrls?: string[]; mediaGallery?: Media[]; locationText?: string; locality?: string; city?: string; province?: string; address?: string; mapUrl?: string; phone?: string; email?: string; whatsapp?: string; instagramUrl?: string; facebookUrl?: string; tiktokUrl?: string; manager?: SalonManager; minCapacity?: number; maxCapacity?: number; recommendedCapacity?: number; defaultStartTime?: string; defaultEndTime?: string; defaultDurationHours?: number; defaultDepositAmount?: number; defaultPaymentTerms?: string; extraServices?: ExtraService[]; packages?: Package[] };
type Package = { _id: string; name: string; salonId?: string; salonName?: string; description?: string; notes?: string; durationHours?: number; startTime?: string; endTime?: string; pricingMode?: 'per_person' | 'fixed'; pricePerPerson?: number; finalPricePerPerson?: number; fixedPrice?: number; finalFixedPrice?: number; depositAmount?: number; paymentTerms?: string; promotionText?: string; giftText?: string; includedServices?: string[]; menuSections?: { title?: string; name?: string; items: string[] }[]; badgeLabel?: string; featured?: boolean };
type LandingItem = { _id?: string; title?: string; subtitle?: string; description?: string; imageUrl?: string; altText?: string; category?: string; badgeText?: string; ctaLabel?: string; ctaLink?: string; quote?: string; customerName?: string; eventType?: string; rating?: number; question?: string; answer?: string; icon?: string };
type Settings = { heroTitle?: string; heroSubtitle?: string; heroImageUrl?: string; heroVideoUrl?: string; heroPrimaryCtaLabel?: string; heroSecondaryCtaLabel?: string; whatsappNumber?: string; whatsappDefaultMessage?: string; contactEmail?: string; contactPhone?: string; instagramUrl?: string; facebookUrl?: string; tiktokUrl?: string; footerText?: string };
type LandingPayload = { settings?: Settings; salons: Salon[]; packages: Package[]; promotions: LandingItem[]; gallery: LandingItem[]; testimonials: LandingItem[]; faqs: LandingItem[]; serviceBlocks: LandingItem[]; eventTypes: LandingItem[]; storySteps: LandingItem[] };
const emptyLanding: LandingPayload = { salons: [], packages: [], promotions: [], gallery: [], testimonials: [], faqs: [], serviceBlocks: [], eventTypes: [], storySteps: [] };

const fallbackHero = 'https://images.unsplash.com/photo-1519167758481-83f550bb49b3?auto=format&fit=crop&w=1800&q=80';
const fallbackGallery = [
  'https://images.unsplash.com/photo-1519167758481-83f550bb49b3?auto=format&fit=crop&w=900&q=80',
  'https://images.unsplash.com/photo-1464366400600-7168b8af9bc3?auto=format&fit=crop&w=900&q=80',
  'https://images.unsplash.com/photo-1527529482837-4698179dc6ce?auto=format&fit=crop&w=900&q=80',
  'https://images.unsplash.com/photo-1555244162-803834f70033?auto=format&fit=crop&w=900&q=80',
  'https://images.unsplash.com/photo-1478146896981-b80fe463b330?auto=format&fit=crop&w=900&q=80',
  'https://images.unsplash.com/photo-1511795409834-ef04bbd61622?auto=format&fit=crop&w=900&q=80',
];
const fallbackServices = [
  { title: 'Catering', description: 'Menús gourmet para cada tipo de evento.', icon: 'Utensils' },
  { title: 'Barra y bebidas', description: 'Tragos y bebidas premium durante la noche.', icon: 'GlassWater' },
  { title: 'DJ e iluminación', description: 'Sonido profesional y ambientación lumínica.', icon: 'Music' },
  { title: 'Organización completa', description: 'Coordinación integral antes y durante el evento.', icon: 'Sparkles' },
];
const fallbackEventTypes = [
  { title: '15 años', icon: 'Crown' },
  { title: 'Casamientos', icon: 'Heart' },
  { title: 'Cumpleaños', icon: 'CakeSlice' },
  { title: 'Egresados', icon: 'GraduationCap' },
  { title: 'Empresariales', icon: 'BriefcaseBusiness' },
  { title: 'Infantiles', icon: 'Baby' },
].map((item) => ({ ...item, description: 'Propuestas a medida para celebrar sin preocuparte.' }));
const fallbackStorySteps = [
  { title: 'Nos contás tu idea', description: 'Escuchamos lo que soñás para tu evento.', imageUrl: '/images/story/step-1.jpg' },
  { title: 'Te asesoramos', description: 'Te guiamos para elegir salón, menú y servicios.', imageUrl: '/images/story/step-2.jpg' },
  { title: 'Armamos tu propuesta', description: 'Diseñamos una propuesta clara y personalizada.', imageUrl: '/images/story/step-3.jpg' },
  { title: 'Reservás tu fecha', description: 'Confirmás y asegurás tu fecha.', imageUrl: '/images/story/step-4.jpg' },
];
const fallbackFaqs = [
  { question: '¿Con cuánta anticipación debo reservar?', answer: 'Recomendamos consultar cuanto antes para asegurar disponibilidad y congelar condiciones comerciales.' },
  { question: '¿Puedo visitar el salón antes del evento?', answer: 'Sí, coordinamos una visita para que conozcas el espacio y revisemos tu idea en detalle.' },
  { question: '¿Qué incluye el servicio de catering?', answer: 'Depende del paquete, pero podemos incluir recepción, plato principal, postre, mesa dulce, bebidas y barra.' },
  { question: '¿Se puede congelar el precio con seña?', answer: 'Sí, las condiciones vigentes se pueden reservar abonando la seña indicada en la propuesta.' },
];
const footerSeoLinks = [
  ...localSeoPages.slice(0, 7).map((item) => ({ href: `/${item.slug}`, label: item.title })),
  ...salonSeoPages.map((item) => ({ href: `/salones/${item.slug}`, label: item.title }))
];
const contactPhonePattern = /^[+()\d\s-]{6,24}$/;
const contactGuestMin = 1;
const contactGuestMax = 1000;
const contactMessageMaxWords = 120;
const todayIsoDate = () => new Date().toISOString().slice(0, 10);

const money = (value?: number) => value ? new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(value) : 'Consultar';
const packagePrice = (item: Package) => item.pricingMode === 'fixed' ? item.finalFixedPrice || item.fixedPrice : item.finalPricePerPerson || item.pricePerPerson;
const packagePriceUnit = (item: Package) => item.pricingMode === 'fixed' ? 'precio total' : 'por persona';
const iconMap = { Utensils, GlassWater, Music, Sparkles, PartyPopper, CalendarDays, Gift, Camera, Users, Crown, Heart, CakeSlice, GraduationCap, BriefcaseBusiness, Baby };
const eventTypeIcons: Record<string, keyof typeof iconMap> = {
  '15 anos': 'Crown',
  '15 años': 'Crown',
  casamientos: 'Heart',
  casamiento: 'Heart',
  cumpleanos: 'CakeSlice',
  cumpleaños: 'CakeSlice',
  egresados: 'GraduationCap',
  egresado: 'GraduationCap',
  empresariales: 'BriefcaseBusiness',
  empresarial: 'BriefcaseBusiness',
  infantiles: 'Baby',
  infantil: 'Baby',
};
const sectionAccents = [
  { card: 'border-sky-300/25 bg-sky-400/[0.06] hover:border-sky-200/60', icon: 'border-sky-300/35 bg-sky-400/10 text-sky-100', text: 'text-sky-100', badge: 'border-sky-300/20 bg-sky-400/10 text-sky-100', line: 'bg-sky-300/70' },
  { card: 'border-cyan-300/25 bg-cyan-400/[0.06] hover:border-cyan-200/60', icon: 'border-cyan-300/35 bg-cyan-400/10 text-cyan-100', text: 'text-cyan-100', badge: 'border-cyan-300/20 bg-cyan-400/10 text-cyan-100', line: 'bg-cyan-300/70' },
  { card: 'border-violet-300/25 bg-violet-400/[0.06] hover:border-violet-200/60', icon: 'border-violet-300/35 bg-violet-400/10 text-violet-100', text: 'text-violet-100', badge: 'border-violet-300/20 bg-violet-400/10 text-violet-100', line: 'bg-violet-300/70' },
  { card: 'border-emerald-300/20 bg-emerald-400/[0.055] hover:border-emerald-200/55', icon: 'border-emerald-300/30 bg-emerald-400/10 text-emerald-100', text: 'text-emerald-100', badge: 'border-emerald-300/20 bg-emerald-400/10 text-emerald-100', line: 'bg-emerald-300/65' },
  { card: 'border-rose-300/20 bg-rose-400/[0.055] hover:border-rose-200/50', icon: 'border-rose-300/30 bg-rose-400/10 text-rose-100', text: 'text-rose-100', badge: 'border-rose-300/20 bg-rose-400/10 text-rose-100', line: 'bg-rose-300/60' },
  { card: 'border-indigo-300/25 bg-indigo-400/[0.06] hover:border-indigo-200/55', icon: 'border-indigo-300/35 bg-indigo-400/10 text-indigo-100', text: 'text-indigo-100', badge: 'border-indigo-300/20 bg-indigo-400/10 text-indigo-100', line: 'bg-indigo-300/65' }
];
const accentFor = (index: number) => sectionAccents[index % sectionAccents.length];
function cloudinaryImageUrl(url: string, width?: number): string {
  if (!url || !url.includes('/upload/')) return url;
  const stripped = url.replace(/\/upload\/(?:w_\d+,c_limit,)?f_auto,q_auto\//, '/upload/');
  const transform = width ? `w_${width},c_limit,f_auto,q_auto` : 'f_auto,q_auto';
  return stripped.replace('/upload/', `/upload/${transform}/`);
}

function InstagramIcon({ className = '' }: { className?: string }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="0.9" fill="currentColor" stroke="none" /></svg>;
}

function FacebookIcon({ className = '' }: { className?: string }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor"><path d="M14.2 8.2V6.9c0-.7.5-.9 1-.9h1.8V3.1c-.3 0-1.4-.1-2.7-.1-2.7 0-4.5 1.6-4.5 4.6v.6H7v3.3h2.8V21h3.5v-9.5h2.9l.5-3.3h-3Z" /></svg>;
}

function TikTokIcon({ className = '' }: { className?: string }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor"><path d="M15.9 3c.3 2.1 1.5 3.6 3.6 3.9v3.1a7 7 0 0 1-3.6-1.1v5.7c0 3.6-2.2 6.4-5.8 6.4A5.7 5.7 0 0 1 4.4 15c0-3.4 2.8-5.9 6.4-5.5v3.3c-1.7-.3-3 .6-3 2.2 0 1.4 1 2.5 2.4 2.5 1.6 0 2.4-1 2.4-3V3h3.3Z" /></svg>;
}

function WhatsAppIcon({ className = '' }: { className?: string }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor"><path d="M12.04 2C6.57 2 2.12 6.37 2.12 11.75c0 1.72.46 3.4 1.34 4.88L2 22l5.52-1.42a10.1 10.1 0 0 0 4.52.94c5.47 0 9.92-4.37 9.92-9.76S17.51 2 12.04 2Zm0 17.82a8.36 8.36 0 0 1-4.22-1.14l-.3-.18-3.27.84.87-3.12-.2-.32a7.9 7.9 0 0 1-1.2-4.15c0-4.44 3.73-8.05 8.32-8.05 4.58 0 8.31 3.61 8.31 8.05s-3.73 8.07-8.31 8.07Zm4.56-6.03c-.25-.12-1.48-.72-1.71-.8-.23-.09-.4-.13-.57.12-.17.25-.65.8-.8.97-.15.17-.3.19-.55.07-.25-.13-1.06-.38-2.02-1.21a7.5 7.5 0 0 1-1.4-1.71c-.15-.25-.02-.39.11-.51.12-.12.25-.3.37-.44.13-.15.17-.25.25-.42.09-.17.04-.32-.02-.44-.06-.13-.57-1.35-.78-1.84-.2-.48-.41-.42-.57-.43h-.48c-.17 0-.44.06-.67.32-.23.25-.88.85-.88 2.07s.9 2.4 1.03 2.57c.13.17 1.78 2.68 4.31 3.75.6.26 1.07.41 1.44.53.6.19 1.15.16 1.59.1.48-.07 1.48-.6 1.69-1.18.21-.58.21-1.08.15-1.18-.06-.11-.23-.17-.49-.3Z" /></svg>;
}

const nav: [string, string][] = [
  ['Salones', 'salones'],
  ['Paquetes', 'paquetes'],
  ['Galería', 'galeria'],
  ['FAQ', 'faq'],
  ['Contacto', 'contacto'],
  ['Ubicaciones', 'ubicaciones'],
];

const socialOptions = [
  { key: 'whatsapp' as const, label: 'WhatsApp', icon: WhatsAppIcon, field: 'whatsapp' as const },
  { key: 'instagram' as const, label: 'Instagram', icon: InstagramIcon, field: 'instagramUrl' as const },
  { key: 'facebook' as const, label: 'Facebook', icon: FacebookIcon, field: 'facebookUrl' as const },
  { key: 'tiktok' as const, label: 'TikTok', icon: TikTokIcon, field: 'tiktokUrl' as const },
];

function titleForSalon(salon: Salon) { return salon.publicTitle || salon.name; }
function locationForSalon(salon: Salon) { return salon.locationText || salon.locality || salon.city || salon.address || 'La Plata'; }
function heroLocationForSalon(salon: Salon) { return salon.locality || salon.city || titleForSalon(salon); }
function descriptionForSalon(salon: Salon) { return salon.publicShortDescription || salon.publicDescription || 'Un espacio M&M preparado para celebrar con servicio integral.'; }
function imageForSalon(salon: Salon) { return cloudinaryImageUrl(salon.heroImageUrl || salon.mediaGallery?.[0]?.secureUrl || salon.mediaGallery?.[0]?.url || salon.galleryImageUrls?.[0] || fallbackHero); }
function capacityForSalon(salon: Salon) {
  if (salon.minCapacity && salon.maxCapacity) return `${salon.minCapacity} a ${salon.maxCapacity} personas`;
  if (salon.maxCapacity || salon.recommendedCapacity) return `Hasta ${salon.maxCapacity || salon.recommendedCapacity} personas`;
  return 'Capacidad a confirmar';
}
function mediaForSalon(salon: Salon): Media[] {
  const rawItems: Media[] = [
    ...(salon.heroImageUrl ? [{ url: salon.heroImageUrl, title: titleForSalon(salon), resourceType: 'image', displayOrder: -1 } satisfies Media] : []),
    ...(salon.mediaGallery ?? []),
    ...(salon.galleryImageUrls ?? []).map((url, index) => ({ url, resourceType: 'image', displayOrder: index + 50 })),
  ];
  const items = rawItems.map((item) => {
    if (item.resourceType === 'video') return item;
    const source = cloudinaryImageUrl(item.secureUrl || item.url);
    return { ...item, url: source, secureUrl: source };
  });
  const seen = new Set<string>();
  return items.filter((item) => {
    const source = item.secureUrl || item.url;
    if (!source || seen.has(source)) return false;
    seen.add(source);
    return true;
  }).sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
}
function waLink(number?: string, message = 'Hola M&M Eventos, quiero solicitar un presupuesto para mi evento.') {
  return `https://wa.me/${(number || '').replace(/\D/g, '')}?text=${encodeURIComponent(message)}`;
}
function textValue(value: FormDataEntryValue | null) {
  return typeof value === 'string' ? value.trim() : '';
}
function wordCount(value: string) {
  return value.split(/\s+/).filter(Boolean).length;
}
function isFutureIsoDate(value: string) {
  return !value || value > todayIsoDate();
}
function salonWhatsAppNumber(salon: Salon, fallback?: string) {
  return salon.manager?.phone || salon.whatsapp || salon.phone || fallback;
}
function scrollTo(id: string) {
  const target = document.getElementById(id);
  if (!target) return;
  const headerOffset = 104;
  const top = target.getBoundingClientRect().top + window.scrollY - headerOffset;
  window.scrollTo({ top: Math.max(top, 0), behavior: 'smooth' });
}
function salonWaMessage(salon: Salon) {
  return `Hola M&M Eventos, vengo de la web y quiero más información sobre ${titleForSalon(salon)} (${locationForSalon(salon)}).`;
}
function packageWaMessage(salon: Salon, item: Package) {
  const price = money(item.pricingMode === 'fixed' ? item.finalFixedPrice || item.fixedPrice : item.finalPricePerPerson || item.pricePerPerson);
  const benefit = item.promotionText || item.giftText;
  return [
    `Hola M&M Eventos, vengo de la web y me interesa el paquete "${item.name}" para ${titleForSalon(salon)}.`,
    `Valor publicado: ${price}${item.pricingMode === 'fixed' ? ' por el evento' : ' por persona'}.`,
    benefit ? `Beneficio: ${benefit}` : '',
    'Quiero recibir más información para reservar.',
  ].filter(Boolean).join('\n');
}
function quoteRequestManagerMessage(input: { quoteRequestId?: string; salon: Salon; name: string; phone: string; email?: string; eventType: string; eventDate?: string; guestCount: number; message?: string }) {
  return [
    'Nueva consulta desde la web de M&M Eventos.',
    `Salón: ${titleForSalon(input.salon)}`,
    `Cliente: ${input.name}`,
    `Teléfono: ${input.phone}`,
    input.email ? `Email: ${input.email}` : '',
    `Tipo de evento: ${input.eventType}`,
    input.eventDate ? `Fecha tentativa: ${input.eventDate}` : 'Fecha tentativa: Sin definir',
    `Cantidad de personas: ${input.guestCount}`,
    input.message ? `Mensaje: ${input.message}` : 'Mensaje: Sin mensaje',
    input.quoteRequestId ? `Solicitud: ${input.quoteRequestId}` : '',
  ].filter(Boolean).join('\n');
}
function mapUrlForSalon(salon: Salon) {
  if (salon.mapUrl && (salon.mapUrl.includes('/embed') || salon.mapUrl.includes('output=embed'))) return salon.mapUrl;
  return `https://maps.google.com/maps?q=${encodeURIComponent(mapQueryForSalon(salon))}&z=17&output=embed`;
}
function mapExternalUrlForSalon(salon: Salon) {
  if (salon.mapUrl && !salon.mapUrl.includes('/embed') && !salon.mapUrl.includes('output=embed')) return salon.mapUrl;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQueryForSalon(salon))}`;
}
function mapQueryForSalon(salon: Salon) {
  const fromMapUrl = queryFromMapUrl(salon.mapUrl);
  if (fromMapUrl) return normalizeMapQuery(fromMapUrl, salon);
  return normalizeMapQuery(salon.address || salon.locationText || [titleForSalon(salon), salon.locality || salon.city].filter(Boolean).join(', '), salon);
}
function queryFromMapUrl(mapUrl?: string) {
  if (!mapUrl) return '';
  try {
    const url = new URL(mapUrl);
    return url.searchParams.get('query') || url.searchParams.get('q') || '';
  } catch {
    return '';
  }
}
function normalizeMapQuery(value: string, salon: Salon) {
  if (/calle\s*419/i.test(value) && /2253/.test(value)) return 'Calle 419 2253, Villa Elisa, Buenos Aires, Argentina';
  const withCity = [value, salon.locality || salon.city, salon.province || 'Buenos Aires', 'Argentina'].filter(Boolean).join(', ');
  return withCity.replace(/\s+/g, ' ').trim();
}

// Reveal content once it has genuinely scrolled into view, with motion pronounced enough to read as a deliberate entrance.
// Tall sections on mobile must begin their reveal as soon as they enter the viewport.
// Requiring a large visible fraction leaves an empty, opaque area before their content appears.
const viewport = { once: true, amount: 0.01, margin: '0px 0px -24px 0px' } as const;
const smoothEase: [number, number, number, number] = [0.22, 1, 0.36, 1];
const softSpring = { type: 'spring', stiffness: 380, damping: 36, mass: 0.7 } as const;
const sectionVariants: Variants = {
  hidden: { opacity: 0, y: 32 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.38, ease: smoothEase, when: 'beforeChildren', staggerChildren: 0.045 } },
};
// Same reveal, but children start together with the section instead of waiting for it to finish first.
// Needed for sections whose content (partially) animates via its own state rather than variant propagation,
// so that content doesn't visually resolve before the section's own title/selectors do.
const sectionVariantsSync: Variants = {
  hidden: { opacity: 0, y: 32 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.38, ease: smoothEase, staggerChildren: 0.045 } },
};
const listVariants: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.05 } },
};
const cardVariants: Variants = {
  hidden: { opacity: 0, y: 26 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.36, ease: smoothEase } },
};
const titleVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.36, ease: smoothEase } },
};
const imageRevealVariants: Variants = {
  hidden: { opacity: 0, scale: 1.05 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.45, ease: smoothEase } },
};
const displayFont = { fontFamily: 'var(--font-display)' } as const;
const ctaFocusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c8cdd3] focus-visible:ring-offset-2 focus-visible:ring-offset-[#050505]';

const underlineGrow = (delayBase: number, index: number, delayStep: number): Variants => ({ hidden: { scaleX: 0 }, visible: { scaleX: 1, transition: { duration: 0.3, delay: delayBase + index * delayStep, ease: smoothEase } } });
const iconPop = (index: number): Variants => ({ hidden: { scale: 0.92, rotate: -4 }, visible: { scale: 1, rotate: 0, transition: { ...softSpring, delay: index * 0.025 } } });
const badgePop = (index: number): Variants => ({ hidden: { scale: 0.92 }, visible: { scale: 1, transition: { ...softSpring, delay: index * 0.02 } } });
const starPop = (index: number, starIndex: number): Variants => ({ hidden: { opacity: 0, scale: 0.75, rotate: -8 }, visible: { opacity: 1, scale: 1, rotate: 0, transition: { ...softSpring, delay: index * 0.04 + starIndex * 0.025 } } });

function AnimatedSection({ children, className, variants = sectionVariants, style, ...props }: React.ComponentProps<typeof motion.section>) {
  const shouldReduceMotion = useReducedMotion();
  return <motion.section {...props} className={className} style={style} initial={shouldReduceMotion ? false : 'hidden'} whileInView={shouldReduceMotion ? undefined : 'visible'} viewport={viewport} variants={variants}>{children}</motion.section>;
}

function AnimatedGrid({ children, className }: { children: React.ReactNode; className?: string }) {
  return <motion.div className={className} variants={listVariants}>{children}</motion.div>;
}

function SectionTitle({ eyebrow, title, subtitle, display }: { eyebrow: string; title: string; subtitle?: string; display?: boolean }) {
  return <motion.div className="mx-auto mb-10 max-w-3xl text-center md:mb-12" variants={titleVariants}>
    <p className={`text-xs font-semibold uppercase tracking-[0.42em] ${display ? 'text-[#dcdcdf]' : 'text-[#dbe1e8]'}`}>{eyebrow}</p>
    {display
      ? <h2 style={displayFont} className="mt-4 text-3xl font-medium italic text-white md:text-5xl">{title}</h2>
      : <h2 className="mt-4 text-3xl font-semibold text-white md:text-5xl">{title}</h2>}
    {subtitle ? <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-zinc-300 md:text-lg">{subtitle}</p> : null}
  </motion.div>;
}

function IconBadge({ name, tone = 'border-[#c8cdd3]/30 bg-[#c8cdd3]/10 text-[#f1f5f9]' }: { name?: string; tone?: string }) {
  const Icon = iconMap[(name || 'Sparkles') as keyof typeof iconMap] || Sparkles;
  return <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl border ${tone}`}><Icon className="h-5 w-5" /></span>;
}

function PackageFullDetail({ item, accentText = 'text-[#c8cdd3]' }: { item: Package; accentText?: string }) {
  const [open, setOpen] = useState(false);
  const hasMenu = Boolean(item.menuSections?.length);
  const hasServices = Boolean(item.includedServices?.length);
  const hasCommercial = Boolean(item.depositAmount || item.paymentTerms || item.promotionText || item.giftText || item.notes || item.description);
  if (!hasMenu && !hasServices && !hasCommercial) return null;

  return <>
    <button type="button" onClick={() => setOpen(true)} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-white/15 bg-black/20 px-4 py-2.5 text-sm font-semibold text-zinc-100 transition hover:border-[#c8cdd3] hover:bg-[#c8cdd3] hover:text-black">
      Ver detalle completo <ExternalLink className="h-4 w-4" />
    </button>
    {open ? <PackageDetailModal item={item} accentText={accentText} onClose={() => setOpen(false)} /> : null}
  </>;
}

function PackageDetailModal({ item, accentText, onClose }: { item: Package; accentText: string; onClose: () => void }) {
  const panelRef = useRef<HTMLElement | null>(null);
  useDialogA11y(true, onClose, panelRef);

  return <Portal>
    <div className="fixed inset-0 z-[70] overflow-y-auto bg-black/80 px-4 py-6 backdrop-blur-md md:px-8" role="dialog" aria-modal="true" aria-label={`Detalle de ${item.name}`} onClick={onClose}>
      <article ref={panelRef} className="mx-auto max-w-5xl overflow-hidden rounded-3xl border border-[#c8cdd3]/30 bg-[#080807] text-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <header className="relative border-b border-white/10 bg-[#10100f] p-5 md:p-7">
          <button type="button" onClick={onClose} aria-label="Cerrar detalle del paquete" className="absolute right-5 top-5 grid h-10 w-10 place-items-center rounded-xl border border-white/15 bg-black/45 text-white transition hover:bg-white hover:text-black"><X className="h-5 w-5" /></button>
          <p className="text-xs font-semibold uppercase tracking-[0.32em] text-[#c8cdd3]">Detalle del paquete</p>
          <h2 className="mt-3 max-w-3xl break-words pr-12 text-3xl font-semibold md:text-5xl">{item.name}</h2>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"><p className="text-xs uppercase tracking-[0.16em] text-zinc-400">Valor</p><p className={`mt-1 text-xl font-semibold ${accentText}`}>{money(packagePrice(item))}</p><p className="text-xs text-zinc-400">{packagePriceUnit(item)}</p></div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"><p className="text-xs uppercase tracking-[0.16em] text-zinc-400">Duración</p><p className="mt-1 font-semibold">{item.durationHours ? `${item.durationHours} hs` : 'A coordinar'}</p>{item.startTime && item.endTime ? <p className="text-xs text-zinc-400">{item.startTime} a {item.endTime}</p> : null}</div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"><p className="text-xs uppercase tracking-[0.16em] text-zinc-400">Seña</p><p className="mt-1 font-semibold">{item.depositAmount ? money(item.depositAmount) : 'A consultar'}</p></div>
          </div>
          {item.description ? <p className="mt-5 max-w-4xl text-sm leading-7 text-zinc-300 md:text-base">{item.description}</p> : null}
        </header>

        <div className="grid gap-5 p-5 md:p-7 lg:grid-cols-[1.1fr_0.9fr]">
          <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <h3 className="text-xl font-semibold">Menú</h3>
            {item.menuSections?.length ? <div className="mt-5 space-y-5">{item.menuSections.map((section, index) => <div key={`${section.title ?? section.name ?? 'menu'}-${index}`} className="border-b border-white/10 pb-4 last:border-b-0 last:pb-0">
              <p className={`font-semibold ${accentText}`}>{section.title ?? section.name ?? 'Sección'}</p>
              <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-6 text-zinc-300">{section.items.map((menuItem) => <li key={menuItem} className="break-words">{menuItem}</li>)}</ul>
            </div>)}</div> : <p className="mt-4 text-sm text-zinc-400">No hay menú cargado para este paquete.</p>}
          </section>

          <aside className="space-y-5">
            <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
              <h3 className="text-xl font-semibold">Servicios incluidos</h3>
              {item.includedServices?.length ? <ul className="mt-4 space-y-2 text-sm leading-6 text-zinc-300">{item.includedServices.map((service) => <li key={service} className="flex min-w-0 gap-2"><Check className={`mt-1 h-4 w-4 shrink-0 ${accentText}`} /><span className="min-w-0 break-words">{service}</span></li>)}</ul> : <p className="mt-4 text-sm text-zinc-400">No hay servicios cargados.</p>}
            </section>

            <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
              <h3 className="text-xl font-semibold">Condiciones comerciales</h3>
              <div className="mt-4 space-y-3 text-sm leading-6 text-zinc-300">
                {item.paymentTerms ? <p><span className={accentText}>Pago:</span> {item.paymentTerms}</p> : null}
                {item.promotionText ? <p><span className={accentText}>Promoción:</span> {item.promotionText}</p> : null}
                {item.giftText ? <p><span className={accentText}>Beneficio:</span> {item.giftText}</p> : null}
                {item.notes ? <p className="border-t border-white/10 pt-3 text-zinc-400">{item.notes}</p> : null}
                {!item.paymentTerms && !item.promotionText && !item.giftText && !item.notes ? <p className="text-zinc-400">Condiciones a confirmar con el salón.</p> : null}
              </div>
            </section>
          </aside>
        </div>
      </article>
    </div>
  </Portal>;
}

function eventTypeIconName(item: LandingItem, index: number): keyof typeof iconMap {
  const title = (item.title || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  return eventTypeIcons[title] || (item.icon as keyof typeof iconMap) || fallbackEventTypes[index % fallbackEventTypes.length].icon;
}

function Portal({ children }: { children: React.ReactNode }) {
  if (typeof document === 'undefined') return null;
  return createPortal(children, document.body);
}

function useDialogA11y(active: boolean, onClose: () => void, containerRef: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!active) return;
    const previousActiveElement = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const mainEl = document.querySelector('main');
    const previousAriaHidden = mainEl?.getAttribute('aria-hidden');
    mainEl?.setAttribute('aria-hidden', 'true');

    const focusables = () => containerRef.current
      ? Array.from(containerRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), iframe, [tabindex]:not([tabindex="-1"])'
        ))
      : [];

    focusables()[0]?.focus({ preventScroll: true });

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); return; }
      if (event.key !== 'Tab') return;
      const nodes = focusables();
      if (!nodes.length) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      if (previousAriaHidden == null) mainEl?.removeAttribute('aria-hidden');
      else mainEl?.setAttribute('aria-hidden', previousAriaHidden);
      previousActiveElement?.focus({ preventScroll: true });
    };
  }, [active, onClose, containerRef]);
}

function galleryImageSource(item: LandingItem, index: number) {
  return item.imageUrl || fallbackGallery[index % fallbackGallery.length];
}

function GalleryLightbox({ items, index, onClose, onSelect }: { items: LandingItem[]; index: number | null; onClose: () => void; onSelect: (index: number) => void }) {
  const panelRef = useRef<HTMLElement | null>(null);
  useDialogA11y(index !== null, onClose, panelRef);

  if (index === null || !items.length) return null;

  const activeIndex = Math.min(index, items.length - 1);
  const active = items[activeIndex];
  const activeSource = galleryImageSource(active, activeIndex);
  const change = (direction: 1 | -1) => onSelect((activeIndex + direction + items.length) % items.length);

  return <Portal>
    <div ref={panelRef as React.RefObject<HTMLDivElement>} className="fixed inset-0 z-[100] grid place-items-center bg-black/92 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Galería M&M ampliada" onClick={onClose}>
      <button type="button" onClick={onClose} aria-label="Cerrar galería" className="absolute right-5 top-5 grid h-11 w-11 place-items-center rounded-xl border border-white/15 bg-black/50 text-white transition hover:bg-white hover:text-black"><X className="h-5 w-5" /></button>
      {items.length > 1 ? <button type="button" onClick={(event) => { event.stopPropagation(); change(-1); }} aria-label="Imagen anterior" className="absolute left-4 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full border border-white/15 bg-black/50 text-white transition hover:bg-white hover:text-black"><ChevronLeft className="h-6 w-6" /></button> : null}
      <section className="w-full max-w-6xl" onClick={(event) => event.stopPropagation()}>
        <div className="overflow-hidden rounded-3xl border border-[#c8cdd3]/25 bg-[#080807] shadow-2xl">
          <img src={cloudinaryImageUrl(activeSource, 1600)} alt={active.altText || active.title || 'Momento M&M'} decoding="async" className="mx-auto max-h-[74vh] w-full object-contain" />
          <div className="border-t border-white/10 bg-black/45 px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#c8cdd3]">Momento {activeIndex + 1} de {items.length}</p>
                {active.title ? <h3 className="mt-1 text-lg font-semibold text-white">{active.title}</h3> : null}
              </div>
              {active.category ? <span className="rounded-full border border-white/15 px-3 py-1 text-xs text-zinc-300">{active.category}</span> : null}
            </div>
            {active.description ? <p className="mt-2 text-sm leading-6 text-zinc-400">{active.description}</p> : null}
          </div>
        </div>
        <div className="mt-4 flex max-h-20 flex-wrap items-center justify-center gap-2 overflow-y-auto">{items.map((item, itemIndex) => {
          const source = galleryImageSource(item, itemIndex);
          return <button key={`${source}-gallery-lightbox-${itemIndex}`} type="button" onClick={() => onSelect(itemIndex)} aria-label={`Ver imagen ${itemIndex + 1}`} className={`h-14 w-20 overflow-hidden rounded-lg border transition ${itemIndex === activeIndex ? 'border-[#c8cdd3]' : 'border-white/15 hover:border-[#c8cdd3]/70'}`}><img src={cloudinaryImageUrl(source, 200)} alt={item.altText || item.title || `Momento M&M ${itemIndex + 1}`} loading="lazy" decoding="async" className="h-full w-full object-cover" /></button>;
        })}</div>
      </section>
      {items.length > 1 ? <button type="button" onClick={(event) => { event.stopPropagation(); change(1); }} aria-label="Imagen siguiente" className="absolute right-4 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full border border-white/15 bg-black/50 text-white transition hover:bg-white hover:text-black"><ChevronRight className="h-6 w-6" /></button> : null}
    </div>
  </Portal>;
}

function SalonDetailModal({ salon, onClose, onRequestQuote }: { salon: Salon | null; onClose: () => void; onRequestQuote: (salon: Salon) => void }) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [mapOpen, setMapOpen] = useState(false);
  const media = useMemo(() => salon ? mediaForSalon(salon) : [], [salon]);

  const panelRef = useRef<HTMLElement | null>(null);
  const lightboxPanelRef = useRef<HTMLElement | null>(null);
  const mapPanelRef = useRef<HTMLElement | null>(null);
  useDialogA11y(Boolean(salon) && lightboxIndex === null && !mapOpen, onClose, panelRef);
  useDialogA11y(lightboxIndex !== null, () => setLightboxIndex(null), lightboxPanelRef);
  useDialogA11y(mapOpen, () => setMapOpen(false), mapPanelRef);

  return <AnimatePresence>
    {salon ? (() => {
      const selectedMedia = media[Math.min(selectedIndex, Math.max(media.length - 1, 0))];
      const selectedSource = selectedMedia?.secureUrl || selectedMedia?.url || imageForSalon(salon);
      const lightboxMedia = lightboxIndex !== null ? media[Math.min(lightboxIndex, Math.max(media.length - 1, 0))] : undefined;
      const lightboxSource = lightboxMedia?.secureUrl || lightboxMedia?.url;
      const packages = salon.packages ?? [];
      const extras = salon.extraServices ?? [];
      const changeLightbox = (direction: 1 | -1) => setLightboxIndex((current) => {
        if (current === null || !media.length) return current;
        return (current + direction + media.length) % media.length;
      });

      return <motion.div key="salon-detail-overlay" className="fixed inset-0 z-50 overflow-y-auto bg-black/82 px-4 py-5 backdrop-blur-md md:px-8" role="dialog" aria-modal="true" aria-label={`Detalle de ${titleForSalon(salon)}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.article ref={panelRef as React.RefObject<HTMLElement>} key="salon-detail-panel" className="mx-auto max-w-6xl overflow-hidden rounded-3xl border border-[#c8cdd3]/25 bg-[#080807] text-white shadow-2xl" initial={{ opacity: 0, y: 24, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 18, scale: 0.98 }} onClick={(event: MouseEvent<HTMLElement>) => event.stopPropagation()}>
        <div className="relative h-[46vh] min-h-80 overflow-hidden bg-[#111113]">
          <button type="button" onClick={() => media.length && setLightboxIndex(Math.min(selectedIndex, Math.max(media.length - 1, 0)))} className="block h-full w-full text-left" aria-label={`Abrir galería de ${titleForSalon(salon)}`}>
            {selectedMedia?.resourceType === 'video' ? <video src={selectedSource} className="h-full w-full object-cover" controls playsInline /> : <img src={cloudinaryImageUrl(selectedSource, 1400)} alt={selectedMedia?.altText || selectedMedia?.title || titleForSalon(salon)} loading="lazy" decoding="async" className="h-full w-full object-cover" />}
          </button>
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#080807] via-black/20 to-transparent" />
          <button type="button" onClick={onClose} aria-label="Cerrar detalle del salón" className="absolute right-5 top-5 grid h-10 w-10 place-items-center rounded-xl border border-white/15 bg-black/50 text-white backdrop-blur transition hover:bg-white hover:text-black"><X className="h-5 w-5" /></button>
          <button type="button" onClick={() => media.length && setLightboxIndex(Math.min(selectedIndex, Math.max(media.length - 1, 0)))} className="absolute left-5 top-5 inline-flex items-center gap-2 rounded-xl border border-white/15 bg-black/50 px-3 py-2 text-sm font-semibold text-white backdrop-blur transition hover:border-[#c8cdd3] hover:text-[#f1f5f9]"><Camera className="h-4 w-4" />Ver fotos</button>
          <div className="absolute bottom-0 left-0 right-0 p-6 md:p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.34em] text-[#f1f5f9]">Detalle del salón</p>
            <h2 className="mt-3 max-w-3xl text-4xl font-semibold md:text-6xl">{titleForSalon(salon)}</h2>
            <button type="button" onClick={() => setMapOpen(true)} className="mt-3 inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/35 px-3 py-1.5 text-sm text-zinc-200 backdrop-blur transition hover:border-[#c8cdd3] hover:text-[#f1f5f9]" aria-label={`Ver ubicación de ${titleForSalon(salon)}`}><MapPin className="h-4 w-4 text-[#c8cdd3]" />Ver ubicación: {locationForSalon(salon)}</button>
          </div>
        </div>

        <div className="grid gap-7 p-5 md:p-8 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="space-y-7">
            {media.length > 1 ? <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">{media.slice(0, 12).map((item, index) => {
              const source = item.secureUrl || item.url;
              return <button key={`${source}-${index}`} type="button" onClick={() => { setSelectedIndex(index); setLightboxIndex(index); }} aria-label={`Abrir imagen ${index + 1} de ${titleForSalon(salon)}`} className={`h-20 overflow-hidden rounded-xl border transition ${index === selectedIndex ? 'border-[#c8cdd3]' : 'border-white/10 hover:border-[#c8cdd3]/70'}`}>{item.resourceType === 'video' ? <video src={source} className="h-full w-full object-cover" /> : <img src={cloudinaryImageUrl(source, 200)} alt={item.altText || item.title || titleForSalon(salon)} loading="lazy" decoding="async" className="h-full w-full object-cover" />}</button>;
            })}</div> : null}

            <section>
              <h3 className="text-2xl font-semibold">Información del salón</h3>
              <p className="mt-4 text-sm leading-7 text-zinc-300 md:text-base">{salon.publicDescription || descriptionForSalon(salon)}</p>
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"><Users className="h-5 w-5 text-[#c8cdd3]" /><p className="mt-3 text-xs uppercase tracking-[0.16em] text-zinc-400">Capacidad</p><p className="mt-1 font-semibold">{capacityForSalon(salon)}</p></div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"><Clock3 className="h-5 w-5 text-[#c8cdd3]" /><p className="mt-3 text-xs uppercase tracking-[0.16em] text-zinc-400">Horario</p><p className="mt-1 font-semibold">{salon.defaultStartTime && salon.defaultEndTime ? `${salon.defaultStartTime} a ${salon.defaultEndTime}` : salon.defaultDurationHours ? `${salon.defaultDurationHours} horas` : 'A coordinar'}</p></div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"><PackageCheck className="h-5 w-5 text-[#c8cdd3]" /><p className="mt-3 text-xs uppercase tracking-[0.16em] text-zinc-400">Paquetes</p><p className="mt-1 font-semibold">{packages.length || 'A consultar'}</p></div>
              </div>
            </section>

            {packages.length ? <section>
              <h3 className="text-2xl font-semibold">Paquetes disponibles</h3>
              <div className="mt-4 grid gap-3 md:grid-cols-2">{packages.map((item) => <article key={item._id} className="flex min-h-[260px] flex-col rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="flex items-start justify-between gap-3"><h4 className="font-semibold">{item.name}</h4>{item.badgeLabel ? <span className="rounded-md bg-[#c8cdd3] px-2 py-1 text-[10px] font-bold uppercase text-black">{item.badgeLabel}</span> : null}</div>
                <p className="mt-3 text-xl font-semibold text-[#f1f5f9]">{money(packagePrice(item))} <span className="text-xs font-normal text-zinc-400">{packagePriceUnit(item)}</span></p>
                {item.description ? <p className="mt-3 text-sm leading-6 text-zinc-400">{item.description}</p> : null}
                {item.includedServices?.length ? <ul className="mt-3 space-y-1.5 text-sm text-zinc-300">{item.includedServices.slice(0, 4).map((service) => <li key={service} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-[#c8cdd3]" />{service}</li>)}</ul> : null}
                {item.promotionText || item.giftText ? <p className="mt-3 text-sm text-[#d4d4d8]">{item.promotionText || item.giftText}</p> : null}
                <PackageFullDetail item={item} />
                <div className="mt-auto pt-5"><a href={waLink(salonWhatsAppNumber(salon), packageWaMessage(salon, item))} target="_blank" rel="noreferrer" className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-[#25d366]/35 px-4 py-2.5 text-sm font-semibold text-[#d8ffe5] transition hover:border-[#25d366] hover:bg-[#25d366] hover:text-black">Me interesa <ExternalLink className="h-4 w-4" /></a></div>
              </article>)}</div>
            </section> : null}
          </div>

          <aside className="space-y-4">
            <div className="rounded-2xl border border-[#c8cdd3]/25 bg-[#111113] p-5">
              <h3 className="text-lg font-semibold">Acciones rápidas</h3>
              <div className="mt-4 grid gap-2">
                <button type="button" onClick={() => onRequestQuote(salon)} className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#c8cdd3] px-4 py-3 text-sm font-semibold text-black transition hover:bg-[#e5e7eb]">Pedir presupuesto <Send className="h-4 w-4" /></button>
                <a href={waLink(salonWhatsAppNumber(salon), salonWaMessage(salon))} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/15 px-4 py-3 text-sm font-semibold transition hover:border-[#25d366] hover:text-[#25d366]">Consultar por WhatsApp <ExternalLink className="h-4 w-4" /></a>
                <button type="button" onClick={() => setMapOpen(true)} className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/15 px-4 py-3 text-sm font-semibold transition hover:border-[#c8cdd3] hover:text-[#f1f5f9]">Ver ubicación <MapPin className="h-4 w-4" /></button>
              </div>
              <div className="mt-5 space-y-2 text-sm text-zinc-400">
                {salon.address ? <p><span className="text-zinc-200">Dirección:</span> {salon.address}</p> : null}
                {salonWhatsAppNumber(salon) ? <p><span className="text-zinc-200">Teléfono:</span> {salonWhatsAppNumber(salon)}</p> : null}
                {salon.email ? <p><span className="text-zinc-200">Email:</span> {salon.email}</p> : null}
                {salon.defaultDepositAmount ? <p><span className="text-zinc-200">Seña sugerida:</span> {money(salon.defaultDepositAmount)}</p> : null}
              </div>
            </div>

            {extras.length ? <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
              <h3 className="text-lg font-semibold">Servicios extra</h3>
              <div className="mt-4 grid gap-3">{extras.slice(0, 6).map((extra) => <div key={extra._id || extra.name} className="rounded-xl border border-white/10 p-3">
                <p className="font-semibold">{extra.name}</p>
                {extra.description ? <p className="mt-1 text-sm leading-5 text-zinc-400">{extra.description}</p> : null}
                {extra.basePrice ? <p className="mt-2 text-sm text-[#f1f5f9]">{money(extra.basePrice)}</p> : null}
              </div>)}</div>
            </div> : null}

            <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
              <button type="button" onClick={() => setMapOpen(true)} className="group relative block h-64 w-full overflow-hidden text-left" aria-label={`Ver ubicación de ${titleForSalon(salon)}`}>
                <iframe title={`Mapa de ${titleForSalon(salon)}`} src={mapUrlForSalon(salon)} className="pointer-events-none h-full w-full border-0" loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
                <span className="absolute inset-x-4 bottom-4 inline-flex items-center justify-center gap-2 rounded-lg bg-black/75 px-4 py-2 text-sm font-semibold text-white backdrop-blur transition group-hover:bg-[#c8cdd3] group-hover:text-black"><MapPin className="h-4 w-4" />Ver ubicación</span>
              </button>
            </div>
          </aside>
        </div>
      </motion.article>

      {lightboxIndex !== null && lightboxSource ? <Portal><div ref={lightboxPanelRef as React.RefObject<HTMLDivElement>} className="fixed inset-0 z-[100] grid place-items-center bg-black/92 p-4" role="dialog" aria-modal="true" aria-label={`Galería de ${titleForSalon(salon)}`} onClick={(event) => event.stopPropagation()}>
        <button type="button" onClick={() => setLightboxIndex(null)} aria-label="Cerrar galería" className="absolute right-5 top-5 grid h-11 w-11 place-items-center rounded-xl border border-white/15 bg-black/50 text-white transition hover:bg-white hover:text-black"><X className="h-5 w-5" /></button>
        {media.length > 1 ? <button type="button" onClick={() => changeLightbox(-1)} aria-label="Imagen anterior" className="absolute left-4 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full border border-white/15 bg-black/50 text-white transition hover:bg-white hover:text-black"><ChevronLeft className="h-6 w-6" /></button> : null}
        <div className="max-h-[88vh] w-full max-w-6xl">
          {lightboxMedia?.resourceType === 'video' ? <video src={lightboxSource} className="mx-auto max-h-[78vh] w-full rounded-2xl object-contain" controls playsInline autoPlay /> : <img src={cloudinaryImageUrl(lightboxSource, 1600)} alt={lightboxMedia?.altText || lightboxMedia?.title || titleForSalon(salon)} decoding="async" className="mx-auto max-h-[78vh] w-full rounded-2xl object-contain" />}
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">{media.map((item, index) => {
            const source = item.secureUrl || item.url;
            return <button key={`${source}-lightbox-${index}`} type="button" onClick={() => setLightboxIndex(index)} aria-label={`Ver imagen ${index + 1}`} className={`h-14 w-20 overflow-hidden rounded-lg border transition ${index === lightboxIndex ? 'border-[#c8cdd3]' : 'border-white/15 hover:border-[#c8cdd3]/70'}`}>{item.resourceType === 'video' ? <video src={source} className="h-full w-full object-cover" /> : <img src={cloudinaryImageUrl(source, 200)} alt={item.altText || item.title || titleForSalon(salon)} loading="lazy" decoding="async" className="h-full w-full object-cover" />}</button>;
          })}</div>
        </div>
        {media.length > 1 ? <button type="button" onClick={() => changeLightbox(1)} aria-label="Imagen siguiente" className="absolute right-4 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full border border-white/15 bg-black/50 text-white transition hover:bg-white hover:text-black"><ChevronRight className="h-6 w-6" /></button> : null}
      </div></Portal> : null}

      {mapOpen ? <Portal><div className="fixed inset-0 z-[100] grid place-items-center bg-black/88 p-4" role="dialog" aria-modal="true" aria-label={`Mapa de ${titleForSalon(salon)}`} onClick={(event) => event.stopPropagation()}>
        <section ref={mapPanelRef as React.RefObject<HTMLElement>} className="w-full max-w-5xl overflow-hidden rounded-3xl border border-[#c8cdd3]/30 bg-[#080807] shadow-2xl">
          <header className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-4">
            <div><p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#c8cdd3]">Ubicación</p><h3 className="mt-1 text-2xl font-semibold text-white">{titleForSalon(salon)}</h3><p className="mt-1 text-sm text-zinc-400">{salon.address || locationForSalon(salon)}</p><a href={mapExternalUrlForSalon(salon)} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-[#f1f5f9] hover:text-white">Abrir en Google Maps <ExternalLink className="h-4 w-4" /></a></div>
            <button type="button" onClick={() => setMapOpen(false)} aria-label="Cerrar mapa" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/15 text-white transition hover:bg-white hover:text-black"><X className="h-5 w-5" /></button>
          </header>
          <iframe title={`Mapa ampliado de ${titleForSalon(salon)}`} src={mapUrlForSalon(salon)} className="h-[70vh] w-full border-0" loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
        </section>
      </div></Portal> : null}
    </motion.div>;
    })() : null}
  </AnimatePresence>;
}

export function PublicLandingClient({ initialLanding }: { initialLanding?: LandingPayload | null }) {
  const [landing, setLanding] = useState<LandingPayload>(initialLanding ?? emptyLanding);
  const [selectedSalonId, setSelectedSalonId] = useState('');
  const [selectedContactPackageId, setSelectedContactPackageId] = useState('');
  const [selectedPackageSalonId, setSelectedPackageSalonId] = useState('');
  const [selectedSalon, setSelectedSalon] = useState<Salon | null>(null);
  const [galleryLightboxIndex, setGalleryLightboxIndex] = useState<number | null>(null);
  const [socialNetwork, setSocialNetwork] = useState<'whatsapp' | 'instagram' | 'facebook' | 'tiktok' | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [formMessage, setFormMessage] = useState('');
  const [formState, setFormState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [landingLoading, setLandingLoading] = useState(!initialLanding);
  const [scrolled, setScrolled] = useState(false);
  const [loadedMapIds, setLoadedMapIds] = useState<Set<string>>(new Set());
  const [hasActiveTickets, setHasActiveTickets] = useState(false);
  const [packagesRevealed, setPackagesRevealed] = useState(false);
  const [heroVideoFailed, setHeroVideoFailed] = useState(false);
  const mobileMenuRef = useRef<HTMLElement | null>(null);
  const socialPanelRef = useRef<HTMLElement | null>(null);
  const heroRef = useRef<HTMLElement | null>(null);
  const [storyStep, setStoryStep] = useState(0);
  const storyRowRefs = useRef<Array<HTMLDivElement | null>>([]);

  const { scrollY } = useScroll();
  useMotionValueEvent(scrollY, 'change', (latest) => setScrolled(latest > 24));
  const { scrollYProgress: heroProgress } = useScroll({ target: heroRef, offset: ['start start', 'end start'] });
  const heroImageScale = useTransform(heroProgress, [0, 1], [1, 1.18]);
  const heroImageY = useTransform(heroProgress, [0, 1], ['0%', '14%']);
  useDialogA11y(mobileOpen, () => setMobileOpen(false), mobileMenuRef);
  useDialogA11y(Boolean(socialNetwork), () => setSocialNetwork(null), socialPanelRef);

  // Picks whichever step row's center sits closest to the viewport center on every scroll
  // position, instead of reacting to a narrow "entered the viewport" crossing — a fast
  // scroll/fling can skip a thin trigger band entirely, silently jumping over a step.
  useEffect(() => {
    let frame = 0;
    const evaluate = () => {
      frame = 0;
      const center = window.innerHeight / 2;
      let closestIndex = 0;
      let closestDistance = Infinity;
      storyRowRefs.current.forEach((row, index) => {
        if (!row) return;
        const rect = row.getBoundingClientRect();
        const distance = Math.abs(rect.top + rect.height / 2 - center);
        if (distance < closestDistance) { closestDistance = distance; closestIndex = index; }
      });
      setStoryStep(closestIndex);
    };
    const onScroll = () => { if (!frame) frame = window.requestAnimationFrame(evaluate); };
    evaluate();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    if (initialLanding) return;
    let mounted = true;
    void api.get<LandingPayload>('/public/landing')
      .then((response) => { if (mounted) setLanding(response); })
      .catch(() => undefined)
      .finally(() => { if (mounted) setLandingLoading(false); });
    return () => { mounted = false; };
  }, [initialLanding]);

  useEffect(() => {
    if (landingLoading || typeof window === 'undefined') return;
    const id = window.location.hash.replace('#', '');
    if (!id) return;
    const timer = window.setTimeout(() => scrollTo(id), 80);
    return () => window.clearTimeout(timer);
  }, [landingLoading]);

  useEffect(() => {
    let mounted = true;
    void api.get<{ publications: unknown[] }>('/public/tickets')
      .then((response) => { if (mounted) setHasActiveTickets((response.publications?.length ?? 0) > 0); })
      .catch(() => undefined);
    return () => { mounted = false; };
  }, []);

  const settings = landing.settings ?? {};
  const salons = landing.salons;
  const heroImage = cloudinaryImageUrl(settings.heroImageUrl || salons[0]?.heroImageUrl || imageForSalon(salons[0] ?? { _id: '', name: 'M&M Eventos' }), 1920);
  const heroVideo = settings.heroVideoUrl ? cloudinaryImageUrl(settings.heroVideoUrl) : '';
  const serviceBlocks = landing.serviceBlocks.length ? landing.serviceBlocks : fallbackServices;
  const eventTypes = landing.eventTypes.length ? landing.eventTypes : fallbackEventTypes;
  const storySteps: LandingItem[] = landing.storySteps.length ? landing.storySteps : fallbackStorySteps;
  const faqs: LandingItem[] = landing.faqs.length ? landing.faqs : fallbackFaqs;
  const gallery: LandingItem[] = landing.gallery.length ? landing.gallery.map((item) => ({ ...item, imageUrl: item.imageUrl ? cloudinaryImageUrl(item.imageUrl) : item.imageUrl })) : fallbackGallery.map((imageUrl, index) => ({ title: `Momento M&M ${index + 1}`, imageUrl, category: 'Momentos' }));
  const packages = useMemo(() => landing.packages.length ? landing.packages : salons.flatMap((salon) => (salon.packages ?? []).map((item) => ({ ...item, salonName: titleForSalon(salon) }))), [landing.packages, salons]);
  const displaySalons = useMemo(() => salons.length ? salons : [...new Map(packages.map((item, index) => [String(item.salonName || `M&M Eventos ${index + 1}`), { _id: String(item.salonId || item._id || index), name: String(item.salonName || 'M&M Eventos'), publicTitle: String(item.salonName || 'M&M Eventos'), publicShortDescription: 'Un espacio M&M preparado para celebrar con servicio integral.', locationText: 'La Plata', minCapacity: 60, maxCapacity: 250, heroImageUrl: fallbackGallery[index % fallbackGallery.length] } as Salon])).values()], [salons, packages]);
  const selectedPackageSalon = useMemo(() => displaySalons.find((salon) => salon._id === selectedPackageSalonId) ?? displaySalons[0], [displaySalons, selectedPackageSalonId]);
  const selectedPackageCards = useMemo(() => {
    if (!selectedPackageSalon) return packages;
    const salonPackages = selectedPackageSalon.packages?.length
      ? selectedPackageSalon.packages
      : packages.filter((item) => item.salonId === selectedPackageSalon._id || item.salonName === titleForSalon(selectedPackageSalon));
    return salonPackages;
  }, [packages, selectedPackageSalon]);
  const contactPackages = useMemo(() => selectedSalonId ? packages.filter((item) => item.salonId === selectedSalonId || displaySalons.find((salon) => salon._id === selectedSalonId)?.packages?.some((salonPackage) => salonPackage._id === item._id)) : [], [displaySalons, packages, selectedSalonId]);
  const heroSalons = useMemo(() => {
    const seen = new Set<string>();
    return displaySalons.filter((salon) => {
      const label = heroLocationForSalon(salon);
      if (!label || seen.has(label)) return false;
      seen.add(label);
      return true;
    }).slice(0, 4);
  }, [displaySalons]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const phone = textValue(formData.get('phone'));
    const email = textValue(formData.get('email'));
    const guestCount = Number(textValue(formData.get('guestCount')));
    const message = textValue(formData.get('message'));
    const eventDate = textValue(formData.get('eventDate'));
    const eventType = textValue(formData.get('eventType'));
    const salonId = textValue(formData.get('salonId'));
    const packageTemplateId = textValue(formData.get('packageTemplateId'));
    const selectedSalonForRequest = displaySalons.find((salon) => salon._id === salonId);
    if (!contactPhonePattern.test(phone)) {
      setFormState('error');
      setFormMessage('Ingresá un teléfono válido, con 6 a 24 caracteres.');
      return;
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setFormState('error');
      setFormMessage('Ingresá un email válido o dejá el campo vacío.');
      return;
    }
    if (!Number.isInteger(guestCount) || guestCount < contactGuestMin || guestCount > contactGuestMax) {
      setFormState('error');
      setFormMessage(`La cantidad de personas debe ser un número entre ${contactGuestMin} y ${contactGuestMax}.`);
      return;
    }
    if (!isFutureIsoDate(eventDate)) {
      setFormState('error');
      setFormMessage('La fecha tentativa debe ser posterior a hoy.');
      return;
    }
    if (wordCount(message) > contactMessageMaxWords) {
      setFormState('error');
      setFormMessage(`El mensaje no puede superar ${contactMessageMaxWords} palabras.`);
      return;
    }
    setFormState('loading');
    setFormMessage('');
    try {
      const result = await api.post<{ quoteRequestId?: string }>('/public/quick-quote', {
        name: textValue(formData.get('name')),
        phone,
        email,
        eventType,
        eventDate: eventDate || undefined,
        guestCount,
        salonId,
        packageTemplateId: packageTemplateId || undefined,
        message,
        attributionId: analyticsAttributionId() || undefined,
        utmSource: new URLSearchParams(window.location.search).get('utm_source') || undefined,
        utmMedium: new URLSearchParams(window.location.search).get('utm_medium') || undefined,
        utmCampaign: new URLSearchParams(window.location.search).get('utm_campaign') || undefined,
      });
      if (selectedSalonForRequest && salonWhatsAppNumber(selectedSalonForRequest)) {
        const whatsappUrl = waLink(salonWhatsAppNumber(selectedSalonForRequest), quoteRequestManagerMessage({
          quoteRequestId: result.quoteRequestId,
          salon: selectedSalonForRequest,
          name: textValue(formData.get('name')),
          phone,
          email,
          eventType,
          eventDate,
          guestCount,
          message,
        }));
        window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
      }
      form.reset();
      setSelectedSalonId('');
      setSelectedContactPackageId('');
      setFormState('success');
      setFormMessage('Recibimos tu solicitud. Un asesor de M&M Eventos se contactará para enviarte una propuesta personalizada.');
      emitAnalyticsEvent('form_success', { sectionId: 'contact', elementId: 'contact-form', entityId: result.quoteRequestId });
    } catch (error) {
      setFormState('error');
      setFormMessage(error instanceof Error ? error.message : 'No se pudo enviar la solicitud. Revisá los datos e intentá nuevamente.');
      emitAnalyticsEvent('form_error', { sectionId: 'contact', elementId: 'contact-form' });
    }
  }

  const activeSocial = socialOptions.find((item) => item.key === socialNetwork);
  const shouldReduceMotion = useReducedMotion();

  return <main className="min-h-screen overflow-x-hidden bg-[#050505] text-white">
    <header className={`fixed inset-x-0 top-0 z-40 border-b transition-[background-color,border-color] duration-300 ${scrolled ? 'border-white/10 bg-black/85 backdrop-blur-sm' : 'border-transparent bg-black/0'}`}>
      <div className="mx-auto flex h-20 max-w-7xl items-center justify-between gap-3 px-4 md:h-24 md:px-8">
        <button type="button" onClick={() => scrollTo('inicio')} className="group inline-flex shrink-0 items-center rounded-xl px-1 py-1 transition hover:opacity-85" aria-label="Ir al inicio">
          <Image src={brandAssets.logoLightOnDark} alt="M&M Eventos" width={174} height={74} className="h-11 w-auto max-w-[150px] object-contain brightness-110 contrast-125 drop-shadow-[0_8px_18px_rgba(0,0,0,.45)] md:h-16 md:max-w-none" priority />
        </button>
        <nav className="hidden items-center gap-6 text-sm font-semibold uppercase tracking-[0.16em] text-zinc-100 xl:gap-8 lg:flex">{nav.map(([label, id]) => <button key={id} type="button" onClick={() => scrollTo(id)} className="group relative pb-1 transition hover:text-[#dbe1e8]"><span>{label}</span><span className="absolute inset-x-0 -bottom-0.5 h-px origin-left scale-x-0 bg-[#dbe1e8] transition-transform duration-300 group-hover:scale-x-100" /></button>)}{hasActiveTickets ? <Link href="/entradas" className="group relative pb-1 transition hover:text-[#dbe1e8]"><span>Entradas</span><span className="absolute inset-x-0 -bottom-0.5 h-px origin-left scale-x-0 bg-[#dbe1e8] transition-transform duration-300 group-hover:scale-x-100" /></Link> : null}</nav>
        <div className="hidden items-center gap-3 lg:flex"><Link href="/admin/login" aria-label="Ingresar al backoffice" title="Backoffice" className="grid h-11 w-11 place-items-center rounded-xl border border-white/10 text-zinc-400 transition hover:border-[#c8cdd3]/45 hover:bg-white/[0.04] hover:text-white"><LogIn className="h-4.5 w-4.5" /></Link><button type="button" onClick={() => scrollTo('contacto')} className={`rounded-lg bg-[#c8cdd3] px-5 py-3 text-sm font-semibold text-black shadow-[0_0_24px_rgba(229,231,235,.18)] transition hover:bg-[#e5e7eb] ${ctaFocusRing}`}>Solicitá presupuesto</button></div>
        <button type="button" onClick={() => setMobileOpen(true)} className="grid h-11 w-11 place-items-center rounded-xl border border-white/15 bg-white/[0.04] text-white lg:hidden" aria-label="Abrir menú"><Menu className="h-5 w-5" /></button>
      </div>
      {mobileOpen ? <Portal><div ref={mobileMenuRef as React.RefObject<HTMLDivElement>} className="fixed inset-0 z-[100] overflow-y-auto bg-[#050505] px-5 py-5 lg:hidden" role="dialog" aria-modal="true" aria-label="Menú de navegación">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(200,205,211,.12),transparent_36%),linear-gradient(180deg,rgba(255,255,255,.04),transparent_42%)]" />
        <div className="relative flex items-center justify-between border-b border-white/10 pb-5">
          <Image src={brandAssets.logoLightOnDark} alt="M&M Eventos" width={174} height={74} className="h-16 w-auto object-contain brightness-110 contrast-125" />
          <button type="button" onClick={() => setMobileOpen(false)} className="grid h-11 w-11 place-items-center rounded-xl border border-white/15 bg-white/[0.03] text-white" aria-label="Cerrar menú"><X className="h-5 w-5" /></button>
        </div>
        <nav className="relative mt-8 grid gap-2">{nav.map(([label, id]) => <button key={id} type="button" onClick={() => { setMobileOpen(false); window.setTimeout(() => scrollTo(id), 0); }} className="group flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-4 text-left text-sm font-semibold uppercase tracking-[0.18em] text-zinc-100 transition hover:border-[#dbe1e8]/60 hover:text-[#dbe1e8]"><span className="relative pb-1">{label}<span className="absolute inset-x-0 -bottom-0.5 h-px origin-left scale-x-0 bg-[#dbe1e8] transition-transform duration-300 group-hover:scale-x-100" /></span><ArrowRight className="h-4 w-4 text-[#c8cdd3] transition group-hover:text-[#dbe1e8]" /></button>)}{hasActiveTickets ? <Link href="/entradas" onClick={() => setMobileOpen(false)} className="group flex items-center justify-between rounded-2xl border border-[#dbe1e8]/30 bg-white/[0.06] px-4 py-4 text-left text-sm font-semibold uppercase tracking-[0.18em] text-white"><span>Entradas</span><ArrowRight className="h-4 w-4 text-[#c8cdd3]" /></Link> : null}</nav>
        <div className="relative mt-8 grid gap-3">
          <button type="button" onClick={() => { setMobileOpen(false); window.setTimeout(() => scrollTo('contacto'), 0); }} className={`inline-flex items-center justify-center gap-2 rounded-xl bg-[#c8cdd3] px-5 py-4 text-sm font-semibold text-black ${ctaFocusRing}`}>Solicitá presupuesto <ArrowRight className="h-4 w-4" /></button>
          <Link href="/admin/login" onClick={() => setMobileOpen(false)} className="inline-flex items-center justify-center rounded-xl border border-white/10 px-5 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-400">Ingresar al backoffice</Link>
        </div>
      </div></Portal> : null}
    </header>

    <section ref={heroRef as React.RefObject<HTMLElement>} id="inicio" data-analytics-section="hero" className="relative min-h-[92vh] overflow-hidden pt-20 md:pt-24">
      {heroVideo && !heroVideoFailed
        ? <motion.video src={heroVideo} poster={heroImage} autoPlay muted loop playsInline onError={() => setHeroVideoFailed(true)} className="absolute inset-0 h-full w-full object-cover will-change-transform" style={shouldReduceMotion ? undefined : { scale: heroImageScale, y: heroImageY }} initial={shouldReduceMotion ? false : { opacity: 0.7 }} animate={shouldReduceMotion ? undefined : { opacity: 1 }} transition={{ duration: 1.1, ease: smoothEase }} />
        : <motion.img src={heroImage} alt="Salón M&M preparado para evento" fetchPriority="high" decoding="async" className="absolute inset-0 h-full w-full object-cover will-change-transform" style={shouldReduceMotion ? undefined : { scale: heroImageScale, y: heroImageY }} initial={shouldReduceMotion ? false : { opacity: 0.7 }} animate={shouldReduceMotion ? undefined : { opacity: 1 }} transition={{ duration: 1.1, ease: smoothEase }} />}
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,.92),rgba(0,0,0,.56),rgba(0,0,0,.22)),linear-gradient(0deg,rgba(7,7,7,1),rgba(7,7,7,.08)_38%,rgba(7,7,7,.64))]" />
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-70 mix-blend-screen [animation:hero-sheen_16s_ease-in-out_infinite] bg-[radial-gradient(55%_55%_at_25%_15%,rgba(229,229,231,.18),transparent_60%)]" />
      <div aria-hidden className="mym-grain pointer-events-none absolute inset-0" />
      <div className="relative mx-auto grid min-h-[calc(92vh-5rem)] max-w-7xl content-center px-4 py-12 md:min-h-[calc(92vh-6rem)] md:px-8 md:py-16">
        <motion.div initial={shouldReduceMotion ? false : 'hidden'} animate={shouldReduceMotion ? undefined : 'visible'} variants={listVariants} className="min-w-0 max-w-3xl">
          <motion.p variants={cardVariants} className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#f2f2f4] sm:text-xs sm:tracking-[0.42em]">M&M Eventos</motion.p>
          <motion.h1 variants={cardVariants} className="mt-5 max-w-full text-balance break-words text-4xl font-semibold leading-[1.02] tracking-tight text-white sm:text-5xl md:text-7xl">{settings.heroTitle || 'Tu evento, en el lugar que siempre soñaste'}</motion.h1>
          <motion.p variants={cardVariants} className="mt-6 max-w-xl text-sm leading-7 text-zinc-200 sm:text-base md:text-lg">{settings.heroSubtitle || 'Salones únicos, catering premium, ambientación, DJ y organización integral para que disfrutes sin preocupaciones.'}</motion.p>
          <motion.div variants={cardVariants} className="mt-8 grid gap-3 sm:flex sm:flex-wrap"><motion.button type="button" onClick={() => scrollTo('contacto')} whileHover={shouldReduceMotion ? undefined : { y: -3, scale: 1.02 }} whileTap={shouldReduceMotion ? undefined : { scale: 0.98 }} transition={softSpring} className={`inline-flex items-center justify-center gap-2 rounded-lg bg-[#e5e5e7] px-5 py-3 text-sm font-semibold text-black shadow-[0_0_0_rgba(200,205,211,0)] transition hover:bg-[#f4f4f5] hover:shadow-[0_8px_30px_rgba(200,205,211,.25)] sm:px-6 ${ctaFocusRing}`}>{settings.heroPrimaryCtaLabel || 'Solicitá presupuesto'} <motion.span whileHover={shouldReduceMotion ? undefined : { x: 3 }} transition={softSpring}><ArrowRight className="h-4 w-4" /></motion.span></motion.button><motion.button type="button" onClick={() => scrollTo('salones')} whileHover={shouldReduceMotion ? undefined : { y: -3 }} whileTap={shouldReduceMotion ? undefined : { scale: 0.98 }} transition={softSpring} className={`inline-flex items-center justify-center gap-2 rounded-lg border border-white/25 px-5 py-3 text-sm font-semibold text-white transition hover:border-[#e5e5e7] hover:text-[#f2f2f4] sm:px-6 ${ctaFocusRing}`}>{settings.heroSecondaryCtaLabel || 'Ver salones'} <motion.span whileHover={shouldReduceMotion ? undefined : { x: 3 }} transition={softSpring}><ArrowRight className="h-4 w-4" /></motion.span></motion.button></motion.div>
          <motion.div variants={listVariants} className="mt-7 flex max-w-full flex-wrap gap-2">{(heroSalons.length ? heroSalons : displaySalons.slice(0, 4)).map((salon) => <motion.button key={salon._id} variants={cardVariants} type="button" onClick={() => setSelectedSalon(salon)} whileHover={shouldReduceMotion ? undefined : { y: -2, borderColor: 'rgba(200,205,211,.8)' }} whileTap={shouldReduceMotion ? undefined : { scale: 0.98 }} transition={softSpring} className="inline-flex min-w-0 items-center gap-2 rounded-full border border-[#e5e5e7]/25 bg-black/35 px-3 py-1.5 text-xs text-zinc-200 backdrop-blur transition hover:border-[#e5e5e7] hover:bg-[#e5e5e7]/12 hover:text-white" aria-label={`Ver salón ${titleForSalon(salon)}`}><MapPin className="h-3.5 w-3.5 shrink-0 text-[#f2f2f4]" /><span className="truncate">{heroLocationForSalon(salon)}</span></motion.button>)}</motion.div>
        </motion.div>
      </div>
      <motion.button type="button" onClick={() => scrollTo('salones')} aria-label="Ver más contenido" initial={shouldReduceMotion ? false : { opacity: 0 }} animate={shouldReduceMotion ? undefined : { opacity: 1, y: [0, 8, 0] }} transition={shouldReduceMotion ? undefined : { opacity: { delay: 0.6, duration: 0.4 }, y: { delay: 1, duration: 1.8, repeat: Infinity, ease: 'easeInOut' } }} className={`absolute bottom-6 left-1/2 hidden -translate-x-1/2 rounded-full border border-white/20 bg-black/30 p-2 text-white backdrop-blur transition hover:border-[#e5e5e7] hover:text-[#e5e5e7] md:grid ${ctaFocusRing}`}>
        <ChevronDown className="h-5 w-5" />
      </motion.button>
    </section>

    <AnimatedSection id="salones" data-analytics-section="salons" className="mx-auto max-w-7xl px-5 py-20 md:px-8 md:py-24">
      <SectionTitle display eyebrow="Nuestros salones" title="Tres espacios para celebrar a tu manera" subtitle="Salones totalmente equipados, listos para llevar adelante tu evento" />
      <AnimatedGrid className="grid items-stretch gap-5 md:grid-cols-3">{displaySalons.slice(0, 3).map((salon) => <motion.article key={salon._id} variants={cardVariants} whileHover={shouldReduceMotion ? undefined : { y: -6 }} transition={softSpring} className="group relative flex h-[58vh] min-h-[420px] flex-col justify-end overflow-hidden rounded-2xl border border-white/10">
        <img src={cloudinaryImageUrl(imageForSalon(salon), 900)} alt={titleForSalon(salon)} loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-105" />
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent" />
        <div className="relative p-6">
          <h3 style={displayFont} className="text-2xl font-medium italic text-white">{titleForSalon(salon)}</h3>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-zinc-200"><span className="inline-flex min-w-0 items-center gap-1.5"><MapPin className="h-3.5 w-3.5 shrink-0 text-[#dcdcdf]" />{heroLocationForSalon(salon)}</span><span className="inline-flex min-w-0 items-center gap-1.5"><Users className="h-3.5 w-3.5 shrink-0 text-[#dcdcdf]" />{capacityForSalon(salon)}</span></div>
          <p className="mt-3 line-clamp-2 text-sm leading-6 text-zinc-300">{descriptionForSalon(salon)}</p>
          <div className="mt-5 grid grid-cols-2 gap-2"><button type="button" onClick={() => setSelectedSalon(salon)} className="rounded-lg border border-white/25 px-3 py-2.5 text-sm font-semibold text-white transition hover:border-[#e5e5e7]">Ver salón</button><button type="button" onClick={() => { setSelectedSalonId(salon._id); scrollTo('contacto'); }} className="rounded-lg bg-[#e5e5e7] px-3 py-2.5 text-sm font-semibold text-black transition hover:bg-[#f4f4f5]">Pedir presupuesto</button></div>
        </div>
      </motion.article>)}</AnimatedGrid>
    </AnimatedSection>

    <section data-analytics-section="story" className="relative border-y border-white/10 bg-[#050505] px-5 py-20 md:px-8 md:py-28">
      <div aria-hidden className="mym-grain pointer-events-none absolute inset-0" />
      <div className="relative mx-auto grid max-w-7xl gap-12 md:grid-cols-2 md:items-start md:gap-16">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.42em] text-[#dcdcdf]">Cómo trabajamos</p>
          <h2 style={displayFont} className="mt-4 text-3xl font-medium italic text-white md:text-5xl">De la idea a la fiesta</h2>
          <div className="mt-10 space-y-0">{storySteps.map((step, index) => {
            const active = index === storyStep;
            const stepImage = step.imageUrl || fallbackStorySteps[index % fallbackStorySteps.length].imageUrl;
            return <div key={step._id || step.title || index} ref={(el) => { storyRowRefs.current[index] = el; }} className={`border-l-2 py-6 pl-5 transition-colors duration-300 ${active ? 'border-white/70' : 'border-white/10'}`}>
              <div className="flex items-baseline gap-3">
                <span className={`text-xl font-semibold transition-colors duration-300 ${active ? 'text-white' : 'text-white/25'}`}>{String(index + 1).padStart(2, '0')}</span>
                <h3 className={`text-lg font-semibold transition-colors duration-300 ${active ? 'text-white' : 'text-white/45'}`}>{step.title}</h3>
              </div>
              <p className={`mt-1 pl-9 text-sm leading-6 transition-colors duration-300 ${active ? 'text-zinc-300' : 'text-zinc-500'}`}>{step.description}</p>
              <div className="mt-4 overflow-hidden rounded-xl md:hidden"><img src={cloudinaryImageUrl(stepImage, 700)} alt="" loading="lazy" decoding="async" className="h-48 w-full object-cover" /></div>
            </div>;
          })}</div>
        </div>
        <div className="relative hidden aspect-[4/5] overflow-hidden rounded-2xl border border-white/15 md:sticky md:top-28 md:block">
          {storySteps.map((step, index) => {
            const stepImage = step.imageUrl || fallbackStorySteps[index % fallbackStorySteps.length].imageUrl;
            return <img key={step._id || step.title || index} src={cloudinaryImageUrl(stepImage, 900)} alt="" loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover transition-opacity duration-700" style={{ opacity: index === storyStep ? 1 : 0 }} />;
          })}
          <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
        </div>
      </div>
    </section>

    <AnimatedSection id="paquetes" data-analytics-section="packages" className="mx-auto max-w-7xl px-5 py-20 md:px-8 md:py-24" variants={sectionVariantsSync} onViewportEnter={() => setPackagesRevealed(true)}>
      <SectionTitle eyebrow="Propuestas por salón" title="Elegí el salón y mirá sus combos" subtitle="Cada espacio tiene paquetes y beneficios propios, descubrilos." />
      <AnimatedGrid className="mb-6 flex flex-wrap justify-center gap-2">{displaySalons.map((salon) => {
        const active = selectedPackageSalon?._id === salon._id;
        return <motion.button key={salon._id} variants={cardVariants} type="button" onClick={() => setSelectedPackageSalonId(salon._id)} whileHover={shouldReduceMotion ? undefined : { y: -2 }} whileTap={shouldReduceMotion ? undefined : { scale: 0.97 }} transition={softSpring} className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${active ? 'border-[#c8cdd3] bg-[#c8cdd3] text-black' : 'border-white/15 bg-white/[0.03] text-zinc-300 hover:border-[#c8cdd3]/70 hover:text-white'}`}>{titleForSalon(salon)}</motion.button>;
      })}</AnimatedGrid>
      <AnimatePresence mode="wait">
      {selectedPackageSalon ? <motion.div key={selectedPackageSalon._id} initial={shouldReduceMotion ? false : { opacity: 0.82, y: 6 }} animate={shouldReduceMotion ? undefined : (packagesRevealed ? { opacity: 1, y: 0 } : { opacity: 0.82, y: 6 })} exit={shouldReduceMotion ? undefined : { opacity: 0.82 }} transition={{ duration: 0.18, ease: 'easeOut' }} className="mb-5 flex flex-col gap-3 rounded-2xl border border-[#c8cdd3]/20 bg-white/[0.03] p-5 md:flex-row md:items-center md:justify-between">
        <div><p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#c8cdd3]">Salón seleccionado</p><h3 className="mt-2 text-2xl font-semibold">{titleForSalon(selectedPackageSalon)}</h3><p className="mt-1 text-sm text-zinc-400">{heroLocationForSalon(selectedPackageSalon)} · {capacityForSalon(selectedPackageSalon)}</p></div>
        <button type="button" onClick={() => setSelectedSalon(selectedPackageSalon)} className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/15 px-4 py-3 text-sm font-semibold transition hover:border-[#c8cdd3] hover:text-[#f1f5f9]">Ver salón <ArrowRight className="h-4 w-4" /></button>
      </motion.div> : null}
      </AnimatePresence>
      <AnimatePresence mode="wait">
      {selectedPackageCards.length ? <motion.div key={`${selectedPackageSalon?._id || 'todos'}-combos`} initial={shouldReduceMotion ? false : 'hidden'} animate={shouldReduceMotion ? undefined : (packagesRevealed ? 'visible' : 'hidden')} exit={shouldReduceMotion ? undefined : 'hidden'} variants={listVariants} className="grid items-stretch gap-5 lg:grid-cols-3">{selectedPackageCards.map((item, index) => {
        const accent = accentFor(index + 2);
        return <motion.article key={`${selectedPackageSalon?._id || 'paquete'}-${item._id}-${index}`} variants={cardVariants} whileHover={shouldReduceMotion ? undefined : { y: -8, scale: 1.006 }} transition={softSpring} className={`min-w-0 max-w-full overflow-hidden flex min-h-[430px] flex-col rounded-2xl border p-4 transition-colors sm:p-6 ${accent.card}`}>
        <span className={`mb-5 block h-1.5 w-14 rounded-full ${accent.line}`} />
        <div className="grid min-w-0 gap-3 sm:flex sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h3 className={`max-w-full break-words text-lg font-semibold uppercase tracking-[0.1em] sm:text-xl sm:tracking-[0.12em] ${accent.text}`} title={item.name}>{item.name}</h3>
            <p className="mt-1 text-xs text-zinc-400">{selectedPackageSalon ? titleForSalon(selectedPackageSalon) : item.salonName || 'M&M Eventos'}</p>
          </div>
          <span className={`w-fit max-w-full shrink-0 rounded-md border px-2 py-1 text-[10px] font-bold uppercase ${accent.badge}`}>{item.badgeLabel || ['Más elegido', 'Premium', 'Exclusivo'][index]}</span>
        </div>
        <p className="mt-6 text-sm text-zinc-400">{item.pricingMode === 'fixed' ? 'Precio del evento' : 'Desde'}</p><p className={`text-3xl font-semibold ${accent.text}`}>{money(packagePrice(item))} <span className="text-xs text-zinc-400">{packagePriceUnit(item)}</span></p>
        {item.description ? <p className="mt-4 line-clamp-3 text-sm leading-6 text-zinc-300">{item.description}</p> : null}
        <ul className="mt-5 space-y-2 text-sm text-zinc-300">{(item.includedServices ?? []).slice(0, 6).map((service) => <li key={service} className="flex min-w-0 gap-2"><Check className={`mt-0.5 h-4 w-4 shrink-0 ${accent.text}`} /><span className="min-w-0 break-words">{service}</span></li>)}</ul>
        {item.promotionText || item.giftText ? <p className={`mt-4 rounded-lg border p-3 text-sm ${accent.badge}`}>{item.promotionText || item.giftText}</p> : null}
        <PackageFullDetail item={item} accentText={accent.text} />
        <div className="mt-auto grid gap-2 pt-6 sm:grid-cols-2">
          {selectedPackageSalon ? <button type="button" onClick={() => { setSelectedSalonId(selectedPackageSalon._id); setSelectedContactPackageId(item._id); scrollTo('contacto'); }} className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#c8cdd3] px-4 py-3 text-sm font-semibold text-black transition hover:bg-[#e5e7eb]">Solicitar propuesta <ArrowRight className="h-4 w-4" /></button> : null}
          <button type="button" onClick={() => selectedPackageSalon ? setSelectedSalon(selectedPackageSalon) : scrollTo('contacto')} className="rounded-lg border border-[#c8cdd3]/45 px-4 py-3 text-sm font-semibold transition hover:bg-[#c8cdd3] hover:text-black">Ver salón</button>
        </div>
      </motion.article>;
      })}</motion.div> : <motion.div key={`${selectedPackageSalon?._id || 'todos'}-sin-combos`} initial={shouldReduceMotion ? false : 'hidden'} animate={shouldReduceMotion ? undefined : (packagesRevealed ? 'visible' : 'hidden')} exit={shouldReduceMotion ? undefined : 'hidden'} variants={cardVariants} className="rounded-2xl border border-[#c8cdd3]/25 bg-white/[0.03] p-8 text-center"><h3 className="text-xl font-semibold">Este salón todavía no tiene combos publicados.</h3><p className="mt-2 text-sm text-zinc-400">Consultanos y armamos una propuesta personalizada para tu evento.</p>{selectedPackageSalon ? <a href={waLink(salonWhatsAppNumber(selectedPackageSalon, settings.whatsappNumber), salonWaMessage(selectedPackageSalon))} target="_blank" rel="noreferrer" className="mt-5 inline-flex items-center justify-center gap-2 rounded-lg bg-[#c8cdd3] px-5 py-3 text-sm font-semibold text-black transition hover:bg-[#e5e7eb]">Consultar por WhatsApp <ExternalLink className="h-4 w-4" /></a> : null}</motion.div>}
      </AnimatePresence>
    </AnimatedSection>

    <AnimatedSection className="mx-auto max-w-7xl px-5 pb-20 md:px-8 md:pb-24">
      <SectionTitle eyebrow="Tipos de eventos" title="Celebraciones que sabemos resolver" />
      <AnimatedGrid className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">{eventTypes.slice(0, 6).map((item, index) => {
        const accent = accentFor(index);
        return <motion.div key={item.title} variants={cardVariants} whileHover={shouldReduceMotion ? undefined : { y: -6, rotate: index % 2 ? 0.4 : -0.4 }} transition={softSpring} className={`group rounded-xl border p-4 text-center transition-colors ${accent.card}`}><motion.span className="inline-block" variants={iconPop(index)}><IconBadge name={eventTypeIconName(item, index)} tone={accent.icon} /></motion.span><h3 className={`mt-3 text-sm font-semibold uppercase tracking-[0.08em] ${accent.text}`}>{item.title}</h3></motion.div>;
      })}</AnimatedGrid>
    </AnimatedSection>

    <AnimatedSection data-analytics-section="services" className="border-y border-white/10 bg-[#0b0b0c] px-5 py-20 md:px-8 md:py-24">
      <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[0.8fr_1.2fr]"><motion.div variants={cardVariants}><p className="text-xs font-semibold uppercase tracking-[0.42em] text-[#c8cdd3]">Servicios incluidos</p><h2 className="mt-3 text-3xl font-semibold md:text-4xl">Todo lo que necesitás, nosotros lo hacemos.</h2></motion.div><AnimatedGrid className="grid gap-4 sm:grid-cols-2">{serviceBlocks.slice(0, 8).map((item, index) => {
        const accent = accentFor(index + 1);
        return <motion.div key={item.title} variants={cardVariants} whileHover={shouldReduceMotion ? undefined : { x: 4, y: -3 }} transition={softSpring} className={`flex gap-4 rounded-xl border p-4 transition-colors ${accent.card}`}><motion.div variants={badgePop(index)}><IconBadge name={item.icon} tone={accent.icon} /></motion.div><div><h3 className={`font-semibold ${accent.text}`}>{item.title}</h3><p className="mt-2 text-sm leading-6 text-zinc-300">{item.description}</p></div></motion.div>;
      })}</AnimatedGrid></div>
    </AnimatedSection>

    <AnimatedSection data-analytics-section="promotions" className="mx-auto max-w-7xl px-5 py-20 md:px-8 md:py-24">
      <SectionTitle eyebrow="Promociones y beneficios" title="Motivos para reservar hoy" />
      <AnimatedGrid className="grid gap-4 md:grid-cols-4">{(landing.promotions.length ? landing.promotions : [{ title: 'Fechas disponibles', description: 'Consultá las mejores fechas para tu evento.', icon: 'CalendarDays' }, { title: 'Promos especiales', description: 'Descuentos activos por tiempo limitado.', icon: 'Star' }, { title: 'Congelá valor con seña', description: 'Asegurá hoy el precio de tu evento.', icon: 'Gift' }, { title: 'Beneficios premium', description: 'Extras seleccionados según paquete.', icon: 'Sparkles' }]).slice(0, 4).map((item, index) => {
        const accent = accentFor(index + 2);
        return <motion.article key={item._id || item.title} variants={cardVariants} whileHover={shouldReduceMotion ? undefined : { y: -7, scale: 1.006 }} transition={softSpring} className={`group overflow-hidden rounded-xl border p-5 transition-colors ${accent.card}`}><motion.span className={`mb-4 block h-1.5 w-12 origin-left rounded-full ${accent.line}`} variants={underlineGrow(0, index, 0.04)} />{item.imageUrl ? <motion.img src={cloudinaryImageUrl(item.imageUrl, 700)} alt={item.title || 'Promoción M&M'} loading="lazy" decoding="async" className="-mx-5 -mt-5 mb-4 h-32 w-[calc(100%+2.5rem)] object-cover" variants={imageRevealVariants} /> : <motion.span className="inline-block" variants={iconPop(index)}><IconBadge name={item.icon || 'Gift'} tone={accent.icon} /></motion.span>}<h3 className={`mt-4 font-semibold ${accent.text}`}>{item.title}</h3><p className="mt-3 text-sm leading-6 text-zinc-300">{item.description || item.subtitle}</p>{item.badgeText ? <span className={`mt-4 inline-block rounded-full border px-3 py-1 text-xs ${accent.badge}`}>{item.badgeText}</span> : null}</motion.article>;
      })}</AnimatedGrid>
    </AnimatedSection>

    <AnimatedSection id="galeria" data-analytics-section="gallery" className="border-y border-white/10 bg-[#0b0b0c] px-5 py-20 md:px-8 md:py-24">
      <div className="mx-auto max-w-7xl"><SectionTitle eyebrow="Momentos M&M" title="Galería" subtitle="Momentos únicos que perduran para toda la vida" /><AnimatedGrid className="grid auto-rows-[150px] grid-cols-2 gap-3 md:grid-cols-6 md:auto-rows-[135px]">{gallery.slice(0, 10).map((item, index) => <motion.button key={item._id || item.imageUrl || index} variants={imageRevealVariants} whileHover={shouldReduceMotion ? undefined : { y: -4, scale: 1.006 }} whileTap={shouldReduceMotion ? undefined : { scale: 0.99 }} transition={softSpring} type="button" onClick={() => setGalleryLightboxIndex(index)} aria-label={`Abrir ${item.altText || item.title || 'momento M&M'}`} className={`group relative overflow-hidden rounded-xl border border-[#c8cdd3]/20 bg-[#111113] ${index === 0 ? 'md:col-span-2 md:row-span-2' : index === 3 ? 'md:col-span-2' : ''}`}><img src={cloudinaryImageUrl(galleryImageSource(item, index), index === 0 ? 900 : 500)} alt={item.altText || item.title || 'Momento M&M'} loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.025]" /><span aria-hidden className="absolute inset-0 bg-black/16" /><span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent p-3 text-left text-xs font-semibold opacity-0 transition-opacity duration-300 group-hover:opacity-100">{item.title}</span><span className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-lg border border-white/15 bg-black/45 text-white opacity-0 transition-opacity duration-300 group-hover:opacity-100"><Camera className="h-4 w-4" /></span></motion.button>)}</AnimatedGrid></div>
    </AnimatedSection>

    <AnimatedSection data-analytics-section="testimonials" className="mx-auto max-w-7xl px-5 py-20 md:px-8 md:py-24">
      <SectionTitle eyebrow="Testimonios" title="Lo que dicen quienes ya celebraron" />
      <AnimatedGrid className="grid gap-4 md:grid-cols-3">{(landing.testimonials.length ? landing.testimonials : [{ quote: 'El mejor salón, todo salió perfecto.', customerName: 'Valentina S.', eventType: '15 años', rating: 5 }, { quote: 'Increíble la calidad del servicio y la ambientación.', customerName: 'María & Juan', eventType: 'Casamiento', rating: 5 }, { quote: 'Profesionales, atentos y súper organizados.', customerName: 'Luciano R.', eventType: 'Empresarial', rating: 5 }]).slice(0, 3).map((item, index) => {
        const accent = accentFor(index);
        return <motion.blockquote key={item._id || item.customerName} variants={cardVariants} whileHover={shouldReduceMotion ? undefined : { y: -5 }} transition={softSpring} className={`rounded-xl border p-6 ${accent.card}`}><motion.span className={`mb-5 block h-1 w-10 origin-left rounded-full ${accent.line}`} variants={underlineGrow(0, index, 0.045)} /><p className="text-base leading-7 text-zinc-200">“{item.quote}”</p><footer className="mt-6 flex items-center justify-between"><div><p className={`font-semibold ${accent.text}`}>{item.customerName}</p><p className="text-sm text-zinc-300">{item.eventType}</p></div><span className="flex text-amber-400">{Array.from({ length: item.rating || 5 }).map((_, starIndex) => <motion.span key={starIndex} variants={starPop(index, starIndex)}><Star className="h-3.5 w-3.5 fill-current" /></motion.span>)}</span></footer></motion.blockquote>;
      })}</AnimatedGrid>
    </AnimatedSection>

    <AnimatedSection id="faq" className="border-y border-white/10 bg-[#0b0b0c] px-5 py-20 md:px-8 md:py-24">
      <div className="mx-auto max-w-5xl"><SectionTitle eyebrow="Preguntas frecuentes" title="Respuestas rápidas antes de consultar" /><AnimatedGrid className="grid gap-3 md:grid-cols-2">{faqs.map((item, index) => {
        return <motion.details key={item._id || item.question || index} variants={cardVariants} whileHover={shouldReduceMotion ? undefined : { y: -3 }} transition={softSpring} className="group rounded-xl border border-white/10 bg-white/[0.025] p-4 transition hover:border-[#c8cdd3]/45">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-semibold text-white">
            <span>{item.question}</span>
            <ChevronRight className="h-4 w-4 shrink-0 text-zinc-400 transition group-open:rotate-90 group-open:text-[#c8cdd3]" />
          </summary>
          <p className="mt-3 text-sm leading-6 text-zinc-300">{item.answer}</p>
        </motion.details>;
      })}</AnimatedGrid></div>
    </AnimatedSection>

    <AnimatedSection id="contacto" data-analytics-section="contact" className="mx-auto max-w-7xl px-5 py-20 md:px-8 md:py-24">
      <motion.div variants={cardVariants} className="overflow-hidden rounded-3xl border border-[#c8cdd3]/35 bg-[#0f0f10] shadow-[0_0_50px_rgba(229,231,235,.10)] lg:grid lg:grid-cols-[0.75fr_1.25fr]">
        <motion.div variants={imageRevealVariants} className="relative min-h-80 overflow-hidden p-8"><img src={cloudinaryImageUrl(gallery[0]?.imageUrl || heroImage, 900)} alt="Detalle de evento M&M" loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover opacity-45" /><div className="absolute inset-0 bg-gradient-to-t from-black via-black/45 to-transparent" /><div className="relative"><p className="text-xs font-semibold uppercase tracking-[0.32em] text-[#c8cdd3]">Hacemos realidad tu evento</p><h2 className="mt-4 text-3xl font-semibold">Contanos tu idea y te enviamos una propuesta personalizada.</h2><div className="mt-10 grid grid-cols-3 gap-3 text-center text-xs text-zinc-300"><motion.span variants={cardVariants}><MessageCircle className="mx-auto mb-2 h-5 w-5 text-[#c8cdd3]" />Respuesta rápida</motion.span><motion.span variants={cardVariants}><Sparkles className="mx-auto mb-2 h-5 w-5 text-[#c8cdd3]" />Propuesta a medida</motion.span><motion.span variants={cardVariants}><Check className="mx-auto mb-2 h-5 w-5 text-[#c8cdd3]" />Sin compromiso</motion.span></div></div></motion.div>
        <motion.form data-analytics-form="contact-form" onSubmit={submit} variants={listVariants} className="grid gap-4 p-5 md:grid-cols-2 md:p-8">
          {formMessage ? <motion.p variants={cardVariants} className={`rounded-xl border p-3 text-sm md:col-span-2 ${formState === 'success' ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-100' : 'border-red-400/30 bg-red-400/10 text-red-100'}`}>{formMessage}</motion.p> : null}
          <motion.label variants={cardVariants} className="text-xs uppercase tracking-[0.14em] text-zinc-400">Nombre<input required name="name" className="mt-2 w-full rounded-lg border border-white/10 bg-black/45 px-3 py-3 text-sm text-white outline-none focus:border-[#c8cdd3]" placeholder="Tu nombre" /></motion.label>
          <motion.label variants={cardVariants} className="text-xs uppercase tracking-[0.14em] text-zinc-400">Teléfono<input required name="phone" type="tel" minLength={6} maxLength={24} pattern="[+()0-9\s-]{6,24}" className="mt-2 w-full rounded-lg border border-white/10 bg-black/45 px-3 py-3 text-sm text-white outline-none focus:border-[#c8cdd3]" placeholder="Tu teléfono" /></motion.label>
          <motion.label variants={cardVariants} className="text-xs uppercase tracking-[0.14em] text-zinc-400">Email<input name="email" type="email" maxLength={120} className="mt-2 w-full rounded-lg border border-white/10 bg-black/45 px-3 py-3 text-sm text-white outline-none focus:border-[#c8cdd3]" placeholder="tu@email.com" /></motion.label>
          <motion.label variants={cardVariants} className="text-xs uppercase tracking-[0.14em] text-zinc-400">Tipo de evento<input required name="eventType" className="mt-2 w-full rounded-lg border border-white/10 bg-black/45 px-3 py-3 text-sm text-white outline-none focus:border-[#c8cdd3]" placeholder="15 años, casamiento..." /></motion.label>
          <motion.label variants={cardVariants} className="text-xs uppercase tracking-[0.14em] text-zinc-400">Fecha tentativa<input name="eventDate" type="date" min={todayIsoDate()} className="mt-2 w-full rounded-lg border border-white/10 bg-black/45 px-3 py-3 text-sm text-white outline-none focus:border-[#c8cdd3]" /></motion.label>
          <motion.label variants={cardVariants} className="text-xs uppercase tracking-[0.14em] text-zinc-400">Cantidad de personas<input required name="guestCount" type="number" min={contactGuestMin} max={contactGuestMax} step={1} className="mt-2 w-full rounded-lg border border-white/10 bg-black/45 px-3 py-3 text-sm text-white outline-none focus:border-[#c8cdd3]" placeholder="Nº de personas" /></motion.label>
          <motion.label variants={cardVariants} className="text-xs uppercase tracking-[0.14em] text-zinc-400">Salón de interés<select required name="salonId" value={selectedSalonId} onChange={(event) => { setSelectedSalonId(event.target.value); setSelectedContactPackageId(''); }} className="mt-2 w-full rounded-lg border border-white/10 bg-black/45 px-3 py-3 text-sm text-white outline-none focus:border-[#c8cdd3]"><option value="">Seleccioná un salón</option>{displaySalons.map((salon) => <option key={salon._id} value={salon._id}>{titleForSalon(salon)}</option>)}</select></motion.label>
          <motion.label variants={cardVariants} className="text-xs uppercase tracking-[0.14em] text-zinc-400">Propuesta de interés<select name="packageTemplateId" value={selectedContactPackageId} onChange={(event) => setSelectedContactPackageId(event.target.value)} disabled={!selectedSalonId} className="mt-2 w-full rounded-lg border border-white/10 bg-black/45 px-3 py-3 text-sm text-white outline-none focus:border-[#c8cdd3] disabled:opacity-50"><option value="">Propuesta personalizada</option>{contactPackages.map((item) => <option key={item._id} value={item._id}>{item.name} · {money(packagePrice(item))} {packagePriceUnit(item)}</option>)}</select></motion.label>
          <motion.label variants={cardVariants} className="text-xs uppercase tracking-[0.14em] text-zinc-400 md:col-span-2">Mensaje<textarea name="message" maxLength={700} className="mt-2 min-h-24 w-full rounded-lg border border-white/10 bg-black/45 px-3 py-3 text-sm text-white outline-none focus:border-[#c8cdd3]" placeholder="Contanos más detalles de tu evento..." /></motion.label>
          <motion.button variants={cardVariants} whileHover={shouldReduceMotion ? undefined : { y: -3, scale: 1.01 }} whileTap={shouldReduceMotion ? undefined : { scale: 0.98 }} transition={softSpring} disabled={formState === 'loading'} className={`inline-flex items-center justify-center gap-2 rounded-lg bg-[#c8cdd3] px-5 py-3 text-sm font-semibold text-black transition hover:bg-[#e5e7eb] hover:shadow-[0_8px_30px_rgba(200,205,211,.25)] disabled:opacity-60 md:col-span-2 ${ctaFocusRing}`}>{formState === 'loading' ? 'Enviando...' : 'Solicitar presupuesto'} <Send className="h-4 w-4" /></motion.button>
        </motion.form>
      </motion.div>
    </AnimatedSection>

    <AnimatedSection id="ubicaciones" data-analytics-section="location" className="border-y border-white/10 bg-[#0b0b0c] px-5 py-20 md:px-8 md:py-24">
      <div className="mx-auto max-w-7xl">
        <SectionTitle eyebrow="Ubicaciones" title="Encontrá el salón más cómodo para tu evento" subtitle="Cada espacio tiene su mapa para que puedas calcular tiempos, accesos y coordinar una visita." />
        <AnimatedGrid className="grid gap-6 lg:grid-cols-3">
          {displaySalons.slice(0, 3).map((salon, index) => {
            const accent = accentFor(index + 3);
            return <motion.article key={salon._id} variants={cardVariants} whileHover={shouldReduceMotion ? undefined : { y: -7, scale: 1.01 }} transition={softSpring} className={`overflow-hidden rounded-2xl border ${accent.card}`}>
              <motion.div variants={imageRevealVariants} viewport={{ once: true, amount: 0.3, margin: '0px 0px -100px 0px' }} onViewportEnter={() => setLoadedMapIds((current) => (current.has(salon._id) ? current : new Set(current).add(salon._id)))} className="relative h-72 bg-[#111113]">
                {loadedMapIds.has(salon._id) ? <iframe
                  title={`Mapa de ${titleForSalon(salon)}`}
                  src={mapUrlForSalon(salon)}
                  className="h-full w-full"
                  referrerPolicy="no-referrer-when-downgrade"
                  style={{ border: 0 }}
                  allowFullScreen
                /> : <div className="grid h-full w-full place-items-center gap-2 bg-[radial-gradient(circle_at_30%_20%,rgba(200,205,211,.1),transparent_55%)] text-center text-sm font-semibold text-zinc-500" aria-hidden="true">
                  <MapPin className="h-7 w-7 text-[#c8cdd3]/50" />
                  Cargando mapa…
                </div>}
              </motion.div>
              <div className="p-5">
                <span className={`mb-4 block h-1.5 w-12 rounded-full ${accent.line}`} />
                <h3 className={`text-xl font-semibold ${accent.text}`}>{titleForSalon(salon)}</h3>
                <p className="mt-3 flex gap-2 text-sm leading-6 text-zinc-200"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#dbe1e8]" />{locationForSalon(salon)}</p>
                <p className="mt-2 flex gap-2 text-sm leading-6 text-zinc-300"><Users className="mt-0.5 h-4 w-4 shrink-0 text-[#dbe1e8]" />{capacityForSalon(salon)}</p>
                <div className="mt-5 grid gap-2 sm:grid-cols-2">
                  <a href={mapExternalUrlForSalon(salon)} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#c8cdd3] px-4 py-3 text-sm font-semibold text-black transition hover:bg-[#e5e7eb]">Abrir mapa <ExternalLink className="h-4 w-4" /></a>
                  <button type="button" onClick={() => setSelectedSalon(salon)} className="rounded-lg border border-[#c8cdd3]/45 px-4 py-3 text-sm font-semibold transition hover:bg-[#c8cdd3] hover:text-black">Ver salón</button>
                </div>
              </div>
            </motion.article>;
          })}
        </AnimatedGrid>
      </div>
    </AnimatedSection>

    <AnimatedSection data-analytics-section="closing-cta" className="relative flex min-h-[70vh] items-center overflow-hidden px-5 py-24 md:px-8">
      <motion.img variants={imageRevealVariants} src={cloudinaryImageUrl(gallery[2]?.imageUrl || gallery[0]?.imageUrl || heroImage, 1800)} alt="" aria-hidden loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover" />
      <div aria-hidden className="absolute inset-0 bg-[linear-gradient(0deg,rgba(7,7,7,.96),rgba(7,7,7,.72)_55%,rgba(7,7,7,.4))]" />
      <div aria-hidden className="mym-grain pointer-events-none absolute inset-0" />
      <div className="relative mx-auto max-w-3xl text-center">
        <motion.p variants={cardVariants} className="text-xs font-semibold uppercase tracking-[0.42em] text-[#dcdcdf]">M&M Eventos</motion.p>
        <motion.h2 variants={cardVariants} style={displayFont} className="mt-5 text-balance text-4xl font-medium italic leading-[1.08] text-white md:text-6xl">Tu evento merece un lugar así de memorable.</motion.h2>
        <motion.p variants={cardVariants} className="mx-auto mt-6 max-w-xl text-base leading-7 text-zinc-300 md:text-lg">Contanos tu fecha y armamos, sin cargo, una propuesta a tu medida.</motion.p>
        <motion.div variants={cardVariants} className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <button type="button" onClick={() => scrollTo('contacto')} className={`inline-flex items-center justify-center gap-2 rounded-lg bg-[#e5e5e7] px-6 py-3.5 text-sm font-semibold text-black transition hover:bg-[#f4f4f5] ${ctaFocusRing}`}>Pedir presupuesto <ArrowRight className="h-4 w-4" /></button>
          <button type="button" onClick={() => scrollTo('ubicaciones')} className={`inline-flex items-center justify-center gap-2 rounded-lg border border-white/25 px-6 py-3.5 text-sm font-semibold text-white transition hover:border-[#e5e5e7] hover:text-[#f2f2f4] ${ctaFocusRing}`}>Ver disponibilidad <MapPin className="h-4 w-4" /></button>
        </motion.div>
        <motion.button variants={cardVariants} type="button" onClick={() => setSocialNetwork('whatsapp')} className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-zinc-300 transition hover:text-white"><WhatsAppIcon className="h-4 w-4" />O escribinos directamente por WhatsApp</motion.button>
      </div>
    </AnimatedSection>

    <footer className="border-t border-white/10 bg-[#080808] px-5 py-10 md:px-8">
      <div className="mx-auto grid max-w-7xl gap-8 md:grid-cols-2 lg:grid-cols-5">
        <div><Image src={brandAssets.logoLightOnDark} alt="M&M Eventos" width={150} height={64} className="h-14 w-auto object-contain" /><p className="mt-3 text-sm leading-6 text-zinc-400">{settings.footerText || 'Creamos momentos únicos que permanecen para siempre.'}</p><div className="mt-4 flex gap-2">{socialOptions.map((item) => <button key={item.key} type="button" onClick={() => setSocialNetwork(item.key)} aria-label={`Elegir salón para ${item.label}`} title={item.label} className="grid h-9 w-9 place-items-center rounded-lg border border-[#c8cdd3]/30 text-[#c8cdd3] transition hover:bg-[#c8cdd3] hover:text-black"><item.icon className="h-4 w-4" /></button>)}</div></div>
        <div><h3 className="text-xs uppercase tracking-[0.24em] text-[#c8cdd3]">Navegación</h3><div className="mt-4 grid gap-2 text-sm text-zinc-400">{nav.map(([label, id]) => <button key={id} type="button" onClick={() => scrollTo(id)} className="text-left hover:text-white">{label}</button>)}</div></div>
        <div><h3 className="text-xs uppercase tracking-[0.24em] text-[#c8cdd3]">Nuestros salones</h3><div className="mt-4 grid gap-2 text-sm text-zinc-400">{displaySalons.map((salon) => <button key={salon._id} type="button" onClick={() => setSelectedSalon(salon)} className="text-left hover:text-white" aria-label={`Ver salón ${titleForSalon(salon)}`}>{titleForSalon(salon)}</button>)}</div></div>
        <div><h3 className="text-xs uppercase tracking-[0.24em] text-[#c8cdd3]">Búsquedas locales</h3><div className="mt-4 grid gap-2 text-sm text-zinc-400">{footerSeoLinks.map((item) => <Link key={item.href} href={item.href} className="text-left hover:text-white">{item.label}</Link>)}</div></div>
        <div><h3 className="text-xs uppercase tracking-[0.24em] text-[#c8cdd3]">Contacto</h3><div className="mt-4 grid gap-2 text-sm text-zinc-400"><span>{settings.contactPhone || ''}</span><span>{settings.contactEmail || 'mymsalondeeventoslaplata@gmail.com'}</span><button type="button" onClick={() => setSocialNetwork('whatsapp')} className="text-left text-[#c8cdd3] hover:text-[#e5e7eb]">Escribinos por WhatsApp</button></div></div>
      </div>
    </footer>

    {activeSocial ? <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={`Elegir salón para ${activeSocial.label}`}>
      <section ref={socialPanelRef as React.RefObject<HTMLElement>} className="w-full max-w-lg rounded-2xl border border-[#c8cdd3]/35 bg-[#0f0f10] p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#c8cdd3]">Contacto por salón</p><h2 className="mt-2 text-2xl font-semibold">Elegí a cuál {activeSocial.label} acceder</h2><p className="mt-2 text-sm text-zinc-400">Cada salón administra su propio canal.</p></div><button type="button" onClick={() => setSocialNetwork(null)} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-white/15 text-white transition hover:bg-white hover:text-black" aria-label="Cerrar selector"><X className="h-4 w-4" /></button></div>
        <div className="mt-5 grid gap-3">{displaySalons.map((salon) => {
          const href = activeSocial.key === 'whatsapp' ? waLink(salonWhatsAppNumber(salon, settings.whatsappNumber), settings.whatsappDefaultMessage) : salon[activeSocial.field];
          return href ? <a key={salon._id} href={href} target="_blank" rel="noreferrer" className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm transition hover:border-[#c8cdd3] hover:bg-[#c8cdd3]/10"><span><strong className="block text-white">{titleForSalon(salon)}</strong><span className="text-zinc-400">{locationForSalon(salon)}</span></span><activeSocial.icon className="h-5 w-5 text-[#c8cdd3]" /></a> : <div key={salon._id} className="rounded-xl border border-white/10 px-4 py-3 text-sm text-zinc-400"><strong className="block text-zinc-300">{titleForSalon(salon)}</strong>Sin {activeSocial.label} configurado</div>;
        })}</div>
      </section>
    </div> : null}

    <SalonDetailModal salon={selectedSalon} onClose={() => setSelectedSalon(null)} onRequestQuote={(salon) => { setSelectedSalon(null); setSelectedSalonId(salon._id); window.setTimeout(() => scrollTo('contacto'), 0); }} />
    <GalleryLightbox items={gallery} index={galleryLightboxIndex} onClose={() => setGalleryLightboxIndex(null)} onSelect={setGalleryLightboxIndex} />

    <button data-analytics-id="floating-whatsapp" type="button" onClick={() => setSocialNetwork('whatsapp')} aria-label="Contactar por WhatsApp" className="fixed bottom-24 right-5 z-30 grid h-14 w-14 place-items-center rounded-full bg-[#25d366] text-white shadow-2xl transition hover:scale-105 md:bottom-8"><WhatsAppIcon className="h-7 w-7" /></button>
    <button data-analytics-id="floating-request-quote" type="button" onClick={() => scrollTo('contacto')} className="fixed bottom-4 left-4 right-4 z-30 rounded-lg bg-[#c8cdd3] px-4 py-3 text-sm font-semibold text-black shadow-2xl md:bottom-8 md:left-auto md:right-24">Solicitá tu presupuesto</button>
    <button type="button" onClick={() => scrollTo('inicio')} aria-label="Volver arriba" className="fixed bottom-4 left-4 z-30 hidden rounded-lg border border-white/20 bg-black/60 p-3 backdrop-blur md:grid"><ChevronUp className="h-4 w-4" /></button>
  </main>;
}
