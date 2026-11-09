import { Keypair } from '@solana/web3.js';
import { TreasuryGuard } from '../src/treasury';

describe('TreasuryGuard Policy & Limit Tests', () => {
  const owner = Keypair.generate().publicKey;
  const recipientA = Keypair.generate().publicKey;
  const recipientB = Keypair.generate().publicKey;

  it('permits valid transfer within limits', () => {
    const guard = new TreasuryGuard({
      owner,
      dailySpendLimitLamports: 10_000_000_000n,
      maxTransactionLimitLamports: 1_000_000_000n,
      whitelistedRecipients: new Set(),
      enforceWhitelist: false,
      rateLimitPerMinute: 10,
    });

    expect(() => {
      guard.validateTransfer({
        recipient: recipientA,
        lamports: 500_000_000n,
      });
    }).not.toThrow();
  });

  it('rejects transfer exceeding single transaction limit', () => {
    const guard = new TreasuryGuard({
      owner,
      dailySpendLimitLamports: 10_000_000_000n,
      maxTransactionLimitLamports: 1_000_000_000n,
      whitelistedRecipients: new Set(),
      enforceWhitelist: false,
      rateLimitPerMinute: 10,
    });

    expect(() => {
      guard.validateTransfer({
        recipient: recipientA,
        lamports: 1_500_000_000n,
      });
    }).toThrow(/exceeds maximum per-transaction cap/);
  });

  it('rejects transfer exceeding cumulative daily limit', () => {
    const guard = new TreasuryGuard(
      {
        owner,
        dailySpendLimitLamports: 2_000_000_000n,
        maxTransactionLimitLamports: 1_000_000_000n,
        whitelistedRecipients: new Set(),
        enforceWhitelist: false,
        rateLimitPerMinute: 10,
      },
      { totalSpentTodayLamports: 1_800_000_000n }
    );

    expect(() => {
      guard.validateTransfer({
        recipient: recipientA,
        lamports: 300_000_000n,
      });
    }).toThrow(/exceeds daily spending ceiling/);
  });

  it('enforces whitelist when enabled', () => {
    const guard = new TreasuryGuard({
      owner,
      dailySpendLimitLamports: 10_000_000_000n,
      maxTransactionLimitLamports: 1_000_000_000n,
      whitelistedRecipients: new Set([recipientA.toBase58()]),
      enforceWhitelist: true,
      rateLimitPerMinute: 10,
    });

    expect(() => {
      guard.validateTransfer({
        recipient: recipientA,
        lamports: 100_000_000n,
      });
    }).not.toThrow();

    expect(() => {
      guard.validateTransfer({
        recipient: recipientB,
        lamports: 100_000_000n,
      });
    }).toThrow(/not present in the authorized whitelist/);
  });
});
