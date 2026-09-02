/**
 * One-off test script: sends one illustrative sample of every automation email in the system to
 * a single test address, using entirely fake in-memory data. No database read or write happens —
 * every template function that needs real documents (Mongo lookups) has its content-building
 * logic duplicated here with fake objects instead of being invoked against real records, per the
 * data-protection rule in AGENTS.md.
 *
 * Run: pnpm --filter @mym/api exec ts-node --files src/scripts/sendAutomationTestSamples.ts
 */
import { sendEmail } from '../modules/email/email.service';
import { renderBrandedEmail, escapeHtml, logoEmailAttachments, EMAIL_LOGO_CID } from '../modules/email/email-template.util';
import { sendPaymentCollectionEmail, type PaymentCollectionContact } from '../modules/crm/payment-collection.service';

const TEST_EMAIL = 'jorge.ema.dominguez@gmail.com';

function money(value: number): string {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(value);
}

function formatTicketAmount(amount: number, currency = 'ARS'): string {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
}

type Job = { label: string; subject: string; text: string; html?: string; attachments?: any[] };

const jobs: Job[] = [];

function addJob(job: Job): void {
  jobs.push(job);
}

// 1) Alerta de evento (event-alert-reminders.service.ts) — plain text
addJob({
  label: 'Alerta de evento (tareas del evento)',
  subject: 'Confirmar cronograma con el cliente',
  text: 'Revisar el cronograma del evento con el cliente y confirmar horarios de montaje. Evento: Cumpleaños de Sofía (PRUEBA), 20/09/2026.'
});

// 2) Resumen ejecutivo diario (daily-digest.service.ts) — branded HTML
{
  const intro = 'Panorama para Administración: Hay 2 eventos programados para hoy; tenés 3 alertas o tareas para revisar; 1 pago requiere atención por vencimiento hoy; queda 1 cierre administrativo pendiente.';
  const html = renderBrandedEmail({
    eyebrow: 'Resumen ejecutivo diario',
    heading: 'Hoy · Miércoles 2 de septiembre de 2026 (PRUEBA)',
    intro,
    rows: [
      ['Eventos de hoy', '2 eventos\n• Cumpleaños de Sofía (PRUEBA) — 20:00–02:00 · Salón: San Carlos (PRUEBA) · Cliente: Cliente de Prueba · 120 invitados · Confirmado\n• Casamiento Pérez-Gómez (PRUEBA) — 19:00 · Salón: Villa Elisa (PRUEBA) · Reservado'],
      ['Alertas y tareas', '3 pendientes\n• Confirmar cronograma con el cliente\n• Coordinar reunión de montaje\n• Revisar lista de invitados final'],
      ['Pagos de hoy', '1 pago\n• Cuota 2 de Cumpleaños de Sofía (PRUEBA) — Pendiente: ' + money(150000)],
      ['Cierres pendientes', '1 cierre\n• Fiesta de egresados (PRUEBA) — Evento del 30/08/2026 · Salón: La Plata (PRUEBA)']
    ],
    ctaLabel: 'Abrir panel de administración',
    ctaUrl: 'https://www.mymsalones.com.ar/admin/dashboard',
    footerNote: '[PRUEBA] El resumen muestra hasta 5 detalles por categoría. El backoffice conserva el listado completo y actualizado.'
  });
  addJob({
    label: 'Resumen ejecutivo diario',
    subject: 'Resumen del día — Administración (2026-09-02)',
    text: intro,
    html
  });
}

// 3) Recordatorio de pago al cliente (client-payment-reminders.service.ts) — branded HTML
{
  const title = 'Tu pago vence mañana';
  const description = `Cuota 2 de Cumpleaños de Sofía (PRUEBA) por ${money(150000)}. Vencimiento: 2026-09-03.`;
  addJob({
    label: 'Recordatorio de pago al cliente',
    subject: title,
    text: description,
    html: renderBrandedEmail({ eyebrow: 'Recordatorio de pago', heading: title, intro: description })
  });
}

