import type { AuthenticatedRequestI } from '@/lib/types/auth.types';

export type KeyInfo = NonNullable<AuthenticatedRequestI['apiKey']>;

export interface Ctx {
  apiKey: KeyInfo | null;
  authHeader: string;
}

export type SvcParent = { sub: number; auth: string };
export type SvcArgs = Record<string, unknown> & { input?: Record<string, unknown> };

/** One cube (or shared kernel) that the GraphQL server merges. */
export interface CubeModule {
  typeDefs: string;
  queryFields: string;
  resolvers: Record<string, unknown>;
}

export function mergeResolvers(modules: CubeModule[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const m of modules) {
    for (const [key, val] of Object.entries(m.resolvers)) {
      if (val && typeof val === 'object' && !('serialize' in val)) {
        out[key] = { ...(out[key] as object | undefined), ...(val as object) };
      } else {
        out[key] = val;
      }
    }
  }
  return out;
}
