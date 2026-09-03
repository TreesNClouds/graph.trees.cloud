# GraphQL modules

One schema, one Yoga endpoint (`/api/v2/graphql`). Split by cube family so
schema, resolvers, and field docs live together. GraphiQL is the live catalog.

| Module | Query fields | Types |
|---|---|---|
| `shared.ts` | — | `JSON`, `SortDir`, `CubeResult`, `CubePage` |
| `public-menus.ts` | `publicMenus`, `public` | `PublicMenusCube`, `MenuDim`, `MenuObject`, `MenuMetric`, `MenuFilters` |
| `tenant-cubes.ts` | `enterpriseResourcePlanning` / `erp`, `accounting` / `acc`, `customerRelationshipManagement` / `crm`, `pointOfSale` / `pos` | `TenantCube` |
| `dashboards/retail-performance.ts` | `retailPerformance` | `RetailPerformanceCube` |
| `dashboards/product-brand.ts` | `productBrandPerformance` | `ProductBrandPerformanceCube` |
| `dashboards/category.ts` | `categoryPerformance` | `CategoryPerformanceCube` |
| `dashboards/market-share.ts` | `marketShare` | `MarketShareCube` |
| `dashboards/tags.ts` | `tagPerformance` | `TagPerformanceCube` |
| `dashboards/inventory.ts` | `inventoryReports` | `InventoryReportsCube` |
| `dashboards/erp-orders.ts` | `erpOrders` | `ErpOrdersCube` |
| `dashboards/contacts.ts` | `contactsAccounts`, `contactsProspects`, `contactsGroups` | `Contacts*Cube` |

Kernel (not cubes): `context.ts` (API-key auth), `proxy.ts` (REST passthrough),
`graphiql.ts` (IDE chrome), `index.ts` (merge + Yoga).

To add a cube: drop a `CubeModule` (`typeDefs` + `queryFields` + `resolvers`)
and register it in the `cubes` array in `index.ts`.
