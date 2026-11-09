import { PublicKey, TransactionInstruction } from '@solana/web3.js';

export const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
export const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');

export const COMMON_MINTS = {
  USDC: new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'),
  USDT: new PublicKey('Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'),
  PYUSD: new PublicKey('2b1kV6itusLR5ZESdrmw48ZP4c7zF55a1YTKHhNn6WkC'),
};

export class SplTokenManager {
  public static getAssociatedTokenAddressSync(
    mint: PublicKey,
    owner: PublicKey,
    allowOwnerOffCurve = false,
    programId = TOKEN_PROGRAM_ID,
    associatedTokenProgramId = ASSOCIATED_TOKEN_PROGRAM_ID
  ): PublicKey {
    const [address] = PublicKey.findProgramAddressSync(
      [owner.toBuffer(), programId.toBuffer(), mint.toBuffer()],
      associatedTokenProgramId
    );
    return address;
  }

  public static createTransferCheckedInstruction(params: {
    source: PublicKey;
    mint: PublicKey;
    destination: PublicKey;
    owner: PublicKey;
    amount: bigint;
    decimals: number;
    programId?: PublicKey;
  }): TransactionInstruction {
    const programId = params.programId ?? TOKEN_PROGRAM_ID;

    // SPL Token instruction layout for TransferChecked:
    // Index 12 = TransferChecked, amount (u64 LE), decimals (u8)
    const data = Buffer.alloc(10);
    data.writeUInt8(12, 0);
    data.writeBigUInt64LE(params.amount, 1);
    data.writeUInt8(params.decimals, 9);

    return new TransactionInstruction({
      programId,
      keys: [
        { pubkey: params.source, isSigner: false, isWritable: true },
        { pubkey: params.mint, isSigner: false, isWritable: false },
        { pubkey: params.destination, isSigner: false, isWritable: true },
        { pubkey: params.owner, isSigner: true, isWritable: false },
      ],
      data,
    });
  }

  public static formatTokenAmount(amount: bigint, decimals = 6): string {
    const divisor = 10n ** BigInt(decimals);
    const whole = amount / divisor;
    const remainder = amount % divisor;
    const paddedFraction = remainder.toString().padStart(decimals, '0').slice(0, 4);
    return `${whole.toLocaleString()}.${paddedFraction}`;
  }

  public static parseTokenAmount(amountStr: string, decimals = 6): bigint {
    const parts = amountStr.trim().split('.');
    const whole = BigInt(parts[0] || '0');
    let fractionStr = (parts[1] || '').slice(0, decimals).padEnd(decimals, '0');
    const fraction = BigInt(fractionStr);
    return whole * (10n ** BigInt(decimals)) + fraction;
  }
}
