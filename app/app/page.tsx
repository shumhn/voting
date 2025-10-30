"use client";

import { Header } from "@/components/header";
import { StoreData } from "@/components/store-data";
import { ShareData } from "@/components/share-data";
import { ViewData } from "@/components/view-data";
import { motion } from "framer-motion";

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container mx-auto px-4 py-12">
        {/* Hero Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center mb-16 max-w-3xl mx-auto"
        >
          <h1 className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
            Secure Data Sharing on Solana
          </h1>
          <p className="text-lg text-muted-foreground">
            Store, share, and decrypt confidential data using Arcium's MPC network.
            End-to-end encrypted. Trustless. Decentralized.
          </p>
        </motion.div>

        {/* Features Grid */}
        <div className="grid gap-8 mb-16">
          <StoreData />
          <div className="grid md:grid-cols-2 gap-8">
            <ShareData />
            <ViewData />
          </div>
        </div>

        {/* Footer */}
        <motion.footer
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="mt-24 pb-12 text-center text-sm text-muted-foreground border-t border-border pt-8"
        >
          <p>Built with Arcium MPC • Powered by Solana</p>
          <p className="mt-2">Enabling truly confidential computation on public blockchains</p>
        </motion.footer>
      </main>
    </div>
  );
}
