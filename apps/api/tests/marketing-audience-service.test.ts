import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  leadFind: vi.fn(),
  leadCountDocuments: vi.fn(),
  customerFind: vi.fn(),
  customerCountDocuments: vi.fn(),
  quoteDistinct: vi.fn(),
  eventAggregate: vi.fn(),
  unsubscribeFind: vi.fn()
}));

function chain(result: unknown) {
  const thenable: any = {
    select: vi.fn(() => thenable),
    limit: vi.fn(() => thenable),
    lean: vi.fn().mockResolvedValue(result)
  };
  return thenable;
}

vi.mock('../src/modules/crm/crm.models', () => ({
  Lead: { find: mocks.leadFind, countDocuments: mocks.leadCountDocuments },
  Customer: { find: mocks.customerFind, countDocuments: mocks.customerCountDocuments },
  Event: { aggregate: mocks.eventAggregate },
  Quote: { distinct: mocks.quoteDistinct }
}));
vi.mock('../src/modules/marketing/marketing.models', () => ({
  MarketingUnsubscribe: { find: mocks.unsubscribeFind }
}));

import { resolveAudienceContacts } from '../src/modules/marketing/marketing-audience.service';

const adminScope = { isAdmin: true, salonIds: [] as string[] };

describe('marketing audience segmentation', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.leadCountDocuments.mockResolvedValue(0);
    mocks.customerCountDocuments.mockResolvedValue(0);
    mocks.unsubscribeFind.mockReturnValue({ select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([]) }) });
  });

  it('deduplicates the same email seen through both the lead and the customer source', async () => {
    mocks.leadFind.mockReturnValue(chain([{ _id: 'lead-1', email: 'Ana@Mail.com', firstName: 'Ana' }]));
    mocks.customerFind.mockReturnValue(chain([{ _id: 'cust-1', email: 'ana@mail.com', firstName: 'Ana' }]));

    const result = await resolveAudienceContacts({ sourceTypes: ['lead', 'customer'], scope: adminScope });

    expect(result.contacts).toHaveLength(1);
    expect(result.duplicatesRemoved).toBe(1);
  });

  it('excludes contacts whose email does not look valid instead of failing the whole segmentation', async () => {
    mocks.leadFind.mockReturnValue(chain([{ _id: 'lead-1', email: 'not-an-email' }, { _id: 'lead-2', email: 'valid@mail.com' }]));

    const result = await resolveAudienceContacts({ sourceTypes: ['lead'], scope: adminScope });

    expect(result.contacts.map((c) => c.email)).toEqual(['valid@mail.com']);
    expect(result.invalidEmailExcluded).toBe(1);
  });

  it('excludes any contact already present in the unsubscribe list, regardless of how it entered the audience', async () => {
    mocks.leadFind.mockReturnValue(chain([{ _id: 'lead-1', email: 'baja@mail.com' }]));
    mocks.unsubscribeFind.mockReturnValue({ select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([{ normalizedEmail: 'baja@mail.com' }]) }) });

    const result = await resolveAudienceContacts({ sourceTypes: ['lead'], scope: adminScope });

    expect(result.contacts).toHaveLength(0);
    expect(result.unsubscribedExcluded).toBe(1);
  });

  it('honors explicit per-contact exclusions and extra excluded emails from the campaign', async () => {
    mocks.leadFind.mockReturnValue(chain([
      { _id: 'lead-1', email: 'excluded-by-id@mail.com' },
      { _id: 'lead-2', email: 'excluded-by-email@mail.com' },
      { _id: 'lead-3', email: 'kept@mail.com' }
    ]));

    const result = await resolveAudienceContacts({
      sourceTypes: ['lead'],
      excludedMembers: [{ sourceType: 'lead', sourceId: 'lead-1' }],
      extraExcludedEmails: ['excluded-by-email@mail.com'],
      scope: adminScope
    });

    expect(result.contacts.map((c) => c.email)).toEqual(['kept@mail.com']);
    expect(result.manuallyExcluded).toBe(2);
  });

  it('scopes the lead query to the caller salons when the caller is not an admin', async () => {
    mocks.leadFind.mockReturnValue(chain([]));
    const salonId = '507f1f77bcf86cd799439099';

    await resolveAudienceContacts({ sourceTypes: ['lead'], scope: { isAdmin: false, salonIds: [salonId] } });

    const query = mocks.leadFind.mock.calls[0][0];
    const serialized = JSON.stringify(query);
    expect(serialized).toContain(salonId);
  });

  it('drops malformed salon ids instead of throwing, matching nothing rather than crashing the request', async () => {
    mocks.leadFind.mockReturnValue(chain([]));

    await expect(resolveAudienceContacts({ sourceTypes: ['lead'], scope: { isAdmin: false, salonIds: ['not-a-real-id'] } })).resolves.toBeTruthy();

    const query = mocks.leadFind.mock.calls[0][0];
    expect(JSON.stringify(query)).not.toContain('not-a-real-id');
  });

  it('includes manually added contacts alongside lead/customer sources', async () => {
    mocks.leadFind.mockReturnValue(chain([]));

    const result = await resolveAudienceContacts({
      sourceTypes: ['lead', 'manual'],
      manualRecipients: [{ email: 'manual@mail.com', firstName: 'Manual' }],
      scope: adminScope
    });

    expect(result.contacts).toHaveLength(1);
    expect(result.contacts[0]).toMatchObject({ sourceType: 'manual', email: 'manual@mail.com' });
  });
});
