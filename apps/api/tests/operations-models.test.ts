import { describe, expect, it } from 'vitest';
import {
  CatalogItemType,
  ConsumptionRuleTarget,
  ExpenseSourceType,
  ExpenseStatus,
  InventoryAdjustmentType,
  InventoryCategory,
  InventoryItemType,
  RoundingMode,
  ServiceExtraType,
  SupplierCategory,
} from '@mym/shared';
import {
  CatalogItem,
  ConsumptionRule,
  Expense,
  InventoryAdjustment,
  InventoryItem,
  ServiceExtra,
  Supplier,
} from '../src/modules/operations/operations.models';

describe('Operations models', () => {
  it('validates suppliers with categories and active defaults', async () => {
    const supplier = new Supplier({ name: 'Distribuidora Centro', category: SupplierCategory.BEVERAGES });

    await expect(supplier.validate()).resolves.toBeUndefined();
    expect(supplier.active).toBe(true);
  });

  it('validates supplier expenses and rejects negative amounts', async () => {
    const validExpense = {
      eventId: '507f1f77bcf86cd799439011',
      salonId: '507f1f77bcf86cd799439012',
      supplierId: '507f1f77bcf86cd799439013',
      sourceType: ExpenseSourceType.SUPPLIER_ASSIGNMENT,
      sourceId: 'supplier-assignment-1',
      description: 'Servicio de fotografía',
      amount: 85000,
    };

    const expense = new Expense(validExpense);
    await expect(expense.validate()).resolves.toBeUndefined();
    expect(expense.status).toBe(ExpenseStatus.PAID);
    expect(expense.currency).toBe('ARS');
    await expect(new Expense({ ...validExpense, amount: -1 }).validate()).rejects.toThrow();
  });

  it('defines one unique financial record per event supplier assignment', () => {
    const financialIndex = Expense.schema.indexes().find(([fields]) => fields.eventId === 1 && fields.sourceType === 1 && fields.sourceId === 1 && fields.deletedAt === 1);
    expect(financialIndex?.[1]).toMatchObject({ unique: true });
  });

  it('rejects catalog items with invalid types', async () => {
    await expect(new CatalogItem({
      name: 'Gaseosa cola',
      type: CatalogItemType.BEVERAGE,
      category: InventoryCategory.BEVERAGE,
      unitOfMeasure: 'botella',
      unitCost: 1200,
    }).validate()).resolves.toBeUndefined();

    await expect(new CatalogItem({ name: 'Item inválido', type: 'INVALID', unitOfMeasure: 'unidad' }).validate()).rejects.toThrow();
  });

  it('validates service extras and inventory items', async () => {
    await expect(new ServiceExtra({ name: 'Hora extra DJ', type: ServiceExtraType.PER_HOUR, basePrice: 50000 }).validate()).resolves.toBeUndefined();
    await expect(new InventoryItem({
      name: 'Copas champagne',
      type: InventoryItemType.NON_CONSUMABLE,
      category: InventoryCategory.TABLEWARE,
      unitOfMeasure: 'unidad',
      currentQuantity: 120,
      minimumQuantity: 30,
    }).validate()).resolves.toBeUndefined();
  });

  it('requires positive adjustment quantity', async () => {
    await expect(new InventoryAdjustment({
      inventoryItemId: '507f1f77bcf86cd799439011',
      type: InventoryAdjustmentType.OUT,
      quantity: 0,
    }).validate()).resolves.toBeUndefined();

    await expect(new InventoryAdjustment({
      inventoryItemId: '507f1f77bcf86cd799439011',
      type: InventoryAdjustmentType.OUT,
      quantity: -1,
    }).validate()).rejects.toThrow();
  });

  it('validates consumption rules and rounding options', async () => {
    await expect(new ConsumptionRule({
      name: 'Bebida por adulto',
      target: ConsumptionRuleTarget.ADULTS_WITH_ALCOHOL,
      quantityPerTarget: 1.5,
      unitOfMeasure: 'litro',
      roundingMode: RoundingMode.PACKAGE_SIZE,
      packageSize: 2,
    }).validate()).resolves.toBeUndefined();

    await expect(new ConsumptionRule({
      name: 'Regla inválida',
      target: ConsumptionRuleTarget.TOTAL_GUESTS,
      quantityPerTarget: -1,
      unitOfMeasure: 'unidad',
    }).validate()).rejects.toThrow();
  });
});
