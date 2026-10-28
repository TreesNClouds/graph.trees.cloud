// Vendored copy of monorepo.trees.clouds packages/route-usage/src/core.ts (this repo is outside
// the monorepo workspace). Keep in sync with the package.

/**
 * Route usage client.
 *
 * Every TreesNClouds service that is not api.trees.cloud counts its requests
 * here, by route PATTERN and UTC day, and ships the counts in batches to
 * api.trees.cloud (`POST /internal/route-usage`), which stores them in
 * `tnc_platform.api_route_usage_daily`. Daily rows roll up into the weekly
 * and monthly views used to decide which routes are safe to deprecate.
 *
 * Runtime-agnostic: needs only `fetch`, so it runs in Node, Next.js and
 * Cloudflare Workers.
 *
 * Privacy: a route is a method plus a pattern ("GET /api/v1/brands/:id") or a
 * route family, never a concrete URL. No query strings, ids, IPs or keys.
 *
 * Off by default: without a token the client counts nothing and sends
 * nothing, so wiring it in is safe before the env is configured.
 */

export type StatusClassT = '1xx' | '2xx' | '3xx' | '4xx' | '5xx';

/** One row of the ingest payload: a route's counts on one UTC day. */
export type UsageRowT = {
  day: string;
  route: string;
  count: number;
  status: Record<StatusClassT, number>;
  last: string;
};

export type IngestBodyT = { service: string; env: string; rows: UsageRowT[] };

export type RouteUsageClientT = {
  readonly enabled: boolean;
  readonly service: string;
  /** Count one request. `route` must already be a pattern or family. */
  record(route: string, statusCode?: number): void;
  /** Send what is buffered. Resolves even when the send fails (counts stay buffered). */
  flush(): Promise<void>;
  /**
   * For serverless runtimes, where a timer may never fire: flush when the
   * interval has passed, or at once when a route shows up that has not been
   * sent yet today. That way a rare caller (the one a deprecation decision
   * hinges on) is delivered even if the instance is recycled right after;
   * only repeat hits on busy routes wait for the interval.
   */
  flushIfDue(): Promise<void> | null;
  /** Rows not yet sent (tests, diagnostics). */
  pending(): UsageRowT[];
};

export type RouteUsageOptionsT = {
  service: string;
  /** Deployment the counts come from: production, preview, development, local. */
  env?: string;
  /** Ingest URL. Default https://api.trees.cloud/internal/route-usage. */
  endpoint?: string;
  /** Bearer token for the ingest endpoint (ROUTE_USAGE_TOKEN). No token = disabled. */
  token?: string | undefined;
  /** How often to flush, in ms. Default 30 s. */
  flushMs?: number;
  /** Start a background flush timer (long-lived servers). Default true where timers can be unref'd. */
  timer?: boolean;
  fetch?: typeof fetch;
  now?: () => Date;
};

export const DEFAULT_ENDPOINT = 'https://api.trees.cloud/internal/route-usage';
export const MAX_ROUTE_LEN = 300;
/** Distinct (day, route) keys held in memory; beyond this new routes fold into `OTHER`. */
export const MAX_KEYS = 2000;
export const MAX_ROWS_PER_POST = 1000;
const DEFAULT_FLUSH_MS = 30_000;
const SEND_TIMEOUT_MS = 5_000;

export function statusClass(code: number): StatusClassT {
  if (code >= 500) return '5xx';
  if (code >= 400) return '4xx';
  if (code >= 300) return '3xx';
  if (code >= 200) return '2xx';
  return '1xx';
}

