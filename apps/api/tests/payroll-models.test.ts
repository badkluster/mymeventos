import { describe, expect, it } from 'vitest';
import { Types } from 'mongoose';
import { PayrollConcept, PayrollProfile, PayrollSettlement, SalaryAdvance } from '../src/modules/payroll/payroll.models';

describe('Payroll models', () => {
  it('requires a versioned employee profile with a valid compensation type', async () => {
    await expect(new PayrollProfile({}).validate()).rejects.toThrow();
    await expect(new PayrollProfile({ employeeId: new Types.ObjectId(), compensationType: 'hourly', payrollFrequency: 'monthly', hourlyRateMinor: 5_000, effectiveFrom: new Date(), createdBy: new Types.ObjectId(), updatedBy: new Types.ObjectId() }).validate()).resolves.toBeUndefined();
  });

  it('requires a profile snapshot for an immutable settlement', async () => {
    await expect(new PayrollSettlement({ employeeId: new Types.ObjectId(), periodStart: new Date(), periodEnd: new Date(), settlementCode: 'LIQ-TEST', currency: 'ARS', calculationVersion: '1.0.0', createdBy: new Types.ObjectId(), updatedBy: new Types.ObjectId() }).validate()).rejects.toThrow();
  });

  it('keeps the run-employee uniqueness constraint out of individual settlements', () => {
    const index = PayrollSettlement.schema.indexes().find(([fields]) => fields.payrollRunId === 1 && fields.employeeId === 1);
    expect(index).toBeDefined();
    expect(index?.[1]).toMatchObject({
      unique: true,
      partialFilterExpression: { payrollRunId: { $type: 'objectId' } }
    });
    expect(index?.[1].sparse).toBeUndefined();
  });

  it('rejects invalid concept and advance amounts', async () => {
    await expect(new PayrollConcept({ code: 'X', name: 'Prueba', type: 'invalid', source: 'manual' }).validate()).rejects.toThrow();
    await expect(new SalaryAdvance({ employeeId: new Types.ObjectId(), date: new Date(), amountMinor: 0, reason: 'Adelanto', createdBy: new Types.ObjectId(), updatedBy: new Types.ObjectId() }).validate()).rejects.toThrow();
  });
});
