import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  campaignFindOne: vi.fn(),
  campaignFindOneAndUpdate: vi.fn(),
  campaignUpdateOne: vi.fn(),
  recipientFind: vi.fn(),
  recipientInsertMany: vi.fn(),
  recipientCountDocuments: vi.fn(),
  resolveAudienceContacts: vi.fn()
}));

vi.mock('../src/modules/marketing/marketing.models', () => ({
  MarketingCampaign: { findOne: mocks.campaignFindOne, findOneAndUpdate: mocks.campaignFindOneAndUpdate, updateOne: mocks.campaignUpdateOne },
  MarketingRecipient: { find: mocks.recipientFind, insertMany: mocks.recipientInsertMany, countDocuments: mocks.recipientCountDocuments, findOneAndUpdate: vi.fn() },
  MarketingTemplate: { findOne: vi.fn() },
  Promotion: { findOne: vi.fn() },
  MarketingAudience: { findOne: vi.fn() },
  MarketingSendLog: { create: vi.fn() }
}));
vi.mock('../src/modules/marketing/marketing-audience.service', () => ({ resolveAudienceContacts: mocks.resolveAudienceContacts }));
vi.mock('../src/modules/marketing/marketing-settings.service', () => ({ getOrCreateMarketingSettings: vi.fn().mockResolvedValue({ senderName: 'M&M Eventos', senderEmail: 'no-reply@mym.test', companyName: 'M&M Eventos' }) }));
vi.mock('../src/modules/salons/salon.model', () => ({ Salon: { findOne: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(null) }) } }));

import { prepareCampaignRecipients } from '../src/modules/marketing/marketing-campaign.service';

function chain(result: unknown) {
  return { select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(result) }) };
}

const contacts = [
  { sourceType: 'lead', sourceId: 'lead-1', email: 'ana@mail.com', firstName: 'Ana' },
  { sourceType: 'lead', sourceId: 'lead-2', email: 'tomas@mail.com', firstName: 'Tomás' }
];

describe('prepareCampaignRecipients idempotency', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.campaignFindOne.mockResolvedValue({ _id: 'campaign-1', excludedRecipientEmails: [], audienceSnapshot: null, save: vi.fn().mockResolvedValue(undefined) });
    mocks.resolveAudienceContacts.mockResolvedValue({ contacts, totalMatched: 2, duplicatesRemoved: 0, invalidEmailExcluded: 0, unsubscribedExcluded: 0, manuallyExcluded: 0 });
    mocks.recipientInsertMany.mockResolvedValue(contacts);
  });

  it('inserts every newly-matched contact the first time it prepares recipients', async () => {
    mocks.recipientFind.mockReturnValue(chain([]));
    mocks.recipientCountDocuments.mockResolvedValue(2);

    const result = await prepareCampaignRecipients('campaign-1');

    expect(result.inserted).toBe(2);
    expect(mocks.recipientInsertMany).toHaveBeenCalledTimes(1);
    expect(mocks.recipientInsertMany.mock.calls[0][0]).toHaveLength(2);
  });

  it('does not re-insert contacts that were already prepared in an earlier call', async () => {
    mocks.recipientFind.mockReturnValue(chain([{ normalizedEmail: 'ana@mail.com' }, { normalizedEmail: 'tomas@mail.com' }]));
    mocks.recipientCountDocuments.mockResolvedValue(2);

    const result = await prepareCampaignRecipients('campaign-1');

    expect(result.inserted).toBe(0);
    expect(mocks.recipientInsertMany).not.toHaveBeenCalled();
  });

  it('only inserts the genuinely new contact when the audience grew between two calls', async () => {
    mocks.recipientFind.mockReturnValue(chain([{ normalizedEmail: 'ana@mail.com' }]));
    mocks.recipientCountDocuments.mockResolvedValue(2);

    const result = await prepareCampaignRecipients('campaign-1');

    expect(result.inserted).toBe(1);
    expect(mocks.recipientInsertMany.mock.calls[0][0]).toHaveLength(1);
    expect(mocks.recipientInsertMany.mock.calls[0][0][0]).toMatchObject({ normalizedEmail: 'tomas@mail.com' });
  });

  it('tolerates a concurrent insert (duplicate key) instead of failing the whole preparation', async () => {
    mocks.recipientFind.mockReturnValue(chain([]));
    mocks.recipientCountDocuments.mockResolvedValue(2);
    mocks.recipientInsertMany.mockRejectedValue(Object.assign(new Error('duplicate key'), { code: 11000 }));

    await expect(prepareCampaignRecipients('campaign-1')).resolves.toMatchObject({ inserted: 2 });
  });
});
