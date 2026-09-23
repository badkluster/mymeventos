import { brandAssets } from '@/lib/brand-assets';

export const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.mymsalones.com.ar';

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
  servicesHeading?: string;
  servicesIntro?: string;
  contentSections?: { heading: string; body: string }[];
  packages: string[];
  faqs: { question: string; answer: string }[];
  relatedSlugs: string[];
};

export const localSeoPages: LocalSeoPage[] = [
  {
    slug: 'salones-de-fiestas-la-plata',
    title: 'Salones de fiestas en La Plata',
    metaTitle: 'Salones de Fiestas en La Plata | M&M Eventos',
    metaDescription: 'Salones de fiestas en La Plata para cumpleaños, 15 años y casamientos, con catering, bebidas, DJ, iluminación y organización integral.',
    h1: 'Salones de fiestas en La Plata',
    eyebrow: 'Salones de fiestas en La Plata',
    intro: 'En M&M Eventos encontrás opciones para cumpleaños, fiestas de 15, casamientos y eventos en La Plata, con salón y servicio integral. Elegí el espacio que mejor se adapta a tu fecha, cantidad de invitados y estilo de celebración.',
    location: 'La Plata, Buenos Aires',
    primaryKeyword: 'salones de fiestas en La Plata',
    secondaryKeywords: ['salones La Plata', 'salones de eventos en La Plata', 'salón de fiestas en La Plata', 'salones para cumpleaños en La Plata'],
    heroImage: brandAssets.openGraphImage,
    highlights: ['Opciones para distintos tipos de fiesta y cantidad de invitados', 'Paquetes con catering, bebida y staff de servicio', 'Sectores de fotos, torta y mesa principal'],
    services: ['Catering completo', 'DJ, sonido e iluminación', 'Vajilla y mantelería', 'Organización y cronograma', 'Staff de salón y cocina'],
    servicesHeading: 'Servicio completo para tu evento',
    servicesIntro: 'Compará las propuestas según la cantidad de invitados, el estilo de la fiesta y los servicios que querés incluir. M&M Eventos puede reunir salón, catering, bebidas, DJ, iluminación, vajilla, mantelería y coordinación en una sola propuesta.',
    contentSections: [
      { heading: 'Nuestros salones en La Plata', body: 'M&M Eventos cuenta con tres espacios: La Plata, Villa Elisa y San Carlos. Podés conocer cada salón, ver sus características y consultar cuál se ajusta mejor a tu celebración.' },
      { heading: 'Salones para cumpleaños', body: 'Para cumpleaños de adultos, aniversarios y reuniones familiares, armamos una propuesta con el espacio, la comida, la música y los sectores de fotos o torta según el paquete elegido.' },
      { heading: 'Salones para fiestas de 15', body: 'Las fiestas de 15 pueden incluir DJ, iluminación, catering, ambientación y coordinación de los momentos especiales para que la familia disfrute la noche.' },
      { heading: 'Salones para casamientos', body: 'También recibimos casamientos y civiles con salón, catering, bebidas, vajilla, música y un equipo que acompaña la organización del evento.' }
    ],
    packages: ['Fiesta de egresados M&M La Plata', 'Black Service La Plata', 'Salón completo M&M La Plata'],
    faqs: [
      { question: '¿Los salones de La Plata incluyen catering?', answer: 'Sí. Hay paquetes con catering completo y opciones de salón con servicios base para elegir según cada celebración.' },
      { question: '¿Se puede congelar el precio con seña?', answer: 'Sí. Las propuestas vigentes permiten congelar el valor con seña y abonar el saldo en cuotas según las condiciones del paquete.' },
      { question: '¿Qué tipo de eventos se pueden realizar?', answer: 'Las propuestas están pensadas para fiestas de 15, casamientos, egresados, cumpleaños, eventos familiares y reuniones sociales.' }
    ],
    relatedSlugs: ['fiestas-de-15-la-plata', 'casamientos-la-plata', 'cumpleanos-la-plata', 'catering-la-plata']
  },
  {
    slug: 'fiestas-de-15-la-plata',
    title: 'Salones para fiestas de 15 en La Plata',
    metaTitle: 'Salones para Fiestas de 15 en La Plata | M&M Eventos',
    metaDescription: 'Salones para fiestas de 15 en La Plata con catering, DJ, iluminación, sector de fotos, mesa principal y organización integral del evento.',
    h1: 'Salones para fiestas de 15 en La Plata',
    eyebrow: 'Fiestas de 15',
    intro: 'Una fiesta de 15 necesita ritmo, fotos, entrada especial, menú para adolescentes y adultos, y un equipo que coordine cada momento. M&M Eventos arma la propuesta completa para celebrar en La Plata.',
    location: 'La Plata, Buenos Aires',
    primaryKeyword: 'salones para 15 en La Plata',
    secondaryKeywords: ['salón para 15 años en La Plata', 'fiestas de 15 La Plata', 'salón de fiestas de 15 La Plata'],
    heroImage: brandAssets.openGraphImage,
    highlights: ['Ingreso y momentos especiales coordinados', 'Sector de fotos con shimmer wall y ambientación', 'Menú para adolescentes, niños y adultos'],
    services: ['DJ e iluminación', 'Catering y bebidas', 'Sector de fotos', 'Sector de torta', 'Coordinación del evento'],
    contentSections: [
      { heading: 'Una fiesta de 15 a tu medida', body: 'Podemos acompañarte desde la elección del salón hasta los momentos especiales de la noche, para que la propuesta responda a la cantidad de invitados y al estilo de la festejada.' },
      { heading: 'Salón, catering y música en una misma propuesta', body: 'Según el paquete, el servicio puede reunir catering, bebidas, DJ, iluminación, vajilla, ambientación y sectores preparados para fotos y torta.' }
    ],
    packages: ['Black Service La Plata', 'Salón completo M&M La Plata'],
    faqs: [
      { question: '¿Incluye DJ para la fiesta de 15?', answer: 'Sí, los paquetes principales incluyen DJ, sonido e iluminación para la fiesta.' },
      { question: '¿Hay sector para fotos?', answer: 'Sí. Las propuestas pueden incluir shimmer wall, diván, globos y sectores preparados para fotos.' },
      { question: '¿Puedo contratar solo el salón?', answer: 'Sí. La opción Salón completo M&M La Plata permite contratar el espacio y servicios base sin catering incluido.' }
    ],
    relatedSlugs: ['salones-de-fiestas-la-plata', 'cumpleanos-la-plata', 'casamientos-la-plata']
  },
  {
    slug: 'casamientos-la-plata',
    title: 'Salón y catering para casamientos en La Plata',
    metaTitle: 'Salón y Catering para Casamientos en La Plata | M&M Eventos',
    metaDescription: 'Salón y catering para casamientos en La Plata con bebidas, DJ, iluminación, vajilla, mantelería y organización integral para celebrar sin preocuparte.',
    h1: 'Salón y catering para casamientos en La Plata',
    eyebrow: 'Casamientos y bodas',
    intro: 'Para casamientos y civiles, M&M Eventos ofrece un salón con ambientación, catering, bebida, música y staff para acompañar la celebración de principio a fin.',
    location: 'La Plata, Buenos Aires',
    primaryKeyword: 'salones para casamientos en La Plata',
    secondaryKeywords: ['lugares para casamientos en La Plata', 'catering para casamientos en La Plata', 'salón para casamiento en La Plata'],
    heroImage: brandAssets.openGraphImage,
    highlights: ['Mesa principal y sectores ambientados', 'Catering con recepción, plato principal y mesa dulce', 'Organización y staff durante todo el evento'],
    services: ['Catering para casamientos', 'Ambientación del salón', 'DJ, sonido e iluminación', 'Vajilla completa', 'Mozos y encargado de cocina'],
    contentSections: [
      { heading: 'Un lugar para celebrar su casamiento', body: 'Elegí entre los salones de M&M Eventos según la fecha, el tipo de celebración y la cantidad de personas. Coordinamos una visita para que puedan conocer el espacio.' },
      { heading: 'Catering para casamientos', body: 'Las propuestas de catering pueden incluir recepción, plato principal, postre, mesa dulce, bebidas, vajilla y personal de servicio, de acuerdo con el paquete elegido.' },
      { heading: 'Organización integral del evento', body: 'Salón, ambientación, música, iluminación y coordinación se pueden resolver con el mismo equipo para simplificar la planificación de la celebración.' }
    ],
    packages: ['Black Service La Plata', 'Salón completo M&M La Plata'],
    faqs: [
      { question: '¿El salón sirve para casamientos de noche?', answer: 'Sí. Las propuestas nocturnas están pensadas para eventos de 21:00 a 05:00.' },
      { question: '¿Incluye mesa principal?', answer: 'Los paquetes premium pueden incluir mesa espejada o mesa de estilo, candelabros y sillón trono.' },
      { question: '¿Se puede sumar barra de tragos?', answer: 'Sí. Según el paquete, la barra puede estar incluida o contratarse como adicional.' }
    ],
    relatedSlugs: ['salones-de-fiestas-la-plata', 'catering-la-plata', 'fiestas-de-15-la-plata']
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
    secondaryKeywords: ['salón de eventos San Carlos', 'salón San Carlos La Plata', 'salón para cumpleaños San Carlos', 'eventos infantiles San Carlos'],
    heroImage: brandAssets.openGraphImage,
    highlights: ['Ubicación en San Carlos, La Plata', 'Paquetes infantiles y propuestas nocturnas', 'Opciones con salón, catering, DJ y staff'],
    services: ['Salón con mesas y sillas', 'Catering para eventos', 'DJ e iluminación', 'Cocina completa', 'Staff de servicio'],
    packages: ['Banquete Premium', 'Luxury Night', 'Promo Salón Full', 'Promo Infantil Sonrisitas', 'Promo Infantil Risitas'],
    faqs: [
      { question: '¿Dónde queda M&M San Carlos?', answer: 'Está ubicado en Calle 144 N°664 e/ 45 y 46, San Carlos, La Plata.' },
      { question: '¿Tiene opciones para cumpleaños infantiles?', answer: 'Sí. San Carlos cuenta con promociones infantiles y opciones de salón para celebraciones familiares.' },
      { question: '¿Se puede contratar salón sin catering?', answer: 'Sí. Hay paquetes de salón completo sin catering incluido.' }
    ],
    relatedSlugs: ['salones-de-fiestas-la-plata', 'catering-la-plata', 'casamientos-la-plata']
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
    heroImage: brandAssets.openGraphImage,
    highlights: ['Paquetes nocturnos para eventos sociales', 'Catering, bebida y barra según paquete', 'DJ, iluminación, proyector y espacio climatizado'],
    services: ['Catering para eventos', 'Bebidas y barra', 'DJ e iluminación', 'Vajilla y mantelería', 'Organización y staff'],
    packages: ['Magic Night', 'Platinum Night', 'Exclusive Night'],
    faqs: [
      { question: '¿Qué paquetes tiene Villa Elisa?', answer: 'Villa Elisa cuenta con propuestas como Magic Night, Platinum Night y Exclusive Night.' },
      { question: '¿Incluye catering?', answer: 'Sí. Los paquetes principales incluyen menú, bebidas y servicios asociados según la propuesta elegida.' },
      { question: '¿Sirve para 15 años y casamientos?', answer: 'Sí. Es una opción para fiestas de 15, casamientos, cumpleaños y eventos sociales.' }
    ],
    relatedSlugs: ['salones-de-fiestas-la-plata', 'fiestas-de-15-la-plata', 'casamientos-la-plata']
  },
  {
    slug: 'catering-la-plata',
    title: 'Catering para eventos en La Plata',
    metaTitle: 'Catering para eventos en La Plata | M&M Eventos',
    metaDescription: 'Catering para eventos en La Plata para cumpleaños, 15 años y casamientos, con recepción, menú, bebidas, vajilla y personal de servicio según la propuesta.',
    h1: 'Catering para eventos en La Plata',
    eyebrow: 'Catering y servicio de salón',
    intro: 'M&M Eventos combina salón y catering para resolver el evento completo: recepción, entradas, plato principal, postre, mesa dulce, bebidas, vajilla y atención en mesa.',
    location: 'La Plata, Buenos Aires',
    primaryKeyword: 'catering en La Plata',
    secondaryKeywords: ['catering para eventos en La Plata', 'catering para cumpleaños en La Plata', 'catering para casamientos en La Plata', 'catering en La Plata precios'],
    heroImage: brandAssets.openGraphImage,
    highlights: ['Menús para adultos, adolescentes y niños', 'Recepción, plato principal, postre y mesa dulce', 'Mozos, metre y encargado de cocina'],
    services: ['Recepción fría y caliente', 'Platos principales', 'Mesa dulce', 'Bebidas a mesa', 'Staff gastronómico'],
    contentSections: [
      { heading: 'Catering para cumpleaños', body: 'Armamos propuestas para cumpleaños y celebraciones sociales con opciones de menú, bebidas y atención según la modalidad del evento.' },
      { heading: 'Catering para fiestas de 15 y casamientos', body: 'Para 15 años y casamientos, el catering se integra con el salón y puede incluir recepción, platos, postres, mesa dulce, vajilla y personal de servicio.' },
      { heading: 'Qué incluye el servicio', body: 'El alcance se define en cada presupuesto según la fecha, la cantidad de invitados, el salón y los servicios seleccionados. Consultanos para recibir una propuesta vigente y a medida.' }
    ],
    packages: ['Fiesta de egresados M&M La Plata', 'Black Service La Plata'],
    faqs: [
      { question: '¿Cómo se calcula el presupuesto de catering?', answer: 'El presupuesto se prepara según la fecha, cantidad de invitados, tipo de evento, salón y servicios elegidos. Consultanos para recibir una propuesta vigente.' },
      { question: '¿El catering incluye bebida?', answer: 'Sí. Según el paquete puede incluir gaseosas, cerveza, vino, agua, hielo y barra de tragos.' },
      { question: '¿Hay menú para niños y adolescentes?', answer: 'Sí. Algunas propuestas incluyen hamburguesas con cheddar, papas fritas u opciones adaptadas.' },
      { question: '¿Incluye vajilla y mozos?', answer: 'Sí. Los paquetes con catering incluyen vajilla completa y staff de servicio.' }
    ],
    relatedSlugs: ['salones-de-fiestas-la-plata', 'casamientos-la-plata', 'cumpleanos-la-plata']
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
    heroImage: brandAssets.openGraphImage,
    highlights: ['Salón, catering, bebida, DJ y staff en un mismo paquete', 'Condiciones de seña para congelar valor', 'Opciones para egresados, 15 años, casamientos y cumpleaños'],
    services: ['Salón equipado', 'Catering completo', 'Bebidas y barra', 'DJ y ambientación', 'Coordinación del evento'],
    packages: ['Fiesta de egresados M&M La Plata', 'Black Service La Plata'],
    faqs: [
      { question: '¿Qué incluye un salón con catering incluido?', answer: 'Incluye salón, menú, bebida, vajilla, mantelería, staff y servicios adicionales según el paquete elegido.' },
      { question: '¿Hay paquetes con barra de tragos?', answer: 'Sí. Algunos paquetes incluyen barra y otros permiten sumarla como adicional.' },
      { question: '¿Puedo pedir presupuesto por WhatsApp?', answer: 'Sí. Desde la página podés iniciar la consulta por WhatsApp indicando fecha, cantidad de personas y tipo de evento.' }
    ],
    relatedSlugs: ['catering-la-plata', 'salones-de-fiestas-la-plata', 'fiestas-de-15-la-plata']
  },
  {
    slug: 'cumpleanos-la-plata',
    title: 'Salones para cumpleaños en La Plata',
    metaTitle: 'Salones para Cumpleaños en La Plata | M&M Eventos',
    metaDescription: 'Salones para cumpleaños en La Plata con catering, DJ, ambientación, sector de fotos y organización integral para festejar sin ocuparte de la logística.',
    h1: 'Salones para cumpleaños en La Plata',
    eyebrow: 'Cumpleaños y celebraciones',
    intro: 'Para festejar un cumpleaños con salón propio, catering, música y ambientación sin ocuparte de la logística, M&M Eventos arma la propuesta completa en La Plata.',
    location: 'La Plata, Buenos Aires',
    primaryKeyword: 'salones para cumpleaños en La Plata',
    secondaryKeywords: ['salón para cumpleaños en La Plata', 'salones cumpleaños La Plata', 'salón de fiestas para cumpleaños La Plata'],
    heroImage: brandAssets.openGraphImage,
    highlights: ['Sector de fotos y de torta según el paquete elegido', 'DJ, sonido e iluminación para tu fiesta', 'Catering y bebida según la propuesta contratada'],
    services: ['Catering completo', 'DJ, sonido e iluminación', 'Sector de fotos y torta', 'Vajilla y mantelería', 'Organización y staff de salón'],
    contentSections: [
      { heading: 'Todo listo para festejar tu cumpleaños', body: 'Podés elegir una propuesta con salón, catering, bebidas, DJ, ambientación y atención durante el evento, o consultar por los servicios que mejor se adapten a tu idea.' },
      { heading: 'Conocé nuestros tres salones', body: 'M&M Eventos tiene espacios en La Plata, Villa Elisa y San Carlos. Coordiná una visita para conocer el salón antes de elegir fecha y propuesta.' }
    ],
    packages: ['Salón completo M&M La Plata', 'Gold Service', 'Gala y Gourmet'],
    faqs: [
      { question: '¿Organizan cumpleaños de adultos?', answer: 'Sí. El salón recibe cumpleaños de adultos, aniversarios y celebraciones familiares con distintas propuestas de catering y ambientación.' },
      { question: '¿Incluye sector de fotos y torta?', answer: 'Según el paquete, se puede incluir sector de fotos con shimmer wall y sector de torta ambientado.' },
      { question: '¿Puedo contratar sólo el salón sin catering?', answer: 'Sí. La opción Salón completo M&M La Plata permite contratar el espacio y servicios base sin catering incluido.' }
    ],
    relatedSlugs: ['salones-de-fiestas-la-plata', 'fiestas-de-15-la-plata', 'catering-la-plata']
  },
  {
    slug: 'eventos-empresariales-la-plata',
    title: 'Salón para eventos empresariales en La Plata',
    metaTitle: 'Eventos empresariales en La Plata | M&M Eventos',
    metaDescription: 'Salón para eventos empresariales en La Plata: cenas de fin de año, lanzamientos y reuniones corporativas con catering, proyector y organización integral.',
    h1: 'Eventos empresariales en La Plata con salón, catering y proyector',
    eyebrow: 'Eventos corporativos',
    intro: 'Para una cena de fin de año, un lanzamiento o una reunión corporativa, M&M Eventos ofrece salón, catering, proyector para presentaciones y organización integral en La Plata.',
    location: 'La Plata, Buenos Aires',
    primaryKeyword: 'eventos empresariales en La Plata',
    secondaryKeywords: ['salón para eventos corporativos La Plata', 'cena de fin de año empresa La Plata', 'salón para empresas La Plata'],
    heroImage: brandAssets.openGraphImage,
    highlights: ['Proyector para presentaciones y videos según el paquete', 'Catering y bebida para grupos corporativos', 'Espacio climatizado y organización del evento'],
    services: ['Catering para eventos', 'Proyector para videos', 'DJ, sonido e iluminación', 'Vajilla y mantelería', 'Organización y staff de salón'],
    packages: ['Salón completo M&M La Plata', 'Gold Service', 'Black Service La Plata'],
    faqs: [
      { question: '¿Organizan eventos empresariales?', answer: 'Sí. El salón recibe cenas de fin de año, lanzamientos, capacitaciones y reuniones corporativas con propuestas de catering y ambientación.' },
      { question: '¿Tienen proyector para presentaciones?', answer: 'Sí. Varios paquetes incluyen proyector para videos, útil también para presentaciones institucionales.' },
      { question: '¿Hay capacidad para grupos grandes?', answer: 'Sí. El salón de La Plata tiene capacidad de 50 a 160 personas según la propuesta elegida.' }
    ],
    relatedSlugs: ['salones-de-fiestas-la-plata', 'catering-la-plata', 'casamientos-la-plata']
  }
];

