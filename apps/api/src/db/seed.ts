import { env } from '../config/env';
import { connectDatabase, disconnectDatabase } from './connection';
import { Salon } from '../modules/salons/salon.model';
import { User } from '../modules/users/user.model';
import { SystemSetting } from '../modules/settings/systemSetting.model';
import { PackageTemplate, VenuePackageRule } from '../modules/crm/crm.models';
import { LandingEventType, LandingFaq, LandingGalleryItem, LandingPromotion, LandingServiceBlock, LandingSettings, LandingTestimonial } from '../modules/landing/landing.models';
import { hashPassword } from '../utils/password';
import { Permission, Role } from '@mym/shared';
import { buildUserFullName, normalizeUserEmail, normalizeUserPhone } from '../modules/users/user.model';

const packageTemplates = [
  {
    name: 'Magic Night', durationHours: 8, startTime: '21:00', endTime: '05:00', pricePerPerson: 85000, discountPercentage: 20, finalPricePerPerson: 68000, depositAmount: 500000,
    giftText: 'Stand de glitter', promotionText: '20% de descuento durante junio.', paymentTerms: 'Congelar valor abonando seña y resto en cuotas fijas.',
    menuSections: [{ title: 'Recepción', items: ['Sándwiches de bondiola y pollo', 'Triples de jamón y queso'] }, { title: 'Plato principal', items: ['Colita de cuadril con papas rústicas', 'Milanesa con papas para niños y adolescentes'] }, { title: 'Final', items: ['Brownie con helado', 'Mesa dulce y show de pizzas'] }],
    includedServices: ['Bebidas durante toda la noche', 'Barra de tragos', 'Organización y staff', 'Vajilla y mantelería', 'DJ, sonido e iluminación', 'Proyector y espacio climatizado']
  },
  {
    name: 'Platinum Night', durationHours: 8, startTime: '21:00', endTime: '05:00', pricePerPerson: 90000, discountPercentage: 20, finalPricePerPerson: 72000, depositAmount: 500000,
    giftText: 'Fotografía para el evento', promotionText: '20% de descuento durante junio.', paymentTerms: 'Congelar valor abonando seña y resto en cuotas fijas.',
    menuSections: [{ title: 'Recepción', items: ['Empanadas, brusquetas y fiambres'] }, { title: 'Plato principal', items: ['Vacío con papas fritas', 'Hamburguesas con cheddar para niños y adolescentes'] }, { title: 'Final', items: ['Bombón Suizo', 'Mesa dulce y show de pizzas'] }],
    includedServices: ['Salón con mesas y sillas', 'Vajilla y mantelería', 'Bebidas para el evento', 'Barra de tragos', 'Sectores de fotos, torta y mesa principal', 'Staff, DJ, proyector y espacio climatizado']
  },
  {
    name: 'Exclusive Night', durationHours: 8, startTime: '21:00', endTime: '05:00', pricePerPerson: 95000, discountPercentage: 20, finalPricePerPerson: 76000, depositAmount: 500000,
    giftText: '10% adicional si se abona el total.', promotionText: '20% de descuento durante junio.', paymentTerms: 'Congelar valor abonando seña y resto en cuotas sin interés.',
    menuSections: [{ title: 'Recepción', items: ['Empanadas, triples y brusquetas'] }, { title: 'Plato principal', items: ['Vacío con papas fritas', 'Milanesas con jamón y queso para niños y adolescentes'] }, { title: 'Final', items: ['Bombón Suizo', 'Tartas, cascada de chocolate, show de panchos y desayuno'] }],
    includedServices: ['Bebidas a mesa', 'Barra para recepción y tandas de baile', 'Vajilla y mantelería', 'DJ, sonido e iluminación', 'Proyector', 'Sectores de fotos, torta y mesa principal', 'Staff y espacio climatizado']
  }
];

