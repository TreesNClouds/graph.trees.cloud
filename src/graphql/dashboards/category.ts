import { inputOf, svc, svcParent } from '../proxy';
import type { CubeModule, Ctx, SvcArgs, SvcParent } from '../types';

/** Category Performance V2 — menu_cube categories / markets / treemap. */
export const category: CubeModule = {
  queryFields: `
  """Category Performance V2 — menu_cube categories/markets."""
  categoryPerformance(subscriptionId: Int!): CategoryPerformanceCube!
`,
  resolvers: {
    Query: {
      categoryPerformance: (_p: unknown, a: { subscriptionId: number }, ctx: Ctx) => svcParent(ctx, a.subscriptionId),
    },
    CategoryPerformanceCube: {
      summary: (p: SvcParent, a: SvcArgs) => svc('POST', 'search-pg', p, '/categories-cube/summary', { body: inputOf(a) }),
      markets: (p: SvcParent, a: SvcArgs) => svc('POST', 'search-pg', p, '/categories-cube/markets', { body: inputOf(a) }),
      categories: (p: SvcParent, a: SvcArgs) => svc('POST', 'search-pg', p, '/categories-cube/categories', { body: inputOf(a) }),
      subcategories: (p: SvcParent, a: SvcArgs) => svc('POST', 'search-pg', p, '/categories-cube/subcategories', { body: inputOf(a) }),
      categoryBrands: (p: SvcParent, a: SvcArgs) => svc('POST', 'search-pg', p, '/categories-cube/category-brands', { body: inputOf(a) }),
      treemap: (p: SvcParent, a: SvcArgs) => svc('POST', 'search-pg', p, '/categories-cube/treemap', { body: inputOf(a) }),
      trend: (p: SvcParent, a: SvcArgs) => svc('POST', 'search-pg', p, '/categories-cube/trend', { body: inputOf(a) }),
    },
  },
  typeDefs: /* GraphQL */ `
"""Category Performance V2 (menu_cube)."""
type CategoryPerformanceCube {
  summary(input: JSON): JSON
  markets(input: JSON): JSON
  categories(input: JSON): JSON
  subcategories(input: JSON): JSON
  categoryBrands(input: JSON): JSON
  treemap(input: JSON): JSON
  trend(input: JSON): JSON
}
`,
};
