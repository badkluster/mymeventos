export const PAYROLL_CALCULATION_VERSION = '1.0.0';

export type ProfileSnapshot = {
  compensationType: 'hourly' | 'daily' | 'monthly' | 'per_event' | 'mixed';
  currency: string;
  hourlyRateMinor?: number;
  dailyRateMinor?: number;
  monthlySalaryMinor?: number;
  eventRateMinor?: number;
  overtimeAfterMinutes?: number;
  overtimeMultiplier?: number;
  nightMultiplier?: number;
  weekendMultiplier?: number;
  nightStartHour?: number;
  nightEndHour?: number;
  graceMinutes?: number;
  roundingRule?: string;
};

export type ApprovedSessionInput = {
  id: string;
  startedAt: Date | string;
  approvedMinutes: number;
  eventId?: string;
};

export type CalculationItem = {
  conceptCode: string;
  conceptName: string;
  conceptType: 'earning' | 'deduction';
  source: 'attendance' | 'overtime' | 'event' | 'bonus' | 'advance' | 'reimbursement' | 'manual' | 'adjustment';
  sourceId?: string;
  quantity: number;
  unit: string;
  unitAmountMinor: number;
  subtotalMinor: number;
  description?: string;
  isManual?: boolean;
  reason?: string;
};

export type ManualCalculationItem = Omit<CalculationItem, 'isManual'> & { isManual?: boolean };
export type PendingAdvanceInput = { id: string; amountMinor: number; reason: string; date: Date | string };
export type CalculationResult = {
  items: CalculationItem[];
  baseAmountMinor: number;
  earningsAmountMinor: number;
  deductionsAmountMinor: number;
  grossAmountMinor: number;
  netAmountMinor: number;
  details: {
    sessions: Array<{ id: string; approvedMinutes: number; roundedMinutes: number; normalMinutes: number; overtimeMinutes: number; multiplier: number }>;
    warnings: string[];
    formula: string;
  };
};

function minorForMinutes(minutes: number, rateMinor: number): number {
  return Math.round((minutes * rateMinor) / 60);
}

function quantityHours(minutes: number): number {
  return Math.round((minutes / 60) * 100) / 100;
}

function roundingStep(rule?: string): { step: number; direction: 'nearest' | 'floor' | 'ceil' } | null {
  const match = /^(nearest|floor|ceil)_(5|15)$/.exec(rule ?? '');
  return match ? { direction: match[1] as 'nearest' | 'floor' | 'ceil', step: Number(match[2]) } : null;
}

export function roundMinutes(minutes: number, rule?: string): number {
  const safe = Math.max(0, Math.round(minutes));
  const config = roundingStep(rule);
  if (!config) return safe;
  const quotient = safe / config.step;
  const rounded = config.direction === 'floor' ? Math.floor(quotient) : config.direction === 'ceil' ? Math.ceil(quotient) : Math.round(quotient);
  return rounded * config.step;
}

function localSessionContext(value: Date | string): { weekend: boolean } {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Argentina/Buenos_Aires', weekday: 'short' }).formatToParts(new Date(value));
  const weekday = parts.find((part) => part.type === 'weekday')?.value;
  return { weekend: weekday === 'Sat' || weekday === 'Sun' };
}

function profileMultiplier(profile: ProfileSnapshot, startedAt: Date | string): number {
  const context = localSessionContext(startedAt);
  const nightStart = profile.nightStartHour ?? 22;
  const nightEnd = profile.nightEndHour ?? 6;
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Argentina/Buenos_Aires', hour: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(startedAt));
  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? 0);
  const inNightRange = nightStart > nightEnd ? hour >= nightStart || hour < nightEnd : hour >= nightStart && hour < nightEnd;
  return (context.weekend ? profile.weekendMultiplier ?? 1 : 1) * (inNightRange ? profile.nightMultiplier ?? 1 : 1);
}

function item(partial: CalculationItem): CalculationItem {
  return { ...partial, quantity: Math.round(partial.quantity * 100) / 100, unitAmountMinor: Math.round(partial.unitAmountMinor), subtotalMinor: Math.round(partial.subtotalMinor) };
}