const salonSeeds = [
  {
    name: 'San Carlos',
    slug: 'san-carlos',
    address: 'Av. 44 y 137, San Carlos',
    city: 'San Carlos',
    locality: 'San Carlos',
    province: 'Buenos Aires',
    phone: '221 555-0101',
    whatsapp: '5492215550101',
    email: 'sancarlos@mm-eventos.com',
    instagramUrl: 'https://www.instagram.com/mm.eventos.sancarlos/',
    facebookUrl: 'https://www.facebook.com/mm.eventos.sancarlos',
    tiktokUrl: 'https://www.tiktok.com/@mmeventossancarlos',
    active: true,
    internalDescription: 'Salón operativo de M&M Eventos en San Carlos.',
    publicTitle: 'M&M San Carlos',
    publicShortDescription: 'Un salón versátil para celebraciones con identidad propia.',
    publicDescription: 'Espacio preparado para fiestas sociales y eventos familiares con servicio integral de M&M Eventos.',
    visibleOnWebsite: true,
    displayOrder: 1,
    minCapacity: 50,
    maxCapacity: 180,
    recommendedCapacity: 120,
    allowedEventTypes: ['birthday', 'wedding', 'fifteen', 'graduates', 'corporate', 'baptism_communion', 'other'],
    defaultStartTime: '21:00',
    defaultEndTime: '05:00',
    defaultDurationHours: 8,
    allowsExtraHour: true,
    extraHourPrice: 120000,
    defaultDepositAmount: 500000,
    minimumDepositAmount: 300000,
    defaultLateFeePercentage: 0,
    defaultQuoteValidityDays: 7,
    defaultPaymentTerms: 'Congelar valor abonando seña y resto en cuotas fijas.',
    operationalNotes: 'Revisar climatización, sonido y armado de salón antes de cada evento. Confirmar ingreso de proveedores con 48 hs de anticipación.',
    commercialNotes: 'Priorizar cierres con seña dentro de los 7 días. Consultar disponibilidad antes de confirmar promociones.',
    seoTitle: 'Salón de eventos en San Carlos | M&M Eventos',
    seoDescription: 'M&M San Carlos: salón para cumpleaños, casamientos, 15 años y eventos empresariales en La Plata.',
    locationText: 'San Carlos, La Plata',
    mapUrl: 'https://maps.google.com/?q=San%20Carlos%20La%20Plata',
    extraServices: [
      { name: 'Fotografía', description: 'Cobertura fotográfica del evento.', basePrice: 180000, active: true, includedByDefault: false, publicVisible: true },
      { name: 'Stand de glitter', description: 'Stand de glitter para invitados.', basePrice: 120000, active: true, includedByDefault: false, publicVisible: true },
      { name: 'Hora extra', description: 'Extensión de una hora del servicio.', basePrice: 120000, active: true, includedByDefault: false, publicVisible: false }
    ]
  },
  {
    name: 'Villa Elisa',
    slug: 'villa-elisa',
    address: 'Calle 419 e/ 23 y Belgrano N°2253, Villa Elisa',
    city: 'Villa Elisa',
    locality: 'Villa Elisa',
    province: 'Buenos Aires',
    phone: '221 555-0102',
    whatsapp: '5492215550102',
    email: 'villaelisa@mm-eventos.com',
    instagramUrl: 'https://www.instagram.com/mm.eventos.villaelisa/',
    facebookUrl: 'https://www.facebook.com/mm.eventos.villaelisa',
    tiktokUrl: 'https://www.tiktok.com/@mmeventosvillaelisa',
    active: true,
    internalDescription: 'Salón operativo de M&M Eventos en Villa Elisa.',
    publicTitle: 'M&M Villa Elisa',
    publicShortDescription: 'Espacio cálido y elegante para compartir grandes momentos.',
    publicDescription: 'Salón preparado para celebraciones sociales, eventos empresariales y propuestas familiares.',
    visibleOnWebsite: true,
    displayOrder: 2,
    minCapacity: 50,
    maxCapacity: 200,
    recommendedCapacity: 140,
    allowedEventTypes: ['birthday', 'wedding', 'fifteen', 'graduates', 'corporate', 'baptism_communion', 'other'],
    defaultStartTime: '21:00',
    defaultEndTime: '05:00',
    defaultDurationHours: 8,
    allowsExtraHour: true,
    extraHourPrice: 130000,
    defaultDepositAmount: 500000,
    minimumDepositAmount: 300000,
    defaultLateFeePercentage: 0,
    defaultQuoteValidityDays: 7,
    defaultPaymentTerms: 'Congelar valor abonando seña y resto en cuotas fijas.',
    operationalNotes: 'Confirmar armado de mesas, ambientación y sector de recepción según cantidad de invitados.',
    commercialNotes: 'Ideal para eventos familiares y sociales. Ofrecer extras premium cuando la cantidad supere 120 invitados.',
    seoTitle: 'Salón de eventos en Villa Elisa | M&M Eventos',
    seoDescription: 'M&M Villa Elisa: espacio cálido y elegante para fiestas, cumpleaños, casamientos y eventos empresariales.',
    locationText: 'Calle 419 e/ 23 y Belgrano N°2253, Villa Elisa',
    mapUrl: 'https://maps.google.com/maps?q=Calle%20419%202253%2C%20Villa%20Elisa%2C%20Buenos%20Aires%2C%20Argentina&z=17&output=embed',
    extraServices: [
      { name: 'Robot LED', description: 'Show de robot LED para tandas de baile.', basePrice: 160000, active: true, includedByDefault: false, publicVisible: true },
      { name: 'Mesa dulce premium', description: 'Ampliación premium de mesa dulce.', basePrice: 210000, active: true, includedByDefault: false, publicVisible: true },
      { name: 'Hora extra', description: 'Extensión de una hora del servicio.', basePrice: 130000, active: true, includedByDefault: false, publicVisible: false }
    ]
  },
  {
    name: 'La Plata',
    slug: 'la-plata',
    address: 'Zona centro, La Plata',
    city: 'La Plata',
    locality: 'La Plata',
    province: 'Buenos Aires',
    phone: '221 555-0103',
    whatsapp: '5492215550103',
    email: 'laplata@mm-eventos.com',
    instagramUrl: 'https://www.instagram.com/mm.eventos.laplata/',
    facebookUrl: 'https://www.facebook.com/mm.eventos.laplata',
    tiktokUrl: 'https://www.tiktok.com/@mmeventoslaplata',
    active: true,
    internalDescription: 'Salón operativo de M&M Eventos en La Plata.',
    publicTitle: 'M&M La Plata',
    publicShortDescription: 'Una propuesta urbana para eventos inolvidables.',
    publicDescription: 'Espacio de M&M Eventos en La Plata para fiestas y reuniones con propuesta integral.',
    visibleOnWebsite: true,
    displayOrder: 3,
    minCapacity: 40,
    maxCapacity: 160,
    recommendedCapacity: 110,
    allowedEventTypes: ['birthday', 'wedding', 'fifteen', 'graduates', 'corporate', 'baptism_communion', 'other'],
    defaultStartTime: '21:00',
    defaultEndTime: '05:00',
    defaultDurationHours: 8,
    allowsExtraHour: true,
    extraHourPrice: 115000,
    defaultDepositAmount: 500000,
    minimumDepositAmount: 300000,
    defaultLateFeePercentage: 0,
    defaultQuoteValidityDays: 7,
    defaultPaymentTerms: 'Congelar valor abonando seña y resto en cuotas fijas.',
    operationalNotes: 'Validar logística de carga y descarga por ubicación urbana. Confirmar horarios permitidos.',
    commercialNotes: 'Propuesta urbana flexible. Reforzar beneficios de barra extendida e invitaciones digitales.',
    seoTitle: 'Salón de eventos en La Plata | M&M Eventos',
    seoDescription: 'M&M La Plata: salón urbano para eventos sociales, cumpleaños, egresados y reuniones empresariales.',
    locationText: 'La Plata',
    mapUrl: 'https://maps.google.com/?q=La%20Plata',
    extraServices: [
      { name: 'Barra extendida', description: 'Ampliación de barra para recepción y tandas.', basePrice: 190000, active: true, includedByDefault: false, publicVisible: true },
      { name: 'Invitaciones digitales', description: 'Invitación digital para compartir con invitados.', basePrice: 70000, active: true, includedByDefault: false, publicVisible: true },
      { name: 'Hora extra', description: 'Extensión de una hora del servicio.', basePrice: 115000, active: true, includedByDefault: false, publicVisible: false }
    ]
  }
];