function emptyStatus(): Record<StatusClassT, number> {
  return { '1xx': 0, '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0 };
}

const ID_SEGMENT = [
  /^\d+$/, // numeric ids
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, // uuids
  /^[0-9a-f]{16,}$/i, // hashes
  /^[A-Za-z0-9_-]{24,}$/, // long opaque tokens / slugs with ids
  /^(tnc|sk|pk)_[A-Za-z0-9_]+$/, // keys
  /[@%]/, // emails, encoded values
  /\.[A-Za-z0-9]{2,5}$/, // file names (image hashes, json blobs)
];

/** Replace segments that look like ids, hashes, keys or file names with `:id`. */
export function maskPath(path: string): string {
  const q = path.indexOf('?');
  const clean = q === -1 ? path : path.slice(0, q);
  const masked = clean
    .split('/')
    .map((seg) => (seg && !seg.startsWith(':') && ID_SEGMENT.some((re) => re.test(seg)) ? ':id' : seg))
    .join('/');
  return masked.slice(0, MAX_ROUTE_LEN) || '/';
}

/** Route family of a request no pattern matched: `/api/v1/<family>` or the first segment. Never ids. */
export function pathFamily(path: string): string {
  const segs = maskPath(path).split('/').filter(Boolean);
  if (segs[0] === 'api') return `/${segs.slice(0, segs[1] && /^v\d+$/.test(segs[1]) ? 3 : 2).join('/')}`;
  return segs[0] ? `/${segs[0]}` : '/';
}

function utcDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

type AggT = { count: number; status: Record<StatusClassT, number>; last: string };

function readEnv(name: string): string | undefined {
  const p = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  const v = p?.env?.[name];
  return v && v.trim() ? v.trim() : undefined;
}

/** Deployment name from the usual env vars. */
export function detectEnv(): string {
  return readEnv('ROUTE_USAGE_ENV') ?? readEnv('VERCEL_ENV') ?? readEnv('NODE_ENV') ?? 'development';
}

export function createRouteUsageClient(opts: RouteUsageOptionsT): RouteUsageClientT {
  const service = opts.service;
  const env = opts.env ?? detectEnv();
  const endpoint = opts.endpoint ?? DEFAULT_ENDPOINT;
  const token = opts.token;
  const flushMs = opts.flushMs ?? DEFAULT_FLUSH_MS;
  const doFetch = opts.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  const now = opts.now ?? (() => new Date());
  const enabled = Boolean(token);

  let buffer = new Map<string, AggT>();
  let lastFlush = now().getTime();
  let inflight: Promise<void> | null = null;
  // Keys already sent (or being sent) today, so a first sighting can be flushed at once.
  let sentDay = '';
  let sent = new Set<string>();
  let urgent = false;
  let warned = false;

  const add = (key: string, a: AggT) => {
    const cur = buffer.get(key);
    if (!cur) {
      buffer.set(key, { count: a.count, status: { ...a.status }, last: a.last });
      return;
    }
    cur.count += a.count;
    for (const s of Object.keys(cur.status) as StatusClassT[]) cur.status[s] += a.status[s];
    if (a.last > cur.last) cur.last = a.last;
  };

  const toRows = (m: Map<string, AggT>): UsageRowT[] =>
    [...m.entries()].map(([k, a]) => {
      const tab = k.indexOf('\t');
      return { day: k.slice(0, tab), route: k.slice(tab + 1), count: a.count, status: { ...a.status }, last: a.last };
    });

  /** Send in chunks; returns the rows that were NOT accepted, so a retry never double counts. */
  async function send(rows: UsageRowT[]): Promise<UsageRowT[]> {
    for (let i = 0; i < rows.length; i += MAX_ROWS_PER_POST) {
      const body: IngestBodyT = { service, env, rows: rows.slice(i, i + MAX_ROWS_PER_POST) };
      const ctrl = typeof AbortController === 'undefined' ? null : new AbortController();
      const t = ctrl ? setTimeout(() => ctrl.abort(), SEND_TIMEOUT_MS) : null;
      try {
        const res = await doFetch(endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
          body: JSON.stringify(body),
          ...(ctrl ? { signal: ctrl.signal } : {}),
        });
        if (!res.ok && (res.status >= 500 || res.status === 429)) return rows.slice(i);
        // Any other 4xx means the batch or the token is bad; drop it rather than retry forever.
        if (!res.ok && !warned) {
          warned = true;
          console.warn(`[route-usage] ${service}: ingest answered HTTP ${res.status}; counts dropped. Check ROUTE_USAGE_TOKEN.`);
        }
      } catch {
        return rows.slice(i);
      } finally {
        if (t) clearTimeout(t);
      }
    }
    return [];
  }

  const client: RouteUsageClientT = {
    enabled,
    service,
    record(route, statusCode) {
      if (!enabled) return;
      const at = now();
      const day = utcDay(at);
      let key = `${day}\t${route.slice(0, MAX_ROUTE_LEN)}`;
      if (!buffer.has(key) && buffer.size >= MAX_KEYS) key = `${day}\tOTHER`;
      if (day !== sentDay) {
        sentDay = day;
        sent = new Set();
      }
      if (!buffer.has(key) && !sent.has(key)) urgent = true;
      const status = emptyStatus();
      if (statusCode !== undefined) status[statusClass(statusCode)] = 1;
      add(key, { count: 1, status, last: at.toISOString() });
    },
    flush() {
      if (!enabled || buffer.size === 0) return Promise.resolve();
      if (inflight) return inflight;
      const batch = buffer;
      buffer = new Map();
      lastFlush = now().getTime();
      urgent = false;
      for (const k of batch.keys()) if (sent.size < MAX_KEYS) sent.add(k);
      inflight = send(toRows(batch))
        .then((unsent) => {
          // Keep unsent counts for the next flush, unless the buffer is already full.
          for (const r of unsent) {
            const k = `${r.day}\t${r.route}`;
            sent.delete(k);
            if (buffer.has(k) || buffer.size < MAX_KEYS) add(k, { count: r.count, status: r.status, last: r.last });
          }
        })
        .finally(() => {
          inflight = null;
        });
      return inflight;
    },
    flushIfDue() {
      if (!enabled || buffer.size === 0) return null;
      if (!urgent && now().getTime() - lastFlush < flushMs) return null;
      return client.flush();
    },
    pending() {
      return toRows(buffer);
    },
  };

  if (enabled && opts.timer !== false && typeof setInterval === 'function') {
    const t = setInterval(() => void client.flush(), flushMs) as unknown as { unref?: () => void };
    t.unref?.();
  }
  return client;
}

/** Client configured from ROUTE_USAGE_TOKEN, ROUTE_USAGE_INGEST_URL, ROUTE_USAGE_ENV and ROUTE_USAGE_FLUSH_MS. */
export function routeUsageFromEnv(service: string, extra: Partial<RouteUsageOptionsT> = {}): RouteUsageClientT {
  const endpoint = readEnv('ROUTE_USAGE_INGEST_URL');
  const flushMs = Number(readEnv('ROUTE_USAGE_FLUSH_MS'));
  return createRouteUsageClient({
    service,
    token: readEnv('ROUTE_USAGE_TOKEN'),
    ...(endpoint ? { endpoint } : {}),
    ...(flushMs > 0 ? { flushMs } : {}),
    ...extra,
  });
}
