import { GraphQLError } from 'graphql';
import {
  cubeSchema,
  runCubeMeta,
  runCubeFacets,
  runCubeQuery,
  runCubeLines,
  CubeNotLoadedError,
  CubeBadRequestError,
  type CubeConfig,
} from '@/routes/_lib/cube-router';
import { config as erpConfig } from '@/routes/erp-cube';
import { config as accConfig } from '@/routes/acc-cube';
import { config as crmConfig } from '@/routes/crm-cube';
import { config as posConfig } from '@/routes/pos-cube';
import { gateSubscription } from './context';
import type { CubeModule, Ctx } from './types';

const TENANT: Record<string, CubeConfig> = { erp: erpConfig, acc: accConfig, crm: crmConfig, pos: posConfig };

interface TenantParent { cfg: CubeConfig; sub: number }

function tenantParent(
  cube: 'erp' | 'acc' | 'crm' | 'pos',
  subscriptionId: number,
  ctx: Ctx,
): TenantParent {
  return { cfg: TENANT[cube]!, sub: gateSubscription(ctx, subscriptionId) };
}

async function guard<T>(p: Promise<T>): Promise<T> {
  try {
    return await p;
  } catch (err) {
    if (err instanceof CubeNotLoadedError) throw new GraphQLError(err.message, { extensions: { code: 'CUBE_NOT_LOADED' } });
    if (err instanceof CubeBadRequestError) throw new GraphQLError(err.message, { extensions: { code: 'BAD_USER_INPUT' } });
    if (err instanceof GraphQLError) throw err;
    throw new GraphQLError((err as Error).message, { extensions: { code: 'INTERNAL' } });
  }
}

function tenantResult(o: Record<string, unknown>): Record<string, unknown> {
  return { snapshotDate: o.snapshot_date, groupBy: o.group_by, metrics: o.metrics, count: o.rows, data: o.data };
}

function tenantPage(o: Record<string, unknown>): Record<string, unknown> {
  return { snapshotDate: o.snapshot_date, total: o.total, page: o.page, perPage: o.per_page, sort: o.sort, columns: o.columns, tabs: null, data: o.data };
}

/**
 * Subscription-gated tenant cubes (ERP / ACC / CRM / POS). Shared TenantCube
 * shape — call \`schema\` first to discover dims / metrics / filters / columns.
 */
export const tenantCubes: CubeModule = {
  queryFields: `
  """Enterprise Resource Planning — wholesale order-line cube (subscription-gated). Preferred full name."""
  enterpriseResourcePlanning(subscriptionId: Int!): TenantCube!
  """Alias of enterpriseResourcePlanning (prefer enterpriseResourcePlanning)."""
  erp(subscriptionId: Int!): TenantCube! @deprecated(reason: "Use enterpriseResourcePlanning")

  """Accounting — invoice-line cube (subscription-gated). Preferred full name."""
  accounting(subscriptionId: Int!): TenantCube!
  """Alias of accounting (prefer accounting)."""
  acc(subscriptionId: Int!): TenantCube! @deprecated(reason: "Use accounting")

  """Customer Relationship Management — tasks / activities cube (subscription-gated). Preferred full name."""
  customerRelationshipManagement(subscriptionId: Int!): TenantCube!
  """Alias of customerRelationshipManagement (prefer customerRelationshipManagement)."""
  crm(subscriptionId: Int!): TenantCube! @deprecated(reason: "Use customerRelationshipManagement")

  """Point of Sale — retail transaction-item cube (subscription-gated). Preferred full name."""
  pointOfSale(subscriptionId: Int!): TenantCube!
  """Alias of pointOfSale (prefer pointOfSale)."""
  pos(subscriptionId: Int!): TenantCube! @deprecated(reason: "Use pointOfSale")
`,
  resolvers: {
    Query: {
      enterpriseResourcePlanning: (_p: unknown, a: { subscriptionId: number }, ctx: Ctx) =>
        tenantParent('erp', a.subscriptionId, ctx),
      erp: (_p: unknown, a: { subscriptionId: number }, ctx: Ctx) =>
        tenantParent('erp', a.subscriptionId, ctx),
      accounting: (_p: unknown, a: { subscriptionId: number }, ctx: Ctx) =>
        tenantParent('acc', a.subscriptionId, ctx),
      acc: (_p: unknown, a: { subscriptionId: number }, ctx: Ctx) =>
        tenantParent('acc', a.subscriptionId, ctx),
      customerRelationshipManagement: (_p: unknown, a: { subscriptionId: number }, ctx: Ctx) =>
        tenantParent('crm', a.subscriptionId, ctx),
      crm: (_p: unknown, a: { subscriptionId: number }, ctx: Ctx) =>
        tenantParent('crm', a.subscriptionId, ctx),
      pointOfSale: (_p: unknown, a: { subscriptionId: number }, ctx: Ctx) =>
        tenantParent('pos', a.subscriptionId, ctx),
      pos: (_p: unknown, a: { subscriptionId: number }, ctx: Ctx) =>
        tenantParent('pos', a.subscriptionId, ctx),
    },
    TenantCube: {
      schema: (p: TenantParent) => cubeSchema(p.cfg),
      meta: (p: TenantParent, a: { filters?: Record<string, unknown> }) => guard(runCubeMeta(p.cfg, p.sub, a.filters ?? {})),
      facets: (p: TenantParent, a: { field: string; q?: string; filters?: Record<string, unknown> }) => guard(runCubeFacets(p.cfg, p.sub, a.field, a.q ?? '', a.filters ?? {})),
      query: async (p: TenantParent, a: Record<string, unknown>) => tenantResult(await guard(runCubeQuery(p.cfg, p.sub, {
        group_by: a.groupBy, metrics: a.metrics, order_by: a.orderBy, order_dir: a.orderDir, limit: a.limit, filters: (a.filters as Record<string, unknown>) ?? {},
      }))),
      lines: async (p: TenantParent, a: Record<string, unknown>) => tenantPage(await guard(runCubeLines(p.cfg, p.sub, {
        limit: a.limit, page: a.page, sort: a.sort, dir: a.dir, filters: (a.filters as Record<string, unknown>) ?? {},
      }))),
    },
  },
  typeDefs: /* GraphQL */ `
"""
Subscription-gated tenant cube shared shape. Used by Enterprise Resource
Planning (wholesale order lines), Accounting (invoice lines), Customer
Relationship Management (tasks/activities), and Point of Sale (transaction
items). Call \`schema\` first to discover this cube's exact dims / metrics /
filters / columns for your subscription.
"""
type TenantCube {
  "Machine shape: dims, metrics, filters, columns, geo_dim — live documentation for this service."
  schema: JSON!
  "Headline totals for the subscription (optionally filtered)."
  meta(filters: JSON): JSON!
  "Top values for one dimension (facet). \`field\` must be one of schema.dims."
  facets(field: String!, q: String, filters: JSON): JSON!
  "Universal analytics grammar: groupBy × metrics × filters (string aliases from schema)."
  query(groupBy: [String!], metrics: [String!], orderBy: String, orderDir: SortDir, limit: Int, filters: JSON): CubeResult!
  "Flat, paginated raw records at the fully-flattened line / task / transaction grain."
  lines(filters: JSON, sort: String, dir: SortDir, page: Int, limit: Int): CubePage!
}
`,
};
