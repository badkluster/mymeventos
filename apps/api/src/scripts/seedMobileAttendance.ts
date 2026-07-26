import { connectDatabase, disconnectDatabase } from '../db/connection';
import { Role, StaffEmploymentStatus, WorkSessionStatus, TimePunchType, TimePunchSource, AttendanceIncidentType, AttendanceIncidentStatus, AttendanceAdjustmentStatus } from '@mym/shared';
import { Salon } from '../modules/salons/salon.model';
import { User } from '../modules/users/user.model';
import { hashPassword } from '../utils/password';
import { TimePunch, WorkSession, AttendanceIncident, AttendanceAdjustmentRequest } from '../modules/attendance/attendance.models';

// Idempotent dev-only seed for the mobile staff app: a salon with a configured geofence,
// three staff accounts covering the three access states (enabled / disabled / inactive),
// and a completed + an active work session with punches, an incident and an adjustment
// request so every mobile/admin screen has real data to render against.
// Run with: pnpm --filter @mym/api seed:mobile-attendance
// Never run against production — this is meant for a local/dev MongoDB instance.

const DEMO_PASSWORD = 'MymDemo123!';

async function ensureSalonGeofence() {
  const salon: any = await Salon.findOne({ deletedAt: null }).sort({ displayOrder: 1 });
  if (!salon) throw new Error('No hay ningún salón cargado — corré primero "pnpm --filter @mym/api seed".');
  if (!salon.attendanceLocationRule?.latitude) {
    salon.attendanceLocationRule = { latitude: -34.9011, longitude: -57.9542, allowedRadiusMeters: 150, requireLocation: false, outsideAreaPolicy: 'flag' };
    await salon.save();
  }
  return salon;
}

