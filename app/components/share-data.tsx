"use client";

import { useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Program, AnchorProvider, web3, BN } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { randomBytes } from "crypto";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "./ui/card";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { motion } from "framer-motion";
import { PROGRAM_ID, ARCIUM_CLUSTER_PUBKEY } from "@/lib/config";
import {
  getMXEPublicKey,
  generateEncryptionKeys,
  generateNonce,
  getShareDataCompDefOffset,
  x25519,
} from "@/lib/arcium";
import {
  getMXEAccAddress,
  getMempoolAccAddress,
  getExecutingPoolAccAddress,
  getCompDefAccAddress,
  getComputationAccAddress,
  getCompDefAccOffset,
  getArciumAccountBaseSeed,
  getArciumProgAddress,
} from "@arcium-hq/client";
import idl from "@/lib/idl/confidential_sharing_app.json";

// Arcium program constants
const ARCIUM_PROGRAM_ID = getArciumProgAddress();
const SIGN_PDA_SEED = getArciumAccountBaseSeed("SignerAccount");
const FEE_POOL_SEED = getArciumAccountBaseSeed("FeePool");
const CLOCK_SEED = getArciumAccountBaseSeed("ClockAccount");

// Derive Arcium PDAs
const [ARCIUM_FEE_POOL] = PublicKey.findProgramAddressSync([FEE_POOL_SEED], ARCIUM_PROGRAM_ID);
const [ARCIUM_CLOCK] = PublicKey.findProgramAddressSync([CLOCK_SEED], ARCIUM_PROGRAM_ID);

function getSignPdaAddress(programId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [SIGN_PDA_SEED],
    programId  // Use your program, not Arcium's
  )[0];
}

