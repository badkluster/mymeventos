import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { Role } from '@mym/shared';
import { generateAccessToken } from '../src/utils/tokens';

const mocks = vi.hoisted(() => ({
  userFindOne: vi.fn(), eventFindOne: vi.fn(), currentPlanIds: vi.fn(), planFindOne: vi.fn(), productionBlocked: vi.fn(),
  staffOpen: vi.fn(), contractFindOne: vi.fn(), pendingPayments: vi.fn(), expenseCount: vi.fn(), closureFindOneAndUpdate: vi.fn(),
  writeAuditLog: vi.fn(),
}));

vi.mock('../src/modules/users/user.model', () => ({ User: { findOne: mocks.userFindOne } }));
vi.mock('../src/modules/crm/crm.models', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    Event: { findOne: mocks.eventFindOne },
    EventStaffAssignment: { countDocuments: mocks.staffOpen },
    Contract: { findOne: mocks.contractFindOne },
    Payment: { countDocuments: mocks.pendingPayments },
  };
});
vi.mock('../src/modules/operations/operations.models', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, Expense: { countDocuments: mocks.expenseCount } };
});
vi.mock('../src/modules/production/production.models', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    ProductionPlan: { find: mocks.currentPlanIds, findOne: mocks.planFindOne },
    ProductionItem: { countDocuments: mocks.productionBlocked },
  };
});
vi.mock('../src/modules/event-closure/event-closure.model', () => ({ EventClosure: { findOneAndUpdate: mocks.closureFindOneAndUpdate } }));
vi.mock('../src/modules/audit/audit.service', () => ({ writeAuditLog: mocks.writeAuditLog }));

import app from '../src/app';
import { blockers, closureChecks } from '../src/modules/event-closure/event-closure.routes';

const adminId = '507f1f77bcf86cd799439011';
const salonManagerId = '507f1f77bcf86cd799439012';
const eventId = '507f1f77bcf86cd799439013';
const salonId = '507f1f77bcf86cd799439014';
const adminCookie = `accessToken=${generateAccessToken({ sub: adminId, username: 'admin' })}`;
const event = { _id: eventId, salonId, customerId: '507f1f77bcf86cd799439015', eventDate: new Date('2026-07-10T00:00:00.000Z') };

function leanChain(value: unknown) { return { select: vi.fn().mockReturnThis(), lean: vi.fn().mockResolvedValue(value) }; }
function contractChain(value: unknown) { return { sort: vi.fn().mockReturnThis(), select: vi.fn().mockReturnThis(), lean: vi.fn().mockResolvedValue(value) }; }
function eventChain(value: unknown) { return { populate: vi.fn().mockReturnThis(), lean: vi.fn().mockResolvedValue(value) }; }
function closureState() {
  const closure: any = {
    _id: '507f1f77bcf86cd799439016', operational: { status: 'open' }, financial: { status: 'open' }, administrative: { status: 'open' },
    set: vi.fn((stage: string, value: unknown) => { closure[stage] = value; }), save: vi.fn().mockResolvedValue(undefined),
  };
  return closure;
}

function validDefaults() {
  mocks.currentPlanIds.mockReturnValue({ distinct: vi.fn().mockResolvedValue(['507f1f77bcf86cd799439017']) });
  mocks.planFindOne.mockReturnValue(leanChain({ _id: '507f1f77bcf86cd799439017', status: 'closed' }));
  mocks.productionBlocked.mockResolvedValue(0); mocks.staffOpen.mockResolvedValue(0);
  mocks.contractFindOne.mockReturnValue(contractChain({ _id: '507f1f77bcf86cd799439018', status: 'approved', totalAmount: 1000, paidAmount: 1000, balanceAmount: 0 }));
  mocks.pendingPayments.mockResolvedValue(0);
  mocks.expenseCount.mockImplementation((query: any) => Promise.resolve(query.status === 'pending' ? 0 : 1));
}

