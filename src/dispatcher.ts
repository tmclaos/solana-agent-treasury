import {
  Connection,
  PublicKey,
  Transaction,
  SystemProgram,
  ComputeBudgetProgram,
  Keypair,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import { TokenTransfer, MultiHopRoute, DispatchResult, SimulationResult } from './types.js';
import { BlockhashCache } from './blockhash_cache.js';
import { DynamicFeeEngine } from './fee_optimizer.js';

export interface DispatcherOptions {
  priorityFeeMicroLamports?: number;
  computeUnitsLimit?: number;
  useDynamicFees?: boolean;
}

export class RouteDispatcher {
  private connection: Connection;
  private priorityFeeMicroLamports: number;
  private computeUnitsLimit: number;
  private useDynamicFees: boolean;
  private blockhashCache: BlockhashCache;
  private feeEngine: DynamicFeeEngine;

  constructor(connection: Connection, options?: DispatcherOptions) {
    this.connection = connection;
    this.priorityFeeMicroLamports = options?.priorityFeeMicroLamports ?? 15_000;
    this.computeUnitsLimit = options?.computeUnitsLimit ?? 200_000;
    this.useDynamicFees = options?.useDynamicFees ?? true;
    this.blockhashCache = new BlockhashCache(connection);
    this.feeEngine = new DynamicFeeEngine(connection);
  }

  public getBlockhashCache(): BlockhashCache {
    return this.blockhashCache;
  }

  public async getEffectivePriorityFee(): Promise<number> {
    if (this.useDynamicFees) {
      const fees = await this.feeEngine.computeOptimalPriorityFee();
      return fees.recommendedMicroLamports;
    }
    return this.priorityFeeMicroLamports;
  }

  public async createBatchTransaction(sender: PublicKey, transfers: TokenTransfer[]): Promise<Transaction> {
    const tx = new Transaction();
    const effectiveFee = await this.getEffectivePriorityFee();

    tx.add(
      ComputeBudgetProgram.setComputeUnitLimit({
        units: this.computeUnitsLimit,
      })
    );

    tx.add(
      ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: effectiveFee,
      })
    );

    for (const transfer of transfers) {
      tx.add(
        SystemProgram.transfer({
          fromPubkey: sender,
          toPubkey: transfer.recipient,
          lamports: transfer.lamports,
        })
      );
    }

    const { blockhash } = await this.blockhashCache.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    tx.feePayer = sender;

    return tx;
  }

  public async createRouteTransaction(route: MultiHopRoute): Promise<Transaction> {
    const tx = new Transaction();
    const effectiveFee = await this.getEffectivePriorityFee();

    tx.add(
      ComputeBudgetProgram.setComputeUnitLimit({
        units: this.computeUnitsLimit,
      })
    );

    tx.add(
      ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: effectiveFee,
      })
    );

    for (const hop of route.hops) {
      tx.add(
        SystemProgram.transfer({
          fromPubkey: hop.sourceAccount,
          toPubkey: hop.destinationAccount,
          lamports: hop.amount,
        })
      );
    }

    const { blockhash } = await this.blockhashCache.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    tx.feePayer = route.source;

    return tx;
  }

  public async simulate(sender: PublicKey, tx: Transaction): Promise<SimulationResult> {
    if (!tx.recentBlockhash) {
      const { blockhash } = await this.blockhashCache.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = sender;
    }

    const simulation = await this.connection.simulateTransaction(tx);

    return {
      simulatedUnitsConsumed: simulation.value.unitsConsumed ?? 0,
      estimatedFee: BigInt(5000),
      logs: simulation.value.logs ?? [],
      success: !simulation.value.err,
    };
  }

  public async execute(payer: Keypair, tx: Transaction): Promise<DispatchResult> {
    try {
      const signature = await sendAndConfirmTransaction(this.connection, tx, [payer], {
        commitment: 'confirmed',
        preflightCommitment: 'confirmed',
      });

      return {
        signature,
        success: true,
        slot: 0,
        feePaidLamports: BigInt(5000),
        transfersCount: tx.instructions.length - 2,
        timestamp: Date.now(),
      };
    } catch (error) {
      return {
        signature: '',
        success: false,
        slot: 0,
        feePaidLamports: 0n,
        transfersCount: 0,
        timestamp: Date.now(),
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  public async dispatchRoute(payer: Keypair, route: MultiHopRoute): Promise<DispatchResult> {
    const tx = await this.createRouteTransaction(route);
    return this.execute(payer, tx);
  }
}
