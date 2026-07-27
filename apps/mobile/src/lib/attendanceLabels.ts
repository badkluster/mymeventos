export const workSessionStatusLabels: Record<string, string> = {
  active: 'Activa',
  completed: 'Completada',
  incomplete: 'Incompleta',
  under_review: 'En revisión',
  adjusted: 'Ajustada',
  cancelled: 'Cancelada'
};

export const attendanceIncidentTypeLabels: Record<string, string> = {
  missed_check_in: 'No pude marcar entrada',
  missed_check_out: 'No pude marcar salida',
  location_issue: 'Problema con la ubicación',
  offline_app: 'Aplicación sin conexión',
  wrong_shift: 'Turno incorrecto',
  forgot_to_clock: 'Olvidé marcar',
  wrong_schedule: 'Horario incorrecto',
  other: 'Otro'
};

export const attendanceIncidentStatusLabels: Record<string, string> = {
  pending: 'Pendiente',
  in_review: 'En revisión',
  resolved: 'Resuelta',
  rejected: 'Rechazada'
};

export const attendanceAdjustmentStatusLabels: Record<string, string> = {
  pending: 'Pendiente',
  approved: 'Aprobada',
  rejected: 'Rechazada',
  cancelled: 'Cancelada'
};

export function formatMinutes(minutes?: number): string {
  if (minutes === undefined || minutes === null) return 'Sin calcular';
  const hours = Math.floor(minutes / 60);
  const remaining = Math.round(minutes % 60);
  return `${hours}h ${remaining}m`;
}
