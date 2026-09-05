"use client";

import { useCallback, useEffect, useState } from "react";
import { clearKey, persistKey, readStoredKey } from "@/lib/api-key";

export function useApiKey() {
  const [key, setKey] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stored = readStoredKey();
    if (stored) persistKey(stored);
    setKey(stored || null);
    setReady(true);
  }, []);

  const connect = useCallback((next: string) => {
    persistKey(next);
    setKey(next);
  }, []);

  const disconnect = useCallback(() => {
    clearKey();
    setKey(null);
  }, []);

  return { key, ready, connect, disconnect };
}