const salonManagerSeeds = [
  {
    salonName: 'San Carlos',
    username: 'encargado.sancarlos',
    email: 'encargado.sancarlos@mm-eventos.com',
    firstName: 'Camila',
    lastName: 'Ferreyra',
    phone: '221 555-1101'
  },
  {
    salonName: 'Villa Elisa',
    username: 'encargado.villaelisa',
    email: 'encargado.villaelisa@mm-eventos.com',
    firstName: 'Martín',
    lastName: 'Acuña',
    phone: '221 555-1102'
  },
  {
    salonName: 'La Plata',
    username: 'encargado.laplata',
    email: 'encargado.laplata@mm-eventos.com',
    firstName: 'Sofía',
    lastName: 'Roldán',
    phone: '221 555-1103'
  }
];

const backofficeUserSeeds = [
  {
    username: 'ventas.general',
    email: 'ventas@mm-eventos.com',
    firstName: 'Equipo',
    lastName: 'Comercial',
    phone: '221 555-1201',
    roles: [Role.MANAGER],
    position: 'Ventas y seguimiento comercial',
    department: 'Comercial',
    canReceiveLeadNotifications: true,
    canReceiveQuoteRequestNotifications: true,
    permissionOverrides: [Permission.LEADS_READ, Permission.QUOTES_READ, Permission.CUSTOMERS_READ]
  },
  {
    username: 'operaciones.general',
    email: 'operaciones@mm-eventos.com',
    firstName: 'Equipo',
    lastName: 'Operaciones',
    phone: '221 555-1202',
    roles: [Role.MANAGER],
    position: 'Coordinación operativa',
    department: 'Operaciones',
    canReceiveLeadNotifications: false,
    canReceiveQuoteRequestNotifications: false,
    permissionOverrides: [Permission.EVENTS_READ, Permission.CONTRACTS_READ]
  },
  {
    username: 'administracion.cobros',
    email: 'cobros@mm-eventos.com',
    firstName: 'Administración',
    lastName: 'Cobros',
    phone: '221 555-1203',
    roles: [Role.MANAGER],
    position: 'Pagos y cobranzas',
    department: 'Administración',
    canReceiveLeadNotifications: false,
    canReceiveQuoteRequestNotifications: false,
    permissionOverrides: [Permission.PAYMENTS_READ, Permission.PAYMENTS_CREATE, Permission.PAYMENTS_UPDATE, Permission.CONTRACTS_READ]
  },
  {
    username: 'staff.eventos',
    email: 'staff@mm-eventos.com',
    firstName: 'Staff',
    lastName: 'Eventos',
    phone: '221 555-1204',
    roles: [Role.STAFF],
    position: 'Mozo / staff de eventos',
    department: 'Eventos',
    canReceiveLeadNotifications: false,
    canReceiveQuoteRequestNotifications: false,
    permissionOverrides: [],
    staffSubroles: ['WAITER']
  }
];

