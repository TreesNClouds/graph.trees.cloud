export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // Daily hits per route pattern, sent to api.trees.cloud, to tell whether this
  // playground is still used (set ROUTE_USAGE_TOKEN to turn counting on).
  const api = await import("@opentelemetry/api");
  const { registerNextRouteUsage } = await import("./lib/route-usage/next");
  registerNextRouteUsage("graph.trees.cloud", api);
}
