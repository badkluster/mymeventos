'use client';

/* eslint-disable @next/next/no-img-element */

import Image from 'next/image';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, Camera, Check, ChevronLeft, ChevronRight, ChevronUp, Clock3, Gift, MapPin, MessageCircle, PackageCheck, PlayCircle, Sparkles, Users, Utensils, X } from 'lucide-react';
import { api } from '@/lib/api';
import { brandAssets } from '@/lib/brand-assets';
import { faqs, packages as fallbackPackages, services } from '@/features/landing/data/landing-data';

type PublicMedia = {
  _id?: string;
  url: string;
  secureUrl?: string;
  resourceType: 'image' | 'video' | 'raw';
  title?: string;
  altText?: string;
  displayOrder?: number;
};

type PublicPackage = {
  _id: string;
  name: string;
  durationHours?: number;
  startTime?: string;
  endTime?: string;
  pricePerPerson?: number;
  discountPercentage?: number;
  finalPricePerPerson?: number;
  depositAmount?: number;
  paymentTerms?: string;
  promotionText?: string;
  giftText?: string;
  includedServices?: string[];
  menuSections?: { title?: string; name?: string; items: string[] }[];
  ruleConfigured?: boolean;
};

type PublicExtra = {
  _id?: string;
  name: string;
  description?: string;
  basePrice?: number;
  includedByDefault?: boolean;
};

type PublicSalon = {
  _id: string;
  name: string;
  slug?: string;
  address?: string;
  city?: string;
  locality?: string;
  province?: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
  publicTitle?: string;
  publicShortDescription?: string;
  publicDescription?: string;
  heroImageUrl?: string;
  galleryImageUrls?: string[];
  mediaGallery?: PublicMedia[];
  locationText?: string;
  mapUrl?: string;
  minCapacity?: number;
  maxCapacity?: number;
  recommendedCapacity?: number;
  defaultStartTime?: string;
  defaultEndTime?: string;
  defaultDurationHours?: number;
  allowsExtraHour?: boolean;
  extraHourPrice?: number;
  defaultDepositAmount?: number;
  defaultPaymentTerms?: string;
  packages?: PublicPackage[];
  extraServices?: PublicExtra[];
};

const section = 'mx-auto max-w-6xl px-6 py-20';
const money = (value?: number) => value ? new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(value) : 'Consultar';

function Portal({ children }: { children: React.ReactNode }) {
  if (typeof document === 'undefined') return null;
  return createPortal(children, document.body);
}

function salonTitle(salon: PublicSalon) {
  return salon.publicTitle || salon.name;
}

function salonLocation(salon: PublicSalon) {
  return salon.locationText || salon.locality || salon.city || salon.address || 'Ubicación a confirmar';
}

function salonDescription(salon: PublicSalon) {
  return salon.publicShortDescription || salon.publicDescription || 'Un espacio M&M preparado para celebrar con atención integral, servicios coordinados y una propuesta comercial personalizada.';
}

function salonMedia(salon: PublicSalon): PublicMedia[] {
  const structured = salon.mediaGallery ?? [];
  const gallery: PublicMedia[] = (salon.galleryImageUrls ?? []).map((url, index) => ({ url, resourceType: 'image' as const, displayOrder: index + 20 }));
  const hero: PublicMedia[] = salon.heroImageUrl ? [{ url: salon.heroImageUrl, resourceType: 'image' as const, displayOrder: -1, title: salonTitle(salon) }] : [];
  const seen = new Set<string>();
  return [...hero, ...structured, ...gallery]
    .filter((asset) => asset.url || asset.secureUrl)
    .filter((asset) => {
      const url = asset.secureUrl || asset.url;
      if (seen.has(url)) return false;
      seen.add(url);
      return true;
    })
    .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
}

