import Link from 'next/link';
import { ArrowRight, Check, MapPin, MessageCircle, PackageCheck, Sparkles } from 'lucide-react';
import { absoluteUrl, localSeoPages, salonSeoPages, siteUrl, type LocalSeoPage } from '@/lib/local-seo';
import { brandAssets } from '@/lib/brand-assets';
import { capacityForPublicSalon, imageForPublicSalon, locationForPublicSalon, titleForPublicSalon, type PublicLanding, type PublicPackage, type PublicSalon } from '@/lib/public-landing';

function jsonLdForPage(page: LocalSeoPage, path: string, salon?: PublicSalon, packages: PublicPackage[] = [], landing?: PublicLanding | null) {
  const url = absoluteUrl(path);
  const image = imageForPublicSalon(salon, page.heroImage) || page.heroImage;
  const phone = salon?.phone || landing?.settings?.contactPhone || '+54 9 221 123-4567';
  const address = salon?.address || page.address || locationForPublicSalon(salon) || page.location;
  const faqs = landing?.faqs?.filter((faq) => faq.question && faq.answer).slice(0, 4).map((faq) => ({ question: faq.question!, answer: faq.answer! })) ?? page.faqs;
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'EventVenue',
      name: salon ? titleForPublicSalon(salon) : page.title,
      url,
      image,
      description: salon?.publicDescription || salon?.publicShortDescription || page.metaDescription,
      address: {
        '@type': 'PostalAddress',
        streetAddress: address,
        addressLocality: salon?.locality || salon?.city || page.location,
        addressRegion: salon?.province || 'Buenos Aires',
        addressCountry: 'AR'
      },
      amenityFeature: page.services.map((service) => ({ '@type': 'LocationFeatureSpecification', name: service, value: true })),
      telephone: phone,
      priceRange: '$$'
    },
    {
      '@context': 'https://schema.org',
      '@type': 'LocalBusiness',
      name: 'M&M Eventos',
      url: siteUrl,
      image: absoluteUrl(brandAssets.openGraphImage),
      areaServed: ['La Plata', 'San Carlos', 'Villa Elisa'],
      makesOffer: (packages.length ? packages.map((item) => item.name) : page.packages).map((name) => ({ '@type': 'Offer', name }))
    },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: faqs.map((faq) => ({
        '@type': 'Question',
        name: faq.question,
        acceptedAnswer: { '@type': 'Answer', text: faq.answer }
      }))
    }
  ];
}

function relatedPage(slug: string, salonMode: boolean) {
  const pool = salonMode ? salonSeoPages : localSeoPages;
  const page = pool.find((item) => item.slug === slug);
  return page ? { href: salonMode ? `/salones/${page.slug}` : `/${page.slug}`, label: page.title } : undefined;
}

