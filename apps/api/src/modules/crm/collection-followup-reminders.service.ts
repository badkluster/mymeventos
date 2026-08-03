import { resolvePaymentCollectionContact, type PaymentCollectionTarget } from './payment-collection.service';
import { runGenericReminderTick, type GenericReminderOptions, type GenericReminderRecipients, type GenericTickResult } from './reminder-engine';

// Delivers the one-off follow-up scheduled by schedulePaymentCollectionFollowUp
// (payment-collection.service.ts). There is no periodic sync here — the CalendarItem is created
// directly by the operator's action, so this tick only ever claims and delivers.
async function noSync(): Promise<number> {
  return 0;
}

function targetFromItem(item: any): PaymentCollectionTarget | undefined {
  if (item?.metadata?.source === 'payment' && item?.paymentId) return { source: 'payment', paymentId: String(item.paymentId) };
  if (item?.metadata?.source === 'installment' && item?.eventId) {
    const installmentId = String(item.metadata.targetKey ?? '').split(':').pop();
    if (installmentId) return { source: 'installment', eventId: String(item.eventId), installmentId };
  }
  return undefined;
}

async function stillApplies(item: any): Promise<boolean> {
  const target = targetFromItem(item);
  if (!target) return false;
  try {
    // Still overdue and unpaid — throws (PAYMENT_COLLECTION_NOT_OVERDUE / _INSTALLMENT_NOT_FOUND)
    // once it's been paid, cancelled, or is no longer overdue.
    await resolvePaymentCollectionContact(target);
    return true;
  } catch {
    return false;
  }
}

async function resolveRecipients(item: any): Promise<GenericReminderRecipients> {
  return { kind: 'internal', userIds: [String(item.assignedToUserId)] };
}

function buildContent(item: any) {
  return { subject: item.title, text: item.description || item.title };
}

const options: GenericReminderOptions = {
  domainKey: 'collectionFollowUp',
  notificationType: 'collection_followup',
  stillApplies,
  resolveRecipients,
  buildContent,
  actionUrl: () => '/admin/payments'
};

export async function processCollectionFollowUpTick(now = new Date()): Promise<GenericTickResult> {
  return runGenericReminderTick(now, noSync, options);
}
