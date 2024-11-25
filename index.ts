import { writeFileSync } from "fs";
import { address, type Address, signature } from "@solana/web3.js";
import { createSolanaRpc, mainnet } from "@solana/web3.js";
import bs58 from "bs58";

const rpc = createSolanaRpc(mainnet("https://api.mainnet-beta.solana.com"));

interface ParsedInstruction {
  blockId: number;
  txId: string;
  signer: string[];
  programId: string;
  eventType: string;
  decodedInstruction: string;
}

export type BlockResponse = Awaited<
  ReturnType<ReturnType<typeof rpc.getBlock>["send"]>
>;

async function fetchRecentBlocks(
  blockCount: number
): Promise<ParsedInstruction[]> {
  const rpc = createSolanaRpc("https://api.testnet.sonic.game");
  const currentSlot = Number(await rpc.getSlot().send());

  const instructions: ParsedInstruction[] = [];

  for (let i = 0; i < blockCount; i++) {
    const blockSlot = currentSlot - i;
    const block = await rpc
      .getBlock(BigInt(blockSlot), {
        maxSupportedTransactionVersion: 0,
        rewards: false,
        encoding: "jsonParsed",
      })
      .send();

    if (!block) {
      console.warn(`Block ${blockSlot} not found.`);
      continue;
    }

    if (block) {
      // =====
      // const transactionsPromises = await Promise.all(
      //   block.transactions.map((tx) =>
      //     rpc
      //       .getTransaction(signature(tx.transaction.signatures[0]), {
      //         maxSupportedTransactionVersion: 0,
      //         encoding: "json",
      //       })
      //       .send()
      //   )
      // );

      block.transactions.forEach((tx, txIdx) => {
        const txId = tx.transaction.signatures[0];
        const message = tx.transaction.message;
        const programInstructions = tx.transaction.message.instructions;

        programInstructions.forEach((instruction, idx) => {
          const { name: instructionName, details: decodedInstruction } =
            getInstructionDetails(instruction.programId, instruction);

          const parsed: ParsedInstruction = {
            blockId: blockSlot,
            txId,
            signer: message.accountKeys
              .filter((key) => key.signer)
              .map((key) => address(key.pubkey)),
            programId: instruction.programId,
            eventType: instructionName,
            decodedInstruction,
          };
          instructions.push(parsed);
        });
      });
    }
  }

  return instructions;
}

async function generateJsonOutput(
  blockCount: number,
  outputFile: string
): Promise<void> {
  const instructions = await fetchRecentBlocks(blockCount);
  const filteredInstructions = instructions.filter(
    (instruction) =>
      instruction.eventType === "NativeSOLTransfer" ||
      instruction.eventType === "SPLTokenTransfer"
  );

  const jsonData = JSON.stringify(
    filteredInstructions,
    (key, value) => (typeof value === "bigint" ? value.toString() : value), // Convert BigInt to string
    2
  );
  writeFileSync(outputFile, jsonData);
  console.log(`Output written to ${outputFile}`);
}

// Main execution
const BLOCK_COUNT = 1; // Number of recent blocks to query
const OUTPUT_FILE = `parsed_instructions_sonic_testnet_v1_${BLOCK_COUNT}_blocks_${Date.now()}.json`;

function getInstructionDetails(
  programId: string,
  instruction: any
): { name: string; details: any } {
  let decodedData: Uint8Array;

  try {
    decodedData = bs58.decode(instruction.data || ""); // Decode Base58 data if present
  } catch (error) {
    console.warn(`Failed to decode instruction data:`, error);
    return { name: "InvalidData", details: null };
  }

  if (programId === "11111111111111111111111111111111") {
    // System Program (Native SOL Transfer)
    const { parsed } = instruction;
    console.info("parsed", parsed);
    if (parsed?.info?.lamports) {
      return {
        name: "NativeSOLTransfer",
        details: {
          source: parsed.info.source,
          destination: parsed.info.destination,
          lamports: parsed.info.lamports,
        },
      };
    }
  } else if (programId === "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA") {
    // SPL Token Program (Token Transfers)
    const { parsed } = instruction;
    if (parsed?.type === "transfer") {
      return {
        name: "SPLTokenTransfer",
        details: {
          source: parsed.info.source,
          destination: parsed.info.destination,
          amount: parsed.info.amount,
        },
      };
    }
  }

  // Unknown instruction
  return {
    name: "UnknownInstruction",
    details: decodedData,
  };
}

generateJsonOutput(BLOCK_COUNT, OUTPUT_FILE).catch((error) => {
  console.error("Error generating JSON output:", error);
});