export function LocalSeoPageView({ page, path, salonMode = false, landing, salon, packages = [] }: { page: LocalSeoPage; path: string; salonMode?: boolean; landing?: PublicLanding | null; salon?: PublicSalon; packages?: PublicPackage[] }) {
  const related = page.relatedSlugs.map((slug) => relatedPage(slug, salonMode)).filter(Boolean) as { href: string; label: string }[];
  const crossLinks = salonMode ? localSeoPages.slice(0, 4).map((item) => ({ href: `/${item.slug}`, label: item.title })) : salonSeoPages.map((item) => ({ href: `/salones/${item.slug}`, label: item.title }));
  const heroImage = imageForPublicSalon(salon, page.heroImage) || page.heroImage;
  const heading = salonMode && salon ? `${titleForPublicSalon(salon)}: ${page.h1.split(':').pop()?.trim() ?? page.title}` : page.h1;
  const intro = salon?.publicDescription || salon?.publicShortDescription || page.intro;
  const location = locationForPublicSalon(salon) || page.location;
  const packageNames = packages.length ? packages.map((item) => item.name) : page.packages;
  const realServices = [...new Set(packages.flatMap((item) => item.includedServices ?? []))].slice(0, 8);
  const services = realServices.length ? realServices : page.services;
  const realHighlights = [
    salon ? capacityForPublicSalon(salon) : '',
    salon?.defaultStartTime && salon.defaultEndTime ? `Horario habitual: ${salon.defaultStartTime} a ${salon.defaultEndTime}` : '',
    salon?.defaultPaymentTerms || page.highlights[0]
  ].filter(Boolean);
  const highlights = realHighlights.length ? realHighlights : page.highlights;
  const faqs = landing?.faqs?.filter((faq) => faq.question && faq.answer).slice(0, 4) ?? [];
  const visibleFaqs = faqs.length ? faqs.map((faq) => ({ question: faq.question!, answer: faq.answer! })) : page.faqs;

  return <main className="min-h-screen bg-zinc-950 text-white">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdForPage(page, path, salon, packages, landing)) }} />
    <section className="relative isolate min-h-[620px] overflow-hidden">
      <img src={heroImage} alt={heading} className="absolute inset-0 h-full w-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-r from-black via-black/72 to-black/20" />
      <header className="relative z-10 mx-auto flex max-w-7xl items-center justify-between px-5 py-6 md:px-8">
        <Link href="/" aria-label="Ir a M&M Eventos"><img src={brandAssets.logoLightOnDark} alt="M&M Eventos" className="h-14 w-auto object-contain" /></Link>
        <Link href="/#contacto" className="rounded-lg border border-white/20 px-4 py-2 text-sm font-semibold transition hover:bg-white hover:text-black">Consultar</Link>
      </header>
      <div className="relative z-10 mx-auto grid max-w-7xl gap-8 px-5 pb-16 pt-16 md:px-8 lg:grid-cols-[1fr_360px] lg:pt-24">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-zinc-300">{page.eyebrow}</p>
          <h1 className="mt-5 text-4xl font-semibold leading-tight md:text-6xl">{heading}</h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-zinc-200">{intro}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/#contacto" className="inline-flex items-center gap-2 rounded-lg bg-[#25d366] px-5 py-3 text-sm font-semibold text-black transition hover:bg-[#35e176]"><MessageCircle className="h-4 w-4" />Pedir presupuesto</Link>
            <Link href="/#paquetes" className="inline-flex items-center gap-2 rounded-lg border border-white/20 px-5 py-3 text-sm font-semibold transition hover:bg-white hover:text-black">Ver paquetes <ArrowRight className="h-4 w-4" /></Link>
          </div>
          <div className="mt-8 flex flex-wrap gap-2 text-sm text-zinc-300">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 px-3 py-1.5"><MapPin className="h-4 w-4" />{location}</span>
            {page.secondaryKeywords.map((keyword) => <span key={keyword} className="rounded-full border border-white/15 px-3 py-1.5">{keyword}</span>)}
          </div>
        </div>
        <aside className="self-end border border-white/15 bg-black/45 p-5 backdrop-blur">
          <p className="text-sm font-semibold text-zinc-100">Incluye según paquete</p>
          <div className="mt-4 grid gap-3">
            {highlights.map((item) => <div key={item} className="flex gap-3 text-sm leading-6 text-zinc-200"><Check className="mt-1 h-4 w-4 shrink-0 text-[#25d366]" />{item}</div>)}
          </div>
        </aside>
      </div>
    </section>

    <section className="mx-auto grid max-w-7xl gap-8 px-5 py-16 md:px-8 lg:grid-cols-[0.9fr_1.1fr]">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-zinc-500">Servicios</p>
        <h2 className="mt-3 text-3xl font-semibold">Una propuesta pensada para búsquedas locales reales</h2>
        <p className="mt-4 leading-7 text-zinc-400">Esta página responde específicamente a quienes buscan {page.primaryKeyword}. La información comercial se arma con los datos públicos cargados en el backend: salones, paquetes, servicios, capacidad, horarios e imágenes.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {services.map((service) => <article key={service} className="border border-white/10 bg-white/[0.03] p-4">
          <Sparkles className="h-5 w-5 text-[#c8cdd3]" />
          <h3 className="mt-3 font-semibold">{service}</h3>
        </article>)}
      </div>
    </section>

    <section className="border-y border-white/10 bg-white/[0.03]">
      <div className="mx-auto max-w-7xl px-5 py-16 md:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-zinc-500">Paquetes</p>
            <h2 className="mt-3 text-3xl font-semibold">Propuestas relacionadas</h2>
          </div>
          <Link href="/#paquetes" className="inline-flex items-center gap-2 text-sm font-semibold text-[#c8cdd3] hover:text-white">Ver todos <ArrowRight className="h-4 w-4" /></Link>
        </div>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {packageNames.map((name) => <article key={name} className="border border-white/10 bg-black/25 p-5">
            <PackageCheck className="h-5 w-5 text-[#25d366]" />
            <h3 className="mt-4 font-semibold">{name}</h3>
            <p className="mt-2 text-sm leading-6 text-zinc-400">{packages.find((item) => item.name === name)?.promotionText || packages.find((item) => item.name === name)?.paymentTerms || 'Consultá disponibilidad, cantidad de invitados y condiciones vigentes.'}</p>
          </article>)}
        </div>
      </div>
    </section>

    <section className="mx-auto grid max-w-7xl gap-8 px-5 py-16 md:px-8 lg:grid-cols-[0.85fr_1.15fr]">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-zinc-500">Preguntas frecuentes</p>
        <h2 className="mt-3 text-3xl font-semibold">Dudas comunes antes de pedir presupuesto</h2>
      </div>
      <div className="grid gap-3">
        {visibleFaqs.map((faq) => <article key={faq.question} className="border border-white/10 bg-white/[0.03] p-5">
          <h3 className="font-semibold">{faq.question}</h3>
          <p className="mt-2 text-sm leading-6 text-zinc-400">{faq.answer}</p>
        </article>)}
      </div>
    </section>

    <section className="mx-auto max-w-7xl px-5 pb-20 md:px-8">
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="border border-white/10 bg-white/[0.03] p-5">
          <h2 className="font-semibold">También puede interesarte</h2>
          <div className="mt-4 grid gap-2">
            {related.map((item) => <Link key={item.href} href={item.href} className="flex items-center justify-between rounded-lg px-3 py-2 text-sm text-zinc-300 transition hover:bg-white/10 hover:text-white">{item.label}<ArrowRight className="h-4 w-4" /></Link>)}
          </div>
        </div>
        <div className="border border-white/10 bg-white/[0.03] p-5">
          <h2 className="font-semibold">{salonMode ? 'Búsquedas relacionadas' : 'Nuestros salones'}</h2>
          <div className="mt-4 grid gap-2">
            {crossLinks.map((item) => <Link key={item.href} href={item.href} className="flex items-center justify-between rounded-lg px-3 py-2 text-sm text-zinc-300 transition hover:bg-white/10 hover:text-white">{item.label}<ArrowRight className="h-4 w-4" /></Link>)}
          </div>
        </div>
      </div>
    </section>
  </main>;
}
