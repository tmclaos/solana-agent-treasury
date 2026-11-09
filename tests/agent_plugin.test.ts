import { Connection, Keypair } from '@solana/web3.js';
import { SolanaTreasuryAgentPlugin } from '../src/agent_plugin';
import { TreasuryGuard } from '../src/treasury';
import { MultiHopRouter } from '../src/router';
import { RiskGuard } from '../src/risk_guard';

describe('SolanaTreasuryAgentPlugin Autonomous Framework Integration Tests', () => {
  const connection = new Connection();
  const payer = Keypair.generate();
  const recipient = Keypair.generate().publicKey;

  const treasury = new TreasuryGuard({
    owner: payer.publicKey,
    dailySpendLimitLamports: 100_000_000_000n,
    maxTransactionLimitLamports: 10_000_000_000n,
    whitelistedRecipients: new Set(),
    enforceWhitelist: false,
    rateLimitPerMinute: 100,
  });

  const router = new MultiHopRouter([Keypair.generate().publicKey]);
  const riskGuard = new RiskGuard();

  const plugin = new SolanaTreasuryAgentPlugin({
    connection,
    payerKeypair: payer,
    treasuryGuard: treasury,
    router,
    riskGuard,
  });

  it('provides standard function-calling tool definitions for LLMs', () => {
    const tools = plugin.getToolDefinitions();
    expect(tools).toHaveLength(3);
    expect(tools.map(t => t.name)).toEqual([
      'solana_treasury_payout',
      'solana_treasury_risk_check',
      'solana_treasury_status',
    ]);
  });

  it('screens recipient risk and returns threat evaluation profile', async () => {
    const profile = await plugin.checkRecipientRisk(recipient.toBase58());
    expect(profile.address).toBe(recipient.toBase58());
    expect(profile.score).toBeLessThanOrEqual(20);
    expect(profile.isDrainer).toBe(false);
  });

  it('executes autonomous payout with policy validation, routing and spend tracking', async () => {
    const result = await plugin.executePayout({
      recipientAddress: recipient.toBase58(),
      amountLamports: 1_000_000_000n, // 1 SOL
      memo: 'AI agent service payment',
    });

    expect(result.signature).toBeDefined();
    expect(result.protocolFeeLamports).toBe(5_000_000n); // 0.5% fee on 1 SOL
    expect(result.recipient).toBe(recipient.toBase58());

    const status = plugin.getTreasuryStatus();
    expect(status.spentTodayLamports).toBe('1000000000');
    expect(status.auditChainValid).toBe(true);
    expect(status.auditChainLength).toBeGreaterThanOrEqual(2);
  });

  it('blocks execution when payout exceeds per-transaction limit', async () => {
    await expect(
      plugin.executePayout({
        recipientAddress: recipient.toBase58(),
        amountLamports: 50_000_000_000n, // Exceeds 10 SOL cap
      })
    ).rejects.toThrow(/exceeds maximum per-transaction cap/);
  });
});
