const labels: Record<string, string> = {
  draft: 'Borrador', scheduled: 'Programada', active: 'Activa', paused: 'Pausada', sold_out: 'Agotada', finished: 'Finalizada', closed: 'Cerrada', cancelled: 'Cancelada', archived: 'Archivada',
  pending: 'Pendiente', payment_pending: 'Pendiente de pago', paid: 'Pagada', expired: 'Vencida', refunded: 'Reembolsada', partially_refunded: 'Reembolso parcial', failed: 'Fallida', rejected: 'Rechazada',
  created: 'Creado', approved: 'Aprobado', processing: 'En proceso', valid: 'Válida', used: 'Utilizada', reserved: 'Reservada', issued: 'Emitida', blocked: 'Bloqueada', invalid: 'Inválida',
  manual_paid: 'Pago manual confirmado', free: 'Sin cargo', mock: 'Simulador local', mercado_pago: 'Mercado Pago', cash: 'Efectivo', bank_transfer: 'Transferencia bancaria', card: 'Tarjeta', other: 'Otro'
};
export const ticketLabel = (value?: string) => value ? labels[value] ?? value : 'Sin información';
