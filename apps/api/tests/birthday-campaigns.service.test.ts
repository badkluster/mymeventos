import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  customerFind: vi.fn(),
  customerUpdateMany: vi.fn(),
  audienceCreate: vi.fn(),
  campaignCreate: vi.fn(),
  campaignUpdateOne: vi.fn(),
  freezeCampaignSnapshots: vi.fn(),
  prepareCampaignRecipients: vi.fn(),
  processMarketingTick: vi.fn(),
  renderBrandedEmail: vi.fn()
}));

vi.mock('../src/modules/crm/crm.models', () => ({
  Customer: { find: mocks.customerFind, updateMany: mocks.customerUpdateMany }
}));
vi.mock('../src/modules/marketing/marketing.models', () => ({
  MarketingAudience: { create: mocks.audienceCreate },
  MarketingCampaign: { create: mocks.campaignCreate, updateOne: mocks.campaignUpdateOne }
}));
vi.mock('../src/modules/marketing/marketing-campaign.service', () => ({
  freezeCampaignSnapshots: mocks.freezeCampaignSnapshots,
  prepareCampaignRecipients: mocks.prepareCampaignRecipients,
  processMarketingTick: mocks.processMarketingTick
}));
vi.mock('../src/modules/email/email-template.util', () => ({ renderBrandedEmail: mocks.renderBrandedEmail }));

import { processBirthdayCampaignTick } from '../src/modules/crm/birthday-campaigns.service';

function leanQuery<T>(result: T) {
  const query: any = { select: vi.fn(), lean: vi.fn().mockResolvedValue(result) };
  query.select.mockReturnValue(query);
  return query;
}

describe('birthday campaign tick', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.customerFind.mockReturnValue(leanQuery([]));
    mocks.customerUpdateMany.mockResolvedValue(undefined);
    mocks.audienceCreate.mockResolvedValue({ _id: 'audience-1' });
    mocks.campaignCreate.mockResolvedValue({ _id: 'campaign-1' });
    mocks.campaignUpdateOne.mockResolvedValue(undefined);
    mocks.freezeCampaignSnapshots.mockResolvedValue(undefined);
    mocks.prepareCampaignRecipients.mockResolvedValue(undefined);
    mocks.processMarketingTick.mockResolvedValue(undefined);
    mocks.renderBrandedEmail.mockReturnValue('<html>birthday</html>');
  });

  it('keeps the original UTC month/day birthday comparison in Mongo and excludes customers already greeted this year', async () => {
    const now = new Date('2026-08-10T12:00:00.000Z');

    const result = await processBirthdayCampaignTick(now);

    expect(result).toEqual({ matched: 0, campaignCreated: false, hasMore: false });
    expect(mocks.customerFind).toHaveBeenCalledWith(expect.objectContaining({
      deletedAt: null,
      birthDate: { $ne: null },
      email: { $nin: [null, ''] },
      $or: [
        { birthdayGreetingSentYear: { $ne: 2026 } },
        { birthdayGreetingSentYear: { $exists: false } }
      ],
      $expr: {
        $and: [
          { $eq: [{ $month: '$birthDate' }, 8] },
          { $eq: [{ $dayOfMonth: '$birthDate' }, 10] }
        ]
      }
    }));
    expect(mocks.audienceCreate).not.toHaveBeenCalled();
    expect(mocks.customerUpdateMany).not.toHaveBeenCalled();
  });

  it('creates one campaign for the matched cohort and marks exactly that cohort as greeted', async () => {
    const matched = [{ _id: 'customer-1', email: 'customer@example.test', firstName: 'Ada', lastName: 'Lovelace', birthDate: new Date('1980-08-10T00:00:00.000Z') }];
    mocks.customerFind.mockReturnValue(leanQuery(matched));
    const now = new Date('2026-08-10T12:00:00.000Z');

    const result = await processBirthdayCampaignTick(now);

    expect(result).toEqual({ matched: 1, campaignCreated: true, hasMore: false });
    expect(mocks.audienceCreate).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Cumpleaños 2026-08-10',
      manualRecipients: [expect.objectContaining({ sourceType: 'manual' })]
    }));
    expect(mocks.customerUpdateMany).toHaveBeenCalledWith(
      { _id: { $in: ['customer-1'] } },
      { $set: { birthdayGreetingSentYear: 2026 } }
    );
  });
});
