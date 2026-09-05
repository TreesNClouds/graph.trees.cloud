import { inputOf, svc, svcParent } from '../proxy';
import type { CubeModule, Ctx, SvcArgs, SvcParent } from '../types';

/** Market Share V2 — menu_cube retailer / geo share. */
export const marketShare: CubeModule = {
  queryFields: `
  """Market Share V2 — menu_cube market-share."""
  marketShare(subscriptionId: Int!): MarketShareCube!
`,
  resolvers: {
    Query: {
      marketShare: (_p: unknown, a: { subscriptionId: number }, ctx: Ctx) => svcParent(ctx, a.subscriptionId),
    },
    MarketShareCube: {
      summary: (p: SvcParent, a: SvcArgs) => svc('POST', 'search-pg', p, '/market-share-cube/summary', { body: inputOf(a) }),
      retailers: (p: SvcParent, a: SvcArgs) => svc('POST', 'search-pg', p, '/market-share-cube/retailers', { body: inputOf(a) }),
      retailerBreakdown: (p: SvcParent, a: SvcArgs) => svc('POST', 'search-pg', p, '/market-share-cube/retailer-breakdown', { body: inputOf(a) }),
      analytics: (p: SvcParent, a: SvcArgs) => svc('POST', 'search-pg', p, '/market-share-cube/analytics', { body: inputOf(a) }),
      geo: (p: SvcParent, a: SvcArgs) => svc('POST', 'search-pg', p, '/market-share-cube/geo', { body: inputOf(a) }),
    },
  },
  typeDefs: /* GraphQL */ `
"""Market Share V2 (menu_cube)."""
type MarketShareCube {
  summary(input: JSON): JSON
  retailers(input: JSON): JSON
  retailerBreakdown(input: JSON): JSON
  analytics(input: JSON): JSON
  geo(input: JSON): JSON
}
`,
};
