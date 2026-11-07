/** A plan entry can stay open after a global balance payment settles the contract. */
export function isContractFullyPaid(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const contract = value as { totalAmount?: unknown; paidAmount?: unknown };
  const total = Number(contract.totalAmount);
  const paid = Number(contract.paidAmount);
  return Number.isFinite(total) && total > 0 && Number.isFinite(paid) && paid >= total;
}
