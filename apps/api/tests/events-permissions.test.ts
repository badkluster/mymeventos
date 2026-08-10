import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { Permission, Role } from '@mym/shared';
import { generateAccessToken } from '../src/utils/tokens';

const mocks = vi.hoisted(() => ({
  userFindOne: vi.fn(),
  eventFindOne: vi.fn(),
  eventFind: vi.fn(),
  tablewareDeleteMany: vi.fn(),
  writeAuditLog: vi.fn(),
  syncEventSupplierExpenses: vi.fn(),
  eventExpenses: vi.fn(),
  productionPlanFindOne: vi.fn(),
  staffAssignmentExists: vi.fn(),
  staffAssignmentCreate: vi.fn(),
  staffAssignmentFindOne: vi.fn(),
  salonStockFind: vi.fn(),
  tablewareFind: vi.fn(),
  tablewareInsertMany: vi.fn()
}));

vi.mock('../src/modules/users/user.model', () => ({ User: { findOne: mocks.userFindOne, find: vi.fn() } }));
vi.mock('../src/modules/salons/salon.model', () => ({ Salon: { countDocuments: vi.fn(), exists: vi.fn(), find: vi.fn() } }));
vi.mock('../src/modules/salons/salonStockItem.model', () => ({ SalonStockItem: { find: mocks.salonStockFind }, salonStockCategories: ['PLATES', 'GLASSWARE', 'DRINKWARE', 'CUTLERY', 'MISCELLANEOUS'] }));
vi.mock('../src/modules/crm/eventTablewareAllocation.model', () => ({ EventTablewareAllocation: { find: mocks.tablewareFind, deleteMany: mocks.tablewareDeleteMany, insertMany: mocks.tablewareInsertMany } }));
vi.mock('../src/modules/crm/crm.models', () => ({
  Lead: {}, LeadActivity: { create: vi.fn() }, Customer: { findOne: vi.fn() }, ContactPerson: {},
  PackageTemplate: { find: vi.fn(), findOne: vi.fn(), exists: vi.fn() },
  VenuePackageRule: { find: vi.fn(), findOne: vi.fn(), findOneAndUpdate: vi.fn() },
  Quote: { findOne: vi.fn() }, QuoteRevision: {},
  Event: { findOne: mocks.eventFindOne, find: mocks.eventFind },
  EventStaffAssignment: { find: vi.fn(), findOne: mocks.staffAssignmentFindOne, exists: mocks.staffAssignmentExists, create: mocks.staffAssignmentCreate },
  CalendarItem: { findOneAndUpdate: vi.fn(), updateMany: vi.fn().mockResolvedValue({}) },
  QuoteRequest: { findOne: vi.fn(), countDocuments: vi.fn(), find: vi.fn(), create: vi.fn() },
  Contract: { findOne: vi.fn() }, ContractAddendum: {}, Payment: { countDocuments: vi.fn(), find: vi.fn(), findOne: vi.fn() }
}));
vi.mock('../src/modules/production/production.models', () => ({ ProductionPlan: { findOne: mocks.productionPlanFindOne } }));
vi.mock('../src/modules/audit/audit.service', () => ({ writeAuditLog: mocks.writeAuditLog }));
vi.mock('../src/modules/crm/quote-pdf.service', () => ({ generateAndUploadQuotePdf: vi.fn() }));
vi.mock('../src/modules/crm/event-supplier-expenses.service', () => ({ syncEventSupplierExpenses: mocks.syncEventSupplierExpenses, eventExpenses: mocks.eventExpenses }));

import app from '../src/app';

const adminId = '507f1f77bcf86cd799439011';
const managerId = '507f1f77bcf86cd799439012';
const eventId = '507f1f77bcf86cd799439013';
const salonId = '507f1f77bcf86cd799439014';
const adminCookie = `accessToken=${generateAccessToken({ sub: adminId, username: 'admin' })}`;
const managerCookie = `accessToken=${generateAccessToken({ sub: managerId, username: 'manager' })}`;