export function calculateSettlement(input: {
  profile: ProfileSnapshot;
  sessions: ApprovedSessionInput[];
  manualItems?: ManualCalculationItem[];
  advances?: PendingAdvanceInput[];
}): CalculationResult {
  const { profile } = input;
  const items: CalculationItem[] = [];
  const details: CalculationResult['details']['sessions'] = [];
  const warnings: string[] = [];
  let baseAmountMinor = 0;
  let earningsAmountMinor = 0;
  let deductionsAmountMinor = 0;
  const hourlyEnabled = profile.compensationType === 'hourly' || profile.compensationType === 'mixed';
  const dailyEnabled = profile.compensationType === 'daily' || profile.compensationType === 'mixed';
  const monthlyEnabled = profile.compensationType === 'monthly' || profile.compensationType === 'mixed';
  const eventEnabled = profile.compensationType === 'per_event' || profile.compensationType === 'mixed';

  if (hourlyEnabled && !profile.hourlyRateMinor) warnings.push('El perfil no tiene valor hora configurado.');
  if (dailyEnabled && !profile.dailyRateMinor) warnings.push('El perfil no tiene valor por jornada configurado.');
  if (monthlyEnabled && !profile.monthlySalaryMinor) warnings.push('El perfil no tiene salario mensual configurado.');
  if (eventEnabled && !profile.eventRateMinor) warnings.push('El perfil no tiene valor por evento configurado.');

  for (const session of input.sessions) {
    const roundedMinutes = roundMinutes(session.approvedMinutes, profile.roundingRule);
    const overtimeThreshold = Math.max(0, (profile.overtimeAfterMinutes ?? 480) + (profile.graceMinutes ?? 0));
    const normalMinutes = Math.min(roundedMinutes, overtimeThreshold);
    const overtimeMinutes = Math.max(0, roundedMinutes - normalMinutes);
    const multiplier = profileMultiplier(profile, session.startedAt);
    details.push({ id: session.id, approvedMinutes: session.approvedMinutes, roundedMinutes, normalMinutes, overtimeMinutes, multiplier });

    if (hourlyEnabled && profile.hourlyRateMinor) {
      const normalSubtotal = minorForMinutes(normalMinutes, profile.hourlyRateMinor);
      if (normalSubtotal) {
        items.push(item({ conceptCode: 'NORMAL_HOURS', conceptName: 'Horas normales', conceptType: 'earning', source: 'attendance', sourceId: session.id, quantity: quantityHours(normalMinutes), unit: 'hour', unitAmountMinor: profile.hourlyRateMinor, subtotalMinor: normalSubtotal, description: 'Horas aprobadas de la jornada.' }));
        baseAmountMinor += normalSubtotal;
      }
      const premiumSubtotal = Math.max(0, minorForMinutes(normalMinutes, profile.hourlyRateMinor * multiplier) - normalSubtotal);
      if (premiumSubtotal) {
        items.push(item({ conceptCode: multiplier > 1 ? 'SHIFT_PREMIUM' : 'NORMAL_HOURS', conceptName: 'Adicional de turno', conceptType: 'earning', source: 'attendance', sourceId: session.id, quantity: quantityHours(normalMinutes), unit: 'hour', unitAmountMinor: Math.max(0, Math.round(profile.hourlyRateMinor * (multiplier - 1))), subtotalMinor: premiumSubtotal, description: 'Adicional nocturno y/o de fin de semana según el perfil.' }));
        earningsAmountMinor += premiumSubtotal;
      }
      if (overtimeMinutes) {
        const overtimeRate = profile.hourlyRateMinor * (profile.overtimeMultiplier ?? 1.5) * multiplier;
        const overtimeSubtotal = minorForMinutes(overtimeMinutes, overtimeRate);
        items.push(item({ conceptCode: 'OVERTIME_HOURS', conceptName: 'Horas extra', conceptType: 'earning', source: 'overtime', sourceId: session.id, quantity: quantityHours(overtimeMinutes), unit: 'hour', unitAmountMinor: Math.round(overtimeRate), subtotalMinor: overtimeSubtotal, description: 'Horas que superan el umbral diario del perfil.' }));
        earningsAmountMinor += overtimeSubtotal;
      }
    }

    if (dailyEnabled && profile.dailyRateMinor && roundedMinutes > 0) {
      const dailySubtotal = Math.round(profile.dailyRateMinor * multiplier);
      items.push(item({ conceptCode: 'WORK_DAYS', conceptName: 'Jornadas', conceptType: 'earning', source: 'attendance', sourceId: session.id, quantity: 1, unit: 'day', unitAmountMinor: Math.round(profile.dailyRateMinor * multiplier), subtotalMinor: dailySubtotal, description: 'Jornada aprobada.' }));
      baseAmountMinor += dailySubtotal;
    }
  }

  if (monthlyEnabled && profile.monthlySalaryMinor) {
    items.push(item({ conceptCode: 'MONTHLY_SALARY', conceptName: 'Salario mensual', conceptType: 'earning', source: 'attendance', quantity: 1, unit: 'month', unitAmountMinor: profile.monthlySalaryMinor, subtotalMinor: profile.monthlySalaryMinor, description: 'Salario mensual acordado en el perfil.' }));
    baseAmountMinor += profile.monthlySalaryMinor;
  }

  if (eventEnabled && profile.eventRateMinor) {
    const eventIds = [...new Set(input.sessions.map((session) => session.eventId).filter((id): id is string => Boolean(id)))];
    for (const eventId of eventIds) {
      items.push(item({ conceptCode: 'WORKED_EVENTS', conceptName: 'Eventos trabajados', conceptType: 'earning', source: 'event', sourceId: eventId, quantity: 1, unit: 'event', unitAmountMinor: profile.eventRateMinor, subtotalMinor: profile.eventRateMinor, description: 'Evento con asistencia aprobada.' }));
      baseAmountMinor += profile.eventRateMinor;
    }
  }

  for (const manual of input.manualItems ?? []) {
    const value = Math.max(0, Math.round(manual.subtotalMinor));
    const normalized = item({ ...manual, subtotalMinor: value, isManual: true });
    items.push(normalized);
    if (normalized.conceptType === 'earning') earningsAmountMinor += value;
    else deductionsAmountMinor += value;
  }

  for (const advance of input.advances ?? []) {
    const value = Math.max(0, Math.round(advance.amountMinor));
    if (!value) continue;
    items.push(item({ conceptCode: 'ADVANCE', conceptName: 'Adelanto', conceptType: 'deduction', source: 'advance', sourceId: advance.id, quantity: 1, unit: 'advance', unitAmountMinor: value, subtotalMinor: value, description: `Adelanto registrado el ${new Date(advance.date).toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })}.` }));
    deductionsAmountMinor += value;
  }

  const grossAmountMinor = baseAmountMinor + earningsAmountMinor;
  return {
    items,
    baseAmountMinor,
    earningsAmountMinor,
    deductionsAmountMinor,
    grossAmountMinor,
    netAmountMinor: grossAmountMinor - deductionsAmountMinor,
    details: { sessions: details, warnings, formula: 'netAmountMinor = baseAmountMinor + earningsAmountMinor - deductionsAmountMinor' }
  };
}
