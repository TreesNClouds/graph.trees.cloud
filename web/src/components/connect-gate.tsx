"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { persistKey, probeKey } from "@/lib/api-key";

export function ConnectGate({ onConnected }: { onConnected: (key: string) => void }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit() {
    const key = value.trim();
    if (!key) {
      setError("Enter a key.");
      return;
    }
    setPending(true);
    setError("Checking…");
    try {
      const result = await probeKey(key);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      persistKey(key);
      onConnected(key);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reach GraphQL.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex min-h-[calc(100svh-3.5rem)] items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Connect</CardTitle>
          <CardDescription>
            This playground runs on the trees.cloud GraphQL API. Enter your API key to continue. It
            is stored in this tab only.
          </CardDescription>
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
            Use key
          </Button>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </CardContent>
      </Card>
    </div>
  );
}
