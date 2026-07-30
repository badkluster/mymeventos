import type { Request } from 'express';
import { Types } from 'mongoose';
import { Permission } from '@mym/shared';
import { accessibleSalonIds, canAccessSalon, userHasPermission } from '../../middlewares/auth';
import { ApiError } from '../../middlewares/errorHandler';

export const REPORT_TIME_ZONE = 'America/Argentina/Buenos_Aires';
const ARGENTINA_OFFSET_MS = 3 * 60 * 60 * 1000;
const MAX_REPORT_DAYS = 370;

export type ReportPeriod = {
  from: Date;
  toExclusive: Date;
  previousFrom: Date;
  previousToExclusive: Date;
  fromDate: string;
  toDate: string;
  previousFromDate: string;
  previousToDate: string;
  timeZone: typeof REPORT_TIME_ZONE;
};

function argentinaDateKey(value: Date): string {
  return new Date(value.getTime() - ARGENTINA_OFFSET_MS).toISOString().slice(0, 10);
}

function dateAtArgentinaMidnight(value: string): Date {
  return new Date(`${value}T03:00:00.000Z`);
}

export function addDays(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function validDateKey(value?: string): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00.000Z`).getTime()));
}

export function parseReportPeriod(query: Record<string, unknown>, now = new Date()): ReportPeriod {
  const today = argentinaDateKey(now);
  const defaultFrom = `${today.slice(0, 8)}01`;
  const requestedFrom = typeof query.from === 'string' ? query.from : undefined;
  const requestedTo = typeof query.to === 'string' ? query.to : undefined;
  const fromDate = validDateKey(requestedFrom) ? requestedFrom : defaultFrom;
  const toDate = validDateKey(requestedTo) ? requestedTo : today;
  if (fromDate > toDate) throw new ApiError(400, 'REPORT_PERIOD_INVALID', 'La fecha inicial no puede ser posterior a la fecha final.');
  const from = dateAtArgentinaMidnight(fromDate);
  const toExclusive = dateAtArgentinaMidnight(addDays(toDate, 1));
  const durationDays = Math.round((toExclusive.getTime() - from.getTime()) / 86_400_000);
  if (durationDays > MAX_REPORT_DAYS) throw new ApiError(400, 'REPORT_PERIOD_TOO_LONG', `El período máximo permitido es de ${MAX_REPORT_DAYS} días.`);
  const previousToExclusive = new Date(from);
  const previousFrom = new Date(previousToExclusive.getTime() - durationDays * 86_400_000);
  return {
    from,
    toExclusive,
    previousFrom,
    previousToExclusive,
    fromDate,
    toDate,
    previousFromDate: argentinaDateKey(previousFrom),
    previousToDate: argentinaDateKey(new Date(previousToExclusive.getTime() - 1)),
    timeZone: REPORT_TIME_ZONE,
  };
}

export type ReportScope = {
  salonIds?: string[];
  selectedSalonId?: string;
  unrestricted: boolean;
  match: (field?: string) => Record<string, unknown>;
};

export function resolveReportScope(request: Request): ReportScope {
  const requestedSalonId = typeof request.query.salonId === 'string' && request.query.salonId ? request.query.salonId : undefined;
  if (requestedSalonId && !/^[0-9a-fA-F]{24}$/.test(requestedSalonId)) throw new ApiError(400, 'REPORT_SALON_INVALID', 'El salón seleccionado no es válido.');
  if (requestedSalonId && !canAccessSalon(request.user!, requestedSalonId)) throw new ApiError(403, 'SALON_SCOPE_FORBIDDEN');
  const selectedSalonId = requestedSalonId;
  const unrestricted = userHasPermission(request.user!, Permission.DASHBOARD_ALL_SALONS_VIEW);
  const allowedSalonIds = unrestricted ? undefined : accessibleSalonIds(request.user!);
  // Mongoose casts string IDs for find/countDocuments, but deliberately does not
  // cast aggregation pipelines. Returning ObjectIds here keeps the salon scope
  // identical for both query styles (dashboard financial metrics use aggregate).
  const selectedSalonObjectId = selectedSalonId ? new Types.ObjectId(selectedSalonId) : undefined;
  const allowedSalonObjectIds = (allowedSalonIds ?? [])
    .filter((id) => Types.ObjectId.isValid(id))
    .map((id) => new Types.ObjectId(id));
  return {
    salonIds: allowedSalonIds,
    selectedSalonId,
    unrestricted,
    match: (field = 'salonId') => {
      if (selectedSalonObjectId) return { [field]: selectedSalonObjectId };
      if (!unrestricted) return { [field]: { $in: allowedSalonObjectIds } };
      return {};
    },
  };
}

export function periodMatch(period: ReportPeriod, field: string, previous = false): Record<string, unknown> {
  return {
    [field]: {
      $gte: previous ? period.previousFrom : period.from,
      $lt: previous ? period.previousToExclusive : period.toExclusive,
    },
  };
}