const landingImages = [
  'https://images.unsplash.com/photo-1519167758481-83f550bb49b3?auto=format&fit=crop&w=1600&q=80',
  'https://images.unsplash.com/photo-1464366400600-7168b8af9bc3?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1527529482837-4698179dc6ce?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1555244162-803834f70033?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1478146896981-b80fe463b330?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1511795409834-ef04bbd61622?auto=format&fit=crop&w=1200&q=80'
];

const landingPromotions = [
  { title: 'Fechas disponibles', subtitle: 'Consultá las mejores fechas para tu evento.', description: 'Últimas fechas seleccionadas para reservar con condiciones vigentes.', badgeText: 'Agenda abierta', icon: 'CalendarDays', displayOrder: 1 },
  { title: 'Promos especiales', subtitle: 'Descuentos activos por tiempo limitado.', description: 'Beneficios comerciales para eventos sociales y empresariales.', badgeText: 'Tiempo limitado', icon: 'Star', displayOrder: 2 },
  { title: 'Congelá valor con seña', subtitle: 'Asegurá hoy el precio de tu evento.', description: 'Reservá tu fecha y conservá las condiciones acordadas.', badgeText: 'Reserva segura', icon: 'Gift', displayOrder: 3 },
  { title: 'Stand de glitter de regalo', subtitle: 'En paquetes seleccionados.', description: 'Un beneficio para sumar experiencia y fotos durante la fiesta.', badgeText: 'Beneficio', icon: 'Sparkles', displayOrder: 4 }
];