function chainLean(value: unknown) {
  return { lean: vi.fn().mockResolvedValue(value) };
}
function queryChain(value: unknown) {
  return { select: vi.fn().mockReturnThis(), lean: vi.fn().mockResolvedValue(value) };
}

describe('event cancellation permissions and reason', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.tablewareDeleteMany.mockResolvedValue({});
    mocks.eventFind.mockReturnValue(queryChain([]));
    mocks.productionPlanFindOne.mockResolvedValue(null);
  });

  it('rejects cancellation without a reason', async () => {
    mocks.userFindOne.mockReturnValue(chainLean({ _id: adminId, roles: [Role.ADMIN], permissionOverrides: [], salonIds: [], active: true }));
    mocks.eventFindOne.mockResolvedValue({ _id: eventId, salonId, status: 'confirmed', save: vi.fn().mockResolvedValue(undefined) });

    const response = await request(app).patch(`/api/events/${eventId}/status`).set('Cookie', adminCookie).send({ status: 'cancelled' });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('EVENT_CANCELLATION_REASON_REQUIRED');
  });

  it('cancels an event with a reason, storing it and releasing tableware allocations', async () => {
    const event: any = { _id: eventId, salonId, status: 'confirmed', save: vi.fn().mockResolvedValue(undefined) };
    mocks.userFindOne.mockReturnValue(chainLean({ _id: adminId, roles: [Role.ADMIN], permissionOverrides: [], salonIds: [], active: true }));
    mocks.eventFindOne.mockResolvedValue(event);

    const response = await request(app).patch(`/api/events/${eventId}/status`).set('Cookie', adminCookie).send({ status: 'cancelled', reason: 'El cliente canceló el evento.' });

    expect(response.status).toBe(200);
    expect(event.cancellationReason).toBe('El cliente canceló el evento.');
    expect(event.cancelledBy).toBe(adminId);
    expect(mocks.tablewareDeleteMany).toHaveBeenCalledWith({ eventId: event._id });
  });

  it('cancels the current production plan when the event is cancelled', async () => {
    const event: any = { _id: eventId, salonId, status: 'confirmed', save: vi.fn().mockResolvedValue(undefined) };
    const plan: any = { status: 'checked', save: vi.fn().mockResolvedValue(undefined) };
    mocks.userFindOne.mockReturnValue(chainLean({ _id: adminId, roles: [Role.ADMIN], permissionOverrides: [], salonIds: [], active: true }));
    mocks.eventFindOne.mockResolvedValue(event);
    mocks.productionPlanFindOne.mockResolvedValue(plan);

    const response = await request(app).patch(`/api/events/${eventId}/status`).set('Cookie', adminCookie).send({ status: 'cancelled', reason: 'El cliente canceló el evento.' });

    expect(response.status).toBe(200);
    expect(plan.status).toBe('cancelled');
    expect(plan.save).toHaveBeenCalled();
  });

  it('leaves an already closed production plan untouched when the event is cancelled', async () => {
    const event: any = { _id: eventId, salonId, status: 'confirmed', save: vi.fn().mockResolvedValue(undefined) };
    mocks.userFindOne.mockReturnValue(chainLean({ _id: adminId, roles: [Role.ADMIN], permissionOverrides: [], salonIds: [], active: true }));
    mocks.eventFindOne.mockResolvedValue(event);
    // production.service.ts#cancelCurrentProductionPlan filters status $nin ['closed','cancelled'] in
    // the query itself, so a closed plan simply never matches — asserting the mock received that filter.
    mocks.productionPlanFindOne.mockResolvedValue(null);

    const response = await request(app).patch(`/api/events/${eventId}/status`).set('Cookie', adminCookie).send({ status: 'cancelled', reason: 'El cliente canceló el evento.' });

    expect(response.status).toBe(200);
    expect(mocks.productionPlanFindOne).toHaveBeenCalledWith(expect.objectContaining({ eventId: event._id, status: { $nin: ['closed', 'cancelled'] } }));
  });

  it('rejects cancellation for a user whose EVENTS_CANCEL permission was explicitly revoked', async () => {
    mocks.userFindOne.mockReturnValue(chainLean({ _id: managerId, roles: [Role.MANAGER], permissionOverrides: [], permissionDeniedOverrides: [Permission.EVENTS_CANCEL], salonIds: [], active: true }));
    mocks.eventFindOne.mockResolvedValue({ _id: eventId, salonId, status: 'confirmed', save: vi.fn().mockResolvedValue(undefined) });

    const response = await request(app).patch(`/api/events/${eventId}/status`).set('Cookie', managerCookie).send({ status: 'cancelled', reason: 'Motivo válido.' });

    expect(response.status).toBe(403);
  });

  it('allows a non-cancellation status change without requiring a reason', async () => {
    const event: any = { _id: eventId, salonId, status: 'quoted', save: vi.fn().mockResolvedValue(undefined) };
    mocks.userFindOne.mockReturnValue(chainLean({ _id: adminId, roles: [Role.ADMIN], permissionOverrides: [], salonIds: [], active: true }));
    mocks.eventFindOne.mockResolvedValue(event);

    const response = await request(app).patch(`/api/events/${eventId}/status`).set('Cookie', adminCookie).send({ status: 'reserved' });

    expect(response.status).toBe(200);
    expect(event.status).toBe('reserved');
  });
});

