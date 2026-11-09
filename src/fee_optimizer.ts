import { Connection } from '@solana/web3.js';

export interface FeePercentiles {
  p50MicroLamports: number;
  p75MicroLamports: number;
  p90MicroLamports: number;
  recommendedMicroLamports: number;
  slotsSampled: number;
}

export class DynamicFeeEngine {
  private connection: Connection;
  private defaultMinFee: number;
  private defaultMaxFee: number;

  constructor(connection: Connection, options?: { defaultMinFee?: number; defaultMaxFee?: number }) {
    this.connection = connection;
    this.defaultMinFee = options?.defaultMinFee ?? 5_000;
    this.defaultMaxFee = options?.defaultMaxFee ?? 500_000;
  }

  public async computeOptimalPriorityFee(): Promise<FeePercentiles> {
    try {
      const recentFees = await this.connection.getRecentPrioritizationFees();
      if (!recentFees || recentFees.length === 0) {
        return this.getFallbackFees();
      }

      const nonZeroFees = recentFees
        .map(f => f.prioritizationFee)
        .filter(fee => fee > 0)
        .sort((a, b) => a - b);

      if (nonZeroFees.length === 0) {
        return this.getFallbackFees();
      }

      const p50 = nonZeroFees[Math.floor(nonZeroFees.length * 0.50)];
      const p75 = nonZeroFees[Math.floor(nonZeroFees.length * 0.75)];
      const p90 = nonZeroFees[Math.floor(nonZeroFees.length * 0.90)];

      const recommended = Math.max(this.defaultMinFee, Math.min(this.defaultMaxFee, p75));

      return {
        p50MicroLamports: p50,
        p75MicroLamports: p75,
        p90MicroLamports: p90,
        recommendedMicroLamports: recommended,
        slotsSampled: recentFees.length,
      };
    } catch {
      return this.getFallbackFees();
    }
  }

  private getFallbackFees(): FeePercentiles {
    return {
      p50MicroLamports: 5_000,
      p75MicroLamports: 15_000,
      p90MicroLamports: 30_000,
      recommendedMicroLamports: 15_000,
      slotsSampled: 0,
    };
  }
}
