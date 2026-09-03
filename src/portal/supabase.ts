import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import ws from 'ws';

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}

export function supabaseUrl(): string {
  return requireEnv('SUPABASE_URL');
}

export function supabaseAnonKey(): string {
  return requireEnv('SUPABASE_ANON_KEY');
}

const nodeCompat = {
  auth: { autoRefreshToken: false, persistSession: false },
  realtime: { transport: ws as unknown as typeof WebSocket },
};

export function createServiceClient(): SupabaseClient {
  return createClient(supabaseUrl(), requireEnv('SUPABASE_SERVICE_ROLE_KEY'), nodeCompat);
}

export function createUserClient(accessToken: string): SupabaseClient {
  return createClient(supabaseUrl(), requireEnv('SUPABASE_ANON_KEY'), {
    ...nodeCompat,
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

export function createAnonClient(): SupabaseClient {
  return createClient(supabaseUrl(), requireEnv('SUPABASE_ANON_KEY'), nodeCompat);
}
