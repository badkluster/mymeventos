import { MarketingSettings } from './marketing.models';

export async function getOrCreateMarketingSettings() {
  const existing = await MarketingSettings.findOne({ key: 'default' });
  if (existing) return existing;
  return MarketingSettings.create({ key: 'default' });
}
