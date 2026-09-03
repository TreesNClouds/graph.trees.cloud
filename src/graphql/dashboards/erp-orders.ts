import { inputOf, svc, svcParent } from '../proxy';
import type { CubeModule, Ctx, SvcArgs, SvcParent } from '../types';

/** ERP Orders V2 — dashboard_erp_ops board, aggregates, forecasting. */
export const erpOrders: CubeModule = {
  queryFields: `
  """ERP Orders V2 — dashboard_erp_ops order board + aggregates + forecasting."""
  erpOrders(subscriptionId: Int!): ErpOrdersCube!
`,
  resolvers: {
    Query: {
      erpOrders: (_p: unknown, a: { subscriptionId: number }, ctx: Ctx) => svcParent(ctx, a.subscriptionId),
    },
    ErpOrdersCube: {
      board: (p: SvcParent, a: SvcArgs) => svc('GET', 'dashboard-erp-ops', p, '/orders-cube', { query: inputOf(a) }),
      recent: (p: SvcParent, a: SvcArgs) => svc('GET', 'dashboard-erp-ops', p, '/orders-cube/recent', { query: inputOf(a) }),
      aggregatesByMarket: (p: SvcParent, a: SvcArgs) => svc('GET', 'dashboard-erp-ops', p, '/orders/aggregates-cube/by-market', { query: inputOf(a) }),
      aggregatesByPlatform: (p: SvcParent, a: SvcArgs) => svc('GET', 'dashboard-erp-ops', p, '/orders/aggregates-cube/by-platform', { query: inputOf(a) }),
      aggregatesByPlatformInstance: (p: SvcParent, a: SvcArgs) => svc('GET', 'dashboard-erp-ops', p, '/orders/aggregates-cube/by-platform-instance', { query: inputOf(a) }),
      aggregatesByBrand: (p: SvcParent, a: SvcArgs) => svc('GET', 'dashboard-erp-ops', p, '/orders/aggregates-cube/by-brand', { query: inputOf(a) }),
      aggregatesByRetailer: (p: SvcParent, a: SvcArgs) => svc('GET', 'dashboard-erp-ops', p, '/orders/aggregates-cube/by-retailer', { query: inputOf(a) }),
      aggregatesBySku: (p: SvcParent, a: SvcArgs) => svc('GET', 'dashboard-erp-ops', p, '/orders/aggregates-cube/by-sku', { query: inputOf(a) }),
      productionForecasting: (p: SvcParent, a: SvcArgs) => svc('GET', 'dashboard-erp-ops', p, '/production-forecasting-cube', { query: inputOf(a) }),
    },
  },
  typeDefs: /* GraphQL */ `
"""ERP Orders V2 — dashboard_erp_ops order board, aggregates, forecasting."""
type ErpOrdersCube {
  "Order-grain board (ClickHouse)."
  board(input: JSON): JSON
  "Recent orders."
  recent(input: JSON): JSON
  aggregatesByMarket(input: JSON): JSON
  aggregatesByPlatform(input: JSON): JSON
  aggregatesByPlatformInstance(input: JSON): JSON
  aggregatesByBrand(input: JSON): JSON
  aggregatesByRetailer(input: JSON): JSON
  aggregatesBySku(input: JSON): JSON
  "Inventory + ERP fact demand forecasting."
  productionForecasting(input: JSON): JSON
}
`,
};
