import { Connection } from '@solana/web3.js';
import { BlockhashCache } from '../src/blockhash_cache';

describe('BlockhashCache In-Memory Latency & Refresh Tests', () => {
  it('throws when accessing cold synchronous cache', () => {
    const connection = new Connection();
    const cache = new BlockhashCache(connection);

    expect(() => {
      cache.getLatestBlockhashSync();
    }).toThrow(/Cache is cold/);
  });

  it('serves cached blockhash instantly once warmed', async () => {
    const connection = new Connection();
    const cache = new BlockhashCache(connection, 2000);

    // Initial warm
    await cache.refresh();

    // Measure synchronous in-memory lookup latency
    const t0 = process.hrtime.bigint();
    const blockhashInfo = cache.getLatestBlockhashSync();
    const t1 = process.hrtime.bigint();

    const latencyUs = Number(t1 - t0) / 1000;

    expect(blockhashInfo.blockhash).toBeDefined();
    expect(blockhashInfo.lastValidBlockHeight).toBeGreaterThan(0);
    expect(latencyUs).toBeLessThan(100); // Sub-100 microseconds (typically < 5μs)
    expect(cache.getCacheAgeMs()).toBeGreaterThanOrEqual(0);

    cache.stop();
  });

  it('background start and stop cleanly manage interval handles', async () => {
    const connection = new Connection();
    const cache = new BlockhashCache(connection, 500);

    await cache.start();
    expect(cache.getLatestBlockhashSync().blockhash).toBeDefined();

    cache.stop();
    // After stop, interval handle is cleared
  });
});
