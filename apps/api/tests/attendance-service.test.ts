import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Types } from 'mongoose';
import { TimePunchType, WorkSessionStatus } from '@mym/shared';

const mocks = vi.hoisted(() => ({
  timePunchFindOne: vi.fn(),
  timePunchCreate: vi.fn(),
  timePunchUpdateOne: vi.fn(),
  workSessionFindOne: vi.fn(),
  workSessionFindById: vi.fn(),
  workSessionCreate: vi.fn(),
  workSessionFindOneAndUpdate: vi.fn(),
  userFindOne: vi.fn(),
  salonFindOne: vi.fn(),
  assignmentFindOne: vi.fn(),
  systemSettingFindOne: vi.fn()
}));

vi.mock('../src/modules/attendance/attendance.models', () => ({
  TimePunch: { findOne: mocks.timePunchFindOne, create: mocks.timePunchCreate, updateOne: mocks.timePunchUpdateOne },
  WorkSession: { findOne: mocks.workSessionFindOne, findById: mocks.workSessionFindById, create: mocks.workSessionCreate, findOneAndUpdate: mocks.workSessionFindOneAndUpdate },
  AttendanceIncident: { exists: vi.fn(), create: vi.fn(), updateOne: vi.fn() },
  AttendanceAdjustmentRequest: { exists: vi.fn(), findOne: vi.fn(), create: vi.fn() }
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
    mocks.assignmentFindOne.mockReturnValue({ sort: vi.fn().mockReturnValue(chainLean(null)) });
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

    it('accepts a check-in outside the geofence when the policy only flags it for review', async () => {
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
      expect(mocks.workSessionCreate).toHaveBeenCalledWith(expect.objectContaining({ requiresReview: true }));
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
  });
});
