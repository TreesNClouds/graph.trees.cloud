import { requireKey } from '../context';
import { menuGet } from '../proxy';
import type { CubeModule, Ctx } from '../types';

function listingsParent(_p: unknown, _a: unknown, ctx: Ctx) {
  requireKey(ctx);
  return {};
}

function listingRows(j: Record<string, unknown>): unknown[] {
  const raw = (j.rows ?? j.data ?? []) as Array<Record<string, unknown>>;
  return raw.map((r) => ({ ...r, listing_type: r.listing_type ?? r.type }));
}

/**
 * Cannabis-adjacent storefront directory — with or without a menu.
 * Proxies monorepo GET /api/v2/cube/listings/data.
 */
export const listings: CubeModule = {
  queryFields: `
  """Cannabis-adjacent storefront directory (with or without a menu)."""
  listings: ListingsCube!
`,
  resolvers: {
    Query: {
      listings: listingsParent,
    },
    ListingsCube: {
      facets: async () => {
        const j = await menuGet('/listings/data', { limit: 1 });
        return {
          snapshotDate: j.snapshot_date ?? null,
          types: j.facets ?? [],
        };
      },
      list: async (_p: unknown, a: Record<string, unknown>) => {
        const limit = Math.max(1, Number(a.limit ?? 25));
        const page = Math.max(1, Number(a.page ?? 1));
        const offset = (page - 1) * limit;
        const j = await menuGet('/listings/data', {
          state: a.state,
          types: a.types,
          has_menu: a.has_menu,
          q: a.q,
          sort: a.sort,
          dir: typeof a.dir === 'string' ? a.dir.toLowerCase() : a.dir,
          limit,
          offset,
        });
        return {
          snapshotDate: j.snapshot_date ?? null,
          total: j.total ?? 0,
          page,
          perPage: j.limit ?? limit,
          sort: j.sort ?? null,
          columns: null,
          tabs: null,
          data: listingRows(j),
        };
      },
    },
  },
  typeDefs: /* GraphQL */ `
"""
Cannabis-adjacent storefront directory (listing_directory).
Grain: one listing. Distinct from Retailer — includes shops with no menu.
"""
type ListingsCube {
  "Type facet counts from the current snapshot."
  facets: JSON!
  """
  Paginated directory. \`state\` / \`types\` accept comma-separated values.
  \`has_menu\` is \`1\` or \`0\`. \`page\` is 1-based.
  """
  list(
    state: String
    types: String
    has_menu: String
    q: String
    page: Int
    limit: Int
    sort: String
    dir: SortDir
  ): CubePage!
}
`,
};
