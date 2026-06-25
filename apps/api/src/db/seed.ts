import { env } from '../config/env';
import { connectDatabase, disconnectDatabase } from './connection';
import { Salon } from '../modules/salons/salon.model';
import { User } from '../modules/users/user.model';
import { SystemSetting } from '../modules/settings/systemSetting.model';
import { PackageTemplate, VenuePackageRule } from '../modules/crm/crm.models';
import { hashPassword } from '../utils/password';
import { Role } from '@mym/shared';

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
    address: 'Camino Centenario, Villa Elisa',
    city: 'Villa Elisa',
    locality: 'Villa Elisa',
    province: 'Buenos Aires',
    phone: '221 555-0102',
    whatsapp: '5492215550102',
    email: 'villaelisa@mm-eventos.com',
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
    locationText: 'Villa Elisa, La Plata',
    mapUrl: 'https://maps.google.com/?q=Villa%20Elisa%20La%20Plata',
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

const defaultManagerPassword = 'MymEventos2026!';

async function seed(): Promise<void> {
  await connectDatabase();
  const salons = await Promise.all(salonSeeds.map((salon) => Salon.findOneAndUpdate(
    { name: salon.name },
    { $set: { ...salon, active: true, deletedAt: null } },
    { new: true, upsert: true }
  )));
  const salonsByName = new Map(salons.map((salon) => [salon.name, salon]));
  const managerPasswordHash = await hashPassword(defaultManagerPassword);
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
          email: managerSeed.email,
          firstName: managerSeed.firstName,
          lastName: managerSeed.lastName,
          phone: managerSeed.phone,
          roles: [Role.SALON_MANAGER],
          active: true,
          deletedAt: null,
          primarySalonId: salon._id,
          primaryManagedSalonId: salon._id,
          mustChangePassword: true,
          notificationPreferences: { email: true, inApp: true, whatsapp: false, newLead: true, newQuoteRequest: true, quoteAccepted: true, eventReminder: true, paymentReminder: true },
          attendanceConfig: { canUseMobileApp: false, requiresGeolocation: true, requiresWifiOrIpValidation: false, allowedIpAddresses: [] }
        },
        $addToSet: { salonIds: salon._id, managedSalonIds: salon._id },
        $setOnInsert: { username: managerSeed.username, passwordHash: managerPasswordHash }
      },
      { new: true, upsert: true }
    );
    await Salon.findByIdAndUpdate(salon._id, { $set: { managerUserId: manager._id } });
    existingManager ? updatedManagers++ : createdManagers++;
  }
  const hasAdminCredentials = Boolean(env.SEED_ADMIN_USERNAME && env.SEED_ADMIN_EMAIL && env.SEED_ADMIN_PASSWORD && env.SEED_ADMIN_PASSWORD.length >= 12);
  if (hasAdminCredentials) await User.findOneAndUpdate({ username: env.SEED_ADMIN_USERNAME!.toLowerCase() }, {
    $setOnInsert: { username: env.SEED_ADMIN_USERNAME!.toLowerCase(), email: env.SEED_ADMIN_EMAIL!.toLowerCase(), passwordHash: await hashPassword(env.SEED_ADMIN_PASSWORD!), firstName: 'Administrador', lastName: 'Inicial', roles: [Role.ADMIN], salonIds: salons.map((salon) => salon._id), active: true }
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
  console.info(`Initial data seeded: ${createdPackages} packages created, ${updatedPackages} packages updated, ${createdRules} venue rules created, ${createdManagers} salon managers created, ${updatedManagers} salon managers updated.`);
}

seed().then(disconnectDatabase).catch(async (error) => { console.error('Seed failed:', error); await disconnectDatabase(); process.exitCode = 1; });
