import type { SalonStockCategory } from './salonStockItem.model';

export const salonStockNames = ['La Plata', 'San Carlos', 'Villa Elisa'] as const;
export type SalonStockName = typeof salonStockNames[number];
export type SalonStockSeedItem = {
  itemKey: string;
  name: string;
  category: SalonStockCategory;
  quantities: Record<SalonStockName, number>;
};

export const salonStockAsOf = new Date('2026-07-04T12:00:00.000Z');

export const salonStockSeedItems: SalonStockSeedItem[] = [
  { itemKey: 'dinner-plate', name: 'Plato playo', category: 'PLATES', quantities: { 'La Plata': 98, 'San Carlos': 96, 'Villa Elisa': 100 } },
  { itemKey: 'dessert-plate', name: 'Plato de postre', category: 'PLATES', quantities: { 'La Plata': 102, 'San Carlos': 106, 'Villa Elisa': 100 } },
  { itemKey: 'water-glass', name: 'Copa de agua', category: 'GLASSWARE', quantities: { 'La Plata': 71, 'San Carlos': 78, 'Villa Elisa': 96 } },
  { itemKey: 'champagne-glass', name: 'Copa de champagne', category: 'GLASSWARE', quantities: { 'La Plata': 84, 'San Carlos': 78, 'Villa Elisa': 100 } },
  { itemKey: 'long-drink-glass-18-p', name: 'Vasos de trago largo vidrio 18 y P', category: 'DRINKWARE', quantities: { 'La Plata': 143, 'San Carlos': 40, 'Villa Elisa': 120 } },
  { itemKey: 'table-knife', name: 'Cuchillo de mesa', category: 'CUTLERY', quantities: { 'La Plata': 24, 'San Carlos': 96, 'Villa Elisa': 100 } },
  { itemKey: 'table-fork', name: 'Tenedor de mesa', category: 'CUTLERY', quantities: { 'La Plata': 53, 'San Carlos': 96, 'Villa Elisa': 100 } },
  { itemKey: 'dessert-spoon', name: 'Cuchara de postre', category: 'CUTLERY', quantities: { 'La Plata': 155, 'San Carlos': 96, 'Villa Elisa': 100 } },
  { itemKey: 'glass-pitcher', name: 'Jarra de vidrio', category: 'MISCELLANEOUS', quantities: { 'La Plata': 14, 'San Carlos': 20, 'Villa Elisa': 20 } },
  { itemKey: 'small-ice-bucket-with-tongs', name: 'Hieleras con pinzas chicas (25 pinzas)', category: 'MISCELLANEOUS', quantities: { 'La Plata': 9, 'San Carlos': 7, 'Villa Elisa': 10 } },
  { itemKey: 'large-champagne-bucket', name: 'Fraperas grandes', category: 'MISCELLANEOUS', quantities: { 'La Plata': 1, 'San Carlos': 0, 'Villa Elisa': 1 } },
  { itemKey: 'coffee-set', name: 'Set de café', category: 'MISCELLANEOUS', quantities: { 'La Plata': 25, 'San Carlos': 30, 'Villa Elisa': 0 } },
  { itemKey: 'skimmer', name: 'Espumadera', category: 'MISCELLANEOUS', quantities: { 'La Plata': 0, 'San Carlos': 1, 'Villa Elisa': 1 } },
  { itemKey: 'frying-pan', name: 'Sartén', category: 'MISCELLANEOUS', quantities: { 'La Plata': 0, 'San Carlos': 0, 'Villa Elisa': 1 } },
  { itemKey: 'dish-rack', name: 'Escurridor', category: 'MISCELLANEOUS', quantities: { 'La Plata': 1, 'San Carlos': 1, 'Villa Elisa': 0 } },
  { itemKey: 'gray-waiter-tray', name: 'Bandeja para mozos gris', category: 'MISCELLANEOUS', quantities: { 'La Plata': 0, 'San Carlos': 1, 'Villa Elisa': 0 } },
  { itemKey: 'black-waiter-tray', name: 'Bandeja para mozos negra', category: 'MISCELLANEOUS', quantities: { 'La Plata': 2, 'San Carlos': 3, 'Villa Elisa': 3 } },
  { itemKey: 'wooden-spoon', name: 'Cuchara de madera', category: 'MISCELLANEOUS', quantities: { 'La Plata': 2, 'San Carlos': 1, 'Villa Elisa': 1 } },
  { itemKey: 'cake-server', name: 'Palita de torta', category: 'MISCELLANEOUS', quantities: { 'La Plata': 5, 'San Carlos': 4, 'Villa Elisa': 4 } },
  { itemKey: 'casserole-10-cm', name: 'Cazuelas de 10 cm', category: 'MISCELLANEOUS', quantities: { 'La Plata': 24, 'San Carlos': 0, 'Villa Elisa': 10 } },
  { itemKey: 'rectangular-tray', name: 'Bandeja rectangular', category: 'MISCELLANEOUS', quantities: { 'La Plata': 3, 'San Carlos': 1, 'Villa Elisa': 0 } },
  { itemKey: 'serving-tongs', name: 'Pinzas para servir (2 chicas y 2 grandes)', category: 'MISCELLANEOUS', quantities: { 'La Plata': 1, 'San Carlos': 0, 'Villa Elisa': 1 } },
  { itemKey: 'wooden-pizza-board', name: 'Tabla de madera para pizza', category: 'MISCELLANEOUS', quantities: { 'La Plata': 0, 'San Carlos': 2, 'Villa Elisa': 3 } },
  { itemKey: 'round-baking-tray', name: 'Bandejas redondas para hornear', category: 'MISCELLANEOUS', quantities: { 'La Plata': 7, 'San Carlos': 5, 'Villa Elisa': 8 } },
  { itemKey: 'salt-shaker', name: 'Salero', category: 'MISCELLANEOUS', quantities: { 'La Plata': 0, 'San Carlos': 0, 'Villa Elisa': 2 } },
  { itemKey: 'ladle', name: 'Cucharón', category: 'MISCELLANEOUS', quantities: { 'La Plata': 1, 'San Carlos': 1, 'Villa Elisa': 1 } },
  { itemKey: 'dishcloth', name: 'Rejillas', category: 'MISCELLANEOUS', quantities: { 'La Plata': 2, 'San Carlos': 1, 'Villa Elisa': 3 } },
  { itemKey: 'napkin-holder', name: 'Servilleteros', category: 'MISCELLANEOUS', quantities: { 'La Plata': 2, 'San Carlos': 0, 'Villa Elisa': 5 } },
  { itemKey: 'spatula', name: 'Espátulas', category: 'MISCELLANEOUS', quantities: { 'La Plata': 0, 'San Carlos': 0, 'Villa Elisa': 0 } },
  { itemKey: 'thermal-pitcher', name: 'Jarra térmica', category: 'MISCELLANEOUS', quantities: { 'La Plata': 1, 'San Carlos': 1, 'Villa Elisa': 0 } },
  { itemKey: 'pork-cart', name: 'Carrito de pernil', category: 'MISCELLANEOUS', quantities: { 'La Plata': 1, 'San Carlos': 0, 'Villa Elisa': 0 } },
  { itemKey: 'blender', name: 'Licuadoras', category: 'MISCELLANEOUS', quantities: { 'La Plata': 2, 'San Carlos': 0, 'Villa Elisa': 0 } },
  { itemKey: 'cocktail-stirrer-and-jigger', name: 'Removedor de tragos y medidor', category: 'MISCELLANEOUS', quantities: { 'La Plata': 0, 'San Carlos': 0, 'Villa Elisa': 1 } },
  { itemKey: 'kitchen-towel', name: 'Repasadores (3 rosas y 1 verde)', category: 'MISCELLANEOUS', quantities: { 'La Plata': 4, 'San Carlos': 4, 'Villa Elisa': 4 } },
  { itemKey: 'uniform', name: 'Uniformes', category: 'MISCELLANEOUS', quantities: { 'La Plata': 7, 'San Carlos': 0, 'Villa Elisa': 0 } },
  { itemKey: 'apron', name: 'Delantales', category: 'MISCELLANEOUS', quantities: { 'La Plata': 3, 'San Carlos': 0, 'Villa Elisa': 2 } },
  { itemKey: 'table-skirt', name: 'Faldones', category: 'MISCELLANEOUS', quantities: { 'La Plata': 3, 'San Carlos': 0, 'Villa Elisa': 2 } },
  { itemKey: 'cleaver', name: 'Cuchilla', category: 'MISCELLANEOUS', quantities: { 'La Plata': 2, 'San Carlos': 1, 'Villa Elisa': 1 } },
  { itemKey: 'medium-pot', name: 'Olla mediana', category: 'MISCELLANEOUS', quantities: { 'La Plata': 2, 'San Carlos': 1, 'Villa Elisa': 1 } },
  { itemKey: 'large-pot', name: 'Olla grande y más grande', category: 'MISCELLANEOUS', quantities: { 'La Plata': 0, 'San Carlos': 0, 'Villa Elisa': 1 } },
  { itemKey: 'chocolate-bowl', name: 'Bol para chocolate', category: 'MISCELLANEOUS', quantities: { 'La Plata': 2, 'San Carlos': 0, 'Villa Elisa': 1 } },
  { itemKey: 'chocolate-fountain', name: 'Cascada de chocolate', category: 'MISCELLANEOUS', quantities: { 'La Plata': 1, 'San Carlos': 0, 'Villa Elisa': 1 } },
  { itemKey: 'extension-cord', name: 'Alargue', category: 'MISCELLANEOUS', quantities: { 'La Plata': 2, 'San Carlos': 0, 'Villa Elisa': 0 } },
  { itemKey: 'pizza-cutter', name: 'Corta pizzas', category: 'MISCELLANEOUS', quantities: { 'La Plata': 2, 'San Carlos': 0, 'Villa Elisa': 0 } },
  { itemKey: 'small-wicker-basket', name: 'Paneras de mimbre pequeñas', category: 'MISCELLANEOUS', quantities: { 'La Plata': 14, 'San Carlos': 11, 'Villa Elisa': 10 } },
  { itemKey: 'large-wicker-basket', name: 'Paneras de mimbre grandes', category: 'MISCELLANEOUS', quantities: { 'La Plata': 6, 'San Carlos': 0, 'Villa Elisa': 0 } },
  { itemKey: 'round-table', name: 'Mesas redondas', category: 'MISCELLANEOUS', quantities: { 'La Plata': 12, 'San Carlos': 4, 'Villa Elisa': 10 } },
  { itemKey: 'salon-chair', name: 'Sillas para el salón', category: 'MISCELLANEOUS', quantities: { 'La Plata': 85, 'San Carlos': 90, 'Villa Elisa': 29 } }
];
