import crypto from 'crypto';

export type TreasuryWebhookEvent =
  | 'treasury.payout.dispatched'
  | 'treasury.payout.validated'
  | 'treasury.circuit_breaker.tripped'
  | 'treasury.approval.required'
  | 'treasury.risk.blocked';

export interface WebhookPayload<T = Record<string, any>> {
  id: string;
  event: TreasuryWebhookEvent;
  timestamp: number;
  data: T;
}

export interface WebhookConfig {
  webhookSecret: string;
  targetUrl?: string;
  maxRetries?: number;
  initialBackoffMs?: number;
}

export class WebhookDispatcher {
  private secret: string;
  private targetUrl?: string;
  private maxRetries: number;
  private initialBackoffMs: number;

  constructor(config: WebhookConfig) {
    this.secret = config.webhookSecret;
    this.targetUrl = config.targetUrl;
    this.maxRetries = config.maxRetries ?? 3;
    this.initialBackoffMs = config.initialBackoffMs ?? 500;
  }

  public signPayload(timestamp: number, payloadStr: string): string {
    const signaturePayload = `${timestamp}.${payloadStr}`;
    return crypto.createHmac('sha256', this.secret).update(signaturePayload).digest('hex');
  }

  public verifySignature(timestamp: number, payloadStr: string, signature: string): boolean {
    const expected = this.signPayload(timestamp, payloadStr);
    const expectedBuf = Buffer.from(expected, 'hex');
    const signatureBuf = Buffer.from(signature, 'hex');

    if (expectedBuf.length !== signatureBuf.length) {
      return false;
    }

    return crypto.timingSafeEqual(expectedBuf, signatureBuf);
  }

  public createPayload<T>(event: TreasuryWebhookEvent, data: T): WebhookPayload<T> {
    return {
      id: `evt_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
      event,
      timestamp: Date.now(),
      data,
    };
  }

  public async dispatch<T>(
    event: TreasuryWebhookEvent,
    data: T,
    overrideUrl?: string
  ): Promise<{ success: boolean; attempts: number; error?: string }> {
    const url = overrideUrl || this.targetUrl;
    if (!url) {
      throw new Error('WebhookDispatcher: Target URL is not specified.');
    }

    const payload = this.createPayload(event, data);
    const payloadStr = JSON.stringify(payload);
    const signature = this.signPayload(payload.timestamp, payloadStr);

    let attempts = 0;
    let delay = this.initialBackoffMs;

    while (attempts < this.maxRetries) {
      attempts++;
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Treasury-Signature': `sha256=${signature}`,
            'X-Treasury-Timestamp': payload.timestamp.toString(),
            'X-Treasury-Event': event,
          },
          body: payloadStr,
        });

        if (response.ok) {
          return { success: true, attempts };
        }
      } catch (err: any) {
        if (attempts >= this.maxRetries) {
          return { success: false, attempts, error: err.message };
        }
      }

      await new Promise(resolve => setTimeout(resolve, delay));
      delay *= 2;
    }

    return { success: false, attempts, error: 'Max retries exhausted' };
  }
}
