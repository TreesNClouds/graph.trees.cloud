"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { gql } from "@/lib/gql";
import { formatCell, type ColumnDef } from "@/lib/objects";
import { cn } from "@/lib/utils";

const aliasCache = new Map<string, string[]>();

function placeholderColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const hues = [168, 12, 210, 32, 280, 150];
  return `hsl(${hues[h % hues.length]} 28% 42%)`;
}

export function BrandLogo({
  src,
  name,
  id,
}: {
  src?: string | null;
  name: string;
  id: string;
}) {
  const [broken, setBroken] = useState(false);
  const initial = (name || "?").slice(0, 1).toUpperCase();
  const showImg = Boolean(src && /^https?:\/\//.test(src) && !broken);

  return (
    <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-white">
      {showImg ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src!}
          alt=""
          className="size-10 object-contain p-0.5"
          onError={() => setBroken(true)}
        />
      ) : (
        <span
          className="flex size-10 items-center justify-center text-sm font-semibold text-white"
          style={{ background: placeholderColor(id || name) }}
        >
          {initial}
        </span>
      )}
    </div>
  );
}

/** Explore rows expose the collapse key as `id`; query rows use `brand_id`. */
export function brandCollapseId(row: Record<string, unknown>): string {
  return String(row.canonical_brand_id ?? row.brand_id ?? row.id ?? "").trim();
}

export function aliasesForBrand(
  map: Map<string, string[]>,
  row: Record<string, unknown>,
): string[] {
  const canonical = String(row.name ?? "").trim().toLowerCase();
  return (map.get(brandCollapseId(row)) ?? []).filter((n) => n.toLowerCase() !== canonical);
}

function cubeRows(payload: unknown): Array<Record<string, unknown>> {
  if (!payload || typeof payload !== "object") return [];
  const data = (payload as { data?: unknown }).data;
  return Array.isArray(data) ? data.filter((r): r is Record<string, unknown> => r != null && typeof r === "object") : [];
}

/**
 * Spellings for the canonical brand ids on the current page.
 * `/query?group_by=brand_name&brand_id=` is the grain that still has
 * other menu names; a national top-N of (id, name) only keeps the primary.
 */
export async function loadBrandSpellings(
  apiKey: string,
  brandIds: string[],
  filters?: Record<string, unknown>,
): Promise<Map<string, string[]>> {
  const ids = [...new Set(brandIds.map((id) => id.trim()).filter(Boolean))];
  const out = new Map<string, string[]>();
  if (!ids.length) return out;

  const base = new URLSearchParams();
  base.set("group_by", "brand_name");
  base.set("metrics", "products");
  base.set("limit", "80");
  for (const key of ["state", "category", "subcategory", "genetics"] as const) {
    const v = filters?.[key];
    if (v != null && v !== "") base.set(key, String(v));
  }

  for (let i = 0; i < ids.length; i += 10) {
    const chunk = ids.slice(i, i + 10);
    const fields = chunk
      .map((id, idx) => {
        const p = new URLSearchParams(base);
        p.set("brand_id", id);
        return `a${idx}: data(path: ${JSON.stringify(`/query?${p.toString()}`)})`;
      })
      .join("\n");
    const data = await gql<{ publicMenus: Record<string, unknown> }>(
      apiKey,
      `query { publicMenus { ${fields} } }`,
    );
    chunk.forEach((id, idx) => {
      const names = cubeRows(data.publicMenus[`a${idx}`])
        .map((row) => String(row.brand_name ?? "").trim())
        .filter(Boolean);
      out.set(id, [...new Set(names)]);
    });
  }
  return out;
}

export function BrandRow({
  row,
  columns,
  apiKey,
  filters,
}: {
  row: Record<string, unknown>;
  columns: ColumnDef[];
  apiKey: string;
  filters?: Record<string, unknown>;
}) {
  const [open, setOpen] = useState(false);
  const [aliases, setAliases] = useState<string[]>(() => aliasCache.get(brandCollapseId(row)) ?? []);
  const [aliasLoading, setAliasLoading] = useState(false);
  const [aliasError, setAliasError] = useState("");
  const id = brandCollapseId(row);
  const name = String(row.name ?? "");
  const canOpen = Boolean(id);

  async function toggle() {
    if (!canOpen) return;
    const next = !open;
    setOpen(next);
    if (!next || aliasCache.has(id) || aliasLoading) {
      if (aliasCache.has(id)) setAliases(aliasCache.get(id) ?? []);
      return;
    }
    setAliasLoading(true);
    setAliasError("");
    try {
      const map = await loadBrandSpellings(apiKey, [id], filters);
      const names = aliasesForBrand(map, row);
      aliasCache.set(id, names);
      setAliases(names);
    } catch (err) {
      setAliasError(err instanceof Error ? err.message : "Could not load aliases.");
    } finally {
      setAliasLoading(false);
    }
  }

  return (
    <>
      <tr
        role={canOpen ? "button" : undefined}
        tabIndex={canOpen ? 0 : undefined}
        className={cn("hover:bg-accent/40", canOpen && "cursor-pointer")}
        onClick={canOpen ? toggle : undefined}
        onKeyDown={
          canOpen
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  toggle();
                }
              }
            : undefined
        }
      >
        {columns.map((col) => (
          <td
            key={col.key}
            className={cn(
              "border-b border-border/70 px-4 py-2.5 align-middle",
              col.kind !== "text" && "text-right tabular-nums",
              col.key === "name" && "font-medium",
            )}
          >
            {col.key === "name" ? (
              <div className="flex items-center gap-3">
                <span className={cn("text-muted-foreground", !canOpen && "opacity-30")}>
                  {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                </span>
                <BrandLogo
                  src={typeof row.image === "string" ? row.image : null}
                  name={name}
                  id={id}
                />
                <span>{name || "—"}</span>
              </div>
            ) : col.key === "aliases" ? (
              <span className="tabular-nums">{aliasLoading ? "—" : aliases.length.toLocaleString("en-US")}</span>
            ) : (
              formatCell(col.kind, row[col.key])
            )}
          </td>
        ))}
      </tr>
      {open ? (
        <tr className="bg-muted/20">
          <td colSpan={columns.length} className="border-b px-6 py-3">
            {aliasLoading ? (
              <p className="text-xs text-muted-foreground">Loading aliases…</p>
            ) : aliasError ? (
              <p className="text-xs text-destructive">{aliasError}</p>
            ) : aliases.length === 0 ? (
              <p className="text-xs text-muted-foreground">No aliases.</p>
            ) : (
              <div>
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  Aliases
                </div>
                <ul className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {aliases.map((alias) => (
                    <li key={alias} className="rounded border bg-background px-2.5 py-1.5 text-sm">
                      {alias}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </td>
        </tr>
      ) : null}
    </>
  );
}