function Capacity({ salon }: { salon: PublicSalon }) {
  if (!salon.minCapacity && !salon.maxCapacity && !salon.recommendedCapacity) return <span>Capacidad a confirmar</span>;
  if (salon.minCapacity && salon.maxCapacity) return <span>{salon.minCapacity} a {salon.maxCapacity} personas</span>;
  return <span>Hasta {salon.maxCapacity || salon.recommendedCapacity} personas</span>;
}

function MediaFrame({ asset, title, className = '' }: { asset?: PublicMedia; title: string; className?: string }) {
  if (!asset) return <div className={`grid place-items-end overflow-hidden bg-[radial-gradient(circle_at_top_left,#71717a,transparent_36%),linear-gradient(135deg,#27272a,#030303)] p-5 ${className}`}><span className="rounded-full bg-white/10 px-3 py-1 text-xs text-white/80 backdrop-blur">M&M Eventos</span></div>;
  const source = asset.secureUrl || asset.url;
  if (asset.resourceType === 'video') return <video src={source} className={`h-full w-full object-cover ${className}`} controls playsInline preload="metadata" aria-label={asset.title || title} />;
  return <img src={source} alt={asset.altText || asset.title || title} className={`h-full w-full object-cover ${className}`} loading="lazy" />;
}

function whatsappHref(phone: string | undefined, message: string) {
  const digits = phone?.replace(/\D/g, '');
  return `https://wa.me/${digits || ''}?text=${encodeURIComponent(message)}`;
}

function salonWhatsappMessage(salon: PublicSalon) {
  return `Hola M&M Eventos, vengo de la web y quiero obtener más información sobre ${salonTitle(salon)} (${salonLocation(salon)}). ¿Me podrían asesorar para realizar un evento?`;
}

function packageWhatsappMessage(salon: PublicSalon, item: PublicPackage) {
  const price = item.finalPricePerPerson || item.pricePerPerson ? ` Valor publicado: ${money(item.finalPricePerPerson || item.pricePerPerson)} por persona.` : '';
  return `Hola M&M Eventos, vengo de la web y quiero consultar por el salón ${salonTitle(salon)} y el paquete ${item.name}.${price} ¿Me podrían enviar más información y disponibilidad?`;
}

function mapEmbedUrl(salon: PublicSalon) {
  const query = salon.address || salon.locationText || [salon.name, salon.locality || salon.city, salon.province].filter(Boolean).join(', ');
  return `https://www.google.com/maps?q=${encodeURIComponent(query)}&output=embed`;
}

function PackageCard({ item, cta }: { item: PublicPackage; cta?: React.ReactNode }) {
  return <article className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
    <div className="flex items-start justify-between gap-3">
      <div>
        <h4 className="text-lg font-semibold text-white">{item.name}</h4>
        <p className="mt-1 text-sm text-zinc-400">{item.durationHours ? `${item.durationHours} horas` : 'Duración a confirmar'}{item.startTime && item.endTime ? ` · ${item.startTime} a ${item.endTime}` : ''}</p>
      </div>
      {item.discountPercentage ? <span className="rounded-full bg-emerald-400/10 px-2.5 py-1 text-xs font-semibold text-emerald-200">{item.discountPercentage}% off</span> : null}
    </div>
    <p className="mt-4 text-2xl font-semibold">{money(item.finalPricePerPerson || item.pricePerPerson)} <span className="text-xs font-normal text-zinc-400">por persona</span></p>
    {item.promotionText ? <p className="mt-3 rounded-xl border border-amber-300/20 bg-amber-300/10 p-3 text-sm text-amber-100">{item.promotionText}</p> : null}
    {item.giftText ? <p className="mt-3 flex gap-2 text-sm text-zinc-300"><Gift className="mt-0.5 h-4 w-4 shrink-0 text-amber-200" />{item.giftText}</p> : null}
    {item.includedServices?.length ? <ul className="mt-4 space-y-2 text-sm text-zinc-300">{item.includedServices.slice(0, 5).map((service) => <li key={service} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />{service}</li>)}</ul> : null}
    {cta ? <div className="mt-5">{cta}</div> : null}
  </article>;
}

