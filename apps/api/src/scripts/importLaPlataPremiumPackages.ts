import { connectDatabase, disconnectDatabase } from '../db/connection';
import { PackageTemplate, VenuePackageRule } from '../modules/crm/crm.models';
import { Salon } from '../modules/salons/salon.model';

const packages = [
  {
    name: 'Gala y Gourmet', pricingMode: 'per_person', pricePerPerson: 130000, finalPricePerPerson: 130000, discountPercentage: 0, depositAmount: 1000000,
    paymentTerms: 'Seña de $1.000.000 para congelar el valor y el resto en cuotas.', promotionText: 'Valor de $130.000 por persona. Referencia para 120 personas: $15.600.000.', giftText: '',
    menuSections: [
      { title: 'Recepción', items: ['Mini brusquetas: jamón crudo con rúcula y caprese', 'Pinchos caprese con reducción de aceto', 'Cucharitas de salmón con queso crema', 'Empanaditas gourmet: carne cortada a cuchillo y humita', 'Mini tarteletas: cebolla caramelizada y roquefort'] },
      { title: 'Bebidas de recepción', items: ['Aperol Spritz y Campari', 'Vino blanco y tinto', 'Gaseosas y agua', 'Hielo'] },
      { title: 'Entrada', items: ['Mesa de fiambres y quesos decorada', 'Mesa de sushi', 'Cazuelas de sorrentinos de jamón y queso con salsa suave'] },
      { title: 'Plato principal', items: ['Lomo con salsa a elección y papas rústicas'] },
      { title: 'Bebidas para entrada y plato principal', items: ['Cerveza Stella Artois', 'Vino tinto Catena Zapata Malbec', 'Gaseosa línea Coca-Cola', 'Agua mineral', 'Hielo'] },
      { title: 'Postre', items: ['Porción de cheesecake de frutos rojos'] },
      { title: 'Bebidas desde el postre y barra', items: ['Gaseosa línea Coca-Cola', 'Cerveza Stella Artois', 'Agua mineral', 'Fernet con Coca-Cola', 'Gancia con Sprite', 'Gin tonic de frutos rojos y clásico', 'Daiquiri de frutilla con y sin alcohol', 'Mojito'] },
      { title: 'Mesa dulce e infusiones', items: ['Tortas: chocotorta, selva negra y Oreo', 'Tartas: lemon pie, frutilla, multifruta, tofy y cabsha', 'Shots variados', 'Café y té'] },
      { title: 'Fin de fiesta', items: ['Show de pernil con carrito y pancitos'] }
    ],
    includedServices: ['Salón completo con mesas y sillas Tiffany', 'Sector de fotos: shimmer wall y diván', 'Sector de mesa principal: mesa espejada, 2 candelabros y sillón trono', 'Sector de torta: arco redondo con globos y 5 mesitas', 'Vajilla completa', 'Mantelería: manteles blancos o negros, caminos y servilletas', 'DJ, sonido e iluminación', 'Proyector para videos', 'Staff de servicio: maître, mozos y ayudante de cocina'],
    notes: 'Servicio premium para eventos de 120 personas como referencia.', publicTitle: 'Gala y Gourmet', publicDescription: 'Propuesta gourmet premium con menú completo, barra de tragos, mesa dulce, fin de fiesta y ambientación integral.',
    publicHighlights: ['Menú gourmet completo', 'Barra de tragos', 'Mesa dulce e infusiones', 'Show de pernil', 'Desde $130.000 por persona'], badgeLabel: 'Premium', visibleOnWebsite: true, displayOrder: 10, featured: false
  },
  {
    name: 'Gold Service', durationHours: 8, startTime: '21:00', endTime: '05:00', pricingMode: 'per_person', pricePerPerson: 140000, finalPricePerPerson: 140000, discountPercentage: 0, depositAmount: 1000000,
    paymentTerms: 'Seña de $1.000.000 para congelar el valor y el resto en cuotas fijas.', promotionText: 'Valor de $140.000 por persona. Referencia para 120 personas: $16.800.000.', giftText: '',
    menuSections: [
      { title: 'Recepción', items: ['Sacramentos de jamón y queso', 'Empanadas variadas: pollo, carne y jamón y queso', 'Isla con pata de pernil exhibida con pancitos y salsas'] },
      { title: 'Entrada', items: ['Cazuelas de pollo al verdeo con papas rústicas', 'Cazuelas de ñoquis con salsa fileto', 'Brochets de bondiola y verduras con dips de alioli', 'Muzzarelitas rebozadas', 'Brusquetas de cheddar, jamón crudo y queso en hebras'] },
      { title: 'Plato principal', items: ['Adultos: colita de cuadril rellena con jamón y queso acompañada de papas noisette', 'Niños y adolescentes: hamburguesas con doble cheddar y papas fritas'] },
      { title: 'Postre', items: ['Cheesecake Oreo'] },
      { title: 'Mesa dulce', items: ['Shots variados', 'Cascada de chocolate con frutas de estación, Oreos y obleas'] },
      { title: 'Bebida a mesa toda la noche', items: ['Coca-Cola', 'Sprite', 'Agua mineral', 'Cerveza Stella Artois o similar', 'Vino tinto Trumpeter Malbec', 'Vino blanco cosecha tardía', 'Agua saborizada', 'Hielo'] },
      { title: 'Barra de tragos toda la noche', items: ['Fernet', 'Campari', 'Gin', 'Gancia', 'Daiquiri con y sin alcohol'] },
      { title: 'Fin de fiesta', items: ['Show de pizzas con amplia variedad de sabores a gusto del cliente'] }
    ],
    includedServices: ['Salón con mesas y sillas Tiffany', 'Cocina completa', 'Vajilla completa', 'Mantelería: manteles blancos o negros, caminos y servilletas', 'DJ con sonido e iluminación', 'Proyector para videos', 'Sector de torta: arco redondo con globos y 5 mesitas', 'Sector de fotos: shimmer wall con diván', 'Sector de mesa principal: mesa espejada, 2 candelabros y sillón trono', 'Staff de servicio: maître, mozos, ayudante de cocina, bartender, recepcionista y personal para baños'],
    notes: 'Servicio de salón y catering de 21:00 a 05:00.', publicTitle: 'Gold Service', publicDescription: 'Servicio premium de salón y catering por ocho horas, con menú completo, bebidas a mesa, barra de tragos y fin de fiesta.',
    publicHighlights: ['Servicio de 21:00 a 05:00', 'Bebidas y barra toda la noche', 'Menú completo', 'Show de pizzas', 'Desde $140.000 por persona'], badgeLabel: 'Gold', visibleOnWebsite: true, displayOrder: 11, featured: false
  }
];

async function importPackages(): Promise<void> {
  await connectDatabase();
  const salon = await Salon.findOne({ name: /La Plata/i, deletedAt: null });
  if (!salon) throw new Error('No se encontró el salón de La Plata.');

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
    console.info(`Paquete importado para La Plata: ${packageData.name}`);
  }
}

importPackages().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }).finally(disconnectDatabase);