async function upsertStaffUser(input: { username: string; firstName: string; lastName: string; active: boolean; mobileEnabled: boolean; salonId: string }) {
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  return User.findOneAndUpdate(
    { username: input.username },
    {
      $set: {
        username: input.username,
        firstName: input.firstName,
        lastName: input.lastName,
        roles: [Role.STAFF],
        primaryRole: Role.STAFF,
        active: input.active,
        canAccessBackoffice: false,
        salonIds: [input.salonId],
        primarySalonId: input.salonId,
        staffProfile: { employmentStatus: StaffEmploymentStatus.ACTIVE, staffCode: input.username.toUpperCase() },
        attendanceConfig: { enabled: input.mobileEnabled, canUseMobileApp: input.mobileEnabled, defaultWorkLocationSalonId: input.salonId }
      },
      $setOnInsert: { passwordHash }
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

async function seedCompletedSession(userId: string, salonId: string) {
  const startedAt = new Date(Date.now() - 26 * 60 * 60 * 1000);
  const endedAt = new Date(startedAt.getTime() + 6 * 60 * 60 * 1000);
  const checkIn: any = await TimePunch.findOneAndUpdate(
    { requestId: `demo-checkin-${userId}` },
    { $set: { userId, type: TimePunchType.CHECK_IN, source: TimePunchSource.MOBILE, clientOccurredAt: startedAt, serverReceivedAt: startedAt, effectiveAt: startedAt, requestId: `demo-checkin-${userId}`, salonId, location: { latitude: -34.9011, longitude: -57.9542, accuracy: 12 }, salonDistanceMeters: 0, locationValidationStatus: 'inside_allowed_area', networkStatus: 'online', createdBy: userId } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  const checkOut: any = await TimePunch.findOneAndUpdate(
    { requestId: `demo-checkout-${userId}` },
    { $set: { userId, type: TimePunchType.CHECK_OUT, source: TimePunchSource.MOBILE, clientOccurredAt: endedAt, serverReceivedAt: endedAt, effectiveAt: endedAt, requestId: `demo-checkout-${userId}`, salonId, location: { latitude: -34.9014, longitude: -57.954, accuracy: 15 }, salonDistanceMeters: 35, locationValidationStatus: 'inside_allowed_area', networkStatus: 'online', createdBy: userId } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  const session: any = await WorkSession.findOneAndUpdate(
    { userId, checkInPunchId: checkIn._id },
    { $set: { userId, salonId, status: WorkSessionStatus.COMPLETED, checkInPunchId: checkIn._id, checkOutPunchId: checkOut._id, startedAt, endedAt, workedMinutes: 360, payableMinutes: 360, attendanceClassification: 'on_time', createdBy: userId, updatedBy: userId } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  await TimePunch.updateMany({ _id: { $in: [checkIn._id, checkOut._id] } }, { workSessionId: session._id });

  await AttendanceIncident.findOneAndUpdate(
    { userId, workSessionId: session._id, type: AttendanceIncidentType.OTHER },
    { $setOnInsert: { userId, workSessionId: session._id, type: AttendanceIncidentType.OTHER, description: 'Demo: el lector de red se cortó a mitad de turno.', status: AttendanceIncidentStatus.PENDING, createdBy: userId, updatedBy: userId } },
    { upsert: true, setDefaultsOnInsert: true }
  );
  await AttendanceAdjustmentRequest.findOneAndUpdate(
    { userId, workSessionId: session._id },
    { $setOnInsert: { userId, workSessionId: session._id, reason: 'Demo: la salida real fue 20 minutos más tarde.', requestedStartAt: startedAt, requestedEndAt: new Date(endedAt.getTime() + 20 * 60 * 1000), status: AttendanceAdjustmentStatus.PENDING, originalSnapshot: { startedAt, endedAt, workedMinutes: 360, status: WorkSessionStatus.COMPLETED }, createdBy: userId, updatedBy: userId } },
    { upsert: true, setDefaultsOnInsert: true }
  );
  return session;
}

async function seedActiveSession(userId: string, salonId: string) {
  const startedAt = new Date(Date.now() - 90 * 60 * 1000);
  const checkIn: any = await TimePunch.findOneAndUpdate(
    { requestId: `demo-active-checkin-${userId}` },
    { $set: { userId, type: TimePunchType.CHECK_IN, source: TimePunchSource.MOBILE, clientOccurredAt: startedAt, serverReceivedAt: startedAt, effectiveAt: startedAt, requestId: `demo-active-checkin-${userId}`, salonId, location: { latitude: -34.9012, longitude: -57.9543, accuracy: 10 }, salonDistanceMeters: 8, locationValidationStatus: 'inside_allowed_area', networkStatus: 'online', createdBy: userId } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  const session = await WorkSession.findOneAndUpdate(
    { userId, status: WorkSessionStatus.ACTIVE },
    { $setOnInsert: { userId, salonId, status: WorkSessionStatus.ACTIVE, checkInPunchId: checkIn._id, startedAt, createdBy: userId, updatedBy: userId } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  await TimePunch.updateOne({ _id: checkIn._id }, { workSessionId: session._id });
  return session;
}

async function seed(): Promise<void> {
  await connectDatabase();
  const salon = await ensureSalonGeofence();
  const salonId = salon._id.toString();

  const enabledStaff = await upsertStaffUser({ username: 'mesero.demo', firstName: 'Mesero', lastName: 'Demo', active: true, mobileEnabled: true, salonId });
  await upsertStaffUser({ username: 'staff.sinapp', firstName: 'Sin Acceso', lastName: 'Móvil', active: true, mobileEnabled: false, salonId });
  await upsertStaffUser({ username: 'staff.inactivo', firstName: 'Personal', lastName: 'Inactivo', active: false, mobileEnabled: true, salonId });

  await seedCompletedSession(enabledStaff!._id.toString(), salonId);
  await seedActiveSession(enabledStaff!._id.toString(), salonId);

  console.info(
    `Datos de asistencia móvil preparados en el salón "${salon.name}".\n` +
    `Usuarios demo (contraseña "${DEMO_PASSWORD}"): mesero.demo (acceso móvil habilitado, con jornada activa + jornada completada + incidencia + solicitud de corrección), ` +
    `staff.sinapp (sin acceso móvil), staff.inactivo (usuario inactivo).`
  );
}

seed().then(disconnectDatabase).catch(async (error) => {
  console.error('Seed de asistencia móvil falló:', error);
  await disconnectDatabase();
  process.exitCode = 1;
});
