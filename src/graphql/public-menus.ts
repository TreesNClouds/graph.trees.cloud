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
  "Weight unit label on the listing."
  weight_unit
  "THC unit label on the listing."
  thc_unit
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
  "Average THC potency."
  avg_thc
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
  thc_min: Float
  thc_max: Float
  price_min: Float
  price_max: Float
  weight_min: Float
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
Public Menus — nationwide dispensary menu analytics (Trees N Clouds public data).
Retailers, brands, products, categories, and geo. Grain: one product-listing
line per store per day on the latest published snapshot.
"""
type PublicMenusCube {
  "Snapshot-wide headline totals: stores, brands, SKUs, states, listings, …."
  meta: JSON!
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
  price when on sale, else the list price) and \`discount_pct\` (percent off, 25 = 25%
  off; null when not on sale).
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
