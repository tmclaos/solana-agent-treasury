import { Connection, BlockhashWithExpiryBlockHeight } from '@solana/web3.js';

export class BlockhashCache {
  private connection: Connection;
  private currentBlockhash: BlockhashWithExpiryBlockHeight | null = null;
  private refreshIntervalMs: number;
  private intervalHandle: NodeJS.Timeout | null = null;
  private lastFetchTimestamp = 0;
  private isWarming = false;

  constructor(connection: Connection, refreshIntervalMs = 1500) {
    this.connection = connection;
    this.refreshIntervalMs = refreshIntervalMs;
  }

  public async start(): Promise<void> {
    if (this.intervalHandle) return;
    await this.refresh();
    this.intervalHandle = setInterval(() => {
      this.refresh().catch(() => {});
    }, this.refreshIntervalMs);
  }

  public stop(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  public async refresh(): Promise<BlockhashWithExpiryBlockHeight> {
    if (this.isWarming) {
      if (this.currentBlockhash) return this.currentBlockhash;
    }
    this.isWarming = true;
    try {
      const res = await this.connection.getLatestBlockhash('confirmed');
      this.currentBlockhash = res;
      this.lastFetchTimestamp = Date.now();
      return res;
    } finally {
      this.isWarming = false;
    }
  }

  public getLatestBlockhashSync(): BlockhashWithExpiryBlockHeight {
    if (!this.currentBlockhash) {
      throw new Error('BlockhashCache: Cache is cold. Call start() or refresh() before synchronous access.');
    }
    return this.currentBlockhash;
  }

  public async getLatestBlockhash(): Promise<BlockhashWithExpiryBlockHeight> {
    if (this.currentBlockhash && Date.now() - this.lastFetchTimestamp < 4000) {
      return this.currentBlockhash;
    }
    return this.refresh();
  }

  public getCacheAgeMs(): number {
    return this.lastFetchTimestamp > 0 ? Date.now() - this.lastFetchTimestamp : -1;
  }
}