const landingGallery = [
  { title: 'Salón ambientado', category: 'Salones', imageUrl: landingImages[0], displayOrder: 1, featured: true },
  { title: 'Recepción premium', category: 'Catering', imageUrl: landingImages[1], displayOrder: 2, featured: true },
  { title: 'Mesa principal', category: 'Decoración', imageUrl: landingImages[2], displayOrder: 3 },
  { title: 'Catering servido', category: 'Catering', imageUrl: landingImages[3], displayOrder: 4 },
  { title: 'Noche de fiesta', category: '15 años', imageUrl: landingImages[4], displayOrder: 5 },
  { title: 'Momento especial', category: 'Casamientos', imageUrl: landingImages[5], displayOrder: 6 }
];

const landingTestimonials = [
  { quote: 'El mejor salón de La Plata, todo salió perfecto. El equipo de M&M nos acompañó en cada detalle.', customerName: 'Valentina S.', eventType: '15 años', rating: 5, displayOrder: 1, featured: true },
  { quote: 'Increíble la calidad del servicio y la ambientación. Nuestros invitados no pararon de felicitarnos.', customerName: 'María & Juan', eventType: 'Casamiento', rating: 5, displayOrder: 2, featured: true },
  { quote: 'Profesionales, atentos y súper organizados. Hicieron de nuestro evento algo inolvidable.', customerName: 'Luciano R.', eventType: 'Evento empresarial', rating: 5, displayOrder: 3 }
];

const landingFaqs = [
  { question: '¿Con cuánta anticipación debo reservar?', answer: 'Recomendamos consultar cuanto antes para asegurar disponibilidad y congelar condiciones comerciales.', displayOrder: 1 },
  { question: '¿Qué incluye el servicio de catering?', answer: 'Depende del paquete elegido, pero podemos incluir recepción, plato principal, postre, mesa dulce, bebidas y barra.', displayOrder: 2 },
  { question: '¿Puedo llevar mi propia bebida o DJ?', answer: 'Lo revisamos caso por caso según el salón, el tipo de evento y la propuesta contratada.', displayOrder: 3 },
  { question: '¿Cómo reservo mi fecha?', answer: 'Luego de recibir la propuesta, coordinamos seña y condiciones para bloquear la fecha.', displayOrder: 4 },
  { question: '¿Qué formas de pago aceptan?', answer: 'Trabajamos con seña y saldo según condiciones comerciales vigentes. Consultanos para armar un plan.', displayOrder: 5 },
  { question: '¿Se puede visitar el salón antes del evento?', answer: 'Sí, coordinamos una visita para que conozcas el espacio y conversemos tu idea.', displayOrder: 6 }
];

const landingServices = [
  { title: 'Catering', description: 'Menús gourmet y opciones para cada tipo de evento.', icon: 'Utensils', displayOrder: 1 },
  { title: 'Barra y bebidas', description: 'Tragos y bebidas premium durante la noche.', icon: 'GlassWater', displayOrder: 2 },
  { title: 'DJ e iluminación', description: 'Sonido profesional e iluminación para pista y ambientación.', icon: 'Music', displayOrder: 3 },
  { title: 'Ambientación', description: 'Diseño y decoración para crear una experiencia elegante.', icon: 'Sparkles', displayOrder: 4 },
  { title: 'Sector de fotos', description: 'Espacios pensados para recuerdos y contenido social.', icon: 'Camera', displayOrder: 5 },
  { title: 'Organización completa', description: 'Coordinación integral para que disfrutes sin preocupaciones.', icon: 'PartyPopper', displayOrder: 6 }
];

const landingEventTypes = ['15 años', 'Casamientos', 'Cumpleaños', 'Egresados', 'Empresariales', 'Infantiles'].map((title, index) => ({ title, description: 'Propuestas a medida para celebrar con estética, servicio y coordinación M&M.', icon: 'PartyPopper', displayOrder: index + 1 }));

const defaultManagerPassword = 'MymEventos2026!';
const defaultBackofficePassword = 'MymEventos2026!';

