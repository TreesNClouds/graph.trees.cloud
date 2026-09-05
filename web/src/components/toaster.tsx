"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { subscribeToasts, type ToastItem } from "@/lib/toast";
import { cn } from "@/lib/utils";

const DISMISS_MS = 5600;

export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    return subscribeToasts((item) => {
      setItems((prev) => [...prev.slice(-4), item]);
      window.setTimeout(() => {
        setItems((prev) => prev.filter((t) => t.id !== item.id));
      }, DISMISS_MS);
    });
  }, []);

  if (!items.length) return null;

  return (
    <div className="pointer-events-none fixed top-4 right-4 z-[80] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2">
      {items.map((item) => (
        <div
          key={item.id}
          className={cn(
            "pointer-events-auto flex items-start gap-3 rounded-md border bg-card px-3 py-2.5 text-sm shadow-lg",
            item.tone === "error" ? "border-destructive/40" : "border-border",
          )}
          role="status"
        >
          <p
            className={cn(
              "min-w-0 flex-1 leading-snug",
              item.tone === "error" ? "text-destructive" : "text-foreground",
            )}
          >
            {item.message}
          </p>
          <button
            type="button"
            className="mt-0.5 text-muted-foreground hover:text-foreground"
            aria-label="Dismiss"
            onClick={() => setItems((prev) => prev.filter((t) => t.id !== item.id))}
          >
            <X className="size-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
