export interface TelemetryEvent {
  routeId: string;
  recipient: string;
  amountLamports: bigint;
  feePaidLamports: bigint;
  priorityFeeMicroLamports: number;
  durationMs: number;
  blockhashAgeMs: number;
  signature?: string;
  success: boolean;
  error?: string;
}

export class TelemetryLogger {
  public static printHeader(network: string, rpcUrl: string): void {
    const sanitizedRpc = rpcUrl.replace(/(api-key=)[^&]+/, '$1****');
    console.log('┌─ [SOLANA AGENT TREASURY & ROUTE ENGINE] ───────────────────────────┐');
    console.log(`│ Network:   ${network.padEnd(20)} │ Target: MultiHopper Protocol   │`);
    console.log(`│ RPC Node:  ${sanitizedRpc.substring(0, 52).padEnd(52)} │`);
    console.log('└───────────────────────────────────────────────────────────────────┘');
  }

  public static printExecution(event: TelemetryEvent): void {
    const status = event.success ? '\x1b[32m[CONFIRMED]\x1b[0m' : '\x1b[31m[FAILED]\x1b[0m';
    const duration = `${event.durationMs.toFixed(2)}ms`;
    const blockhashAge = event.blockhashAgeMs >= 0 ? `${event.blockhashAgeMs}ms` : 'cold';

    console.log('┌─ Transaction Telemetry ───────────────────────────────────────────┐');
    console.log(`│ Status:       ${status.padEnd(30)} Duration:     ${duration.padEnd(10)} │`);
    console.log(`│ Route ID:     ${event.routeId.padEnd(52)} │`);
    console.log(`│ Recipient:    ${event.recipient.substring(0, 44).padEnd(52)} │`);
    console.log(`│ Amount:       ${(event.amountLamports.toString() + ' lamports').padEnd(52)} │`);
    console.log(`│ Priority Fee: ${(event.priorityFeeMicroLamports.toLocaleString() + ' μLamports').padEnd(25)} Blockhash:    ${blockhashAge.padEnd(10)} │`);
    if (event.signature) {
      console.log(`│ Signature:    ${event.signature.substring(0, 52).padEnd(52)} │`);
    }
    if (event.error) {
      console.log(`│ Error:        ${event.error.substring(0, 52).padEnd(52)} │`);
    }
    console.log('└───────────────────────────────────────────────────────────────────┘\n');
  }

  public static printBenchmarks(results: {
    name: string;
    iterations: number;
    avgUs: number;
    p95Us: number;
    p99Us: number;
  }[]): void {
    console.log('\n┌─ [ENGINE BENCHMARKS - 10,000 ITERATIONS] ──────────────────────────┐');
    console.log('│ Operation                │ Avg (μs)   │ p95 (μs)   │ p99 (μs)     │');
    console.log('├──────────────────────────┼────────────┼────────────┼──────────────┤');
    for (const r of results) {
      const op = r.name.padEnd(24);
      const avg = r.avgUs.toFixed(2).padStart(10);
      const p95 = r.p95Us.toFixed(2).padStart(10);
      const p99 = r.p99Us.toFixed(2).padStart(12);
      console.log(`│ ${op} │ ${avg} │ ${p95} │ ${p99} │`);
    }
    console.log('└──────────────────────────┴────────────┴────────────┴──────────────┘\n');
  }
}
