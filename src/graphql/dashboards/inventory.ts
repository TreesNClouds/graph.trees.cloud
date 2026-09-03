import { inputOf, svc, svcParent } from '../proxy';
import type { CubeModule, Ctx, SvcArgs, SvcParent } from '../types';

/** Inventory Reports V2 — menu_cube IS / LS / OOS / WB. */
export const inventory: CubeModule = {
  queryFields: `
  """Inventory Reports V2 — menu_cube IS/LS/OOS/WB reports."""
  inventoryReports(subscriptionId: Int!): InventoryReportsCube!
`,
  resolvers: {
    Query: {
      inventoryReports: (_p: unknown, a: { subscriptionId: number }, ctx: Ctx) => svcParent(ctx, a.subscriptionId),
    },
    InventoryReportsCube: {
      summary: (p: SvcParent, a: SvcArgs) => svc('POST', 'search-pg', p, '/inventory-reports-cube/summary', { body: inputOf(a) }),
      listings: (p: SvcParent, a: SvcArgs) => svc('POST', 'search-pg', p, '/inventory-reports-cube/listings', { body: inputOf(a) }),
      products: (p: SvcParent, a: SvcArgs) => svc('POST', 'search-pg', p, '/inventory-reports-cube/products', { body: inputOf(a) }),
    },
  },
  typeDefs: /* GraphQL */ `
"""Inventory Reports V2 — menu_cube IS/LS/OOS/WB."""
type InventoryReportsCube {
  summary(input: JSON): JSON
  listings(input: JSON): JSON
  products(input: JSON): JSON
}
`,
};
