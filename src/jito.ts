import { PublicKey, SystemProgram, TransactionInstruction } from '@solana/web3.js';

export class JitoMevEngine {
  public static readonly JITO_TIP_ACCOUNTS: readonly string[] = [
    '96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5',
    'HFqU5x63VTxvQssQn138i26LvbTQpsDefukV5DPKn373',
    'Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY',
    'ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49',
    'DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh',
    'ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt',
    'DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL',
    '3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT',
  ];

  public static getRandomTipAccount(): PublicKey {
    const randomIndex = Math.floor(Math.random() * this.JITO_TIP_ACCOUNTS.length);
    return new PublicKey(this.JITO_TIP_ACCOUNTS[randomIndex]);
  }

  public static createTipInstruction(payer: PublicKey, tipLamports: bigint): TransactionInstruction {
    if (tipLamports <= 0n) {
      throw new Error('JitoMevEngine: Tip amount must be positive.');
    }

    const tipAccount = this.getRandomTipAccount();
    return SystemProgram.transfer({
      fromPubkey: payer,
      toPubkey: tipAccount,
      lamports: tipLamports,
    });
  }

  public static calculateDynamicTip(transactionValueLamports: bigint, urgency: 'low' | 'medium' | 'high' = 'medium'): bigint {
    const bpsMultiplier = urgency === 'high' ? 10n : urgency === 'medium' ? 5n : 2n;
    const computedTip = (transactionValueLamports * bpsMultiplier) / 10_000n;
    const minTip = 10_000n; // 0.00001 SOL minimum
    const maxTip = 50_000_000n; // 0.05 SOL ceiling

    if (computedTip < minTip) return minTip;
    if (computedTip > maxTip) return maxTip;
    return computedTip;
  }
}
