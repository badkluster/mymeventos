import { describe, expect, it } from 'vitest';
import { classifyClose, monthBounds, type ContractEvidence } from '../src/modules/reporting/commercial-goals.service';
import { SalonMonthlyGoal } from '../src/modules/reporting/salon-monthly-goal.model';
import { Types } from 'mongoose';

const event = { _id: 'event-1', salonId: 'salon-1', status: 'reserved' };
const approved: ContractEvidence = { _id: 'contract-1', eventId: 'event-1', salonId: 'salon-1', status: 'approved', approvedAt: '2026-10-12T12:00:00.000Z' };

describe('commercial close classification', () => {
  it('uses formal approval, never contract creation or a payment by itself', () => {
    expect(classifyClose(event, [{ ...approved, status: 'draft', approvedAt: null }]).kind).toBe('excluded');
    expect(classifyClose(event, [approved])).toMatchObject({ kind: 'closed', contractId: 'contract-1', closedAt: new Date(approved.approvedAt!) });
  });

  it('keeps the first approval across contract revisions', () => {
    const revision = { ...approved, _id: 'contract-2', approvedAt: '2026-11-05T12:00:00.000Z' };
    expect(classifyClose(event, [{ ...approved, status: 'superseded' }, revision])).toMatchObject({ kind: 'closed', contractId: 'contract-2', closedAt: new Date(approved.approvedAt!) });
  });

  it('excludes cancellations from the original close month', () => {
    expect(classifyClose({ ...event, status: 'cancelled' }, [approved]).kind).toBe('excluded');
    expect(classifyClose(event, [{ ...approved, status: 'cancelled' }]).kind).toBe('excluded');
  });

  it('flags conflicting active versions and salon mismatches', () => {
    expect(classifyClose(event, [approved, { ...approved, _id: 'contract-2' }]).kind).toBe('inconsistent');
    expect(classifyClose(event, [{ ...approved, salonId: 'salon-2' }]).kind).toBe('inconsistent');
    expect(classifyClose(event, [{ ...approved, status: 'superseded', approvedAt: null }, { ...approved, _id: 'contract-2' }]).kind).toBe('inconsistent');
    expect(classifyClose(event, [{ ...approved, status: 'superseded', deletedAt: '2026-11-01' }, { ...approved, _id: 'contract-2' }]).kind).toBe('inconsistent');
  });

  it('uses Buenos Aires month boundaries', () => {
    expect(monthBounds(2026, 10)).toEqual({ start: new Date('2026-10-01T03:00:00.000Z'), end: new Date('2026-11-01T03:00:00.000Z') });
    expect(monthBounds(2026, 12).end).toEqual(new Date('2027-01-01T03:00:00.000Z'));
  });

  it('requires a positive goal and declares a unique salon/month index', () => {
    const goal = new SalonMonthlyGoal({ salonId: new Types.ObjectId(), year: 2026, month: 11, target: 0, createdBy: new Types.ObjectId(), updatedBy: new Types.ObjectId() });
    expect(goal.validateSync()?.errors.target).toBeDefined();
    expect(SalonMonthlyGoal.schema.indexes()).toContainEqual([{ salonId: 1, year: 1, month: 1 }, expect.objectContaining({ unique: true })]);
  });
});
