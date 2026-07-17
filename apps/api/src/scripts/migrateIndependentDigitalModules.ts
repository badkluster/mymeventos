/**
 * Migración manual e idempotente de los módulos digitales desacoplados.
 *
 * Por seguridad se ejecuta en modo simulación salvo que se indique --apply.
 * Nunca borra las colecciones ni los documentos históricos de TicketSale.
 */
import mongoose from 'mongoose';
import { connectDatabase } from '../db/connection';

const apply = process.argv.includes('--apply');

async function run(): Promise<void> {
  await connectDatabase();
  const db = mongoose.connection.db;
  if (!db) throw new Error('No fue posible obtener la conexión a MongoDB.');

  const invitations = db.collection('digitalinvitations');
  const legacySales = db.collection('ticketsales');
  const publications = db.collection('ticketpublications');
  const events = db.collection('events');
  const ticketTypes = db.collection('tickettypes');
  const orders = db.collection('ticketorders');
  const tickets = db.collection('digitaltickets');
  const accessAttempts = db.collection('ticketaccessattempts');

  const invitationCandidates = await invitations.countDocuments({ ownerId: { $exists: false }, createdBy: { $exists: true } });
  const sales: any[] = await legacySales.find({}).toArray();
  console.log(`[dry-run=${!apply}] Invitaciones a actualizar: ${invitationCandidates}. Ventas históricas a copiar: ${sales.length}.`);
  if (!apply) return;

  const invitationResult = await invitations.updateMany(
    { ownerId: { $exists: false }, createdBy: { $exists: true } },
    [{ $set: { ownerId: '$createdBy' } }, { $unset: ['eventId', 'salonId', 'customerId'] }]
  );

  let copiedPublications = 0;
  for (const sale of sales) {
    const event: any = sale.eventId ? await events.findOne({ _id: sale.eventId }) : null;
    const publication = {
      _id: sale._id,
      title: sale.title || event?.eventName || event?.eventType || 'Publicación migrada',
      description: sale.publicText || sale.relevantInfo || '',
      startsAt: sale.startsAt || event?.eventDate || sale.createdAt,
      endsAt: sale.endsAt,
      capacity: sale.capacity ?? 0,
      reservedCount: sale.reservedCount ?? 0,
      soldCount: sale.soldCount ?? 0,
      maxTicketsPerOrder: sale.maxTicketsPerOrder ?? 10,
      status: sale.status || 'draft',
      slug: sale.slug,
      coverImage: sale.imageUrl,
      venueName: sale.location,
      refundPolicy: sale.refundPolicy,
      allowFreeTickets: sale.allowFreeTickets ?? true,
      paymentConfig: sale.paymentConfig ?? { enabled: false, provider: 'none', reservationMinutes: 20, feePayer: 'organizer' },
      qrConfig: { allowReentry: false, maxAccesses: 1, allowRevert: true },
      createdBy: sale.createdBy,
      updatedBy: sale.updatedBy,
      deletedAt: sale.deletedAt ?? null,
      deletedBy: sale.deletedBy,
      createdAt: sale.createdAt,
      updatedAt: sale.updatedAt
    };
    const result = await publications.updateOne({ _id: sale._id }, { $setOnInsert: publication }, { upsert: true });
    copiedPublications += result.upsertedCount;
  }

  const [typeResult, orderResult, ticketResult, accessResult] = await Promise.all([
    ticketTypes.updateMany({ saleId: { $exists: true }, publicationId: { $exists: false } }, [{ $set: { publicationId: '$saleId' } }, { $unset: 'saleId' }]),
    orders.updateMany({ saleId: { $exists: true }, publicationId: { $exists: false } }, [{ $set: { publicationId: '$saleId' } }, { $unset: ['saleId', 'eventId', 'salonId', 'customerId'] }]),
    tickets.updateMany({ saleId: { $exists: true }, publicationId: { $exists: false } }, [{ $set: { publicationId: '$saleId' } }, { $unset: ['saleId', 'eventId'] }]),
    accessAttempts.updateMany({ eventId: { $exists: true } }, { $unset: { eventId: '' } })
  ]);

  console.log(JSON.stringify({ invitationsUpdated: invitationResult.modifiedCount, publicationsCopied: copiedPublications, typesUpdated: typeResult.modifiedCount, ordersUpdated: orderResult.modifiedCount, ticketsUpdated: ticketResult.modifiedCount, accessAttemptsUpdated: accessResult.modifiedCount }));
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  await mongoose.disconnect();
});
