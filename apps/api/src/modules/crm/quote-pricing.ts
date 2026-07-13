export type PricingMode = 'per_person' | 'fixed';

export function calculateCommercialQuote(values: Record<string, any>): Record<string, any> {
  const pricingMode: PricingMode = values.pricingMode === 'fixed' ? 'fixed' : 'per_person';
  const pricePerPerson = Number(values.pricePerPerson ?? 0);
  const fixedPrice = Number(values.fixedPrice ?? 0);
  const discountPercentage = Number(values.discountPercentage ?? 0);
  const finalPricePerPerson = Math.round(pricePerPerson * (1 - discountPercentage / 100));
  const finalFixedPrice = Math.round(fixedPrice * (1 - discountPercentage / 100));
  const guestCount = Number(values.guestCount ?? 0);
  const totalAmount = pricingMode === 'fixed' ? finalFixedPrice : Math.round(finalPricePerPerson * guestCount);
  const depositAmount = Number(values.depositAmount ?? 0);
  return { ...values, pricingMode, pricePerPerson, fixedPrice, discountPercentage, finalPricePerPerson, finalFixedPrice, totalAmount, depositAmount, balanceAmount: Math.max(0, totalAmount - depositAmount) };
}
