import { Keypair } from '@solana/web3.js';
import { TreasuryGuard } from '../src/treasury';

describe('TreasuryGuard High-Watermark Dual-Signer / Multi-Sig Tests', () => {
  const owner = Keypair.generate().publicKey;
  const approver1 = Keypair.generate().publicKey;
  const recipient = Keypair.generate().publicKey;

  const thresholdLamports = 5_000_000_000n; // 5 SOL threshold

  it('permits transfer below threshold without co-signer approvals', () => {
    const guard = new TreasuryGuard({
      owner,
      dailySpendLimitLamports: 100_000_000_000n,
      maxTransactionLimitLamports: 20_000_000_000n,
      whitelistedRecipients: new Set(),
      enforceWhitelist: false,
      rateLimitPerMinute: 100,
      approvalThreshold: {
        thresholdLamports,
        requiredApprovals: 1,
        authorizedApprovers: new Set([approver1.toBase58()]),
      },
    });

    // 1 SOL transfer is under threshold -> succeeds directly
    expect(() => {
      guard.validateTransfer({ recipient, lamports: 1_000_000_000n });
    }).not.toThrow();
  });

  it('blocks transfer exceeding threshold until co-signer registers approval', () => {
    const guard = new TreasuryGuard({
      owner,
      dailySpendLimitLamports: 100_000_000_000n,
      maxTransactionLimitLamports: 20_000_000_000n,
      whitelistedRecipients: new Set(),
      enforceWhitelist: false,
      rateLimitPerMinute: 100,
      approvalThreshold: {
        thresholdLamports,
        requiredApprovals: 1,
        authorizedApprovers: new Set([approver1.toBase58()]),
      },
    });

    const largeTransfer = { recipient, lamports: 6_000_000_000n }; // 6 SOL
    const transferId = `${recipient.toBase58()}_${largeTransfer.lamports}`;

    // Should fail without approval
    expect(() => {
      guard.validateTransfer(largeTransfer);
    }).toThrow(/Requires 1 co-signer approvals/);

    // Register approval from authorized approver
    guard.registerApproval(transferId, approver1);

    // Should now pass
    expect(() => {
      guard.validateTransfer(largeTransfer);
    }).not.toThrow();
  });

  it('rejects approval from an unauthorized key', () => {
    const rogueKey = Keypair.generate().publicKey;
    const guard = new TreasuryGuard({
      owner,
      dailySpendLimitLamports: 100_000_000_000n,
      maxTransactionLimitLamports: 20_000_000_000n,
      whitelistedRecipients: new Set(),
      enforceWhitelist: false,
      rateLimitPerMinute: 100,
      approvalThreshold: {
        thresholdLamports,
        requiredApprovals: 1,
        authorizedApprovers: new Set([approver1.toBase58()]),
      },
    });

    expect(() => {
      guard.registerApproval('transfer_test', rogueKey);
    }).toThrow(/not an authorized co-signer/);
  });
});