// 4) Seguimiento interno de cobro (collection-followup-reminders.service.ts) — plain
addJob({
  label: 'Seguimiento interno de cobro',
  subject: 'Seguimiento de cobro — la cuota 2',
  text: 'Revisar si Cliente de Prueba ya pagó la cuota 2 (' + money(150000) + '). Si sigue pendiente, contactalo de nuevo.'
});

// 5) Reseña post-evento (post-event-review.service.ts) — branded HTML con CTA
{
  const GOOGLE_REVIEW_URL = 'https://share.google/Zoetd8PLSfJVjAl1C';
  const eventName = 'Cumpleaños de Sofía (PRUEBA)';
  const text = [
    `¡Gracias por elegirnos para ${eventName}!`,
    'Esperamos que haya sido un día inolvidable.',
    '',
    `Nos ayudaría muchísimo que dejes tu reseña acá: ${GOOGLE_REVIEW_URL}`,
    '',
    'Gracias por confiar en nosotros.'
  ].join('\n');
  addJob({
    label: 'Reseña post-evento',
    subject: '¿Cómo fue tu experiencia con M&M Eventos?',
    text,
    html: renderBrandedEmail({
      eyebrow: 'Gracias por elegirnos',
      heading: '¿Cómo fue tu experiencia?',
      intro: `¡Gracias por confiar en M&M Eventos para ${eventName}! Esperamos que haya sido un día inolvidable. Tu opinión nos ayuda muchísimo a seguir mejorando.`,
      ctaLabel: 'Dejar una reseña en Google',
      ctaUrl: GOOGLE_REVIEW_URL,
      footerNote: 'Te va a llevar menos de un minuto — muchas gracias.'
    })
  });
}

// 6) Seguimiento de leads sin atender (lead-followup-reminders.service.ts) — plain, caso escalado
addJob({
  label: 'Seguimiento de lead sin atender (escalado 5 días)',
  subject: 'Lead sin atender hace 5 días: Juan Pérez (PRUEBA)',
  text: 'Revisá y contactá al lead antes de que se enfríe la oportunidad.'
});

// 7) Aviso al cliente: presupuesto por vencer (quote-lifecycle-reminders.service.ts) — branded HTML
{
  const title = 'Tu presupuesto está por vencer';
  const description = 'Tu presupuesto PRES-0001 (PRUEBA) vence el 2026-09-05. Contactanos si querés confirmarlo o necesitás más tiempo.';
  addJob({
    label: 'Aviso al cliente: presupuesto por vencer',
    subject: title,
    text: description,
    html: renderBrandedEmail({ eyebrow: 'Tu presupuesto', heading: title, intro: description, footerNote: 'Si ya nos respondiste, ignorá este mensaje.' })
  });
}

// 8) Seguimiento interno: presupuesto enviado sin respuesta (quote-lifecycle-reminders.service.ts) — plain
addJob({
  label: 'Seguimiento interno de presupuesto sin respuesta',
  subject: 'Presupuesto PRES-0001 (PRUEBA) enviado sin respuesta',
  text: 'El presupuesto sigue "enviado" hace más de 5 días sin aceptar ni rechazar — vale la pena reforzar el contacto.'
});

// 9) Falta generar producción (production-reminders.service.ts) — plain
addJob({
  label: 'Falta generar producción',
  subject: 'Falta generar producción — Cumpleaños de Sofía (PRUEBA)',
  text: 'El evento del 2026-09-20 todavía no tiene un plan de producción vigente.'
});

// 10) Sobre-reserva de vajilla/stock (tableware-overbooking.service.ts) — plain
addJob({
  label: 'Sobre-reserva de vajilla/stock de salón',
  subject: 'Sobre-reserva de Copas de vino (PRUEBA) en San Carlos (PRUEBA) el 2026-09-20',
  text: 'Se reservaron 180 unidades de "Copas de vino (PRUEBA)" para el 2026-09-20, pero el stock disponible es de 150.'
});

