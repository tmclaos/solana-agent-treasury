import { Keypair } from '@solana/web3.js';
import { AuditLogChain } from '../src/audit';
import { TreasuryGuard } from '../src/treasury';

describe('AuditLogChain Cryptographic Hash Chain Integrity Tests', () => {
  it('appends entries with sequential indexing and cryptographic link', () => {
    const chain = new AuditLogChain();

    const entry1 = chain.append('TRANSFER_VALIDATED', { amount: '1000' });
    const entry2 = chain.append('TRANSFER_DISPATCHED', { amount: '1000' });

    expect(entry1.sequenceNumber).toBe(0);
    expect(entry1.previousHash).toBe(AuditLogChain.GENESIS_HASH);

    expect(entry2.sequenceNumber).toBe(1);
    expect(entry2.previousHash).toBe(entry1.currentHash);

    expect(chain.verifyIntegrity()).toBe(true);
  });

  it('detects tampering or altered historical payload', () => {
    const chain = new AuditLogChain();

    chain.append('TRANSFER_VALIDATED', { amount: '5000' });
    chain.append('TRANSFER_DISPATCHED', { amount: '5000' });

    expect(chain.verifyIntegrity()).toBe(true);

    // Maliciously tamper with internal history
    const rawChain = (chain as any).chain;
    rawChain[0].details.amount = '99999999';

    // Verification must fail
    expect(chain.verifyIntegrity()).toBe(false);
  });

  it('automatically logs actions from TreasuryGuard operations', () => {
    const owner = Keypair.generate().publicKey;
    const recipient = Keypair.generate().publicKey;

    const guard = new TreasuryGuard({
      owner,
      dailySpendLimitLamports: 10_000_000_000n,
      maxTransactionLimitLamports: 5_000_000_000n,
      whitelistedRecipients: new Set(),
      enforceWhitelist: false,
      rateLimitPerMinute: 100,
    });

    guard.validateTransfer({ recipient, lamports: 50_000n });
    guard.recordTransfer(50_000n);

    const auditChain = guard.getAuditLog();
    expect(auditChain.getLength()).toBe(2);
    expect(auditChain.verifyIntegrity()).toBe(true);

    const entries = auditChain.getChain();
    expect(entries[0].action).toBe('TRANSFER_VALIDATED');
    expect(entries[1].action).toBe('TRANSFER_DISPATCHED');
  });
});
