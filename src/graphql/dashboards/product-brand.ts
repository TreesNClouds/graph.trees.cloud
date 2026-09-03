import { enc, inputOf, svc, svcParent } from '../proxy';
import type { CubeModule, Ctx, SvcArgs, SvcParent } from '../types';

/** Product & Brand Performance V2 — menu_cube products / brands. */
export const productBrand: CubeModule = {
  queryFields: `
  """Product & Brand Performance V2 — menu_cube products/brands."""
  productBrandPerformance(subscriptionId: Int!): ProductBrandPerformanceCube!
`,
  resolvers: {
    Query: {
      productBrandPerformance: (_p: unknown, a: { subscriptionId: number }, ctx: Ctx) => svcParent(ctx, a.subscriptionId),
    },
    ProductBrandPerformanceCube: {
      products: (p: SvcParent, a: SvcArgs) => svc('POST', 'search-pg', p, '/products-cube', { body: inputOf(a) }),
      productCategorySankey: (p: SvcParent, a: SvcArgs) => svc('POST', 'search-pg', p, '/products-cube/category-sankey', { body: inputOf(a) }),
      brands: (p: SvcParent, a: SvcArgs) => svc('POST', 'search-pg', p, '/brands-cube', { body: inputOf(a) }),
      brandDetail: (p: SvcParent, a: SvcArgs) => svc('GET', 'search-pg', p, `/brands-cube/${enc(a.brandKey)}`, { query: inputOf(a) }),
    },
  },
  typeDefs: /* GraphQL */ `
"""Product & Brand Performance V2 (menu_cube)."""
type ProductBrandPerformanceCube {
  "Paginated product leaderboard / search."
  products(input: JSON): JSON
  "Product → category sankey flows."
  productCategorySankey(input: JSON): JSON
  "Paginated brand leaderboard / search."
  brands(input: JSON): JSON
  "Single brand detail by brand key."
  brandDetail(brandKey: String!, input: JSON): JSON
}
`,
};