// 11) Cierre de evento pendiente (closure-reminders.service.ts) — plain
addJob({
  label: 'Cierre de evento pendiente',
  subject: 'Cierre de evento pendiente (D+7) — Fiesta de egresados (PRUEBA)',
  text: 'El evento ya pasó y su cierre operativo/financiero/administrativo todavía no está completo.'
});

// 12) Saludo de cumpleaños de cliente (birthday-campaigns.service.ts) — branded HTML
addJob({
  label: 'Saludo de cumpleaños de cliente',
  subject: '¡Feliz cumpleaños de parte de M&M Eventos!',
  text: '¡Feliz cumpleaños, Cliente de Prueba! Queremos desearte un día espectacular. Gracias por ser parte de la familia M&M Eventos.',
  html: renderBrandedEmail({
    eyebrow: 'De parte de todo el equipo',
    heading: '¡Feliz cumpleaños, Cliente de Prueba!',
    intro: 'Queremos desearte un día espectacular. Gracias por ser parte de la familia M&M Eventos — esperamos poder acompañarte en muchas más celebraciones.'
  })
});

// 13) Jornada abierta sin fichaje de salida (open-session-alerts.service.ts) — plain
addJob({
  label: 'Jornada abierta sin fichaje de salida',
  subject: 'Jornada abierta sin fichaje de salida',
  text: 'Una jornada lleva abierta más de 8 horas sin marcar salida. Revisala y corregila si hace falta antes de que distorsione la liquidación.'
});

// 14) Liquidación pendiente de generar (payroll-pending-alerts.service.ts) — plain
addJob({
  label: 'Liquidación pendiente de generar',
  subject: 'Liquidación pendiente de generar — Juan Pérez (PRUEBA)',
  text: 'Juan Pérez (PRUEBA) tiene jornadas aprobadas hace más de 35 días sin una liquidación generada.'
});

// 15) Producción sin cerrar (production-close-reminders.service.ts) — plain
addJob({
  label: 'Producción sin cerrar',
  subject: 'Producción sin cerrar (D+3) — Fiesta de egresados (PRUEBA)',
  text: 'El evento del 2026-08-30 ya pasó y su plan de producción todavía no se cerró.'
});

// 16) Recordatorio financiero interno (financial-reminders.service.ts) — plain, con link de acción
addJob({
  label: 'Recordatorio financiero interno (obligación de pago D-3)',
  subject: 'Cuota 2 de Cumpleaños de Sofía (PRUEBA) vence en 3 días',
  text: `Cuota 2 por ${money(150000)}, vencimiento 2026-09-05.\n\nAbrir en M&M Eventos: /admin/events/000000000000000000000001`
});

// 17) Contacto de cobro manual (payment-collection.service.ts) — usa la función real exportada
async function sendPaymentCollectionJob(): Promise<void> {
  const contact: PaymentCollectionContact = {
    target: { source: 'payment', paymentId: '000000000000000000000001' },
    auditEntity: { type: 'Payment', id: '000000000000000000000001' },
    salonId: '000000000000000000000002',
    customer: { id: '000000000000000000000003', fullName: 'Cliente de Prueba', email: TEST_EMAIL, phone: '+5491122334455' },
    obligation: { label: 'el pago 2 (PRUEBA)', amount: 150000, dueDate: '2026-09-05', eventName: 'Cumpleaños de Sofía (PRUEBA)' },
    email: {
      subject: 'Recordatorio cordial de pago pendiente · Cumpleaños de Sofía (PRUEBA)',
      message: [
        'Hola Cliente de Prueba,',
        'Esperamos que estés muy bien.',
        `Te escribimos desde M&M Eventos para recordarte cordialmente que figura pendiente el pago 2 (PRUEBA) por ${money(150000)}, con vencimiento el 5 de septiembre de 2026. Corresponde a Cumpleaños de Sofía (PRUEBA).`,
        'Si ya realizaste el pago, por favor desestimá este mensaje y, si es posible, compartinos el comprobante para actualizar el registro.',
        'Agradecemos mucho tu atención y quedamos atentos.',
        'Saludos cordiales,\nEquipo de M&M Eventos'
      ].join('\n\n')
    },
    whatsapp: { message: '(no aplica a este envío de prueba)' }
  };
  // No DB access: sendPaymentCollectionEmail only reads contact.customer.email in memory.
  await sendPaymentCollectionEmail(contact, `[PRUEBA 1/N] ${contact.email.subject}`, contact.email.message);
  console.log('OK (1/N) Contacto de cobro manual (envío directo, función real)');
}

