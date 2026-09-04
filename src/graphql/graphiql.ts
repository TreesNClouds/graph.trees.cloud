import { renderGraphiQL } from 'graphql-yoga';
import { SHADCN_CSS, THEME_HEAD_JS } from '@/routes/cube/theme';

export const DEFAULT_QUERY = `# Trees N Clouds — GraphQL Cube API
# ═══════════════════════════════════════════════════════════════════════════
# AUTH  Headers tab (bottom-left):
#   { "Authorization": "Bearer <YOUR_TREES_CLOUD_API_KEY>" }
#
# SERVICES (prefer full field names)
#   publicMenus                      Public Menus — nationwide dispensary menus
#   licenses                         State-issued cannabis licenses (regulator file)
#   enterpriseResourcePlanning(id)   Enterprise Resource Planning — wholesale orders
#   accounting(id)                   Accounting — invoice lines
#   customerRelationshipManagement(id)  Customer Relationship Management — tasks
#   pointOfSale(id)                  Point of Sale — retail transactions
#
# Docs pane (right) is the live schema for every type, field, and enum.
# Enums are UNQUOTED: groupBy: [brand_id]  metrics: [revenue]  orderDir: DESC
# ═══════════════════════════════════════════════════════════════════════════

# 1) Public Menus — headline totals
query PublicMenusTotals {
  publicMenus {
    meta
  }
}

# 2) Public Menus — top brands by modeled revenue in California
query TopBrandsByRevenueInCalifornia {
  publicMenus {
    query(
      groupBy: [brand_id]
      metrics: [revenue, products, stores]
      orderBy: "revenue"
      orderDir: DESC
      limit: 10
      filters: { state: "CA" }
    ) {
      snapshotDate
      count
      data
    }
  }
}

# 3) Licenses — CA active directory
query CaActiveLicenses {
  licenses {
    facets
    list(state: "CA", status: "active", limit: 25, sort: "license_number", dir: ASC) {
      total
      page
      perPage
      data
    }
  }
}

# 4) Enterprise Resource Planning — discover shape, then query (change subscriptionId)
query EnterpriseResourcePlanningShape {
  enterpriseResourcePlanning(subscriptionId: 23) {
    schema
  }
}

query EnterpriseResourcePlanningTopBrands {
  enterpriseResourcePlanning(subscriptionId: 23) {
    query(groupBy: ["brand"], metrics: ["revenue", "orders"], orderDir: DESC, limit: 10) {
      data
    }
  }
}

# 4) Accounting / Customer Relationship Management / Point of Sale
# query AccountingInvoiceLines {
#   accounting(subscriptionId: 23) { lines(limit: 25) { total data } }
# }
# query CustomerRelationshipTasks {
#   customerRelationshipManagement(subscriptionId: 23) { meta }
# }
# query PointOfSaleItems {
#   pointOfSale(subscriptionId: 23) {
#     query(metrics: ["revenue", "units"]) { data }
#   }
# }
`;

export const BRAND_LOGO = '/api/v2/cube/brand/logo';

