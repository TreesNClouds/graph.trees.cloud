"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BrandRow } from "@/components/brand-cell";
import { ObjectMap } from "@/components/object-map";
import { ObjectCards, ObjectThumb, ObjectViewSwitch } from "@/components/object-views";
import { gql, type CubePage, type TenantSchema } from "@/lib/gql";
import {
  filtersToSearchParams,
  nameColumnKey,
  parseMapPoints,
  readObjectView,
  rowMapPoints,
  writeObjectView,
  type MapPoint,
  type ObjectView,
} from "@/lib/object-media";
import { formatCell, type ColumnDef, type FilterDef, type ObjectSpec } from "@/lib/objects";
import { cn } from "@/lib/utils";

const SUB_KEY = "tc-sub";
const PAGE_SIZES = [25, 50, 100];
const SEARCH_DEBOUNCE_MS = 280;

type FacetOpt = { v: string; label: string; count?: number };
type Values = Record<string, string | string[]>;

let pubFacetsCache: Promise<Record<string, FacetOpt[]>> | null = null;
let licenseFacetsCache: Promise<Record<string, FacetOpt[]>> | null = null;
const scopedFacetCache = new Map<string, Promise<Record<string, FacetOpt[]>>>();

function asList(v: string | string[] | undefined): string[] {
  if (Array.isArray(v)) return v.filter(Boolean);
  return v ? [v] : [];
}

function asText(v: string | string[] | undefined): string {
  return Array.isArray(v) ? (v[0] ?? "") : (v ?? "");
}

function readSub(): string {
  try {
    return sessionStorage.getItem(SUB_KEY)?.trim() || "";
  } catch {
    return "";
  }
}

function writeSub(id: string) {
  try {
    if (id) sessionStorage.setItem(SUB_KEY, id);
    else sessionStorage.removeItem(SUB_KEY);
  } catch {
    /* ignore */
  }
}

function menuFilters(values: Values): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const state = asList(values.state);
  const category = asList(values.category);
  const subcategory = asList(values.subcategory);
  const genetics = asList(values.genetics);
  const brand = asList(values.brand);
  if (state.length) out.state = state.join(",");
  if (category.length) out.category = category.join(",");
  if (subcategory.length) out.subcategory = subcategory.join(",");
  if (genetics.length) out.genetics = genetics.join(",");
  if (brand.length) out.brand = brand.join(",");
  const q = asText(values.q);
  const item = asText(values.item);
  if (q) out.q = q;
  if (item) out.item = item;
  const stock = asText(values.stock);
  if (stock === "in") out.in_stock = true;
  else if (stock) out.stock = stock;
  const pmin = asText(values.price_min);
  const pmax = asText(values.price_max);
  if (pmin) out.price_min = Number(pmin);
  if (pmax) out.price_max = Number(pmax);
  return out;
}

function firstMenuFilter(values: Values): Record<string, unknown> {
  const raw = menuFilters(values);
  const one = (k: string) => {
    const v = raw[k];
    if (typeof v === "string" && v.includes(",")) raw[k] = v.split(",")[0];
  };
  one("state");
  one("category");
  one("subcategory");
  one("genetics");
  one("brand");
  return raw;
}

function inferColumns(rows: Array<Record<string, unknown>>, preferred: ColumnDef[], keepPreferred = false): ColumnDef[] {
  if (preferred.length) {
    if (keepPreferred) return preferred;
    const present = preferred.filter(
      (c) =>
        c.virtual ||
        c.key === "name" ||
        c.key === "skus" ||
        c.key === "listings" ||
        rows.length === 0 ||
        rows.some((r) => r[c.key] != null),
    );
    return present.length ? present : preferred;
  }
  const keys = new Set<string>();
  for (const row of rows.slice(0, 8)) {
    for (const k of Object.keys(row)) {
      if (k === "id" || k === "image" || k === "lat" || k === "lng") continue;
      keys.add(k);
    }
  }
  return [...keys].slice(0, 10).map((key) => ({
    key,
    label: key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    kind: /revenue|price|amount|balance|due/i.test(key) ? "money" : /count|skus|stores|qty|units/i.test(key) ? "int" : "text",
  }));
}

function optionLabel(raw: Record<string, unknown>): FacetOpt {
  const v = String(raw.v ?? raw.id ?? raw.value ?? "");
  const label = String(raw.label ?? raw.name ?? raw.v ?? v);
  const count = raw.c != null ? Number(raw.c) : undefined;
  return { v, label, count };
}

function packFacets(payload: Record<string, unknown>, key: string): FacetOpt[] {
  return (Array.isArray(payload[key]) ? (payload[key] as Array<Record<string, unknown>>) : [])
    .map(optionLabel)
    .filter((o) => o.v);
}

function loadPubFacets(apiKey: string): Promise<Record<string, FacetOpt[]>> {
  if (!pubFacetsCache) {
    pubFacetsCache = gql<{ publicMenus: { facets: Record<string, unknown> } }>(
      apiKey,
      `query { publicMenus { facets } }`,
    )
      .then((data) => {
        const raw = data.publicMenus.facets ?? {};
        return {
          states: packFacets(raw, "states"),
          categories: packFacets(raw, "categories"),
          subcategories: packFacets(raw, "subcategories"),
          genetics: packFacets(raw, "genetics"),
        };
      })
      .catch((err) => {
        pubFacetsCache = null;
        throw err;
      });
  }
  return pubFacetsCache;
}

