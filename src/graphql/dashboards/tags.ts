import { inputOf, svc, svcParent } from '../proxy';
import type { CubeModule, Ctx, SvcArgs, SvcParent } from '../types';

/** Tag Performance V2 — canonical retail tags. */
export const tags: CubeModule = {
  queryFields: `
  """Tag Performance V2 — canonical retail tags."""
  tagPerformance(subscriptionId: Int!): TagPerformanceCube!
`,
  resolvers: {
    Query: {
      tagPerformance: (_p: unknown, a: { subscriptionId: number }, ctx: Ctx) => svcParent(ctx, a.subscriptionId),
    },
    TagPerformanceCube: {
      summary: (p: SvcParent, a: SvcArgs) => svc('POST', 'search-pg', p, '/tags-cube/summary', { body: inputOf(a) }),
      brandShare: (p: SvcParent, a: SvcArgs) => svc('POST', 'search-pg', p, '/tags-cube/brand-share', { body: inputOf(a) }),
      categoryShare: (p: SvcParent, a: SvcArgs) => svc('POST', 'search-pg', p, '/tags-cube/category-share', { body: inputOf(a) }),
      brandInventory: (p: SvcParent, a: SvcArgs) => svc('POST', 'search-pg', p, '/tags-cube/brand-inventory', { body: inputOf(a) }),
    },
  },
  typeDefs: /* GraphQL */ `
"""Tag Performance V2 — canonical retail tags."""
type TagPerformanceCube {
  summary(input: JSON): JSON
  brandShare(input: JSON): JSON
  categoryShare(input: JSON): JSON
  brandInventory(input: JSON): JSON
}
`,
};
