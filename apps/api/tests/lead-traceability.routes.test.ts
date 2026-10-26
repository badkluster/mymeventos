import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { errorHandler } from '../src/middlewares/errorHandler';

const mocks = vi.hoisted(() => ({
  leadFindOne: vi.fn(), activityCreate: vi.fn(), calendarCreate: vi.fn(), calendarFindOne: vi.fn(),
  calendarUpdateOne: vi.fn(), calendarUpdateMany: vi.fn(), calendarFindOneAndUpdate: vi.fn(),
  userFindOne: vi.fn(), audit: vi.fn(),
}));
vi.mock('../src/modules/crm/crm.models', () => ({
  Lead: { findOne: mocks.leadFindOne }, LeadActivity: { create: mocks.activityCreate },
  CalendarItem: { create: mocks.calendarCreate, findOne: mocks.calendarFindOne, updateOne: mocks.calendarUpdateOne, updateMany: mocks.calendarUpdateMany, findOneAndUpdate: mocks.calendarFindOneAndUpdate },
  Event: {}, Quote: {}, QuoteRequest: {},
}));
vi.mock('../src/modules/salons/salon.model', () => ({ Salon: {} }));
vi.mock('../src/modules/users/user.model', () => ({ User: { findOne: mocks.userFindOne } }));
vi.mock('../src/modules/audit/audit.service', () => ({ writeAuditLog: mocks.audit }));
vi.mock('../src/modules/audit/entity-change-history.service', () => ({ getEntityChangeHistory: vi.fn() }));
vi.mock('../src/middlewares/auth', () => ({
  requireAuth: (req: any, _res: any, next: any) => { req.user = { id: '507f1f77bcf86cd799439001', roles: ['SALON_MANAGER'], salonIds: ['507f1f77bcf86cd799439002'] }; next(); },
  requirePermission: () => (_req: any, _res: any, next: any) => next(),
  canAccessSalon: (user: any, salonId: string) => user.salonIds.includes(salonId),
  accessibleSalonIds: (user: any) => user.salonIds,
}));

import leadRoutes from '../src/modules/crm/leads.routes';

const leadId = '507f1f77bcf86cd799439003';
const salonId = '507f1f77bcf86cd799439002';
const otherSalonId = '507f1f77bcf86cd799439004';
const userId = '507f1f77bcf86cd799439005';
const visitId = '507f1f77bcf86cd799439006';
const app = express();
app.use(express.json());
app.use('/leads', leadRoutes);
app.use(errorHandler);

function lead() {
  return { _id: leadId, salonId, salonIds: [salonId, otherSalonId], fullName: 'Ana Pérez', source: 'whatsapp', status: 'new', save: vi.fn().mockResolvedValue(undefined) };
}

describe('lead commercial traceability routes (isolated mocks)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.leadFindOne.mockImplementation(() => Promise.resolve(lead()));
    mocks.activityCreate.mockResolvedValue({ _id: 'activity' });
    mocks.audit.mockResolvedValue(undefined);
    mocks.calendarUpdateOne.mockResolvedValue({});
    mocks.calendarUpdateMany.mockResolvedValue({});
    mocks.calendarFindOneAndUpdate.mockResolvedValue({});
    mocks.userFindOne.mockReturnValue({ select: () => ({ lean: async () => ({ roles: ['SALON_MANAGER'], salonIds: [salonId] }) }) });
  });

  it('keeps WhatsApp as channel and records Meta attribution explicitly as manual', async () => {
    const response = await request(app).patch(`/leads/${leadId}/attribution`).send({ origin: 'meta_ads_whatsapp', campaignCode: 'campaign-1' });
    expect(response.status).toBe(200);
    expect(response.body.data.lead.source).toBe('whatsapp');
    expect(response.body.data.lead.originAttribution).toBe('manual');
    expect(mocks.activityCreate).toHaveBeenCalledWith(expect.objectContaining({ type: 'attribution' }));
  });

  it('rejects visit scheduling in a salon outside the operator scope', async () => {
    const response = await request(app).post(`/leads/${leadId}/visits`).send({ startAt: '2026-11-10T15:00:00.000Z', salonId: otherSalonId, assignedToUserId: userId });
    expect(response.status).toBe(403);
    expect(mocks.calendarCreate).not.toHaveBeenCalled();
  });

  it('schedules a visit on the existing calendar and records its activity', async () => {
    mocks.calendarCreate.mockImplementation(async (input) => ({ ...input, _id: visitId }));
    const response = await request(app).post(`/leads/${leadId}/visits`).send({ startAt: '2026-11-10T15:00:00.000Z', salonId, assignedToUserId: userId });
    expect(response.status).toBe(201);
    expect(mocks.calendarCreate).toHaveBeenCalledWith(expect.objectContaining({ type: 'meeting', leadId, metadata: { commercialVisit: true, visitOutcome: 'scheduled' } }));
    expect(mocks.activityCreate).toHaveBeenCalledWith(expect.objectContaining({ type: 'visit', title: 'Visita agendada' }));
  });

  it('retains the old appointment in activity when rescheduled', async () => {
    const visit = { _id: visitId, salonId, assignedToUserId: userId, startAt: new Date('2026-11-10T15:00:00.000Z'), status: 'scheduled', metadata: { commercialVisit: true }, save: vi.fn().mockResolvedValue(undefined) };
    mocks.calendarFindOne.mockResolvedValue(visit);
    const response = await request(app).patch(`/leads/${leadId}/visits/${visitId}`).send({ action: 'rescheduled', startAt: '2026-11-12T15:00:00.000Z' });
    expect(response.status).toBe(200);
    expect(mocks.activityCreate).toHaveBeenCalledWith(expect.objectContaining({ metadata: expect.objectContaining({ before: expect.objectContaining({ startAt: new Date('2026-11-10T15:00:00.000Z') }) }) }));
  });

  it('uses one stable reminder key for repeated follow-ups', async () => {
    const response = await request(app).post(`/leads/${leadId}/follow-up`).send({ result: 'Volver a llamar', nextContactAt: '2026-11-10T15:00:00.000Z' });
    expect(response.status).toBe(200);
    expect(mocks.calendarFindOneAndUpdate).toHaveBeenCalledWith({ automationKey: `lead_next_contact:${leadId}` }, expect.anything(), expect.objectContaining({ upsert: true }));
  });

  it('requires a structured loss reason and cancels a pending follow-up', async () => {
    const invalid = await request(app).post(`/leads/${leadId}/mark-lost`).send({ lostReason: 'free text' });
    expect(invalid.status).toBe(400);
    const response = await request(app).post(`/leads/${leadId}/mark-lost`).send({ lostReason: 'price', observation: 'Fuera de presupuesto' });
    expect(response.status).toBe(200);
    expect(response.body.data.lead.status).toBe('lost');
    expect(mocks.calendarUpdateOne).toHaveBeenCalled();
  });
});
