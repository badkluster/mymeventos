import { createHmac } from 'crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { SECRET_PAYLOAD } = vi.hoisted(() => ({ SECRET_PAYLOAD: Buffer.from('0123456789abcdef0123456789abcdef').toString('base64') }));

vi.mock('../src/config/env', () => ({
  env: { RESEND_WEBHOOK_SECRET: `whsec_${SECRET_PAYLOAD}`, MARKETING_EMAIL_PROVIDER: 'resend', RESEND_API_KEY: 'test-key', NODE_ENV: 'test' }
}));

import { ResendMarketingEmailProvider } from '../src/modules/marketing/marketing-email.provider';

afterEach(() => {
  vi.unstubAllGlobals();
});

function signPayload(id: string, timestamp: string, body: string): string {
  const secretBytes = Buffer.from(SECRET_PAYLOAD, 'base64');
  return createHmac('sha256', secretBytes).update(`${id}.${timestamp}.${body}`).digest('base64');
}

describe('Resend webhook signature verification (Svix scheme)', () => {
  const provider = new ResendMarketingEmailProvider();

  it('accepts a correctly signed, fresh payload', () => {
    const id = 'msg_123';
    const timestamp = String(Math.floor(Date.now() / 1000));
    const body = '{"type":"email.delivered"}';
    const signature = signPayload(id, timestamp, body);

    const valid = provider.verifyWebhookSignature({ 'svix-id': id, 'svix-timestamp': timestamp, 'svix-signature': `v1,${signature}` }, Buffer.from(body));

    expect(valid).toBe(true);
  });

  it('rejects the payload if its body was tampered with after signing', () => {
    const id = 'msg_123';
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = signPayload(id, timestamp, '{"type":"email.delivered"}');

    const valid = provider.verifyWebhookSignature({ 'svix-id': id, 'svix-timestamp': timestamp, 'svix-signature': `v1,${signature}` }, Buffer.from('{"type":"email.clicked"}'));

    expect(valid).toBe(false);
  });

  it('rejects a stale timestamp outside the replay-protection window', () => {
    const id = 'msg_123';
    const staleTimestamp = String(Math.floor(Date.now() / 1000) - 3600);
    const body = '{}';
    const signature = signPayload(id, staleTimestamp, body);

    const valid = provider.verifyWebhookSignature({ 'svix-id': id, 'svix-timestamp': staleTimestamp, 'svix-signature': `v1,${signature}` }, Buffer.from(body));

    expect(valid).toBe(false);
  });

  it('rejects the payload when required Svix headers are missing', () => {
    expect(provider.verifyWebhookSignature({}, Buffer.from('{}'))).toBe(false);
  });

  it('rejects when no raw body was captured', () => {
    const id = 'msg_123';
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = signPayload(id, timestamp, '{}');
    expect(provider.verifyWebhookSignature({ 'svix-id': id, 'svix-timestamp': timestamp, 'svix-signature': `v1,${signature}` }, undefined)).toBe(false);
  });
});

describe('Resend send errors', () => {
  const provider = new ResendMarketingEmailProvider();

  it('turns an unverified-domain response into an actionable message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      statusCode: 403,
      name: 'validation_error',
      message: 'The domain gmail.com is not verified. Please, add and verify your domain.'
    }), { status: 403 })));

    const [result] = await provider.sendBatch([{
      to: 'destinatario@example.com',
      from: 'M&M Eventos <info@gmail.com>',
      subject: 'Prueba',
      html: '<p>Prueba</p>',
      text: 'Prueba'
    }]);

    expect(result).toMatchObject({
      success: false,
      errorMessage: 'El dominio remitente "gmail.com" no está verificado en Resend. Configurá en Marketing > Configuración un email de un dominio verificado. Un Gmail puede usarse como email de respuesta, pero no como remitente.'
    });
    expect(result.errorMessage).not.toContain('statusCode');
  });
});
