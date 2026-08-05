import { CatalogItemType, InventoryCategory, BeverageType } from '@mym/shared';
import { connectDatabase, disconnectDatabase } from '../db/connection';
import { CatalogItem } from '../modules/operations/operations.models';
import { ProductionRule } from '../modules/production/production.models';

// One-off draft seed, run manually (authorized 2026-08-05 against apps/api/.env's MONGODB_URI).
// Every rule ships with isActive: false — these are ballpark catering quantities, NOT validated
// against M&M Eventos' real numbers. They exist so the team has something concrete to review from
// /admin/production/rules (edit the quantity, then flip the toggle) instead of starting from zero.
// Safe to re-run: both CatalogItem and ProductionRule are upserted by name.

type DraftRule = {
  productName: string;
  productType: CatalogItemType;
  productCategory: InventoryCategory;
  beverageType?: BeverageType;
  unitOfMeasure: string;
  ruleName: string;
  sectionType: 'savory' | 'sweet' | 'beverages' | 'cake' | 'bakery' | 'kitchen' | 'bar' | 'miscellaneous';
  quantityPerGuest: number;
  wastePercentage: number;
};

const DRAFT_NOTES = 'Regla borrador (valores típicos de catering, sin validar con el equipo de M&M Eventos). Revisar la cantidad real antes de activarla — mientras isActive esté en false, no participa de ninguna generación de producción real.';

const DRAFT_RULES: DraftRule[] = [
  { productName: 'Empanadas', productType: CatalogItemType.FOOD, productCategory: InventoryCategory.FOOD, unitOfMeasure: 'unidad', ruleName: 'Empanadas por invitado (borrador)', sectionType: 'savory', quantityPerGuest: 4, wastePercentage: 5 },
  { productName: 'Pan / panificados', productType: CatalogItemType.FOOD, productCategory: InventoryCategory.FOOD, unitOfMeasure: 'unidad', ruleName: 'Pan por invitado (borrador)', sectionType: 'bakery', quantityPerGuest: 2, wastePercentage: 5 },
  { productName: 'Torta', productType: CatalogItemType.FOOD, productCategory: InventoryCategory.FOOD, unitOfMeasure: 'porción', ruleName: 'Torta por invitado (borrador)', sectionType: 'cake', quantityPerGuest: 1, wastePercentage: 0 },
  { productName: 'Vino', productType: CatalogItemType.BEVERAGE, productCategory: InventoryCategory.BEVERAGE, beverageType: BeverageType.ALCOHOLIC, unitOfMeasure: 'botella', ruleName: 'Vino por invitado (borrador)', sectionType: 'beverages', quantityPerGuest: 0.25, wastePercentage: 0 },
  { productName: 'Cerveza', productType: CatalogItemType.BEVERAGE, productCategory: InventoryCategory.BEVERAGE, beverageType: BeverageType.ALCOHOLIC, unitOfMeasure: 'botella', ruleName: 'Cerveza por invitado (borrador)', sectionType: 'beverages', quantityPerGuest: 0.5, wastePercentage: 0 },
  { productName: 'Gaseosa', productType: CatalogItemType.BEVERAGE, productCategory: InventoryCategory.BEVERAGE, beverageType: BeverageType.NON_ALCOHOLIC, unitOfMeasure: 'litro', ruleName: 'Gaseosa por invitado (borrador)', sectionType: 'beverages', quantityPerGuest: 0.3, wastePercentage: 0 },
  { productName: 'Agua mineral', productType: CatalogItemType.BEVERAGE, productCategory: InventoryCategory.BEVERAGE, beverageType: BeverageType.NON_ALCOHOLIC, unitOfMeasure: 'litro', ruleName: 'Agua mineral por invitado (borrador)', sectionType: 'beverages', quantityPerGuest: 0.2, wastePercentage: 0 },
  { productName: 'Hielo', productType: CatalogItemType.OTHER, productCategory: InventoryCategory.OTHER, unitOfMeasure: 'kg', ruleName: 'Hielo por invitado (borrador)', sectionType: 'miscellaneous', quantityPerGuest: 0.15, wastePercentage: 0 },
];

async function run(): Promise<void> {
  await connectDatabase();
  let catalogCreated = 0;
  let ruleCreated = 0;
  for (const draft of DRAFT_RULES) {
    const catalogItem = await CatalogItem.findOneAndUpdate(
      { name: draft.productName, deletedAt: null },
      { $setOnInsert: { name: draft.productName, type: draft.productType, category: draft.productCategory, beverageType: draft.beverageType, unitOfMeasure: draft.unitOfMeasure, active: true, notes: DRAFT_NOTES } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    if (catalogItem.createdAt?.getTime() === catalogItem.updatedAt?.getTime()) catalogCreated += 1;

    const rule = await ProductionRule.findOneAndUpdate(
      { name: draft.ruleName, deletedAt: null },
      {
        $setOnInsert: {
          name: draft.ruleName,
          productId: catalogItem._id,
          sectionType: draft.sectionType,
          quantityPerGuest: draft.quantityPerGuest,
          fixedQuantity: 0,
          roundingMode: 'ceil',
          wastePercentage: draft.wastePercentage,
          isActive: false,
          notes: DRAFT_NOTES
        }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    if (rule.createdAt?.getTime() === rule.updatedAt?.getTime()) ruleCreated += 1;
  }
  console.info(`CatalogItem creados: ${catalogCreated}/${DRAFT_RULES.length}. ProductionRule creadas: ${ruleCreated}/${DRAFT_RULES.length}. Todas con isActive: false — revisar y activar desde /admin/production/rules.`);
}

run().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }).finally(disconnectDatabase);
