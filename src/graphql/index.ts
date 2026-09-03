/**
 * GraphQL Cube API — Yoga server.
 *
 * Schema + resolvers are split by cube family under this folder. Each module
 * exports `{ typeDefs, queryFields, resolvers }`; this file merges them into
 * one executable schema. Field descriptions in those modules are the live docs
 * (GraphiQL). See README.md in this folder for the module map.
 *
 * Auth: every operation requires `Authorization: Bearer <trees.cloud API key>`.
 */
import { createYoga, createSchema } from 'graphql-yoga';
import { authFromHeader } from './context';
import { shared } from './shared';
import { publicMenus } from './public-menus';
import { tenantCubes } from './tenant-cubes';
import { retailPerformance } from './dashboards/retail-performance';
import { productBrand } from './dashboards/product-brand';
import { category } from './dashboards/category';
import { marketShare } from './dashboards/market-share';
import { tags } from './dashboards/tags';
import { inventory } from './dashboards/inventory';
import { erpOrders } from './dashboards/erp-orders';
import { contacts } from './dashboards/contacts';
import { BRAND_LOGO, DEFAULT_QUERY, renderBrandedGraphiQL } from './graphiql';
import { mergeResolvers, type CubeModule, type Ctx } from './types';

const cubes: CubeModule[] = [
  publicMenus,
  tenantCubes,
  retailPerformance,
  productBrand,
  category,
  marketShare,
  tags,
  inventory,
  erpOrders,
  contacts,
];

const typeDefs = [
  shared.typeDefs,
  ...cubes.map((c) => c.typeDefs),
  /* GraphQL */ `
"""
Root Query — five Trees N Clouds data services.

1. publicMenus — Public Menus (nationwide dispensary menus)
2. enterpriseResourcePlanning — Enterprise Resource Planning / wholesale order lines
3. accounting — Accounting / invoice lines
4. customerRelationshipManagement — Customer Relationship Management / tasks
5. pointOfSale — Point of Sale / retail transaction items

Short aliases (\`public\`, \`erp\`, \`acc\`, \`crm\`, \`pos\`) remain for compatibility
but prefer the full names in new clients and docs.
"""
type Query {
${cubes.map((c) => c.queryFields).join('\n')}
}
`,
].join('\n');

const resolvers = mergeResolvers([shared, ...cubes]);

export const cubeGraphqlYoga = createYoga({
  schema: createSchema({ typeDefs, resolvers: resolvers as never }),
  graphqlEndpoint: '/api/v2/graphql',
  landingPage: false,
  graphiql: {
    title: 'v2.trees.cloud',
    logo: BRAND_LOGO,
    favicon: BRAND_LOGO,
    defaultQuery: DEFAULT_QUERY,
    defaultHeaders: '{\n  "Authorization": "Bearer YOUR_TREES_CLOUD_API_KEY"\n}',
    shouldPersistHeaders: true,
    schemaDescription: true,
    defaultEditorToolsVisibility: 'headers',
  },
  renderGraphiQL: renderBrandedGraphiQL,
  context: async ({ request }): Promise<Ctx> => {
    const authHeader = request.headers.get('authorization') ?? '';
    return { apiKey: await authFromHeader(authHeader), authHeader };
  },
});
