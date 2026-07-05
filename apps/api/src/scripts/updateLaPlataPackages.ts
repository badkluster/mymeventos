import { connectDatabase, disconnectDatabase } from '../db/connection';
import { PackageTemplate, VenuePackageRule } from '../modules/crm/crm.models';
import { Salon } from '../modules/salons/salon.model';

const laPlataPackages = [
  {
    name: 'Fiesta de egresados M&M La Plata', durationHours: 8, startTime: '21:00', endTime: '05:00', pricePerPerson: 95000, discountPercentage: 0, finalPricePerPerson: 95000, depositAmount: 1000000,
    promotionText: 'Valor para 120 personas: $11.400.000.', paymentTerms: 'Seña de $1.000.000 para congelar el valor y resto en cuotas fijas sin interés hasta 15 días antes del evento.',
    giftText: 'Adicional disponible de 01:00 a 05:00: barra de tragos por $20.000 por persona, incluye 5 tragos.',
    notes: 'Salón y catering completo para egresados. Adicional de barra: fernet con Coca-Cola, Gancia con Sprite, vodka con jugo de naranja y gin tonic.',
    menuSections: [
      { title: 'Recepción', items: ['Mesa central de fiambres y quesos decorada', 'Empanaditas variadas bandejeadas'] },
      { title: 'Entrada', items: ['Triples de jamón y queso', 'Sándwich de bondiola con dips de salsa criolla', 'Sándwiches de matambre', 'Sacramentos de jamón y queso'] },
      { title: 'Plato principal', items: ['Adultos: colita de cuadril rellena de jamón y queso con salsa de verdeo y papas rústicas', 'Adolescentes y niños: hamburguesas con cheddar y papas fritas'] },
      { title: 'Postre', items: ['Porción de chocotorta'] },
      { title: 'Bebida de 21:00 a 00:00', items: ['Coca-Cola', 'Sprite', 'Cerveza Stella Artois o similar', 'Vino tinto Callia o similar', 'Hielo para todo el evento'] }
    ],
    includedServices: ['DJ, sonido e iluminación', 'Sector de fotos: shimmer wall con globos', 'Sector de torta: aro con globos y 3 mesitas', 'Conducción del evento: ingreso de egresados y entrega de bandas', 'Cronograma y organización del evento', 'Vajilla completa', 'Mantelería básica: manteles blancos o negros y servilletas a gusto del cliente', 'Staff de servicio: metre, mozos y encargado de cocina']
  },
  {
    name: 'Black Service La Plata', durationHours: 8, startTime: '21:00', endTime: '05:00', pricePerPerson: 120000, discountPercentage: 0, finalPricePerPerson: 120000, depositAmount: 1000000,
    promotionText: 'Valor para 120 personas: $14.400.000.', paymentTerms: 'Seña de $1.000.000 para congelar el valor y resto en cuotas fijas sin interés hasta 15 días antes del evento.',
    giftText: 'Sorpresa final: carrito de helados y golosinas.',
    notes: 'Servicio de salón y catering de 21:00 a 05:00.',
    menuSections: [
      { title: 'Recepción', items: ['Mesa central de fiambres decorada con frutas y verduras', 'Mesa central de sushi'] },
      { title: 'Entrada', items: ['Show de pernil de cerdo', 'Cazuelas: ñoquis con fileto, sorrentinos con verdeo y ravioles con salsa mixta', 'Empanadas variadas de carne, pollo y jamón y queso', 'Triples de jamón y queso'] },
      { title: 'Plato principal', items: ['Porción de vacío con papas fritas'] },
      { title: 'Postre y mesa dulce', items: ['Bombón suizo', 'Variedad de tortas y tartas', 'Cascada de chocolate con frutas de estación'] },
      { title: 'Bebida a mesa', items: ['Coca-Cola', 'Sprite', 'Cerveza Stella Artois o similar', 'Vino tinto Fond de Cave Malbec', 'Agua mineral', 'Agua saborizada', 'Hielo'] },
      { title: 'Barra de tragos de 00:00 a 05:00', items: ['Fernet', 'Campari', 'Gancia', 'Gin'] }
    ],
    includedServices: ['Mesas y sillas Tiffany', 'Vajilla completa', 'Mantelería: manteles blancos o negros, caminos y servilletas', 'Sector de fotos: shimmer wall con diván', 'Sector de torta: arco redondo con globos y mesitas', 'Sector de mesa principal: mesa espejada, 2 candelabros y sillón trono', 'DJ con sonido e iluminación', 'Proyector para videos', 'Staff de servicio: metre, mozos y encargado de cocina']
  },
  {
    name: 'Salón completo M&M La Plata', durationHours: 8, startTime: '21:00', endTime: '05:00', pricePerPerson: 31250, discountPercentage: 0, finalPricePerPerson: 31250, depositAmount: 700000,
    promotionText: 'Valor fijo hasta 160 personas: $5.000.000.', paymentTerms: 'Seña de $700.000 para congelar el valor y resto en cuotas sin interés hasta 15 días antes del evento.',
    notes: 'Servicio de salón de 21:00 a 05:00. Capacidad máxima: 160 personas. La plataforma calcula por persona; este paquete representa el valor fijo de $5.000.000 dividido por 160 personas. Usar presupuesto manual si la cantidad cambia y se desea mantener precio fijo.',
    menuSections: [{ title: 'Servicio de salón', items: ['Paquete de salón sin catering incluido'] }],
    includedServices: ['Vajilla completa', 'Mantelería: manteles blancos o negros, caminos y servilletas', 'Salón con mesas y sillas Tiffany', 'DJ, sonido e iluminación', 'Proyector para videos', 'Sector de torta: mesitas con fondo y globos', 'Sector mesa principal: mesa de estilo, 2 candelabros y sillón trono', 'Sector de fotos: shimmer wall y diván', 'Espacio climatizado', 'Staff de servicio: metre, mozos y ayudante de cocina']
  }
];

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function main() {
  await connectDatabase();
  const salon = await Salon.findOne({ name: { $regex: '^La Plata$', $options: 'i' }, deletedAt: null });
  if (!salon) throw new Error('No se encontró el salón La Plata.');

  const packageIds = [];
  for (const packageData of laPlataPackages) {
    const existing = await PackageTemplate.findOne({ name: { $regex: `^${escapeRegExp(packageData.name)}$`, $options: 'i' } });
    const template = existing
      ? await PackageTemplate.findByIdAndUpdate(existing._id, { $set: { ...packageData, active: true, isGlobal: false, salonIds: [salon._id], deletedAt: null } }, { new: true })
      : await PackageTemplate.create({ ...packageData, active: true, isGlobal: false, salonIds: [salon._id] });
    if (!template) throw new Error(`No se pudo preparar el paquete ${packageData.name}.`);
    packageIds.push(template._id);

    await VenuePackageRule.findOneAndUpdate(
      { packageTemplateId: template._id, salonId: salon._id },
      { $set: { ...packageData, active: true, deletedAt: null }, $setOnInsert: { packageTemplateId: template._id, salonId: salon._id } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }

  await PackageTemplate.updateMany(
    { _id: { $nin: packageIds }, isGlobal: false, salonIds: salon._id },
    { $pull: { salonIds: salon._id } }
  );
  await VenuePackageRule.updateMany(
    { salonId: salon._id, packageTemplateId: { $nin: packageIds } },
    { $set: { active: false, deletedAt: new Date(), notes: 'Desactivado por actualización de paquetes de La Plata.' } }
  );

  console.info(`Paquetes de La Plata actualizados: ${laPlataPackages.length}.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectDatabase();
  });
