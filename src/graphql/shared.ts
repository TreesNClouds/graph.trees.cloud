import { GraphQLScalarType, valueFromASTUntyped } from 'graphql';
import type { CubeModule } from './types';

export function toResult(j: Record<string, unknown>): Record<string, unknown> {
  return {
    snapshotDate: j.snapshot_date ?? null,
    groupBy: (j.group_by as string[]) ?? null,
    metrics: (j.metrics as string[]) ?? null,
    count: j.count ?? (Array.isArray(j.data) ? (j.data as unknown[]).length : 0),
    data: (j.data as unknown[]) ?? [],
  };
}

export function toPage(j: Record<string, unknown>): Record<string, unknown> {
  const pg = (j.pagination as Record<string, unknown>) ?? {};
  return {
    snapshotDate: j.snapshot_date ?? null,
    total: pg.total ?? pg.total_objects ?? 0,
    page: pg.page ?? 1,
    perPage: pg.per_page ?? 25,
    sort: j.sort ?? null,
    columns: j.columns ?? null,
    tabs: j.tabs ?? null,
    data: (j.rows as unknown[]) ?? (j.data as unknown[]) ?? [],
  };
}

const JSONScalar = new GraphQLScalarType({
  name: 'JSON',
  description: 'Arbitrary JSON value. Result rows are keyed by the selected dimensions + metrics; filter maps use the cube\'s documented parameter names.',
  serialize: (v) => v,
  parseValue: (v) => v,
  parseLiteral: (ast, vars) => valueFromASTUntyped(ast, vars),
});

/**
 * Shared kernel: JSON scalar, sort enum, and the two result envelopes every
 * typed cube returns. Field docs here are the live GraphiQL documentation.
 */
export const shared: CubeModule = {
  queryFields: '',
  resolvers: { JSON: JSONScalar },
  typeDefs: /* GraphQL */ `
"""
Trees N Clouds Cube API — the single GraphQL surface for every Trees Cloud
data cube. Authenticate every operation with:

  Authorization: Bearer <trees.cloud API key>

Subscription-gated services (Enterprise Resource Planning, Accounting,
Customer Relationship Management, Point of Sale) also require a
\`subscriptionId\` your key is allowed to access.
"""
scalar JSON

"""Sort direction for ordered analytics results."""
enum SortDir {
  "Ascending (A→Z, low→high)."
  ASC
  "Descending (Z→A, high→low)."
  DESC
}

"""An aggregate query result. \`data\` rows are JSON objects keyed by the selected dimensions + metrics."""
type CubeResult {
  "Published menu snapshot date (YYYY-MM-DD) this payload was derived from."
  snapshotDate: String
  "Dimensions that were grouped."
  groupBy: [String!]
  "Metrics that were aggregated."
  metrics: [String!]
  "Number of result rows (or total matches for search)."
  count: Int
  "Result rows — JSON objects keyed by selected dims + metrics."
  data: [JSON!]!
}

"""A paginated flat-record page (one row per line-item / order-line / task / transaction)."""
type CubePage {
  "Published snapshot date for Public Menus pages."
  snapshotDate: String
  "Total matching rows across all pages."
  total: Int
  "1-based page index."
  page: Int
  "Page size."
  perPage: Int
  "Active sort: { col, dir }."
  sort: JSON
  "Column descriptors: { col, label, kind }."
  columns: [JSON!]
  "Record-view tabs (Public Menus only): { id, label }."
  tabs: [JSON!]
  "Page of row objects."
  data: [JSON!]!
}
`,
};