describe('event closure blockers', () => {
  beforeEach(() => { vi.resetAllMocks(); validDefaults(); });

  it('only treats completed, cancelled, and no_show assignments as final', async () => {
    const closed = await closureChecks(event, { operational: { status: 'open' }, financial: { status: 'open' }, administrative: { status: 'open' } });
    expect(closed.operational.find((item) => item.id === 'staff-complete')).toMatchObject({ ok: true });
    expect(mocks.staffOpen).toHaveBeenCalledWith({ eventId, deletedAt: null, status: { $nin: ['completed', 'cancelled', 'no_show'] } });

    mocks.staffOpen.mockResolvedValue(1);
    const open = await closureChecks(event, { operational: { status: 'open' }, financial: { status: 'open' }, administrative: { status: 'open' } });
    expect(open.operational.find((item) => item.id === 'staff-complete')).toMatchObject({ ok: false, detail: '1 asignación(es) siguen abiertas.' });
  });

  it.each([
    ['A: ProductionPlan no cerrado', () => mocks.planFindOne.mockReturnValue(leanChain({ _id: 'plan', status: 'ready' })), 'operational', 'production-closed'],
    ['B: ProductionItem blocked', () => mocks.productionBlocked.mockResolvedValue(1), 'operational', 'production-blockers'],
    ['C: StaffAssignment assigned', () => mocks.staffOpen.mockResolvedValue(1), 'operational', 'staff-complete'],
    ['D: contrato no approved', () => mocks.contractFindOne.mockReturnValue(contractChain({ _id: 'contract', status: 'pending_approval', totalAmount: 1000, paidAmount: 1000, balanceAmount: 0 })), 'financial', 'contract-approved'],
    ['E: saldo contractual pendiente', () => mocks.contractFindOne.mockReturnValue(contractChain({ _id: 'contract', status: 'approved', totalAmount: 1000, paidAmount: 800, balanceAmount: 200 })), 'financial', 'balance-zero'],
    ['F: Payment pending que afecta saldo', () => mocks.pendingPayments.mockResolvedValue(1), 'financial', 'payments-resolved'],
    ['G: Expense pending', () => mocks.expenseCount.mockImplementation((query: any) => Promise.resolve(query.status === 'pending' ? 1 : 1)), 'financial', 'expenses-resolved'],
  ])('%s rechaza la etapa esperada', async (_name, arrange, stage, expectedBlocker) => {
    arrange();
    const closure = { operational: { status: stage === 'financial' ? 'closed' : 'open' }, financial: { status: 'open' }, administrative: { status: 'open' } };
    const checks = await closureChecks(event, closure);
    expect(blockers(checks[stage as 'operational' | 'financial']).map((item) => item.id)).toContain(expectedBlocker);
  });
});

describe('event closure API workflow and reopen dependencies', () => {
  beforeEach(() => {
    vi.resetAllMocks(); validDefaults();
    mocks.userFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue({ _id: adminId, roles: [Role.ADMIN], permissionOverrides: [], permissionDeniedOverrides: [], salonIds: [], active: true }) });
    mocks.eventFindOne.mockReturnValue(eventChain(event));
    const closure = closureState(); mocks.closureFindOneAndUpdate.mockImplementation(() => Promise.resolve(closure));
  });

  it('H: cierra operational → financial → administrative y reabrir operational reabre las dependientes', async () => {
    for (const stage of ['operational', 'financial', 'administrative']) {
      const response = await request(app).post(`/api/event-closures/${eventId}/${stage}/close`).set('Cookie', adminCookie).send({ notes: 'QA closure' });
      expect(response.status, JSON.stringify(response.body)).toBe(200);
      const closure = await mocks.closureFindOneAndUpdate.mock.results[0].value;
      expect(closure[stage].status).toBe('closed');
    }
    const reopened = await request(app).post(`/api/event-closures/${eventId}/operational/reopen`).set('Cookie', adminCookie).send({ reason: 'Prueba de reapertura' });
    expect(reopened.status, JSON.stringify(reopened.body)).toBe(200);
    const closure = await mocks.closureFindOneAndUpdate.mock.results[0].value;
    expect([closure.operational.status, closure.financial.status, closure.administrative.status]).toEqual(['open', 'open', 'open']);
  });

  it('impide que un SALON_MANAGER consulte o cierre un evento de otro salón por ObjectId', async () => {
    mocks.userFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue({ _id: salonManagerId, roles: [Role.SALON_MANAGER], permissionOverrides: [], permissionDeniedOverrides: [], salonIds: ['507f1f77bcf86cd799439099'], active: true }) });
    const cookie = `accessToken=${generateAccessToken({ sub: salonManagerId, username: 'salon-manager' })}`;

    const response = await request(app).get(`/api/event-closures/${eventId}`).set('Cookie', cookie);

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('SALON_SCOPE_FORBIDDEN');
    expect(mocks.closureFindOneAndUpdate).not.toHaveBeenCalled();
  });
});
