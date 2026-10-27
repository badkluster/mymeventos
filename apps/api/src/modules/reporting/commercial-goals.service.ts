import type { Request } from 'express';
import { Permission } from '@mym/shared';
import { userHasPermission } from '../../middlewares/auth';
import { CalendarItem, Contract, Event, Lead, Payment, Quote } from '../crm/crm.models';
import { Salon } from '../salons/salon.model';
import { resolveReportScope } from './report-filter';
import { SalonMonthlyGoal } from './salon-monthly-goal.model';

export type ContractEvidence = {
  _id: string; eventId: string; salonId?: string; status: string;
  approvedAt?: Date | string | null; deletedAt?: Date | string | null;
};
export type EventEvidence = { _id: string; salonId?: string; status: string; deletedAt?: Date | string | null };

export function monthBounds(year: number, month: number) {
  const start = new Date(Date.UTC(year, month - 1, 1, 3));
  const end = new Date(Date.UTC(year, month, 1, 3));
  return { start, end };
}

// Approval is the formal close. Revisions retain the first approval date of the event.
// A cancelled event or a cancelled current contract removes the close, including in past periods.
export function classifyClose(event: EventEvidence | undefined, contracts: ContractEvidence[]) {
  if (!event || event.deletedAt || event.status === 'cancelled' || event.status === 'lost') return { kind: 'excluded' as const };
  if (contracts.some((item) => (item.status === 'superseded' && !item.approvedAt) || (item.deletedAt && item.approvedAt))) return { kind: 'inconsistent' as const };
  const versions = contracts.filter((item) => !item.deletedAt);
  const active = versions.filter((item) => item.status === 'approved');
  if (active.length !== 1) return { kind: active.length > 1 ? 'inconsistent' as const : 'excluded' as const };
  const approved = versions.filter((item) => item.approvedAt && ['approved', 'superseded'].includes(item.status));
  if (!approved.length) return { kind: 'inconsistent' as const };
  if (approved.some((item) => item.eventId !== event._id || item.salonId !== event.salonId)) return { kind: 'inconsistent' as const };
  const first = approved.reduce((earliest, item) => new Date(item.approvedAt!).getTime() < new Date(earliest.approvedAt!).getTime() ? item : earliest);
  return { kind: 'closed' as const, closedAt: new Date(first.approvedAt!), contractId: active[0]._id };
}

const id = (value: any): string => value?.toString?.() ?? '';

