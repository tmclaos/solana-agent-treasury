import crypto from 'crypto';
import { AuditEntry } from './types.js';

export class AuditLogChain {
  private chain: AuditEntry[] = [];
  public static readonly GENESIS_HASH = '0000000000000000000000000000000000000000000000000000000000000000';

  public append(action: AuditEntry['action'], details: Record<string, any>): AuditEntry {
    const sequenceNumber = this.chain.length;
    const previousHash = sequenceNumber === 0 ? AuditLogChain.GENESIS_HASH : this.chain[sequenceNumber - 1].currentHash;
    const timestamp = Date.now();

    const payload = JSON.stringify({
      sequenceNumber,
      previousHash,
      action,
      details,
      timestamp,
    });

    const currentHash = crypto.createHash('sha256').update(payload).digest('hex');

    const entry: AuditEntry = {
      sequenceNumber,
      previousHash,
      currentHash,
      action,
      details,
      timestamp,
    };

    this.chain.push(entry);
    return entry;
  }

  public getChain(): ReadonlyArray<AuditEntry> {
    return [...this.chain];
  }

  public getLatestEntry(): AuditEntry | undefined {
    return this.chain[this.chain.length - 1];
  }

  public getLength(): number {
    return this.chain.length;
  }

  public verifyIntegrity(): boolean {
    if (this.chain.length === 0) return true;

    for (let i = 0; i < this.chain.length; i++) {
      const entry = this.chain[i];

      // Verify sequence number
      if (entry.sequenceNumber !== i) return false;

      // Verify previous hash
      const expectedPrevHash = i === 0 ? AuditLogChain.GENESIS_HASH : this.chain[i - 1].currentHash;
      if (entry.previousHash !== expectedPrevHash) return false;

      // Re-compute SHA-256
      const payload = JSON.stringify({
        sequenceNumber: entry.sequenceNumber,
        previousHash: entry.previousHash,
        action: entry.action,
        details: entry.details,
        timestamp: entry.timestamp,
      });

      const recomputedHash = crypto.createHash('sha256').update(payload).digest('hex');
      if (recomputedHash !== entry.currentHash) return false;
    }

    return true;
  }
}