function loadLicenseFacets(apiKey: string): Promise<Record<string, FacetOpt[]>> {
  if (!licenseFacetsCache) {
    licenseFacetsCache = cubeData(apiKey, "/geo/licenses/facets")
      .then((payload) => {
        const statuses = packFacets(payload, "statuses");
        if (!statuses.some((o) => o.v.toLowerCase() === "active")) {
          statuses.unshift({ v: "active", label: "Active" });
        }
        return {
          states: packFacets(payload, "states"),
          types: packFacets(payload, "types"),
          statuses,
        };
      })
      .catch((err) => {
        licenseFacetsCache = null;
        throw err;
      });
  }
  return licenseFacetsCache;
}

function loadScopedFacets(apiKey: string, values: Values): Promise<Record<string, FacetOpt[]>> {
  const scoped = firstMenuFilter({
    state: values.state,
    category: values.category,
  });
  const key = `${String(scoped.state ?? "")}|${String(scoped.category ?? "")}`;
  const hit = scopedFacetCache.get(key);
  if (hit) return hit;
  const q = `query($f:MenuFilters){publicMenus{query(groupBy:[category],metrics:[products],filters:$f,limit:80){data}
    sub:query(groupBy:[subcategory],metrics:[products],filters:$f,limit:80){data}
    gen:query(groupBy:[genetics],metrics:[products],filters:$f,limit:20){data}}}`;
  const pending = gql<{
    publicMenus: { query: CubePage; sub: CubePage; gen: CubePage };
  }>(apiKey, q, { f: scoped })
    .then((scopedData) => {
      const take = (page: CubePage | undefined, dim: string) =>
        (page?.data ?? [])
          .map((r) => ({
            v: String(r[dim] ?? ""),
            label: String(r[dim] ?? ""),
            count: Number(r.products ?? r.c ?? 0) || undefined,
          }))
          .filter((o) => o.v);
      const next: Record<string, FacetOpt[]> = {};
      if (scopedData.publicMenus.query.data?.length) next.categories = take(scopedData.publicMenus.query, "category");
      if (scopedData.publicMenus.sub.data?.length) next.subcategories = take(scopedData.publicMenus.sub, "subcategory");
      if (scopedData.publicMenus.gen.data?.length) next.genetics = take(scopedData.publicMenus.gen, "genetics");
      return next;
    })
    .catch((err) => {
      scopedFacetCache.delete(key);
      throw err;
    });
  scopedFacetCache.set(key, pending);
  return pending;
}

async function cubeData(apiKey: string, path: string): Promise<Record<string, unknown>> {
  const data = await gql<{ publicMenus: { data: unknown } }>(
    apiKey,
    `query($p:String!){publicMenus{data(path:$p)}}`,
    { p: path },
  );
  const payload = data.publicMenus.data;
  return payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
}

function formatGeoValue(value: unknown): string {
  if (value == null || value === "") return "—";
  if (typeof value === "number") return Number.isFinite(value) ? value.toLocaleString("en-US") : String(value);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

function flattenGeoBlock(value: unknown, prefix = ""): Array<{ label: string; value: string }> {
  if (value == null) return [];
  if (typeof value !== "object") return [{ label: prefix || "value", value: formatGeoValue(value) }];
  if (Array.isArray(value)) {
    return value.flatMap((item, i) => flattenGeoBlock(item, prefix ? `${prefix}[${i}]` : String(i)));
  }
  return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) =>
    flattenGeoBlock(v, prefix ? `${prefix}.${k}` : k),
  );
}

const GEO_SECTIONS: Array<{ key: string; title: string }> = [
  { key: "resolved", title: "Resolved" },
  { key: "demographics", title: "Demographics" },
  { key: "nearby", title: "Nearby" },
  { key: "market", title: "Market" },
  { key: "business_patterns", title: "Business patterns" },
  { key: "demand_weight", title: "Demand" },
  { key: "density", title: "Density" },
];

