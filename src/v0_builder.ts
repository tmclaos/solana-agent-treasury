import {
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
  AddressLookupTableAccount,
  SystemProgram,
  ComputeBudgetProgram,
} from '@solana/web3.js';
import { TokenTransfer, MultiHopRoute } from './types.js';

export class VersionedTransactionBuilder {
  public static readonly PACKET_DATA_SIZE = 1232;

  public static buildV0Transaction(options: {
    payerKey: PublicKey;
    recentBlockhash: string;
    instructions: TransactionInstruction[];
    lookupTables?: AddressLookupTableAccount[];
  }): VersionedTransaction {
    const messageV0 = new TransactionMessage({
      payerKey: options.payerKey,
      recentBlockhash: options.recentBlockhash,
      instructions: options.instructions,
    }).compileToV0Message(options.lookupTables ?? []);

    return new VersionedTransaction(messageV0);
  }

  public static createCompressedBatchV0(options: {
    payerKey: PublicKey;
    recentBlockhash: string;
    transfers: TokenTransfer[];
    priorityFeeMicroLamports: number;
    computeUnitsLimit: number;
    lookupTables?: AddressLookupTableAccount[];
  }): VersionedTransaction {
    const instructions: TransactionInstruction[] = [
      ComputeBudgetProgram.setComputeUnitLimit({
        units: options.computeUnitsLimit,
      }),
      ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: options.priorityFeeMicroLamports,
      }),
    ];

    for (const transfer of options.transfers) {
      instructions.push(
        SystemProgram.transfer({
          fromPubkey: options.payerKey,
          toPubkey: transfer.recipient,
          lamports: transfer.lamports,
        })
      );
    }

    return this.buildV0Transaction({
      payerKey: options.payerKey,
      recentBlockhash: options.recentBlockhash,
      instructions,
      lookupTables: options.lookupTables,
    });
  }

  public static createMultiHopV0(options: {
    payerKey: PublicKey;
    recentBlockhash: string;
    route: MultiHopRoute;
    priorityFeeMicroLamports: number;
    computeUnitsLimit: number;
    jitoTipInstruction?: TransactionInstruction;
    lookupTables?: AddressLookupTableAccount[];
  }): VersionedTransaction {
    const instructions: TransactionInstruction[] = [
      ComputeBudgetProgram.setComputeUnitLimit({
        units: options.computeUnitsLimit,
      }),
      ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: options.priorityFeeMicroLamports,
      }),
    ];

    for (const hop of options.route.hops) {
      instructions.push(
        SystemProgram.transfer({
          fromPubkey: hop.sourceAccount,
          toPubkey: hop.destinationAccount,
          lamports: hop.amount,
        })
      );
    }

    if (options.jitoTipInstruction) {
      instructions.push(options.jitoTipInstruction);
    }

    return this.buildV0Transaction({
      payerKey: options.payerKey,
      recentBlockhash: options.recentBlockhash,
      instructions,
      lookupTables: options.lookupTables,
    });
  }
}
