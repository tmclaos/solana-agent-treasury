import { PublicKey } from '@solana/web3.js';
import { RouteHop, MultiHopRoute, TokenTransfer, RouteSplit, ParallelSplitRoute } from './types.js';

export class MultiHopRouter {
  public static readonly PROTOCOL_FEE_BPS = 50; // 0.50%
  public static readonly REVENUE_SHARE_BPS = 25; // 0.25%
  public static readonly BPS_DIVISOR = 10_000n;

  private intermediateVaults: PublicKey[];

  constructor(intermediateVaults: PublicKey[] = []) {
    this.intermediateVaults = intermediateVaults;
  }

  public getIntermediateVaults(): PublicKey[] {
    return [...this.intermediateVaults];
  }

  public setIntermediateVaults(vaults: PublicKey[]): void {
    this.intermediateVaults = vaults;
  }

  public computeRoute(source: PublicKey, finalRecipient: PublicKey, amount: bigint): MultiHopRoute {
    if (amount <= 0n) {
      throw new Error('MultiHopRouter: Routing amount must be strictly greater than zero.');
    }

    const routeId = `route_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const protocolFee = (amount * BigInt(MultiHopRouter.PROTOCOL_FEE_BPS)) / MultiHopRouter.BPS_DIVISOR;
    const netAmount = amount - protocolFee;

    const hops: RouteHop[] = [];

    if (this.intermediateVaults.length === 0) {
      hops.push({
        hopIndex: 0,
        sourceAccount: source,
        destinationAccount: finalRecipient,
        amount: netAmount,
        feeTierBps: MultiHopRouter.PROTOCOL_FEE_BPS,
        protocolShareBps: MultiHopRouter.REVENUE_SHARE_BPS,
      });
    } else {
      let currentSource = source;
      for (let i = 0; i < this.intermediateVaults.length; i++) {
        const nextVault = this.intermediateVaults[i];
        hops.push({
          hopIndex: i,
          sourceAccount: currentSource,
          destinationAccount: nextVault,
          amount: netAmount,
          feeTierBps: 0,
          protocolShareBps: 0,
        });
        currentSource = nextVault;
      }

      hops.push({
        hopIndex: this.intermediateVaults.length,
        sourceAccount: currentSource,
        destinationAccount: finalRecipient,
        amount: netAmount,
        feeTierBps: MultiHopRouter.PROTOCOL_FEE_BPS,
        protocolShareBps: MultiHopRouter.REVENUE_SHARE_BPS,
      });
    }

    const estimatedNetworkFeeLamports = BigInt(hops.length * 5000);

    return {
      routeId,
      source,
      finalRecipient,
      totalAmount: amount,
      hops,
      estimatedNetworkFeeLamports,
      protocolFeeLamports: protocolFee,
      createdAt: Date.now(),
    };
  }

  public computeParallelSplitRoute(
    source: PublicKey,
    finalRecipient: PublicKey,
    totalAmount: bigint,
    weightsBps?: number[]
  ): ParallelSplitRoute {
    if (totalAmount <= 0n) {
      throw new Error('MultiHopRouter: Split routing amount must be strictly positive.');
    }

    if (this.intermediateVaults.length === 0) {
      throw new Error('MultiHopRouter: Parallel splitting requires at least one registered intermediate vault.');
    }

    const vaultCount = this.intermediateVaults.length;
    let normalizedWeights: number[];

    if (weightsBps && weightsBps.length === vaultCount) {
      const sum = weightsBps.reduce((a, b) => a + b, 0);
      if (sum !== 10_000) {
        throw new Error(`MultiHopRouter: Split weights must sum to exactly 10,000 bps (100%). Received: ${sum}`);
      }
      normalizedWeights = weightsBps;
    } else {
      // Equal distribution with integer division
      const baseWeight = Math.floor(10_000 / vaultCount);
      normalizedWeights = new Array(vaultCount).fill(baseWeight);
      // Remainder bps assigned to first vault
      const remainder = 10_000 - baseWeight * vaultCount;
      normalizedWeights[0] += remainder;
    }

    const splits: RouteSplit[] = [];
    let allocatedAmount = 0n;

    for (let i = 0; i < vaultCount; i++) {
      const vault = this.intermediateVaults[i];
      const weight = normalizedWeights[i];
      const isLast = i === vaultCount - 1;

      // Last vault gets exact remainder to guarantee zero-loss conservation
      const splitAmount = isLast
        ? totalAmount - allocatedAmount
        : (totalAmount * BigInt(weight)) / MultiHopRouter.BPS_DIVISOR;

      allocatedAmount += splitAmount;

      // Build single hop route through this specific vault
      const subRouter = new MultiHopRouter([vault]);
      const subRoute = subRouter.computeRoute(source, finalRecipient, splitAmount);

      splits.push({
        vault,
        weightBps: weight,
        amount: splitAmount,
        route: subRoute,
      });
    }

    const totalProtocolFeeLamports = splits.reduce((acc, s) => acc + s.route.protocolFeeLamports, 0n);
    const totalRevenueShareLamports = this.calculateRevenueShare(totalAmount);

    return {
      splitId: `split_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      source,
      finalRecipient,
      totalAmount,
      splits,
      totalProtocolFeeLamports,
      totalRevenueShareLamports,
      createdAt: Date.now(),
    };
  }

  public batchRoutes(source: PublicKey, transfers: TokenTransfer[]): MultiHopRoute[] {
    return transfers.map(transfer => this.computeRoute(source, transfer.recipient, transfer.lamports));
  }

  public calculateRevenueShare(totalRoutedVolumeLamports: bigint): bigint {
    return (totalRoutedVolumeLamports * BigInt(MultiHopRouter.REVENUE_SHARE_BPS)) / MultiHopRouter.BPS_DIVISOR;
  }
}
