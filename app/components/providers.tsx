"use client";

import { ThemeProvider } from "next-themes";
import { WalletProvider } from "@/components/wallet-provider";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <WalletProvider>{children}</WalletProvider>
    </ThemeProvider>
  );
}
