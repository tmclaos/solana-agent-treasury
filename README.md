# Solana Agent Treasury & Multi-Hop Route Engine

[![CI](https://github.com/tmclaos/solana-agent-treasury/actions/workflows/ci.yml/badge.svg)](https://github.com/tmclaos/solana-agent-treasury/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Tests: 45 Passed](https://img.shields.io/badge/Tests-45%20Passed-brightgreen.svg)](#test-coverage)

Institutional-grade TypeScript backend infrastructure and CLI for autonomous AI agents managing Solana treasuries. Integrates MultiHopper routing protocols, ElizaOS / LLM function calling plugin adapters, signed HMAC-SHA256 event webhooks, Parallel Multi-Vault Liquidity Splitting, Cryptographic Tamper-Evident Audit Chains (`AuditLogChain`), Webacy-grade risk intelligence (`RiskGuard`), SPL Token & USDC stablecoin routing, high-watermark multi-sig thresholds, Versioned Transactions (`v0`), Jito MEV front-running protection, multi-send transaction batching, sub-millisecond warm blockhash caching, dynamic adaptive priority fees, and velocity-based circuit breakers.

---

## Architecture Overview

```
[ Autonomous AI Agent / ElizaOS / LangChain ]
                     │
                     │ Function Calling Tool: solana_treasury_payout
                     ▼
┌───────────────────────────────────────────────┐
│          SolanaTreasuryAgentPlugin            │ ── Agent Runtime Adapter
└──────────────────────┬────────────────────────┘
                       │
                       ▼
┌───────────────────────────────────────────────┐
│                 RiskGuard                     │ ── Pre-flight drainer & threat screening (< 0.6 μs)
└──────────────────────┬────────────────────────┘
                       │ Verified Clean
                       ▼
┌───────────────────────────────────────────────┐
│               TreasuryGuard                   │ ── Hard caps, 24h spend limit, multi-sig & breaker
│              AuditLogChain                    │ ── SHA-256 tamper-evident cryptographic entry (< 2.8 μs)
└──────────────────────┬────────────────────────┘
                       │ Validated (< 2.8 μs)
                       ▼
┌───────────────────────────────────────────────┐
│               MultiHopRouter                  │ ── Multi-hop vault paths & parallel splitting (< 0.9 μs)
│              SplTokenManager                  │ ── Native SOL & SPL TokenChecked (USDC) (< 0.5 μs)
└──────────────────────┬────────────────────────┘
                       │ Route Built (< 4.0 μs)
                       ▼
┌───────────────────────────────────────────────┐
│           VersionedTxBuilder (v0)             │ ── MessageV0 compression + Jito MEV atomic bundle tip
└──────────────────────┬────────────────────────┘
                       │ Packet Built (< 25 μs)
                       ▼
┌───────────────────────────────────────────────┐
│              RouteDispatcher                  │ ── Warm blockhash (RAM) & dynamic 75th pctl fee
│             WebhookDispatcher                 │ ── Signs & dispatches HMAC-SHA256 webhook
└──────────────────────┬────────────────────────┘
                       │ Pre-flight Simulated & Dispatched
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
│ TreasuryGuard.validate   │       2.79 │       4.70 │        11.30 │
│ MultiHopRouter.route     │       0.87 │       1.90 │         5.50 │
│ MultiHopRouter.batch     │       2.01 │       3.70 │         8.00 │
│ RiskGuard.evaluate       │       0.51 │       0.80 │         2.90 │
│ SplToken.transferChecked │       0.48 │       1.50 │         2.30 │
└──────────────────────────┴────────────┴────────────┴──────────────┘
```

---

## Institutional Engineering Highlights

### 1. Pre-Flight Risk Intelligence (`RiskGuard`)
Autonomous agents must not send treasury funds to malicious drainers, compromised contracts, or phishing addresses.
* Evaluates recipient addresses against verified threat datasets before transactions touch the network.
* Automatic drainer and phishing detection blocks transactions immediately.
* Configurable risk score ceiling (0–100 scale).
* High-speed in-memory caching ensures risk evaluations execute in **0.51 microseconds**.

### 2. ElizaOS & Autonomous Agent Runtime Plugin (`SolanaTreasuryAgentPlugin`)
Provides drop-in tool integration for autonomous agents (ElizaOS, LangChain, AutoGen, CrewAI):
* Exposes standard function calling tools: `solana_treasury_payout`, `solana_treasury_risk_check`, and `solana_treasury_status`.
* Manages full end-to-end flow: risk validation -> policy enforcement -> multi-hop routing -> simulation -> MEV-protected dispatch -> audit recording.

### 3. Signed HMAC-SHA256 Webhook Dispatcher (`WebhookDispatcher`)
Notifies external agent coordinators, dashboards, or accounting services with cryptographic verification:
* Appends `X-Treasury-Signature` (`sha256=${hmac}`) and `X-Treasury-Timestamp` to prevent replay attacks.
* Constant-time comparison prevents timing vulnerability exploits.
* Automated retry policy with exponential backoff.

### 4. Parallel Multi-Vault Liquidity Splitting
Prevents single-vault liquidity bottlenecks and reduces on-chain trace footprints for large institutional transfers.
* Decomposes large transfers across N parallel intermediate vaults using custom or equal basis-point weights.
* Guaranteed zero-loss conservation: exact remainder handling ensures `sum(splits) === totalAmount`.
* Automatic aggregation of protocol fees and partner revenue shares across all splits.

### 5. Cryptographic Tamper-Evident Audit Chain (`AuditLogChain`)
* Maintains a SHA-256 cryptographic hash chain (`prevHash + payload -> currentHash`) of every validation, approval, and dispatch.
* Provides deterministic `verifyIntegrity()` method to detect history rewrite or record tampering.
* Built-in to `TreasuryGuard` for compliance reporting.

### 6. SPL Token & USDC Stablecoin Direct Support (`SplTokenManager`)
Treasury operations require stablecoin payroll and supplier settlement alongside native SOL.
* Native construction of `transferChecked` instructions verifying mint address and decimals on-chain.
* Pre-configured mainnet mints: **USDC**, **USDT**, and **PYUSD**.
* Deterministic offline Associated Token Address (ATA) derivation.
* BigInt precision parser and formatter preventing fractional decimal truncation leaks.

### 7. Dual-Signer High-Watermark Approvals
* Transfers below policy limits execute autonomously with zero operator friction.
* Transfers exceeding high-watermark thresholds (e.g. >5 SOL or >$2,500 USDC) automatically trigger co-signing requirements.
* Transactions remain staged until registered approvals meet quorum.

### 8. Versioned Transactions (`v0`) & Address Lookup Tables (ALTs)
Legacy Solana transactions are capped at 1,232 bytes (~20 accounts maximum).
* Compiles atomic transfers into modern `VersionedTransaction` (`MessageV0`).
* Integrates Address Lookup Tables (ALTs), compressing public keys from 32 bytes to 1-byte indices.
* Expands batch payout capacity from **20 to 50+ recipients** within a single atomic packet.

### 9. Jito MEV Atomic Bundle Protection
Prevents sandwich attacks, front-running, and predatory mempool searchers.
* Programmatically constructs and appends dynamic tip instructions directed to verified Jito tip accounts (`96gYZGLn...`, `HFqU5x6...`).
* Bypasses the public gossip network to execute atomically through Jito Block Engines.

### 10. Sub-Millisecond Warm Blockhash Cache (`BlockhashCache`)
Eliminates the standard **150ms to 300ms** latency penalty of querying `getLatestBlockhash` on demand.
* Background worker continuously refreshes and maintains a warm blockhash cache in RAM.
* In-memory cache access executes in **under 0.005ms**.

### 11. Adaptive Priority Fee Optimizer (`DynamicFeeEngine`)
* Samples recent block prioritization fees using `getRecentPrioritizationFees`.
* Dynamically calculates the **75th percentile micro-lamport fee**.
* Enforces safety bounds (5,000 to 500,000 µLamports) with automatic fallback during RPC isolation.

### 12. Velocity-Based Circuit Breakers
Protects against bot loops, runaway recursion, or automated exploit attempts.
* Trips instantly if burst velocity exceeds 5 transactions within 3 seconds.
* Imposes an enforced 30-second cooldown period, preventing wallet depletion.

---

## Test Coverage (45 Tests Across 15 Suites)

```bash
bun test
```

```text
tests/agent_plugin.test.ts ....................... 4 passed
tests/audit.test.ts .............................. 3 passed
tests/blockhash_cache.test.ts .................... 3 passed
tests/circuit_breaker.test.ts .................... 4 passed
tests/dispatcher.test.ts ......................... 2 passed
tests/fee_optimizer.test.ts ...................... 3 passed
tests/jito.test.ts ............................... 2 passed
tests/multisig.test.ts ........................... 3 passed
tests/risk_guard.test.ts ......................... 4 passed
tests/router.test.ts ............................. 3 passed
tests/split_router.test.ts ....................... 3 passed
tests/spl_token.test.ts .......................... 3 passed
tests/treasury.test.ts ........................... 4 passed
tests/v0.test.ts ................................. 1 passed
tests/webhooks.test.ts ........................... 3 passed

Total: 45 pass, 0 fail (92ms)
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
