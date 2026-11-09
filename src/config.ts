import { Connection, Keypair } from '@solana/web3.js';
import * as dotenv from 'dotenv';
import * as fs from 'fs';

dotenv.config();

export interface AppConfig {
  rpcUrl: string;
  payerKeypair?: Keypair;
  dailySpendLimitLamports: bigint;
  maxTxLimitLamports: bigint;
  rateLimitPerMinute: number;
}

export function loadConfig(): AppConfig {
  const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
  const dailySpendLimitLamports = BigInt(process.env.DAILY_SPEND_LIMIT_LAMPORTS || '10000000000'); // 10 SOL
  const maxTxLimitLamports = BigInt(process.env.MAX_TX_LIMIT_LAMPORTS || '2000000000'); // 2 SOL
  const rateLimitPerMinute = parseInt(process.env.RATE_LIMIT_PER_MINUTE || '30', 10);

  let payerKeypair: Keypair | undefined;
  if (process.env.SOLANA_PRIVATE_KEY) {
    try {
      const secret = JSON.parse(process.env.SOLANA_PRIVATE_KEY);
      payerKeypair = Keypair.fromSecretKey(Uint8Array.from(secret));
    } catch {
      // Fallback: raw base58 or key file if provided
    }
  } else if (process.env.KEYPAIR_PATH && fs.existsSync(process.env.KEYPAIR_PATH)) {
    const raw = fs.readFileSync(process.env.KEYPAIR_PATH, 'utf-8');
    const secret = JSON.parse(raw);
    payerKeypair = Keypair.fromSecretKey(Uint8Array.from(secret));
  }

  return {
    rpcUrl,
    payerKeypair,
    dailySpendLimitLamports,
    maxTxLimitLamports,
    rateLimitPerMinute,
  };
}

export function createSolanaConnection(rpcUrl: string): Connection {
  return new Connection(rpcUrl, 'confirmed');
}
