import { requireKey } from '../context';
import { menuGet } from '../proxy';
import type { CubeModule, Ctx } from '../types';

function licensesParent(_p: unknown, _a: unknown, ctx: Ctx) {
  requireKey(ctx);
  return {};
}

/**
 * State-issued cannabis licenses — public regulator file.
 * Proxies monorepo GET /api/v2/cube/geo/licenses(+ /facets).
 */
export const licenses: CubeModule = {
  queryFields: `
  """State-issued cannabis licenses — public regulator file (no subscription)."""
  licenses: LicensesCube!
`,
  resolvers: {
    Query: {
      licenses: licensesParent,
    },
    LicensesCube: {
      facets: () => menuGet('/geo/licenses/facets', {}),
      list: async (_p: unknown, a: Record<string, unknown>) => {
        const j = await menuGet('/geo/licenses', {
          state: a.state,
          type: a.type,
          status: a.status,
          q: a.q,
          page: a.page,
          limit: a.limit,
          sort: a.sort,
          dir: typeof a.dir === 'string' ? a.dir.toLowerCase() : a.dir,
        });
        return {
          snapshotDate: null,
          total: j.total ?? 0,
          page: j.page ?? 1,
          perPage: j.per_page ?? 25,
          sort: j.sort ?? null,
          columns: null,
          tabs: null,
          data: (j.data as unknown[]) ?? [],
        };
      },
    },
  },
  typeDefs: /* GraphQL */ `
"""
State-issued cannabis licenses (public regulator file).
Grain: one license (state_code + license_number). Not a menu-fact object.
"""
type LicensesCube {
  "State, type, and status facet counts: { states, types, statuses } as { v, c }."
  facets: JSON!
  """
  Paginated license directory. \`state\` / \`type\` / \`status\` accept comma-separated
  values. \`status=active\` expands to active / current / issued / good standing / licensed.
  """
  list(
    state: String
    type: String
    status: String
    q: String
    page: Int
    limit: Int
    sort: String
    dir: SortDir
  ): CubePage!
}
`,
};
