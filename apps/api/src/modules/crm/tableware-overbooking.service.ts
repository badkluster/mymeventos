import { Role } from '@mym/shared';
import { CalendarItem } from './crm.models';
import { EventTablewareAllocation } from './eventTablewareAllocation.model';
import { SalonStockItem } from '../salons/salonStockItem.model';
import { Salon } from '../salons/salon.model';
import { User } from '../users/user.model';
import { argentinaDateKey } from '../../utils/argentina-date';
import { idOf, uniqueIds, runGenericReminderTick, type GenericReminderOptions, type GenericReminderRecipients, type GenericTickResult } from './reminder-engine';

async function fallbackRecipients(): Promise<string[]> {
  const users = await User.find({ active: true, deletedAt: null, roles: { $in: [Role.ADMIN, Role.MANAGER] } }).select('_id').lean();
  return users.map((user: any) => String(user._id));
}

// Reservations are keyed by (salonId, eventDay, salonStockItemId) — same grouping
// events.routes.ts#tablewareAvailability uses for its own overbooking guard on PUT
// /:id/tableware. This just widens that same check into a standing alert instead of only
// blocking at the moment a specific event tries to reserve more.
async function findOverbookedGroups(todayKey: string): Promise<Array<{ salonId: string; eventDay: string; salonStockItemId: string; total: number }>> {
  // NOTE (found during the 2026-09-23 Fluid CPU audit, not fixed here): unlike
  // events.routes.ts#tablewareAvailability (the check this function's own comment says it
  // mirrors), this filter has no `releasedAt: null` — a released/freed allocation with a future
  // `eventDay` still counts toward the total, which can produce a false-positive overbooking
  // alert. Left unchanged because fixing it changes which alerts fire (a behavioral change,
  // out of scope for a performance-only pass) — flagged for a follow-up, not a product decision
  // this audit should make silently.
  const allocations: any[] = await EventTablewareAllocation.find({ source: 'salon_stock', eventDay: { $gte: todayKey } })
    .select('salonId eventDay salonStockItemId quantity').lean();
  if (!allocations.length) return [];

  const groups = new Map<string, { salonId: string; eventDay: string; salonStockItemId: string; total: number }>();
  for (const allocation of allocations) {
    if (!allocation.salonStockItemId) continue;
    const key = `${allocation.salonId}:${allocation.eventDay}:${allocation.salonStockItemId}`;
    const existing = groups.get(key);
    if (existing) existing.total += allocation.quantity;
    else groups.set(key, {
      salonId: String(allocation.salonId),
      eventDay: allocation.eventDay,
      salonStockItemId: String(allocation.salonStockItemId),
      total: allocation.quantity
    });
  }

  const itemIds = [...new Set([...groups.values()].map((group) => group.salonStockItemId))];
  const items: any[] = itemIds.length
    ? await SalonStockItem.find({ _id: { $in: itemIds }, deletedAt: null }).select('_id name currentQuantity').lean()
    : [];
  const itemById = new Map(items.map((item: any) => [String(item._id), item]));

  return [...groups.values()].filter((group) => {
    const item = itemById.get(group.salonStockItemId);
    return Boolean(item) && group.total > item.currentQuantity;
  });
}

async function syncTablewareOverbookingAlerts(now: Date): Promise<number> {
  const startedAt = Date.now();
  const todayKey = argentinaDateKey(now);
  const overbooked = await findOverbookedGroups(todayKey);

  // Batch the per-group `Salon.findOne`/`SalonStockItem.findOne` this loop used to run twice
  // per overbooked group.
  const salonIds = uniqueIds(overbooked.map((group) => group.salonId));
  const stockItemIds = uniqueIds(overbooked.map((group) => group.salonStockItemId));
  const [salons, stockItems] = await Promise.all([
    salonIds.length ? Salon.find({ _id: { $in: salonIds }, deletedAt: null }).select('managerUserId name').lean() : Promise.resolve([]),
    stockItemIds.length ? SalonStockItem.find({ _id: { $in: stockItemIds }, deletedAt: null }).select('name currentQuantity').lean() : Promise.resolve([])
  ]);
  const salonById = new Map(salons.map((salon: any) => [String(salon._id), salon]));
  const stockItemById = new Map(stockItems.map((item: any) => [String(item._id), item]));

  let synced = 0;
  for (const group of overbooked) {
    const salon: any = salonById.get(group.salonId);
    const item: any = stockItemById.get(group.salonStockItemId);
    const itemName = item?.name ?? 'un ítem de stock';
    const automationKey = `tableware_overbooking:${group.salonId}:${group.eventDay}:${group.salonStockItemId}`;
    await CalendarItem.findOneAndUpdate(
      { automationKey },
      {
        $set: {
          type: 'alert',
          source: 'system',
          title: `Sobre-reserva de ${itemName} en ${(salon as any)?.name || 'el salón'} el ${group.eventDay}`,
          description: `Se reservaron ${group.total} unidades de "${itemName}" para el ${group.eventDay}, pero el stock disponible es de ${(item as any)?.currentQuantity ?? 0}.`,
          startAt: now,
          allDay: false,
          status: 'scheduled',
          priority: 'high',
          visibility: 'private',
          salonId: group.salonId,
          assignedToUserId: idOf((salon as any)?.managerUserId),
          metadata: { tablewareOverbooking: true, salonStockItemId: group.salonStockItemId, eventDay: group.eventDay }
        },
        $setOnInsert: {
          notification: { enabled: true, channels: ['system', 'email'], sendAt: now, status: 'scheduled', attemptCount: 0 }
        }
      },
      { upsert: true, setDefaultsOnInsert: true }
    );
    synced += 1;
  }
  const elapsedMs = Date.now() - startedAt;
  if (elapsedMs >= 500) {
    console.warn(JSON.stringify({
      event: 'tableware_overbooking_tick_timing',
      elapsedMs,
      candidateCount: overbooked.length,
      salonCount: salonIds.length,
      synced
    }));
  }
  return synced;
}

async function stillApplies(item: any): Promise<boolean> {
  const salonId = idOf(item?.salonId);
  const salonStockItemId = item?.metadata?.salonStockItemId;
  const eventDay = item?.metadata?.eventDay;
  if (!salonId || !salonStockItemId || !eventDay) return false;
  const [stockItem, allocations] = await Promise.all([
    SalonStockItem.findOne({ _id: salonStockItemId, deletedAt: null }).select('currentQuantity').lean(),
    EventTablewareAllocation.find({ salonId, eventDay, salonStockItemId, source: 'salon_stock' }).select('quantity').lean()
  ]);
  if (!stockItem) return false;
  const total = allocations.reduce((sum: number, allocation: any) => sum + allocation.quantity, 0);
  return total > (stockItem as any).currentQuantity;
}

async function resolveRecipients(item: any): Promise<GenericReminderRecipients> {
  const assignedId = idOf(item.assignedToUserId);
  if (assignedId) return { kind: 'internal', userIds: [assignedId] };
  return { kind: 'internal', userIds: await fallbackRecipients() };
}

function buildContent(item: any) {
  return { subject: item.title, text: item.description || item.title };
}

const options: GenericReminderOptions = {
  domainKey: 'tablewareOverbooking',
  notificationType: 'tableware_overbooking',
  stillApplies,
  resolveRecipients,
  buildContent,
  actionUrl: (item: any) => {
    const salonId = idOf(item?.salonId);
    return salonId ? `/admin/salons/${salonId}` : undefined;
  }
};

export async function processTablewareOverbookingTick(now = new Date()): Promise<GenericTickResult> {
  return runGenericReminderTick(now, syncTablewareOverbookingAlerts, options);
}
