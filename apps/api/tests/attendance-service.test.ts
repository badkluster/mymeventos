import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Types } from 'mongoose';
import { TimePunchType, WorkSessionStatus } from '@mym/shared';

const mocks = vi.hoisted(() => ({
  timePunchFindOne: vi.fn(),
  timePunchFindById: vi.fn(),
  timePunchCreate: vi.fn(),
  timePunchUpdateOne: vi.fn(),
  workSessionFindOne: vi.fn(),
  workSessionFindById: vi.fn(),
  workSessionCreate: vi.fn(),
  workSessionFindOneAndUpdate: vi.fn(),
  adjustmentExists: vi.fn(),
  adjustmentFindOne: vi.fn(),
  adjustmentCreate: vi.fn(),
  userFindOne: vi.fn(),
  salonFindOne: vi.fn(),
  assignmentFindOne: vi.fn(),
  systemSettingFindOne: vi.fn()
}));

vi.mock('../src/modules/attendance/attendance.models', () => ({
  TimePunch: { findOne: mocks.timePunchFindOne, findById: mocks.timePunchFindById, create: mocks.timePunchCreate, updateOne: mocks.timePunchUpdateOne },
  WorkSession: { findOne: mocks.workSessionFindOne, findById: mocks.workSessionFindById, create: mocks.workSessionCreate, findOneAndUpdate: mocks.workSessionFindOneAndUpdate },
  AttendanceIncident: { exists: vi.fn(), create: vi.fn(), updateOne: vi.fn() },
  AttendanceAdjustmentRequest: { exists: mocks.adjustmentExists, findOne: mocks.adjustmentFindOne, create: mocks.adjustmentCreate }
}));
vi.mock('../src/modules/users/user.model', () => ({ User: { findOne: mocks.userFindOne } }));
vi.mock('../src/modules/salons/salon.model', () => ({ Salon: { findOne: mocks.salonFindOne } }));
vi.mock('../src/modules/crm/crm.models', () => ({ EventStaffAssignment: { findOne: mocks.assignmentFindOne, findById: vi.fn() } }));
vi.mock('../src/modules/settings/systemSetting.model', () => ({ SystemSetting: { findOne: mocks.systemSettingFindOne, findOneAndUpdate: vi.fn() } }));

import * as attendanceService from '../src/modules/attendance/attendance.service';

function chainLean(value: unknown) {
  return { lean: vi.fn().mockResolvedValue(value) };
}
function chainSelectLean(value: unknown) {
  return { select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(value) }) };
}

const userId = new Types.ObjectId().toString();