describe('event venue/date time-slot availability', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.userFindOne.mockReturnValue(chainLean({ _id: adminId, roles: [Role.ADMIN], permissionOverrides: [], salonIds: [], active: true }));
  });

  it('rejects reserving an event whose time slot overlaps another reserved event at the same salon and day', async () => {
    const event: any = { _id: eventId, salonId, status: 'quoted', eventDate: new Date('2026-12-05T00:00:00.000Z'), startTime: '21:00', endTime: '23:00', save: vi.fn().mockResolvedValue(undefined) };
    mocks.eventFindOne.mockResolvedValue(event);
    mocks.eventFind.mockReturnValue(queryChain([{ eventDate: new Date('2026-12-05T00:00:00.000Z'), startTime: '22:00', endTime: '23:30', eventName: 'Otro cumpleaños' }]));

    const response = await request(app).patch(`/api/events/${eventId}/status`).set('Cookie', adminCookie).send({ status: 'reserved' });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('EVENT_VENUE_SLOT_CONFLICT');
    expect(event.status).toBe('quoted');
  });

  it('only considers reserved/confirmed events at the same salon and day as blocking', async () => {
    const event: any = { _id: eventId, salonId, status: 'quoted', eventDate: new Date('2026-12-05T00:00:00.000Z'), startTime: '21:00', endTime: '23:00', save: vi.fn().mockResolvedValue(undefined) };
    mocks.eventFindOne.mockResolvedValue(event);
    mocks.eventFind.mockReturnValue(queryChain([]));

    const response = await request(app).patch(`/api/events/${eventId}/status`).set('Cookie', adminCookie).send({ status: 'reserved' });

    expect(response.status).toBe(200);
    expect(mocks.eventFind).toHaveBeenCalledWith(expect.objectContaining({ salonId, status: { $in: ['reserved', 'confirmed'] }, _id: { $ne: eventId } }));
  });

  it('allows two events at the same salon and day when their time slots do not overlap', async () => {
    const event: any = { _id: eventId, salonId, status: 'quoted', eventDate: new Date('2026-12-05T00:00:00.000Z'), startTime: '13:00', endTime: '17:00', save: vi.fn().mockResolvedValue(undefined) };
    mocks.eventFindOne.mockResolvedValue(event);
    mocks.eventFind.mockReturnValue(queryChain([{ eventDate: new Date('2026-12-05T00:00:00.000Z'), startTime: '21:00', endTime: '05:00', eventName: 'Fiesta nocturna' }]));

    const response = await request(app).patch(`/api/events/${eventId}/status`).set('Cookie', adminCookie).send({ status: 'reserved' });

    expect(response.status).toBe(200);
    expect(event.status).toBe('reserved');
  });

  it('rejects an early event that overlaps a nocturnal event started the previous day', async () => {
    const event: any = { _id: eventId, salonId, status: 'quoted', eventDate: new Date('2026-07-11T00:00:00.000Z'), startTime: '03:00', endTime: '06:00', save: vi.fn().mockResolvedValue(undefined) };
    mocks.eventFindOne.mockResolvedValue(event);
    mocks.eventFind.mockReturnValue(queryChain([{ eventDate: new Date('2026-07-10T00:00:00.000Z'), startTime: '21:00', endTime: '05:00', eventName: 'Fiesta nocturna' }]));

    const response = await request(app).patch(`/api/events/${eventId}/status`).set('Cookie', adminCookie).send({ status: 'reserved' });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('EVENT_VENUE_SLOT_CONFLICT');
  });

  it('allows a slot that starts exactly when the previous event ends', async () => {
    const event: any = { _id: eventId, salonId, status: 'quoted', eventDate: new Date('2026-07-11T00:00:00.000Z'), startTime: '05:00', endTime: '08:00', save: vi.fn().mockResolvedValue(undefined) };
    mocks.eventFindOne.mockResolvedValue(event);
    mocks.eventFind.mockReturnValue(queryChain([{ eventDate: new Date('2026-07-10T00:00:00.000Z'), startTime: '21:00', endTime: '05:00', eventName: 'Fiesta nocturna' }]));

    const response = await request(app).patch(`/api/events/${eventId}/status`).set('Cookie', adminCookie).send({ status: 'reserved' });

    expect(response.status).toBe(200);
  });

  it('treats a candidate event with no recorded time as occupying the whole day', async () => {
    const event: any = { _id: eventId, salonId, status: 'quoted', eventDate: new Date('2026-12-05T00:00:00.000Z'), startTime: '13:00', endTime: '17:00', save: vi.fn().mockResolvedValue(undefined) };
    mocks.eventFindOne.mockResolvedValue(event);
    mocks.eventFind.mockReturnValue(queryChain([{ eventDate: new Date('2026-12-05T00:00:00.000Z'), eventName: 'Evento sin horario cargado' }]));

    const response = await request(app).patch(`/api/events/${eventId}/status`).set('Cookie', adminCookie).send({ status: 'reserved' });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('EVENT_VENUE_SLOT_CONFLICT');
  });

  it('does not run the venue check for non-locking status transitions', async () => {
    const event: any = { _id: eventId, salonId, status: 'quoted', eventDate: new Date('2026-12-05T00:00:00.000Z'), startTime: '21:00', endTime: '23:00', save: vi.fn().mockResolvedValue(undefined) };
    mocks.eventFindOne.mockResolvedValue(event);

    const response = await request(app).patch(`/api/events/${eventId}/status`).set('Cookie', adminCookie).send({ status: 'deposit_pending' });

    expect(response.status).toBe(200);
    expect(mocks.eventFind).not.toHaveBeenCalled();
  });
});

