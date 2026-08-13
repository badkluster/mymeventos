export type QuoteRuleState = { ruleConfigured?: boolean };

export function missingQuoteRuleSalonIds(
  salonIds: string[],
  rules: Record<string, QuoteRuleState>,
): string[] {
  return salonIds.filter((salonId) => rules[salonId]?.ruleConfigured === false);
}
