import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

const mocks = vi.hoisted(() => ({
  recipientFindOne: vi.fn(),
  recipientUpdateOne: vi.fn(),
  unsubscribeFindOneAndUpdate: vi.fn(),
  campaignUpdateOne: vi.fn()
}));

vi.mock('../src/modules/marketing/marketing.models', () => ({
  MarketingRecipient: { findOne: mocks.recipientFindOne, updateOne: mocks.recipientUpdateOne },
  MarketingUnsubscribe: { findOneAndUpdate: mocks.unsubscribeFindOneAndUpdate },
  MarketingCampaign: { updateOne: mocks.campaignUpdateOne }
}));

import app from '../src/app';

const token = 'a-very-unpredictable-token-1234567890';

function chainLean(value: unknown) {
  return { select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(value) }) };
}

describe('public unsubscribe flow', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.unsubscribeFindOneAndUpdate.mockResolvedValue({});
    mocks.recipientUpdateOne.mockResolvedValue({});
    mocks.campaignUpdateOne.mockResolvedValue({});
  });

  it('rejects an unknown or already-used unsubscribe token without revealing why', async () => {
    mocks.recipientFindOne.mockReturnValue(chainLean(null));

    const response = await request(app).get(`/api/public/marketing/unsubscribe/${token}`);

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('MARKETING_UNSUBSCRIBE_TOKEN_INVALID');
  });

  it('never reveals the full email address on the public lookup, only a masked version', async () => {
    mocks.recipientFindOne.mockReturnValue(chainLean({ email: 'ana.perez@example.com' }));

    const response = await request(app).get(`/api/public/marketing/unsubscribe/${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data.maskedEmail).not.toBe('ana.perez@example.com');
    expect(response.body.data.maskedEmail).toContain('@example.com');
  });

  it('confirming the unsubscribe records it and excludes the recipient from the campaign it came from', async () => {
    const recipient = { _id: 'recipient-1', email: 'ana.perez@example.com', sourceType: 'lead', sourceId: 'lead-1', campaignId: 'campaign-1', status: 'sent' };
    mocks.recipientFindOne.mockResolvedValue(recipient);

    const response = await request(app).post(`/api/public/marketing/unsubscribe/${token}`).send({ reason: 'too_many_emails' });

    expect(response.status).toBe(200);
    expect(mocks.unsubscribeFindOneAndUpdate).toHaveBeenCalledWith(
      { normalizedEmail: 'ana.perez@example.com' },
      expect.objectContaining({ $set: expect.objectContaining({ isActive: true, reason: 'too_many_emails' }) }),
      expect.objectContaining({ upsert: true })
    );
    expect(mocks.recipientUpdateOne).toHaveBeenCalledWith({ _id: 'recipient-1' }, { $set: { status: 'unsubscribed' } });
    expect(mocks.campaignUpdateOne).toHaveBeenCalledWith({ _id: 'campaign-1' }, { $inc: { unsubscribedCount: 1 } });
  });

  it('does not double-count an already-unsubscribed recipient if the confirmation link is opened twice', async () => {
    const recipient = { _id: 'recipient-1', email: 'ana.perez@example.com', sourceType: 'lead', sourceId: 'lead-1', campaignId: 'campaign-1', status: 'unsubscribed' };
    mocks.recipientFindOne.mockResolvedValue(recipient);

    const response = await request(app).post(`/api/public/marketing/unsubscribe/${token}`).send({});

    expect(response.status).toBe(200);
    expect(mocks.recipientUpdateOne).not.toHaveBeenCalled();
    expect(mocks.campaignUpdateOne).not.toHaveBeenCalled();
  });
});
