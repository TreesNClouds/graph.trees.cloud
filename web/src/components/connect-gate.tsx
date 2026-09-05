"use client";

import { useState } from "react";
import Link from "next/link";
import { BrandedLogo } from "@/components/branded-logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { persistKey, probeKey } from "@/lib/api-key";
import { toastError } from "@/lib/toast";

export function ConnectGate({ onConnected }: { onConnected: (key: string) => void }) {
  const [value, setValue] = useState("");
  const [pending, setPending] = useState(false);

  async function submit() {
    const key = value.trim();
    if (!key) {
      toastError("Enter a trees.cloud API key.");
      return;
    }
    setPending(true);
    try {
      const result = await probeKey(key);
      if (!result.ok) {
        toastError(result.message);
        return;
      }
      persistKey(key);
      onConnected(key);
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Could not reach GraphQL.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-4">
          <BrandedLogo size="md" href="/" className="pointer-events-none mx-auto w-fit" />
          <div className="space-y-1.5">
            <CardTitle>Connect</CardTitle>
            <CardDescription>
              This playground runs on the trees.cloud GraphQL API. Enter your API key to continue. It
              is stored in this tab only.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="tnc-key">trees.cloud API key</Label>
            <Input
              id="tnc-key"
              type="password"
              autoComplete="off"
              spellCheck={false}
              data-ga4-ignore
              placeholder="tnc_live_… or tnc_test_…"
              className="font-mono"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void submit();
              }}
            />
          </div>
          <Button className="w-full" disabled={pending} onClick={() => void submit()}>
            {pending ? "Checking…" : "Use key"}
          </Button>
          <p className="text-center text-xs leading-relaxed text-muted-foreground">
            Licensed under the Functional Source License. You can read, fork, and
            self-host. Offering a competing hosted substitute is not a permitted
            purpose.{" "}
            <Link href="/license" className="underline underline-offset-2 hover:text-foreground">
              Read the license
            </Link>
            .
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
