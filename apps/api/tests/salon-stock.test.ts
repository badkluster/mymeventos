import { describe, expect, it } from 'vitest';
import { salonStockNames, salonStockSeedItems } from '../src/modules/salons/salonStock.data';
import { SalonStockItem } from '../src/modules/salons/salonStockItem.model';

describe('salon stock', () => {
  it('validates stock items and rejects negative quantities', async () => {
    const base = {
      salonId: '507f1f77bcf86cd799439013',
      itemKey: 'dinner-plate',
      name: 'Plato playo',
      category: 'PLATES',
      unitOfMeasure: 'unidad'
    };

    await expect(new SalonStockItem({ ...base, currentQuantity: 98 }).validate()).resolves.toBeUndefined();
    await expect(new SalonStockItem({ ...base, currentQuantity: -1 }).validate()).rejects.toThrow();
  });

  it('contains the supplied inventory for all three existing salons', () => {
    expect(salonStockNames).toEqual(['La Plata', 'San Carlos', 'Villa Elisa']);
    expect(salonStockSeedItems).toHaveLength(48);
    expect(salonStockSeedItems.every((item) => salonStockNames.every((name) => Number.isInteger(item.quantities[name]) && item.quantities[name] >= 0))).toBe(true);
    expect(Object.fromEntries(salonStockNames.map((name) => [name, salonStockSeedItems.reduce((total, item) => total + item.quantities[name], 0)]))).toEqual({
      'La Plata': 978,
      'San Carlos': 876,
      'Villa Elisa': 953
    });

    const iceBuckets = salonStockSeedItems.find((item) => item.itemKey === 'small-ice-bucket-with-tongs');
    expect(iceBuckets?.quantities).toEqual({ 'La Plata': 9, 'San Carlos': 7, 'Villa Elisa': 10 });
  });
});