export async function commercialGoals(request: Request, year: number, month: number) {
  const scope = resolveReportScope(request);
  const auditAvailable = userHasPermission(request.user!, Permission.CONTRACTS_READ);
  const { start, end } = monthBounds(year, month);
  const salons: any[] = await Salon.find({ deletedAt: null, ...scope.match('_id') }).select('_id name').lean();
  const salonIds = salons.map((salon) => salon._id);
  const [goals, candidateContracts, paidPayments, leads, quotes, visits, pendingFollowUps] = await Promise.all([
    SalonMonthlyGoal.find({ salonId: { $in: salonIds }, year, month }).lean(),
    Contract.find({ salonId: { $in: salonIds }, deletedAt: null, approvedAt: { $gte: start, $lt: end } }).select('_id eventId salonId status approvedAt deletedAt').lean(),
    Payment.find({ salonId: { $in: salonIds }, deletedAt: null, status: 'paid', type: { $nin: ['refund', 'security_deposit'] }, paidAt: { $gte: start, $lt: end } }).select('_id eventId contractId salonId paidAt').lean(),
    Lead.find({ deletedAt: null, createdAt: { $gte: start, $lt: end }, $or: [{ salonId: { $in: salonIds } }, { salonIds: { $in: salonIds } }] }).select('_id salonId salonIds status lostReason').lean(),
    Quote.find({ deletedAt: null, salonId: { $in: salonIds }, createdAt: { $gte: start, $lt: end } }).select('_id salonId leadId').lean(),
    CalendarItem.find({ deletedAt: null, type: 'meeting', 'metadata.commercialVisit': true, salonId: { $in: salonIds }, startAt: { $gte: start, $lt: end } }).select('_id salonId leadId status metadata').lean(),
    Lead.countDocuments({ deletedAt: null, status: 'follow_up', nextContactAt: { $gte: start, $lt: end }, $or: [{ salonId: { $in: salonIds } }, { salonIds: { $in: salonIds } }] }),
  ]);
  const cohortLeadIds = leads.map((lead: any) => lead._id);
  const [cohortQuotes, cohortVisits] = await Promise.all([
    Quote.find({ deletedAt: null, leadId: { $in: cohortLeadIds }, salonId: { $in: salonIds } }).select('leadId salonId').lean(),
    CalendarItem.find({ deletedAt: null, type: 'meeting', 'metadata.commercialVisit': true, leadId: { $in: cohortLeadIds }, salonId: { $in: salonIds } }).select('leadId salonId status metadata').lean(),
  ]);
  const eventIds = [...new Set([...candidateContracts.map((item: any) => id(item.eventId)), ...paidPayments.map((item: any) => id(item.eventId))].filter(Boolean))];
  const [events, versions] = await Promise.all([
    Event.find({ _id: { $in: eventIds } }).select('_id salonId status deletedAt eventName customerId leadId sourceLeadId').populate('customerId', 'fullName').lean(),
    Contract.find({ eventId: { $in: eventIds } }).select('_id eventId salonId status approvedAt deletedAt').lean(),
  ]);
  const eventById = new Map(events.map((event: any) => [id(event._id), event]));
  const versionsByEvent = new Map<string, ContractEvidence[]>();
  for (const item of versions as any[]) {
    const key = id(item.eventId);
    versionsByEvent.set(key, [...(versionsByEvent.get(key) ?? []), { ...item, _id: id(item._id), eventId: key, salonId: id(item.salonId) }]);
  }
  const paidEventIds = new Set(paidPayments.map((payment: any) => id(payment.eventId)).filter(Boolean));
  const goalBySalon = new Map(goals.map((goal: any) => [id(goal.salonId), goal]));
  const items = salons.map((salon: any) => {
    const salonId = id(salon._id);
    const closes: Array<{ eventId: string; eventName: string; customerName?: string; contractId: string; closedAt: Date }> = [];
    const inconsistencies: Array<{ eventId: string; reason: string }> = [];
    for (const eventId of eventIds) {
      const event: any = eventById.get(eventId);
      if (!event) {
        if (candidateContracts.some((contract: any) => id(contract.eventId) === eventId && id(contract.salonId) === salonId) || paidPayments.some((payment: any) => id(payment.eventId) === eventId && id(payment.salonId) === salonId)) {
          inconsistencies.push({ eventId, reason: 'El evento asociado no existe o no está disponible para verificar el cierre.' });
        }
        continue;
      }
      if (id(event?.salonId) !== salonId) continue;
      const result = classifyClose(event ? { _id: eventId, salonId, status: event.status, deletedAt: event.deletedAt } : undefined, versionsByEvent.get(eventId) ?? []);
      if (result.kind === 'closed' && result.closedAt >= start && result.closedAt < end) {
        closes.push({ eventId, eventName: event.eventName || 'Evento', customerName: event.customerId?.fullName, contractId: result.contractId, closedAt: result.closedAt });
      } else if (paidEventIds.has(eventId) && result.kind !== 'closed') {
        inconsistencies.push({ eventId, reason: 'Hay un cobro en el período sin un contrato aprobado vigente y un evento activo.' });
      } else if (result.kind === 'inconsistent') {
        inconsistencies.push({ eventId, reason: 'Las versiones contractuales no permiten determinar un único cierre.' });
      }
    }
    const goal: any = goalBySalon.get(salonId);
    const target = goal?.target ?? null;
    const leadIds = new Set(leads.filter((lead: any) => id(lead.salonId) === salonId || lead.salonIds?.some((item: any) => id(item) === salonId)).map((lead: any) => id(lead._id)));
    const quotedLeadIds = new Set(quotes.filter((quote: any) => id(quote.salonId) === salonId && quote.leadId).map((quote: any) => id(quote.leadId)));
    const salonVisits = visits.filter((visit: any) => id(visit.salonId) === salonId);
    const cohort = leads.filter((lead: any) => leadIds.has(id(lead._id)));
    const quotedCohortIds = new Set(cohortQuotes.filter((quote: any) => id(quote.salonId) === salonId).map((quote: any) => id(quote.leadId)));
    const scheduledCohortIds = new Set(cohortVisits.filter((visit: any) => id(visit.salonId) === salonId && visit.status !== 'cancelled').map((visit: any) => id(visit.leadId)));
    const visitedCohortIds = new Set(cohortVisits.filter((visit: any) => id(visit.salonId) === salonId && visit.metadata?.visitOutcome === 'completed').map((visit: any) => id(visit.leadId)));
    const lossReasons: Record<string, number> = {};
    for (const lead of cohort as any[]) if (lead.status === 'lost') lossReasons[lead.lostReason || 'Sin registrar'] = (lossReasons[lead.lostReason || 'Sin registrar'] ?? 0) + 1;
    const quoted = cohort.filter((lead: any) => quotedCohortIds.has(id(lead._id))).length;
    return {
      salonId, salonName: salon.name, year, month, target, closed: closes.length,
      percentage: target ? Math.round(closes.length / target * 100) : null,
      remaining: target ? Math.max(0, target - closes.length) : null,
      status: inconsistencies.length ? 'review_required' : !target ? 'unconfigured' : closes.length >= target ? 'achieved' : 'in_progress',
      closes: auditAvailable ? closes : [], inconsistencies: auditAvailable ? inconsistencies : [], auditAvailable,
      activity: { leads: leadIds.size, quotedPeople: quotedLeadIds.size, visitsScheduled: salonVisits.filter((visit: any) => visit.status !== 'cancelled').length, visitsCompleted: salonVisits.filter((visit: any) => visit.metadata?.visitOutcome === 'completed').length },
      conversion: { cohortSize: cohort.length, withoutQuote: cohort.length - quoted, quoted, visitScheduled: scheduledCohortIds.size, visited: visitedCohortIds.size, followUp: cohort.filter((lead: any) => lead.status === 'follow_up').length, won: cohort.filter((lead: any) => ['won', 'converted'].includes(lead.status)).length, lost: cohort.filter((lead: any) => lead.status === 'lost').length, lossReasons, quoteRate: cohort.length ? Math.round(quoted / cohort.length * 100) : null, visitRate: quoted ? Math.round(visitedCohortIds.size / quoted * 100) : null },
    };
  });
  return { year, month, timeZone: 'America/Argentina/Buenos_Aires', pendingFollowUps, items };
}
