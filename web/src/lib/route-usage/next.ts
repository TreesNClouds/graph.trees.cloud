// Vendored copy of monorepo.trees.clouds packages/route-usage/src/next.ts (this repo is outside
// the monorepo workspace). Keep in sync with the package.

import { AsyncLocalStorage } from 'node:async_hooks';
import { pathFamily, routeUsageFromEnv, type RouteUsageClientT } from './core';

/**
 * Next.js route usage, with no per-route code.
 *
 * Next wraps every request in an OpenTelemetry span (`BaseServer.handleRequest`)
 * and, once the response is done, sets `http.route` to the matched route
 * pattern (`/api/workspace/[id]/reports`) and `http.status_code`. This module
 * registers a minimal tracer provider (plus an AsyncLocalStorage context
 * manager, which Next needs to find the root span) that exports nothing: it
 * only counts those root spans with the route usage client.
 *
 * Register it with the app's own `@opentelemetry/api` dependency (1.9.x),
 * not Next's bundled copy (1.6.0): the OpenTelemetry global registry lets an
 * older API read a newer registration but not the reverse, and Next loads
 * `@opentelemetry/api` itself whenever it can resolve it, falling back to
 * its bundled copy. Registering with the newest version works for both.
 *
 *   // src/instrumentation.ts
 *   export async function register() {
 *     if (process.env.NEXT_RUNTIME !== 'nodejs') return;
 *     const api = await import('@opentelemetry/api');
 *     const { registerNextRouteUsage } = await import('@tnc/route-usage/next');
 *     registerNextRouteUsage('app.trees.cloud', api);
 *   }
 *
 * Node runtime only; edge route handlers are not counted. If another tracer
 * provider (Sentry, @vercel/otel) is already registered, this backs off.
 */

/* Structural slice of @opentelemetry/api, so the package needs no dependency on it. */
type ContextT = {
  getValue(key: symbol): unknown;
  setValue(key: symbol, value: unknown): ContextT;
  deleteValue(key: symbol): ContextT;
};
type SpanContextT = { traceId: string; spanId: string; traceFlags: number };
type SpanT = { spanContext(): SpanContextT };
export type OtelApiT = {
  ROOT_CONTEXT: ContextT;
  context: { active(): ContextT; setGlobalContextManager(m: unknown): boolean };
  trace: {
    setGlobalTracerProvider(p: unknown): boolean;
    setSpan(ctx: ContextT, span: SpanT): ContextT;
    getSpan(ctx: ContextT): SpanT | undefined;
  };
};

type AttrsT = Record<string, unknown>;
const ROOT_SPAN_TYPE = 'BaseServer.handleRequest';
const MAX_UNROUTED = 200;
const SKIP_UNROUTED = /^\/(_next|__nextjs|favicon\.ico|robots\.txt|sitemap\.xml)(\/|$)|\.(js|css|map|png|jpe?g|gif|svg|webp|ico|woff2?)$/i;

function hex(len: number): string {
  let s = '';
  while (s.length < len) s += Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, '0');
  return s.slice(0, len);
}

/** Route key for a finished Next root span, or null to skip it. Exported for tests. */
export function nextRouteKey(attrs: AttrsT, unrouted: Set<string>): string | null {
  if (attrs['next.span_type'] !== ROOT_SPAN_TYPE) return null;
  const method = String(attrs['http.method'] ?? 'GET').toUpperCase();
  const route = attrs['http.route'] ?? attrs['next.route'];
  if (typeof route === 'string' && route) {
    // Next 15 reports the app path (`/api/x/[id]/route`, `/page`); Next 16 the URL pattern.
    const pattern = route.replace(/\/(route|page)$/, '') || '/';
    return `${method === 'HEAD' ? 'GET' : method} ${pattern}`;
  }
  const target = String(attrs['http.target'] ?? '/');
  if (SKIP_UNROUTED.test(target.split('?')[0] ?? '/')) return null;
  let family = `UNROUTED ${method} ${pathFamily(target)}`;
  if (!unrouted.has(family)) {
    if (unrouted.size >= MAX_UNROUTED) family = 'UNROUTED other';
    else unrouted.add(family);
  }
  return family;
}