function GeoListView({ payload }: { payload: Record<string, unknown> | null }) {
  if (!payload) return null;
  const layers = (payload.layers as Record<string, unknown> | undefined) ?? {};
  const rows = GEO_SECTIONS.flatMap((section) => {
    const raw = section.key === "resolved" ? payload.resolved : layers[section.key];
    return flattenGeoBlock(raw).map((row) => ({ ...row, section: section.title }));
  });
  if (!rows.length) {
    return <div className="px-6 py-16 text-center text-sm text-muted-foreground">No enrich layers for this ZIP.</div>;
  }
  return (
    <table className="w-full border-separate border-spacing-0 text-sm">
      <thead className="sticky top-0 z-10">
        <tr>
          {["Layer", "Field", "Value"].map((label) => (
            <th
              key={label}
              className="border-b bg-background/95 px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground backdrop-blur"
            >
              {label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={`${row.section}-${row.label}`} className="hover:bg-accent/40">
            <td className="border-b border-border/70 px-4 py-2.5 text-muted-foreground">{row.section}</td>
            <td className="border-b border-border/70 px-4 py-2.5">{row.label}</td>
            <td className="border-b border-border/70 px-4 py-2.5 text-right tabular-nums">{row.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function GeoEnrichView({ payload }: { payload: Record<string, unknown> | null }) {
  if (!payload) return null;
  const layers = (payload.layers as Record<string, unknown> | undefined) ?? {};
  const blocks = GEO_SECTIONS.map((section) => {
    const raw = section.key === "resolved" ? payload.resolved : layers[section.key];
    return { ...section, rows: flattenGeoBlock(raw) };
  }).filter((s) => s.rows.length);
  if (!blocks.length) {
    return <div className="px-6 py-16 text-center text-sm text-muted-foreground">No enrich layers for this ZIP.</div>;
  }
  return (
    <div className="grid gap-4 px-6 py-5 lg:grid-cols-2">
      {blocks.map((block) => (
        <section key={block.key} className="rounded-md border bg-card">
          <h2 className="border-b px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            {block.title}
          </h2>
          <dl className="divide-y">
            {block.rows.map((row) => (
              <div key={row.label} className="flex items-baseline justify-between gap-4 px-4 py-2 text-sm">
                <dt className="min-w-0 truncate text-muted-foreground">{row.label}</dt>
                <dd className="shrink-0 text-right tabular-nums">{row.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}

export function ObjectExplorer({ spec, apiKey }: { spec: ObjectSpec; apiKey: string }) {
  const [values, setValues] = useState<Values>(() => spec.defaultValues ?? {});
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [sort, setSort] = useState(spec.defaultSort ?? spec.columns.find((c) => c.sort)?.sort ?? "");
  const [dir, setDir] = useState<"asc" | "desc">(spec.defaultDir ?? "desc");
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [geoPayload, setGeoPayload] = useState<Record<string, unknown> | null>(null);
  const [total, setTotal] = useState(0);
  const [snapshot, setSnapshot] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [options, setOptions] = useState<Record<string, FacetOpt[]>>({});
  const [sub, setSub] = useState("");
  const [subDraft, setSubDraft] = useState("");
  const [schema, setSchema] = useState<TenantSchema | null>(null);
  const [view, setView] = useState<ObjectView>("cards");
  const [mapPoints, setMapPoints] = useState<MapPoint[]>([]);
  const [mapLoading, setMapLoading] = useState(false);
  const [mapError, setMapError] = useState("");
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scopeKey = `${asList(values.state).join(",")}|${asList(values.category).join(",")}`;

  const filters = useMemo(() => {
    if (spec.kind === "tenant" && schema?.filters?.length) {
      return schema.filters.map((f): FilterDef => ({
        key: f.q,
        label: f.label || f.q,
        type: f.kind === "gte" || f.kind === "lte" ? "search" : f.multi || f.kind === "eq" ? "multi" : "search",
        facet: schema.dims?.includes(f.q) ? f.q : undefined,
        placeholder: f.kind === "ilike" ? "contains…" : undefined,
      }));
    }
    return spec.filters;
  }, [spec, schema]);

  const columns = useMemo(() => {
    if (spec.kind === "tenant" && schema?.columns?.length && !spec.tenantGroupBy) {
      return schema.columns.slice(0, 12).map((c): ColumnDef => ({
        key: c.col,
        label: c.label || c.col,
        kind: c.kind === "money" ? "money" : c.kind === "int" || c.kind === "num" ? "int" : "text",
        sort: c.col,
      }));
    }
    return inferColumns(rows, spec.columns, spec.kind === "records" || spec.kind === "licenses" || spec.kind === "listings");
  }, [spec, schema, rows]);

  useEffect(() => {
    const stored = readSub();
    setSub(stored);
    setSubDraft(stored);
  }, []);

  useEffect(() => {
    setValues(spec.defaultValues ?? {});
    setSearchDraft("");
    setSearch("");
    setPage(1);
    setSort(spec.defaultSort ?? spec.columns.find((c) => c.sort)?.sort ?? "");
    setDir(spec.defaultDir ?? "desc");
    setRows([]);
    setGeoPayload(null);
    setSchema(null);
    setView(readObjectView(spec.id));
    setMapPoints([]);
    setMapError("");
  }, [spec.id, spec.defaultValues, spec.defaultSort, spec.defaultDir, spec.columns]);

  const changeView = (next: ObjectView) => {
    setView(next);
    writeObjectView(spec.id, next);
  };

  const setFilter = useCallback(
    (key: string, next: string | string[]) => {
      setValues((prev) => {
        const out: Values = { ...prev, [key]: next };
        for (const f of filters) {
          if (f.dependsOn?.includes(key)) delete out[f.key];
        }
        return out;
      });
      setPage(1);
    },
    [filters],
  );

  const clearFilters = () => {
    setValues(spec.defaultValues ?? {});
    setSearchDraft("");
    setSearch("");
    setPage(1);
  };

  const loadNationalOptions = useCallback(async () => {
    if (spec.kind === "geo" || spec.kind === "tenant") return;
    try {
      if (spec.kind === "licenses") {
        const next = await loadLicenseFacets(apiKey);
        setOptions((prev) => ({ ...prev, ...next }));
        return;
      }
      const next = await loadPubFacets(apiKey);
      setOptions((prev) => ({ ...prev, ...next }));
    } catch {
      /* options are secondary */
    }
  }, [apiKey, spec.kind]);

  const loadScopedOptions = useCallback(async () => {
    if (spec.kind === "geo" || spec.kind === "licenses" || spec.kind === "tenant") return;
    if (!asList(values.state).length && !asList(values.category).length) return;
    try {
      const next = await loadScopedFacets(apiKey, values);
      setOptions((prev) => ({ ...prev, ...next }));
    } catch {
      /* keep unscoped facets */
    }
  }, [apiKey, spec.kind, scopeKey]);

  const loadTenantFacet = useCallback(
    async (field: string) => {
      if (spec.kind !== "tenant" || !spec.tenantField || !sub) return;
      const sid = Number(sub);
      if (!Number.isFinite(sid)) return;
      try {
        const data = await gql<{ cube: { facets: { data?: Array<Record<string, unknown>> } } }>(
          apiKey,
          `query($s:Int!,$f:String!,$fl:JSON){cube:${spec.tenantField}(subscriptionId:$s){facets(field:$f,filters:$fl)}}`,
          { s: sid, f: field, fl: values },
        );
        setOptions((prev) => ({
          ...prev,
          [field]: (data.cube.facets.data ?? []).map(optionLabel).filter((o) => o.v),
        }));
      } catch {
        /* options are secondary */
      }
    },
    [apiKey, spec.kind, spec.tenantField, sub, values],
  );

  const loadRows = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      if (spec.gated && !sub) {
        setRows([]);
        setGeoPayload(null);
        setTotal(0);
        setLoading(false);
        return;
      }

      if (spec.kind === "explore" && spec.exploreDim) {
        const data = await gql<{ publicMenus: { explore: CubePage } }>(
          apiKey,
          `query($dim:MenuObject!,$f:JSON,$sort:String,$dir:SortDir,$page:Int,$limit:Int){
            publicMenus{explore(dim:$dim,filters:$f,sort:$sort,dir:$dir,page:$page,limit:$limit){snapshotDate total page perPage data}}
          }`,
          {
            dim: spec.exploreDim,
            f: menuFilters({ ...values, [spec.searchKey ?? "q"]: search }),
            sort: sort || undefined,
            dir: dir.toUpperCase(),
            page,
            limit,
          },
        );
        const pageData = data.publicMenus.explore;
        setRows(pageData.data ?? []);
        setTotal(pageData.total ?? pageData.data?.length ?? 0);
        setSnapshot(pageData.snapshotDate ?? null);
        return;
      }

      if (spec.kind === "records") {
        const data = await gql<{ publicMenus: { records: CubePage; media: CubePage } }>(
          apiKey,
          `query($f:JSON,$tab:String,$sort:String,$dir:SortDir,$page:Int,$limit:Int){
            publicMenus{
              records(filters:$f,tab:$tab,sort:$sort,dir:$dir,page:$page,limit:$limit){snapshotDate total data columns}
              media:records(filters:$f,tab:"media",sort:$sort,dir:$dir,page:$page,limit:$limit){data}
            }
          }`,
          {
            f: menuFilters({ ...values, [spec.searchKey ?? "q"]: search }),
            tab: spec.recordsTab || undefined,
            sort: sort || undefined,
            dir: dir.toUpperCase(),
            page,
            limit,
          },
        );
        const rec = data.publicMenus.records;
        const media = data.publicMenus.media.data ?? [];
        const rowsWithArt = (rec.data ?? []).map((row, i) => {
          const art = media[i] ?? {};
          return {
            ...row,
            product_image_url: row.product_image_url ?? art.product_image_url,
            brand_image_url: row.brand_image_url ?? art.brand_image_url,
            listing_avatar_url: row.listing_avatar_url ?? art.listing_avatar_url,
            image: row.image ?? art.product_image_url ?? art.brand_image_url ?? art.listing_avatar_url,
          };
        });
        setRows(rowsWithArt);
        setTotal(rec.total ?? rowsWithArt.length);
        setSnapshot(rec.snapshotDate ?? null);
        return;
      }

      if (spec.kind === "query" && spec.groupBy && spec.metrics) {
        const data = await gql<{ publicMenus: { query: CubePage } }>(
          apiKey,
          `query($g:[MenuDim!],$m:[MenuMetric!],$f:MenuFilters,$ob:String,$od:SortDir,$limit:Int){
            publicMenus{query(groupBy:$g,metrics:$m,filters:$f,orderBy:$ob,orderDir:$od,limit:$limit){snapshotDate count data}}
          }`,
          {
            g: spec.groupBy,
            m: spec.metrics,
            f: firstMenuFilter(values),
            ob: sort || spec.metrics[0],
            od: dir.toUpperCase(),
            limit,
          },
        );
        setRows(data.publicMenus.query.data ?? []);
        setTotal((data.publicMenus.query as { count?: number }).count ?? data.publicMenus.query.data?.length ?? 0);
        setSnapshot(data.publicMenus.query.snapshotDate ?? null);
        return;
      }

      if (spec.kind === "listings") {
        const params = new URLSearchParams();
        params.set("limit", String(limit));
        params.set("offset", String((page - 1) * limit));
        const state = asList(values.state).join(",");
        const types = asList(values.types).join(",");
        const hasMenu = asText(values.has_menu);
        if (state) params.set("state", state);
        if (types) params.set("types", types);
        if (hasMenu) params.set("has_menu", hasMenu);
        if (search) params.set("q", search);
        if (sort) params.set("sort", sort);
        params.set("dir", dir);
        const json = await cubeData(apiKey, `/listings/data?${params}`);
        const list = (Array.isArray(json.rows) ? json.rows : []) as Array<Record<string, unknown>>;
        setRows(list.map((row) => ({ ...row, listing_type: row.listing_type ?? row.type })));
        setTotal(Number(json.total ?? list.length));
        setSnapshot(typeof json.snapshot_date === "string" ? json.snapshot_date : null);
        return;
      }

      if (spec.kind === "licenses") {
        const params = new URLSearchParams();
        params.set("page", String(page));
        params.set("limit", String(limit));
        const state = asList(values.state).join(",");
        const type = asList(values.type).join(",");
        const status = asList(values.status).join(",");
        if (state) params.set("state", state);
        if (type) params.set("type", type);
        if (status) params.set("status", status);
        if (search) params.set("q", search);
        if (sort) params.set("sort", sort);
        params.set("dir", dir);
        const json = await cubeData(apiKey, `/geo/licenses?${params}`);
        const list = (Array.isArray(json.data) ? json.data : []) as Array<Record<string, unknown>>;
        setRows(list);
        setTotal(Number(json.total ?? list.length));
        setSnapshot(null);
        return;
      }

      if (spec.kind === "geo") {
        const zip = asText(values.zip) || search;
        const radius = asText(values.radius_mi) || "10";
        if (!zip) {
          setGeoPayload(null);
          setRows([]);
          setTotal(0);
          return;
        }
        const data = await gql<{ geo: { enrich: Record<string, unknown> } }>(
          apiKey,
          `query($zip:String,$radius:Float){geo{enrich(zip:$zip,radius_mi:$radius)}}`,
          { zip, radius: Number(radius) || 10 },
        );
        const payload = data.geo.enrich ?? {};
        setGeoPayload(payload);
        const layers = (payload.layers as Record<string, unknown> | undefined) ?? {};
        const n =
          GEO_SECTIONS.reduce((acc, section) => {
            const raw = section.key === "resolved" ? payload.resolved : layers[section.key];
            return acc + flattenGeoBlock(raw).length;
          }, 0);
        setRows([]);
        setTotal(n);
        return;
      }

      if (spec.kind === "tla") {
        const sid = Number(sub);
        const input: Record<string, unknown> = {
          page,
          limit,
          search: search || undefined,
          state_codes: asList(values.state_codes).join(",") || undefined,
          pillars_must_have: asList(values.pillars_must_have).join(",") || undefined,
        };
        const data = await gql<{ contactsAccounts: { list: Record<string, unknown> } }>(
          apiKey,
          `query($s:Int!,$input:JSON){contactsAccounts(subscriptionId:$s){list(input:$input)}}`,
          { s: sid, input },
        );
        const payload = data.contactsAccounts.list ?? {};
        const list = (payload.data ?? payload.accounts ?? payload.rows ?? []) as Array<Record<string, unknown>>;
        setRows(list);
        setTotal(Number(payload.total ?? payload.count ?? list.length));
        return;
      }

      if (spec.kind === "tenant" && spec.tenantField) {
        const sid = Number(sub);
        if (spec.tenantGroupBy) {
          const data = await gql<{ cube: { query: CubePage } }>(
            apiKey,
            `query($s:Int!,$g:[String!],$m:[String!],$f:JSON,$ob:String,$limit:Int){
              cube:${spec.tenantField}(subscriptionId:$s){
                query(groupBy:$g,metrics:$m,filters:$f,orderBy:$ob,orderDir:DESC,limit:$limit){count data}
              }
            }`,
            {
              s: sid,
              g: [spec.tenantGroupBy],
              m: schema?.default_metrics ?? ["revenue", "orders", "units"],
              f: values,
              ob: schema?.default_metrics?.[0],
              limit,
            },
          );
          setRows(data.cube.query.data ?? []);
          setTotal((data.cube.query as { count?: number }).count ?? data.cube.query.data?.length ?? 0);
          return;
        }
        const data = await gql<{ cube: { lines: CubePage } }>(
          apiKey,
          `query($s:Int!,$f:JSON,$page:Int,$limit:Int,$sort:String,$dir:SortDir){
            cube:${spec.tenantField}(subscriptionId:$s){
              lines(filters:$f,page:$page,limit:$limit,sort:$sort,dir:$dir){total data columns}
            }
          }`,
          { s: sid, f: values, page, limit, sort: sort || undefined, dir: dir.toUpperCase() },
        );
        setRows(data.cube.lines.data ?? []);
        setTotal(data.cube.lines.total ?? data.cube.lines.data?.length ?? 0);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Query failed.");
    } finally {
      setLoading(false);
    }
  }, [apiKey, spec, values, search, page, limit, sort, dir, sub, schema?.default_metrics]);

  useEffect(() => {
    if (spec.kind !== "tenant" || !spec.tenantField || !sub) return;
    const sid = Number(sub);
    if (!Number.isFinite(sid)) return;
    void gql<{ cube: { schema: TenantSchema } }>(
      apiKey,
      `query($s:Int!){cube:${spec.tenantField}(subscriptionId:$s){schema}}`,
      { s: sid },
    )
      .then((data) => setSchema(data.cube.schema))
      .catch(() => undefined);
  }, [apiKey, spec.kind, spec.tenantField, sub]);

  useEffect(() => {
    void loadNationalOptions();
  }, [loadNationalOptions]);

  useEffect(() => {
    void loadScopedOptions();
  }, [loadScopedOptions]);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  useEffect(() => {
    if (view !== "map") return;
    let cancelled = false;
    const loadPoints = async () => {
      setMapLoading(true);
      setMapError("");
      try {
        const fromRows = rowMapPoints(rows);
        if (spec.kind === "geo") {
          const resolved = (geoPayload?.resolved as Record<string, unknown> | undefined) ?? {};
          const lat = Number(resolved.lat);
          const lng = Number(resolved.lng);
          if (!Number.isFinite(lat) || !Number.isFinite(lng) || !lat || !lng) {
            if (!cancelled) setMapPoints([]);
            return;
          }
          const origin: MapPoint = {
            id: "origin",
            name: `ZIP ${String(resolved.zip ?? asText(values.zip) ?? "")}`.trim(),
            lat,
            lng,
          };
          const radiusKm = Math.max(1, (Number(asText(values.radius_mi) || 10) || 10) * 1.60934);
          const json = await cubeData(apiKey, `/near?lat=${lat}&lng=${lng}&radius_km=${radiusKm}&limit=200`);
          if (!cancelled) setMapPoints([origin, ...parseMapPoints(json.data ?? json.points)]);
          return;
        }
        if (spec.kind === "listings") {
          const params = new URLSearchParams();
          params.set("geo", "1");
          params.set("limit", "4000");
          const state = asList(values.state).join(",");
          const types = asList(values.types).join(",");
          const hasMenu = asText(values.has_menu);
          if (state) params.set("state", state);
          if (types) params.set("types", types);
          if (hasMenu) params.set("has_menu", hasMenu);
          if (search) params.set("q", search);
          const json = await cubeData(apiKey, `/listings/data?${params}`);
          const pts = parseMapPoints(json.points);
          if (!cancelled) setMapPoints(pts.length ? pts : fromRows);
          return;
        }
        if (spec.kind === "explore" || spec.kind === "records" || spec.kind === "query") {
          const params = filtersToSearchParams(menuFilters({ ...values, [spec.searchKey ?? "q"]: search }));
          if (spec.exploreDim) params.set("dim", spec.exploreDim);
          const json = await cubeData(apiKey, `/explore/points?${params}`);
          const pts = parseMapPoints(json.points);
          if (!cancelled) setMapPoints(pts.length ? pts : fromRows);
          return;
        }
        if (!cancelled) setMapPoints(fromRows);
      } catch (err) {
        if (!cancelled) {
          setMapError(err instanceof Error ? err.message : "Map failed.");
          setMapPoints(rowMapPoints(rows));
        }
      } finally {
        if (!cancelled) setMapLoading(false);
      }
    };
    void loadPoints();
    return () => {
      cancelled = true;
    };
  }, [apiKey, view, spec, values, search, rows, geoPayload]);

  const onSearchChange = (value: string) => {
    setSearchDraft(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setSearch(value);
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
  };

  const toggleSort = (key: string) => {
    if (sort === key) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSort(key);
      setDir(key === "name" ? "asc" : "desc");
    }
    setPage(1);
  };

  const activeChips = filters.flatMap((f) => {
    if (f.type === "range") {
      const min = asText(values[f.minKey ?? ""]);
      const max = asText(values[f.maxKey ?? ""]);
      if (!min && !max) return [];
      return [{ key: f.key, label: `${f.label} ${min || "…"}–${max || "…"}` }];
    }
    if (f.type === "enum") {
      const v = asText(values[f.key]);
      if (!v) return [];
      const lab = f.options?.find((o) => o.v === v)?.label ?? v;
      return [{ key: f.key, label: `${f.label}: ${lab}` }];
    }
    return asList(values[f.key]).map((v) => ({
      key: `${f.key}:${v}`,
      label: `${f.label}: ${options[f.facet ?? ""]?.find((o) => o.v === v)?.label ?? v}`,
      clear: () => setFilter(f.key, asList(values[f.key]).filter((x) => x !== v)),
    }));
  });

  const pages = Math.max(1, Math.ceil(total / limit));
  const needsSub = spec.gated && !sub;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b px-6 py-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <div className="mb-1 flex items-center gap-2">
              <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {spec.family}
              </span>
              {spec.gated ? (
                <span className="rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                  Connection
                </span>
              ) : null}
            </div>
            <h1 className="text-xl font-semibold tracking-tight">{spec.name}</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{spec.tagline}</p>
          </div>
          <div className="text-right text-sm tabular-nums text-muted-foreground">
            <div className="text-foreground">
              <span className="text-lg font-semibold">{total.toLocaleString("en-US")}</span>
              <span className="ml-1.5 text-muted-foreground">rows</span>
            </div>
            {snapshot ? <div className="mt-0.5 text-xs">Snapshot {snapshot}</div> : null}
          </div>
        </div>
      </div>

      <div className="border-b bg-card px-6 py-3">
        <div className="flex flex-wrap items-center gap-2">
          {spec.gated ? (
            <form
              className="flex items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                writeSub(subDraft.trim());
                setSub(subDraft.trim());
                setPage(1);
              }}
            >
              <Input
                value={subDraft}
                onChange={(e) => setSubDraft(e.target.value)}
                placeholder="Subscription ID"
                className="h-8 w-32 font-mono text-xs"
                inputMode="numeric"
              />
              <Button type="submit" size="sm" variant="outline">
                Use
              </Button>
            </form>
          ) : null}

          <Input
            value={searchDraft}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={
              spec.searchPlaceholder
                ?? (spec.searchKey === "item" ? "Product name…" : spec.kind === "geo" ? "ZIP code…" : spec.kind === "licenses" ? "License #, DBA, or city…" : "Search…")
            }
            className="h-8 w-56 text-sm"
          />

          {filters
            .filter((f) => f.type !== "search" || spec.kind === "geo")
            .filter((f) => f.type !== "search" || f.key !== spec.searchKey)
            .map((f) => (
              <FilterControl
                key={f.key}
                filter={f}
                values={values}
                options={f.facet ? options[f.facet] ?? f.options ?? [] : f.options ?? []}
                locked={Boolean(f.requires && asList(values[f.requires]).length === 0)}
                onChange={setFilter}
                onOpen={f.facet && spec.kind === "tenant" ? () => void loadTenantFacet(f.facet!) : undefined}
                onBrandQuery={
                  f.facet === "brand"
                    ? async (q) => {
                        if (q.length < 2) return;
                        try {
                          const data = await gql<{ publicMenus: { facets: { data?: Array<Record<string, unknown>> } } }>(
                            apiKey,
                            `query($q:String){publicMenus{facets(field:"brand",q:$q)}}`,
                            { q },
                          );
                          setOptions((prev) => ({
                            ...prev,
                            brand: (data.publicMenus.facets.data ?? []).map(optionLabel).filter((o) => o.v),
                          }));
                        } catch {
                          /* ignore */
                        }
                      }
                    : undefined
                }
              />
            ))}

          <select
            value={limit}
            onChange={(e) => {
              setLimit(Number(e.target.value));
              setPage(1);
            }}
            className="h-8 rounded-md border border-input bg-background px-2 text-xs text-muted-foreground"
          >
            {PAGE_SIZES.map((n) => (
              <option key={n} value={n}>
                {n} / page
              </option>
            ))}
          </select>

          {activeChips.length || searchDraft || search ? (
            <Button type="button" size="sm" variant="ghost" onClick={clearFilters}>
              Clear
            </Button>
          ) : null}
        </div>

        {activeChips.length ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {activeChips.map((chip) => (
              <button
                key={chip.key}
                type="button"
                onClick={() => {
                  if ("clear" in chip && typeof chip.clear === "function") chip.clear();
                  else setFilter(chip.key, []);
                }}
                className="inline-flex items-center gap-1 rounded-full border bg-background px-2.5 py-0.5 text-xs text-foreground"
              >
                {chip.label}
                <X className="size-3 text-muted-foreground" />
              </button>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">
            {spec.kind === "licenses"
              ? "Search license number, DBA, or city. Type and status come from the regulator file."
              : "Filters narrow from left to right. Subcategory waits on category; later options follow the current slice."}
          </p>
        )}
      </div>

      <div className="flex items-center border-b px-6">
        <ObjectViewSwitch view={view} onChange={changeView} />
      </div>

      <div className={cn("min-h-0 flex-1", view === "map" ? "overflow-hidden" : "overflow-auto")}>
        {needsSub ? (
          <div className="px-6 py-16 text-center text-sm text-muted-foreground">
            Enter a subscription ID. This object is active only with a CRM, ACC, or ERP connection.
          </div>
        ) : error && !rows.length && spec.kind !== "geo" ? (
          <div className="px-6 py-16 text-center text-sm text-destructive">{error}</div>
        ) : spec.kind === "geo" ? (
          error && !geoPayload ? (
            <div className="px-6 py-16 text-center text-sm text-destructive">{error}</div>
          ) : !geoPayload && !loading ? (
            <div className="px-6 py-16 text-center text-sm text-muted-foreground">
              Enter a 5-digit ZIP to load Census, nearby stores, and market layers.
            </div>
          ) : view === "map" ? (
            mapLoading && !mapPoints.length ? (
              <div className="px-6 py-16 text-center text-sm text-muted-foreground">Loading map…</div>
            ) : (
              <ObjectMap
                points={mapPoints}
                empty={mapError || "Enter a 5-digit ZIP to plot nearby stores."}
              />
            )
          ) : (
            <div className={cn(loading && geoPayload && "opacity-60")}>
              {loading && !geoPayload ? (
                <div className="px-6 py-16 text-center text-sm text-muted-foreground">Loading…</div>
              ) : view === "table" ? (
                <GeoListView payload={geoPayload} />
              ) : (
                <GeoEnrichView payload={geoPayload} />
              )}
            </div>
          )
        ) : view === "map" ? (
          <>
            {mapError ? <div className="border-b px-6 py-2 text-xs text-destructive">{mapError}</div> : null}
            {mapLoading && !mapPoints.length ? (
              <div className="px-6 py-16 text-center text-sm text-muted-foreground">Loading map…</div>
            ) : (
              <ObjectMap points={mapPoints} />
            )}
          </>
        ) : view === "cards" ? (
          <>
            {error ? <div className="border-b px-6 py-2 text-xs text-destructive">{error}</div> : null}
            <ObjectCards spec={spec} columns={columns} rows={rows} loading={loading} />
          </>
        ) : (
          <>
            {error ? <div className="border-b px-6 py-2 text-xs text-destructive">{error}</div> : null}
            <table className="w-full border-separate border-spacing-0 text-sm">
            <thead className="sticky top-0 z-10">
              <tr>
                {columns.map((col) => {
                  const sortable = Boolean(col.sort);
                  const on = sort === col.sort;
                  return (
                    <th
                      key={col.key}
                      className={cn(
                        "border-b bg-background/95 px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground backdrop-blur",
                        col.kind !== "text" && "text-right",
                        sortable && "cursor-pointer select-none hover:text-foreground",
                      )}
                      onClick={sortable && col.sort ? () => toggleSort(col.sort!) : undefined}
                    >
                      {col.label}
                      {on ? (dir === "asc" ? " ↑" : " ↓") : ""}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className={cn(loading && rows.length && "opacity-60")}>
              {loading && !rows.length ? (
                <tr>
                  <td colSpan={Math.max(columns.length, 1)} className="px-4 py-16 text-center text-muted-foreground">
                    Loading…
                  </td>
                </tr>
              ) : !rows.length ? (
                <tr>
                  <td colSpan={Math.max(columns.length, 1)} className="px-4 py-16 text-center text-muted-foreground">
                    No rows for this filter set.
                  </td>
                </tr>
              ) : (
                spec.id === "brand"
                  ? rows.map((row, i) => (
                      <BrandRow
                        key={String(row.id ?? i)}
                        row={row}
                        columns={columns}
                        apiKey={apiKey}
                        filters={firstMenuFilter(values)}
                      />
                    ))
                  : rows.map((row, i) => (
                      <tr key={String(row.id ?? `${row.state_code ?? ""}-${row.license_number ?? i}`)} className="hover:bg-accent/40">
                        {columns.map((col) => {
                          const identity = col.key === nameColumnKey(spec, columns);
                          return (
                          <td
                            key={col.key}
                            className={cn(
                              "border-b border-border/70 px-4 py-2.5 align-middle",
                              col.kind !== "text" && "text-right tabular-nums",
                              (col.key === "name" || identity) && "font-medium",
                            )}
                          >
                            {identity ? (
                              <div className="flex items-center gap-3">
                                <ObjectThumb row={row} spec={spec} />
                                <span>{formatCell(col.kind, row[col.key])}</span>
                              </div>
                            ) : (
                              formatCell(col.kind, row[col.key])
                            )}
                          </td>
                          );
                        })}
                      </tr>
                    ))
              )}
            </tbody>
          </table>
          </>
        )}
      </div>

      <div className={cn("flex items-center justify-between gap-3 border-t px-6 py-2.5 text-xs text-muted-foreground", view === "map" && "hidden")}>
        <span className="tabular-nums">
          Page {page} of {pages.toLocaleString("en-US")}
        </span>
        <div className="flex items-center gap-1">
          <Button type="button" size="sm" variant="ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            <ChevronLeft className="size-4" />
            Prev
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={page >= pages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function FilterControl({
  filter,
  values,
  options,
  locked,
  onChange,
  onBrandQuery,
  onOpen,
}: {
  filter: FilterDef;
  values: Values;
  options: Array<{ v: string; label: string; count?: number }>;
  locked: boolean;
  onChange: (key: string, next: string | string[]) => void;
  onBrandQuery?: (q: string) => void;
  onOpen?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const selected = asList(values[filter.key]);
  const enumVal = asText(values[filter.key]);

  if (filter.type === "range") {
    return (
      <div className="flex h-8 items-center gap-1 rounded-md border border-input bg-background px-2">
        <span className="text-[11px] text-muted-foreground">{filter.label}</span>
        <input
          value={asText(values[filter.minKey ?? ""])}
          onChange={(e) => onChange(filter.minKey ?? "", e.target.value)}
          placeholder="min"
          className="w-12 bg-transparent text-xs outline-none"
        />
        <span className="text-muted-foreground">–</span>
        <input
          value={asText(values[filter.maxKey ?? ""])}
          onChange={(e) => onChange(filter.maxKey ?? "", e.target.value)}
          placeholder="max"
          className="w-12 bg-transparent text-xs outline-none"
        />
      </div>
    );
  }

  if (filter.type === "search") {
    return (
      <Input
        value={asText(values[filter.key])}
        onChange={(e) => onChange(filter.key, e.target.value)}
        placeholder={filter.placeholder ?? filter.label}
        className="h-8 w-28 text-xs"
      />
    );
  }

  const visible = options.filter((o) => !q || o.label.toLowerCase().includes(q.toLowerCase()) || o.v.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="relative">
      <button
        type="button"
        disabled={locked}
        onClick={() => {
          setOpen((v) => {
            const next = !v;
            if (next) onOpen?.();
            return next;
          });
        }}
        className={cn(
          "inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs",
          selected.length || enumVal
            ? "border-foreground/30 bg-foreground text-background"
            : "border-input bg-background text-foreground",
          locked && "cursor-not-allowed opacity-45",
        )}
      >
        {filter.label}
        {selected.length ? <span className="tabular-nums opacity-80">{selected.length}</span> : null}
        <ChevronDown className="size-3 opacity-60" />
      </button>
      {open ? (
        <div className="absolute left-0 top-[calc(100%+6px)] z-30 w-64 rounded-md border bg-popover p-2 shadow-lg">
          {filter.type === "enum" ? (
            <div className="flex flex-col">
              {(filter.options ?? []).map((o) => (
                <button
                  key={o.v || "any"}
                  type="button"
                  className={cn(
                    "rounded px-2 py-1.5 text-left text-sm hover:bg-accent",
                    enumVal === o.v && "bg-accent font-medium",
                  )}
                  onClick={() => {
                    onChange(filter.key, o.v);
                    setOpen(false);
                  }}
                >
                  {o.label}
                </button>
              ))}
            </div>
          ) : (
            <>
              <input
                autoFocus
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  onBrandQuery?.(e.target.value);
                }}
                placeholder={locked ? `Select ${filter.requires} first` : "Filter…"}
                className="mb-2 h-8 w-full rounded border border-input bg-background px-2 text-xs outline-none"
              />
              <div className="max-h-56 overflow-auto">
                {visible.length === 0 ? (
                  <div className="px-2 py-6 text-center text-xs text-muted-foreground">No options in this slice.</div>
                ) : (
                  visible.slice(0, 80).map((o) => {
                    const on = selected.includes(o.v);
                    return (
                      <label key={o.v} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent">
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() =>
                            onChange(filter.key, on ? selected.filter((x) => x !== o.v) : [...selected, o.v])
                          }
                        />
                        <span className="min-w-0 flex-1 truncate">{o.label}</span>
                        {o.count != null ? (
                          <span className="tabular-nums text-[11px] text-muted-foreground">{o.count.toLocaleString("en-US")}</span>
                        ) : null}
                      </label>
                    );
                  })
                )}
              </div>
            </>
          )}
        </div>
      ) : null}
      {open ? <button type="button" className="fixed inset-0 z-20 cursor-default" onClick={() => setOpen(false)} aria-label="Close" /> : null}
    </div>
  );
}
