"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { catalogObjects, CATALOG_FAMILIES, type ObjectSpec } from "@/lib/objects";
import { gql } from "@/lib/gql";
import { useApiKey } from "@/lib/use-api-key";
import { cn } from "@/lib/utils";

type Meta = Record<string, unknown>;

let metaCache: Promise<Meta> | null = null;

function loadMeta(apiKey: string): Promise<Meta> {
  if (!metaCache) {
    metaCache = gql<{
      publicMenus: { meta: Meta; licenses: { total?: number } | Record<string, unknown> };
    }>(
      apiKey,
      `query { publicMenus { meta licenses: data(path: "/geo/licenses?limit=1") } }`,
    )
      .then((data) => {
        const meta = { ...(data.publicMenus.meta ?? {}) };
        const lic = data.publicMenus.licenses;
        const total = lic && typeof lic === "object" ? Number((lic as { total?: unknown }).total) : NaN;
        if (Number.isFinite(total)) meta.licenses = total;
        return meta;
      })
      .catch((err) => {
        metaCache = null;
        throw err;
      });
  }
  return metaCache;
}

function formatStat(meta: Meta | null, spec: ObjectSpec): string | null {
  if (!meta || !spec.statKey) return null;
  const raw = meta[spec.statKey];
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return `${n.toLocaleString("en-US")} ${spec.statLabel ?? spec.statKey}`;
}

export function CatalogHome() {
  const objects = catalogObjects();
  const { key } = useApiKey();
  const [meta, setMeta] = useState<Meta | null>(null);

  useEffect(() => {
    if (!key) return;
    let alive = true;
    loadMeta(key)
      .then((next) => {
        if (alive) setMeta(next);
      })
      .catch(() => {
        /* counts are secondary */
      });
    return () => {
      alive = false;
    };
  }, [key]);

  return (
    <div className="w-full px-6 py-8 pb-16">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Trees N Clouds Data</h1>
        <p className="mt-2 max-w-xl text-[13px] leading-relaxed text-muted-foreground">
          Public Menus is queryable now. Point of Sale, ERP, CRM, and Accounting light up with a subscription
          key. A Top-Level Account is active only when a CRM, ACC, or ERP connection is live.
        </p>
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-md border bg-card px-3.5 py-2.5 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-2">
          <span className="size-4 rounded-[5px] border border-foreground bg-foreground" />
          Queryable now
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="size-4 rounded-[5px] border bg-[repeating-linear-gradient(45deg,hsl(var(--muted-foreground)/.45)_0_3px,transparent_3px_6px)]" />
          Subscription + API key
        </span>
      </div>

      <div className="flex flex-col gap-8">
        {CATALOG_FAMILIES.map((family) => {
          const items = objects.filter((o) => o.family === family.id);
          if (!items.length) return null;
          return <FamilySection key={family.id} family={family} items={items} meta={meta} />;
        })}
      </div>

      <footer className="mt-12 flex flex-wrap items-center justify-between gap-3 border-t pt-4 text-xs text-muted-foreground">
        <div>
          <b className="font-semibold text-foreground">{objects.length}</b> objects ·{" "}
          <b className="font-semibold text-foreground">{CATALOG_FAMILIES.length}</b> domains · TLA last
        </div>
        <Link href="/graphql" className="hover:text-foreground hover:underline hover:underline-offset-4">
          GraphQL
        </Link>
      </footer>
    </div>
  );
}

function FamilySection({
  family,
  items,
  meta,
}: {
  family: (typeof CATALOG_FAMILIES)[number];
  items: ObjectSpec[];
  meta: Meta | null;
}) {
  const gated = family.id !== "pub";

  return (
    <section style={{ ["--sec" as string]: family.color }}>
      <header
        className={cn(
          "mb-3 flex items-center gap-3 border-l-[3px] pl-2.5",
          gated &&
            "rounded-md bg-[repeating-linear-gradient(45deg,color-mix(in_srgb,var(--sec)_8%,transparent)_0_6px,transparent_6px_13px)]",
        )}
        style={{ borderLeftColor: family.color }}
      >
        <span
          className="min-w-[46px] rounded-md border px-2 py-1 text-center text-xs font-bold tracking-wider"
          style={{
            color: family.color,
            borderColor: `color-mix(in srgb, ${family.color} 45%, hsl(var(--border)))`,
            background: `color-mix(in srgb, ${family.color} 10%, transparent)`,
          }}
        >
          {family.code}
        </span>
        <div className="min-w-0 leading-snug">
          <b className="text-[15px] font-semibold">{family.name}</b>
          <div className="text-xs font-normal text-muted-foreground">{family.tagline}</div>
        </div>
        <span
          className="ml-auto shrink-0 rounded-full px-2.5 py-0.5 text-[10px] uppercase tracking-wider text-white"
          style={{ background: family.color }}
        >
          {gated ? "subscription" : "live"}
        </span>
      </header>

      {family.id === "tla" ? (
        <p className="mb-3 text-xs text-muted-foreground">
          A Top-Level Account requires an active CRM, ACC, or ERP connection. Public Menus alone does not create
          one.
        </p>
      ) : null}

      <div className="grid grid-cols-[repeat(auto-fill,minmax(264px,1fr))] gap-3">
        {items.map((item) => (
          <ObjectCard key={item.id} spec={item} gated={gated} stat={formatStat(meta, item)} />
        ))}
      </div>
    </section>
  );
}

function ObjectCard({ spec, gated, stat }: { spec: ObjectSpec; gated: boolean; stat: string | null }) {
  return (
    <Link
      href={`/objects/${spec.id}`}
      className={cn(
        "flex flex-col rounded-md border border-l-[3px] bg-card px-3.5 py-3.5 no-underline transition-shadow hover:shadow-sm",
        gated &&
          "bg-[repeating-linear-gradient(45deg,color-mix(in_srgb,var(--sec)_9%,transparent)_0_6px,transparent_6px_13px)]",
      )}
      style={{ borderLeftColor: "color-mix(in srgb, var(--sec) 55%, hsl(var(--border)))" }}
    >
      <div className="mb-1.5 flex items-center gap-2">
        <span className="text-[15px] font-bold tracking-tight text-foreground">{spec.name}</span>
        <span className="ml-auto rounded-full border px-2 py-px text-[10px] uppercase tracking-wide text-muted-foreground">
          {gated ? "subscription" : "live"}
        </span>
      </div>
      <p className="line-clamp-3 text-xs leading-relaxed text-muted-foreground">{spec.tagline}</p>
      {spec.statKey ? (
        <div className="mt-2.5 text-xs font-bold tabular-nums" style={{ color: "var(--sec)" }}>
          {stat ?? "—"}
        </div>
      ) : null}
    </Link>
  );
}
