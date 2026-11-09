import { Keypair } from '@solana/web3.js';
import { TreasuryGuard } from '../src/treasury';

describe('TreasuryGuard Circuit Breaker & Velocity Anomaly Tests', () => {
  const owner = Keypair.generate().publicKey;
  const recipient = Keypair.generate().publicKey;

  it('trips circuit breaker when burst threshold is breached', () => {
    const guard = new TreasuryGuard(
      {
        owner,
        dailySpendLimitLamports: 100_000_000_000n,
        maxTransactionLimitLamports: 10_000_000_000n,
        whitelistedRecipients: new Set(),
        enforceWhitelist: false,
        rateLimitPerMinute: 100,
      },
      undefined,
      {
        maxBurstTransactions: 3,
        burstWindowMs: 2000,
        cooldownPeriodMs: 5000,
      }
    );

    // Rapidly execute 3 transfers (reaching threshold)
    guard.validateTransfer({ recipient, lamports: 1_000_000n });
    guard.recordTransfer(1_000_000n);

    guard.validateTransfer({ recipient, lamports: 1_000_000n });
    guard.recordTransfer(1_000_000n);

    guard.validateTransfer({ recipient, lamports: 1_000_000n });
    guard.recordTransfer(1_000_000n);

    // 4th transfer should trip velocity circuit breaker
    expect(() => {
      guard.validateTransfer({ recipient, lamports: 1_000_000n });
    }).toThrow('Velocity circuit breaker TRIPPED');

    expect(guard.getState().circuitBreakerActive).toBe(true);

    // Subsequent transfer during cooldown should be blocked
    expect(() => {
      guard.validateTransfer({ recipient, lamports: 1_000_000n });
    }).toThrow(/Circuit breaker is ACTIVE/);
  });

  it('allows immediate resumption after manual reset', () => {
    const guard = new TreasuryGuard(
      {
        owner,
        dailySpendLimitLamports: 100_000_000_000n,
        maxTransactionLimitLamports: 10_000_000_000n,
        whitelistedRecipients: new Set(),
        enforceWhitelist: false,
        rateLimitPerMinute: 100,
      },
      undefined,
      {
        maxBurstTransactions: 2,
        burstWindowMs: 1000,
        cooldownPeriodMs: 10_000,
      }
    );

    guard.recordTransfer(1_000n);
    guard.recordTransfer(1_000n);

    expect(() => {
      guard.validateTransfer({ recipient, lamports: 1_000n });
    }).toThrow(/circuit breaker/i);

    // Reset circuit breaker
    guard.resetCircuitBreaker();
    expect(guard.getState().circuitBreakerActive).toBe(false);

    // Should succeed now
    expect(() => {
      guard.validateTransfer({ recipient, lamports: 1_000n });
    }).not.toThrow();
  });

  it('correctly tracks dynamic whitelist additions and removals', () => {
    const freshRecipient = Keypair.generate().publicKey;
    const guard = new TreasuryGuard({
      owner,
      dailySpendLimitLamports: 10_000_000_000n,
      maxTransactionLimitLamports: 1_000_000_000n,
      whitelistedRecipients: new Set(),
      enforceWhitelist: true,
      rateLimitPerMinute: 50,
    });

    // Unlisted recipient throws
    expect(() => {
      guard.validateTransfer({ recipient: freshRecipient, lamports: 50_000n });
    }).toThrow(/whitelist/i);

    // Add recipient to whitelist
    guard.addWhitelistedRecipient(freshRecipient);

    // Should now succeed
    expect(() => {
      guard.validateTransfer({ recipient: freshRecipient, lamports: 50_000n });
    }).not.toThrow();

    // Remove recipient
    guard.removeWhitelistedRecipient(freshRecipient);

    // Should fail again
    expect(() => {
      guard.validateTransfer({ recipient: freshRecipient, lamports: 50_000n });
    }).toThrow(/whitelist/i);
  });

  it('rejects zero and negative lamport amounts', () => {
    const guard = new TreasuryGuard({
      owner,
      dailySpendLimitLamports: 10_000_000_000n,
      maxTransactionLimitLamports: 1_000_000_000n,
      whitelistedRecipients: new Set(),
      enforceWhitelist: false,
      rateLimitPerMinute: 50,
    });

    expect(() => {
      guard.validateTransfer({ recipient, lamports: 0n });
    }).toThrow(/must be positive/i);

    expect(() => {
      guard.validateTransfer({ recipient, lamports: -500n });
    }).toThrow(/must be positive/i);
  });
});