describe('attendance.service', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.systemSettingFindOne.mockReturnValue(chainLean(null));
    mocks.userFindOne.mockReturnValue(chainLean({ _id: userId, active: true, staffProfile: {}, attendanceConfig: {} }));
    mocks.assignmentFindOne.mockReturnValue({ sort: vi.fn().mockReturnValue({ populate: vi.fn().mockReturnValue(chainLean(null)) }) });
    mocks.salonFindOne.mockReturnValue(chainSelectLean(null));
  });

  describe('checkIn', () => {
    it('creates a punch and an active session', async () => {
      mocks.timePunchFindOne.mockReturnValue(chainLean(null));
      const punchId = new Types.ObjectId();
      mocks.timePunchCreate.mockResolvedValue({ _id: punchId });
      const sessionId = new Types.ObjectId();
      mocks.workSessionCreate.mockResolvedValue({ _id: sessionId, userId, status: WorkSessionStatus.ACTIVE });
      mocks.timePunchUpdateOne.mockResolvedValue({});

      const result = await attendanceService.checkIn(userId, { requestId: 'req-checkin-1', clientOccurredAt: new Date(), networkStatus: 'online' });

      expect(result.idempotentReplay).toBe(false);
      expect(mocks.workSessionCreate).toHaveBeenCalledWith(expect.objectContaining({ userId, checkInPunchId: punchId, status: WorkSessionStatus.ACTIVE }));
      expect(mocks.timePunchUpdateOne).toHaveBeenCalledWith({ _id: punchId }, { workSessionId: sessionId });
    });

    it('replays the same result for a repeated requestId instead of creating a duplicate', async () => {
      const sessionId = new Types.ObjectId();
      mocks.timePunchFindOne.mockReturnValue(chainLean({ _id: new Types.ObjectId(), workSessionId: sessionId }));
      mocks.workSessionFindById.mockReturnValue(chainLean({ _id: sessionId, status: WorkSessionStatus.ACTIVE }));

      const result = await attendanceService.checkIn(userId, { requestId: 'req-checkin-1', clientOccurredAt: new Date(), networkStatus: 'online' });

      expect(result.idempotentReplay).toBe(true);
      expect(mocks.timePunchCreate).not.toHaveBeenCalled();
      expect(mocks.workSessionCreate).not.toHaveBeenCalled();
    });

    it('rejects a second check-in while a session is already active', async () => {
      mocks.timePunchFindOne.mockReturnValue(chainLean(null));
      const punchId = new Types.ObjectId();
      mocks.timePunchCreate.mockResolvedValue({ _id: punchId });
      const duplicateKeyError: any = new Error('duplicate');
      duplicateKeyError.code = 11000;
      mocks.workSessionCreate.mockRejectedValue(duplicateKeyError);
      mocks.timePunchUpdateOne.mockResolvedValue({});

      await expect(
        attendanceService.checkIn(userId, { requestId: 'req-checkin-2', clientOccurredAt: new Date(), networkStatus: 'online' })
      ).rejects.toMatchObject({ status: 409, code: 'ATTENDANCE_ALREADY_ACTIVE' });

      expect(mocks.timePunchUpdateOne).toHaveBeenCalledWith({ _id: punchId }, { rejected: true, rejectionReason: 'ALREADY_ACTIVE' });
    });

    it('blocks a check-in outside the salon geofence when the policy is "block"', async () => {
      mocks.timePunchFindOne.mockReturnValue(chainLean(null));
      mocks.salonFindOne.mockReturnValue(chainSelectLean({ attendanceLocationRule: { latitude: 0, longitude: 0, allowedRadiusMeters: 100, outsideAreaPolicy: 'block' } }));

      await expect(
        attendanceService.checkIn(userId, {
          requestId: 'req-checkin-3', clientOccurredAt: new Date(), networkStatus: 'online',
          salonId: new Types.ObjectId().toString(), location: { latitude: 10, longitude: 10 }
        })
      ).rejects.toMatchObject({ status: 403, code: 'ATTENDANCE_OUTSIDE_GEOFENCE' });

      expect(mocks.timePunchCreate).not.toHaveBeenCalled();
    });

    it('accepts a check-in outside the geofence without flagging it for review when using a legacy "flag" policy', async () => {
      mocks.timePunchFindOne.mockReturnValue(chainLean(null));
      mocks.salonFindOne.mockReturnValue(chainSelectLean({ attendanceLocationRule: { latitude: 0, longitude: 0, allowedRadiusMeters: 100, outsideAreaPolicy: 'flag' } }));
      const punchId = new Types.ObjectId();
      mocks.timePunchCreate.mockResolvedValue({ _id: punchId });
      mocks.workSessionCreate.mockResolvedValue({ _id: new Types.ObjectId(), status: WorkSessionStatus.ACTIVE });
      mocks.timePunchUpdateOne.mockResolvedValue({});

      const result = await attendanceService.checkIn(userId, {
        requestId: 'req-checkin-4', clientOccurredAt: new Date(), networkStatus: 'online',
        salonId: new Types.ObjectId().toString(), location: { latitude: 10, longitude: 10 }
      });

      expect(result.idempotentReplay).toBe(false);
      expect(mocks.workSessionCreate).toHaveBeenCalledWith(expect.objectContaining({ requiresReview: false }));
    });

    it('does not flag a check-in without GPS when the salon makes location optional', async () => {
      mocks.timePunchFindOne.mockReturnValue(chainLean(null));
      mocks.salonFindOne.mockReturnValue(chainSelectLean({ attendanceLocationRule: { latitude: 0, longitude: 0, requireLocation: false } }));
      const punchId = new Types.ObjectId();
      mocks.timePunchCreate.mockResolvedValue({ _id: punchId });
      mocks.workSessionCreate.mockResolvedValue({ _id: new Types.ObjectId(), status: WorkSessionStatus.ACTIVE });
      mocks.timePunchUpdateOne.mockResolvedValue({});

      await attendanceService.checkIn(userId, {
        requestId: 'req-checkin-optional-location', clientOccurredAt: new Date(), networkStatus: 'online', salonId: new Types.ObjectId().toString()
      });

      expect(mocks.workSessionCreate).toHaveBeenCalledWith(expect.objectContaining({ requiresReview: false }));
    });
  });

  describe('checkOut', () => {
    it('rejects a check-out when there is no active session', async () => {
      mocks.timePunchFindOne.mockReturnValue(chainLean(null));
      mocks.workSessionFindOne.mockResolvedValue(null);

      await expect(
        attendanceService.checkOut(userId, { requestId: 'req-checkout-1', clientOccurredAt: new Date(), networkStatus: 'online' })
      ).rejects.toMatchObject({ status: 409, code: 'ATTENDANCE_NO_ACTIVE_SESSION' });
    });

    it('completes the active session and computes workedMinutes on the server', async () => {
      const startedAt = new Date(Date.now() - 3 * 60 * 60 * 1000);
      const activeSession: any = { _id: new Types.ObjectId(), userId, status: WorkSessionStatus.ACTIVE, startedAt, breakMinutes: 0, requiresReview: false };
      mocks.timePunchFindOne.mockReturnValue(chainLean(null));
      mocks.workSessionFindOne.mockResolvedValue(activeSession);
      const punchId = new Types.ObjectId();
      mocks.timePunchCreate.mockResolvedValue({ _id: punchId, type: TimePunchType.CHECK_OUT });
      mocks.timePunchUpdateOne.mockResolvedValue({});
      mocks.workSessionFindOneAndUpdate.mockImplementation((_filter: unknown, update: Record<string, unknown>) => Promise.resolve({ ...activeSession, ...update }));

      const result = await attendanceService.checkOut(userId, { requestId: 'req-checkout-2', clientOccurredAt: new Date(), networkStatus: 'online' });

      expect(result.session.status).toBe(WorkSessionStatus.COMPLETED);
      expect(result.session.workedMinutes).toBeGreaterThanOrEqual(179);
      expect(result.session.workedMinutes).toBeLessThanOrEqual(181);
    });

    it('never produces a negative duration when the client-reported time precedes the check-in', async () => {
      const startedAt = new Date();
      const activeSession: any = { _id: new Types.ObjectId(), userId, status: WorkSessionStatus.ACTIVE, startedAt, breakMinutes: 0, requiresReview: false };
      mocks.timePunchFindOne.mockReturnValue(chainLean(null));
      mocks.workSessionFindOne.mockResolvedValue(activeSession);
      mocks.timePunchCreate.mockResolvedValue({ _id: new Types.ObjectId(), type: TimePunchType.CHECK_OUT });
      mocks.timePunchUpdateOne.mockResolvedValue({});
      mocks.workSessionFindOneAndUpdate.mockImplementation((_filter: unknown, update: Record<string, unknown>) => Promise.resolve({ ...activeSession, ...update }));

      const beforeCheckIn = new Date(startedAt.getTime() - 60_000);
      const result = await attendanceService.checkOut(userId, { requestId: 'req-checkout-3', clientOccurredAt: beforeCheckIn, networkStatus: 'online' });

      expect(result.session.workedMinutes).toBeGreaterThanOrEqual(0);
      expect(result.session.requiresReview).toBe(true);
    });

    it('clears a legacy optional-location review marker when a normal session is checked out', async () => {
      const startedAt = new Date(Date.now() - 3 * 60 * 60 * 1000);
      const activeSession: any = { _id: new Types.ObjectId(), userId, status: WorkSessionStatus.ACTIVE, startedAt, breakMinutes: 0, requiresReview: true, checkInPunchId: new Types.ObjectId() };
      mocks.timePunchFindOne.mockReturnValue(chainLean(null));
      mocks.workSessionFindOne.mockResolvedValue(activeSession);
      mocks.timePunchFindById.mockReturnValue(chainSelectLean({ networkStatus: 'online', clockSkewMs: 0, locationValidationStatus: 'location_unavailable' }));
      mocks.timePunchCreate.mockResolvedValue({ _id: new Types.ObjectId(), type: TimePunchType.CHECK_OUT });
      mocks.timePunchUpdateOne.mockResolvedValue({});
      mocks.workSessionFindOneAndUpdate.mockImplementation((_filter: unknown, update: Record<string, unknown>) => Promise.resolve({ ...activeSession, ...update }));

      const result = await attendanceService.checkOut(userId, { requestId: 'req-checkout-legacy-optional-location', clientOccurredAt: new Date(), networkStatus: 'online' });

      expect(result.session.status).toBe(WorkSessionStatus.COMPLETED);
      expect(result.session.requiresReview).toBe(false);
    });
  });

  describe('reviewSession', () => {
    it('resolves a flagged closed session and clears its review marker', async () => {
      const sessionId = new Types.ObjectId().toString();
      const reviewed = { _id: sessionId, status: WorkSessionStatus.COMPLETED, requiresReview: false };
      mocks.workSessionFindOneAndUpdate.mockResolvedValue(reviewed);

      const result = await attendanceService.reviewSession(sessionId, userId, WorkSessionStatus.COMPLETED, 'Ubicación verificada por administración.');

      expect(result).toBe(reviewed);
      expect(mocks.workSessionFindOneAndUpdate).toHaveBeenCalledWith(
        {
          _id: sessionId,
          status: { $ne: WorkSessionStatus.ACTIVE },
          $or: [{ requiresReview: true }, { status: WorkSessionStatus.UNDER_REVIEW }]
        },
        expect.objectContaining({
          status: WorkSessionStatus.COMPLETED,
          requiresReview: false,
          reviewedBy: userId,
          reviewNotes: 'Ubicación verificada por administración.'
        }),
        { new: true }
      );
    });

    it('rejects a session that is no longer pending review', async () => {
      mocks.workSessionFindOneAndUpdate.mockResolvedValue(null);

      await expect(
        attendanceService.reviewSession(new Types.ObjectId().toString(), userId, WorkSessionStatus.COMPLETED, 'Ya fue revisada.')
      ).rejects.toMatchObject({ status: 409, code: 'ATTENDANCE_SESSION_NOT_REVIEWABLE' });
    });
  });

  describe('applyAdministrativeAdjustment', () => {
    it('creates and approves an auditable correction from a closed jornada', async () => {
      const sessionId = new Types.ObjectId().toString();
      const adjustmentId = new Types.ObjectId();
      const startedAt = new Date('2026-09-02T21:50:00.000Z');
      const endedAt = new Date('2026-09-02T22:18:00.000Z');
      const requestedStartAt = new Date('2026-09-02T11:00:00.000Z');
      const session: any = {
        _id: sessionId,
        userId,
        status: WorkSessionStatus.COMPLETED,
        startedAt,
        endedAt,
        workedMinutes: 28,
        breakMinutes: 0,
        save: vi.fn().mockResolvedValue(undefined)
      };
      const adjustment: any = { _id: adjustmentId, status: 'pending', save: vi.fn().mockResolvedValue(undefined) };

      mocks.workSessionFindById.mockResolvedValueOnce(session).mockResolvedValueOnce(session);
      mocks.adjustmentExists.mockResolvedValue(null);
      mocks.adjustmentCreate.mockImplementation(async (input) => Object.assign(adjustment, input));
      mocks.adjustmentFindOne.mockResolvedValue(adjustment);

      const result = await attendanceService.applyAdministrativeAdjustment(sessionId, userId, {
        requestedStartAt,
        requestedEndAt: endedAt,
        reviewNotes: 'Entrada validada por administración.'
      });

      expect(result).toBe(adjustment);
      expect(mocks.adjustmentCreate).toHaveBeenCalledWith(expect.objectContaining({
        userId,
        workSessionId: sessionId,
        requestedStartAt,
        requestedEndAt: endedAt,
        createdBy: userId
      }));
      expect(session.startedAt).toEqual(requestedStartAt);
      expect(session.workedMinutes).toBe(678);
      expect(session.payableMinutes).toBe(678);
      expect(session.status).toBe(WorkSessionStatus.ADJUSTED);
      expect(adjustment.status).toBe('approved');
    });
  });
});
