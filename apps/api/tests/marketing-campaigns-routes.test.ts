import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { Role } from '@mym/shared';
import { generateAccessToken } from '../src/utils/tokens';

const mocks = vi.hoisted(() => ({
  userFindOne: vi.fn(),
  campaignFindOne: vi.fn(),
  campaignFind: vi.fn(),
  campaignCountDocuments: vi.fn(),
  writeAuditLog: vi.fn(),
  cancelCampaign: vi.fn(),
  processMarketingTick: vi.fn()
}));

vi.mock('../src/modules/users/user.model', () => ({ User: { findOne: mocks.userFindOne } }));
vi.mock('../src/modules/marketing/marketing.models', () => ({
  MarketingCampaign: { findOne: mocks.campaignFindOne, find: mocks.campaignFind, countDocuments: mocks.campaignCountDocuments },
  MarketingRecipient: { find: vi.fn(), countDocuments: vi.fn() }
}));
vi.mock('../src/modules/audit/audit.service', () => ({ writeAuditLog: mocks.writeAuditLog }));
vi.mock('../src/modules/marketing/marketing-audience.service', () => ({ resolveAudienceContacts: vi.fn() }));
vi.mock('../src/modules/marketing/marketing-campaign.service', () => ({
  cancelCampaign: mocks.cancelCampaign,
  freezeCampaignSnapshots: vi.fn(),
  prepareCampaignRecipients: vi.fn(),
  processMarketingTick: mocks.processMarketingTick,
  retryFailedRecipients: vi.fn(),
  sendTestEmails: vi.fn()
}));

import app from '../src/app';

const adminId = '507f1f77bcf86cd799439011';
const salonManagerId = '507f1f77bcf86cd799439012';
const campaignId = '507f1f77bcf86cd799439013';
const ownSalonId = '507f1f77bcf86cd799439014';
const otherSalonId = '507f1f77bcf86cd799439015';
const adminCookie = `accessToken=${generateAccessToken({ sub: adminId, username: 'admin' })}`;
const salonManagerCookie = `accessToken=${generateAccessToken({ sub: salonManagerId, username: 'salon-manager' })}`;

function chainLean(value: unknown) {
  return { lean: vi.fn().mockResolvedValue(value) };
}

describe('marketing campaign routes — permissions and salon scope', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('rejects a SALON_MANAGER without CAMPAIGNS_SEND from sending a campaign, even for their own salon', async () => {
    mocks.userFindOne.mockReturnValue(chainLean({ _id: salonManagerId, roles: [Role.SALON_MANAGER], permissionOverrides: [], salonIds: [ownSalonId], active: true }));

    const response = await request(app).post(`/api/marketing/campaigns/${campaignId}/send`).set('Cookie', salonManagerCookie);

    expect(response.status).toBe(403);
    expect(mocks.campaignFindOne).not.toHaveBeenCalled();
  });

  it('rejects a SALON_MANAGER from reading a campaign scoped to a salon they do not manage', async () => {
    mocks.userFindOne.mockReturnValue(chainLean({ _id: salonManagerId, roles: [Role.SALON_MANAGER], permissionOverrides: [], salonIds: [ownSalonId], active: true }));
    mocks.campaignFindOne.mockReturnValue(chainLean({ _id: campaignId, name: 'Otro salón', status: 'draft', salonId: otherSalonId, deletedAt: null }));

    const response = await request(app).get(`/api/marketing/campaigns/${campaignId}`).set('Cookie', salonManagerCookie);

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('SALON_SCOPE_FORBIDDEN');
  });

  it('allows a SALON_MANAGER to read a campaign scoped to their own salon', async () => {
    mocks.userFindOne.mockReturnValue(chainLean({ _id: salonManagerId, roles: [Role.SALON_MANAGER], permissionOverrides: [], salonIds: [ownSalonId], active: true }));
    mocks.campaignFindOne.mockReturnValue(chainLean({ _id: campaignId, name: 'Mi salón', status: 'draft', salonId: ownSalonId, deletedAt: null }));

    const response = await request(app).get(`/api/marketing/campaigns/${campaignId}`).set('Cookie', salonManagerCookie);

    expect(response.status).toBe(200);
  });

  it('refuses to schedule a campaign for a date in the past', async () => {
    mocks.userFindOne.mockReturnValue(chainLean({ _id: adminId, roles: [Role.ADMIN], permissionOverrides: [], salonIds: [], active: true }));
    const campaign: any = { _id: campaignId, status: 'draft', subject: 'Asunto', renderedHtml: '<p>hola</p>', audienceId: 'aud-1', save: vi.fn() };
    mocks.campaignFindOne.mockResolvedValue(campaign);

    const response = await request(app)
      .post(`/api/marketing/campaigns/${campaignId}/schedule`)
      .set('Cookie', adminCookie)
      .send({ scheduledAt: '2000-01-01T00:00:00.000Z' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('MARKETING_CAMPAIGN_SCHEDULE_IN_PAST');
    expect(campaign.save).not.toHaveBeenCalled();
  });

  it('refuses to send a campaign that has no subject or rendered content yet', async () => {
    mocks.userFindOne.mockReturnValue(chainLean({ _id: adminId, roles: [Role.ADMIN], permissionOverrides: [], salonIds: [], active: true }));
    const campaign: any = { _id: campaignId, status: 'draft', subject: '', renderedHtml: '', audienceId: 'aud-1', save: vi.fn() };
    mocks.campaignFindOne.mockResolvedValue(campaign);

    const response = await request(app).post(`/api/marketing/campaigns/${campaignId}/send`).set('Cookie', adminCookie);

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('MARKETING_CAMPAIGN_MISSING_CONTENT');
    expect(mocks.processMarketingTick).not.toHaveBeenCalled();
  });

  it('lets an admin send a fully-configured draft campaign and kicks off one processing tick', async () => {
    mocks.userFindOne.mockReturnValue(chainLean({ _id: adminId, roles: [Role.ADMIN], permissionOverrides: [], salonIds: [], active: true }));
    const campaign: any = { _id: campaignId, status: 'draft', subject: 'Asunto', renderedHtml: '<p>hola</p>', audienceId: 'aud-1', save: vi.fn().mockResolvedValue(undefined) };
    mocks.campaignFindOne.mockResolvedValue(campaign);
    mocks.processMarketingTick.mockResolvedValue({ processedCampaignId: campaignId, sent: 1, failed: 0, completed: false });

    const response = await request(app).post(`/api/marketing/campaigns/${campaignId}/send`).set('Cookie', adminCookie);

    expect(response.status).toBe(200);
    expect(campaign.status).toBe('scheduled');
    expect(mocks.processMarketingTick).toHaveBeenCalledTimes(1);
  });
});
