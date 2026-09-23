import { Customer } from './crm.models';
import { MarketingAudience, MarketingCampaign } from '../marketing/marketing.models';
import { freezeCampaignSnapshots, prepareCampaignRecipients, processMarketingTick } from '../marketing/marketing-campaign.service';
import { renderBrandedEmail } from '../email/email-template.util';

const ARGENTINA_TIME_ZONE = 'America/Argentina/Buenos_Aires';

function argentinaParts(now: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: ARGENTINA_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { year: Number(values.year), month: Number(values.month), day: Number(values.day) };
}

/**
 * Reuses the existing Marketing campaign engine (freezeCampaignSnapshots →
 * prepareCampaignRecipients → processMarketingTick, the same three calls campaigns.routes.ts's
 * /send endpoint makes) instead of building a separate send path. One small "manual" audience
 * per day, containing exactly the customers whose birthday is today.
 */
export async function processBirthdayCampaignTick(now = new Date()): Promise<{ matched: number; campaignCreated: boolean; hasMore: boolean }> {
  const startedAt = Date.now();
  const { year, month, day } = argentinaParts(now);
  // The month/day match used to happen in Node (`getUTCMonth`/`getUTCDate` over every customer
  // who hasn't gotten this year's greeting yet — on most days of the year, that's nearly the
  // whole customer base with a birthDate, since only today's actual match gets excluded).
  // `$expr` pushes the identical comparison ($month/$dayOfMonth on a Date default to UTC, same
  // as getUTCMonth/getUTCDate) into MongoDB, so only today's real matches (typically 0) ever
  // cross into Node instead of the full not-yet-sent-this-year candidate set. No derived
  // birthMonth/birthDay field added — not needed for this, and $expr can't use a standard index
  // either way, so there was no index-based alternative to weigh against it.
  const todays: any[] = await Customer.find({
    deletedAt: null,
    birthDate: { $ne: null },
    email: { $nin: [null, ''] },
    $or: [{ birthdayGreetingSentYear: { $ne: year } }, { birthdayGreetingSentYear: { $exists: false } }],
    $expr: {
      $and: [
        { $eq: [{ $month: '$birthDate' }, month] },
        { $eq: [{ $dayOfMonth: '$birthDate' }, day] }
      ]
    }
  }).select('_id email firstName lastName fullName birthDate').lean();
  if (!todays.length) {
    const elapsedMs = Date.now() - startedAt;
    if (elapsedMs >= 500) console.warn(JSON.stringify({ event: 'birthday_campaign_tick_timing', elapsedMs, matched: 0 }));
    return { matched: 0, campaignCreated: false, hasMore: false };
  }

  const dateKey = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const audience = await MarketingAudience.create({
    name: `Cumpleaños ${dateKey}`,
    sourceTypes: ['manual'],
    isDynamic: false,
    manualRecipients: todays.map((customer) => ({
      email: customer.email,
      firstName: customer.firstName || customer.fullName?.split(' ')[0],
      lastName: customer.lastName,
      sourceType: 'manual'
    }))
  });

  const html = renderBrandedEmail({
    eyebrow: 'De parte de todo el equipo',
    heading: '¡Feliz cumpleaños, {{firstName}}!',
    intro: 'Queremos desearte un día espectacular. Gracias por ser parte de la familia M&M Eventos — esperamos poder acompañarte en muchas más celebraciones.'
  });

  const campaign = await MarketingCampaign.create({
    name: `Saludo de cumpleaños ${dateKey}`,
    status: 'draft',
    channel: 'email',
    subject: '¡Feliz cumpleaños de parte de M&M Eventos!',
    renderedHtml: html,
    renderedText: '¡Feliz cumpleaños, {{firstName}}! Queremos desearte un día espectacular. Gracias por ser parte de la familia M&M Eventos.',
    audienceId: audience._id
  });

  await freezeCampaignSnapshots(String(campaign._id));
  await prepareCampaignRecipients(String(campaign._id));
  await MarketingCampaign.updateOne({ _id: campaign._id }, { $set: { status: 'scheduled', scheduledAt: now, nextAttemptAt: now } });
  await processMarketingTick();

  await Customer.updateMany(
    { _id: { $in: todays.map((customer) => customer._id) } },
    { $set: { birthdayGreetingSentYear: year } }
  );

  const elapsedMs = Date.now() - startedAt;
  if (elapsedMs >= 500) {
    console.warn(JSON.stringify({ event: 'birthday_campaign_tick_timing', elapsedMs, matched: todays.length, campaignCreated: true }));
  }
  return { matched: todays.length, campaignCreated: true, hasMore: false };
}
