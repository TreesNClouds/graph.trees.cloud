import { requireKey } from '../context';
import { menuGet } from '../proxy';
import type { CubeModule, Ctx } from '../types';

function geoParent(_p: unknown, _a: unknown, ctx: Ctx) {
  requireKey(ctx);
  return {};
}

/**
 * Point / ZIP enrichment — Census, nearby dispensaries, state market.
 * Proxies monorepo GET /api/v2/cube/geo/enrich.
 */
export const geo: CubeModule = {
  queryFields: `
  """Point or ZIP enrichment — Census, nearby dispensaries, state market."""
  geo: GeoCube!
`,
  resolvers: {
    Query: {
      geo: geoParent,
    },
    GeoCube: {
      enrich: (_p: unknown, a: Record<string, unknown>) =>
        menuGet('/geo/enrich', {
          zip: a.zip,
          lat: a.lat,
          lng: a.lng,
          radius_mi: a.radius_mi,
        }),
    },
  },
  typeDefs: /* GraphQL */ `
"""
Point / ZIP enrichment over public Census and menu-cube nearby counts.
Prefer \`zip\` or \`lat\`+\`lng\`. Nested blocks: demographics, nearby, market.
"""
type GeoCube {
  """
  Full enrich stack. Returns { input, resolved, layers } where layers
  includes demographics, nearby, market, business_patterns, demand_weight, density.
  """
  enrich(zip: String, lat: Float, lng: Float, radius_mi: Float): JSON!
}
`,
};
