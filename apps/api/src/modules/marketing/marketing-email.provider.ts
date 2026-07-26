import { createHmac, randomUUID, timingSafeEqual } from 'crypto';
import { env } from '../../config/env';

export type SendMarketingEmailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
  from: string;
  replyTo?: string;
  tags?: { name: string; value: string }[];
};

export type SendMarketingEmailResult = {
  to: string;
  success: boolean;
  providerMessageId?: string;
  errorMessage?: string;
};

export interface MarketingEmailProvider {
  readonly name: 'mock' | 'resend';
  sendBatch(inputs: SendMarketingEmailInput[]): Promise<SendMarketingEmailResult[]>;
  verifyWebhookSignature(headers: Record<string, string | string[] | undefined>, rawBody: Buffer | undefined): boolean;
}

const RESEND_BATCH_LIMIT = 100;

export class MockMarketingEmailProvider implements MarketingEmailProvider {
  readonly name = 'mock' as const;
  async sendBatch(inputs: SendMarketingEmailInput[]): Promise<SendMarketingEmailResult[]> {
    return inputs.map((input) => ({ to: input.to, success: true, providerMessageId: `mock_${randomUUID()}` }));
  }
  verifyWebhookSignature(): boolean {
    return true;
  }
}

export class ResendMarketingEmailProvider implements MarketingEmailProvider {
  readonly name = 'resend' as const;

  private get apiKey(): string {
    if (!env.RESEND_API_KEY) throw new Error('Resend no está configurado (falta RESEND_API_KEY).');
    return env.RESEND_API_KEY;
  }

  async sendBatch(inputs: SendMarketingEmailInput[]): Promise<SendMarketingEmailResult[]> {
    if (!inputs.length) return [];
    const results: SendMarketingEmailResult[] = [];
    for (let offset = 0; offset < inputs.length; offset += RESEND_BATCH_LIMIT) {
      const chunk = inputs.slice(offset, offset + RESEND_BATCH_LIMIT);
      results.push(...(await this.sendChunk(chunk)));
    }
    return results;
  }

  private async sendChunk(chunk: SendMarketingEmailInput[]): Promise<SendMarketingEmailResult[]> {
    let response: Response;
    try {
      response = await fetch('https://api.resend.com/emails/batch', {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(
          chunk.map((input) => ({
            from: input.from,
            to: [input.to],
            subject: input.subject,
            html: input.html,
            text: input.text,
            reply_to: input.replyTo || undefined,
            tags: input.tags
          }))
        )
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error de red al contactar a Resend.';
      return chunk.map((input) => ({ to: input.to, success: false, errorMessage: message }));
    }
    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      return chunk.map((input) => ({ to: input.to, success: false, errorMessage: `Resend ${response.status}: ${errorText.slice(0, 300)}` }));
    }
    const body = (await response.json().catch(() => ({}))) as { data?: Array<{ id?: string }> };
    const items = body.data ?? [];
    return chunk.map((input, index) => {
      const messageId = items[index]?.id;
      return messageId
        ? { to: input.to, success: true, providerMessageId: messageId }
        : { to: input.to, success: false, errorMessage: 'Resend no devolvió un id de mensaje para este destinatario.' };
    });
  }

  // Resend delivers webhooks through Svix. Svix signs `${id}.${timestamp}.${rawBody}`
  // with HMAC-SHA256 using the base64 payload of a `whsec_...` secret, and sends one
  // or more space-separated `v1,<base64 signature>` candidates in `svix-signature`.
  // Verified by hand (no `svix` package) to keep the same "fetch + crypto, no SDK"
  // convention already used for the Mercado Pago webhook.
  verifyWebhookSignature(headers: Record<string, string | string[] | undefined>, rawBody: Buffer | undefined): boolean {
    if (!env.RESEND_WEBHOOK_SECRET || !rawBody) return false;
    const svixId = firstHeaderValue(headers['svix-id']);
    const svixTimestamp = firstHeaderValue(headers['svix-timestamp']);
    const svixSignature = firstHeaderValue(headers['svix-signature']);
    if (!svixId || !svixTimestamp || !svixSignature) return false;

    const timestampSeconds = Number(svixTimestamp);
    if (!Number.isFinite(timestampSeconds) || Math.abs(Date.now() / 1000 - timestampSeconds) > 60 * 5) return false;

    const secretPayload = env.RESEND_WEBHOOK_SECRET.startsWith('whsec_')
      ? env.RESEND_WEBHOOK_SECRET.slice('whsec_'.length)
      : env.RESEND_WEBHOOK_SECRET;
    const secretBytes = Buffer.from(secretPayload, 'base64');
    const signedContent = `${svixId}.${svixTimestamp}.${rawBody.toString('utf8')}`;
    const expected = createHmac('sha256', secretBytes).update(signedContent).digest('base64');
    const expectedBuffer = Buffer.from(expected, 'base64');

    return svixSignature
      .split(' ')
      .map((candidate) => candidate.split(',')[1])
      .filter((candidate): candidate is string => Boolean(candidate))
      .some((candidate) => {
        const candidateBuffer = Buffer.from(candidate, 'base64');
        return candidateBuffer.length === expectedBuffer.length && timingSafeEqual(candidateBuffer, expectedBuffer);
      });
  }
}

function firstHeaderValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function getMarketingEmailProvider(): MarketingEmailProvider {
  const useResend = env.MARKETING_EMAIL_PROVIDER === 'resend' && Boolean(env.RESEND_API_KEY);
  if (!useResend && env.NODE_ENV === 'production' && env.MARKETING_EMAIL_PROVIDER === 'resend')
    throw new Error('Resend no está configurado: no se puede usar el simulador de envío de campañas en producción.');
  return useResend ? new ResendMarketingEmailProvider() : new MockMarketingEmailProvider();
}
