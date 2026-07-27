import { describe, expect, it } from 'vitest';
import { Types } from 'mongoose';
import { ApiError } from '../src/middlewares/errorHandler';
import { EventClosure } from '../src/modules/event-closure/event-closure.model';
import { ProductionPlan } from '../src/modules/production/production.models';
import { dashboardMetricDefinitions } from '../src/modules/reporting/metric-catalog';

const objectId = () => new Types.ObjectId();

describe('production plan version compatibility', () => {
  it('marks legacy plans without a fingerprint instead of rejecting them', () => {
    const plan = new ProductionPlan({
      eventId: objectId(),
      salonId: objectId(),
      customerId: objectId(),
      eventDate: new Date('2026-08-10T03:00:00.000Z'),
      generatedBy: objectId(),
      sourceSnapshot: { event: { eventName: 'Cumpleaños' } },
    });

    expect(plan.validateSync()).toBeUndefined();
    expect(plan.sourceFingerprint).toBe('legacy');
    expect(plan.version).toBe(1);
    expect(plan.isCurrent).toBe(true);
  });

  it('keeps lineage fields available for audited regeneration', () => {
    const previous = objectId();
    const plan = new ProductionPlan({
      eventId: objectId(),
      salonId: objectId(),
      customerId: objectId(),
      eventDate: new Date('2026-08-10T03:00:00.000Z'),
      generatedBy: objectId(),
      sourceFingerprint: 'fingerprint-v2',
      sourceSnapshot: { event: { eventName: 'Cumpleaños' } },
      version: 2,
      supersedesPlanId: previous,
      regenerationReason: 'Cambió la cantidad de invitados.',
    });

    expect(plan.validateSync()).toBeUndefined();
    expect(plan.supersedesPlanId?.toString()).toBe(previous.toString());
    expect(plan.regenerationReason).toContain('invitados');
  });
});

describe('event closure lifecycle', () => {
  it('starts all closure stages open', () => {
    const closure = new EventClosure({
      eventId: objectId(),
      salonId: objectId(),
      createdBy: objectId(),
      updatedBy: objectId(),
    });

    expect(closure.validateSync()).toBeUndefined();
    expect(closure.operational.status).toBe('open');
    expect(closure.financial.status).toBe('open');
    expect(closure.administrative.status).toBe('open');
  });
});

describe('reporting metric semantics', () => {
  it('distinguishes current snapshots from period-attributed metrics', () => {
    const pendingLeads = dashboardMetricDefinitions.find((item) => item.id === 'leads.pending');
    const contracted = dashboardMetricDefinitions.find((item) => item.id === 'contracts.total');
    const expenses = dashboardMetricDefinitions.find((item) => item.id === 'expenses.paid');

    expect(pendingLeads?.attributionDate).toBe('current_snapshot');
    expect(contracted?.attributionDate).toBe('approvedAt');
    expect(expenses?.attributionDate).toBe('paidAt');
  });
});

describe('structured business errors', () => {
  it('preserves machine-readable blocker details', () => {
    const error = new ApiError(409, 'EVENT_CLOSURE_BLOCKED', 'Blocked', { blockers: [{ id: 'balance' }] });
    expect(error.details).toEqual({ blockers: [{ id: 'balance' }] });
  });
});