function userSeedSet(seed: { username: string; email: string; firstName: string; lastName: string; phone: string; roles: Role[]; position: string; department: string; canReceiveLeadNotifications: boolean; canReceiveQuoteRequestNotifications: boolean; permissionOverrides?: Permission[]; staffSubroles?: string[] }, salonIds: unknown[]) {
  const canAccessBackoffice = !seed.roles.includes(Role.STAFF);
  return {
    email: normalizeUserEmail(seed.email),
    normalizedEmail: normalizeUserEmail(seed.email),
    firstName: seed.firstName,
    lastName: seed.lastName,
    fullName: buildUserFullName(seed.firstName, seed.lastName),
    phone: seed.phone,
    normalizedPhone: normalizeUserPhone(seed.phone),
    roles: seed.roles,
    primaryRole: seed.roles[0],
    canAccessBackoffice,
    permissionOverrides: seed.permissionOverrides ?? [],
    permissionDeniedOverrides: [],
    active: true,
    deletedAt: null,
    salonIds,
    primarySalonId: salonIds[0],
    canReceiveLeadNotifications: seed.canReceiveLeadNotifications,
    canReceiveQuoteRequestNotifications: seed.canReceiveQuoteRequestNotifications,
    mustChangePassword: canAccessBackoffice,
    notificationPreferences: {
      emailNotificationsEnabled: true,
      systemNotificationsEnabled: true,
      whatsappNotificationsEnabled: false,
      notifyOnNewLead: seed.canReceiveLeadNotifications,
      notifyOnNewQuoteRequest: seed.canReceiveQuoteRequestNotifications,
      notifyOnQuoteApproved: true,
      notifyOnContractApproved: true,
      notifyOnPaymentReceived: seed.permissionOverrides?.includes(Permission.PAYMENTS_READ) ?? false,
      notifyOnEventReminder: true,
      notifyOnAssignedTask: true
    },
    employeeProfile: { position: seed.position, department: seed.department, employmentStatus: 'active' },
    staffProfile: seed.roles.includes(Role.STAFF) ? { staffCode: seed.username.toUpperCase(), staffSubroles: seed.staffSubroles ?? ['OTHER'], employmentStatus: 'ACTIVE', notes: 'Staff demo creado por seed.' } : undefined,
    workSchedule: seed.roles.includes(Role.STAFF) ? { type: 'EVENT_BASED', weeklyAvailability: [], notes: 'Disponibilidad por evento.' } : undefined,
    payrollProfile: seed.roles.includes(Role.STAFF) ? { paymentType: 'PER_EVENT', currency: 'ARS', active: true } : undefined,
    attendanceConfig: { enabled: false, canUseMobileApp: true, requiresGeolocation: false, requiresWifiOrIpValidation: false, allowedIpAddresses: [], allowManualAdjustment: false }
  };
}

