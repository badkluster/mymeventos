import { describe, expect, it, vi } from 'vitest';
import { Role } from '@mym/shared';

const mocks = vi.hoisted(() => ({
  contractFind: vi.fn(),
}));

vi.mock('../src/modules/crm/crm.models', () => ({
  CalendarItem: { findOneAndUpdate: vi.fn(), updateMany: vi.fn(), updateOne: vi.fn() },
  Contract: { find: mocks.contractFind },
  Event: {},
  EventStaffAssignment: {},
  Lead: { findOne: vi.fn() },
  Payment: { find: vi.fn(), findOne: vi.fn(), aggregate: vi.fn() },
  Quote: {}
}));

import { getReport } from '../src/modules/reporting/reports.service';

function chainableLean(result: unknown) {
  const query: any = { populate: vi.fn(), select: vi.fn(), lean: vi.fn().mockResolvedValue(result) };
  query.populate.mockReturnValue(query);
  query.select.mockReturnValue(query);
  return query;
}

function adminRequest(query: Record<string, unknown>) {
  return { user: { id: 'user-1', roles: [Role.ADMIN], salonIds: [], managedSalonIds: [] }, query } as any;
}

describe('payment-control report', () => {
  it('sources cuotas pendientes from Contract/Event.paymentPlanSnapshot instead of Payment records', async () => {
    const dueInstallment = {
      id: 'installment-1', label: 'Cuota 1 de 1', amount: 500000, paidAmount: 0,
      status: 'scheduled', dueDate: '2026-08-15', paymentWindowStart: '2026-08-01', paymentWindowEnd: '2026-08-15', notes: ''
    };
    const outOfRangeInstallment = {
      id: 'installment-2', amount: 300000, paidAmount: 0, status: 'scheduled', dueDate: '2026-09-15', paymentWindowEnd: '2026-09-15'
    };
    const contract = {
      _id: 'contract-1', contractNumber: 'C-2026-00001', customerId: { fullName: 'Cliente de prueba' },
      eventId: { eventName: 'Evento de prueba', eventDate: '2026-08-20', paymentPlanSnapshot: [dueInstallment, outOfRangeInstallment] },
      salonId: { name: 'Salón de prueba' }, totalAmount: 1000000, paidAmount: 500000, balanceAmount: 500000,
      paymentPlanSnapshot: [dueInstallment, outOfRangeInstallment], observations: ''
    };
    mocks.contractFind.mockReturnValue(chainableLean([contract]));

    const result = await getReport(adminRequest({ from: '2026-08-01', to: '2026-08-31' }), 'payment-control');

    expect(mocks.contractFind).toHaveBeenCalledWith(expect.objectContaining({ status: 'approved' }));
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      number: 'C-2026-00001',
      installmentsRemaining: 2,
      installmentAmount: 500000,
      balanceAmount: 500000
    });
    expect(result.summary.find((item: any) => item.id === 'clients')?.value).toBe(1);
  });

  it('does not surface a contract whose plan has no installment due in the selected period', async () => {
    const contract = {
      _id: 'contract-2', contractNumber: 'C-2026-00002', customerId: { fullName: 'Otro cliente' },
      eventId: { eventName: 'Otro evento', eventDate: '2026-09-20', paymentPlanSnapshot: [{ id: 'x', amount: 100000, paidAmount: 0, status: 'scheduled', dueDate: '2026-09-15', paymentWindowEnd: '2026-09-15' }] },
      salonId: { name: 'Salón' }, totalAmount: 100000, paidAmount: 0, balanceAmount: 100000, paymentPlanSnapshot: [], observations: ''
    };
    mocks.contractFind.mockReturnValue(chainableLean([contract]));

    const result = await getReport(adminRequest({ from: '2026-08-01', to: '2026-08-31' }), 'payment-control');
    expect(result.rows).toHaveLength(0);
  });

  it('ignores installments already settled (paid/cancelled) even if their due date falls in range', async () => {
    const settled = { id: 'installment-3', amount: 200000, paidAmount: 200000, status: 'paid', dueDate: '2026-08-10', paymentWindowEnd: '2026-08-10' };
    const contract = {
      _id: 'contract-3', contractNumber: 'C-2026-00003', customerId: { fullName: 'Cliente saldado' },
      eventId: { eventName: 'Evento saldado', eventDate: '2026-08-12', paymentPlanSnapshot: [settled] },
      salonId: { name: 'Salón' }, totalAmount: 200000, paidAmount: 200000, balanceAmount: 0, paymentPlanSnapshot: [settled], observations: ''
    };
    mocks.contractFind.mockReturnValue(chainableLean([contract]));

    const result = await getReport(adminRequest({ from: '2026-08-01', to: '2026-08-31' }), 'payment-control');
    expect(result.rows).toHaveLength(0);
  });
});
