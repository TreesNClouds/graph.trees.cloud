"use client";

import type { ReactNode } from "react";
import { ConnectGate } from "@/components/connect-gate";
import { ExplorerHeader } from "@/components/explorer-header";
import { useApiKey } from "@/lib/use-api-key";

export function AppShell({ children }: { children: ReactNode }) {
  const { key, ready, connect, disconnect } = useApiKey();

  if (!ready) {
    return <div className="min-h-svh bg-background" />;
  }

  if (!key) {
    return (
      <div className="relative flex min-h-svh flex-col">
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
          <img
            src="/bg.png"
            alt=""
            className="size-full object-cover object-center opacity-20 grayscale"
          />
        </div>
        <div className="relative z-10 flex min-h-svh flex-col">
          <ConnectGate onConnected={connect} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-svh flex-col">
      <ExplorerHeader connected onDisconnect={disconnect} />
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
