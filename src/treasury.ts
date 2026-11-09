import { PublicKey } from '@solana/web3.js';
import { TreasuryPolicy, TreasuryState, TokenTransfer } from './types.js';
import { RiskGuard } from './risk_guard.js';
import { AuditLogChain } from './audit.js';

export interface CircuitBreakerConfig {
  maxBurstTransactions: number;
  burstWindowMs: number;
  cooldownPeriodMs: number;
}

export class TreasuryGuard {
  private policy: TreasuryPolicy;
  private state: TreasuryState;
  private circuitBreakerConfig: CircuitBreakerConfig;
  private riskGuard?: RiskGuard;
  private auditChain: AuditLogChain = new AuditLogChain();
  private recentBurstTimestamps: number[] = [];
  private circuitBreakerTrippedUntil = 0;
  private pendingApprovals: Map<string, Set<string>> = new Map();

  private static readonly ONE_DAY_MS = 86_400_000;
  private static readonly ONE_MINUTE_MS = 60_000;

  constructor(
    policy: TreasuryPolicy,
    initialState?: Partial<TreasuryState>,
    circuitBreakerConfig?: Partial<CircuitBreakerConfig>,
    riskGuard?: RiskGuard
  ) {
    this.policy = policy;
    this.riskGuard = riskGuard;
    const now = Date.now();
    this.state = {
      totalSpentTodayLamports: initialState?.totalSpentTodayLamports ?? 0n,
      lastResetTimestamp: initialState?.lastResetTimestamp ?? now,
      recentTransactionsCount: initialState?.recentTransactionsCount ?? 0,
      lastTxTimestamp: initialState?.lastTxTimestamp ?? now,
    };
    this.circuitBreakerConfig = {
      maxBurstTransactions: circuitBreakerConfig?.maxBurstTransactions ?? 5,
      burstWindowMs: circuitBreakerConfig?.burstWindowMs ?? 3000,
      cooldownPeriodMs: circuitBreakerConfig?.cooldownPeriodMs ?? 30_000,
    };
  }

  public setRiskGuard(riskGuard: RiskGuard): void {
    this.riskGuard = riskGuard;
  }

  public getRiskGuard(): RiskGuard | undefined {
    return this.riskGuard;
  }

  public getAuditLog(): AuditLogChain {
    return this.auditChain;
  }

  public validateTransfer(transfer: TokenTransfer): void {
    const now = Date.now();
    this.refreshRollingWindows(now);

    if (now < this.circuitBreakerTrippedUntil) {
      const remainingSec = Math.ceil((this.circuitBreakerTrippedUntil - now) / 1000);
      throw new Error(
        `TreasuryGuard: Circuit breaker is ACTIVE due to burst anomaly. Cooldown in effect for ${remainingSec}s.`
      );
    }

    const recipientBase58 = transfer.recipient.toBase58();
    if (this.policy.enforceWhitelist && !this.policy.whitelistedRecipients.has(recipientBase58)) {
      throw new Error(`TreasuryGuard: Recipient ${recipientBase58} is not present in the authorized whitelist.`);
    }

    if (transfer.lamports <= 0n) {
      throw new Error(`TreasuryGuard: Transfer amount must be positive. Received: ${transfer.lamports}`);
    }

    if (transfer.lamports > this.policy.maxTransactionLimitLamports) {
      throw new Error(
        `TreasuryGuard: Transaction amount (${transfer.lamports} lamports) exceeds maximum per-transaction cap (${this.policy.maxTransactionLimitLamports} lamports).`
      );
    }

    const projectedDailySpend = this.state.totalSpentTodayLamports + transfer.lamports;
    if (projectedDailySpend > this.policy.dailySpendLimitLamports) {
      throw new Error(
        `TreasuryGuard: Transaction exceeds daily spending ceiling. Limit: ${this.policy.dailySpendLimitLamports}, Spent: ${this.state.totalSpentTodayLamports}, Requested: ${transfer.lamports}`
      );
    }

    if (this.state.recentTransactionsCount >= this.policy.rateLimitPerMinute) {
      throw new Error(
        `TreasuryGuard: Rate limit exceeded. Maximum ${this.policy.rateLimitPerMinute} transactions per minute permitted.`
      );
    }

    // Check Multi-Sig / Dual-Approval High Watermark Threshold
    if (this.policy.approvalThreshold && transfer.lamports >= this.policy.approvalThreshold.thresholdLamports) {
      const transferId = `${recipientBase58}_${transfer.lamports}`;
      const approvals = this.pendingApprovals.get(transferId) || new Set();
      if (approvals.size < this.policy.approvalThreshold.requiredApprovals) {
        throw new Error(
          `TreasuryGuard: Transfer exceeds high-watermark threshold (${this.policy.approvalThreshold.thresholdLamports} lamports). Requires ${this.policy.approvalThreshold.requiredApprovals} co-signer approvals, currently has ${approvals.size}.`
        );
      }
    }

    this.checkBurstVelocity(now);

    this.auditChain.append('TRANSFER_VALIDATED', {
      recipient: recipientBase58,
      lamports: transfer.lamports.toString(),
      mint: transfer.mint?.toBase58() ?? 'SOL',
    });
  }

