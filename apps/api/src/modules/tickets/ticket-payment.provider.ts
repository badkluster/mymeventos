import { createHmac, timingSafeEqual } from 'crypto';
import { env } from '../../config/env';

export type TicketProviderPaymentStatus = 'created' | 'pending' | 'approved' | 'rejected' | 'cancelled' | 'expired' | 'refunded' | 'partially_refunded';
export type CreateTicketCheckoutInput = { orderId: string; orderCode: string; title: string; amount: number; currency: string; buyer: { name: string; email: string }; notificationUrl?: string; returnUrl?: string };
export type CreateTicketCheckoutResult = { providerPaymentId: string; providerPreferenceId?: string; checkoutUrl: string; status: TicketProviderPaymentStatus };
export type TicketProviderPayment = { providerPaymentId: string; status: TicketProviderPaymentStatus; statusDetail?: string; amount?: number; currency?: string; externalReference?: string; paymentMethod?: string; raw?: unknown };
export type RefundTicketPaymentInput = { providerPaymentId: string; amount?: number; idempotencyKey: string };
export type TicketProviderRefund = { providerRefundId: string; status: 'approved' | 'rejected' | 'pending'; amount?: number };
export type ValidateTicketWebhookInput = { requestId?: string; signature?: string; dataId?: string; rawBody?: string };

export interface TicketPaymentProvider {
  readonly name: 'mock' | 'mercado_pago';
  createCheckout(input: CreateTicketCheckoutInput): Promise<CreateTicketCheckoutResult>;
  getPayment(providerPaymentId: string): Promise<TicketProviderPayment>;
  cancelPayment(providerPaymentId: string, idempotencyKey: string): Promise<TicketProviderPayment>;
  refundPayment(input: RefundTicketPaymentInput): Promise<TicketProviderRefund>;
  getRefunds(providerPaymentId: string): Promise<TicketProviderRefund[]>;
  validateWebhook(input: ValidateTicketWebhookInput): Promise<boolean>;
}

export class MockTicketPaymentProvider implements TicketPaymentProvider {
  readonly name = 'mock' as const;
  async createCheckout(input: CreateTicketCheckoutInput): Promise<CreateTicketCheckoutResult> { return { providerPaymentId: `mock_${input.orderCode}`, providerPreferenceId: `mock_pref_${input.orderCode}`, checkoutUrl: `${env.CORS_ORIGIN}/entradas/mock-payment/${input.orderCode}`, status: 'pending' }; }
  async getPayment(providerPaymentId: string): Promise<TicketProviderPayment> { return { providerPaymentId, status: 'pending' }; }
  async cancelPayment(providerPaymentId: string): Promise<TicketProviderPayment> { return { providerPaymentId, status: 'cancelled' }; }
  async refundPayment(input: RefundTicketPaymentInput): Promise<TicketProviderRefund> { return { providerRefundId: `mock_refund_${input.idempotencyKey.slice(0, 18)}`, status: 'approved', amount: input.amount }; }
  async getRefunds(): Promise<TicketProviderRefund[]> { return []; }
  async validateWebhook(): Promise<boolean> { return true; }
}

export class MercadoPagoTicketPaymentProvider implements TicketPaymentProvider {
  readonly name = 'mercado_pago' as const;
  private get token() { if (!env.MERCADO_PAGO_ACCESS_TOKEN) throw new Error('Mercado Pago no está configurado.'); return env.MERCADO_PAGO_ACCESS_TOKEN; }
  private async request(path: string, init?: RequestInit) { const response = await fetch(`https://api.mercadopago.com${path}`, { ...init, headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json', ...(init?.headers ?? {}) } }); if (!response.ok) throw new Error('No se pudo comunicar con Mercado Pago.'); return response.json() as Promise<any>; }
  async createCheckout(input: CreateTicketCheckoutInput): Promise<CreateTicketCheckoutResult> { const preference = await this.request('/checkout/preferences', { method: 'POST', body: JSON.stringify({ external_reference: input.orderId, metadata: { ticket_order_id: input.orderId, ticket_order_code: input.orderCode }, notification_url: input.notificationUrl, back_urls: input.returnUrl ? { success: input.returnUrl, pending: input.returnUrl, failure: input.returnUrl } : undefined, auto_return: input.returnUrl ? 'approved' : undefined, payer: { email: input.buyer.email, name: input.buyer.name }, items: [{ title: input.title, quantity: 1, unit_price: input.amount, currency_id: input.currency }] }) }); return { providerPaymentId: `mp_pref_${preference.id}`, providerPreferenceId: preference.id, checkoutUrl: preference.init_point, status: 'created' }; }
  async getPayment(providerPaymentId: string): Promise<TicketProviderPayment> { const payment = await this.request(`/v1/payments/${providerPaymentId}`); const map: Record<string, TicketProviderPaymentStatus> = { approved: 'approved', rejected: 'rejected', cancelled: 'cancelled', refunded: 'refunded', charged_back: 'cancelled', in_process: 'pending', pending: 'pending' }; return { providerPaymentId: String(payment.id), status: map[payment.status] ?? 'pending', statusDetail: payment.status_detail, amount: payment.transaction_amount, currency: payment.currency_id, externalReference: payment.external_reference ?? payment.metadata?.ticket_order_id, paymentMethod: payment.payment_method_id, raw: payment }; }
  async cancelPayment(providerPaymentId: string): Promise<TicketProviderPayment> { const payment = await this.request(`/v1/payments/${providerPaymentId}`, { method: 'PUT', body: JSON.stringify({ status: 'cancelled' }) }); return { providerPaymentId: String(payment.id), status: 'cancelled', raw: payment }; }
  async refundPayment(input: RefundTicketPaymentInput): Promise<TicketProviderRefund> { const refund = await this.request(`/v1/payments/${input.providerPaymentId}/refunds`, { method: 'POST', headers: { 'X-Idempotency-Key': input.idempotencyKey }, body: JSON.stringify(input.amount ? { amount: input.amount } : {}) }); return { providerRefundId: String(refund.id), status: refund.status === 'approved' ? 'approved' : 'pending', amount: refund.amount }; }
  async getRefunds(providerPaymentId: string): Promise<TicketProviderRefund[]> { const refunds = await this.request(`/v1/payments/${providerPaymentId}/refunds`); return (refunds ?? []).map((refund: any) => ({ providerRefundId: String(refund.id), status: refund.status === 'approved' ? 'approved' : refund.status === 'rejected' ? 'rejected' : 'pending', amount: refund.amount })); }
  async validateWebhook(input: ValidateTicketWebhookInput): Promise<boolean> { if (!env.MERCADO_PAGO_WEBHOOK_SECRET) return false; if (!input.signature || !input.dataId) return false; const value = `id:${input.dataId};request-id:${input.requestId ?? ''};ts:${input.signature.match(/ts=([^,]+)/)?.[1] ?? ''};`; const expected = createHmac('sha256', env.MERCADO_PAGO_WEBHOOK_SECRET).update(value).digest('hex'); const received = input.signature.match(/v1=([^,]+)/)?.[1] ?? ''; return received.length === expected.length && timingSafeEqual(Buffer.from(received), Buffer.from(expected)); }
}

export function getTicketPaymentProvider(): TicketPaymentProvider { return env.TICKET_PAYMENT_PROVIDER === 'mercado_pago' && env.MERCADO_PAGO_ACCESS_TOKEN ? new MercadoPagoTicketPaymentProvider() : new MockTicketPaymentProvider(); }
