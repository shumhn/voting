import * as anchor from "@coral-xyz/anchor";
import { Connection, PublicKey } from "@solana/web3.js";
import {
  getMXEPublicKey as getArciumMXEPublicKey,
  getCompDefAccOffset,
  x25519,
  RescueCipher,
} from "@arcium-hq/client";
import { PROGRAM_ID } from "./config";

// Re-export x25519 and RescueCipher for convenience
export { x25519, RescueCipher };

/**
 * Get MXE public key with retry logic
 */
export async function getMXEPublicKey(
  provider: anchor.AnchorProvider,
  programId: PublicKey = PROGRAM_ID,
  maxRetries: number = 5
): Promise<Uint8Array> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const mxePublicKey = await getArciumMXEPublicKey(provider, programId);
      if (!mxePublicKey) {
        throw new Error("MXE public key is null");
      }
      return mxePublicKey;
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  throw new Error("Failed to get MXE public key");
}

/**
 * Generate encryption keys for a user
 */
export function generateEncryptionKeys() {
  const privateKey = x25519.utils.randomSecretKey();
  const publicKey = x25519.getPublicKey(privateKey);
  return { privateKey, publicKey };
}

/**
 * Create a cipher for encryption/decryption
 */
export function createCipher(privateKey: Uint8Array, mxePublicKey: Uint8Array) {
  const sharedSecret = x25519.getSharedSecret(privateKey, mxePublicKey);
  return new RescueCipher(sharedSecret);
}

/**
 * Encrypt confidential data
 */
export function encryptData(
  cipher: RescueCipher,
  data: bigint[],
  nonce: Uint8Array
): number[][] {
  return cipher.encrypt(data, nonce);
}

/**
 * Decrypt confidential data
 */
export function decryptData(
  cipher: RescueCipher,
  ciphertext: number[][],
  nonce: Uint8Array
): bigint[] {
  return cipher.decrypt(ciphertext, nonce);
}

/**
 * Generate a random nonce
 */
export function generateNonce(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(16));
}

/**
 * Get computation definition offset for share_data circuit
 */
export function getShareDataCompDefOffset(): Uint8Array {
  return getCompDefAccOffset("share_data");
}

/**
 * Convert string to BigInt array (for data chunks)
 */
export function stringToBigIntArray(str: string, chunkCount: number = 10): bigint[] {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(str);
  const chunks: bigint[] = [];
  
  const chunkSize = Math.ceil(bytes.length / chunkCount);
  
  for (let i = 0; i < chunkCount; i++) {
    const start = i * chunkSize;
    const end = Math.min(start + chunkSize, bytes.length);
    const chunk = bytes.slice(start, end);
    
    // Convert bytes to BigInt
    let value = BigInt(0);
    for (let j = 0; j < chunk.length; j++) {
      value = value * BigInt(256) + BigInt(chunk[j]);
    }
    chunks.push(value);
  }
  
  return chunks;
}

/**
 * Convert BigInt array back to string
 */
export function bigIntArrayToString(chunks: bigint[]): string {
  const decoder = new TextDecoder();
  const allBytes: number[] = [];
  
  for (const chunk of chunks) {
    if (chunk === BigInt(0)) continue;
    
    // Convert BigInt to bytes
    let value = chunk;
    const bytes: number[] = [];
    while (value > BigInt(0)) {
      bytes.unshift(Number(value % BigInt(256)));
      value = value / BigInt(256);
    }
    allBytes.push(...bytes);
  }
  
  return decoder.decode(new Uint8Array(allBytes));
}

/**
 * Format data for storage (14 fields total)
 */
export function formatDataForStorage(
  dataId: bigint,
  dataType: bigint,
  ownerId: bigint,
  metadata: bigint,
  dataChunks: bigint[]
): bigint[] {
  if (dataChunks.length !== 10) {
    throw new Error("Data must have exactly 10 chunks");
  }
  return [dataId, dataType, ownerId, metadata, ...dataChunks];
}

/**
 * Parse stored data (14 fields)
 */
export function parseStoredData(data: bigint[]): {
  dataId: bigint;
  dataType: bigint;
  ownerId: bigint;
  metadata: bigint;
  dataChunks: bigint[];
} {
  if (data.length !== 14) {
    throw new Error("Data must have exactly 14 fields");
  }
  return {
    dataId: data[0],
    dataType: data[1],
    ownerId: data[2],
    metadata: data[3],
    dataChunks: data.slice(4, 14),
  };
}

/**
 * Derive confidential data PDA
 */
export function deriveConfidentialDataPDA(
  owner: PublicKey,
  programId: PublicKey = PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("confidential_data"), owner.toBuffer()],
    programId
  );
}
