import { WebhookDispatcher } from '../src/webhooks';

describe('WebhookDispatcher Cryptographic Signature & Payload Tests', () => {
  const secret = 'test_webhook_secret_key_12345';
  const dispatcher = new WebhookDispatcher({ webhookSecret: secret });

  it('signs payload and verifies valid signature using constant-time comparison', () => {
    const timestamp = Date.now();
    const payloadStr = JSON.stringify({ event: 'treasury.payout.dispatched', amount: '1000' });

    const signature = dispatcher.signPayload(timestamp, payloadStr);
    expect(signature).toBeDefined();
    expect(signature.length).toBe(64); // SHA-256 hex string

    const isValid = dispatcher.verifySignature(timestamp, payloadStr, signature);
    expect(isValid).toBe(true);
  });

  it('rejects tampered payload content or modified timestamp', () => {
    const timestamp = Date.now();
    const payloadStr = JSON.stringify({ amount: '500' });
    const signature = dispatcher.signPayload(timestamp, payloadStr);

    // Tampered payload
    const tamperedPayload = JSON.stringify({ amount: '99999' });
    expect(dispatcher.verifySignature(timestamp, tamperedPayload, signature)).toBe(false);

    // Tampered timestamp
    expect(dispatcher.verifySignature(timestamp + 1000, payloadStr, signature)).toBe(false);
  });

  it('creates structured webhook payload with unique event id and timestamp', () => {
    const payload = dispatcher.createPayload('treasury.circuit_breaker.tripped', {
      burstCount: 6,
      cooldownSec: 30,
    });

    expect(payload.id).toMatch(/^evt_\d+_[a-f0-9]{8}$/);
    expect(payload.event).toBe('treasury.circuit_breaker.tripped');
    expect(payload.timestamp).toBeGreaterThan(0);
    expect(payload.data.burstCount).toBe(6);
  });
});