/** Trees N Clouds palette for GraphiQL — quiet charcoal + teal, no neon chrome. */
const GRAPHIQL_BRAND_CSS = `
:root {
  --color-primary: 162, 44%, 46%;
  --color-secondary: 0, 0%, 11%;
  --color-tertiary: 210, 8%, 46%;
  --color-info: 162, 44%, 46%;
  --color-success: 162, 44%, 40%;
  --color-warning: 38, 70%, 48%;
  --color-error: 3, 78%, 58%;
  --color-neutral: 0, 0%, 96%;
  --color-base: 0, 0%, 11%;
}
html, body {
  margin: 0;
  height: 100%;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: hsl(var(--background));
  color: hsl(var(--foreground));
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
}
/* Same global nav as every other cube page */
.navwrap { margin: 0 !important; flex-shrink: 0; border-bottom: 1px solid hsl(var(--border)); }
.crumbs { display: none !important; } /* GraphiQL is the page — skip breadcrumb clutter */
#root {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
#root, .graphiql-container { height: 100%; min-height: 0; }
.graphiql-container {
  --sidebar-width: 48px;
  flex: 1;
}
/* Slim brand strip — no field-name chip dump */
.tnc-gql-banner { display: none !important; }

/* ── Explorer cleanup ─────────────────────────────────────────
   Tone down OneGraph pink/magenta; hide the noisy footer; tighten spacing. */
.docExplorerWrap,
.graphiql-plugin,
.graphiql-sidebar,
[class*="graphiql-explorer"],
.graphiql-explorer-root {
  background: #161616 !important;
  color: #d5d8dc !important;
  border-color: #2a2a2a !important;
}
.doc-explorer-title,
.graphiql-doc-explorer-title,
.graphiql-explorer-title,
.docExplorerTitle {
  font-size: 13px !important;
  font-weight: 650 !important;
  letter-spacing: -.01em !important;
  color: #e8eaed !important;
  text-transform: none !important;
  padding: 10px 12px !important;
  border-bottom: 1px solid #2a2a2a !important;
  background: #141414 !important;
}
/* Field / type names in explorer */
.graphiql-explorer-field-view,
.graphiql-explorer-node,
.doc-category-item,
.graphiql-doc-explorer-item {
  color: #c8ccd2 !important;
  font-size: 12.5px !important;
}
.graphiql-explorer-graphql-arguments,
.graphiql-explorer-arg-name { color: #8bafaa !important; }
.graphiql-explorer-field-name,
.docExplorerWrap .field-name { color: #9ec9c1 !important; }
.graphiql-explorer-type-name,
.docExplorerWrap .type-name { color: #8aa0b8 !important; }

/* Selection checkboxes → teal instead of GraphiQL pink */
.graphiql-explorer input[type=checkbox],
.docExplorerWrap input[type=checkbox] {
  accent-color: #42aa9c !important;
}
.graphiql-explorer input[type=checkbox]:checked,
.docExplorerWrap input[type=checkbox]:checked {
  accent-color: #42aa9c !important;
}

/* Hide OneGraph promo footer + “Contribute on GitHub” noise */
.graphiql-explorer-root > div:last-child a[href*="github"],
.graphiql-explorer-root a[href*="onegraph"],
.graphiql-explorer-root a[href*="OneGraph"],
div[style*="GraphiQL Explorer"],
.graphiql-explorer-root > footer,
.graphiql-explorer footer {
  display: none !important;
}
/* Catch the pink/white footer text block Often rendered as a sibling with tiny font */
.graphiql-explorer-root > div[style*="font-size: 10"],
.graphiql-explorer-root > div[style*="font-size:10"],
.graphiql-explorer-root > div[style*="color: rgb(255"],
.graphiql-explorer-root > div[style*="color:#f"],
.graphiql-explorer-root > div[style*="color: #f"] {
  display: none !important;
}

/* “Add new Query” bar — quieter */
.graphiql-explorer-actions,
.graphiql-explorer-root select,
.graphiql-explorer-root button {
  background: #1c1c1c !important;
  color: #d5d8dc !important;
  border-color: #333 !important;
  border-radius: 6px !important;
}
.graphiql-explorer-root button:hover {
  border-color: #42aa9c !important;
  color: #42aa9c !important;
}

/* Editor / results panes */
.graphiql-editors,
.CodeMirror,
.graphiql-query-editor,
.graphiql-response {
  background: #111 !important;
}
.graphiql-container .CodeMirror-gutters {
  background: #161616 !important;
  border-color: #2a2a2a !important;
}
`;

export function renderBrandedGraphiQL(opts: Parameters<typeof renderGraphiQL>[0]): string {
  let html = renderGraphiQL(opts);
  const headInject = `<script>${THEME_HEAD_JS}</script>
<style>${SHADCN_CSS}
${GRAPHIQL_BRAND_CSS}
.graphiql-container .graphiql-logo a,
.graphiql-container .graphiql-logo { color: #42aa9c !important; }
.graphiql-container .graphiql-logo img {
  height: 22px !important; width: auto !important; object-fit: contain; filter: none !important;
}
.graphiql-container button.graphiql-execute-button,
.graphiql-container .graphiql-execute-button { background: #42aa9c !important; }
.graphiql-container .graphiql-toolbar button:hover,
.graphiql-container .graphiql-tab-add:hover,
.graphiql-container .graphiql-tab[aria-selected=true] { color: #42aa9c; }
.graphiql-container .graphiql-session-header { border-bottom: 1px solid rgba(66,170,156,.28); }
</style>`;
  const bodyInject = `<script>
(function(){
  function scrub(){
    document.querySelectorAll('a[href*="onegraph"],a[href*="OneGraph"],a[href*="github.com/OneGraph"]').forEach(function(a){
      var n=a.parentElement; if(n) n.style.display='none';
    });
    document.querySelectorAll('.graphiql-explorer-root, [class*="graphiql-explorer"]').forEach(function(root){
      root.querySelectorAll('div').forEach(function(d){
        var t=(d.textContent||'').trim();
        if(/GraphiQL Explorer by|Contribute on GitHub/i.test(t) && t.length < 80) d.style.display='none';
      });
    });
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',function(){ setTimeout(scrub,400); setTimeout(scrub,1200); });
  else { setTimeout(scrub,400); setTimeout(scrub,1200); }
})();
</script>`;
  if (/<\/head>/i.test(html)) html = html.replace(/<\/head>/i, `${headInject}</head>`);
  else html = headInject + html;
  if (/<body([^>]*)>/i.test(html)) html = html.replace(/<body([^>]*)>/i, `<body$1>${bodyInject}`);
  else html = bodyInject + html;
  return html;
}
