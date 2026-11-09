import { Connection } from '@solana/web3.js';
import { DynamicFeeEngine } from '../src/fee_optimizer';

describe('DynamicFeeEngine Prioritization Fee Tests', () => {
  it('computes accurate 75th percentile and respects fee bounds', async () => {
    const connection = new Connection();
    const feeEngine = new DynamicFeeEngine(connection, {
      defaultMinFee: 5_000,
      defaultMaxFee: 200_000,
    });

    const percentiles = await feeEngine.computeOptimalPriorityFee();

    expect(percentiles.slotsSampled).toBeGreaterThan(0);
    expect(percentiles.p75MicroLamports).toBeGreaterThanOrEqual(percentiles.p50MicroLamports);
    expect(percentiles.p90MicroLamports).toBeGreaterThanOrEqual(percentiles.p75MicroLamports);
    expect(percentiles.recommendedMicroLamports).toBeGreaterThanOrEqual(5_000);
    expect(percentiles.recommendedMicroLamports).toBeLessThanOrEqual(200_000);
  });

  it('gracefully falls back to baseline defaults if RPC returns empty', async () => {
    const mockEmptyConnection = {
      getRecentPrioritizationFees: async () => [],
    } as unknown as Connection;

    const feeEngine = new DynamicFeeEngine(mockEmptyConnection);
    const fees = await feeEngine.computeOptimalPriorityFee();

    expect(fees.recommendedMicroLamports).toBe(15_000);
    expect(fees.slotsSampled).toBe(0);
  });

  it('gracefully handles RPC exception and returns fallback', async () => {
    const mockFailingConnection = {
      getRecentPrioritizationFees: async () => {
        throw new Error('RPC Node Timeout 504');
      },
    } as unknown as Connection;

    const feeEngine = new DynamicFeeEngine(mockFailingConnection);
    const fees = await feeEngine.computeOptimalPriorityFee();

    expect(fees.recommendedMicroLamports).toBe(15_000);
  });
});
