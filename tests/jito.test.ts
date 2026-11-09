import { Keypair } from '@solana/web3.js';
import { JitoMevEngine } from '../src/jito';

describe('JitoMevEngine Front-Running & Tip Tests', () => {
  const payer = Keypair.generate().publicKey;

  it('generates valid tip instruction to a recognized Jito tip account', () => {
    const tipLamports = 25_000n;
    const ix = JitoMevEngine.createTipInstruction(payer, tipLamports);

    expect(ix.programId.toBase58()).toBe('11111111111111111111111111111111');
    const destination = ix.keys[1].pubkey.toBase58();
    expect(JitoMevEngine.JITO_TIP_ACCOUNTS).toContain(destination);
  });

  it('computes dynamic tip within bounds', () => {
    const smallTx = 100_000_000n; // 0.1 SOL
    const smallTip = JitoMevEngine.calculateDynamicTip(smallTx, 'medium');
    expect(smallTip).toBeGreaterThanOrEqual(10_000n);

    const largeTx = 100_000_000_000n; // 100 SOL
    const largeTip = JitoMevEngine.calculateDynamicTip(largeTx, 'high');
    expect(largeTip).toBeLessThanOrEqual(50_000_000n); // max ceiling 0.05 SOL
  });
});