  public async validateTransferAsync(transfer: TokenTransfer): Promise<void> {
    this.validateTransfer(transfer);

    if (this.riskGuard) {
      const riskProfile = await this.riskGuard.evaluateWallet(transfer.recipient);
      this.riskGuard.validateRiskProfile(riskProfile);
    }
  }

  public registerApproval(transferId: string, approver: PublicKey): void {
    if (!this.policy.approvalThreshold?.authorizedApprovers.has(approver.toBase58())) {
      throw new Error(`TreasuryGuard: Key ${approver.toBase58()} is not an authorized co-signer.`);
    }
    const current = this.pendingApprovals.get(transferId) || new Set();
    current.add(approver.toBase58());
    this.pendingApprovals.set(transferId, current);

    this.auditChain.append('APPROVAL_REGISTERED', {
      transferId,
      approver: approver.toBase58(),
      currentApprovalCount: current.size,
    });
  }

  public validateBatch(transfers: TokenTransfer[]): void {
    if (transfers.length === 0) {
      throw new Error('TreasuryGuard: Cannot validate an empty transfer batch.');
    }

    let batchTotalLamports = 0n;
    for (const transfer of transfers) {
      this.validateTransfer(transfer);
      batchTotalLamports += transfer.lamports;
    }

    const projectedDailySpend = this.state.totalSpentTodayLamports + batchTotalLamports;
    if (projectedDailySpend > this.policy.dailySpendLimitLamports) {
      throw new Error(
        `TreasuryGuard: Cumulative batch total exceeds daily spend limit. Total: ${projectedDailySpend}, Limit: ${this.policy.dailySpendLimitLamports}`
      );
    }
  }

  public recordTransfer(amountLamports: bigint): void {
    const now = Date.now();
    this.refreshRollingWindows(now);
    this.state.totalSpentTodayLamports += amountLamports;
    this.state.recentTransactionsCount += 1;
    this.state.lastTxTimestamp = now;
    this.recentBurstTimestamps.push(now);

    this.auditChain.append('TRANSFER_DISPATCHED', {
      amountLamports: amountLamports.toString(),
      totalSpentTodayLamports: this.state.totalSpentTodayLamports.toString(),
    });
  }

  public getState(): Readonly<TreasuryState> & { circuitBreakerActive: boolean } {
    return {
      ...this.state,
      circuitBreakerActive: Date.now() < this.circuitBreakerTrippedUntil,
    };
  }

  public getPolicy(): Readonly<TreasuryPolicy> {
    return { ...this.policy };
  }

  public resetCircuitBreaker(): void {
    this.circuitBreakerTrippedUntil = 0;
    this.recentBurstTimestamps = [];
  }

  public addWhitelistedRecipient(recipient: PublicKey): void {
    this.policy.whitelistedRecipients.add(recipient.toBase58());
  }

  public removeWhitelistedRecipient(recipient: PublicKey): void {
    this.policy.whitelistedRecipients.delete(recipient.toBase58());
  }

  private checkBurstVelocity(now: number): void {
    this.recentBurstTimestamps = this.recentBurstTimestamps.filter(
      ts => now - ts <= this.circuitBreakerConfig.burstWindowMs
    );

    if (this.recentBurstTimestamps.length >= this.circuitBreakerConfig.maxBurstTransactions) {
      this.circuitBreakerTrippedUntil = now + this.circuitBreakerConfig.cooldownPeriodMs;
      this.auditChain.append('CIRCUIT_BREAKER_TRIPPED', {
        burstCount: this.recentBurstTimestamps.length,
        cooldownPeriodMs: this.circuitBreakerConfig.cooldownPeriodMs,
      });
      throw new Error(
        `TreasuryGuard: Velocity circuit breaker TRIPPED! Detected ${this.recentBurstTimestamps.length} transactions within ${this.circuitBreakerConfig.burstWindowMs}ms. Pausing for ${this.circuitBreakerConfig.cooldownPeriodMs / 1000}s.`
      );
    }
  }

  private refreshRollingWindows(currentTime: number): void {
    if (currentTime - this.state.lastResetTimestamp >= TreasuryGuard.ONE_DAY_MS) {
      this.state.totalSpentTodayLamports = 0n;
      this.state.lastResetTimestamp = currentTime;
    }

    if (currentTime - this.state.lastTxTimestamp >= TreasuryGuard.ONE_MINUTE_MS) {
      this.state.recentTransactionsCount = 0;
    }
  }
}
