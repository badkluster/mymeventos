import { connectDatabase, disconnectDatabase } from '../db/connection';
import { DigitalTicket, TicketAccessAttempt, TicketOrder, TicketPayment, TicketPublication, TicketRefund, TicketStockReservation, TicketType } from '../modules/tickets/ticket.models';

const demoSlugs = ['demo-festival-cielo-abierto', 'demo-noche-retro-2000', 'demo-taller-floral'];

async function cleanDemoTickets() {
  await connectDatabase();

  const publications = await TicketPublication.find({ slug: { $in: demoSlugs } }).select('_id').lean();
  const publicationIds = publications.map((publication) => publication._id);
  const orders = await TicketOrder.find({ $or: [{ publicationId: { $in: publicationIds } }, { publicId: /^DEMO-/ }] }).select('_id').lean();
  const orderIds = orders.map((order) => order._id);
  const tickets = await DigitalTicket.find({ $or: [{ publicationId: { $in: publicationIds } }, { orderId: { $in: orderIds } }, { publicToken: /^demo-/ }] }).select('_id').lean();
  const ticketIds = tickets.map((ticket) => ticket._id);

  const [accesses, refunds, payments, reservations, ticketRows, orderRows, typeRows, publicationRows] = await Promise.all([
    TicketAccessAttempt.deleteMany({ $or: [{ publicationId: { $in: publicationIds } }, { ticketId: { $in: ticketIds } }] }),
    TicketRefund.deleteMany({ orderId: { $in: orderIds } }),
    TicketPayment.deleteMany({ orderId: { $in: orderIds } }),
    TicketStockReservation.deleteMany({ $or: [{ publicationId: { $in: publicationIds } }, { orderId: { $in: orderIds } }] }),
    DigitalTicket.deleteMany({ _id: { $in: ticketIds } }),
    TicketOrder.deleteMany({ _id: { $in: orderIds } }),
    TicketType.deleteMany({ publicationId: { $in: publicationIds } }),
    TicketPublication.deleteMany({ _id: { $in: publicationIds } }),
  ]);

  console.info('Datos de demostración de entradas eliminados:', {
    publicaciones: publicationRows.deletedCount,
    tipos: typeRows.deletedCount,
    ordenes: orderRows.deletedCount,
    entradas: ticketRows.deletedCount,
    pagos: payments.deletedCount,
    reembolsos: refunds.deletedCount,
    reservas: reservations.deletedCount,
    accesos: accesses.deletedCount,
  });
}

cleanDemoTickets()
  .then(disconnectDatabase)
  .catch(async (error) => {
    console.error('No se pudieron eliminar los datos demo de entradas:', error);
    await disconnectDatabase();
    process.exitCode = 1;
  });
