import { connectDatabase, disconnectDatabase } from '../db/connection';
import { PayrollSettlement } from '../modules/payroll/payroll.models';

const INDEX_NAME = 'payrollRunId_1_employeeId_1';
const partialFilterExpression = { payrollRunId: { $type: 'objectId' } };

async function migratePayrollSettlementRunEmployeeIndex(): Promise<void> {
  await connectDatabase();
  const db = PayrollSettlement.db.db;
  if (!db) throw new Error('La conexión a la base de datos no está disponible.');

  const collections = await db.listCollections({ name: PayrollSettlement.collection.name }, { nameOnly: true }).toArray();
  if (!collections.length) {
    console.info('La colección de liquidaciones todavía no existe; no hay índices para migrar.');
    return;
  }

  const indexes = await PayrollSettlement.collection.indexes();
  const current = indexes.find((index) => index.name === INDEX_NAME);
  const isCurrent = current?.unique
    && current.partialFilterExpression?.payrollRunId?.$type === 'objectId';
  if (isCurrent) {
    console.info('El índice de liquidaciones por lote ya está actualizado.');
    return;
  }

  const duplicateRuns = await PayrollSettlement.aggregate<{ _id: { payrollRunId: unknown; employeeId: unknown }; count: number }>([
    { $match: { payrollRunId: { $type: 'objectId' } } },
    { $group: { _id: { payrollRunId: '$payrollRunId', employeeId: '$employeeId' }, count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
    { $limit: 1 }
  ]);
  if (duplicateRuns.length) {
    throw new Error('No se puede actualizar el índice: existen liquidaciones duplicadas dentro de un mismo lote.');
  }

  if (current?.name) await PayrollSettlement.collection.dropIndex(current.name);
  await PayrollSettlement.collection.createIndex(
    { payrollRunId: 1, employeeId: 1 },
    { name: INDEX_NAME, unique: true, partialFilterExpression }
  );
  console.info('El índice de liquidaciones por lote fue actualizado.');
}

migratePayrollSettlementRunEmployeeIndex()
  .catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; })
  .finally(disconnectDatabase);
