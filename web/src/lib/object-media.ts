import { formatCell, type ColumnDef, type ObjectSpec } from "@/lib/objects";

export type ObjectView = "cards" | "table" | "map";

export type MapPoint = {
  id: string;
  name: string;
  lat: number;
  lng: number;
};

const IMAGE_KEYS = ["image", "logo", "product_image_url", "brand_image_url", "listing_avatar_url"] as const;
const TITLE_KEYS = ["name", "item_name", "listing_name", "business_dba_name", "account_name", "genetics", "license_number"] as const;

export function objectImage(row: Record<string, unknown>): string | null {
  for (const key of IMAGE_KEYS) {
    const value = row[key];
    if (typeof value === "string" && /^https?:\/\//.test(value)) return value;
  }
  return null;
}

export function objectId(row: Record<string, unknown>): string {
  return String(
    row.id ??
      row.canonical_brand_id ??
      row.canonical_account_id ??
      row.license_number ??
      row.account_name ??
      "",
  ).trim();
}

export function objectTitle(row: Record<string, unknown>, spec?: ObjectSpec): string {
  if (spec?.kind === "records") return String(row.item_name ?? row.name ?? "").trim();
  if (spec?.id === "license") return String(row.business_dba_name ?? row.license_number ?? "").trim();
  if (spec?.kind === "tla") return String(row.account_name ?? "").trim();
  for (const key of TITLE_KEYS) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

export function objectSubtitle(row: Record<string, unknown>, spec?: ObjectSpec): string {
  if (spec?.kind === "records") {
    return [row.listing_name, row.brand_name, row.category].filter((v) => v != null && v !== "").join(" · ");
  }
  if (spec?.id === "product") {
    return [row.brand, row.cat].filter((v) => v != null && v !== "").join(" · ");
  }
  if (spec?.id === "license") {
    const loc = [row.premise_city, row.state_code].filter(Boolean).join(", ");
    return [row.license_number, row.license_type, loc].filter((v) => v != null && v !== "").join(" · ");
  }
  const loc = [row.city ?? row.premise_city, row.sub_state ?? row.state ?? row.state_code ?? row.address_state_code]
    .filter((v) => v != null && v !== "")
    .join(", ");
  const extra = row.brand ?? row.listing_type ?? row.type ?? row.market_name ?? row.category ?? row.addr;
  return [loc, extra].filter((v) => v != null && v !== "").join(" · ");
}

export function nameColumnKey(spec: ObjectSpec, columns: ColumnDef[]): string {
  if (spec.kind === "records") return "item_name";
  if (spec.id === "license") return "business_dba_name";
  if (spec.kind === "tla") return "account_name";
  if (spec.kind === "query") return columns[0]?.key ?? "name";
  const keys = new Set(TITLE_KEYS);
  return columns.find((col) => keys.has(col.key as (typeof TITLE_KEYS)[number]))?.key ?? columns[0]?.key ?? "name";
}

export function cardStats(columns: ColumnDef[], row: Record<string, unknown>): Array<{ label: string; value: string }> {
  return columns
    .filter((col) => col.kind !== "text" && !col.virtual)
    .slice(0, 4)
    .map((col) => ({ label: col.label, value: formatCell(col.kind, row[col.key]) }));
}

export function isProductArt(spec: ObjectSpec): boolean {
  return spec.kind === "records" || spec.exploreDim === "products" || spec.id === "product";
}

export function parseMapPoints(raw: unknown): MapPoint[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const lat = Number(row.lat ?? row.latitude);
    const lng = Number(row.lng ?? row.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat === 0 || lng === 0) return [];
    return [
      {
        id: objectId(row),
        name: String(row.name ?? row.listing_name ?? "Store"),
        lat,
        lng,
      },
    ];
  });
}

export function rowMapPoints(rows: Array<Record<string, unknown>>): MapPoint[] {
  return parseMapPoints(rows);
}

export function readObjectView(specId: string): ObjectView {
  try {
    const value = sessionStorage.getItem(`tc-obj-view-${specId}`);
    if (value === "cards" || value === "table" || value === "map") return value;
  } catch {
    /* private mode */
  }
  return "cards";
}

export function writeObjectView(specId: string, view: ObjectView) {
  try {
    sessionStorage.setItem(`tc-obj-view-${specId}`, view);
  } catch {
    /* private mode */
  }
}

export function filtersToSearchParams(filters: Record<string, unknown>): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value == null || value === "") continue;
    if (typeof value === "boolean") {
      if (value) params.set(key, "1");
      continue;
    }
    params.set(key, String(value));
  }
  return params;
}
