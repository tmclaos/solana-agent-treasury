import { PublicKey } from '@solana/web3.js';

export interface TokenTransfer {
  recipient: PublicKey;
  lamports: bigint;
  mint?: PublicKey;
  sourceTokenAccount?: PublicKey;
  destinationTokenAccount?: PublicKey;
  decimals?: number;
  memo?: string;
}

export interface RouteHop {
  hopIndex: number;
  sourceAccount: PublicKey;
  destinationAccount: PublicKey;
  amount: bigint;
  feeTierBps: number;
  protocolShareBps: number;
}

export interface MultiHopRoute {
  routeId: string;
  source: PublicKey;
  finalRecipient: PublicKey;
  totalAmount: bigint;
  hops: RouteHop[];
  estimatedNetworkFeeLamports: bigint;
  protocolFeeLamports: bigint;
  createdAt: number;
  tokenMint?: PublicKey;
}

export interface RouteSplit {
  vault: PublicKey;
  weightBps: number;
  amount: bigint;
  route: MultiHopRoute;
}

export interface ParallelSplitRoute {
  splitId: string;
  source: PublicKey;
  finalRecipient: PublicKey;
  totalAmount: bigint;
  splits: RouteSplit[];
  totalProtocolFeeLamports: bigint;
  totalRevenueShareLamports: bigint;
  createdAt: number;
}

export interface ApprovalThreshold {
  thresholdLamports: bigint;
  requiredApprovals: number;
  authorizedApprovers: Set<string>;
}

export interface TreasuryPolicy {
  owner: PublicKey;
  dailySpendLimitLamports: bigint;
  maxTransactionLimitLamports: bigint;
  whitelistedRecipients: Set<string>;
  enforceWhitelist: boolean;
  rateLimitPerMinute: number;
  approvalThreshold?: ApprovalThreshold;
}

export interface TreasuryState {
  totalSpentTodayLamports: bigint;
  lastResetTimestamp: number;
  recentTransactionsCount: number;
  lastTxTimestamp: number;
}

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface WalletRiskProfile {
  address: string;
  score: number; // 0 (safest) to 100 (highest risk)
  level: RiskLevel;
  isDrainer: boolean;
  isPhishing: boolean;
  isSanctioned: boolean;
  tags: string[];
  evaluatedAt: number;
}

export interface RiskGuardConfig {
  maxAllowedRiskScore: number;
  blockDrainers: boolean;
  blockSanctions: boolean;
  cacheTtlMs?: number;
  apiKey?: string;
}

export interface AuditEntry {
  sequenceNumber: number;
  previousHash: string;
  currentHash: string;
  action: 'TRANSFER_VALIDATED' | 'TRANSFER_DISPATCHED' | 'CIRCUIT_BREAKER_TRIPPED' | 'APPROVAL_REGISTERED';
  details: Record<string, any>;
  timestamp: number;
}

export interface DispatchResult {
  signature: string;
  success: boolean;
  slot: number;
  feePaidLamports: bigint;
  transfersCount: number;
  timestamp: number;
  error?: string;
}

export interface SimulationResult {
  simulatedUnitsConsumed: number;
  estimatedFee: bigint;
  logs: string[];
  success: boolean;
}
