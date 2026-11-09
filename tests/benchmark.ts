import { Keypair, Connection } from '@solana/web3.js';
import { TreasuryGuard } from '../src/treasury.js';
import { MultiHopRouter } from '../src/router.js';
import { TelemetryLogger } from '../src/telemetry.js';
import { RiskGuard } from '../src/risk_guard.js';
import { SplTokenManager, COMMON_MINTS } from '../src/spl_token.js';

function percentile(arr: number[], p: number): number {
  const sorted = [...arr].sort((a, b) => a - b);
  const index = Math.floor(sorted.length * p);
  return sorted[index];
}

async function runBenchmarks() {
  const ITERATIONS = 10_000;
  console.log(`\nStarting Benchmark Harness: ${ITERATIONS.toLocaleString()} iterations per engine component...`);

  const owner = Keypair.generate().publicKey;
  const recipient = Keypair.generate().publicKey;
  const vault1 = Keypair.generate().publicKey;
  const vault2 = Keypair.generate().publicKey;

  const guard = new TreasuryGuard({
    owner,
    dailySpendLimitLamports: 100_000_000_000n,
    maxTransactionLimitLamports: 5_000_000_000n,
    whitelistedRecipients: new Set([recipient.toBase58()]),
    enforceWhitelist: false,
    rateLimitPerMinute: 1_000_000,
  });

  const router = new MultiHopRouter([vault1, vault2]);
  const riskGuard = new RiskGuard();
  // Warm risk cache for sub-microsecond in-memory evaluation
  await riskGuard.evaluateWallet(recipient);

  const usdcMint = COMMON_MINTS.USDC;
  const sourceAta = SplTokenManager.getAssociatedTokenAddressSync(usdcMint, owner);
  const destAta = SplTokenManager.getAssociatedTokenAddressSync(usdcMint, recipient);

  // 1. Treasury Guard Validation Benchmark
  const guardTimesUs: number[] = [];
  for (let i = 0; i < ITERATIONS; i++) {
    const t0 = process.hrtime.bigint();
    guard.validateTransfer({ recipient, lamports: 100_000_000n });
    const t1 = process.hrtime.bigint();
    guardTimesUs.push(Number(t1 - t0) / 1_000);
  }

  // 2. MultiHop Route Calculation Benchmark
  const routeTimesUs: number[] = [];
  for (let i = 0; i < ITERATIONS; i++) {
    const t0 = process.hrtime.bigint();
    router.computeRoute(owner, recipient, 1_000_000_000n);
    const t1 = process.hrtime.bigint();
    routeTimesUs.push(Number(t1 - t0) / 1_000);
  }

  // 3. Batch Route Decomposition Benchmark
  const batchTimesUs: number[] = [];
  const sampleTransfers = [
    { recipient: Keypair.generate().publicKey, lamports: 50_000_000n },
    { recipient: Keypair.generate().publicKey, lamports: 75_000_000n },
    { recipient: Keypair.generate().publicKey, lamports: 120_000_000n },
  ];

  for (let i = 0; i < ITERATIONS; i++) {
    const t0 = process.hrtime.bigint();
    router.batchRoutes(owner, sampleTransfers);
    const t1 = process.hrtime.bigint();
    batchTimesUs.push(Number(t1 - t0) / 1_000);
  }

  // 4. RiskGuard In-Memory Profile Evaluation Benchmark
  const riskTimesUs: number[] = [];
  for (let i = 0; i < ITERATIONS; i++) {
    const t0 = process.hrtime.bigint();
    const profile = await riskGuard.evaluateWallet(recipient);
    riskGuard.validateRiskProfile(profile);
    const t1 = process.hrtime.bigint();
    riskTimesUs.push(Number(t1 - t0) / 1_000);
  }

  // 5. SplToken transferChecked Instruction Construction Benchmark
  const splTimesUs: number[] = [];
  for (let i = 0; i < ITERATIONS; i++) {
    const t0 = process.hrtime.bigint();
    SplTokenManager.createTransferCheckedInstruction({
      source: sourceAta,
      mint: usdcMint,
      destination: destAta,
      owner,
      amount: 500_000_000n,
      decimals: 6,
    });
    const t1 = process.hrtime.bigint();
    splTimesUs.push(Number(t1 - t0) / 1_000);
  }

  const results = [
    {
      name: 'TreasuryGuard.validate',
      iterations: ITERATIONS,
      avgUs: guardTimesUs.reduce((a, b) => a + b, 0) / ITERATIONS,
      p95Us: percentile(guardTimesUs, 0.95),
      p99Us: percentile(guardTimesUs, 0.99),
    },
    {
      name: 'MultiHopRouter.route',
      iterations: ITERATIONS,
      avgUs: routeTimesUs.reduce((a, b) => a + b, 0) / ITERATIONS,
      p95Us: percentile(routeTimesUs, 0.95),
      p99Us: percentile(routeTimesUs, 0.99),
    },
    {
      name: 'MultiHopRouter.batch',
      iterations: ITERATIONS,
      avgUs: batchTimesUs.reduce((a, b) => a + b, 0) / ITERATIONS,
      p95Us: percentile(batchTimesUs, 0.95),
      p99Us: percentile(batchTimesUs, 0.99),
    },
    {
      name: 'RiskGuard.evaluate',
      iterations: ITERATIONS,
      avgUs: riskTimesUs.reduce((a, b) => a + b, 0) / ITERATIONS,
      p95Us: percentile(riskTimesUs, 0.95),
      p99Us: percentile(riskTimesUs, 0.99),
    },
    {
      name: 'SplToken.transferChecked',
      iterations: ITERATIONS,
      avgUs: splTimesUs.reduce((a, b) => a + b, 0) / ITERATIONS,
      p95Us: percentile(splTimesUs, 0.95),
      p99Us: percentile(splTimesUs, 0.99),
    },
  ];

  TelemetryLogger.printBenchmarks(results);
}

runBenchmarks().catch(console.error);
