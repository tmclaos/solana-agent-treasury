# Solana Agent Treasury & Multi-Hop Route Engine

[![CI](https://github.com/tmclaos/solana-agent-treasury/actions/workflows/ci.yml/badge.svg)](https://github.com/tmclaos/solana-agent-treasury/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Tests: 57 Passed](https://img.shields.io/badge/Tests-57%20Passed-brightgreen.svg)](#test-coverage)

TypeScript backend engine and CLI for Solana treasuries. Includes MultiHopper routing, Telegram bot controls, LLM tool definitions, HMAC-SHA256 webhooks, parallel multi-vault splitting, SHA-256 audit log chains, recipient risk screening, SPL token routing, multi-sig limits, v0 transactions with Jito tips, in-memory blockhash caching, adaptive priority fees, and velocity circuit breakers.

---

## Architecture Overview

```
[ Autonomous AI Agent / ElizaOS ]         [ Telegram Bot / Community DAO ]
                 │                                        │
                 │ Function Calling Tool                  │ Chat Commands (/pay, /split)
                 ▼                                        ▼
┌─────────────────────────────────┐      ┌─────────────────────────────────┐
│    SolanaTreasuryAgentPlugin    │      │    SolanaTreasuryTelegramBot    │
└────────────────┬────────────────┘      └────────────────┬────────────────┘
                 │                                        │
                 └───────────────────┬────────────────────┘
                                     ▼
                  ┌─────────────────────────────────────┐
                  │              RiskGuard              │ ── Pre-flight drainer screening (< 0.6 μs)
                  └──────────────────┬──────────────────┘
                                     │ Verified Clean
                                     ▼
                  ┌─────────────────────────────────────┐
                  │            TreasuryGuard            │ ── Hard caps, 24h spend limit, multi-sig
                  │            AuditLogChain            │ ── SHA-256 tamper-evident hash chain (< 2.8 μs)
                  └──────────────────┬──────────────────┘
                                     │ Validated (< 2.8 μs)
                                     ▼
                  ┌─────────────────────────────────────┐
                  │            MultiHopRouter           │ ── Multi-hop vault paths & split routing (< 0.9 μs)
                  │           SplTokenManager           │ ── Native SOL & SPL TokenChecked (USDC) (< 0.5 μs)
                  └──────────────────┬──────────────────┘
                                     │ Route Built (< 4.0 μs)
                                     ▼
                  ┌─────────────────────────────────────┐
                  │        VersionedTxBuilder (v0)      │ ── MessageV0 compression + Jito MEV bundle tip
                  └──────────────────┬──────────────────┘
                                     │ Packet Built (< 25 μs)
                                     ▼
                  ┌─────────────────────────────────────┐
                  │           RouteDispatcher           │ ── Warm blockhash (RAM) & dynamic 75th pctl fee
                  │          WebhookDispatcher          │ ── Signs & dispatches HMAC-SHA256 webhook
                  └──────────────────┬──────────────────┘
                                     │ Pre-flight Simulated & Dispatched
                                     ▼
                          [ Solana RPC / Mainnet ]
```

---

## Telegram Bot Interface (`SolanaTreasuryTelegramBot`)

The engine includes a Telegram bot for DAOs and agent operators. It supports live Telegram Bot API polling, webhooks, and local CLI simulation.

### Available Commands
| Command | Arguments | Description |
|---|---|---|
| `/start`, `/help` | None | Displays treasury overview, connected pubkey, limits, and command reference. |
| `/balance` | None | Real-time native SOL balance, active intermediate vaults, and MultiHopper 0.25% revenue share status. |
| `/limits` | None | View max transaction limit, 24h spending ceiling, spent today, remaining budget, and circuit breaker status. |
| `/quote` | `<amount> <recipient>` | Computes optimal MultiHopper multi-hop route, net received amount, protocol fee (0.5%), and integration share (0.25%). |
| `/pay`, `/send` | `<amount> <recipient> [memo]` | Executes verified payout with RiskGuard threat intelligence, policy check, transaction dispatch, and SHA-256 audit log. |
| `/split` | `<amount> <vault1,vault2,...>` | Executes parallel multi-vault liquidity splitting with exact zero-loss remainder conservation. |
| `/risk` | `<address>` | Instant pre-flight threat intelligence screening (drainer detection, risk score 0–100, threat level). |
| `/audit` | None | Displays the current head SHA-256 hash of the cryptographic audit chain and verifies 100% untampered integrity. |

### Running the Telegram Bot
```bash
# 1. Run in Interactive CLI Simulation Mode (no token required)
bun run src/run_bot.ts

# 2. Run with a Live Telegram Bot Token
TELEGRAM_BOT_TOKEN="your_token_from_botfather" \
ADMIN_USER_IDS="123456789,987654321" \
SOLANA_RPC_URL="https://api.mainnet-beta.solana.com" \
bun run src/run_bot.ts
```

---

## Verified Benchmarks (10,000 Iterations)

Measured using hardware-accurate timestamps (`process.hrtime.bigint()`):

```text
Component                     Avg Latency   p95 Latency   Throughput
-------------------------------------------------------------------------
TreasuryGuard.validate          2.79 μs       4.70 μs     358,422 ops/sec
MultiHopRouter.route            0.87 μs       1.90 μs   1,149,425 ops/sec
MultiHopRouter.batch (5 hops)   2.01 μs       3.70 μs     497,512 ops/sec
RiskGuard.evaluateWallet        0.51 μs       0.80 μs   1,960,784 ops/sec
SplTokenManager.transferChecked 0.48 μs       1.50 μs   2,083,333 ops/sec
-------------------------------------------------------------------------
Complete Pipeline (Total)       6.66 μs      12.60 μs     150,150 ops/sec
```

---

## Test Coverage (57 Passed, 0 Failed)

```text
bun test v1.4.4

tests/agent_plugin.test.ts ......................... 4 passed
tests/audit.test.ts ................................ 3 passed
tests/blockhash_cache.test.ts ...................... 3 passed
tests/circuit_breaker.test.ts ...................... 4 passed
tests/dispatcher.test.ts ........................... 2 passed
tests/fee_optimizer.test.ts ........................ 3 passed
tests/jito.test.ts ................................. 2 passed
tests/multisig.test.ts ............................. 3 passed
tests/risk_guard.test.ts ........................... 4 passed
tests/router.test.ts ............................... 3 passed
tests/split_router.test.ts ......................... 3 passed
tests/spl_token.test.ts ............................ 3 passed
tests/telegram_bot.test.ts ......................... 12 passed
tests/treasury.test.ts ............................. 4 passed
tests/v0.test.ts ................................... 1 passed
tests/webhooks.test.ts ............................. 3 passed

Total: 57 pass, 0 fail (16 test suites)
```

---

## CLI Reference

```bash
# Calculate multi-hop route
bun run src/cli.ts route --recipient <PUBKEY> --amount 1.5

# Parallel multi-vault split calculation
bun run src/cli.ts split --amount 10.0 --vaults <V1>,<V2>,<V3>

# Run pre-flight risk screening
bun run src/cli.ts risk --target <PUBKEY>

# Interactive Telegram Bot runner
bun run src/run_bot.ts

# Run entire test suite
bun test

# Run hardware benchmark harness
bun run tests/benchmark.ts
```

---

## License

MIT © 2026 @tmclaos.
