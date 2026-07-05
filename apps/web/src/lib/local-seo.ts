import { brandAssets } from '@/lib/brand-assets';

export const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

export type LocalSeoPage = {
  slug: string;
  title: string;
  metaTitle: string;
  metaDescription: string;
  h1: string;
  eyebrow: string;
  intro: string;
  location: string;
  address?: string;
  primaryKeyword: string;
  secondaryKeywords: string[];
  heroImage: string;
  highlights: string[];
  services: string[];
  packages: string[];
  faqs: { question: string; answer: string }[];
  relatedSlugs: string[];
};

export const localSeoPages: LocalSeoPage[] = [
  {
    slug: 'salon-eventos-la-plata',
    title: 'Salón de eventos en La Plata',
    metaTitle: 'Salón de eventos en La Plata con catering | M&M Eventos',
    metaDescription: 'M&M Eventos ofrece salón de eventos en La Plata con catering, DJ, ambientación, vajilla, staff y organización integral para fiestas, 15 años, casamientos y egresados.',
    h1: 'Salón de eventos en La Plata con catering y organización integral',
    eyebrow: 'Eventos sociales en La Plata',
    intro: 'Organizá tu fiesta en un salón preparado para recibir invitados con servicio completo: catering, bebida, DJ, ambientación, sectores de fotos y coordinación del evento.',
    location: 'La Plata, Buenos Aires',
    primaryKeyword: 'salón de eventos en La Plata',
    secondaryKeywords: ['salón de fiestas en La Plata', 'salón con catering La Plata', 'eventos sociales La Plata'],
    heroImage: 'https://images.unsplash.com/photo-1519167758481-83f550bb49b3?auto=format&fit=crop&w=1600&q=82',
    highlights: ['Propuestas para eventos de noche de 21:00 a 05:00', 'Paquetes con catering, bebida y staff de servicio', 'Sectores de fotos, torta y mesa principal'],
    services: ['Catering completo', 'DJ, sonido e iluminación', 'Vajilla y mantelería', 'Organización y cronograma', 'Staff de salón y cocina'],
    packages: ['Fiesta de egresados M&M La Plata', 'Black Service La Plata', 'Salón completo M&M La Plata'],
    faqs: [
      { question: '¿El salón de La Plata incluye catering?', answer: 'Sí. Hay paquetes con catering completo y una opción de salón completo para quienes necesitan solo el espacio y servicios base.' },
      { question: '¿Se puede congelar el precio con seña?', answer: 'Sí. Las propuestas vigentes permiten congelar el valor con seña y abonar el saldo en cuotas según las condiciones del paquete.' },
      { question: '¿Qué tipo de eventos se pueden realizar?', answer: 'El salón está pensado para fiestas de 15, casamientos, egresados, cumpleaños, eventos familiares y reuniones sociales.' }
    ],
    relatedSlugs: ['salon-15-anos-la-plata', 'salon-casamientos-la-plata', 'salon-con-catering-la-plata']
  },
  {
    slug: 'salon-15-anos-la-plata',
    title: 'Salón para 15 años en La Plata',
    metaTitle: 'Salón para 15 años en La Plata | M&M Eventos',
    metaDescription: 'Celebrá tu fiesta de 15 en La Plata con salón, catering, DJ, iluminación, sector de fotos, mesa principal y organización integral del evento.',
    h1: 'Salón para 15 años en La Plata con catering, DJ y ambientación',
    eyebrow: 'Fiestas de 15',
    intro: 'Una fiesta de 15 necesita ritmo, fotos, entrada especial, menú para adolescentes y adultos, y un equipo que coordine cada momento. M&M Eventos arma la propuesta completa para celebrar en La Plata.',
    location: 'La Plata, Buenos Aires',
    primaryKeyword: 'salón para 15 años en La Plata',
    secondaryKeywords: ['fiesta de 15 La Plata', 'salón de fiestas de 15 La Plata', 'salón con DJ para 15 años'],
    heroImage: 'https://images.unsplash.com/photo-1527529482837-4698179dc6ce?auto=format&fit=crop&w=1600&q=82',
    highlights: ['Ingreso y momentos especiales coordinados', 'Sector de fotos con shimmer wall y ambientación', 'Menú para adolescentes, niños y adultos'],
    services: ['DJ e iluminación', 'Catering y bebidas', 'Sector de fotos', 'Sector de torta', 'Coordinación del evento'],
    packages: ['Black Service La Plata', 'Salón completo M&M La Plata'],
    faqs: [
      { question: '¿Incluye DJ para la fiesta de 15?', answer: 'Sí, los paquetes principales incluyen DJ, sonido e iluminación para la fiesta.' },
      { question: '¿Hay sector para fotos?', answer: 'Sí. Las propuestas pueden incluir shimmer wall, diván, globos y sectores preparados para fotos.' },
      { question: '¿Puedo contratar solo el salón?', answer: 'Sí. La opción Salón completo M&M La Plata permite contratar el espacio y servicios base sin catering incluido.' }
    ],
    relatedSlugs: ['salon-eventos-la-plata', 'salon-con-catering-la-plata', 'salon-casamientos-la-plata']
  },
  {
    slug: 'salon-casamientos-la-plata',
    title: 'Salón para casamientos en La Plata',
    metaTitle: 'Salón para casamientos en La Plata con catering | M&M Eventos',
    metaDescription: 'Salón para casamientos en La Plata con catering, ambientación, mesa principal, DJ, vajilla, mantelería y organización integral para celebrar sin preocuparte.',
    h1: 'Salón para casamientos en La Plata con servicio integral',
    eyebrow: 'Casamientos y bodas',
    intro: 'Para casamientos y civiles, M&M Eventos ofrece un salón con ambientación, catering, bebida, música y staff para acompañar la celebración de principio a fin.',
    location: 'La Plata, Buenos Aires',
    primaryKeyword: 'salón para casamientos en La Plata',
    secondaryKeywords: ['salón para bodas La Plata', 'casamientos con catering La Plata', 'salón para civil La Plata'],
    heroImage: 'https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=1600&q=82',
    highlights: ['Mesa principal y sectores ambientados', 'Catering con recepción, plato principal y mesa dulce', 'Organización y staff durante todo el evento'],
    services: ['Catering para casamientos', 'Ambientación del salón', 'DJ, sonido e iluminación', 'Vajilla completa', 'Mozos y encargado de cocina'],
    packages: ['Black Service La Plata', 'Salón completo M&M La Plata'],
    faqs: [
      { question: '¿El salón sirve para casamientos de noche?', answer: 'Sí. Las propuestas nocturnas están pensadas para eventos de 21:00 a 05:00.' },
      { question: '¿Incluye mesa principal?', answer: 'Los paquetes premium pueden incluir mesa espejada o mesa de estilo, candelabros y sillón trono.' },
      { question: '¿Se puede sumar barra de tragos?', answer: 'Sí. Según el paquete, la barra puede estar incluida o contratarse como adicional.' }
    ],
    relatedSlugs: ['salon-eventos-la-plata', 'catering-eventos-la-plata', 'salon-con-catering-la-plata']
  },
  {
    slug: 'salon-fiestas-san-carlos',
    title: 'Salón de fiestas en San Carlos',
    metaTitle: 'Salón de fiestas en San Carlos, La Plata | M&M Eventos',
    metaDescription: 'M&M San Carlos es un salón de fiestas en San Carlos, La Plata, con paquetes para eventos sociales, infantiles, cumpleaños, 15 años y celebraciones familiares.',
    h1: 'Salón de fiestas en San Carlos para eventos sociales y familiares',
    eyebrow: 'M&M San Carlos',
    intro: 'M&M San Carlos ofrece propuestas para fiestas familiares, cumpleaños, eventos infantiles y celebraciones sociales con servicios de salón, catering y organización.',
    location: 'San Carlos, La Plata',
    address: 'Calle 144 N°664 e/ 45 y 46, San Carlos',
    primaryKeyword: 'salón de fiestas en San Carlos',
    secondaryKeywords: ['salón San Carlos La Plata', 'salón para cumpleaños San Carlos', 'eventos infantiles San Carlos'],
    heroImage: 'https://images.unsplash.com/photo-1464366400600-7168b8af9bc3?auto=format&fit=crop&w=1600&q=82',
    highlights: ['Ubicación en San Carlos, La Plata', 'Paquetes infantiles y propuestas nocturnas', 'Opciones con salón, catering, DJ y staff'],
    services: ['Salón con mesas y sillas', 'Catering para eventos', 'DJ e iluminación', 'Cocina completa', 'Staff de servicio'],
    packages: ['Banquete Premium', 'Luxury Night', 'Promo Salón Full', 'Promo Infantil Sonrisitas', 'Promo Infantil Risitas'],
    faqs: [
      { question: '¿Dónde queda M&M San Carlos?', answer: 'Está ubicado en Calle 144 N°664 e/ 45 y 46, San Carlos, La Plata.' },
      { question: '¿Tiene opciones para cumpleaños infantiles?', answer: 'Sí. San Carlos cuenta con promociones infantiles y opciones de salón para celebraciones familiares.' },
      { question: '¿Se puede contratar salón sin catering?', answer: 'Sí. Hay paquetes de salón completo sin catering incluido.' }
    ],
    relatedSlugs: ['salon-eventos-la-plata', 'catering-eventos-la-plata', 'salon-eventos-villa-elisa']
  },
  {
    slug: 'salon-eventos-villa-elisa',
    title: 'Salón de eventos en Villa Elisa',
    metaTitle: 'Salón de eventos en Villa Elisa | M&M Eventos',
    metaDescription: 'M&M Villa Elisa ofrece salón de eventos con catering, DJ, ambientación, bebidas, staff y organización para fiestas, 15 años, casamientos y eventos sociales.',
    h1: 'Salón de eventos en Villa Elisa con servicio integral',
    eyebrow: 'M&M Villa Elisa',
    intro: 'Una propuesta para celebrar en Villa Elisa con paquetes de noche, catering, bebidas, DJ, ambientación y sectores preparados para fotos, torta y mesa principal.',
    location: 'Villa Elisa, Buenos Aires',
    primaryKeyword: 'salón de eventos Villa Elisa',
    secondaryKeywords: ['salón Villa Elisa', 'salón de fiestas Villa Elisa', 'eventos en Villa Elisa'],
    heroImage: 'https://images.unsplash.com/photo-1511795409834-ef04bbd61622?auto=format&fit=crop&w=1600&q=82',
    highlights: ['Paquetes nocturnos para eventos sociales', 'Catering, bebida y barra según paquete', 'DJ, iluminación, proyector y espacio climatizado'],
    services: ['Catering para eventos', 'Bebidas y barra', 'DJ e iluminación', 'Vajilla y mantelería', 'Organización y staff'],
    packages: ['Magic Night', 'Platinum Night', 'Exclusive Night'],
    faqs: [
      { question: '¿Qué paquetes tiene Villa Elisa?', answer: 'Villa Elisa cuenta con propuestas como Magic Night, Platinum Night y Exclusive Night.' },
      { question: '¿Incluye catering?', answer: 'Sí. Los paquetes principales incluyen menú, bebidas y servicios asociados según la propuesta elegida.' },
      { question: '¿Sirve para 15 años y casamientos?', answer: 'Sí. Es una opción para fiestas de 15, casamientos, cumpleaños y eventos sociales.' }
    ],
    relatedSlugs: ['salon-eventos-la-plata', 'salon-15-anos-la-plata', 'salon-casamientos-la-plata']
  },
  {
    slug: 'catering-eventos-la-plata',
    title: 'Catering para eventos en La Plata',
    metaTitle: 'Catering para eventos en La Plata | M&M Eventos',
    metaDescription: 'Catering para eventos en La Plata con recepción, entradas, plato principal, mesa dulce, bebidas, mozos, vajilla y organización para fiestas y celebraciones.',
    h1: 'Catering para eventos en La Plata con menú completo y staff',
    eyebrow: 'Catering y servicio de salón',
    intro: 'M&M Eventos combina salón y catering para resolver el evento completo: recepción, entradas, plato principal, postre, mesa dulce, bebidas, vajilla y atención en mesa.',
    location: 'La Plata, Buenos Aires',
    primaryKeyword: 'catering para eventos La Plata',
    secondaryKeywords: ['catering La Plata', 'servicio de lunch La Plata', 'catering para fiestas La Plata'],
    heroImage: 'https://images.unsplash.com/photo-1555244162-803834f70033?auto=format&fit=crop&w=1600&q=82',
    highlights: ['Menús para adultos, adolescentes y niños', 'Recepción, plato principal, postre y mesa dulce', 'Mozos, metre y encargado de cocina'],
    services: ['Recepción fría y caliente', 'Platos principales', 'Mesa dulce', 'Bebidas a mesa', 'Staff gastronómico'],
    packages: ['Fiesta de egresados M&M La Plata', 'Black Service La Plata'],
    faqs: [
      { question: '¿El catering incluye bebida?', answer: 'Sí. Según el paquete puede incluir gaseosas, cerveza, vino, agua, hielo y barra de tragos.' },
      { question: '¿Hay menú para niños y adolescentes?', answer: 'Sí. Algunas propuestas incluyen hamburguesas con cheddar, papas fritas u opciones adaptadas.' },
      { question: '¿Incluye vajilla y mozos?', answer: 'Sí. Los paquetes con catering incluyen vajilla completa y staff de servicio.' }
    ],
    relatedSlugs: ['salon-con-catering-la-plata', 'salon-eventos-la-plata', 'salon-casamientos-la-plata']
  },
  {
    slug: 'salon-con-catering-la-plata',
    title: 'Salón con catering incluido en La Plata',
    metaTitle: 'Salón con catering incluido en La Plata | M&M Eventos',
    metaDescription: 'Salón con catering incluido en La Plata para fiestas, casamientos, 15 años y egresados. Paquetes con menú, bebida, DJ, ambientación, vajilla y staff.',
    h1: 'Salón con catering incluido en La Plata para fiestas completas',
    eyebrow: 'Salón + catering',
    intro: 'Si querés resolver salón, comida, bebida, música y organización en una sola propuesta, M&M Eventos ofrece paquetes integrales en La Plata para distintos tipos de fiesta.',
    location: 'La Plata, Buenos Aires',
    primaryKeyword: 'salón con catering incluido La Plata',
    secondaryKeywords: ['salón y catering La Plata', 'salón con comida incluida La Plata', 'paquetes de salón con catering'],
    heroImage: 'https://images.unsplash.com/photo-1478146896981-b80fe463b330?auto=format&fit=crop&w=1600&q=82',
    highlights: ['Salón, catering, bebida, DJ y staff en un mismo paquete', 'Condiciones de seña para congelar valor', 'Opciones para egresados, 15 años, casamientos y cumpleaños'],
    services: ['Salón equipado', 'Catering completo', 'Bebidas y barra', 'DJ y ambientación', 'Coordinación del evento'],
    packages: ['Fiesta de egresados M&M La Plata', 'Black Service La Plata'],
    faqs: [
      { question: '¿Qué incluye un salón con catering incluido?', answer: 'Incluye salón, menú, bebida, vajilla, mantelería, staff y servicios adicionales según el paquete elegido.' },
      { question: '¿Hay paquetes con barra de tragos?', answer: 'Sí. Algunos paquetes incluyen barra y otros permiten sumarla como adicional.' },
      { question: '¿Puedo pedir presupuesto por WhatsApp?', answer: 'Sí. Desde la página podés iniciar la consulta por WhatsApp indicando fecha, cantidad de personas y tipo de evento.' }
    ],
    relatedSlugs: ['catering-eventos-la-plata', 'salon-eventos-la-plata', 'salon-15-anos-la-plata']
  }
];

