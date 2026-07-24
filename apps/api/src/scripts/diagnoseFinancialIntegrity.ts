import { env } from '../config/env';
import { connectDatabase, disconnectDatabase } from '../db/connection';
import { Contract, ContractAddendum, Payment } from '../modules/crm/crm.models';

/**
 * Read-only diagnostic for Phase 2 (financial integrity). Never writes to the database.
 * Reports, but does not fix, drift between the stored Contract totals and what the
 * consolidated formula in contract-financials.service.ts would compute today, plus any
 * Payment whose cumulative refunds exceed its own amount (the bug fixed in this phase).
 *
 * Intended to run only against the local/test environment configured for this repository.
 * Do not point MONGODB_URI at a production or shared remote database when running this script.
 */

function amount(value: unknown): number {
  return Number(value || 0);
}

async function diagnoseFinancialIntegrity(): Promise<void> {
  if (env.NODE_ENV === 'production') throw new Error('Este script no debe ejecutarse en producción. Corré solo contra el entorno local/test.');

  await connectDatabase();

  const contracts = await Contract.find({ deletedAt: null }).lean();
  const contractDrift: Array<Record<string, unknown>> = [];

  for (const contract of contracts as any[]) {
    const addendums = await ContractAddendum.find({ contractId: contract._id, deletedAt: null }).lean();
    const approvedAddendumsAmount = addendums.filter((item: any) => item.status === 'approved').reduce((sum: number, item: any) => sum + amount(item.totalAmount), 0);
    const expectedTotalAmount = amount(contract.baseAmount) + approvedAddendumsAmount - amount(contract.discountsAmount);

    const payments = await Payment.find({ contractId: contract._id, deletedAt: null }).lean();
    const expectedPaidAmount = Math.max(
      0,
      payments.reduce((sum: number, payment: any) => {
        if (payment.status !== 'paid' || !payment.affectsContractBalance) return sum;
        const value = amount(payment.amount);
        return sum + (payment.type === 'refund' ? -value : value);
      }, 0)
    );
    const expectedBalanceAmount = expectedTotalAmount - expectedPaidAmount;

    const storedTotalAmount = amount(contract.totalAmount);
    const storedPaidAmount = amount(contract.paidAmount);
    const storedBalanceAmount = amount(contract.balanceAmount);

    if (storedTotalAmount !== expectedTotalAmount || storedPaidAmount !== expectedPaidAmount || storedBalanceAmount !== expectedBalanceAmount) {
      contractDrift.push({
        contractId: contract._id.toString(),
        contractNumber: contract.contractNumber,
        stored: { totalAmount: storedTotalAmount, paidAmount: storedPaidAmount, balanceAmount: storedBalanceAmount },
        expected: { totalAmount: expectedTotalAmount, paidAmount: expectedPaidAmount, balanceAmount: expectedBalanceAmount }
      });
    }
  }

  const refundsByOriginal = new Map<string, number>();
  const refundPayments = await Payment.find({ type: 'refund', status: 'paid', deletedAt: null, refundedPaymentId: { $ne: null } }).lean();
  for (const refund of refundPayments as any[]) {
    const key = refund.refundedPaymentId.toString();
    refundsByOriginal.set(key, (refundsByOriginal.get(key) ?? 0) + amount(refund.amount));
  }
  const overRefunded: Array<Record<string, unknown>> = [];
  for (const [originalPaymentId, totalRefunded] of refundsByOriginal.entries()) {
    const original: any = await Payment.findOne({ _id: originalPaymentId, deletedAt: null }).lean();
    if (!original) continue;
    if (totalRefunded > amount(original.amount)) {
      overRefunded.push({ originalPaymentId, paymentNumber: original.paymentNumber, originalAmount: amount(original.amount), totalRefunded, originalStatus: original.status });
    }
  }

  console.info('--- Diagnóstico de integridad financiera (solo lectura) ---');
  console.info(`Contratos inspeccionados: ${contracts.length}`);
  console.info(`Contratos con diferencia entre lo almacenado y lo recalculado: ${contractDrift.length}`);
  if (contractDrift.length) console.info(JSON.stringify(contractDrift, null, 2));
  console.info(`Pagos originales reembolsados por encima de su propio monto: ${overRefunded.length}`);
  if (overRefunded.length) console.info(JSON.stringify(overRefunded, null, 2));
  console.info('--- Fin del diagnóstico. No se modificó ningún dato. ---');
}

diagnoseFinancialIntegrity()
  .catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; })
  .finally(disconnectDatabase);