describe('event staff concurrent assignment', () => {
  beforeEach(() => { vi.resetAllMocks(); });

  it('rejects assigning the same staff user to an overlapping shift on another event', async () => {
    const staffId = '507f1f77bcf86cd799439018';
    mocks.userFindOne
      .mockReturnValueOnce(chainLean({ _id: adminId, roles: [Role.ADMIN], permissionOverrides: [], salonIds: [], active: true }))
      .mockReturnValueOnce(chainLean({ _id: staffId, roles: [Role.STAFF], salonIds: [salonId], active: true }));
    mocks.eventFindOne.mockReturnValue(chainLean({ _id: eventId, salonId, status: 'confirmed' }));
    mocks.staffAssignmentExists.mockImplementation((query: any) => Promise.resolve(
      query.eventId?.$ne === eventId && query.shiftStart?.$lt && query.shiftEnd?.$gt
        ? { _id: '507f1f77bcf86cd799439019' }
        : null,
    ));
    mocks.staffAssignmentCreate.mockResolvedValue({ _id: '507f1f77bcf86cd799439020' });

    const response = await request(app).post(`/api/events/${eventId}/staff`).set('Cookie', adminCookie).send({
      staffUserId: staffId, staffSubrole: 'WAITER', shiftStart: '2026-07-10T23:00:00.000Z', shiftEnd: '2026-07-11T05:00:00.000Z', status: 'assigned',
    });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('STAFF_ASSIGNMENT_TIME_CONFLICT');
    expect(mocks.staffAssignmentCreate).not.toHaveBeenCalled();
  });
});

