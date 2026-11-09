import { Keypair } from '@solana/web3.js';
import { MultiHopRouter } from '../src/router';

describe('MultiHopRouter Route Calculation & Fee Tests', () => {
  const source = Keypair.generate().publicKey;
  const recipient = Keypair.generate().publicKey;
  const vaultA = Keypair.generate().publicKey;
  const vaultB = Keypair.generate().publicKey;

  it('computes direct single-hop route correctly', () => {
    const router = new MultiHopRouter();
    const amount = 1_000_000_000n; // 1 SOL

    const route = router.computeRoute(source, recipient, amount);

    expect(route.hops).toHaveLength(1);
    expect(route.protocolFeeLamports).toBe(5_000_000n); // 0.5% of 1 SOL
    expect(route.hops[0].amount).toBe(995_000_000n);
    expect(route.hops[0].destinationAccount.toBase58()).toBe(recipient.toBase58());
  });

  it('computes multi-hop route through vaults', () => {
    const router = new MultiHopRouter([vaultA, vaultB]);
    const amount = 1_000_000_000n;

    const route = router.computeRoute(source, recipient, amount);

    expect(route.hops).toHaveLength(3); // source -> vaultA -> vaultB -> recipient
    expect(route.hops[0].destinationAccount.toBase58()).toBe(vaultA.toBase58());
    expect(route.hops[1].destinationAccount.toBase58()).toBe(vaultB.toBase58());
    expect(route.hops[2].destinationAccount.toBase58()).toBe(recipient.toBase58());
  });

  it('accurately calculates 0.25% revenue share for volume', () => {
    const router = new MultiHopRouter();
    const volume = 100_000_000_000n; // 100 SOL
    const share = router.calculateRevenueShare(volume);

    // 0.25% of 100 SOL = 0.25 SOL = 250,000,000 lamports
    expect(share).toBe(250_000_000n);
  });
});
