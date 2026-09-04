"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandedLogo } from "@/components/branded-logo";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Catalog" },
  { href: "/graphql", label: "GraphQL" },
  { href: "/license", label: "License" },
];

export function ExplorerHeader({
  connected = false,
  overlay = false,
  onDisconnect,
}: {
  connected?: boolean;
  overlay?: boolean;
  onDisconnect?: () => void;
}) {
  const pathname = usePathname();

  return (
    <header className={cn("sticky top-0 z-40 border-b", overlay ? "bg-background/70 backdrop-blur-sm" : "bg-background")}>
      <div className="flex h-14 items-center justify-between gap-4 px-6">
        <div className="flex items-center gap-6">
          <BrandedLogo size="sm" href="/" />
          <nav className="flex items-center gap-1">
            {NAV.map((item) => {
              const active =
                item.href === "/"
                  ? pathname === "/" || pathname.startsWith("/objects")
                  : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                    active
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <ThemeSwitcher />
          {connected ? (
            <Button variant="outline" size="sm" onClick={onDisconnect}>
              Disconnect
            </Button>
          ) : null}
        </div>
      </div>
    </header>
  );
}
