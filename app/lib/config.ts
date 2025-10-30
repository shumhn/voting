import { PublicKey } from "@solana/web3.js";

// Program Configuration
export const PROGRAM_ID = new PublicKey("kF9qMaUpfyYb4SQLdhjzCbMaf52Ji7LNr5fjuJWMLsr");

// Network Configuration
export const RPC_URL = "https://devnet.helius-rpc.com/?api-key=1a571cec-6f5e-4cc5-be17-a50dc8c5954a";
export const NETWORK = "devnet";

// Arcium Configuration
// Cluster at offset 1078779259 (official Arcium devnet cluster)
export const ARCIUM_CLUSTER_PUBKEY = new PublicKey("CaTxKKfdaoCM7ZzLj5dLzrrmnsg9GJb5iYzRzCk8VEu3");

// Computation Definition Offset
export const COMP_DEF_OFFSET_SHARE_DATA = 0; // Will be calculated from circuit name

export const config = {
  programId: PROGRAM_ID,
  rpcUrl: RPC_URL,
  network: NETWORK,
  arciumCluster: ARCIUM_CLUSTER_PUBKEY,
};
