import { enc, inputOf, svc, svcParent } from '../proxy';
import type { CubeModule, Ctx, SvcArgs, SvcParent } from '../types';

/** Contacts V2 — Top-Level Accounts, prospects, and groups. */
export const contacts: CubeModule = {
  queryFields: `
  """Contacts Accounts V2 (Top-Level Accounts) — accounts list/detail."""
  contactsAccounts(subscriptionId: Int!): ContactsAccountsCube!
  """Contacts Prospects V2."""
  contactsProspects(subscriptionId: Int!): ContactsProspectsCube!
  """Contacts Groups V2."""
  contactsGroups(subscriptionId: Int!): ContactsGroupsCube!
`,
  resolvers: {
    Query: {
      contactsAccounts: (_p: unknown, a: { subscriptionId: number }, ctx: Ctx) => svcParent(ctx, a.subscriptionId),
      contactsProspects: (_p: unknown, a: { subscriptionId: number }, ctx: Ctx) => svcParent(ctx, a.subscriptionId),
      contactsGroups: (_p: unknown, a: { subscriptionId: number }, ctx: Ctx) => svcParent(ctx, a.subscriptionId),
    },
    ContactsAccountsCube: {
      list: (p: SvcParent, a: SvcArgs) => svc('POST', 'contacts', p, '/accounts-cube', { body: inputOf(a) }),
      detail: (p: SvcParent, a: SvcArgs) => svc('GET', 'contacts', p, `/accounts-cube/${enc(a.retailerId)}`, { query: inputOf(a) }),
    },
    ContactsProspectsCube: {
      list: (p: SvcParent, a: SvcArgs) => svc('POST', 'contacts', p, '/prospects-cube', { body: inputOf(a) }),
    },
    ContactsGroupsCube: {
      list: (p: SvcParent, a: SvcArgs) => svc('POST', 'contacts', p, '/groups-cube', { body: inputOf(a) }),
    },
  },
  typeDefs: /* GraphQL */ `
"""Contacts Accounts V2 (Top-Level Accounts)."""
type ContactsAccountsCube {
  list(input: JSON): JSON
  detail(retailerId: String!, input: JSON): JSON
}

"""Contacts Prospects V2."""
type ContactsProspectsCube {
  list(input: JSON): JSON
}

"""Contacts Groups V2."""
type ContactsGroupsCube {
  list(input: JSON): JSON
}
`,
};
