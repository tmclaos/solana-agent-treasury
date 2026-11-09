# Solana Agent Treasury & Multi-Hop Route Engine

[![CI](https://github.com/tmclaos/solana-agent-treasury/actions/workflows/ci.yml/badge.svg)](https://github.com/tmclaos/solana-agent-treasury/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Tests: 32 Passed](https://img.shields.io/badge/Tests-32%20Passed-brightgreen.svg)](#test-coverage)

Institutional-grade TypeScript backend infrastructure and CLI for autonomous AI agents managing Solana treasuries. Integrates MultiHopper routing protocols, Webacy-grade risk intelligence (`RiskGuard`), SPL Token & USDC stablecoin routing, high-watermark multi-sig thresholds, Versioned Transactions (`v0`), Jito MEV front-running protection, multi-send transaction batching, sub-millisecond warm blockhash caching, dynamic adaptive priority fees, and velocity-based circuit breakers.

---

## Architecture Overview

```
[ Autonomous AI Agent ]
         │
         │ (Requests Transfer / Batch Payout)
         ▼
┌─────────────────────────────────┐
│           RiskGuard             │ ── Pre-flight drainer, phishing & risk score check (< 1.6 μs)
└────────────────┬────────────────┘
                 │ Verified Clean
                 ▼
┌─────────────────────────────────┐
│         TreasuryGuard           │ ── Hard caps, 24h spend limit, multi-sig high-watermark & breaker
└────────────────┬────────────────┘
                 │ Validated (< 1.9 μs)
                 ▼
┌─────────────────────────────────┐
│         MultiHopRouter          │ ── Computes vault paths & deducts 0.25% revenue share
│        SplTokenManager          │ ── Native SOL & SPL TokenChecked (USDC/USDT) formatting
└────────────────┬────────────────┘
                 │ Route Built (< 4.0 μs)
                 ▼
┌─────────────────────────────────┐
│     VersionedTxBuilder (v0)     │ ── MessageV0 compression + Jito MEV atomic bundle tip
└────────────────┬────────────────┘
                 │ Packet Built (< 25 μs)
                 ▼
┌─────────────────────────────────┐
│        RouteDispatcher          │ ── Pulls warm blockhash (RAM) & injects dynamic 75th pctl fee
└────────────────┬────────────────┘
                 │ Pre-flight Simulated
                 ▼
         [ Solana RPC / Mainnet ]
```

---

## Verified Benchmarks (10,000 Iterations)

Measured using hardware-accurate timestamps (`process.hrtime.bigint()`):

```text
┌─ [ENGINE BENCHMARKS - 10,000 ITERATIONS] ──────────────────────────┐
│ Operation                │ Avg (μs)   │ p95 (μs)   │ p99 (μs)     │
├──────────────────────────┼────────────┼────────────┼──────────────┤
│ TreasuryGuard.validate   │       1.86 │       4.80 │        10.80 │
│ MultiHopRouter.route     │       3.98 │       7.70 │        18.60 │
│ MultiHopRouter.batch     │       6.37 │       9.40 │        24.50 │
│ RiskGuard.evaluate       │       1.57 │       1.90 │         5.80 │
│ SplToken.transferChecked │       1.13 │       2.10 │         6.00 │
└──────────────────────────┴────────────┴────────────┴──────────────┘
```

---

## Institutional Engineering Highlights

### 1. Pre-Flight Risk Intelligence (`RiskGuard`)
Autonomous agents must not send treasury funds to malicious drainers, compromised contracts, or phishing addresses.
* Evaluates recipient addresses against verified threat datasets before transactions touch the network.
* Automatic drainer and phishing detection blocks transactions immediately.
* Configurable risk score ceiling (0–100 scale).
* High-speed in-memory caching ensures risk evaluations execute in **under 2.0 microseconds**.

### 2. SPL Token & USDC Stablecoin Direct Support (`SplTokenManager`)
Treasury operations require stablecoin payroll and supplier settlement alongside native SOL.
* Native construction of `transferChecked` instructions verifying mint address and decimals on-chain.
* Pre-configured mainnet mints: **USDC**, **USDT**, and **PYUSD**.
* Deterministic offline Associated Token Address (ATA) derivation.
* BigInt precision parser and formatter preventing fractional decimal truncation leaks.

### 3. Dual-Signer High-Watermark Approvals
* Transfers below policy limits execute autonomously with zero operator friction.
* Transfers exceeding high-watermark thresholds (e.g. >5 SOL or >$2,500 USDC) automatically trigger co-signing requirements.
* Transactions remain staged until registered approvals meet quorum.

### 4. Versioned Transactions (`v0`) & Address Lookup Tables (ALTs)
Legacy Solana transactions are capped at 1,232 bytes (~20 accounts maximum).
* Compiles atomic transfers into modern `VersionedTransaction` (`MessageV0`).
* Integrates Address Lookup Tables (ALTs), compressing public keys from 32 bytes to 1-byte indices.
* Expands batch payout capacity from **20 to 50+ recipients** within a single atomic packet.

### 5. Jito MEV Atomic Bundle Protection
Prevents sandwich attacks, front-running, and predatory mempool searchers.
* Programmatically constructs and appends dynamic tip instructions directed to verified Jito tip accounts (`96gYZGLn...`, `HFqU5x6...`).
* Bypasses the public gossip network to execute atomically through Jito Block Engines.

### 6. Sub-Millisecond Warm Blockhash Cache (`BlockhashCache`)
Eliminates the standard **150ms to 300ms** latency penalty of querying `getLatestBlockhash` on demand.
* Background worker continuously refreshes and maintains a warm blockhash cache in RAM.
* In-memory cache access executes in **under 0.005ms**.

### 7. Adaptive Priority Fee Optimizer (`DynamicFeeEngine`)
* Samples recent block prioritization fees using `getRecentPrioritizationFees`.
* Dynamically calculates the **75th percentile micro-lamport fee**.
* Enforces safety bounds (5,000 to 500,000 µLamports) with automatic fallback during RPC isolation.

### 8. Velocity-Based Circuit Breakers
Protects against bot loops, runaway recursion, or automated exploit attempts.
* Trips instantly if burst velocity exceeds 5 transactions within 3 seconds.
* Imposes an enforced 30-second cooldown period, preventing wallet depletion.

---

## Test Coverage (32 Tests Across 11 Suites)

```bash
bun test
```

```text
tests/blockhash_cache.test.ts .................... 3 passed
tests/circuit_breaker.test.ts .................... 4 passed
tests/dispatcher.test.ts ......................... 2 passed
tests/fee_optimizer.test.ts ...................... 3 passed
tests/jito.test.ts ............................... 2 passed
tests/multisig.test.ts ........................... 3 passed
tests/risk_guard.test.ts ......................... 4 passed
tests/router.test.ts ............................. 3 passed
tests/spl_token.test.ts .......................... 3 passed
tests/treasury.test.ts ........................... 4 passed
tests/v0.test.ts ................................. 1 passed

Total: 32 pass, 0 fail (83ms)
```

---

## CLI Reference

```bash
# Calculate multi-hop route
bun run src/cli.ts route --recipient <PUBKEY> --amount 1.5

# Dispatch batched payout
bun run src/cli.ts batch --file payouts.json

# Check treasury policy, 24h spend & circuit breaker status
bun run src/cli.ts status

# Execute end-to-end benchmark harness
bun run tests/benchmark.ts
```

---

## License

MIT © 2026 Leo Caldart (@Titration).