describe('event staff lifecycle transitions', () => {
  const assignmentId = '507f1f77bcf86cd799439019';

  function prepareAssignment(status: string, assignmentSalonId = salonId) {
    const assignment: any = { _id: assignmentId, eventId, salonId: assignmentSalonId, status, save: vi.fn().mockResolvedValue(undefined) };
    mocks.userFindOne.mockReturnValue(chainLean({ _id: adminId, roles: [Role.ADMIN], permissionOverrides: [], salonIds: [], active: true }));
    mocks.eventFindOne.mockReturnValue(chainLean({ _id: eventId, salonId }));
    mocks.staffAssignmentFindOne.mockResolvedValue(assignment);
    return assignment;
  }

  beforeEach(() => { vi.resetAllMocks(); });

  it.each([
    ['complete', 'completed'],
    ['no-show', 'no_show'],
    ['cancel', 'cancelled'],
  ])('allows confirmed -> %s', async (path, expectedStatus) => {
    const assignment = prepareAssignment('confirmed');

    const response = await request(app).post(`/api/events/${eventId}/staff/${assignmentId}/${path}`).set('Cookie', adminCookie).send({});

    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(assignment.status).toBe(expectedStatus);
    expect(assignment.save).toHaveBeenCalledOnce();
    expect(mocks.writeAuditLog).toHaveBeenCalledWith(expect.anything(), `EVENT_STAFF_${expectedStatus.toUpperCase()}`, 'EventStaffAssignment', assignmentId, expect.objectContaining({ previousStatus: 'confirmed', status: expectedStatus }));
  });

  it('applies the same transition through the existing staff PATCH endpoint used by the web', async () => {
    const assignment = prepareAssignment('confirmed');

    const response = await request(app).patch(`/api/events/${eventId}/staff/${assignmentId}`).set('Cookie', adminCookie).send({ status: 'completed' });

    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(assignment.status).toBe('completed');
    expect(assignment.save).toHaveBeenCalledOnce();
  });

  it('allows confirmed -> checked_in -> completed', async () => {
    const assignment = prepareAssignment('confirmed');

    const checkedIn = await request(app).post(`/api/events/${eventId}/staff/${assignmentId}/check-in`).set('Cookie', adminCookie).send({});
    expect(checkedIn.status, JSON.stringify(checkedIn.body)).toBe(200);
    expect(assignment.status).toBe('checked_in');

    const completed = await request(app).post(`/api/events/${eventId}/staff/${assignmentId}/complete`).set('Cookie', adminCookie).send({});
    expect(completed.status, JSON.stringify(completed.body)).toBe(200);
    expect(assignment.status).toBe('completed');
  });

  it('rejects completed -> confirmed', async () => {
    const assignment = prepareAssignment('completed');

    const response = await request(app).post(`/api/events/${eventId}/staff/${assignmentId}/confirm`).set('Cookie', adminCookie).send({});

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('STAFF_ASSIGNMENT_INVALID_TRANSITION');
    expect(assignment.save).not.toHaveBeenCalled();
  });

  it('rejects an invalid lifecycle status before reaching the data layer', async () => {
    mocks.userFindOne.mockReturnValue(chainLean({ _id: adminId, roles: [Role.ADMIN], permissionOverrides: [], salonIds: [], active: true }));

    const response = await request(app).post(`/api/events/${eventId}/staff/${assignmentId}/status`).set('Cookie', adminCookie).send({ status: 'invalid' });

    expect(response.status).toBe(400);
    expect(mocks.eventFindOne).not.toHaveBeenCalled();
  });

  it('rejects a user without event update permission', async () => {
    mocks.userFindOne.mockReturnValue(chainLean({ _id: managerId, roles: [Role.MANAGER], permissionOverrides: [], permissionDeniedOverrides: [Permission.EVENTS_UPDATE], salonIds: [salonId], active: true }));

    const response = await request(app).post(`/api/events/${eventId}/staff/${assignmentId}/complete`).set('Cookie', managerCookie).send({});

    expect(response.status).toBe(403);
    expect(mocks.eventFindOne).not.toHaveBeenCalled();
  });

  it('rejects a staff assignment belonging to another salon', async () => {
    const assignment = prepareAssignment('confirmed', '507f1f77bcf86cd799439099');

    const response = await request(app).post(`/api/events/${eventId}/staff/${assignmentId}/complete`).set('Cookie', adminCookie).send({});

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('STAFF_ASSIGNMENT_SALON_SCOPE_FORBIDDEN');
    expect(assignment.save).not.toHaveBeenCalled();
  });
});

