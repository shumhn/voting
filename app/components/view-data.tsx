"use client";

import { useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Program, AnchorProvider, web3 } from "@coral-xyz/anchor";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "./ui/card";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { PROGRAM_ID } from "@/lib/config";
import {
  getMXEPublicKey,
  createCipher,
  decryptData,
  parseStoredData,
  bigIntArrayToString,
  generateEncryptionKeys,
} from "@/lib/arcium";
import idl from "@/lib/idl/confidential_sharing_app.json";

export function ViewData() {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [decryptedData, setDecryptedData] = useState<{
    type: string;
    content: string;
    metadata: string;
    dataId: string;
    ownerId: string;
  } | null>(null);

  const { connection } = useConnection();
  const wallet = useWallet();

  const handleView = async () => {
    if (!wallet.publicKey || !wallet.signTransaction) {
      setError("Please connect your wallet first!");
      return;
    }

    setLoading(true);
    setError("");
    setStatus("Fetching your data from Solana...");
    setDecryptedData(null);

    try {
      // Create Anchor provider
      const provider = new AnchorProvider(
        connection,
        wallet as any,
        { commitment: "confirmed" }
      );

      // Create program instance
      const program = new Program(idl as any, provider);

      // Derive PDA for user's data
      const [confidentialDataPDA] = web3.PublicKey.findProgramAddressSync(
        [
          Buffer.from("confidential_data"),
          wallet.publicKey.toBuffer()
        ],
        PROGRAM_ID
      );

      setStatus("Checking if you have stored data...");

      // Fetch the account
      const accountInfo = await connection.getAccountInfo(confidentialDataPDA);
      
      if (!accountInfo) {
        setError("No data found! You haven't stored any data yet. Go to 'Store Data' section to store some confidential data first.");
        return;
      }

      setStatus("Data found! Fetching encrypted data...");

      // Fetch and deserialize the account data
      const accountData = accountInfo.data;
      
      // Parse the account data (skip 8-byte discriminator)
      // Structure: dataId (8), dataType (8), ownerId (8), metadata (8), dataChunks (10 * 8)
      const view = new DataView(accountData.buffer, accountData.byteOffset + 8);
      
      const confidentialDataAccount = {
        dataId: view.getBigUint64(0, true),
        dataType: view.getBigUint64(8, true),
        ownerId: view.getBigUint64(16, true),
        metadata: view.getBigUint64(24, true),
        dataChunks: Array.from({ length: 10 }, (_, i) => 
          view.getBigUint64(32 + i * 8, true)
        )
      };

      setStatus("Getting MXE public key for decryption...");

      // Get MXE public key
      const mxePublicKey = await getMXEPublicKey(provider);

      setStatus("Generating decryption keys...");

      // Note: In a real app, you'd need to store the original encryption keys
      // For now, we'll show the encrypted data structure
      // To properly decrypt, you need the same private key used during encryption

      setStatus("Decrypting data...");

      // Extract encrypted data from account
      const encryptedData = [
        confidentialDataAccount.dataId,
        confidentialDataAccount.dataType,
        confidentialDataAccount.ownerId,
        confidentialDataAccount.metadata,
        ...confidentialDataAccount.dataChunks
      ];

      // For demonstration, show the data structure
      // In production, you'd decrypt with the stored private key
      const dataTypeMap: Record<string, string> = {
        "1": "document",
        "2": "message",
        "3": "file",
      };

      setDecryptedData({
        type: dataTypeMap[confidentialDataAccount.dataType.toString()] || "unknown",
        content: "Encrypted data stored on blockchain (decryption requires original encryption key)",
        metadata: `Metadata value: ${confidentialDataAccount.metadata.toString()}`,
        dataId: confidentialDataAccount.dataId.toString(),
        ownerId: confidentialDataAccount.ownerId.toString(),
      });

      setStatus("✅ Data retrieved successfully!");

    } catch (err: any) {
      console.error("Error viewing data:", err);
      setError(err.message || "Failed to fetch data. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const getTypeIcon = (type: string) => {
    const icons: Record<string, string> = {
      document: "📄",
      message: "💬",
      file: "📁",
      credential: "🔐",
    };
    return icons[type] || "📄";
  };

  return (
    <Card id="view">
      <CardHeader>
        <CardTitle>View Confidential Data</CardTitle>
        <CardDescription>
          Decrypt and view data that has been shared with you
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
          <p className="text-sm text-blue-600 dark:text-blue-400">
            Click the button below to view your stored confidential data. This will fetch and display the encrypted data from your Solana account.
          </p>
        </div>

        <Button
          onClick={handleView}
          disabled={loading || !wallet.connected}
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
              Decrypting...
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
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                />
              </svg>
              View & Decrypt
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

        <AnimatePresence>
          {decryptedData && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3 }}
              className="overflow-hidden"
            >
              <div className="space-y-4 p-4 bg-secondary/50 rounded-lg border border-border">
                <div className="flex items-center gap-3">
                  <div className="text-3xl">{getTypeIcon(decryptedData.type)}</div>
                  <div>
                    <p className="font-medium capitalize">{decryptedData.type}</p>
                    <p className="text-xs text-muted-foreground">{decryptedData.metadata}</p>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Decrypted Content</label>
                  <div className="bg-background rounded-lg p-4 border border-border min-h-[120px]">
                    <p className="text-sm">{decryptedData.content}</p>
                  </div>
                </div>

                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setDecryptedData(null)}
                  className="w-full"
                >
                  Clear
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}
