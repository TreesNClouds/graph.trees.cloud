import type { SupabaseClient, User } from '@supabase/supabase-js';
import { createServiceClient, createUserClient } from './supabase';

export type PortalUser = {
  id: string;
  email: string | null;
  emailConfirmedAt: string | null;
  profileId: number;
  name: string;
};

export type Workspace = {
  id: number;
  name: string;
  status: string;
  isActive: boolean;
  apiTier: string;
  subscriptionTier: string;
  role: 'owner' | 'member';
  canManageTeam: boolean;
  canViewBilling: boolean;
  startDate: string | null;
  endDate: string | null;
};

type SeatRow = {
  id: number;
  email: string | null;
  role: string | null;
  is_active: boolean | null;
  invitation_status: string | null;
  invitation_token: string | null;
  can_manage_team: boolean | null;
  can_view_billing: boolean | null;
  fk_subscription_id: number | null;
  fk_seat_user_id: number | null;
  user_profile?: { email?: string | null; name_first?: string | null; name_last?: string | null } | null;
};

export async function userFromToken(accessToken: string): Promise<{ user: User; profileId: number; email: string | null } | null> {
  const sb = createUserClient(accessToken);
  const { data, error } = await sb.auth.getUser(accessToken);
  if (error || !data.user) return null;
  const service = createServiceClient();
  const { data: profile } = await service
    .from('user_profiles')
    .select('id, email, name_first, name_last')
    .eq('uid', data.user.id)
    .eq('site_type', 'data')
    .maybeSingle();
  if (!profile) return null;
  return { user: data.user, profileId: profile.id as number, email: data.user.email ?? profile.email };
}

export function toPortalUser(auth: NonNullable<Awaited<ReturnType<typeof userFromToken>>>, profileName?: string): PortalUser {
  return {
    id: auth.user.id,
    email: auth.email,
    emailConfirmedAt: auth.user.email_confirmed_at ?? null,
    profileId: auth.profileId,
    name: profileName || auth.email || '',
  };
}

export async function listWorkspaces(profileId: number, authUid: string): Promise<Workspace[]> {
  const service = createServiceClient();
  const { data: owned } = await service
    .from('data_sass_subscriptions')
    .select('id, status, is_active, tnc_api_tier, subscription_tier, visible_space_name, start_date, end_date, date_removed')
    .eq('fk_user_profile_id', profileId)
    .is('date_removed', null);

  const { data: seats } = await service
    .from('data_sass_seats')
    .select('id, is_active, can_manage_team, can_view_billing, fk_subscription_id, invitation_status')
    .eq('fk_seat_user_id', profileId)
    .is('date_removed', null);

  const out = new Map<number, Workspace>();
  for (const sub of owned ?? []) {
    out.set(sub.id, {
      id: sub.id,
      name: sub.visible_space_name || `Workspace ${sub.id}`,
      status: sub.status,
      isActive: Boolean(sub.is_active),
      apiTier: sub.tnc_api_tier || 'free',
      subscriptionTier: sub.subscription_tier || 'basic',
      role: 'owner',
      canManageTeam: true,
      canViewBilling: true,
      startDate: sub.start_date,
      endDate: sub.end_date,
    });
  }

  const seatSubIds = [...new Set((seats ?? []).map((s) => s.fk_subscription_id).filter(Boolean))] as number[];
  if (seatSubIds.length) {
    const { data: seatSubs } = await service
      .from('data_sass_subscriptions')
      .select('id, status, is_active, tnc_api_tier, subscription_tier, visible_space_name, start_date, end_date, date_removed')
      .in('id', seatSubIds)
      .is('date_removed', null);
    for (const sub of seatSubs ?? []) {
      if (out.has(sub.id)) continue;
      const seat = (seats ?? []).find((s) => s.fk_subscription_id === sub.id);
      const accepted = seat?.invitation_status === 'accepted' || seat?.is_active;
      if (!accepted) continue;
      out.set(sub.id, {
        id: sub.id,
        name: sub.visible_space_name || `Workspace ${sub.id}`,
        status: sub.status,
        isActive: Boolean(sub.is_active),
        apiTier: sub.tnc_api_tier || 'free',
        subscriptionTier: sub.subscription_tier || 'basic',
        role: 'member',
        canManageTeam: Boolean(seat?.can_manage_team),
        canViewBilling: Boolean(seat?.can_view_billing),
        startDate: sub.start_date,
        endDate: sub.end_date,
      });
    }
  }

  void authUid;
  return [...out.values()].sort((a, b) => a.id - b.id);
}

export async function requireWorkspace(
  profileId: number,
  authUid: string,
  subscriptionId: number,
): Promise<Workspace | null> {
  const all = await listWorkspaces(profileId, authUid);
  return all.find((w) => w.id === subscriptionId) ?? null;
}

export async function listSeats(subscriptionId: number): Promise<SeatRow[]> {
  const service = createServiceClient();
  const joined = await service
    .from('data_sass_seats')
    .select('id, email, role, is_active, invitation_status, invitation_token, can_manage_team, can_view_billing, fk_subscription_id, fk_seat_user_id, user_profile:user_profiles!fk_seat_user_id(email, name_first, name_last)')
    .eq('fk_subscription_id', subscriptionId)
    .is('date_removed', null)
    .order('id', { ascending: true });
  if (!joined.error) return (joined.data ?? []) as SeatRow[];
  const { data, error } = await service
    .from('data_sass_seats')
    .select('id, email, role, is_active, invitation_status, invitation_token, can_manage_team, can_view_billing, fk_subscription_id, fk_seat_user_id')
    .eq('fk_subscription_id', subscriptionId)
    .is('date_removed', null)
    .order('id', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as SeatRow[];
}

export function bearer(req: { headers: { authorization?: string } }): string | null {
  const h = req.headers.authorization ?? '';
  if (!h.startsWith('Bearer ')) return null;
  const t = h.slice(7).trim();
  return t || null;
}
