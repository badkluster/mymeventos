import { connectDatabase, disconnectDatabase } from '../db/connection';
import { PackageTemplate, VenuePackageRule } from '../modules/crm/crm.models';
import { Salon } from '../modules/salons/salon.model';

const salonId = '6a3a7b01e07b5dce06768bd2';

const packages = [
  {
    name: 'Opción Bássic', pricingMode: 'fixed', fixedPrice: 1500000, finalFixedPrice: 1500000, discountPercentage: 0, depositAmount: 400000,
    paymentTerms: 'Podés señar con $400.000 para congelar el valor.', promotionText: 'Alquiler de salón por $1.500.000 para eventos de hasta 120 personas.', giftText: '', menuSections: [],
    includedServices: ['Salón con capacidad hasta 120 personas', 'Mesas redondas y sillas', 'DJ, sonido e iluminación', 'Iluminación perimetral del salón', 'Proyector para videos', 'Cocina completa: heladera, freezer, anafe y horno', 'Sector de torta: 3 mesitas con fondo y globos'],
    notes: 'Promo de alquiler de salón. Ubicación: 144 N°664 entre 45 y 46. Visitas: lunes a viernes de 14:00 a 19:00 y sábados de 12:00 a 18:00.', publicTitle: 'Opción Bássic', publicDescription: 'Alquiler de salón equipado para eventos de hasta 120 personas, con DJ, sonido, iluminación, proyector y cocina completa.',
    publicHighlights: ['Hasta 120 personas', 'DJ, sonido e iluminación', 'Proyector incluido', 'Cocina completa', 'Reserva con $400.000'], badgeLabel: 'Alquiler de salón', visibleOnWebsite: true, displayOrder: 3, featured: false
  },
  {
    name: 'Servicio por 5 horas', durationHours: 5, startTime: '13:00', endTime: '18:00', pricingMode: 'per_person', pricePerPerson: 35000, finalPricePerPerson: 35000, discountPercentage: 0, depositAmount: 400000,
    paymentTerms: 'Valor de referencia para 50 personas: $1.750.000. Podés señar con $400.000 para congelar el valor.', promotionText: 'Valor de $35.000 por persona. Referencia para 50 personas: $1.750.000.', giftText: '',
    menuSections: [
      { title: 'Recepción', items: ['Isla de saladitos variados'] },
      { title: 'Entrada', items: ['Empanadas de carne', 'Bandejas de fiambre', 'Sándwich de pollo con tomate y lechuga'] },
      { title: 'Plato principal', items: ['Sándwich de bondiola y papas fritas'] },
      { title: 'Postre', items: ['Porción de chocotorta'] },
      { title: 'Mesa de café', items: ['Café', 'Masas finas', 'Bombones'] }
    ],
    includedServices: ['Mantelería: manteles blancos o negros, caminos y servilletas', 'Staff de servicio', 'Vajilla completa', 'DJ, sonido e iluminación'],
    notes: 'Turnos disponibles: primer turno de 13:00 a 18:00 y segundo turno de 21:00 a 02:00.', publicTitle: 'Servicio por 5 horas', publicDescription: 'Propuesta completa de cinco horas con recepción, menú, postre, mesa de café, vajilla, staff, DJ, sonido e iluminación.',
    publicHighlights: ['Servicio por 5 horas', 'Menú completo', 'DJ, sonido e iluminación', 'Staff y vajilla incluidos', 'Desde $35.000 por persona'], badgeLabel: 'Servicio completo', visibleOnWebsite: true, displayOrder: 4, featured: false
  }
];

async function importPackages(): Promise<void> {
  await connectDatabase();
  const salon = await Salon.findOne({ _id: salonId, deletedAt: null });
  if (!salon) throw new Error(`No se encontró el salón ${salonId}.`);

  for (const packageData of packages) {
    const template = await PackageTemplate.findOneAndUpdate(
      { name: packageData.name, isGlobal: false, salonIds: salon._id, deletedAt: null },
      { $set: { ...packageData, active: true, isGlobal: false, salonIds: [salon._id], deletedAt: null } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    await VenuePackageRule.findOneAndUpdate(
      { packageTemplateId: template._id, salonId: salon._id },
      { $set: { ...packageData, active: true, deletedAt: null }, $setOnInsert: { packageTemplateId: template._id, salonId: salon._id } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    console.info(`Paquete importado para San Carlos: ${packageData.name}`);
  }
}

importPackages().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }).finally(disconnectDatabase);
