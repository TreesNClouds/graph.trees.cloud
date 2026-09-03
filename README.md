# v2.trees.cloud

Standalone Trees N Clouds v2 app. Lives next to `monorepo.trees.clouds`, not
inside it. GraphQL is the API the frontend will use. Same stack: API keys,
ClickHouse cubes, `api.trees.cloud` public-menu handlers.

| Surface | This app | Still on `api.trees.cloud` (`:3333`) |
|---|---|---|
| Frontend (`web/`, `:3401`) | Next.js login, workspace, theme | user / account via `/api/v1/auth/*` |
| `POST /api/v2/graphql` (`:3400`) | Yoga + GraphiQL | original mount (unchanged) |
| Tenant cubes (ERP / ACC / CRM / POS) | in-process `runCube*` → ClickHouse | same engine |
| Public menus + dashboard proxies | `API_TREES_CLOUD_URL` | REST JSON handlers |
| Developer portal API | `/api/v2/portal` | keys/usage/seats/billing tables |
| Platform tasks | proxy `/api/v2/tasks` → `:3333` | implementation on `api.trees.cloud` |

## Run

```bash
# From monorepo.trees.clouds — publicMenus / dashboard handlers + auth
pnpm --filter api.trees.cloud dev

# GraphQL + portal API
cd ~/Sites/v2/graph.trees.cloud
pnpm dev

# Frontend
pnpm web
```

- App: http://localhost:3401/login
- GraphQL + GraphiQL: http://localhost:3400/api/v2/graphql
- Tasks: http://localhost:3333/api/v2/tasks/:subscriptionId — or the `:3400` proxy
- Health: http://localhost:3400/health

Google SSO uses the existing Supabase Auth provider. Add this redirect in
Authentication → URL Configuration:

- `http://localhost:3401/api/auth/callback`
