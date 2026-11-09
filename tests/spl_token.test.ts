import { Keypair } from '@solana/web3.js';
import { SplTokenManager, COMMON_MINTS, TOKEN_PROGRAM_ID } from '../src/spl_token';

describe('SplTokenManager Stablecoin & Token Routing Tests', () => {
  const owner = Keypair.generate().publicKey;
  const destination = Keypair.generate().publicKey;
  const usdcMint = COMMON_MINTS.USDC;

  it('computes deterministic Associated Token Address (ATA)', () => {
    const ata = SplTokenManager.getAssociatedTokenAddressSync(usdcMint, owner);
    expect(ata).toBeDefined();
    expect(typeof ata.toBase58()).toBe('string');
  });

  it('creates valid transferChecked instruction with decimal precision', () => {
    const sourceAta = SplTokenManager.getAssociatedTokenAddressSync(usdcMint, owner);
    const destAta = SplTokenManager.getAssociatedTokenAddressSync(usdcMint, destination);
    const amount = 500_000_000n; // 500 USDC

    const ix = SplTokenManager.createTransferCheckedInstruction({
      source: sourceAta,
      mint: usdcMint,
      destination: destAta,
      owner,
      amount,
      decimals: 6,
    });

    expect(ix.programId.equals(TOKEN_PROGRAM_ID)).toBe(true);
    expect(ix.keys).toHaveLength(4);
    expect(ix.keys[0].pubkey.equals(sourceAta)).toBe(true);
    expect(ix.keys[1].pubkey.equals(usdcMint)).toBe(true);
    expect(ix.keys[2].pubkey.equals(destAta)).toBe(true);
    expect(ix.keys[3].pubkey.equals(owner)).toBe(true);
    expect(ix.keys[3].isSigner).toBe(true);

    // Verify instruction data: index 12 (TransferChecked)
    expect(ix.data[0]).toBe(12);
    expect(ix.data[9]).toBe(6); // 6 decimals
  });

  it('correctly parses and formats token amounts with 6 decimals', () => {
    const parsed = SplTokenManager.parseTokenAmount('1250.50', 6);
    expect(parsed).toBe(1_250_500_000n);

    const formatted = SplTokenManager.formatTokenAmount(1_250_500_000n, 6);
    expect(formatted).toBe('1,250.5000');
  });
});