// 18) Nueva solicitud de presupuesto (quote-request-notifications.service.ts) — branded HTML propia
{
  const request = {
    contactName: 'Juan Pérez (PRUEBA)',
    phone: '+5491122334455',
    email: TEST_EMAIL,
    eventType: 'Casamiento',
    guestCount: 150,
    message: 'Nos interesa una fecha de octubre 2026, buscamos salón con jardín.'
  };
  const salons = 'San Carlos (PRUEBA)';
  const date = '15/10/2026';
  const detailUrl = 'https://www.mymsalones.com.ar/admin/quotes/requests/000000000000000000000004';
  const rows: [string, string][] = [
    ['Cliente', request.contactName],
    ['Teléfono', request.phone],
    ['Email', request.email],
    ['Tipo de evento', request.eventType],
    ['Fecha tentativa', date],
    ['Cantidad de personas', String(request.guestCount)],
    ['Salón de interés', salons],
    ['Mensaje', request.message]
  ];
  const html = `<!doctype html>
<html lang="es">
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Nueva solicitud de presupuesto</title></head>
  <body style="margin:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;color:#18181b;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f4f5;padding:28px 12px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:680px;overflow:hidden;border-radius:22px;background:#ffffff;border:1px solid #e4e4e7;box-shadow:0 18px 45px rgba(24,24,27,.08);">
          <tr><td style="background:#09090b;padding:24px 28px;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>
              <td><img src="cid:${EMAIL_LOGO_CID}" alt="M&M Eventos" width="132" height="56" style="display:block;width:132px;height:auto;border:0;outline:none;text-decoration:none;border-radius:10px;background:#ffffff;"></td>
              <td align="right" style="font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#d4d4d8;">Backoffice</td>
            </tr></table>
          </td></tr>
          <tr><td style="padding:30px 28px 8px;">
            <p style="margin:0 0 10px;font-size:13px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:#71717a;">[PRUEBA] Nueva consulta web</p>
            <h1 style="margin:0;font-size:28px;line-height:1.15;color:#09090b;">Solicitud de presupuesto recibida</h1>
            <p style="margin:12px 0 0;font-size:15px;line-height:1.6;color:#52525b;">Se registró una nueva consulta desde la landing. Ya quedó creada en el backoffice para seguimiento comercial.</p>
          </td></tr>
          <tr><td style="padding:18px 28px 8px;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:separate;border-spacing:0 10px;">
              ${rows.map(([label, value]) => `<tr>
                <td style="width:190px;padding:13px 16px;background:#f4f4f5;border-top-left-radius:12px;border-bottom-left-radius:12px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#71717a;">${escapeHtml(label)}</td>
                <td style="padding:13px 16px;background:#fafafa;border-top-right-radius:12px;border-bottom-right-radius:12px;font-size:15px;line-height:1.45;color:#18181b;">${escapeHtml(value)}</td>
              </tr>`).join('')}
            </table>
          </td></tr>
          <tr><td style="padding:18px 28px 30px;">
            <a href="${detailUrl}" style="display:inline-block;border-radius:12px;background:#18181b;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;padding:14px 18px;">Abrir solicitud en backoffice</a>
            <p style="margin:16px 0 0;font-size:12px;line-height:1.5;color:#71717a;">Si el botón no funciona, ingresá al panel y buscá la solicitud por el nombre o teléfono del cliente.</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
  addJob({
    label: 'Nueva solicitud de presupuesto (landing)',
    subject: 'Nueva solicitud de presupuesto - M&M Eventos',
    text: [
      'Se registró una nueva consulta desde la web.',
      '',
      `Nombre: ${request.contactName}`,
      `Teléfono: ${request.phone}`,
      `Email: ${request.email}`,
      `Tipo de evento: ${request.eventType}`,
      `Fecha tentativa: ${date}`,
      `Cantidad de personas: ${request.guestCount}`,
      `Salón/es de interés: ${salons}`,
      `Mensaje: ${request.message}`,
      '',
      `Link interno: ${detailUrl}`
    ].join('\n'),
    html,
    attachments: logoEmailAttachments()
  });
}

// 19) Confirmación de compra de entradas digitales (ticket.service.ts#confirmedTicketEmailHtml, duplicada)
{
  const order = { buyer: { name: 'Cliente de Prueba' }, publicId: 'ORD-PRUEBA-0001' };
  const publication = {
    title: 'Fiesta Electrónica Verano (PRUEBA)',
    startsAt: new Date('2026-12-05T23:00:00.000Z'),
    venueName: 'Salón San Carlos (PRUEBA)',
    appearance: { secondaryColor: '#d4a373' }
  };
  const tickets = [
    { ticketTypeSnapshot: { name: 'General' }, ticketCode: 'TCK-PRUEBA-0001' },
    { ticketTypeSnapshot: { name: 'General' }, ticketCode: 'TCK-PRUEBA-0002' }
  ];
  const portalUrl = 'https://www.mymsalones.com.ar/entradas/compra/ORD-PRUEBA-0001?token=test';
  const buyer = escapeHtml(order.buyer.name);
  const title = escapeHtml(publication.title);
  const ticketCount = tickets.length;
  const eventDate = new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/Argentina/Buenos_Aires' }).format(publication.startsAt);
  const location = escapeHtml(publication.venueName);
  const accent = publication.appearance.secondaryColor;
  const ticketRows = tickets.map((ticket) => `<tr><td style="padding:10px 0;border-bottom:1px solid #e4e4e7;font:600 14px/20px 'Trebuchet MS',Helvetica,sans-serif;color:#18181b">${escapeHtml(ticket.ticketTypeSnapshot.name)}<br/><span style="font:400 12px/18px 'Trebuchet MS',Helvetica,sans-serif;color:#71717a">Código ${escapeHtml(ticket.ticketCode)}</span></td></tr>`).join('');
  const html = `<!doctype html>
<html lang="es"><body style="margin:0;padding:0;background:#f4f4f5;color:#18181b">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f4f4f5"><tr><td align="center" style="padding:32px 16px">
    <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;background:#ffffff">
      <tr><td style="height:7px;background:${accent};font-size:0;line-height:0">&nbsp;</td></tr>
      <tr><td style="padding:34px 38px 28px;background:#18181b;color:#ffffff">
        <p style="margin:0 0 10px;font:700 11px/16px 'Trebuchet MS',Helvetica,sans-serif;letter-spacing:1.4px;color:${accent}">[PRUEBA] COMPRA CONFIRMADA</p>
        <h1 style="margin:0;font:700 30px/36px 'Trebuchet MS',Helvetica,sans-serif;color:#ffffff">Tus entradas ya están listas</h1>
        <p style="margin:16px 0 0;font:400 16px/24px 'Trebuchet MS',Helvetica,sans-serif;color:#e4e4e7">Hola ${buyer}. Emitimos ${ticketCount} entradas para ${title}.</p>
      </td></tr>
      <tr><td style="padding:28px 38px 8px">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border:1px solid #e4e4e7"><tr>
          <td style="padding:22px 20px;vertical-align:top">
            <p style="margin:0 0 6px;font:700 11px/16px 'Trebuchet MS',Helvetica,sans-serif;letter-spacing:1px;color:#71717a">EVENTO</p>
            <p style="margin:0;font:700 20px/26px 'Trebuchet MS',Helvetica,sans-serif;color:#18181b">${title}</p>
            <p style="margin:18px 0 0;font:700 11px/16px 'Trebuchet MS',Helvetica,sans-serif;letter-spacing:1px;color:#71717a">FECHA Y HORA</p>
            <p style="margin:3px 0 0;font:400 14px/21px 'Trebuchet MS',Helvetica,sans-serif;color:#3f3f46">${escapeHtml(eventDate)}</p>
            <p style="margin:14px 0 0;font:700 11px/16px 'Trebuchet MS',Helvetica,sans-serif;letter-spacing:1px;color:#71717a">LUGAR</p>
            <p style="margin:3px 0 0;font:400 14px/21px 'Trebuchet MS',Helvetica,sans-serif;color:#3f3f46">${location}</p>
          </td>
          <td width="128" align="center" style="width:128px;padding:20px 12px;border-left:1px dashed #d4d4d8;vertical-align:middle;background:#fafafa">
            <p style="margin:0;font:700 11px/16px 'Trebuchet MS',Helvetica,sans-serif;letter-spacing:1px;color:#71717a">ENTRADAS</p>
            <p style="margin:5px 0;font:700 34px/40px 'Trebuchet MS',Helvetica,sans-serif;color:#18181b">${ticketCount}</p>
            <p style="margin:0;font:400 12px/18px 'Trebuchet MS',Helvetica,sans-serif;color:#52525b">Código QR incluido<br/>en el PDF</p>
          </td>
        </tr></table>
      </td></tr>
      <tr><td style="padding:20px 38px 0"><p style="margin:0 0 8px;font:700 11px/16px 'Trebuchet MS',Helvetica,sans-serif;letter-spacing:1px;color:#71717a">TUS ENTRADAS</p><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">${ticketRows}</table></td></tr>
      <tr><td align="center" style="padding:30px 38px 12px"><a href="${escapeHtml(portalUrl)}" style="display:inline-block;padding:14px 24px;background:#18181b;color:#ffffff;font:700 14px/20px 'Trebuchet MS',Helvetica,sans-serif;text-decoration:none">Ver mis entradas y códigos QR</a></td></tr>
      <tr><td align="center" style="padding:12px 38px 34px"><p style="margin:0;font:400 12px/18px 'Trebuchet MS',Helvetica,sans-serif;color:#71717a">Orden ${escapeHtml(order.publicId)} · También podés presentar las entradas desde tu teléfono.</p></td></tr>
    </table>
  </td></tr></table>
</body></html>`;
  addJob({
    label: 'Confirmación de compra de entradas digitales',
    subject: `Tus entradas para ${publication.title}`,
    text: `Hola ${order.buyer.name}. Tu compra para ${publication.title} fue confirmada. Orden: ${order.publicId}. Ver tus entradas: ${portalUrl}`,
    html
  });
}

// 20-25) Emails de ciclo de vida de entradas (ticket.service.ts#lifecycleEmailContent, duplicada, 6 canales)
{
  const order = { buyer: { name: 'Cliente de Prueba' }, publicId: 'ORD-PRUEBA-0002', totalAmount: 45000, currency: 'ARS' };
  const publication = { title: 'Fiesta Electrónica Verano (PRUEBA)', startsAt: new Date('2026-12-05T23:00:00.000Z'), venueName: 'Salón San Carlos (PRUEBA)' };
  const portalUrl = 'https://www.mymsalones.com.ar/entradas/compra/ORD-PRUEBA-0002?token=test';
  const buyer = escapeHtml(order.buyer.name);
  const event = escapeHtml(publication.title);
  const eventDate = new Intl.DateTimeFormat('es-AR', { dateStyle: 'full', timeStyle: 'short', timeZone: 'America/Argentina/Buenos_Aires' }).format(publication.startsAt);
  const location = escapeHtml(publication.venueName);
  const amount = formatTicketAmount(order.totalAmount, order.currency);
  const details = `<p><b>Orden:</b> ${escapeHtml(order.publicId)}<br/><b>Evento:</b> ${event}<br/><b>Fecha:</b> ${eventDate}<br/><b>Lugar:</b> ${location}</p>`;
  const link = `<p><a href="${portalUrl}">Ver el estado de mi compra</a></p>`;

  const channels: Record<string, { subject: string; heading: string; body: string }> = {
    payment_pending: {
      subject: `Completá el pago de tu compra · ${publication.title}`,
      heading: 'Tu reserva está esperando el pago',
      body: `Reservamos tus entradas por ${amount}. Podés volver al checkout desde tu portal de compra antes de que venza la reserva.`
    },
    payment_rejected: {
      subject: `No pudimos confirmar tu pago · ${publication.title}`,
      heading: 'Tu pago no pudo ser confirmado',
      body: 'No se realizó ningún cargo confirmado para esta orden. Si querés intentarlo nuevamente, ingresá al portal y revisá el estado de tu compra.'
    },
    checkout_abandoned: {
      subject: `Tu reserva venció · ${publication.title}`,
      heading: 'La reserva de tus entradas venció',
      body: 'Como no recibimos la confirmación del pago a tiempo, liberamos los cupos. Podés volver a la publicación si querés iniciar una nueva compra, sujeta a disponibilidad.'
    },
    refund_confirmation: {
      subject: `Reembolso confirmado · ${publication.title}`,
      heading: 'Tu reembolso fue confirmado',
      body: `El reembolso por ${amount} fue registrado. Los tiempos de acreditación dependen del medio de pago y de tu entidad financiera.`
    },
    event_reminder_48h: {
      subject: `Faltan 48 horas · ${publication.title}`,
      heading: 'Faltan 48 horas para el evento',
      body: 'Te recordamos los datos del evento. Desde el portal podés consultar tus entradas y sus códigos QR.'
    },
    event_reminder_24h: {
      subject: `Mañana es el evento · ${publication.title}`,
      heading: 'Mañana nos encontramos',
      body: 'Tené a mano tus entradas y los códigos QR antes de llegar. Te recomendamos revisar la ubicación y el horario.'
    }
  };

  for (const [channel, message] of Object.entries(channels)) {
    addJob({
      label: `Ciclo de vida de entradas: ${channel}`,
      subject: message.subject,
      text: `${message.heading}\n\nHola ${order.buyer.name}. ${message.body}\n\nOrden: ${order.publicId}\nEvento: ${publication.title}\nFecha: ${eventDate}\nLugar: ${publication.venueName}\n\n${portalUrl}`,
      html: `<main style="font-family:'Trebuchet MS',Helvetica,sans-serif;color:#18181b;line-height:1.5"><h1>${message.heading}</h1><p>Hola ${buyer}.</p><p>${message.body}</p>${details}${link}</main>`
    });
  }
}

async function main(): Promise<void> {
  const total = jobs.length + 1; // +1 for the payment-collection job sent via the real exported function
  console.log(`Enviando ${total} emails de prueba a ${TEST_EMAIL}...`);
  await sendPaymentCollectionJob();
  await new Promise((resolve) => setTimeout(resolve, 400));
  let index = 2; // job 1 was payment-collection, sent above
  for (const job of jobs) {
    const sent = await sendEmail({
      to: TEST_EMAIL,
      subject: `[PRUEBA ${index}/${total}] ${job.subject}`,
      text: job.text,
      html: job.html,
      attachments: job.attachments
    });
    console.log(`${sent ? 'OK ' : 'SKIP'} (${index}/${total}) ${job.label}`);
    index += 1;
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  console.log('Listo.');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error enviando emails de prueba:', error);
    process.exit(1);
  });
