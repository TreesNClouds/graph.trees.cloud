import { requireKey } from './context';
import { menuGet, menuGetRaw } from './proxy';
import { toPage, toResult } from './shared';
import type { CubeModule, Ctx } from './types';

function publicMenusParent(_p: unknown, _a: unknown, ctx: Ctx) {
  requireKey(ctx);
  return {};
}

/**
 * Public Menus — nationwide dispensary menu analytics.
 * Grain: one product-listing line per store per day on the latest snapshot.
 */
export const publicMenus: CubeModule = {
  queryFields: `
  """Public Menus — nationwide dispensary menu analytics (preferred full name)."""
  publicMenus: PublicMenusCube!
  """Alias of publicMenus (prefer publicMenus)."""
  public: PublicMenusCube! @deprecated(reason: "Use publicMenus")
`,
  resolvers: {
    Query: {
      publicMenus: publicMenusParent,
      public: publicMenusParent,
    },
    PublicMenusCube: {
      meta: () => menuGet('/meta', {}),
      publish: async () => {
        const j = await menuGet('/publish', {});
        return {
          snapshotDate: j.snapshot_date, publishedAt: j.published_at ?? null, publishSeq: j.publish_seq ?? null,
          buildStartsLocal: j.build_starts_local, buildTimeZone: j.build_tz,
          nextSnapshotDate: j.next_snapshot_date, nextBuildStartsAt: j.next_build_starts_at,
          typicalPublishLagMinutes: j.typical_publish_lag_minutes ?? null,
          nextExpectedAt: j.next_expected_at ?? null, overdue: j.overdue ?? null,
        };
      },
      facets: (_p: unknown, a: { field?: string; q?: string }) => menuGet('/facets', { field: a.field, q: a.q }),
      query: async (_p: unknown, a: Record<string, unknown>) => {
        const f = (a.filters as Record<string, unknown>) ?? {};
        const j = await menuGet('/query', {
          group_by: (a.groupBy as string[])?.join(','),
          metrics: (a.metrics as string[])?.join(','),
          order_by: a.orderBy, order_dir: a.orderDir, limit: a.limit, ...f,
        });
        return toResult(j);
      },
      explore: async (_p: unknown, a: Record<string, unknown>) => {
        const f = (a.filters as Record<string, unknown>) ?? {};
        const j = await menuGet('/explore', { format: 'json', dim: a.dim, sort: a.sort, dir: a.dir, page: a.page, limit: a.limit, ...f });
        return toPage(j);
      },
      records: async (_p: unknown, a: Record<string, unknown>) => {
        const f = (a.filters as Record<string, unknown>) ?? {};
        const j = await menuGet('/records', { dim: a.dim, tab: a.tab, sort: a.sort, dir: a.dir, page: a.page, limit: a.limit, ...f });
        return toPage(j);
      },
      near: async (_p: unknown, a: Record<string, unknown>) => toResult(await menuGet('/near', { lat: a.lat, lng: a.lng, radius_km: a.radiusKm, limit: a.limit })),
      search: async (_p: unknown, a: Record<string, unknown>) => toResult(await menuGet('/search', { q: a.q, type: a.type, state: a.state, limit: a.limit })),
      data: (_p: unknown, a: { path: string }) => menuGetRaw(a.path),
    },
  },
  typeDefs: /* GraphQL */ `
"""
Public Menus group-by dimensions. Every menu line can be grouped by any of
these. \`brand_id\` / \`account_id\` are the CANONICAL rollup ids (deduped across
sources — never listing fan-out).
"""
enum MenuDim {
  "Two-letter US state (e.g. CA)."
  state
  "Country code."
  country
  "City name."
  city
  "Postal / ZIP code."
  zip
  "Canonical product category (e.g. Flower, Edible, Vapes)."
  category
  "Canonical subcategory (e.g. Gummies within Edible)."
  subcategory
  "Genetics: indica | sativa | hybrid."
  genetics
  "Unit of \`weight_value\` on the listing: g | mg | oz | lb | ml | fl_oz | each, blank when the source gave none."
  weight_unit
  "Unit of \`thc_value\`: pct (percent of the product) | mg (milligrams per package) | blank when it cannot be told."
  thc_unit
  "Unit of \`cbd_value\`, same values as thc_unit."
  cbd_unit
  "What \`weight_value\` measures: single | per_piece | pack_total | unknown (see MenuRecordColumn.weight_basis)."
  weight_basis
  "What \`price\` buys: package | per_gram | unknown (see MenuRecordColumn.price_unit)."
  price_unit
  "How the shop states prices: tax_included | pre_tax | unknown (see MenuRecordColumn.tax_basis)."
  tax_basis
  "Canonical brand id (preferred for joins / deep links)."
  brand_id
  "Brand display name."
  brand_name
  "Canonical retailer / account id."
  account_id
  "Listing / product display name."
  listing_name
  "License type on the retailer."
  license_type
  "Listing type classification."
  listing_type
}

"""
Public Menus object pages for \`explore\` / \`records\` — the thing each row
represents. Distinct from MenuDim (raw group-by columns): an object rollup
collapses line-items to one row per object.
"""
enum MenuObject {
  "Dispensary / retailer accounts."
  retailers
  "Canonical brands."
  brands
  "Cross-store products (name-core grain)."
  products
  "Product categories."
  categories
  "Product subcategories."
  subcategories
  "US states."
  states
}

"""
Public Menus metrics. \`products\` counts distinct SKUs (canonical brand +
name-core). \`revenue\` is modeled daily $ (imputed velocity × price) — ranking
only; headline retailer revenue stays on the benchmark lane.
"""
enum MenuMetric {
  "Raw fact rows in the selection."
  rows
  "Distinct retailers / stores."
  stores
  "Distinct canonical brands."
  brands
  "Distinct product SKUs."
  products
  "Modeled daily revenue $ (ranking)."
  revenue
  "Average revenue per store / object."
  avg_revenue
  "Imputed sell-through velocity."
  velocity
  "Average listing price."
  avg_price
  "Minimum listing price."
  min_price
  "Maximum listing price."
  max_price
  "Lines on sale: sale_amount (the discounted price) is above 0 and under the list price."
  on_sale
  "Average price paid: the sale price when a line is on sale, else the list price ($)."
  avg_net_price
  "Average percent off the list price across the lines on sale (25 = 25% off)."
  avg_discount_pct
  "In-stock listing count."
  in_stock
  "Low-stock listing count (qty 1–5)."
  low_stock
  "Out-of-stock listing count."
  out_of_stock
  "Win-back listing count (was OOS, recently returned)."
  winback
  "Alias of winback."
  win_back
  "Inventory unit estimate."
  inventory
  "Average thc_value over every line, whatever its thc_unit (mg and percent mixed). Prefer avg_thc_pct."
  avg_thc
  """
  Average thc_value over the lines whose thc_unit is pct and whose figure is 0–100. Snapshots
  built before the dose rule label every figure pct, so until then dosed products whose mg
  figure is 100 or less (a 10 mg gummy) are still counted; pair with category to stay within
  flower, vapes and concentrates.
  """
  avg_thc_pct
}

"""Typed filters for the Public Menus cube (all optional; combine freely)."""
input MenuFilters {
  "Two-letter state, e.g. CA."
  state: String
  "Canonical category (e.g. Flower, Edible, Vapes)."
  category: String
  "Canonical subcategory (e.g. Gummies)."
  subcategory: String
  "indica | sativa | hybrid."
  genetics: String
  "Canonical brand id (preferred; exact match)."
  brand_id: String
  "Brand name contains (ILIKE)."
  brand: String
  "Product name contains (ILIKE)."
  item: String
  "Only in-stock line-items."
  in_stock: Boolean
  "Minimum thc_value. thc_value is in its own unit (thc_unit), so pair with category to stay within one unit."
  thc_min: Float
  "Maximum thc_value (see thc_min)."
  thc_max: Float
  "Minimum list price (USD)."
  price_min: Float
  "Maximum list price (USD)."
  price_max: Float
  "Minimum weight_value, in the listing's own weight_unit."
  weight_min: Float
  "Maximum weight_value (see weight_min)."
  weight_max: Float
  "Radius search: latitude (requires lng + radiusKm)."
  lat: Float
  "Radius search: longitude (requires lat + radiusKm)."
  lng: Float
  "Radius search: kilometers from the point."
  radius_km: Float
  "Product-name must-include keywords."
  kw: [String!]
  "Product-name must-exclude keywords."
  kw_not: [String!]
}

"""
The columns of a Public Menus record row (\`records\` and the \`items\` of
\`data(path: "/store/<id>")\`), with what each one means and its unit. Rows are
JSON keyed by these names; this enum is their documentation.
"""
enum MenuRecordColumn {
  "List price of the package in USD, as the menu shows it before any sale. See price_unit and tax_basis for what it covers."
  price
  "Discounted price of the package in USD, 0 when the line is not on sale. Set only when it is below price and at least 10% of it."
  sale_amount
  "Price paid in USD: sale_amount when the line is on sale, else price."
  net_price
  "Percent off the list price (25 = 25% off), null when not on sale."
  discount_pct
  """
  What price buys. package: the package the size fields describe. per_gram: a deli or
  bulk listing weighed out to order and sized at 1 g, so price is a per-gram rate rather
  than a 1 g package. unknown: the listing has no resolved size, so it cannot be told.
  Read from the source's own deli/bulk labels, the item name and the unit standard.
  """
  price_unit
  """
  How the shop states its prices, from the shop's own statement in its menu name; the same
  value on every line of the shop, and on the store header of \`data(path: "/store/<id>")\`.
  tax_included: "tax(es) included", "tax inclusive", "out the door", "OTD". pre_tax: "tax(es)
  not included", "pre-tax", "plus tax", "+ tax". unknown: no statement, or an excise-only
  one ("excise tax included": sales tax is still added). No source we read carries a
  per-menu tax setting, so most shops are unknown.
  """
  tax_basis
  "The listing's own size number, as the source gave it. Its unit is weight_unit; whether it is one piece or the whole pack is weight_basis."
  weight_value
  "Unit of weight_value: g | mg | oz | lb | ml | fl_oz | each, blank when the source gave none. mg on an edible is usually the THC dose, not a mass."
  weight_unit
  """
  What weight_value measures, found by reconciling it with the unit standard
  (unit_weight_g × unit_count = package_weight_g). single: a one-piece package, so it
  is both. per_piece: a multipack and the weight is one piece ("0.7g each | 3pk" → 0.7).
  pack_total: a multipack and the weight is the whole pack. unknown: no mass, or the
  weight matches neither (the honest default: nothing is guessed).
  """
  weight_basis
  "Pieces in the package, 1 for a single item. Derived from the source's pack field or the item name/size (5pk, 10x0.5g); may be absent: null when weight_basis is unknown."
  unit_count
  "Mass of one piece in grams, derived from the item name/size; may be absent. Null when weight_basis is unknown, so a size that does not reconcile is never published."
  unit_weight_g
  "Mass of the whole package in grams (unit_weight_g × unit_count), derived from the item name/size; may be absent. Null when weight_basis is unknown."
  package_weight_g
  "Pieces as the source's own pack field or an Npk in the name gives it; 0 when it gives none or 1. Prefer unit_count."
  pack_count
  "THC figure as the source gave it. Its unit is thc_unit."
  thc_value
  """
  Unit of thc_value. pct: percent of the product's weight (flower, vapes, concentrates).
  mg: milligrams for the package (edibles, drinks, tinctures and other dosed products), set
  when the figure is over 100 or equals the dose stated on the item. Blank when the
  source gave no figure, or a dosed product's figure cannot be told apart. Snapshots built
  before this rule is switched on label every figure pct.
  """
  thc_unit
  "CBD figure as the source gave it. Its unit is cbd_unit."
  cbd_value
  "Unit of cbd_value, same rule as thc_unit."
  cbd_unit
  """
  Canonical category (Flower, Vape Pens, Edibles, Pre Roll, …). Resolved from the
  source's own category label through the canonical category vocabulary; a cross-platform
  name consensus outranks the label only when at least two platforms agree on that category.
  """
  category
  "Canonical subcategory within category."
  subcategory
}

"""
When the Public Menus snapshot was published and when the next one is due. The cube is
rebuilt once a day: snapshot D is built by the nightly that starts at buildStartsLocal
(buildTimeZone, so the UTC time moves with daylight saving) on day D from the menus scraped
on day D-1. Only a build that passes its checks is published; a failed build publishes
nothing and the previous snapshot keeps being served. A repaired build publishes the same
day again with a higher publishSeq.
"""
type MenuPublish {
  "The latest published snapshot (YYYY-MM-DD), from the publish log."
  snapshotDate: String!
  "When that snapshot was last published (ISO 8601, UTC). Null if it predates the publish log."
  publishedAt: String
  "1 for the day's first publish; higher when the same day was rebuilt and republished. Re-read when it changes."
  publishSeq: Int
  "When the nightly build starts each day, in buildTimeZone (HH:MM)."
  buildStartsLocal: String!
  "IANA time zone of buildStartsLocal (America/Los_Angeles)."
  buildTimeZone: String!
  "The snapshot that comes next (snapshotDate + 1 day)."
  nextSnapshotDate: String!
  "When the build for nextSnapshotDate starts (ISO 8601, UTC)."
  nextBuildStartsAt: String!
  "How long builds take to publish: the 90th percentile of the last 28 days' first publishes, in minutes after that day's build start."
  typicalPublishLagMinutes: Int
  "When nextSnapshotDate is due: nextBuildStartsAt plus typicalPublishLagMinutes (ISO 8601, UTC)."
  nextExpectedAt: String
  "True once nextExpectedAt has passed without that snapshot (late or failed, not just unchanged); false before; null when there is no publish history to measure from."
  overdue: Boolean
}

"""
Public Menus — nationwide dispensary menu analytics (Trees N Clouds public data).
Retailers, brands, products, categories, and geo. Grain: one product-listing
line per store per day on the latest published snapshot.
"""
type PublicMenusCube {
  "Snapshot-wide headline totals: stores, brands, SKUs, states, listings, …."
  meta: JSON!
  """
  Snapshot publish signal: which snapshot is served, when it was published, and when
  the next one is due. Cheap; poll it instead of re-reading data to detect a new day.
  """
  publish: MenuPublish!
  """
  Distinct filter values with counts. \`field\`=brand returns canonical-brand
  type-ahead options; omit \`field\` to get states/categories/subcategories/genetics.
  """
  facets(field: String, q: String): JSON!
  "Universal analytics grammar: groupBy × metrics × filters (enums UNQUOTED)."
  query(groupBy: [MenuDim!], metrics: [MenuMetric!], orderBy: String, orderDir: SortDir, limit: Int, filters: MenuFilters): CubeResult!
  """
  Aggregated object rollup for one dimension (the /explore page data): each row is
  one object (retailer/brand/product/…) with its SKUs, stores, revenue, etc.
  """
  explore(dim: MenuObject!, filters: JSON, sort: String, dir: SortDir, page: Int, limit: Int): CubePage!
  """
  Flat, fully-normalized records (one row per line-item) grouped into column-group
  tabs. \`tab\` picks the tab (retailer/product/potency/pricing/inventory/…).
  The \`pricing\` tab carries \`price\` (list price of the package), \`sale_amount\`
  (the discounted price, 0 when there is no sale), \`net_price\` (price paid: the sale
  price when on sale, else the list price), \`discount_pct\` (percent off, 25 = 25%
  off; null when not on sale), \`price_unit\` and \`tax_basis\`. The \`potency\` tab
  carries the size and potency fields. Every column is documented on MenuRecordColumn.
  """
  records(dim: MenuObject, tab: String, filters: JSON, sort: String, dir: SortDir, page: Int, limit: Int): CubePage!
  "Stores within radiusKm of a lat/lng point (H3-accelerated)."
  near(lat: Float!, lng: Float!, radiusKm: Float, limit: Int): CubeResult!
  "Free-text search. \`type\` = product | brand | store. Always select subfields on CubeResult."
  search(q: String!, type: String, state: String, limit: Int): CubeResult!
  """
  Internal page-data passthrough for Trees Cloud cube dashboards — returns the
  exact JSON of a whitelisted Public Menus GET path. Prefer typed fields above
  for programmatic API use.
  """
  data(path: String!): JSON!
}
`,
};