function SalonDetailModal({ salon, onClose, onRequestQuote }: { salon?: PublicSalon; onClose: () => void; onRequestQuote: (salon: PublicSalon) => void }) {
  const [selectedMediaIndex, setSelectedMediaIndex] = useState(0);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [mapOpen, setMapOpen] = useState(false);
  const media = useMemo(() => salon ? salonMedia(salon) : [], [salon]);

  useEffect(() => {
    if (!salon) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [salon]);

  if (!salon) return null;

  const safeMediaIndex = Math.min(selectedMediaIndex, Math.max(media.length - 1, 0));
  const selectedMedia = media[safeMediaIndex];
  const lightboxMedia = lightboxIndex !== null ? media[Math.min(lightboxIndex, Math.max(media.length - 1, 0))] : undefined;
  const packages = salon.packages ?? [];
  const extras = salon.extraServices ?? [];
  const goLightbox = (direction: 1 | -1) => setLightboxIndex((current) => {
    if (current === null || !media.length) return current;
    return (current + direction + media.length) % media.length;
  });

  return <AnimatePresence>
    <motion.div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 px-4 py-6 backdrop-blur-md md:px-8" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.article className="mx-auto max-w-6xl overflow-hidden rounded-[2rem] border border-white/10 bg-zinc-950 text-white shadow-2xl" initial={{ opacity: 0, y: 28, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 18, scale: 0.98 }} transition={{ duration: 0.22 }} onClick={(event) => event.stopPropagation()}>
        <div className="relative">
          <button type="button" onClick={() => media.length && setLightboxIndex(safeMediaIndex)} className="block h-[48vh] min-h-80 w-full overflow-hidden text-left" aria-label="Abrir imagen principal en galería">
            <MediaFrame asset={selectedMedia} title={salonTitle(salon)} className="h-full w-full" />
          </button>
          <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/25 to-transparent" />
          <button type="button" onClick={onClose} aria-label="Cerrar detalle del salón" className="absolute right-5 top-5 rounded-full border border-white/15 bg-black/45 p-2.5 text-white backdrop-blur transition hover:bg-white hover:text-black"><X className="h-5 w-5" /></button>
          <div className="absolute bottom-0 left-0 right-0 p-6 md:p-8">
            <motion.p initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="text-sm uppercase tracking-[.3em] text-zinc-300">Salón M&M</motion.p>
            <motion.h3 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.04 }} className="mt-2 max-w-3xl text-4xl font-semibold md:text-6xl">{salonTitle(salon)}</motion.h3>
            <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }} className="mt-4 flex items-center gap-2 text-zinc-200"><MapPin className="h-4 w-4" />{salonLocation(salon)}</motion.p>
          </div>
        </div>

        <div className="grid gap-8 p-6 md:p-8 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="space-y-8">
            <section>
              <h4 className="text-2xl font-semibold">Detalle del salón</h4>
              <p className="mt-4 max-w-3xl text-base leading-7 text-zinc-300">{salon.publicDescription || salonDescription(salon)}</p>
              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4"><Users className="h-5 w-5 text-zinc-300" /><p className="mt-3 text-sm text-zinc-400">Capacidad</p><p className="mt-1 font-semibold"><Capacity salon={salon} /></p></div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4"><Clock3 className="h-5 w-5 text-zinc-300" /><p className="mt-3 text-sm text-zinc-400">Horario sugerido</p><p className="mt-1 font-semibold">{salon.defaultStartTime && salon.defaultEndTime ? `${salon.defaultStartTime} a ${salon.defaultEndTime}` : salon.defaultDurationHours ? `${salon.defaultDurationHours} horas` : 'A coordinar'}</p></div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4"><PackageCheck className="h-5 w-5 text-zinc-300" /><p className="mt-3 text-sm text-zinc-400">Paquetes activos</p><p className="mt-1 font-semibold">{packages.length || 'A configurar'}</p></div>
              </div>
            </section>

            <section>
              <div className="flex items-center justify-between gap-4">
                <h4 className="text-2xl font-semibold">Galería</h4>
                <span className="flex items-center gap-2 text-sm text-zinc-400"><Camera className="h-4 w-4" />{media.length ? `${media.length} archivos` : 'Sin imágenes cargadas'}</span>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                {(media.length ? media : [undefined, undefined, undefined, undefined]).slice(0, 8).map((asset, index) => <button key={asset?._id || asset?.url || index} type="button" onClick={() => { setSelectedMediaIndex(index); if (asset) setLightboxIndex(index); }} className={`relative h-28 overflow-hidden rounded-2xl border transition ${safeMediaIndex === index ? 'border-white' : 'border-white/10 hover:border-white/40'}`} aria-label={`Ver imagen ${index + 1} de ${salonTitle(salon)}`}>
                  <MediaFrame asset={asset} title={salonTitle(salon)} className="h-full w-full" />
                  {asset?.resourceType === 'video' ? <span className="absolute inset-0 grid place-items-center bg-black/20"><PlayCircle className="h-8 w-8" /></span> : null}
                </button>)}
              </div>
            </section>

            <section>
              <h4 className="text-2xl font-semibold">Paquetes disponibles</h4>
              {packages.length ? <div className="mt-4 grid gap-4 md:grid-cols-2">{packages.map((item) => <PackageCard key={`${salon._id}-${item._id}`} item={item} cta={<a href={whatsappHref(salon.whatsapp, packageWhatsappMessage(salon, item))} target="_blank" rel="noreferrer" className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-white px-4 py-2.5 text-sm font-semibold text-black transition hover:bg-zinc-200"><MessageCircle className="h-4 w-4" />Consultar paquete</a>} />)}</div> : <p className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] p-5 text-zinc-300">Todavía no hay paquetes públicos cargados para este salón. Podés consultar y armamos una propuesta personalizada.</p>}
            </section>
          </div>

          <aside className="space-y-5">
            <div className="rounded-3xl border border-white/10 bg-white p-6 text-black">
              <p className="text-sm font-medium text-zinc-500">Consultar este salón</p>
              <h4 className="mt-2 text-2xl font-semibold">{salonTitle(salon)}</h4>
              <p className="mt-3 text-sm leading-6 text-zinc-600">{salonDescription(salon)}</p>
              <a href="#contacto" onClick={(event) => { event.preventDefault(); onRequestQuote(salon); }} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-black px-5 py-3 text-sm font-medium text-white transition hover:bg-zinc-800">Solicitar presupuesto <ArrowRight className="h-4 w-4" /></a>
              <a href={whatsappHref(salon.whatsapp, salonWhatsappMessage(salon))} target="_blank" rel="noreferrer" className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-full border border-zinc-200 px-5 py-3 text-sm font-medium transition hover:bg-zinc-100"><MessageCircle className="h-4 w-4" />WhatsApp</a>
            </div>

            {extras.length ? <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
              <h4 className="flex items-center gap-2 text-lg font-semibold"><Sparkles className="h-5 w-5 text-amber-200" />Extras disponibles</h4>
              <div className="mt-4 space-y-3">
                {extras.map((extra) => <div key={extra._id || extra.name} className="rounded-2xl border border-white/10 p-4">
                  <p className="font-medium">{extra.name}</p>
                  {extra.description ? <p className="mt-1 text-sm text-zinc-400">{extra.description}</p> : null}
                  <p className="mt-2 text-sm text-zinc-300">{extra.includedByDefault ? 'Incluido según propuesta' : 'Disponible para sumar al evento'}</p>
                </div>)}
              </div>
            </div> : null}

            <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
              <h4 className="flex items-center gap-2 text-lg font-semibold"><Utensils className="h-5 w-5 text-zinc-300" />Condiciones comerciales</h4>
              <dl className="mt-4 space-y-3 text-sm text-zinc-300">
                <div><dt className="text-zinc-500">Seña sugerida</dt><dd className="mt-1 font-medium text-white">{money(salon.defaultDepositAmount)}</dd></div>
                <div><dt className="text-zinc-500">Condiciones de pago</dt><dd className="mt-1 leading-6">{salon.defaultPaymentTerms || 'A coordinar según fecha, paquete y cantidad de invitados.'}</dd></div>
              </dl>
            </div>

            <button type="button" onClick={() => setMapOpen(true)} className="block w-full rounded-3xl border border-white/10 bg-white/[0.04] p-6 text-left transition hover:bg-white/10"><MapPin className="h-5 w-5 text-zinc-300" /><p className="mt-3 font-semibold">Ver ubicación en mapa</p><p className="mt-1 text-sm text-zinc-400">{salon.address || salonLocation(salon)}</p></button>
          </aside>
        </div>
      </motion.article>

      <Portal>
      <AnimatePresence>
        {lightboxMedia ? <motion.div className="fixed inset-0 z-[60] grid place-items-center bg-black/90 p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={(event) => { event.stopPropagation(); setLightboxIndex(null); }}>
          <button type="button" aria-label="Cerrar galería" onClick={() => setLightboxIndex(null)} className="absolute right-5 top-5 rounded-full border border-white/15 bg-white/10 p-2.5 text-white backdrop-blur transition hover:bg-white hover:text-black"><X className="h-5 w-5" /></button>
          {media.length > 1 ? <button type="button" aria-label="Imagen anterior" onClick={(event) => { event.stopPropagation(); goLightbox(-1); }} className="absolute left-5 top-1/2 rounded-full border border-white/15 bg-white/10 p-3 text-white backdrop-blur transition hover:bg-white hover:text-black"><ChevronLeft className="h-6 w-6" /></button> : null}
          <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }} className="max-h-[86vh] w-full max-w-5xl overflow-hidden rounded-3xl border border-white/10 bg-zinc-950 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="h-[76vh] max-h-[760px] bg-black">
              <MediaFrame asset={lightboxMedia} title={salonTitle(salon)} className="h-full w-full object-contain" />
            </div>
            <div className="flex items-center justify-between gap-4 px-5 py-4 text-sm text-zinc-300">
              <span>{lightboxMedia.title || salonTitle(salon)}</span>
              <span>{(lightboxIndex ?? 0) + 1} / {media.length}</span>
            </div>
          </motion.div>
          {media.length > 1 ? <button type="button" aria-label="Imagen siguiente" onClick={(event) => { event.stopPropagation(); goLightbox(1); }} className="absolute right-5 top-1/2 rounded-full border border-white/15 bg-white/10 p-3 text-white backdrop-blur transition hover:bg-white hover:text-black"><ChevronRight className="h-6 w-6" /></button> : null}
        </motion.div> : null}
      </AnimatePresence>

      <AnimatePresence>
        {mapOpen ? <motion.div className="fixed inset-0 z-[60] grid place-items-center bg-black/80 p-4 backdrop-blur" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={(event) => { event.stopPropagation(); setMapOpen(false); }}>
          <motion.div initial={{ opacity: 0, y: 16, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 12, scale: 0.98 }} className="w-full max-w-4xl overflow-hidden rounded-3xl border border-white/10 bg-zinc-950 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between gap-4 border-b border-white/10 p-5">
              <div><p className="text-sm text-zinc-400">Ubicación</p><h4 className="text-xl font-semibold">{salonTitle(salon)}</h4></div>
              <button type="button" aria-label="Cerrar mapa" onClick={() => setMapOpen(false)} className="rounded-full border border-white/15 p-2 text-white transition hover:bg-white hover:text-black"><X className="h-5 w-5" /></button>
            </div>
            <iframe src={mapEmbedUrl(salon)} title={`Mapa de ${salonTitle(salon)}`} className="h-[65vh] w-full border-0" loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
          </motion.div>
        </motion.div> : null}
      </AnimatePresence>
      </Portal>
    </motion.div>
  </AnimatePresence>;
}

