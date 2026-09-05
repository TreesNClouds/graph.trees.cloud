"use client";

import { LayoutGrid, List, MapPin } from "lucide-react";
import { BrandLogo } from "@/components/brand-cell";
import {
  cardStats,
  isProductArt,
  objectId,
  objectImage,
  objectSubtitle,
  objectTitle,
  type ObjectView,
} from "@/lib/object-media";
import { type ColumnDef, type ObjectSpec } from "@/lib/objects";
import { cn } from "@/lib/utils";

const VIEWS: Array<{ id: ObjectView; label: string; Icon: typeof LayoutGrid }> = [
  { id: "cards", label: "Card", Icon: LayoutGrid },
  { id: "table", label: "List", Icon: List },
  { id: "map", label: "Map", Icon: MapPin },
];

export function ObjectViewSwitch({
  view,
  onChange,
}: {
  view: ObjectView;
  onChange: (view: ObjectView) => void;
}) {
  return (
    <div className="inline-flex items-center gap-0.5" role="tablist" aria-label="View">
      {VIEWS.map(({ id, label, Icon }) => {
        const on = view === id;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(id)}
            className={cn(
              "relative inline-flex items-center gap-1.5 px-3 py-2 text-[13px] font-semibold tracking-tight",
              on ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className={cn("size-4", on ? "opacity-100" : "opacity-65")} />
            <span>{label}</span>
            {on ? <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-foreground" /> : null}
          </button>
        );
      })}
    </div>
  );
}

export function ObjectThumb({
  row,
  spec,
  size = "sm",
}: {
  row: Record<string, unknown>;
  spec: ObjectSpec;
  size?: "sm" | "md";
}) {
  return (
    <BrandLogo
      src={objectImage(row)}
      name={objectTitle(row, spec)}
      id={objectId(row)}
      size={size}
      fit={isProductArt(spec) ? "contain" : "cover"}
    />
  );
}

export function ObjectCards({
  spec,
  columns,
  rows,
  loading,
}: {
  spec: ObjectSpec;
  columns: ColumnDef[];
  rows: Array<Record<string, unknown>>;
  loading: boolean;
}) {
  if (loading && !rows.length) {
    return <div className="px-6 py-16 text-center text-sm text-muted-foreground">Loading…</div>;
  }
  if (!rows.length) {
    return <div className="px-6 py-16 text-center text-sm text-muted-foreground">No rows for this filter set.</div>;
  }
  return (
    <div className={cn("grid gap-3 px-6 py-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4", loading && "opacity-60")}>
      {rows.map((row, i) => {
        const title = objectTitle(row, spec);
        const subtitle = objectSubtitle(row, spec);
        const stats = cardStats(columns, row);
        return (
          <article
            key={objectId(row) || String(i)}
            className="rounded-md border bg-card p-3"
          >
            <div className="flex items-start gap-3">
              <ObjectThumb row={row} spec={spec} size="md" />
              <div className="min-w-0">
                <div className="truncate font-medium">{title || "—"}</div>
                {subtitle ? <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{subtitle}</div> : null}
              </div>
            </div>
            {stats.length ? (
              <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2">
                {stats.map((stat) => (
                  <div key={stat.label}>
                    <dt className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground">{stat.label}</dt>
                    <dd className="tabular-nums text-sm">{stat.value}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}
