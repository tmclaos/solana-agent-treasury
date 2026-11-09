import { PublicKey, Keypair, Connection } from '@solana/web3.js';
import { TreasuryGuard } from './treasury.js';
import { MultiHopRouter } from './router.js';
import { RouteDispatcher } from './dispatcher.js';
import { RiskGuard } from './risk_guard.js';
import { SplTokenManager, COMMON_MINTS } from './spl_token.js';
import { WebhookDispatcher } from './webhooks.js';

export interface AgentPluginConfig {
  connection: Connection;
  payerKeypair: Keypair;
  treasuryGuard: TreasuryGuard;
  router: MultiHopRouter;
  riskGuard?: RiskGuard;
  webhookDispatcher?: WebhookDispatcher;
}

export class SolanaTreasuryAgentPlugin {
  private connection: Connection;
  private payerKeypair: Keypair;
  private treasury: TreasuryGuard;
  private router: MultiHopRouter;
  private riskGuard: RiskGuard;
  private dispatcher: RouteDispatcher;
  private webhooks?: WebhookDispatcher;

  constructor(config: AgentPluginConfig) {
    this.connection = config.connection;
    this.payerKeypair = config.payerKeypair;
    this.treasury = config.treasuryGuard;
    this.router = config.router;
    this.riskGuard = config.riskGuard ?? new RiskGuard();
    this.dispatcher = new RouteDispatcher(config.connection);
    this.webhooks = config.webhookDispatcher;
  }

  public async executePayout(params: {
    recipientAddress: string;
    amountLamports: bigint;
    memo?: string;
  }): Promise<{ signature: string; protocolFeeLamports: bigint; recipient: string }> {
    const recipient = new PublicKey(params.recipientAddress);

    // 1. Pre-flight Risk Intelligence
    const riskProfile = await this.riskGuard.evaluateWallet(recipient);
    this.riskGuard.validateRiskProfile(riskProfile);

    // 2. Treasury Policy & Circuit Breaker Validation
    this.treasury.validateTransfer({ recipient, lamports: params.amountLamports, memo: params.memo });

    // 3. Compute Multi-Hop Route with Protocol Attribution
    const route = this.router.computeRoute(this.payerKeypair.publicKey, recipient, params.amountLamports);

    // 4. Dispatch with Dynamic Priority Fees
    const dispatchResult = await this.dispatcher.dispatchRoute(this.payerKeypair, route);

    // 5. Record spend in Treasury State
    this.treasury.recordTransfer(params.amountLamports);

    // 6. Optional Webhook Notification
    if (this.webhooks) {
      await this.webhooks.dispatch('treasury.payout.dispatched', {
        signature: dispatchResult.signature,
        recipient: params.recipientAddress,
        amountLamports: params.amountLamports.toString(),
        protocolFeeLamports: route.protocolFeeLamports.toString(),
      }).catch(() => {});
    }

    return {
      signature: dispatchResult.signature,
      protocolFeeLamports: route.protocolFeeLamports,
      recipient: params.recipientAddress,
    };
  }

  public async checkRecipientRisk(address: string) {
    const pubkey = new PublicKey(address);
    return this.riskGuard.evaluateWallet(pubkey);
  }

  public getTreasuryStatus() {
    const state = this.treasury.getState();
    const policy = this.treasury.getPolicy();
    const auditChain = this.treasury.getAuditLog();

    return {
      owner: policy.owner.toBase58(),
      dailyLimitLamports: policy.dailySpendLimitLamports.toString(),
      spentTodayLamports: state.totalSpentTodayLamports.toString(),
      remainingTodayLamports: (policy.dailySpendLimitLamports - state.totalSpentTodayLamports).toString(),
      circuitBreakerActive: state.circuitBreakerActive,
      auditChainLength: auditChain.getLength(),
      auditChainValid: auditChain.verifyIntegrity(),
    };
  }

  public getToolDefinitions() {
    return [
      {
        name: 'solana_treasury_payout',
        description: 'Execute an autonomous, policy-guarded Solana transfer with multi-hop routing and MEV protection.',
        parameters: {
          type: 'object',
          properties: {
            recipientAddress: { type: 'string', description: 'Solana base58 destination address' },
            amountSol: { type: 'number', description: 'Amount in SOL to disburse' },
            memo: { type: 'string', description: 'Optional payment memo' },
          },
          required: ['recipientAddress', 'amountSol'],
        },
      },
      {
        name: 'solana_treasury_risk_check',
        description: 'Screen a destination Solana address for malicious drainers, phishing threats, or high risk scores.',
        parameters: {
          type: 'object',
          properties: {
            address: { type: 'string', description: 'Solana base58 address to inspect' },
          },
          required: ['address'],
        },
      },
      {
        name: 'solana_treasury_status',
        description: 'Query current spending caps, daily usage, circuit breaker status, and cryptographic audit log health.',
        parameters: { type: 'object', properties: {} },
      },
    ];
  }
}