export default function Home() {
  const [salons, setSalons] = useState<PublicSalon[]>([]);
  const [selectedSalon, setSelectedSalon] = useState<PublicSalon>();
  const [formSalonId, setFormSalonId] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void api.get<{ salons: PublicSalon[] }>('/public/salons').then((data) => setSalons(data.salons ?? [])).catch((error: Error) => setMessage(error.message));
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    if (!data.get('salonId')) return setMessage('Seleccioná un salón para continuar.');
    setLoading(true);
    setMessage('');
    try {
      await api.post('/public/quick-quote', { name: data.get('name'), phone: data.get('phone'), email: data.get('email'), eventType: data.get('eventType'), eventDate: data.get('eventDate') || undefined, guestCount: Number(data.get('guestCount')), salonId: data.get('salonId'), message: data.get('message') });
      form.reset();
      setFormSalonId('');
      setMessage('Recibimos tu solicitud. Un asesor de M&M Eventos se contactará para enviarte el presupuesto.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo enviar la consulta.');
    } finally {
      setLoading(false);
    }
  }

  const featuredPackages = salons.flatMap((salon) => (salon.packages ?? []).map((item) => ({ ...item, salonName: salonTitle(salon), salonId: salon._id }))).slice(0, 6);
  const requestQuoteForSalon = (salon: PublicSalon) => {
    setFormSalonId(salon._id);
    setSelectedSalon(undefined);
    window.setTimeout(() => document.getElementById('contacto')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };

  return <main className="bg-zinc-950 text-white">
    <header className="sticky top-0 z-10 border-b border-white/10 bg-zinc-950/90 px-6 py-3 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between">
        <Image src={brandAssets.logoLightOnDark} alt="M&M Eventos" width={132} height={132} className="h-12 w-auto object-contain" priority />
        <a href="#contacto" className="rounded-full border border-white/20 px-4 py-2 text-sm text-zinc-100 transition hover:bg-white hover:text-black">Consultar</a>
      </div>
    </header>

    <section className="grid min-h-[70vh] place-items-center bg-[radial-gradient(circle_at_top,#3f3f46,transparent_45%)] px-6 text-center">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
        <Image src={brandAssets.logoLightOnDark} alt="M&M Salón de Eventos" width={260} height={260} className="mx-auto mb-8 h-auto w-56 object-contain md:w-72" priority />
        <p className="text-sm tracking-[.3em] text-zinc-400">{salons.map((salon) => salon.locality || salon.city).filter(Boolean).join(' · ') || 'LA PLATA · SAN CARLOS · VILLA ELISA'}</p>
        <h1 className="mt-5 text-5xl font-semibold md:text-7xl">Eventos memorables<br />en espacios únicos</h1>
        <p className="mx-auto mt-5 max-w-2xl text-zinc-300">Salones, catering, ambientación, DJ, staff y organización completa.</p>
        <a href="#contacto" className="mt-8 inline-block rounded-full bg-white px-6 py-3 text-black transition hover:bg-zinc-200">Solicitar presupuesto</a>
      </motion.div>
    </section>

    <section className={section}>
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[.3em] text-zinc-500">Espacios reales cargados en sistema</p>
          <h2 className="mt-3 text-4xl font-semibold">Nuestros salones</h2>
        </div>
        <p className="max-w-md text-sm leading-6 text-zinc-400">Seleccioná un salón para ver galería, capacidad, condiciones comerciales y paquetes activos.</p>
      </div>
      <div className="mt-8 grid gap-5 md:grid-cols-3">
        {salons.map((salon, index) => {
          const media = salonMedia(salon);
          return <motion.button key={salon._id} type="button" onClick={() => setSelectedSalon(salon)} initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: index * 0.05 }} className="group overflow-hidden rounded-3xl border border-white/10 bg-zinc-900 text-left shadow-2xl shadow-black/20 transition hover:-translate-y-1 hover:border-white/25">
            <div className="relative h-56 overflow-hidden">
              <MediaFrame asset={media[0]} title={salonTitle(salon)} className="h-full w-full transition duration-700 group-hover:scale-105" />
              <div className="absolute inset-0 bg-gradient-to-t from-zinc-950/80 via-transparent to-transparent" />
              <span className="absolute right-4 top-4 rounded-full bg-black/55 px-3 py-1 text-xs text-white backdrop-blur">{(salon.packages ?? []).length} paquetes</span>
            </div>
            <div className="p-5">
              <h3 className="text-xl font-semibold">{salonTitle(salon)}</h3>
              <p className="mt-2 min-h-12 text-sm leading-6 text-zinc-400">{salonDescription(salon)}</p>
              <div className="mt-4 flex flex-wrap gap-3 text-sm text-zinc-200">
                <span className="flex items-center gap-1.5"><MapPin className="h-4 w-4" />{salonLocation(salon)}</span>
                <span className="flex items-center gap-1.5"><Users className="h-4 w-4" /><Capacity salon={salon} /></span>
              </div>
              <span className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-white underline decoration-white/30 underline-offset-4 group-hover:decoration-white">Ver detalle <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" /></span>
            </div>
          </motion.button>;
        })}
      </div>
    </section>

    <section className="bg-zinc-900">
      <div className={section}>
        <h2 className="text-4xl font-semibold">Paquetes para celebrar</h2>
        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {featuredPackages.length ? featuredPackages.map((item) => <PackageCard key={`${item.salonId}-${item._id}`} item={item} />) : fallbackPackages.map(([name, desc, price, tag]) => <article key={name} className="rounded-xl border border-white/10 p-5"><span className="text-xs text-zinc-400">{tag}</span><h3 className="mt-3 text-xl font-semibold">{name}</h3><p className="mt-2 text-sm text-zinc-400">{desc}</p><p className="mt-4">{price}</p></article>)}
        </div>
      </div>
    </section>

    <section className={section}><h2 className="text-4xl font-semibold">Servicios incluidos</h2><div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{services.map((item) => <p key={item} className="flex gap-3 rounded-lg border border-white/10 p-4"><Check className="h-4 w-4" />{item}</p>)}</div></section>
    <section className="bg-zinc-800"><div className={section}><h2 className="text-4xl font-semibold">Promociones y beneficios</h2><div className="mt-8 grid gap-4 md:grid-cols-4">{['Últimas fechas disponibles', 'Promo mes especial', 'Congelá tu valor con seña', 'Stand de glitter de regalo'].map((item) => <div key={item} className="rounded-xl bg-white p-5 text-black"><Sparkles className="h-5 w-5" /><p className="mt-4 font-semibold">{item}</p></div>)}</div></div></section>
    <section className={section}><h2 className="text-4xl font-semibold">Momentos M&M</h2><div className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-3">{salons.flatMap((salon) => salonMedia(salon)).slice(0, 6).map((asset, index) => <div key={asset.url} className="h-44 overflow-hidden rounded-2xl border border-white/10"><MediaFrame asset={asset} title={`Momento M&M ${index + 1}`} className="h-full w-full" /></div>)}{!salons.flatMap((salon) => salonMedia(salon)).length ? ['Salón preparado', 'Mesa principal', 'Ambientación', 'Vajilla', 'Fiesta', 'Catering'].map((item) => <div key={item} className="grid min-h-40 place-items-end rounded-2xl bg-gradient-to-br from-zinc-600 to-black p-4 font-medium">{item}</div>) : null}</div></section>
    <section className="bg-zinc-900"><div className={section}><h2 className="text-4xl font-semibold">Ubicaciones</h2><div className="mt-8 grid gap-4 md:grid-cols-3">{salons.map((salon) => <button key={salon._id} type="button" onClick={() => setSelectedSalon(salon)} className="rounded-xl border border-white/10 p-5 text-left transition hover:bg-white/5"><h3>{salonTitle(salon)}</h3><p className="mt-2 text-zinc-400">{salon.address || salonLocation(salon)}</p><span className="mt-4 inline-block text-sm underline">Ver salón</span></button>)}</div></div></section>
    <section className={section}><h2 className="text-4xl font-semibold">Testimonios</h2><div className="mt-8 grid gap-4 md:grid-cols-3">{['Excelente atención y una noche hermosa.', 'La fiesta salió perfecta de principio a fin.', 'Muy buena organización y equipo.'].map((item) => <blockquote key={item} className="rounded-xl border border-white/10 p-5">“{item}”</blockquote>)}</div></section>
    <section className={section}><h2 className="text-4xl font-semibold">Preguntas frecuentes</h2><div className="mt-7 grid gap-3">{faqs.map((question) => <details key={question} className="rounded-xl border border-white/10 p-5"><summary>{question}</summary><p className="mt-3 text-sm text-zinc-400">Escribinos para recibir una propuesta personalizada.</p></details>)}</div></section>

    <section id="contacto" className="bg-white text-black">
      <form onSubmit={submit} className="mx-auto grid max-w-xl gap-4 px-6 py-20">
        <Image src={brandAssets.logoDarkOnLight} alt="M&M Eventos" width={180} height={180} className="mx-auto h-auto w-40 object-contain" />
        <h2 className="text-4xl font-semibold">Solicitá tu presupuesto</h2>
        {message && <p className="rounded bg-zinc-100 p-3 text-sm">{message}</p>}
        <label>Nombre<input required name="name" className="mt-1 w-full rounded border p-3" /></label>
        <label>Teléfono<input required name="phone" className="mt-1 w-full rounded border p-3" /></label>
        <label>Email opcional<input name="email" type="email" className="mt-1 w-full rounded border p-3" /></label>
        <label>Tipo de evento<input required name="eventType" className="mt-1 w-full rounded border p-3" /></label>
        <label>Fecha tentativa<input name="eventDate" type="date" className="mt-1 w-full rounded border p-3" /></label>
        <label>Cantidad de personas<input required name="guestCount" type="number" min="1" className="mt-1 w-full rounded border p-3" /></label>
        <label>Salón de interés<select required name="salonId" value={formSalonId} onChange={(event) => setFormSalonId(event.target.value)} className="mt-1 w-full rounded border p-3"><option value="">Seleccionar salón</option>{salons.map((salon) => <option key={salon._id} value={salon._id}>{salonTitle(salon)}</option>)}</select></label>
        <label>Mensaje<textarea name="message" className="mt-1 w-full rounded border p-3" /></label>
        <button disabled={loading} className="rounded bg-black p-3 text-white">{loading ? 'Enviando…' : 'Solicitar presupuesto'}</button>
      </form>
    </section>

    <a href="https://wa.me/?text=Hola%20M%26M%20Eventos%2C%20quiero%20consultar%20por%20un%20evento." aria-label="WhatsApp" className="fixed bottom-6 right-6 rounded-full bg-white p-4 text-black"><MessageCircle /></a>
    <a href="#" aria-label="Volver arriba" className="fixed bottom-6 left-6 rounded-full border border-white/30 p-3"><ChevronUp /></a>
    <SalonDetailModal salon={selectedSalon} onClose={() => setSelectedSalon(undefined)} onRequestQuote={requestQuoteForSalon} />
  </main>;
}
