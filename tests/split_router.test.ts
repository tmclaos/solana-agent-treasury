import { Keypair } from '@solana/web3.js';
import { MultiHopRouter } from '../src/router';

describe('MultiHopRouter Parallel Multi-Vault Splitting Tests', () => {
  const source = Keypair.generate().publicKey;
  const recipient = Keypair.generate().publicKey;
  const vault1 = Keypair.generate().publicKey;
  const vault2 = Keypair.generate().publicKey;
  const vault3 = Keypair.generate().publicKey;

  it('splits payment evenly across multiple vaults with zero conservation loss', () => {
    const router = new MultiHopRouter([vault1, vault2, vault3]);
    const totalAmount = 10_000_000_001n; // odd number to test remainder distribution

    const splitRoute = router.computeParallelSplitRoute(source, recipient, totalAmount);

    expect(splitRoute.splits).toHaveLength(3);

    // Sum of split amounts must exactly equal original total amount
    const sumSplits = splitRoute.splits.reduce((acc, s) => acc + s.amount, 0n);
    expect(sumSplits).toBe(totalAmount);

    // Verify protocol fee and revenue share are aggregated
    expect(splitRoute.totalProtocolFeeLamports).toBeGreaterThan(0n);
    expect(splitRoute.totalRevenueShareLamports).toBeGreaterThan(0n);
  });

  it('respects custom basis point weights across vaults', () => {
    const router = new MultiHopRouter([vault1, vault2]);
    const totalAmount = 1_000_000_000n;
    // 70% to Vault 1, 30% to Vault 2
    const weightsBps = [7_000, 3_000];

    const splitRoute = router.computeParallelSplitRoute(source, recipient, totalAmount, weightsBps);

    expect(splitRoute.splits[0].amount).toBe(700_000_000n);
    expect(splitRoute.splits[1].amount).toBe(300_000_000n);
    expect(splitRoute.splits[0].amount + splitRoute.splits[1].amount).toBe(totalAmount);
  });

  it('rejects weights that do not sum to 10,000 bps', () => {
    const router = new MultiHopRouter([vault1, vault2]);
    const totalAmount = 1_000_000_000n;

    expect(() => {
      router.computeParallelSplitRoute(source, recipient, totalAmount, [5_000, 4_000]);
    }).toThrow(/must sum to exactly 10,000 bps/);
  });
});
