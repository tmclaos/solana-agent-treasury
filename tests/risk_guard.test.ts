import { Keypair, PublicKey } from '@solana/web3.js';
import { RiskGuard } from '../src/risk_guard';
import { TreasuryGuard } from '../src/treasury';

describe('RiskGuard Pre-Flight Risk Intelligence Tests', () => {
  it('evaluates clean wallet with low risk score and permits execution', async () => {
    const riskGuard = new RiskGuard({ maxAllowedRiskScore: 60 });
    const cleanWallet = Keypair.generate().publicKey;

    const profile = await riskGuard.evaluateWallet(cleanWallet);
    expect(profile.score).toBeLessThanOrEqual(20);
    expect(profile.isDrainer).toBe(false);
    expect(() => riskGuard.validateRiskProfile(profile)).not.toThrow();
  });

  it('blocks transfer to known drainer wallet', async () => {
    const riskGuard = new RiskGuard();
    const drainerWallet = new PublicKey('Drainer1111111111111111111111111111111111111');

    const profile = await riskGuard.evaluateWallet(drainerWallet);
    expect(profile.isDrainer).toBe(true);
    expect(() => riskGuard.validateRiskProfile(profile)).toThrow(/MALICIOUS DRAINER/);
  });

  it('blocks transfer when risk score exceeds tolerance threshold', () => {
    const riskGuard = new RiskGuard({ maxAllowedRiskScore: 50 });
    const highRiskProfile = {
      address: 'suspicious_wallet',
      score: 75,
      level: 'HIGH' as const,
      isDrainer: false,
      isPhishing: false,
      isSanctioned: false,
      tags: ['high_velocity_churn'],
      evaluatedAt: Date.now(),
    };

    expect(() => riskGuard.validateRiskProfile(highRiskProfile)).toThrow(/exceeds maximum tolerance/);
  });

  it('integrates seamlessly with TreasuryGuard.validateTransferAsync', async () => {
    const owner = Keypair.generate().publicKey;
    const cleanRecipient = Keypair.generate().publicKey;
    const drainerRecipient = new PublicKey('Drainer1111111111111111111111111111111111111');

    const riskGuard = new RiskGuard();
    const treasury = new TreasuryGuard(
      {
        owner,
        dailySpendLimitLamports: 10_000_000_000n,
        maxTransactionLimitLamports: 5_000_000_000n,
        whitelistedRecipients: new Set(),
        enforceWhitelist: false,
        rateLimitPerMinute: 100,
      },
      undefined,
      undefined,
      riskGuard
    );

    // Clean recipient passes
    await expect(
      treasury.validateTransferAsync({ recipient: cleanRecipient, lamports: 1_000_000n })
    ).resolves.toBeUndefined();

    // Drainer recipient fails pre-flight validation
    await expect(
      treasury.validateTransferAsync({ recipient: drainerRecipient, lamports: 1_000_000n })
    ).rejects.toThrow(/MALICIOUS DRAINER/);
  });
});
