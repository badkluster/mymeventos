const sectionNames: Record<string, string> = {
  hero: 'Portada',
  salons: 'Salones',
  packages: 'Paquetes',
  services: 'Servicios incluidos',
  promotions: 'Promociones',
  gallery: 'Galería',
  testimonials: 'Testimonios',
  contact: 'Contacto',
  location: 'Ubicación',
  unidentified: 'Sin sección',
};

const elementNames: Record<string, string> = {
  'floating-whatsapp': 'Botón flotante de WhatsApp',
  'floating-request-quote': 'Botón flotante «Solicitá tu presupuesto»',
  'contact-form': 'Formulario de contacto',
  unidentified: 'Elemento sin identificar',
};

const deviceNames: Record<string, string> = {
  desktop: 'Computadora',
  tablet: 'Tablet',
  mobile: 'Celular',
  unknown: 'Sin identificar',
};

const sourceNames: Record<string, string> = {
  direct: 'Acceso directo',
  referral: 'Sitio referido',
};

function humanizeSlug(value: string) {
  return value
    .replace(/^element-/, '')
    .split('-')
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

export function analyticsSectionLabel(value?: string) {
  if (!value) return 'Sin sección';
  return sectionNames[value] ?? humanizeSlug(value);
}

export function analyticsElementLabel(value?: string) {
  if (!value) return 'Elemento sin identificar';
  return elementNames[value] ?? humanizeSlug(value);
}

export function analyticsDeviceLabel(value?: string) {
  return deviceNames[value ?? ''] ?? 'Sin identificar';
}

export function analyticsSourceLabel(value?: string) {
  if (!value) return 'Sin identificar';
  return sourceNames[value] ?? humanizeSlug(value);
}
