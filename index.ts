import {
  Connection,
  type BlockResponse,
  type TransactionResponse,
} from "@solana/web3.js";
import { writeFile } from "fs/promises";

interface TransactionData {
  hash: string;
  nonce: number | null;
  transaction_index: number;
  from_address: string;
  to_address: string;
  value: number;
  gas: number;
  gas_price: number;
  input: string;
  receipt_cumulative_gas_used: number;
  receipt_gas_used: number;
  receipt_contract_address: string | null;
  receipt_root: string | null;
  receipt_status: number;
  block_timestamp: number;
  block_number: number;
  block_hash: string;
  max_fee_per_gas: number;
  max_priority_fee_per_gas: number;
  transaction_type: number;
  receipt_effective_gas_price: number;
  source: string;
  created_at: string;
}

class SolanaBlockchainQuery {
  private connection: Connection;

  constructor(rpcUrl: string) {
    this.connection = new Connection(rpcUrl, "confirmed");
  }

  private async getBlockData(slot: number): Promise<BlockResponse | null> {
    try {
      return await this.connection.getBlock(slot, {
        maxSupportedTransactionVersion: 0,
        rewards: false,
      });
    } catch (error) {
      console.error(`Error fetching block at slot ${slot}:`, error);
      return null;
    }
  }

  private transformTransaction(
    tx: TransactionResponse,
    blockTimestamp: number,
    blockNumber: number,
    blockHash: string,
    index: number
  ): TransactionData | null {
    try {
      const accountKeys = tx.transaction.message.accountKeys;
      if (!accountKeys?.length) return null;

      const fromAddress = accountKeys[0].toBase58();
      const toAddress = accountKeys[1]?.toBase58() || "";

      // Calculate value transfer (if any)
      const preBalance = tx.meta?.preBalances[1] || 0;
      const postBalance = tx.meta?.postBalances[1] || 0;
      const value = Math.max(0, postBalance - preBalance);

      return {
        hash: tx.transaction.signatures[0],
        nonce: null, // Solana doesn't use nonces in the same way
        transaction_index: index,
        from_address: fromAddress,
        to_address: toAddress,
        value: value,
        gas: tx.meta?.fee || 0,
        gas_price: 1, // Solana uses different fee model
        input: JSON.stringify(tx.transaction.message.instructions),
        receipt_cumulative_gas_used: tx.meta?.fee || 0,
        receipt_gas_used: tx.meta?.fee || 0,
        receipt_contract_address: null,
        receipt_root: null,
        receipt_status: tx.meta?.err ? 0 : 1,
        block_timestamp: blockTimestamp,
        block_number: blockNumber,
        block_hash: blockHash,
        max_fee_per_gas: 0,
        max_priority_fee_per_gas: 0,
        transaction_type: 0,
        receipt_effective_gas_price: 0,
        source: "solana_testnet",
        created_at: new Date().toISOString(),
      };
    } catch (error) {
      console.error("Error transforming transaction:", error);
      return null;
    }
  }

  async queryRecentBlocks(numBlocks: number = 2): Promise<TransactionData[]> {
    try {
      // Get current slot
      const currentSlot = await this.connection.getSlot();
      const transactions: TransactionData[] = [];

      // Query the specified number of recent blocks
      for (let i = 0; i < numBlocks; i++) {
        const slot = currentSlot - i;
        console.log(`Querying block at slot: ${slot}`);

        const block = await this.getBlockData(slot);
        if (!block) continue;

        // Process all transactions in the block
        block.transactions.forEach((tx, index) => {
          const transformedTx = this.transformTransaction(
            tx,
            block.blockTime || 0,
            slot,
            block.blockhash,
            index
          );
          if (transformedTx) {
            transactions.push(transformedTx);
          }
        });
      }

      return transactions;
    } catch (error) {
      console.error("Error querying recent blocks:", error);
      throw error;
    }
  }

  async saveToFile(transactions: TransactionData[]): Promise<void> {
    const timestamp = Date.now();
    const filename = `solana_transactions_${timestamp}.json`;

    try {
      await writeFile(filename, JSON.stringify(transactions, null, 2));
      console.log(
        `Successfully wrote ${transactions.length} transactions to ${filename}`
      );
    } catch (error) {
      console.error("Error saving to file:", error);
      throw error;
    }
  }
}

// Usage example
async function main() {
  try {
    const rpcUrl = "https://api.testnet.sonic.game";
    const query = new SolanaBlockchainQuery(rpcUrl);

    // Query recent blocks
    const transactions = await query.queryRecentBlocks(1);

    // Save results to file
    await query.saveToFile(transactions);
  } catch (error) {
    console.error("Main execution error:", error);
    process.exit(1);
  }
}

main();