async function seed(): Promise<void> {
  await connectDatabase();
  const salons = await Promise.all(salonSeeds.map((salon) => Salon.findOneAndUpdate(
    { name: salon.name },
    { $set: { ...salon, active: true, deletedAt: null } },
    { new: true, upsert: true }
  )));
  const salonsByName = new Map(salons.map((salon) => [salon.name, salon]));
  const managerPasswordHash = await hashPassword(defaultManagerPassword);
  const backofficePasswordHash = await hashPassword(defaultBackofficePassword);
  let createdManagers = 0;
  let updatedManagers = 0;
  for (const managerSeed of salonManagerSeeds) {
    const salon = salonsByName.get(managerSeed.salonName);
    if (!salon) throw new Error(`No se encontró el salón ${managerSeed.salonName} para asignar encargado.`);
    const existingManager = await User.findOne({ username: managerSeed.username });
    const manager = await User.findOneAndUpdate(
      { username: managerSeed.username },
      {
        $set: {
          email: normalizeUserEmail(managerSeed.email),
          normalizedEmail: normalizeUserEmail(managerSeed.email),
          firstName: managerSeed.firstName,
          lastName: managerSeed.lastName,
          fullName: buildUserFullName(managerSeed.firstName, managerSeed.lastName),
          phone: managerSeed.phone,
          normalizedPhone: normalizeUserPhone(managerSeed.phone),
          roles: [Role.SALON_MANAGER],
          primaryRole: Role.SALON_MANAGER,
          canAccessBackoffice: true,
          active: true,
          deletedAt: null,
          primarySalonId: salon._id,
          primaryManagedSalonId: salon._id,
          mustChangePassword: true,
          canReceiveLeadNotifications: true,
          canReceiveQuoteRequestNotifications: true,
          permissionOverrides: [],
          permissionDeniedOverrides: [],
          notificationPreferences: { email: true, inApp: true, whatsapp: false, newLead: true, newQuoteRequest: true, quoteAccepted: true, eventReminder: true, paymentReminder: true, emailNotificationsEnabled: true, systemNotificationsEnabled: true, whatsappNotificationsEnabled: false, notifyOnNewLead: true, notifyOnNewQuoteRequest: true, notifyOnQuoteApproved: true, notifyOnContractApproved: true, notifyOnPaymentReceived: false, notifyOnEventReminder: true, notifyOnAssignedTask: true },
          employeeProfile: { position: `Encargado/a ${managerSeed.salonName}`, department: 'Operaciones', employmentStatus: 'active' },
          attendanceConfig: { enabled: false, canUseMobileApp: false, requiresGeolocation: true, requiresWifiOrIpValidation: false, allowedIpAddresses: [], allowManualAdjustment: false }
        },
        $addToSet: { salonIds: salon._id, managedSalonIds: salon._id },
        $setOnInsert: { username: managerSeed.username, passwordHash: managerPasswordHash }
      },
      { new: true, upsert: true }
    );
    await Salon.findByIdAndUpdate(salon._id, { $set: { managerUserId: manager._id } });
    existingManager ? updatedManagers++ : createdManagers++;
  }
  let createdBackofficeUsers = 0;
  let updatedBackofficeUsers = 0;
  const allSalonIds = salons.map((salon) => salon._id);
  for (const userSeed of backofficeUserSeeds) {
    const existingUser = await User.findOne({ username: userSeed.username });
    await User.findOneAndUpdate(
      { username: userSeed.username },
      {
        $set: userSeedSet(userSeed, allSalonIds),
        $setOnInsert: { username: userSeed.username, passwordHash: backofficePasswordHash }
      },
      { new: true, upsert: true }
    );
    existingUser ? updatedBackofficeUsers++ : createdBackofficeUsers++;
  }
  const hasAdminCredentials = Boolean(env.SEED_ADMIN_USERNAME && env.SEED_ADMIN_EMAIL && env.SEED_ADMIN_PASSWORD && env.SEED_ADMIN_PASSWORD.length >= 12);
  if (hasAdminCredentials) await User.findOneAndUpdate({ username: env.SEED_ADMIN_USERNAME!.toLowerCase() }, {
    $set: { email: env.SEED_ADMIN_EMAIL!.toLowerCase(), normalizedEmail: normalizeUserEmail(env.SEED_ADMIN_EMAIL!), firstName: 'Administrador', lastName: 'Inicial', fullName: 'Administrador Inicial', roles: [Role.ADMIN], primaryRole: Role.ADMIN, canAccessBackoffice: true, salonIds: allSalonIds, primarySalonId: allSalonIds[0], active: true, deletedAt: null },
    $setOnInsert: { username: env.SEED_ADMIN_USERNAME!.toLowerCase(), passwordHash: await hashPassword(env.SEED_ADMIN_PASSWORD!) }
  }, { upsert: true });
  else console.warn('Seed de usuario administrador omitido: faltan credenciales válidas. Se continuará con la precarga comercial.');
  await SystemSetting.findOneAndUpdate({ key: 'application' }, { $setOnInsert: { key: 'application', value: { timezone: 'America/Argentina/Buenos_Aires', currency: 'ARS' }, description: 'Configuración inicial de la aplicación' } }, { upsert: true });
  let createdPackages = 0;
  let updatedPackages = 0;
  let createdRules = 0;
  for (const template of packageTemplates) {
    const existing = await PackageTemplate.findOne({ name: { $regex: `^${template.name}$`, $options: 'i' } });
    const packageTemplate = existing
      ? await PackageTemplate.findByIdAndUpdate(existing._id, { $set: { name: template.name, active: true, isGlobal: true, salonIds: salons.map((salon) => salon._id), deletedAt: null } }, { new: true })
      : await PackageTemplate.create({ ...template, active: true, isGlobal: true, salonIds: salons.map((salon) => salon._id) });
    if (!packageTemplate) throw new Error(`No se pudo preparar el paquete ${template.name}.`);
    existing ? updatedPackages++ : createdPackages++;
    for (const salon of salons) {
      const existingRule = await VenuePackageRule.exists({ packageTemplateId: packageTemplate._id, salonId: salon._id });
      await VenuePackageRule.findOneAndUpdate(
        { packageTemplateId: packageTemplate._id, salonId: salon._id },
        { $set: { active: true, deletedAt: null }, $setOnInsert: { ...template, packageTemplateId: packageTemplate._id, salonId: salon._id } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      if (!existingRule) createdRules++;
    }
  }
  await LandingSettings.findOneAndUpdate(
    { key: 'default' },
    {
      $set: {
        key: 'default',
        heroTitle: 'Tu evento, en el lugar que siempre imaginaste',
        heroSubtitle: 'Salones únicos, catering premium, ambientación, DJ y organización integral para que disfrutes sin preocupaciones.',
        heroImageUrl: landingImages[0],
        heroPrimaryCtaLabel: 'Solicitá presupuesto',
        heroSecondaryCtaLabel: 'Ver salones',
        whatsappNumber: '5492211234567',
        whatsappDefaultMessage: 'Hola M&M Eventos, quiero solicitar un presupuesto para mi evento.',
        contactEmail: 'info@mm-eventos.com.ar',
        contactPhone: '+54 9 221 123-4567',
        footerText: 'Creamos momentos únicos que permanecen para siempre.',
        seoTitle: 'M&M Eventos | Salones y eventos premium',
        seoDescription: 'Salones, catering, ambientación, DJ y organización integral para eventos inolvidables.',
        openGraphImageUrl: landingImages[0],
        active: true,
        deletedAt: null
      }
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  await Promise.all(landingPromotions.map((item) => LandingPromotion.findOneAndUpdate({ title: item.title }, { $set: { ...item, active: true, visibleOnHome: true, deletedAt: null } }, { upsert: true, new: true, setDefaultsOnInsert: true })));
  await Promise.all(landingGallery.map((item) => LandingGalleryItem.findOneAndUpdate({ title: item.title }, { $set: { ...item, altText: item.title, active: true, deletedAt: null } }, { upsert: true, new: true, setDefaultsOnInsert: true })));
  await Promise.all(landingTestimonials.map((item) => LandingTestimonial.findOneAndUpdate({ customerName: item.customerName, eventType: item.eventType }, { $set: { ...item, active: true, deletedAt: null } }, { upsert: true, new: true, setDefaultsOnInsert: true })));
  await Promise.all(landingFaqs.map((item) => LandingFaq.findOneAndUpdate({ question: item.question }, { $set: { ...item, active: true, deletedAt: null } }, { upsert: true, new: true, setDefaultsOnInsert: true })));
  await Promise.all(landingServices.map((item) => LandingServiceBlock.findOneAndUpdate({ title: item.title }, { $set: { ...item, section: 'services', active: true, deletedAt: null } }, { upsert: true, new: true, setDefaultsOnInsert: true })));
  await Promise.all(landingEventTypes.map((item) => LandingEventType.findOneAndUpdate({ title: item.title }, { $set: { ...item, active: true, deletedAt: null } }, { upsert: true, new: true, setDefaultsOnInsert: true })));
  console.info(`Initial data seeded: ${createdPackages} packages created, ${updatedPackages} packages updated, ${createdRules} venue rules created, ${createdManagers} salon managers created, ${updatedManagers} salon managers updated, ${createdBackofficeUsers} backoffice users created, ${updatedBackofficeUsers} backoffice users updated. Landing content prepared.`);
}

seed().then(disconnectDatabase).catch(async (error) => { console.error('Seed failed:', error); await disconnectDatabase(); process.exitCode = 1; });
