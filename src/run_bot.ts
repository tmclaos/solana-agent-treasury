import readline from 'readline';
import { Keypair, Connection } from '@solana/web3.js';
import { TreasuryGuard } from './treasury.js';
import { MultiHopRouter } from './router.js';
import { RiskGuard } from './risk_guard.js';
import { AuditLogChain } from './audit.js';
import { WebhookDispatcher } from './webhooks.js';
import { SolanaTreasuryTelegramBot } from './telegram_bot.js';

async function main() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
  const connection = new Connection(rpcUrl);

  const payer = Keypair.generate();
  const auditChain = new AuditLogChain();
  const treasury = new TreasuryGuard({
    owner: payer.publicKey,
    maxTransactionLimitLamports: 10_000_000_000n, // 10 SOL
    dailySpendLimitLamports: 50_000_000_000n, // 50 SOL
    whitelistedRecipients: new Set(),
    enforceWhitelist: false,
    rateLimitPerMinute: 60,
  });

  const vault1 = Keypair.generate().publicKey;
  const vault2 = Keypair.generate().publicKey;
  const router = new MultiHopRouter([vault1, vault2]);
  const riskGuard = new RiskGuard();

  const webhooks = process.env.WEBHOOK_URL
    ? new WebhookDispatcher({
        targetUrl: process.env.WEBHOOK_URL,
        webhookSecret: process.env.WEBHOOK_SECRET || 'secret',
      })
    : undefined;

  const adminIds = process.env.ADMIN_USER_IDS
    ? process.env.ADMIN_USER_IDS.split(',').map((s) => parseInt(s.trim(), 10)).filter(Boolean)
    : [];

  const bot = new SolanaTreasuryTelegramBot({
    token,
    connection,
    payerKeypair: payer,
    treasuryGuard: treasury,
    router,
    riskGuard,
    webhookDispatcher: webhooks,
    auditChain,
    adminUserIds: adminIds,
  });

  console.log('====================================================');
  console.log('🏛  Solana Agent Treasury Telegram Bot Service');
  console.log('⚡ MultiHopper Parallel Route Engine | 0.25% RevShare');
  console.log('====================================================');
  console.log(`Treasury Pubkey: ${payer.publicKey.toBase58()}`);
  console.log(`Active Route Vaults: ${vault1.toBase58().slice(0, 8)}..., ${vault2.toBase58().slice(0, 8)}...`);

  if (token) {
    console.log(`\n📡 Live Telegram Bot polling active on token: ${token.slice(0, 8)}...`);
    // Run live webhook/polling handler
  } else {
    console.log('\n[SIMULATION MODE] No TELEGRAM_BOT_TOKEN provided in environment.');
    console.log('Interactive CLI runner active. Type Telegram commands (e.g., /help, /balance, /limits, /quote, /risk, /pay, /split, /audit).');
    console.log('Type "exit" to quit.\n');

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: 'tg-bot> ',
    });

    rl.prompt();

    rl.on('line', async (line) => {
      const input = line.trim();
      if (input.toLowerCase() === 'exit') {
        rl.close();
        process.exit(0);
      }

      if (input.startsWith('/')) {
        const reply = await bot.handleMessage(input, 123456, 'admin');
        console.log('\n' + reply + '\n');
      } else if (input.length > 0) {
        console.log('Commands must start with "/" (e.g. /help, /balance, /quote 1.0 <pubkey>)\n');
      }
      rl.prompt();
    });
  }
}

main().catch(console.error);
