'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { brandAssets } from '@/lib/brand-assets';
import { emitAnalyticsEvent } from '@/components/analytics-tracker';

export type WhatsappSalonOption = {
  key: string;
  label: string;
  location: string;
  image: string;
  phone: string;
  salonId?: string;
};

function waLink(number: string, message: string) {
  return `https://wa.me/${number.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`;
}

// UTM-aware, but never guesses a channel it can't see — full attribution still
// travels on every click via AnalyticsTracker's existing utm_* capture.
function sourceSuffix(utmSource: string, referrer: string): string {
  const src = utmSource.toLowerCase();
  if (src.includes('instagram') || src === 'ig') return ' Vengo desde Instagram.';
  if (src.includes('google')) return ' Vengo desde Google.';
  if (src.includes('meta') || src.includes('facebook') || src.includes('fb')) return ' Vengo desde Facebook.';
  if (!src && /instagram\.com/i.test(referrer)) return ' Vengo desde Instagram.';
  return '';
}

export function WhatsappSelector({ salons }: { salons: WhatsappSalonOption[] }) {
  const [suffix, setSuffix] = useState('');

  useEffect(() => {
    const utmSource = new URLSearchParams(window.location.search).get('utm_source') || '';
    // location.search/document.referrer only exist post-hydration; setting this during
    // render would mismatch the server-rendered (window-less) output.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSuffix(sourceSuffix(utmSource, document.referrer || ''));
  }, []);

  return (
    <main className="flex min-h-screen flex-col bg-zinc-950 text-white">
      <header className="mx-auto flex w-full max-w-3xl items-center justify-center px-4 py-8">
        <Link href="/" aria-label="Ir a M&M Eventos">
          <img src={brandAssets.logoLightOnDark} alt="M&M Eventos" className="h-12 w-auto object-contain" />
        </Link>
      </header>

      <section data-analytics-section="whatsapp-selector" className="mx-auto w-full max-w-3xl flex-1 px-5 pb-20 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-zinc-400">M&M Eventos</p>
        <h1 className="mt-4 text-balance text-3xl font-semibold leading-tight md:text-5xl">¿Sobre qué salón querés consultar?</h1>
        <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-zinc-300 md:text-lg">Elegí tu salón y hablá directamente con nuestro equipo por WhatsApp.</p>

        <div className="mt-10 grid gap-4 text-left sm:grid-cols-3">
          {salons.map((salon, index) => {
            const message = `Hola! Quiero consultar por ${salon.label}.${suffix}`;
            // Underscore form matches the salon codes Performance 360 already expects
            // (la_plata / villa_elisa / san_carlos), independent of the Mongo _id.
            const salonCode = salon.key.replace(/-/g, '_');
            return (
              <a
                key={salon.key}
                href={waLink(salon.phone, message)}
                target="_blank"
                rel="noreferrer"
                data-analytics-id={`whatsapp-${salon.key}`}
                data-analytics-entity={salonCode}
                onClick={() => emitAnalyticsEvent('salon_view', { sectionId: 'whatsapp-selector', elementId: salon.label, entityId: salon.salonId || salonCode })}
                className="group flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] outline-none transition hover:border-[#25d366] focus-visible:border-[#25d366] focus-visible:ring-2 focus-visible:ring-[#25d366]/50"
              >
                {salon.image ? (
                  <div className="relative h-40 w-full overflow-hidden">
                    <Image src={salon.image} alt={salon.label} fill priority={index === 0} sizes="(max-width: 640px) 100vw, 33vw" className="object-cover transition duration-300 group-hover:scale-105" />
                  </div>
                ) : null}
                <div className="flex flex-1 flex-col gap-4 p-5">
                  <div>
                    <h2 className="text-lg font-semibold">{salon.label}</h2>
                    {salon.location ? <p className="mt-1 text-sm text-zinc-400">{salon.location}</p> : null}
                  </div>
                  <span className="mt-auto inline-flex items-center justify-center gap-2 rounded-lg bg-[#25d366] px-4 py-3 text-sm font-semibold text-black transition group-hover:bg-[#35e176]">
                    <MessageCircle className="h-4 w-4" /> Consultar por WhatsApp
                  </span>
                </div>
              </a>
            );
          })}
        </div>
      </section>
    </main>
  );
}
