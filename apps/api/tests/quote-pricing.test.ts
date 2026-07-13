import { describe, expect, it } from 'vitest';
import { calculateCommercialQuote } from '../src/modules/crm/quote-pricing';

describe('calculateCommercialQuote', () => {
  it('calcula un presupuesto por persona según invitados', () => {
    expect(calculateCommercialQuote({ pricingMode: 'per_person', pricePerPerson: 10000, discountPercentage: 10, guestCount: 80, depositAmount: 100000 })).toMatchObject({ finalPricePerPerson: 9000, totalAmount: 720000, balanceAmount: 620000 });
  });

  it('mantiene el precio total aunque cambie la cantidad de invitados', () => {
    const for80 = calculateCommercialQuote({ pricingMode: 'fixed', fixedPrice: 1000000, discountPercentage: 10, guestCount: 80, depositAmount: 200000 });
    const for100 = calculateCommercialQuote({ pricingMode: 'fixed', fixedPrice: 1000000, discountPercentage: 10, guestCount: 100, depositAmount: 200000 });
    expect(for80).toMatchObject({ finalFixedPrice: 900000, totalAmount: 900000, balanceAmount: 700000 });
    expect(for100.totalAmount).toBe(for80.totalAmount);
  });
});