export const salonSeoPages: LocalSeoPage[] = [
  { ...localSeoPages[0], slug: 'la-plata', title: 'M&M La Plata', metaTitle: 'M&M La Plata | Salón de eventos con catering', h1: 'M&M La Plata: salón de eventos con propuestas integrales', relatedSlugs: ['san-carlos', 'villa-elisa'] },
  { ...localSeoPages[3], slug: 'san-carlos', title: 'M&M San Carlos', metaTitle: 'M&M San Carlos | Salón de fiestas en La Plata', h1: 'M&M San Carlos: salón de fiestas y eventos familiares', relatedSlugs: ['la-plata', 'villa-elisa'] },
  { ...localSeoPages[4], slug: 'villa-elisa', title: 'M&M Villa Elisa', metaTitle: 'M&M Villa Elisa | Salón de eventos', h1: 'M&M Villa Elisa: salón de eventos con catering y organización', relatedSlugs: ['la-plata', 'san-carlos'] }
];

export function absoluteUrl(path: string) {
  return new URL(path, siteUrl).toString();
}

export function pageBySlug(slug: string) {
  return localSeoPages.find((page) => page.slug === slug);
}

export function salonBySlug(slug: string) {
  return salonSeoPages.find((page) => page.slug === slug);
}

export function defaultOgImage() {
  return absoluteUrl(brandAssets.openGraphImage);
}
