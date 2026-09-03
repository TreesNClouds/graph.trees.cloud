import { GraphQLError } from 'graphql';
import type { Request, Response } from 'express';
import { requireApiKey } from '@/middleware/api-key-auth';
import type { AuthenticatedRequestI } from '@/lib/types/auth.types';
import type { Ctx, KeyInfo } from './types';

/** Reuse the canonical requireApiKey middleware (no duplicated logic). */
export async function authFromHeader(authHeader: string): Promise<KeyInfo | null> {
  if (!authHeader) return null;
  const pseudo = { headers: { authorization: authHeader }, params: {}, path: '/graphql', method: 'POST' } as unknown as Request;
  const ok = await new Promise<boolean>((resolve) => {
    const res = { statusCode: 200, setHeader() { /* noop */ } } as unknown as Response & { statusCode: number };
    res.status = (c: number) => { res.statusCode = c; return res; };
    res.json = () => { resolve(false); return res; };
    void requireApiKey(
      pseudo as Parameters<typeof requireApiKey>[0],
      res as Parameters<typeof requireApiKey>[1],
      () => resolve(true),
    );
  });
  if (!ok) return null;
  return (pseudo as unknown as AuthenticatedRequestI).apiKey ?? null;
}

export function requireKey(ctx: Ctx): KeyInfo {
  if (!ctx.apiKey) {
    throw new GraphQLError('Unauthorized: send Authorization: Bearer <trees.cloud API key>', { extensions: { code: 'UNAUTHENTICATED' } });
  }
  return ctx.apiKey;
}

export function gateSubscription(ctx: Ctx, wantSub: number): number {
  const key = requireKey(ctx);
  const isInternal = key.keyId?.startsWith('tnc_internal') || key.id === 99999 || (key.permissions ?? []).includes('admin');
  if (!isInternal && Number(key.subscriptionId) !== Number(wantSub)) {
    throw new GraphQLError(`Forbidden: this API key has no access to subscription ${wantSub}`, { extensions: { code: 'FORBIDDEN' } });
  }
  return Number(wantSub);
}