describe('event tableware concurrent availability', () => {
  const stockItemId = '507f1f77bcf86cd799439021';
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.userFindOne.mockReturnValue(chainLean({ _id: adminId, roles: [Role.ADMIN], permissionOverrides: [], salonIds: [], active: true }));
    mocks.eventFindOne.mockResolvedValue({ _id: eventId, salonId, eventDate: new Date('2026-07-10T00:00:00.000Z'), resourcePlanSnapshot: {}, save: vi.fn() });
    mocks.salonStockFind.mockReturnValue({ sort: vi.fn().mockReturnThis(), lean: vi.fn().mockResolvedValue([{ _id: stockItemId, salonId, name: 'Plato playo', currentQuantity: 100, unitOfMeasure: 'unidad' }]) });
    mocks.tablewareFind.mockReturnValue({ lean: vi.fn().mockResolvedValue([{ _id: 'allocation-other', eventId: '507f1f77bcf86cd799439022', salonId, salonStockItemId: stockItemId, source: 'salon_stock', quantity: 80, eventDay: '2026-07-10' }]) });
  });

  it('rejects the second allocation when total reservations would exceed physical stock', async () => {
    const response = await request(app).put(`/api/events/${eventId}/tableware`).set('Cookie', adminCookie).send({ salonItems: [{ stockItemId, quantity: 30 }], externalItems: [] });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('TABLEWARE_STOCK_INSUFFICIENT');
    expect(response.body.error.message).toContain('Disponible: 20');
    expect(mocks.tablewareDeleteMany).not.toHaveBeenCalled();
    expect(mocks.tablewareInsertMany).not.toHaveBeenCalled();
  });

  it('rejects negative quantities as input validation instead of returning 500', async () => {
    const response = await request(app).put(`/api/events/${eventId}/tableware`).set('Cookie', adminCookie).send({ salonItems: [{ stockItemId, quantity: -1 }], externalItems: [] });
    expect(response.status).toBe(400);
    expect(mocks.eventFindOne).not.toHaveBeenCalled();
  });
});

