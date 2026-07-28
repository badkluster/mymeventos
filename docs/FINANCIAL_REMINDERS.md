# Recordatorios financieros

## Alcance

El proceso automático controla las obligaciones financieras de los eventos con
contrato aprobado. Toma como fuente principal las cuotas abiertas de
`Event.paymentPlanSnapshot` (con fallback al snapshot del contrato) y, además,
los `Payment` manuales pendientes que tengan vencimiento y no representen una
cuota del plan.

No se generan avisos para eventos cancelados/perdidos, contratos no aprobados,
cuotas pagadas/canceladas, pagos pagados/cancelados/reintegrados ni saldos cero.
Todas las comparaciones de fechas se hacen por día civil en
`America/Argentina/Buenos_Aires`.

## Cadencia vigente

| Regla | Momento |
|---|---:|
| Pago por vencer | 7 días antes |
| Pago por vencer | 3 días antes |
| Vence hoy | Día de vencimiento |
| Vencido | 1 día después |
| Segundo aviso | 3 días después |
| Escalamiento | 7 días después |
| Saldo pendiente del contrato | 15 días antes del evento |

Los plazos del segundo aviso y del escalamiento no estaban definidos en el
pedido original; se fijaron en D+3 y D+7 como política inicial. Si un proceso
no corrió, el siguiente tick emite el nivel actual sin reconstruir todos los
avisos históricos.

## Destinatarios y canales

Los recordatorios son internos. Se resuelve primero la persona asignada al lead,
luego el responsable del salón y, si no hay ninguno activo, administradores o
managers activos. El aviso de saldo incluye responsable y manager; el
escalamiento añade administradores/managers activos.

Cada destinatario puede desactivar **Recordatorios financieros** desde sus
preferencias. Se crea una notificación interna y se intenta enviar email cuando
la persona tiene ambos canales habilitados. No se envían mensajes al cliente ni
por WhatsApp: el proyecto no tiene proveedor transaccional de WhatsApp y no se
simula una integración inexistente.

Esto aplica a la automatización: sus destinatarios siguen siendo internos. Para
una obligación ya vencida, el backoffice sí ofrece una acción manual y
auditable para contactar al cliente con texto editable por email o mediante un
borrador de WhatsApp. No forma parte del cron ni afirma que WhatsApp haya
enviado el mensaje. Ver [Contacto de cobro ante pagos vencidos](PAYMENT_COLLECTION_CONTACT.md).

## Idempotencia y reintentos

Cada etapa crea o actualiza un `CalendarItem` de sistema (`payment_window`) con
una `automationKey` estable por obligación, fecha y regla. La misma clave se
usa por usuario en `Notification`, de modo que reintentos o ticks solapados no
generan notificaciones internas duplicadas.

Antes de entregar un aviso, el proceso toma un lease de diez minutos en
`CalendarItem.notification`. Si falla, se guarda el error y se reintenta una
hora después. Al cobrar, cancelar, eliminar una cuota o invalidar el contrato,
el proceso cancela los avisos pendientes; también vuelve a validar el estado
antes de enviar.

## Ejecución programada

El endpoint interno es `GET` o `POST /api/internal/calendar-tick`. Requiere
`Authorization: Bearer <CRON_SECRET>` o el header `x-cron-secret`; acepta
opcionalmente `{ "maxTicks": 1..3 }` en POST.

La cadencia principal está en `.github/workflows/financial-reminders-cron.yml`
y ejecuta cada 10 minutos. Deben configurarse estos secretos en GitHub Actions:

- `FINANCIAL_REMINDERS_APP_BASE_URL` (por ejemplo `https://dominio.com`)
- `CRON_SECRET` (el mismo valor que usa la API)

`vercel.json` deja un tick diario como red de seguridad. Vercel debe tener
`CRON_SECRET`; si Marketing conserva su fallback diario, ese valor también debe
coincidir con `MARKETING_CRON_SECRET` porque Marketing valida su propio secreto.

Para una comprobación manual segura:

```bash
curl --request POST "$BASE_URL/api/internal/calendar-tick" \
  --header "Authorization: Bearer $CRON_SECRET" \
  --header "Content-Type: application/json" \
  --data '{"maxTicks":1}'
```

La respuesta enumera los ticks ejecutados con `synced`, `delivered`, `skipped`,
`failed` y `hasMore`.
