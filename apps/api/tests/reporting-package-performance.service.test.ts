import { describe, expect, it, vi } from 'vitest';
import { Role } from '@mym/shared';

const mocks = vi.hoisted(() => ({ contractFind: vi.fn() }));

vi.mock('../src/modules/crm/crm.models', () => ({
  CalendarItem: { findOneAndUpdate: vi.fn(), updateMany: vi.fn(), updateOne: vi.fn() },
  Contract: { find: mocks.contractFind },
  Event: {}, EventStaffAssignment: {}, Lead: { findOne: vi.fn() },
  Payment: { find: vi.fn(), findOne: vi.fn(), aggregate: vi.fn() }, Quote: {}
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

describe('package-performance report', () => {
  it('ranks approved contracts by package within each salon and exposes contracted value', async () => {
    mocks.contractFind.mockReturnValue(chainableLean([
      { _id: 'c1', salonId: { _id: 'salon-a', name: 'La Plata' }, contractMode: 'PACKAGE', commercialSnapshot: { packageName: 'Gala y Gourmet' }, totalAmount: 300000 },
      { _id: 'c2', salonId: { _id: 'salon-a', name: 'La Plata' }, contractMode: 'PACKAGE', commercialSnapshot: { packageName: 'Gala y Gourmet' }, totalAmount: 500000 },
      { _id: 'c3', salonId: { _id: 'salon-a', name: 'La Plata' }, contractMode: 'PACKAGE', commercialSnapshot: { packageName: 'Gold Service' }, totalAmount: 250000 },
      { _id: 'c4', salonId: { _id: 'salon-b', name: 'Villa Elisa' }, contractMode: 'PACKAGE', commercialSnapshot: { packageName: 'Exclusive Night' }, totalAmount: 400000 },
    ]));

    const result = await getReport(adminRequest({ from: '2026-01-01', to: '2026-12-31' }), 'package-performance');
    const gala = result.rows.find((row: any) => row.package === 'Gala y Gourmet');

    expect(mocks.contractFind).toHaveBeenCalledWith(expect.objectContaining({ status: 'approved' }));
    expect(gala).toMatchObject({ salon: 'La Plata', contractCount: 2, contractedAmount: 800000, averageTicket: 400000, rankInSalon: 1, salonShare: 66.66666666666666 });
    expect(result.summary.find((item: any) => item.id === 'contracts')?.value).toBe(4);
    expect(result.summary.find((item: any) => item.id === 'amount')?.value).toBe(1450000);
    expect(result.meta.attribution).toBe('approvedAt');
  });
});
