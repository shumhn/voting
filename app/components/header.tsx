"use client";

import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { ThemeToggle } from "./theme-toggle";
import { motion } from "framer-motion";

export function Header() {
  return (
    <motion.header
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="sticky top-0 z-50 w-full border-b border-border bg-background/80 backdrop-blur-lg"
    >
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <motion.div
            whileHover={{ scale: 1.02 }}
            className="flex items-center gap-2"
          >
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center">
              <svg
                className="w-5 h-5 text-primary-foreground"
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
            </div>
            <h1 className="text-lg font-semibold tracking-tight">
              Confidential Sharing
            </h1>
          </motion.div>

          <nav className="hidden md:flex items-center gap-6">
            <NavLink href="#store">Store</NavLink>
            <NavLink href="#share">Share</NavLink>
            <NavLink href="#view">View</NavLink>
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <ThemeToggle />
          <WalletMultiButton className="!bg-primary !rounded-lg !h-10 !px-4 hover:!bg-primary/90 !transition-all !font-medium" />
        </div>
      </div>
    </motion.header>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <motion.a
      href={href}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      className="text-sm text-muted-foreground hover:text-foreground transition-colors font-medium"
    >
      {children}
    </motion.a>
  );
}
