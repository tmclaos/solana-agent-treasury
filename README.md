# solana-agent-treasury

Autonomous Agent Treasury Guard & Multi-Hop Route Dispatcher for Solana.

## Overview
`solana-agent-treasury` provides autonomous AI agents with production-grade treasury management, MultiHopper multi-hop transaction routing, automated revenue share fee tracking, and strict programmatic safety guardrails on Solana.

### Key Features
- **MultiHopper Route Integration**: Programmatic routing of SOL and SPL token transfers across non-commingled multi-hop hops.
- **Revenue Share Fee Accounting**: Full 0.25% revenue-share ledger calculation and reconciliation per qualifying transfer.
- **Multi-Send Batching**: Atomic multi-recipient payout batches with dynamic Compute Unit (CU) price prioritization.
- **Policy Guardrails**:
  - Maximum Per-Transaction Ceilings
  - 24-Hour Rolling Spend Limits
  - Rate & Velocity Limiting
  - Strict Destination Address Whitelisting
  - TRM Labs Smart Contract Compliance Screening Hooks
- **CLI & TypeScript SDK**: Interactive CLI for balance monitoring, route execution, and policy auditing.
- **Automated Test Suite**: Unit and integration test harness covering all guardrails and routing paths.

## Quickstart

### Installation
```bash
npm install
npm run build
```

### Configuration
```env
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
TREASURY_KEYPAIR=[...]
MULTIHOPPER_API_KEY=your_multihopper_api_key
MAX_PER_TX_LAMPORTS=1000000000
MAX_DAILY_LAMPORTS=5000000000
```

### CLI Commands
```bash
# Check treasury status & guardrails
npm run cli -- status

# Dispatch routed multi-hop payment
npm run cli -- send --recipient <ADDRESS> --amount <SOL> --hops 3

# Execute batched Multi-Send payout
npm run cli -- batch --file payouts.json --priority high
```

## Security & Audit
All outbound transfers must pass internal policy assertion checks before transaction serialization. Failed or non-whitelisted transactions are rejected without emitting network transactions.

## License
MIT
