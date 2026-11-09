import { Keypair } from '@solana/web3.js';
import { VersionedTransactionBuilder } from '../src/v0_builder';
import { MultiHopRouter } from '../src/router';

describe('VersionedTransactionBuilder (v0) Tests', () => {
  const payer = Keypair.generate().publicKey;
  const recipient = Keypair.generate().publicKey;
  const mockBlockhash = '4uQeVj5tqViQh7yWWGStvkEG1Zmhx6uasJtWCJziofM';

  it('compiles valid v0 transaction within packet size limits', () => {
    const router = new MultiHopRouter();
    const route = router.computeRoute(payer, recipient, 1_000_000_000n);

    const v0Tx = VersionedTransactionBuilder.createMultiHopV0({
      payerKey: payer,
      recentBlockhash: mockBlockhash,
      route,
      priorityFeeMicroLamports: 10_000,
      computeUnitsLimit: 200_000,
    });

    const serialized = v0Tx.serialize();
    expect(serialized.length).toBeLessThan(VersionedTransactionBuilder.PACKET_DATA_SIZE);
    expect(v0Tx.version).toBe(0);
  });
});
