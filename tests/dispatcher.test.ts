import { Connection, Keypair } from '@solana/web3.js';
import { RouteDispatcher } from '../src/dispatcher';
import { MultiHopRouter } from '../src/router';

describe('RouteDispatcher Transaction Construction Tests', () => {
  const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
  const dispatcher = new RouteDispatcher(connection, {
    priorityFeeMicroLamports: 15_000,
    computeUnitsLimit: 250_000,
  });

  const sender = Keypair.generate().publicKey;
  const recipient1 = Keypair.generate().publicKey;
  const recipient2 = Keypair.generate().publicKey;

  it('creates batched transfer transaction with priority instructions', async () => {
    const transfers = [
      { recipient: recipient1, lamports: 100_000_000n },
      { recipient: recipient2, lamports: 200_000_000n },
    ];

    const tx = await dispatcher.createBatchTransaction(sender, transfers);

    // 2 compute budget instructions + 2 transfer instructions = 4
    expect(tx.instructions).toHaveLength(4);
  });

  it('creates multi-hop route transaction', async () => {
    const router = new MultiHopRouter([Keypair.generate().publicKey]);
    const route = router.computeRoute(sender, recipient1, 500_000_000n);

    const tx = await dispatcher.createRouteTransaction(route);

    // 2 compute budget instructions + 2 hops = 4
    expect(tx.instructions).toHaveLength(4);
  });
});
