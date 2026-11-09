import { describe, it, expect, beforeEach } from 'bun:test';
import { PublicKey, Keypair, Connection } from '@solana/web3.js';
import { TreasuryGuard } from '../src/treasury.js';
import { MultiHopRouter } from '../src/router.js';
import { RiskGuard } from '../src/risk_guard.js';
import { AuditLogChain } from '../src/audit.js';
import { WebhookDispatcher } from '../src/webhooks.js';
import { SolanaTreasuryTelegramBot } from '../src/telegram_bot.js';

describe('SolanaTreasuryTelegramBot Command & Routing Tests', () => {
  let connection: Connection;
  let payer: Keypair;
  let recipient: Keypair;
  let treasury: TreasuryGuard;
  let router: MultiHopRouter;
  let riskGuard: RiskGuard;
  let auditChain: AuditLogChain;
  let webhooks: WebhookDispatcher;
  let bot: SolanaTreasuryTelegramBot;

  beforeEach(() => {
    connection = new Connection('https://api.devnet.solana.com');
    payer = Keypair.generate();
    recipient = Keypair.generate();

    auditChain = new AuditLogChain();
    treasury = new TreasuryGuard({
      owner: payer.publicKey,
      maxTransactionLimitLamports: 10_000_000_000n, // 10 SOL
      dailySpendLimitLamports: 50_000_000_000n, // 50 SOL
      whitelistedRecipients: new Set(),
      enforceWhitelist: false,
      rateLimitPerMinute: 60,
    });

    const vault1 = Keypair.generate().publicKey;
    const vault2 = Keypair.generate().publicKey;
    router = new MultiHopRouter([vault1, vault2]);

    riskGuard = new RiskGuard();
    webhooks = new WebhookDispatcher({
      targetUrl: 'https://api.enterprise.internal/webhooks/treasury',
      webhookSecret: 'test-secret-key-12345',
    });

    bot = new SolanaTreasuryTelegramBot({
      connection,
      payerKeypair: payer,
      treasuryGuard: treasury,
      router,
      riskGuard,
      webhookDispatcher: webhooks,
      auditChain,
      adminUserIds: [123456], // Authorized Admin user ID
    });
  });

  it('renders start/help overview with connected treasury pubkey and command list', async () => {
    const res = await bot.handleMessage('/start', 123456);
    expect(res).toContain('Solana Agent Treasury Bot');
    expect(res).toContain('MultiHopper Route Engine');
    expect(res).toContain('/quote');
    expect(res).toContain('/pay');
    expect(res).toContain('/split');
    expect(res).toContain('/risk');
    expect(res).toContain('/audit');
  });

  it('displays accurate treasury balances and active vault count', async () => {
    const res = await bot.handleMessage('/balance', 123456);
    expect(res).toContain('Treasury Balances');
    expect(res).toContain('Native SOL');
    expect(res).toContain('2 configured route vaults');
    expect(res).toContain('Revenue Share: 0.25%');
  });

  it('displays policy limits, daily budget and circuit breaker status', async () => {
    const res = await bot.handleMessage('/limits', 123456);
    expect(res).toContain('Max Single Payout*: `10.00 SOL`');
    expect(res).toContain('Daily Cumulative Cap*: `50.00 SOL`');
    expect(res).toContain('Circuit Breaker*: `✅ NORMAL`');
  });

  it('calculates MultiHopper route quote with fee and partner revenue share breakdown', async () => {
    const res = await bot.handleMessage(`/quote 2.0 ${recipient.publicKey.toBase58()}`, 123456);
    expect(res).toContain('MultiHopper Route Quote');
    expect(res).toContain('Requested Amount*: `2 SOL`');
    expect(res).toContain('Protocol Fee (0.5%)');
    expect(res).toContain('Your Integration Share (0.25%)');
    expect(res).toContain('Optimal Route Calculated ✅');
  });

  it('screens clean wallet with RiskGuard as low threat', async () => {
    const res = await bot.handleMessage(`/risk ${recipient.publicKey.toBase58()}`, 123456);
    expect(res).toContain('RiskGuard Pre-Flight Intelligence');
    expect(res).toContain('Threat Level*: 🟢 `LOW`');
    expect(res).toContain('Blacklisted*: `NO`');
  });

  it('detects and flags known drainer wallet with RiskGuard', async () => {
    const drainer = 'Drainer1111111111111111111111111111111111111';
    const res = await bot.handleMessage(`/risk ${drainer}`, 123456);
    expect(res).toContain('Threat Level*: 🔴 `CRITICAL`');
    expect(res).toContain('Blacklisted*: `🚨 YES`');
  });

  it('executes payout, updates audit log chain, records spend and returns signature', async () => {
    const res = await bot.handleMessage(`/pay 1.0 ${recipient.publicKey.toBase58()} "DAO grant"`, 123456);
    expect(res).toContain('Payout Dispatched Successfully!');
    expect(res).toContain('Signature*: `');
    expect(res).toContain('MultiHopper Fee');
    expect(res).toContain('Memo*: `DAO grant`');

    // Verify spend recorded in treasury state
    const state = treasury.getState();
    expect(state.totalSpentTodayLamports).toBe(1_000_000_000n);

    // Verify audit log chain
    expect(auditChain.getLength()).toBeGreaterThan(0);
    expect(auditChain.verifyIntegrity()).toBe(true);
  });

  it('enforces RBAC and blocks unauthorized Telegram user IDs from executing payouts', async () => {
    const res = await bot.handleMessage(`/pay 1.0 ${recipient.publicKey.toBase58()}`, 999999);
    expect(res).toContain('Access Denied');
    expect(res).toContain('999999');
  });

  it('blocks payout to blacklisted drainer address and surfaces RiskGuard error', async () => {
    const drainer = 'Drainer1111111111111111111111111111111111111';
    const res = await bot.handleMessage(`/pay 1.0 ${drainer}`, 123456);
    expect(res).toContain('Treasury Error');
    expect(res).toContain('MALICIOUS DRAINER');
  });

  it('executes parallel multi-vault liquidity splitting with zero conservation loss', async () => {
    const v1 = Keypair.generate().publicKey.toBase58();
    const v2 = Keypair.generate().publicKey.toBase58();
    const v3 = Keypair.generate().publicKey.toBase58();

    const res = await bot.handleMessage(`/split 3.0 ${v1},${v2},${v3}`, 123456);
    expect(res).toContain('Multi-Vault Liquidity Split');
    expect(res).toContain('Total Distributed*: `3 SOL`');
    expect(res).toContain('Target Vaults*: `3`');
    expect(res).toContain('Exact zero-loss');
    expect(res).toContain('MultiHopper Parallel Vault Liquidity Engine');
  });

  it('verifies cryptographic audit log chain status via /audit', async () => {
    // Add one audit entry first
    auditChain.append('SYSTEM_INIT', { version: '1.0.0' });
    const res = await bot.handleMessage('/audit', 123456);
    expect(res).toContain('Cryptographic Audit Log Chain');
    expect(res).toContain('100% INTACT & UNTAMPERED');
  });

  it('processes incoming Telegram webhook update format seamlessly', async () => {
    const update = {
      update_id: 1001,
      message: {
        message_id: 55,
        from: {
          id: 123456,
          is_bot: false,
          first_name: 'Leo',
          username: 'Titration',
        },
        chat: {
          id: 8888,
          type: 'private',
        },
        text: '/balance',
        date: 1731100000,
      },
    };

    const out = await bot.handleUpdate(update);
    expect(out.chatId).toBe(8888);
    expect(out.text).toContain('Treasury Balances');
  });
});
