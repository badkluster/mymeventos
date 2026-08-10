import type { EventGuest } from '@/features/quotes/types';

export type GuestAgeGroup = 'adult' | 'child_1_4' | 'child_5_9' | 'minor_10_17';

type GuestAgeGroupMeta = {
  label: string;
  billingWeight: number;
  chipClassName: string;
  rowClassName: string;
  avatarClassName: string;
};

const guestAgeGroups: Record<GuestAgeGroup, GuestAgeGroupMeta> = {
  adult: { label: 'Adulto', billingWeight: 1, chipClassName: 'border-zinc-200 bg-white hover:border-amber-300 hover:bg-amber-50', rowClassName: 'hover:bg-zinc-50', avatarClassName: 'bg-zinc-100 text-zinc-500' },
  child_1_4: { label: '1 a 4 años · sin cargo', billingWeight: 0, chipClassName: 'border-sky-200 bg-sky-50 text-sky-950 hover:border-sky-300 hover:bg-sky-100', rowClassName: 'bg-sky-50/70 hover:bg-sky-100/80', avatarClassName: 'bg-sky-100 text-sky-700' },
  child_5_9: { label: '5 a 9 años · media tarifa', billingWeight: 0.5, chipClassName: 'border-violet-200 bg-violet-50 text-violet-950 hover:border-violet-300 hover:bg-violet-100', rowClassName: 'bg-violet-50/70 hover:bg-violet-100/80', avatarClassName: 'bg-violet-100 text-violet-700' },
  minor_10_17: { label: '10 a 17 años · menor', billingWeight: 1, chipClassName: 'border-teal-200 bg-teal-50 text-teal-950 hover:border-teal-300 hover:bg-teal-100', rowClassName: 'bg-teal-50/70 hover:bg-teal-100/80', avatarClassName: 'bg-teal-100 text-teal-700' }
};

export function guestAgeGroup(value?: string): GuestAgeGroup {
  return value === 'child_1_4' || value === 'child_5_9' || value === 'minor_10_17' ? value : 'adult';
}

export function guestAgeGroupMeta(value?: string): GuestAgeGroupMeta {
  return guestAgeGroups[guestAgeGroup(value)];
}

export function guestAgeGroupLabel(value?: string): string {
  return guestAgeGroupMeta(value).label;
}

export function guestBillingWeight(guest: Pick<EventGuest, 'ageGroup'>): number {
  return guestAgeGroupMeta(guest.ageGroup).billingWeight;
}

export function formatEquivalentGuests(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toLocaleString('es-AR', { maximumFractionDigits: 1 });
}
