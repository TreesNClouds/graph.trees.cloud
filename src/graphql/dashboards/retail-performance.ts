import { enc, inputOf, svc, svcParent } from '../proxy';
import type { CubeModule, Ctx, SvcArgs, SvcParent } from '../types';

/** Retail Performance V2 — menu_cube retailer search / detail / assortment. */
export const retailPerformance: CubeModule = {
  queryFields: `
  """Retail Performance V2 — menu_cube retailer search/detail."""
  retailPerformance(subscriptionId: Int!): RetailPerformanceCube!
`,
  resolvers: {
    Query: {
      retailPerformance: (_p: unknown, a: { subscriptionId: number }, ctx: Ctx) => svcParent(ctx, a.subscriptionId),
    },
    RetailPerformanceCube: {
      facets: (p: SvcParent, a: SvcArgs) => svc('GET', 'search-pg', p, '/retailers-cube/facets', { query: inputOf(a) }),
      list: (p: SvcParent, a: SvcArgs) => svc('POST', 'search-pg', p, '/retailers-cube', { body: inputOf(a) }),
      detail: (p: SvcParent, a: SvcArgs) => svc('GET', 'search-pg', p, `/retailers-cube/${enc(a.canonicalAccountId)}`, { query: inputOf(a) }),
      competitors: (p: SvcParent, a: SvcArgs) => svc('GET', 'search-pg', p, `/retailers-cube/${enc(a.canonicalAccountId)}/competitors`, { query: inputOf(a) }),
      products: (p: SvcParent, a: SvcArgs) => svc('GET', 'search-pg', p, `/retailers-cube/${enc(a.canonicalAccountId)}/products`, { query: inputOf(a) }),
      topPerformers: (p: SvcParent, a: SvcArgs) => svc('GET', 'search-pg', p, `/retailers-cube/${enc(a.canonicalAccountId)}/top-performers`, { query: inputOf(a) }),
      deals: (p: SvcParent, a: SvcArgs) => svc('GET', 'search-pg', p, `/retailers-cube/${enc(a.canonicalAccountId)}/deals`, { query: inputOf(a) }),
      brands: (p: SvcParent, a: SvcArgs) => svc('GET', 'search-pg', p, `/retailers-cube/${enc(a.canonicalAccountId)}/brands`, { query: inputOf(a) }),
      productLocations: (p: SvcParent, a: SvcArgs) => svc('GET', 'search-pg', p, '/retailers-cube/product-locations', { query: inputOf(a) }),
    },
  },
  typeDefs: /* GraphQL */ `
"""
V2 dashboard cube surfaces. Each field proxies its internal REST handler and
returns that handler's exact JSON envelope (typically \`{ data, meta,
snapshot_date, source, ... }\`). \`input\` is forwarded as the handler's POST body
(or as the GET query string for detail / aggregate reads). All surfaces are
subscription-gated: your key must be allowed to read \`subscriptionId\`.
"""
type RetailPerformanceCube {
  "Facet counts for retailer search (menu_cube)."
  facets(input: JSON): JSON
  "Paginated retailer leaderboard / search."
  list(input: JSON): JSON
  "Single retailer detail by canonical account id."
  detail(canonicalAccountId: String!, input: JSON): JSON
  "Nearby competitor retailers for a retailer."
  competitors(canonicalAccountId: String!, input: JSON): JSON
  "Products carried by a retailer."
  products(canonicalAccountId: String!, input: JSON): JSON
  "Top-performing products for a retailer."
  topPerformers(canonicalAccountId: String!, input: JSON): JSON
  "Active deals for a retailer."
  deals(canonicalAccountId: String!, input: JSON): JSON
  "Brands carried by a retailer."
  brands(canonicalAccountId: String!, input: JSON): JSON
  "Geo locations for a product across retailers."
  productLocations(input: JSON): JSON
}
`,
};
