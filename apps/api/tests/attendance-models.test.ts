import { describe, expect, it } from 'vitest';
import { Types } from 'mongoose';
import { TimePunchType, WorkSessionStatus, AttendanceIncidentType, AttendanceAdjustmentStatus } from '@mym/shared';
import { TimePunch, WorkSession, AttendanceIncident, AttendanceAdjustmentRequest } from '../src/modules/attendance/attendance.models';

describe('Attendance models', () => {
  it('requires the core fields on a TimePunch', async () => {
    await expect(new TimePunch({}).validate()).rejects.toThrow();
    await expect(new TimePunch({
      userId: new Types.ObjectId(),
      type: TimePunchType.CHECK_IN,
      clientOccurredAt: new Date(),
      serverReceivedAt: new Date(),
      effectiveAt: new Date(),
      requestId: 'req-1'
    }).validate()).resolves.toBeUndefined();
  });

  it('rejects an unknown punch type', async () => {
    await expect(new TimePunch({
      userId: new Types.ObjectId(), type: 'nap', clientOccurredAt: new Date(), effectiveAt: new Date(), requestId: 'req-2'
    }).validate()).rejects.toThrow();
  });

  it('defaults WorkSession status to active and requires a check-in punch reference', async () => {
    const session = new WorkSession({ userId: new Types.ObjectId(), checkInPunchId: new Types.ObjectId(), startedAt: new Date() });
    await session.validate();
    expect(session.status).toBe(WorkSessionStatus.ACTIVE);
    await expect(new WorkSession({ userId: new Types.ObjectId(), startedAt: new Date() }).validate()).rejects.toThrow();
  });

  it('requires a description on an incident', async () => {
    await expect(new AttendanceIncident({ userId: new Types.ObjectId(), type: AttendanceIncidentType.OTHER }).validate()).rejects.toThrow();
    await expect(new AttendanceIncident({ userId: new Types.ObjectId(), type: AttendanceIncidentType.OTHER, description: 'No pude marcar salida' }).validate()).resolves.toBeUndefined();
  });

  it('defaults an adjustment request to pending and requires a reason', async () => {
    const request = new AttendanceAdjustmentRequest({ userId: new Types.ObjectId(), workSessionId: new Types.ObjectId(), reason: 'Olvidé marcar la salida' });
    await request.validate();
    expect(request.status).toBe(AttendanceAdjustmentStatus.PENDING);
    await expect(new AttendanceAdjustmentRequest({ userId: new Types.ObjectId(), workSessionId: new Types.ObjectId() }).validate()).rejects.toThrow();
  });
});
