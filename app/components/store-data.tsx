"use client";

import { useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Program, AnchorProvider, web3 } from "@coral-xyz/anchor";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "./ui/card";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Button } from "./ui/button";
import { motion } from "framer-motion";
import { PROGRAM_ID } from "@/lib/config";
import {
  generateEncryptionKeys,
  getMXEPublicKey,
  createCipher,
  encryptData,
  generateNonce,
  formatDataForStorage,
  stringToBigIntArray,
  deriveConfidentialDataPDA,
} from "@/lib/arcium";
import idl from "@/lib/idl/confidential_sharing_app.json";

export function StoreData() {
  const [dataType, setDataType] = useState("document");
  const [data, setData] = useState("");
  const [metadata, setMetadata] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const { connection } = useConnection();
  const wallet = useWallet();

  const handleStore = async () => {
    if (!wallet.publicKey || !wallet.signTransaction) {
      setError("Please connect your wallet first!");
      return;
    }

    if (!data.trim()) {
      setError("Please enter some data to store!");
      return;
    }

    setLoading(true);
    setError("");
    setStatus("Initializing encryption...");

    try {
      // Create Anchor provider
      const provider = new AnchorProvider(
        connection,
        wallet as any,
        { commitment: "confirmed" }
      );

      // Create program instance
      const program = new Program(idl as any, provider);

      setStatus("Getting MXE public key...");
      
      // Get MXE public key
      const mxePublicKey = await getMXEPublicKey(provider);

      setStatus("Generating encryption keys...");
      
      // Generate encryption keys
      const { privateKey, publicKey } = generateEncryptionKeys();

      // Create cipher
      const cipher = createCipher(privateKey, mxePublicKey);

      setStatus("Encrypting data...");

      // Prepare data for encryption
      const dataId = BigInt(Date.now()); // Unique ID
      const dataTypeValue = BigInt(dataType === "document" ? 1 : dataType === "message" ? 2 : 3);
      const ownerId = BigInt(wallet.publicKey.toBuffer().readUInt32BE(0));
      const metadataValue = BigInt(metadata ? metadata.length : 0);

      // Convert data to chunks
      const dataChunks = stringToBigIntArray(data, 10);

      // Format data
      const confidentialData = formatDataForStorage(
        dataId,
        dataTypeValue,
        ownerId,
        metadataValue,
        dataChunks
      );

      // Generate nonce
      const nonce = generateNonce();

      // Encrypt data
      const ciphertext = encryptData(cipher, confidentialData, nonce);

      // Derive PDA (must match program seeds exactly)
      const [confidentialDataPDA] = web3.PublicKey.findProgramAddressSync(
        [
          Buffer.from("confidential_data"),
          wallet.publicKey.toBuffer()
        ],
        PROGRAM_ID
      );

      // Check if account already exists
      setStatus("Checking if account exists...");
      const accountInfo = await connection.getAccountInfo(confidentialDataPDA);
      
      if (accountInfo) {
        setError("⚠️ You already have data stored! Currently, each wallet can only store data once. To store new data, please use a different wallet or wait for the update feature.");
        return;
      }

      setStatus("Storing on Solana blockchain...");

      // Store on Solana
      // @ts-ignore - Anchor IDL type instantiation depth limitation
      const tx = await program.methods
        .storeConfidentialData(
          ciphertext[0],
          ciphertext[1],
          ciphertext[2],
          ciphertext[3],
          ciphertext.slice(4, 14)
        )
        .accounts({
          owner: wallet.publicKey,
          confidentialData: confidentialDataPDA,
          systemProgram: web3.SystemProgram.programId,
        })
        .rpc({ commitment: "confirmed" });

      setStatus(
        `✅ Success! Data stored on Solana!\n\n` +
        `Transaction ID: ${tx}\n\n` +
        `View on Explorer: https://explorer.solana.com/tx/${tx}?cluster=devnet`
      );
      
      // Reset form after 10 seconds (longer so user can copy the ID)
      setTimeout(() => {
        setData("");
        setMetadata("");
        setStatus("");
      }, 10000);

    } catch (err: any) {
      console.error("Error storing data:", err);
      setError(err.message || "Failed to store data. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const dataTypes = [
    { value: "document", label: "Document", icon: "📄" },
    { value: "message", label: "Message", icon: "💬" },
    { value: "file", label: "File", icon: "📁" },
    { value: "credential", label: "Credential", icon: "🔐" },
  ];

  return (
    <Card id="store">
      <CardHeader>
        <CardTitle>Store Confidential Data</CardTitle>
        <CardDescription>
          Encrypt and store your sensitive data securely on the blockchain
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Data Type</label>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {dataTypes.map((type) => (
              <motion.button
                key={type.value}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setDataType(type.value)}
                className={`h-20 rounded-lg border-2 transition-all flex flex-col items-center justify-center gap-2 ${
                  dataType === type.value
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-muted-foreground/30"
                }`}
              >
                <span className="text-2xl">{type.icon}</span>
                <span className="text-sm font-medium">{type.label}</span>
              </motion.button>
            ))}
          </div>
        </div>

        <Textarea
          label="Data Content"
          placeholder="Enter your confidential data here..."
          value={data}
          onChange={(e) => setData(e.target.value)}
          className="min-h-[200px]"
        />

        <Input
          label="Metadata (Optional)"
          placeholder="e.g., Description, tags, etc."
          value={metadata}
          onChange={(e) => setMetadata(e.target.value)}
        />

        <Button
          onClick={handleStore}
          disabled={!data || loading || !wallet.connected}
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
              Storing...
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
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                />
              </svg>
              {wallet.connected ? "Store Data" : "Connect Wallet First"}
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
            <p className="text-sm text-blue-600 dark:text-blue-400">{status}</p>
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
