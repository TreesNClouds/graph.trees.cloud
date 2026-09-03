import { GraphQLError } from 'graphql';
import { cubeInternalProxyHeaders } from '@/middleware/cube-rest-gone';
import { gateSubscription } from './context';
import type { Ctx, SvcArgs, SvcParent } from './types';

export const INTERNAL_BASE = (
  process.env.API_TREES_CLOUD_URL || `http://127.0.0.1:${process.env.API_TREES_CLOUD_PORT || 3333}`
).replace(/\/$/, '');

export const enc = (v: unknown): string => encodeURIComponent(String(v ?? ''));
export const inputOf = (a: SvcArgs): Record<string, unknown> => (a.input as Record<string, unknown>) ?? {};

export function appendParams(sp: URLSearchParams, params: Record<string, unknown>): void {
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    if (Array.isArray(v)) { for (const it of v) { if (it !== undefined && it !== null && it !== '') sp.append(k, String(it)); } continue; }
    if (typeof v === 'boolean') { if (v) sp.append(k, '1'); continue; }
    sp.append(k, String(v));
  }
}

/**
 * Raw passthrough for the cube UI: fetch a whitelisted public-cube GET path and
 * return its exact JSON. SSRF-guarded (path is appended to a fixed internal
 * base; no scheme/host/traversal allowed).
 */
export async function menuGetRaw(rawPath: string): Promise<unknown> {
  let path = String(rawPath ?? '');
  if (!path.startsWith('/')) path = '/' + path;
  if (path.includes('://') || path.includes('..') || path.includes('\n')) {
    throw new GraphQLError('invalid cube path', { extensions: { code: 'BAD_USER_INPUT' } });
  }
  try {
    const r = await fetch(INTERNAL_BASE + '/api/v2/cube' + path, { headers: cubeInternalProxyHeaders() });
    const txt = await r.text();
    try { return JSON.parse(txt); } catch { throw new GraphQLError(`cube ${path} returned non-JSON`, { extensions: { code: 'CUBE_ERROR' } }); }
  } catch (err) {
    if (err instanceof GraphQLError) throw err;
    throw new GraphQLError(`cube ${path} unavailable: ${(err as Error).message}`, { extensions: { code: 'CUBE_ERROR' } });
  }
}

export async function menuGet(path: string, params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const u = new URL(INTERNAL_BASE + '/api/v2/cube' + path);
  appendParams(u.searchParams, params);
  let j: Record<string, unknown>;
  try {
    const r = await fetch(u, { headers: cubeInternalProxyHeaders() });
    j = (await r.json()) as Record<string, unknown>;
    if (!r.ok || j.success === false) {
      throw new GraphQLError(String(j.error ?? j.message ?? `menu ${path} failed`), { extensions: { code: 'CUBE_ERROR' } });
    }
  } catch (err) {
    if (err instanceof GraphQLError) throw err;
    throw new GraphQLError(`menu ${path} unavailable: ${(err as Error).message}`, { extensions: { code: 'CUBE_ERROR' } });
  }
  return j;
}

export function svcParent(ctx: Ctx, subscriptionId: number): SvcParent {
  return { sub: gateSubscription(ctx, subscriptionId), auth: ctx.authHeader };
}

/**
 * Proxy a subscription-gated dashboard REST handler. Forwards the caller's
 * Bearer (the internal cube-proxy header only bypasses `/api/v2/cube`).
 */
export async function svc(
  method: 'GET' | 'POST',
  prefix: string,
  p: SvcParent,
  subPath: string,
  opts?: { body?: Record<string, unknown>; query?: Record<string, unknown> },
): Promise<unknown> {
  const u = new URL(`${INTERNAL_BASE}/api/v2/${prefix}/${p.sub}${subPath}`);
  if (opts?.query) appendParams(u.searchParams, opts.query);
  const headers: Record<string, string> = { accept: 'application/json' };
  if (p.auth) headers.authorization = p.auth;
  const init: RequestInit = { method, headers };
  if (method === 'POST') {
    headers['content-type'] = 'application/json';
    init.body = JSON.stringify(opts?.body ?? {});
  }
  try {
    const r = await fetch(u, init);
    const txt = await r.text();
    let j: Record<string, unknown>;
    try { j = JSON.parse(txt) as Record<string, unknown>; }
    catch { throw new GraphQLError(`${subPath} returned non-JSON`, { extensions: { code: 'CUBE_ERROR' } }); }
    if (!r.ok || j.success === false) {
      throw new GraphQLError(String(j.error ?? j.message ?? `${subPath} failed`), {
        extensions: { code: r.status === 401 || r.status === 403 ? 'FORBIDDEN' : 'CUBE_ERROR' },
      });
    }
    return j;
  } catch (err) {
    if (err instanceof GraphQLError) throw err;
    throw new GraphQLError(`${subPath} unavailable: ${(err as Error).message}`, { extensions: { code: 'CUBE_ERROR' } });
  }
}