describe('event supplier financial synchronization', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.userFindOne.mockReturnValue(chainLean({ _id: adminId, roles: [Role.ADMIN], permissionOverrides: [], salonIds: [], active: true }));
  });

  it('rejects a confirmed supplier without a positive agreed amount before creating an expense', async () => {
    const response = await request(app).put(`/api/events/${eventId}/suppliers`).set('Cookie', adminCookie).send({ items: [{
      id: 'assignment-1',
      supplierId: '507f1f77bcf86cd799439015',
      status: 'confirmed',
      agreedAmount: 0,
    }] });

    expect(response.status).toBe(400);
    expect(mocks.syncEventSupplierExpenses).not.toHaveBeenCalled();
  });

  it('uses the dedicated synchronization service and audits the resulting expense', async () => {
    mocks.eventFindOne.mockReturnValue(chainLean({ _id: eventId, salonId }));
    mocks.syncEventSupplierExpenses.mockResolvedValue({
      event: { _id: eventId },
      assignments: [{ id: 'assignment-1' }],
      expenses: [{ _id: '507f1f77bcf86cd799439016' }],
      summary: { totalPaid: 85000, totalCancelled: 0, activeExpenseCount: 1, cancelledExpenseCount: 0 },
    });

    const response = await request(app).put(`/api/events/${eventId}/suppliers`).set('Cookie', adminCookie).send({ items: [{
      id: 'assignment-1',
      supplierId: '507f1f77bcf86cd799439015',
      serviceType: 'Fotografía',
      status: 'confirmed',
      agreedAmount: 85000,
    }] });

    expect(response.status).toBe(200);
    expect(mocks.syncEventSupplierExpenses).toHaveBeenCalledWith(expect.objectContaining({ eventId, userId: adminId }));
    expect(mocks.writeAuditLog).toHaveBeenCalledWith(expect.anything(), 'EVENT_SUPPLIERS_SYNC', 'Event', eventId, expect.objectContaining({ totalPaidExpenses: 85000 }));
  });

  it('requires supplier catalog access in addition to event update access', async () => {
    mocks.userFindOne.mockReturnValue(chainLean({ _id: managerId, roles: [Role.MANAGER], permissionOverrides: [], permissionDeniedOverrides: [Permission.SUPPLIERS_READ], salonIds: [], active: true }));

    const response = await request(app).put(`/api/events/${eventId}/suppliers`).set('Cookie', managerCookie).send({ items: [] });

    expect(response.status).toBe(403);
    expect(mocks.syncEventSupplierExpenses).not.toHaveBeenCalled();
  });

  it('preserves financial supplier assignments when the generic event editor sends a full resource plan', async () => {
    const originalAssignments = [{ id: 'original', supplierId: '507f1f77bcf86cd799439015', agreedAmount: 85000, status: 'confirmed' }];
    const event: any = { _id: eventId, salonId, status: 'confirmed', resourcePlanSnapshot: { supplierAssignments: originalAssignments, timelineItems: [] }, save: vi.fn().mockResolvedValue(undefined) };
    mocks.eventFindOne.mockResolvedValue(event);

    const response = await request(app).patch(`/api/events/${eventId}`).set('Cookie', adminCookie).send({ resourcePlanSnapshot: {
      timelineItems: [{ id: 'arrival', title: 'Llegada' }],
      supplierAssignments: [{ id: 'forged', supplierId: '507f1f77bcf86cd799439017', agreedAmount: 1, status: 'confirmed' }],
    } });

    expect(response.status).toBe(200);
    expect(event.resourcePlanSnapshot.timelineItems).toEqual([{ id: 'arrival', title: 'Llegada' }]);
    expect(event.resourcePlanSnapshot.supplierAssignments).toEqual(originalAssignments);
    expect(mocks.syncEventSupplierExpenses).not.toHaveBeenCalled();
  });

  it('does not allow clearing the resource plan to bypass supplier expense synchronization', async () => {
    const originalAssignments = [{ id: 'original', supplierId: '507f1f77bcf86cd799439015', agreedAmount: 85000, status: 'confirmed' }];
    const event: any = { _id: eventId, salonId, resourcePlanSnapshot: { supplierAssignments: originalAssignments }, save: vi.fn().mockResolvedValue(undefined) };
    mocks.eventFindOne.mockResolvedValue(event);

    const response = await request(app).patch(`/api/events/${eventId}`).set('Cookie', adminCookie).send({ resourcePlanSnapshot: null });

    expect(response.status).toBe(422);
    expect(event.resourcePlanSnapshot.supplierAssignments).toEqual(originalAssignments);
    expect(event.save).not.toHaveBeenCalled();
  });
});
