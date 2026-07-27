import { describe, expect, it } from 'vitest';
import { hasPermission, Permission, Role } from '@mym/shared';
import { calculateSettlement, roundMinutes, type ProfileSnapshot } from '../src/modules/payroll/payroll.calculation';
import { allocatePayrollExpenseMinor, calculationErrors } from '../src/modules/payroll/payroll.service';

const hourly: ProfileSnapshot = { compensationType: 'hourly', currency: 'ARS', hourlyRateMinor: 5_000, overtimeAfterMinutes: 480, overtimeMultiplier: 1.5, roundingRule: 'none' };
const monday = new Date('2026-07-27T12:00:00-03:00');
const session = (id: string, approvedMinutes: number, eventId?: string) => ({ id, approvedMinutes, startedAt: monday, eventId });

describe('payroll calculation engine', () => {
  it('calculates an hourly employee using approved minutes', () => {
    const result = calculateSettlement({ profile: hourly, sessions: [session('a', 120)] });
    expect(result.baseAmountMinor).toBe(10_000);
    expect(result.netAmountMinor).toBe(10_000);
  });

  it('calculates a daily employee by approved workday', () => {
    const result = calculateSettlement({ profile: { compensationType: 'daily', currency: 'ARS', dailyRateMinor: 12_000 }, sessions: [session('a', 20), session('b', 400)] });
    expect(result.baseAmountMinor).toBe(24_000);
  });

  it('uses the agreed monthly salary without inventing hours', () => {
    const result = calculateSettlement({ profile: { compensationType: 'monthly', currency: 'ARS', monthlySalaryMinor: 300_000 }, sessions: [] });
    expect(result.baseAmountMinor).toBe(300_000);
  });

  it('pays each distinct worked event for a per-event employee', () => {
    const result = calculateSettlement({ profile: { compensationType: 'per_event', currency: 'ARS', eventRateMinor: 25_000 }, sessions: [session('a', 60, 'event-1'), session('b', 90, 'event-1'), session('c', 30, 'event-2')] });
    expect(result.baseAmountMinor).toBe(50_000);
  });

  it('combines configured components for a mixed profile', () => {
    const result = calculateSettlement({ profile: { compensationType: 'mixed', currency: 'ARS', hourlyRateMinor: 4_000, eventRateMinor: 10_000, overtimeAfterMinutes: 480 }, sessions: [session('a', 60, 'event-1')] });
    expect(result.baseAmountMinor).toBe(14_000);
  });

  it('applies the overtime multiplier after the configured threshold', () => {
    const result = calculateSettlement({ profile: { ...hourly, hourlyRateMinor: 1_000, overtimeAfterMinutes: 60 }, sessions: [session('a', 120)] });
    expect(result.baseAmountMinor).toBe(1_000);
    expect(result.earningsAmountMinor).toBe(1_500);
  });

  it('uses approved minutes after an unpaid break was deducted by attendance review', () => {
    const result = calculateSettlement({ profile: hourly, sessions: [session('a', 420)] });
    expect(result.baseAmountMinor).toBe(35_000);
  });

  it('blocks an attendance-based calculation when no approved session is available', () => {
    expect(calculationErrors(hourly, [])).toHaveLength(1);
  });

  it('does not include a rejected attendance because only approved sessions are passed to the engine', () => {
    const approved = [session('approved', 60)];
    const result = calculateSettlement({ profile: hourly, sessions: approved });
    expect(result.items.every((item) => item.sourceId !== 'rejected')).toBe(true);
  });

  it('deducts a pending salary advance exactly once in the result', () => {
    const result = calculateSettlement({ profile: hourly, sessions: [session('a', 120)], advances: [{ id: 'advance-1', amountMinor: 2_500, reason: 'Adelanto', date: monday }] });
    expect(result.deductionsAmountMinor).toBe(2_500);
    expect(result.netAmountMinor).toBe(7_500);
  });

  it('adds a manual bonus as an earning', () => {
    const result = calculateSettlement({ profile: hourly, sessions: [session('a', 60)], manualItems: [{ conceptCode: 'BONUS', conceptName: 'Bonificación', conceptType: 'earning', source: 'bonus', quantity: 1, unit: 'amount', unitAmountMinor: 1_200, subtotalMinor: 1_200, reason: 'Cobertura adicional' }] });
    expect(result.earningsAmountMinor).toBe(1_200);
  });

  it('subtracts an authorized manual deduction', () => {
    const result = calculateSettlement({ profile: hourly, sessions: [session('a', 60)], manualItems: [{ conceptCode: 'OTHER_DEDUCTION', conceptName: 'Otro descuento', conceptType: 'deduction', source: 'manual', quantity: 1, unit: 'amount', unitAmountMinor: 500, subtotalMinor: 500, reason: 'Descuento autorizado' }] });
    expect(result.netAmountMinor).toBe(4_500);
  });

  it('keeps using the historical rate snapshot after a later profile change', () => {
    const historic = calculateSettlement({ profile: { ...hourly, hourlyRateMinor: 1_000 }, sessions: [session('a', 60)] });
    const current = calculateSettlement({ profile: { ...hourly, hourlyRateMinor: 9_000 }, sessions: [session('a', 60)] });
    expect(historic.baseAmountMinor).toBe(1_000);
    expect(current.baseAmountMinor).toBe(9_000);
  });

  it('is deterministic for a calculation retry of the same draft', () => {
    const input = { profile: hourly, sessions: [session('a', 120)], advances: [{ id: 'advance-1', amountMinor: 100, reason: 'Adelanto', date: monday }] };
    expect(calculateSettlement(input)).toEqual(calculateSettlement(input));
  });

  it('calculates an individual settlement input', () => {
    const result = calculateSettlement({ profile: hourly, sessions: [session('employee-a', 60)] });
    expect(result.items).toHaveLength(1);
  });

  it('calculates independent entries in a collective run', () => {
    const first = calculateSettlement({ profile: hourly, sessions: [session('employee-a', 60)] });
    const second = calculateSettlement({ profile: hourly, sessions: [session('employee-b', 120)] });
    expect(first.netAmountMinor + second.netAmountMinor).toBe(15_000);
  });

  it('rounds approved minutes according to the profile rule', () => {
    expect(roundMinutes(63, 'nearest_15')).toBe(60);
    expect(roundMinutes(68, 'nearest_15')).toBe(75);
  });

  it('applies the weekend multiplier using Argentina local time', () => {
    const saturday = new Date('2026-08-01T12:00:00-03:00');
    const result = calculateSettlement({ profile: { ...hourly, weekendMultiplier: 2 }, sessions: [{ ...session('a', 60), startedAt: saturday }] });
    expect(result.netAmountMinor).toBe(10_000);
  });

  it('allows a salon manager only when payroll access is explicitly granted', () => {
    expect(hasPermission(Role.SALON_MANAGER, Permission.PAYROLL_VIEW, [Permission.PAYROLL_VIEW])).toBe(true);
    expect(hasPermission(Role.SALON_MANAGER, Permission.PAYROLL_VIEW)).toBe(false);
  });

  it('grants staff only the self-service payroll permission', () => {
    expect(hasPermission(Role.STAFF, Permission.PAYROLL_SELF_READ)).toBe(true);
    expect(hasPermission(Role.STAFF, Permission.PAYROLL_VIEW)).toBe(false);
  });

  it('prorratea el gasto de la liquidación sin perder centavos', () => {
    const allocations = allocatePayrollExpenseMinor(10_001, [
      { salonId: 'salon-a', eventId: 'event-a', weight: 60 },
      { salonId: 'salon-b', eventId: 'event-b', weight: 40 }
    ]);
    expect(allocations.map((item) => item.amountMinor)).toEqual([6_000, 4_001]);
    expect(allocations.reduce((sum, item) => sum + item.amountMinor, 0)).toBe(10_001);
  });

  it('no genera importe para una liquidación neta en cero', () => {
    expect(allocatePayrollExpenseMinor(0, [{ salonId: 'salon-a', weight: 1 }])[0]?.amountMinor).toBe(0);
  });
});