class CountingSpan implements SpanT {
  private attrs: AttrsT;
  private ended = false;
  constructor(
    private readonly ctx: SpanContextT,
    attrs: AttrsT | undefined,
    private readonly onEnd: (attrs: AttrsT) => void
  ) {
    this.attrs = { ...(attrs ?? {}) };
  }
  spanContext() {
    return this.ctx;
  }
  setAttribute(k: string, v: unknown) {
    this.attrs[k] = v;
    return this;
  }
  setAttributes(a: AttrsT) {
    Object.assign(this.attrs, a);
    return this;
  }
  addEvent() {
    return this;
  }
  addLink() {
    return this;
  }
  addLinks() {
    return this;
  }
  setStatus() {
    return this;
  }
  updateName() {
    return this;
  }
  recordException() {}
  isRecording() {
    return !this.ended;
  }
  end() {
    if (this.ended) return;
    this.ended = true;
    if (this.attrs['next.span_type'] === ROOT_SPAN_TYPE) this.onEnd(this.attrs);
  }
}

let registered: RouteUsageClientT | null = null;

export function registerNextRouteUsage(
  service: string,
  api: OtelApiT,
  opts: { env?: string; client?: RouteUsageClientT } = {}
): RouteUsageClientT | null {
  if (registered) return registered;
  const usage = opts.client ?? routeUsageFromEnv(service, opts.env ? { env: opts.env } : {});
  if (!usage.enabled) return null;

  const als = new AsyncLocalStorage<ContextT>();
  const contextManager = {
    active: () => als.getStore() ?? api.ROOT_CONTEXT,
    with<A extends unknown[], R>(ctx: ContextT, fn: (...args: A) => R, thisArg?: unknown, ...args: A): R {
      return als.run(ctx, () => fn.apply(thisArg, args));
    },
    bind<T>(ctx: ContextT, target: T): T {
      if (typeof target !== 'function') return target;
      const fn = target as unknown as (...a: unknown[]) => unknown;
      return function (this: unknown, ...a: unknown[]) {
        return als.run(ctx, () => fn.apply(this, a));
      } as unknown as T;
    },
    enable() {
      return contextManager;
    },
    disable() {
      als.disable();
      return contextManager;
    },
  };

  const unrouted = new Set<string>();
  const onEnd = (attrs: AttrsT) => {
    const key = nextRouteKey(attrs, unrouted);
    if (!key) return;
    const status = Number(attrs['http.status_code']);
    usage.record(key, Number.isFinite(status) && status > 0 ? status : undefined);
    const p = usage.flushIfDue();
    // On Vercel, keep the function alive until the batch is sent.
    if (p) {
      const rc = (globalThis as Record<symbol, { get?: () => { waitUntil?: (p: Promise<unknown>) => void } }>)[
        Symbol.for('@vercel/request-context')
      ];
      rc?.get?.()?.waitUntil?.(p);
    }
  };

  const startSpan = (_name: string, options?: { attributes?: AttrsT }, ctx?: ContextT) => {
    const parent = api.trace.getSpan(ctx ?? contextManager.active());
    const traceId = parent?.spanContext().traceId ?? hex(32);
    return new CountingSpan({ traceId, spanId: hex(16), traceFlags: 1 }, options?.attributes, onEnd);
  };
  const tracer = {
    startSpan,
    startActiveSpan(name: string, ...rest: unknown[]) {
      const fn = rest[rest.length - 1] as (span: SpanT) => unknown;
      const options = (rest.length >= 2 ? rest[0] : undefined) as { attributes?: AttrsT } | undefined;
      const ctx = (rest.length >= 3 ? rest[1] : undefined) as ContextT | undefined;
      const base = ctx ?? contextManager.active();
      const span = startSpan(name, options, base);
      return contextManager.with(api.trace.setSpan(base, span), fn, undefined, span);
    },
  };

  if (!api.context.setGlobalContextManager(contextManager)) {
    console.warn(`[route-usage] ${service}: an OpenTelemetry context manager is already registered; route usage is off.`);
    return null;
  }
  if (!api.trace.setGlobalTracerProvider({ getTracer: () => tracer })) {
    console.warn(`[route-usage] ${service}: an OpenTelemetry tracer provider is already registered; route usage is off.`);
    return null;
  }
  registered = usage;
  return usage;
}
