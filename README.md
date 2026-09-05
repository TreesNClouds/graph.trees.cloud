# graph.trees.cloud

Developer template for the trees.cloud **v2 GraphQL API**. Paste a trees.cloud API key, then use GraphiQL. This site does not log in users and does not open a database.

The live schema is the cube API on `api.trees.cloud`: `publicMenus`, `enterpriseResourcePlanning`, `accounting`, `customerRelationshipManagement`, `pointOfSale`.

## Get a key

In [app.trees.cloud](https://app.trees.cloud) open the workspace **Settings → API Keys** and generate a key. It looks like `tnc_live_…` or `tnc_test_…` (shown once).

## Run

```bash
cd graph.trees.cloud
pnpm --dir web install   # first time
pnpm dev
```

Open http://localhost:3401 — Connect, paste the key. Home is the cube **catalog** (same object table as `api.trees.cloud/api/v2/cube`). **GraphQL** is the playground.

The key stays in `sessionStorage` for this tab only. Disconnect or a new tab asks again.

## Upstream

Next rewrites `/api/v2/graphql` to `GRAPH_API_URL` (default `https://api.trees.cloud`). Override in `web/.env.local`:

```bash
# Production (default)
GRAPH_API_URL=https://api.trees.cloud

# Local api.trees.cloud
GRAPH_API_URL=http://127.0.0.1:3333
```

Restart `pnpm dev` after changing it.

## Example queries

Any valid key (nationwide public menus):

```graphql
query {
  publicMenus {
    meta
  }
}
```

Tenant cube — `subscriptionId` must match the key:

```graphql
query {
  enterpriseResourcePlanning(subscriptionId: 23) {
    meta
  }
}
```

GraphiQL (`/graphql`) sends `Authorization: Bearer <key>` automatically after Connect.

## License

[FSL-1.1-MIT](./LICENSE) — source available now, MIT in two years. Internal use,
education, research, and self-hosting are permitted. Offering a competing hosted
substitute is not. The in-app copy is at `/license`.