export const salonSeoPages: LocalSeoPage[] = [
  {
    ...localSeoPages[0],
    slug: 'la-plata',
    title: 'M&M La Plata',
    metaTitle: 'M&M Eventos La Plata | Salón de Fiestas en La Plata',
    metaDescription: 'M&M Eventos La Plata es un salón de fiestas para cumpleaños, 15 años, casamientos y celebraciones sociales, con opciones de catering y organización integral.',
    h1: 'M&M Eventos La Plata: salón de fiestas para celebrar',
    eyebrow: 'M&M La Plata',
    intro: 'Un espacio preparado para celebrar con catering, bebidas, DJ, ambientación y un equipo que coordina cada momento del evento.',
    primaryKeyword: 'salón de eventos en La Plata',
    secondaryKeywords: ['salón de fiestas en La Plata', 'salón con catering La Plata', 'eventos sociales La Plata'],
    servicesHeading: 'Todo lo que necesitás para tu evento en un solo lugar',
    servicesIntro: 'Organizá tu celebración sin tener que contratar cada servicio por separado. M&M La Plata reúne salón, catering, bebidas, DJ, iluminación, ambientación, vajilla y personal para acompañarte durante toda la noche.',
    contentSections: undefined,
    relatedSlugs: ['san-carlos', 'villa-elisa']
  },
  {
    ...localSeoPages[3],
    slug: 'san-carlos',
    title: 'M&M San Carlos',
    metaTitle: 'M&M Eventos San Carlos | Salón de Eventos en La Plata',
    metaDescription: 'M&M Eventos San Carlos es un salón para cumpleaños, fiestas infantiles, 15 años y celebraciones familiares en San Carlos, La Plata.',
    h1: 'M&M Eventos San Carlos: salón para eventos familiares',
    relatedSlugs: ['la-plata', 'villa-elisa']
  },
  {
    ...localSeoPages[4],
    slug: 'villa-elisa',
    title: 'M&M Villa Elisa',
    metaTitle: 'M&M Eventos Villa Elisa | Salón de Fiestas en Villa Elisa',
    metaDescription: 'M&M Eventos Villa Elisa es un salón de fiestas para cumpleaños, 15 años, casamientos y eventos sociales, con catering y organización integral.',
    h1: 'M&M Eventos Villa Elisa: salón de fiestas para tu evento',
    relatedSlugs: ['la-plata', 'san-carlos']
  }
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

export function serializeJsonLd(value: unknown) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}
