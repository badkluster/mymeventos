import { connectDatabase, disconnectDatabase } from '../db/connection';
import { ensurePayrollSettlementRunEmployeeIndex } from '../modules/payroll/payroll.models';

async function migratePayrollSettlementRunEmployeeIndex(): Promise<void> {
  await connectDatabase();
  const state = await ensurePayrollSettlementRunEmployeeIndex();
  if (state === 'current') {
    console.info('El índice de liquidaciones por lote ya está actualizado.');
    return;
  }
  console.info('El índice de liquidaciones por lote fue actualizado.');
}

migratePayrollSettlementRunEmployeeIndex()
  .catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; })
  .finally(disconnectDatabase);
