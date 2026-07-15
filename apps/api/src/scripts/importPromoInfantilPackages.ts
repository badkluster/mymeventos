import { connectDatabase, disconnectDatabase } from '../db/connection';
import { PackageTemplate, VenuePackageRule } from '../modules/crm/crm.models';
import { Salon } from '../modules/salons/salon.model';

const salonId = '6a3a7b01e07b5dce06768bd3';

const packages = [
  {
    name: 'Promo Infantil Risitas', durationHours: 3, startTime: '13:00', endTime: '16:00', pricingMode: 'fixed', fixedPrice: 400000, finalFixedPrice: 400000, discountPercentage: 0, depositAmount: 100000,
    paymentTerms: 'Se requiere una seña de $100.000 para confirmar la reserva y congelar el valor del paquete.', promotionText: 'Valor fijo de $400.000 para eventos de hasta 100 personas.', giftText: '', menuSections: [],
    includedServices: ['Servicio por 3 horas', 'Cocina completa', 'Vajilla completa', 'Manteles negros', 'Staff de servicio: coordinadora del evento, mozos y ayudante de cocina', 'Inflable', 'Sonido', 'Tarjeta digital', 'Capacidad de hasta 100 personas'],
    notes: 'Turnos disponibles: primer turno de 13:00 a 16:00 y segundo turno de 17:00 a 20:00.', publicTitle: 'Promo Infantil Risitas', publicDescription: 'Una propuesta infantil para celebrar durante 3 horas con salón equipado, inflable, sonido y personal de servicio. Disponible para eventos de hasta 100 personas.',
    publicHighlights: ['Hasta 100 personas', 'Inflable incluido', 'Sonido incluido', 'Staff de servicio', 'Reserva con $100.000'], badgeLabel: 'Promo infantil', visibleOnWebsite: true, displayOrder: 1, featured: false
  },
  {
    name: 'Promo Infantil Sonrisitas', durationHours: 3, startTime: '13:00', endTime: '16:00', pricingMode: 'fixed', fixedPrice: 650000, finalFixedPrice: 650000, discountPercentage: 0, depositAmount: 0,
    paymentTerms: 'Consultar las condiciones de reserva y el valor de la seña vigente.', promotionText: 'Valor fijo de $650.000 para eventos de hasta 100 personas.', giftText: 'Piñata de regalo.',
    menuSections: [{ title: 'Menú para niños', items: ['Empanadas de jamón y queso', 'Pizzetas de muzzarella', 'Chips de jamón y queso', 'Snacks'] }],
    includedServices: ['Servicio por 3 horas', 'Cocina completa', 'Vajilla completa', 'Manteles blancos o negros', 'Servilletas de tela haciendo juego con la temática', 'Staff de servicio: coordinador del evento, mozos y ayudante de cocina', 'Inflable', 'Sonido', 'Tarjeta digital', 'Regalo exclusivo: piñata', 'Capacidad de hasta 100 personas'],
    notes: 'Turnos disponibles: primer turno de 13:00 a 16:00 y segundo turno de 17:00 a 20:00.', publicTitle: 'Promo Infantil Sonrisitas', publicDescription: 'Una propuesta infantil completa con menú para niños, inflable, sonido, personal de servicio y piñata de regalo. Disponible para eventos de hasta 100 personas.',
    publicHighlights: ['Hasta 100 personas', 'Menú infantil incluido', 'Inflable y sonido', 'Piñata de regalo', 'Staff de servicio'], badgeLabel: 'Menú incluido', visibleOnWebsite: true, displayOrder: 2, featured: false
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
    console.info(`Paquete importado: ${packageData.name}`);
  }
}

importPackages()
  .catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; })
  .finally(disconnectDatabase);