export function ShareData() {
  const [receiverAddress, setReceiverAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const { connection } = useConnection();
  const wallet = useWallet();

  const handleShare = async () => {
    if (!wallet.publicKey || !wallet.signTransaction) {
      setError("Please connect your wallet first!");
      return;
    }

    if (!receiverAddress.trim()) {
      setError("Please enter a receiver wallet address!");
      return;
    }

    let receiverPubKey: PublicKey;
    try {
      receiverPubKey = new PublicKey(receiverAddress);
    } catch (err) {
      setError("Invalid receiver wallet address format!");
      return;
    }

    setLoading(true);
    setError("");
    setStatus("Initializing MPC sharing...");

    try {
      // Create a proper wallet adapter for Anchor
      const anchorWallet = {
        publicKey: wallet.publicKey!,
        signTransaction: wallet.signTransaction!.bind(wallet),
        signAllTransactions: wallet.signAllTransactions!.bind(wallet),
      };

      const provider = new AnchorProvider(
        connection,
        anchorWallet as any,
        { commitment: "confirmed" }
      );

      // @ts-ignore - Anchor IDL type limitation
      const program = new Program(idl as any, provider);

      setStatus("Fetching your confidential data...");

      const [confidentialDataPDA] = web3.PublicKey.findProgramAddressSync(
        [Buffer.from("confidential_data"), wallet.publicKey.toBuffer()],
        PROGRAM_ID
      );

      const accountInfo = await connection.getAccountInfo(confidentialDataPDA);
      if (!accountInfo) {
        setError("No data found! Please store some data first.");
        return;
      }

      // Fetch encrypted data from the account
      const confidentialData = await program.account.confidentialData.fetch(confidentialDataPDA);

      setStatus("Preparing MPC computation...");

      const { publicKey: senderPublicKey } = generateEncryptionKeys();
      const receiverNonce = generateNonce();
      const nonce = generateNonce();

      const receiverNonceU128 = BigInt(
        "0x" + Array.from(receiverNonce).map(b => b.toString(16).padStart(2, '0')).join('')
      );
      const nonceU128 = BigInt(
        "0x" + Array.from(nonce).map(b => b.toString(16).padStart(2, '0')).join('')
      );

      const computationOffset = new BN(Math.floor(Math.random() * 1000000));

      setStatus("Queueing MPC computation on Arcium network...");

      // Get all required Arcium accounts
      const mxeAccount = getMXEAccAddress(PROGRAM_ID);
      const mempoolAccount = getMempoolAccAddress(PROGRAM_ID);
      const executingPool = getExecutingPoolAccAddress(PROGRAM_ID);
      
      // We split sharing into 6 separate MPC operations to stay under Solana's 4KB stack limit:
      // 1. share_data_meta (data_id, data_type, owner_id)
      // 2. share_data_metadata (metadata field)
      // 3. share_data_chunks02 (chunks 0-2)
      // 4. share_data_chunks35 (chunks 3-5)
      // 5. share_data_chunks68 (chunks 6-8)
      // 6. share_data_chunk_9 (chunk 9)
      
      setStatus("⏳ Queueing 6 MPC computations...");
      const circuits = [
        { 
          name: "share_data_meta", 
          method: "shareMeta",
          args: [confidentialData.dataId, confidentialData.dataType, confidentialData.ownerId]
        },
        { 
          name: "share_data_metadata", 
          method: "shareMetadata",
          args: [confidentialData.metadata]
        },
        { 
          name: "share_data_chunks02", 
          method: "shareChunks02",
          args: [confidentialData.dataChunks[0], confidentialData.dataChunks[1], confidentialData.dataChunks[2]]
        },
        { 
          name: "share_data_chunks35", 
          method: "shareChunks35",
          args: [confidentialData.dataChunks[3], confidentialData.dataChunks[4], confidentialData.dataChunks[5]]
        },
        { 
          name: "share_data_chunks68", 
          method: "shareChunks68",
          args: [confidentialData.dataChunks[6], confidentialData.dataChunks[7], confidentialData.dataChunks[8]]
        },
        { 
          name: "share_data_chunk_9", 
          method: "shareChunk9",
          args: [confidentialData.dataChunks[9]]
        },
      ];

      const transactions = [];
      for (const circuit of circuits) {
        const compDefOffsetBuffer = getCompDefAccOffset(circuit.name);
        const compDefOffset = Buffer.from(compDefOffsetBuffer).readUInt32LE();
        const computationOffset = new BN(Buffer.from(randomBytes(8)).toString('hex'), 16);
        const compDefAccount = getCompDefAccAddress(PROGRAM_ID, compDefOffset);
        const computationAccount = getComputationAccAddress(PROGRAM_ID, computationOffset);

        setStatus(`⏳ Queueing ${circuit.name}...`);
        
        const txBuilder = (program.methods as any)[circuit.method](
          computationOffset,
          Array.from(receiverPubKey.toBytes()),
          new BN(receiverNonceU128.toString()),
          Array.from(senderPublicKey),
          new BN(nonceU128.toString()),
          ...circuit.args  // Pass encrypted data fields
        )
        .accounts({
          payer: wallet.publicKey,
          signPdaAccount: getSignPdaAddress(PROGRAM_ID),
          mxeAccount,
          mempoolAccount,
          executingPool,
          computationAccount,
          compDefAccount,
          clusterAccount: ARCIUM_CLUSTER_PUBKEY,
          poolAccount: ARCIUM_FEE_POOL,
          clockAccount: ARCIUM_CLOCK,
          systemProgram: web3.SystemProgram.programId,
          arciumProgram: ARCIUM_PROGRAM_ID,
        });
        
        const transaction = await txBuilder.transaction();
        const tx = await provider.sendAndConfirm(transaction);

        console.log(`✅ ${circuit.name} queued: ${tx}`);
        transactions.push({ circuit: circuit.name, tx });
      }

      setStatus(
        `✅ Success! All 6 MPC computations queued!\n\n` +
        transactions.map(t => `${t.circuit}: ${t.tx}`).join('\n') +
        `\n\nThe Arcium MPC network is now re-encrypting your data in 6 parts.\n` +
        `This keeps each callback under Solana's 4KB stack limit!`
      );

      setTimeout(() => {
        setReceiverAddress("");
        setStatus("");
      }, 15000);

    } catch (err: any) {
      console.error("Error sharing data:", err);
      setError(err.message || "Failed to share data. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card id="share">
      <CardHeader>
        <CardTitle>Share Confidential Data</CardTitle>
        <CardDescription>
          Securely share your encrypted data with a specific recipient
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
          <p className="text-sm text-blue-600 dark:text-blue-400">
            This will share your stored confidential data with another wallet via Arcium MPC. The data will be re-encrypted for the receiver.
          </p>
        </div>

        <Input
          label="Receiver Wallet Address"
          placeholder="Enter recipient's Solana wallet address"
          value={receiverAddress}
          onChange={(e) => setReceiverAddress(e.target.value)}
        />

        <div className="bg-muted/50 rounded-lg p-4 border border-border">
          <div className="flex items-start gap-3">
            <svg
              className="w-5 h-5 text-muted-foreground mt-0.5 shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <div className="space-y-1">
              <p className="text-sm font-medium">Secure Sharing</p>
              <p className="text-xs text-muted-foreground">
                Data is re-encrypted using the recipient's public key through Arcium's MPC network.
                Only the specified recipient can decrypt and access the data.
              </p>
            </div>
          </div>
        </div>

        <Button
          onClick={handleShare}
          disabled={!receiverAddress || loading || !wallet.connected}
          size="lg"
          className="w-full"
        >
          {loading ? (
            <>
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                className="w-5 h-5 border-2 border-current border-t-transparent rounded-full"
              />
              Sharing...
            </>
          ) : (
            <>
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
                />
              </svg>
              {wallet.connected ? "Share Data" : "Connect Wallet First"}
            </>
          )}
        </Button>

        {/* Status Message */}
        {status && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg"
          >
            <p className="text-sm text-blue-600 dark:text-blue-400 whitespace-pre-line">{status}</p>
          </motion.div>
        )}

        {/* Error Message */}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg"
          >
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </motion.div>
        )}
      </CardContent>
    </Card>
  );
}
