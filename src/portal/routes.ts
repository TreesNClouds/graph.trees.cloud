import { Router, type Request, type Response } from 'express';
import crypto from 'node:crypto';
import { createAnonClient, createServiceClient, createUserClient, supabaseAnonKey, supabaseUrl } from './supabase';
import { bearer, listSeats, listWorkspaces, requireWorkspace, userFromToken } from './access';
import {
  addPaymentMethod,
  billingPublicConfig,
  cancelSubscription,
  createBasicPlan,
  getWorkspaceBilling,
  listPaymentMethods,
  listPricing,
  purchasePaidPlan,
  removePaymentMethod,
  setDefaultPaymentMethod,
} from './billing';

const router: Router = Router();

function fail(res: Response, status: number, message: string): void {
  res.status(status).json({ success: false, error: message });
}

async function authed(req: Request, res: Response) {
  const token = bearer(req);
  if (!token) {
    fail(res, 401, 'Missing Authorization: Bearer <access token>');
    return null;
  }
  const auth = await userFromToken(token);
  if (!auth) {
    fail(res, 401, 'Invalid or expired session');
    return null;
  }
  return { ...auth, token };
}

function originOf(req: Request): string {
  const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol;
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}`;
}

router.post('/auth/signup', async (req, res) => {
  try {
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const password = String(req.body?.password ?? '');
    if (!email.includes('@') || password.length < 8) {
      fail(res, 400, 'Valid email and a password of at least 8 characters are required');
      return;
    }
    const sb = createAnonClient();
    const { data, error } = await sb.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${originOf(req)}/confirm` },
    });
    if (error) {
      fail(res, 400, error.message);
      return;
    }
    res.json({
      success: true,
      needsEmailConfirm: !data.session,
      access_token: data.session?.access_token ?? null,
      refresh_token: data.session?.refresh_token ?? null,
      expires_at: data.session?.expires_at ?? null,
      user: data.user ? { id: data.user.id, email: data.user.email } : null,
    });
  } catch (err) {
    fail(res, 500, (err as Error).message);
  }
});

router.post('/auth/login', async (req, res) => {
  try {
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const password = String(req.body?.password ?? '');
    if (!email || !password) {
      fail(res, 400, 'Email and password are required');
      return;
    }
    const sb = createAnonClient();
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error || !data.session) {
      fail(res, 401, error?.message || 'Invalid email or password');
      return;
    }
    res.json({
      success: true,
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_at: data.session.expires_at,
      user: { id: data.user.id, email: data.user.email },
    });
  } catch (err) {
    fail(res, 500, (err as Error).message);
  }
});

router.post('/auth/refresh', async (req, res) => {
  try {
    const refresh_token = String(req.body?.refresh_token ?? '');
    if (!refresh_token) {
      fail(res, 400, 'Refresh token is required');
      return;
    }
    const sb = createAnonClient();
    const { data, error } = await sb.auth.refreshSession({ refresh_token });
    if (error || !data.session) {
      fail(res, 401, error?.message || 'Invalid or expired refresh token');
      return;
    }
    res.json({
      success: true,
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_at: data.session.expires_at,
      user: data.user ? { id: data.user.id, email: data.user.email } : null,
    });
  } catch (err) {
    fail(res, 500, (err as Error).message);
  }
});

router.get('/auth/google', (req, res) => {
  const challenge = String(req.query.code_challenge ?? '');
  if (challenge.length < 20) {
    fail(res, 400, 'Missing PKCE code_challenge');
    return;
  }
  const requested = String(req.query.redirect_to ?? '');
  const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:3401')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const fallback = `${originOf(req)}/confirm`;
  const redirectTo =
    requested && allowedOrigins.some((origin) => requested.startsWith(`${origin}/`))
      ? requested
      : fallback;
  const params = new URLSearchParams({
    provider: 'google',
    redirect_to: redirectTo,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });
  res.redirect(302, `${supabaseUrl()}/auth/v1/authorize?${params}`);
});

router.post('/auth/oauth', async (req, res) => {
  try {
    const code = String(req.body?.code ?? '');
    const code_verifier = String(req.body?.code_verifier ?? '');
    if (!code || !code_verifier) {
      fail(res, 400, 'Missing OAuth code');
      return;
    }
    const r = await fetch(`${supabaseUrl()}/auth/v1/token?grant_type=pkce`, {
      method: 'POST',
      headers: {
        apikey: supabaseAnonKey(),
        Authorization: `Bearer ${supabaseAnonKey()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ auth_code: code, code_verifier }),
    });
    const data = (await r.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_at?: number;
      user?: { id?: string; email?: string };
      error_description?: string;
      msg?: string;
      error?: string;
    };
    if (!r.ok || !data.access_token) {
      fail(res, 401, data.error_description || data.msg || data.error || 'Google sign-in failed');
      return;
    }
    res.json({
      success: true,
      access_token: data.access_token,
      refresh_token: data.refresh_token ?? null,
      expires_at: data.expires_at ?? null,
      user: data.user ? { id: data.user.id, email: data.user.email } : null,
    });
  } catch (err) {
    fail(res, 500, (err as Error).message);
  }
});

router.post('/auth/confirm', async (req, res) => {
  try {
    const token_hash = String(req.body?.token_hash ?? '');
    const type = (req.body?.type as 'email' | 'signup' | undefined) || 'email';
    if (!token_hash) {
      fail(res, 400, 'token_hash is required');
      return;
    }
    const sb = createAnonClient();
    const { data, error } = await sb.auth.verifyOtp({ token_hash, type });
    if (error || !data.session) {
      fail(res, 400, error?.message || 'Could not confirm email');
      return;
    }
    res.json({
      success: true,
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_at: data.session.expires_at,
      user: data.user ? { id: data.user.id, email: data.user.email } : null,
    });
  } catch (err) {
    fail(res, 500, (err as Error).message);
  }
});

router.get('/billing/account', async (req, res) => {
  const auth = await authed(req, res);
  if (!auth) return;
  try {
    const [plans, methods] = await Promise.all([
      listPricing(),
      listPaymentMethods(auth.user.id).catch(() => []),
    ]);
    res.json({
      success: true,
      data: {
        canManageBilling: true,
        plans,
        methods,
        accept: billingPublicConfig(),
        payment_status: null,
        history: [],
        workspace: null,
      },
    });
  } catch (err) {
    fail(res, 500, (err as Error).message);
  }
});

router.get('/billing/config', async (req, res) => {
  const auth = await authed(req, res);
  if (!auth) return;
  res.json({ success: true, data: billingPublicConfig() });
});

router.get('/billing/pricing', async (req, res) => {
  const auth = await authed(req, res);
  if (!auth) return;
  try {
    res.json({ success: true, data: { plans: await listPricing() } });
  } catch (err) {
    fail(res, 500, (err as Error).message);
  }
});

router.get('/billing/methods', async (req, res) => {
  const auth = await authed(req, res);
  if (!auth) return;
  try {
    res.json({ success: true, data: { methods: await listPaymentMethods(auth.user.id) } });
  } catch (err) {
    fail(res, 500, (err as Error).message);
  }
});

router.post('/billing/methods', async (req, res) => {
  const auth = await authed(req, res);
  if (!auth) return;
  try {
    const opaque = req.body?.opaqueData;
    const billingAddress = req.body?.billingAddress;
    if (!opaque?.dataDescriptor || !opaque?.dataValue) {
      fail(res, 400, 'Tokenized card data is required');
      return;
    }
    if (!billingAddress?.firstName || !billingAddress?.address || !billingAddress?.zip) {
      fail(res, 400, 'Billing address is required');
      return;
    }
    const result = await addPaymentMethod(auth.user.id, auth.email, { opaqueData: opaque, billingAddress });
    res.json({ success: true, data: result });
  } catch (err) {
    fail(res, 400, (err as Error).message);
  }
});

router.post('/billing/methods/:id/default', async (req, res) => {
  const auth = await authed(req, res);
  if (!auth) return;
  try {
    await setDefaultPaymentMethod(auth.user.id, Number(req.params.id));
    res.json({ success: true });
  } catch (err) {
    fail(res, 400, (err as Error).message);
  }
});

router.delete('/billing/methods/:id', async (req, res) => {
  const auth = await authed(req, res);
  if (!auth) return;
  try {
    await removePaymentMethod(auth.user.id, Number(req.params.id));
    res.json({ success: true });
  } catch (err) {
    fail(res, 400, (err as Error).message);
  }
});

router.post('/billing/subscribe', async (req, res) => {
  const auth = await authed(req, res);
  if (!auth) return;
  try {
    const plan = String(req.body?.plan || '');
    if (plan === 'basic') {
      const result = await createBasicPlan(auth.user.id);
      res.json({ success: true, data: result });
      return;
    }
    if (plan !== 'pro' && plan !== 'enterprise') {
      fail(res, 400, 'Plan must be basic, pro, or enterprise');
      return;
    }
    const paymentMethodId = Number(req.body?.paymentMethodId);
    if (!paymentMethodId) {
      fail(res, 400, 'Select a payment method');
      return;
    }
    const result = await purchasePaidPlan(auth.user.id, auth.email, { tier: plan, paymentMethodId });
    res.json({ success: true, data: result });
  } catch (err) {
    fail(res, 400, (err as Error).message);
  }
});

router.get('/me', async (req, res) => {
  const auth = await authed(req, res);
  if (!auth) return;
  try {
    const workspaces = await listWorkspaces(auth.profileId, auth.user.id);
    res.json({
      success: true,
      user: {
        id: auth.user.id,
        email: auth.email,
        emailConfirmedAt: auth.user.email_confirmed_at ?? null,
        profileId: auth.profileId,
      },
      workspaces,
    });
  } catch (err) {
    fail(res, 500, (err as Error).message);
  }
});

router.post('/join', async (req, res) => {
  const auth = await authed(req, res);
  if (!auth) return;
  try {
    const invitation_token = String(req.body?.invitation_token ?? '').trim();
    if (!invitation_token) {
      fail(res, 400, 'Invitation code is required');
      return;
    }
    const service = createServiceClient();
    const { data: seat, error: findError } = await service
      .from('data_sass_seats')
      .select('id, fk_subscription_id, invitation_status, fk_seat_user_id')
      .eq('invitation_token', invitation_token)
      .is('date_removed', null)
      .maybeSingle();
    if (findError) {
      fail(res, 500, findError.message);
      return;
    }
    if (!seat || seat.fk_seat_user_id || seat.invitation_status !== 'pending') {
      fail(res, 400, 'Invalid or already-used invitation code');
      return;
    }
    const { error: upErr } = await service
      .from('data_sass_seats')
      .update({
        fk_seat_user_id: auth.profileId,
        invitation_status: 'accepted',
        is_active: true,
        date_modified: new Date().toISOString(),
      })
      .eq('id', seat.id);
    if (upErr) {
      fail(res, 500, upErr.message);
      return;
    }
    res.json({ success: true, subscriptionId: seat.fk_subscription_id });
  } catch (err) {
    fail(res, 500, (err as Error).message);
  }
});

async function workspaceOrFail(req: Request, res: Response) {
  const auth = await authed(req, res);
  if (!auth) return null;
  const subscriptionId = Number(req.params.subscriptionId);
  if (!Number.isFinite(subscriptionId)) {
    fail(res, 400, 'Invalid subscription id');
    return null;
  }
  const ws = await requireWorkspace(auth.profileId, auth.user.id, subscriptionId);
  if (!ws) {
    fail(res, 403, 'You do not have access to this workspace');
    return null;
  }
  return { auth, ws, subscriptionId };
}

router.get('/workspaces/:subscriptionId/keys', async (req, res) => {
  const ctx = await workspaceOrFail(req, res);
  if (!ctx) return;
  try {
    const sb = createUserClient(ctx.auth.token);
    const { data, error } = await sb
      .schema('tnc_api')
      .from('api_keys')
      .select('key_id, name, permissions, is_active, expires_at, last_used_at, created_at')
      .eq('subscription_id', ctx.subscriptionId)
      .order('created_at', { ascending: false });
    if (error) {
      const service = createServiceClient();
      const fallback = await service
        .schema('tnc_api')
        .from('api_keys')
        .select('key_id, name, permissions, is_active, expires_at, last_used_at, created_at')
        .eq('subscription_id', ctx.subscriptionId)
        .order('created_at', { ascending: false });
      if (fallback.error) {
        fail(res, 500, fallback.error.message);
        return;
      }
      res.json({ success: true, data: { api_keys: fallback.data ?? [], subscription_id: ctx.subscriptionId } });
      return;
    }
    res.json({ success: true, data: { api_keys: data ?? [], subscription_id: ctx.subscriptionId } });
  } catch (err) {
    fail(res, 500, (err as Error).message);
  }
});

router.post('/workspaces/:subscriptionId/keys', async (req, res) => {
  const ctx = await workspaceOrFail(req, res);
  if (!ctx) return;
  try {
    const name = String(req.body?.name ?? '').trim();
    const permissions = Array.isArray(req.body?.permissions) ? req.body.permissions : ['read'];
    const expires_in_days = req.body?.expires_in_days ? Number(req.body.expires_in_days) : undefined;
    if (name.length < 3) {
      fail(res, 400, 'API key name must be at least 3 characters');
      return;
    }
    const keySecret = crypto.randomBytes(32).toString('hex');
    const environment = process.env.NODE_ENV === 'production' ? 'live' : 'test';
    const apiKey = `tnc_${environment}_${keySecret}`;
    const keyId = `tnc_key_${keySecret.substring(0, 8)}`;
    const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');
    const expiresAt = expires_in_days
      ? new Date(Date.now() + expires_in_days * 24 * 60 * 60 * 1000).toISOString()
      : null;
    const row = {
      key_id: keyId,
      key_hash: keyHash,
      user_id: ctx.auth.user.id,
      subscription_id: ctx.subscriptionId,
      name,
      permissions,
      expires_at: expiresAt,
      is_active: true,
      created_by: ctx.auth.user.id,
    };
    const userSb = createUserClient(ctx.auth.token);
    let insertError = (await userSb.schema('tnc_api').from('api_keys').insert(row)).error;
    if (insertError) {
      insertError = (await createServiceClient().schema('tnc_api').from('api_keys').insert(row)).error;
    }
    if (insertError) {
      fail(res, 500, insertError.message || 'Failed to create API key');
      return;
    }
    res.json({
      success: true,
      data: {
        key_id: keyId,
        api_key: apiKey,
        name,
        permissions,
        expires_at: expiresAt,
        created_at: new Date().toISOString(),
        subscription_id: ctx.subscriptionId,
      },
    });
  } catch (err) {
    fail(res, 500, (err as Error).message);
  }
});

router.delete('/workspaces/:subscriptionId/keys/:keyId', async (req, res) => {
  const ctx = await workspaceOrFail(req, res);
  if (!ctx) return;
  try {
    const keyId = String(req.params.keyId ?? '');
    const userSb = createUserClient(ctx.auth.token);
    let error = (await userSb
      .schema('tnc_api')
      .from('api_keys')
      .update({ is_active: false })
      .eq('key_id', keyId)
      .eq('subscription_id', ctx.subscriptionId)).error;
    if (error) {
      error = (await createServiceClient()
        .schema('tnc_api')
        .from('api_keys')
        .update({ is_active: false })
        .eq('key_id', keyId)
        .eq('subscription_id', ctx.subscriptionId)).error;
    }
    if (error) {
      fail(res, 500, error.message);
      return;
    }
    res.json({ success: true, message: 'API key revoked', data: { key_id: keyId } });
  } catch (err) {
    fail(res, 500, (err as Error).message);
  }
});

router.get('/workspaces/:subscriptionId/usage', async (req, res) => {
  const ctx = await workspaceOrFail(req, res);
  if (!ctx) return;
  try {
    const service = createServiceClient();
    const { data: tierInfo } = await service
      .schema('tnc_api')
      .from('tier_limits')
      .select('monthly_credits')
      .eq('tier_name', ctx.ws.apiTier)
      .maybeSingle();
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const nextMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1);
    const { data: usageData } = await service
      .schema('tnc_api')
      .from('usage_entries')
      .select('id, timestamp, request_type, endpoint, cost_credits, response_time_ms')
      .eq('fk_data_subscription_id', ctx.subscriptionId)
      .gte('timestamp', monthStart.toISOString())
      .lt('timestamp', nextMonth.toISOString())
      .order('timestamp', { ascending: false })
      .limit(200);
    const monthlyLimit = tierInfo?.monthly_credits ?? 0;
    const creditsUsed = (usageData ?? []).reduce((sum, e) => sum + (e.cost_credits ?? 0), 0);
    res.json({
      success: true,
      data: {
        subscription: { id: ctx.ws.id, name: ctx.ws.name, tier: ctx.ws.apiTier, is_active: ctx.ws.isActive },
        current_period: {
          start_date: monthStart.toISOString(),
          credits_used: creditsUsed,
          credits_remaining: monthlyLimit - creditsUsed,
          monthly_limit: monthlyLimit,
          usage_percentage: monthlyLimit ? Math.round((creditsUsed / monthlyLimit) * 100) : 0,
        },
        entries: usageData ?? [],
      },
    });
  } catch (err) {
    fail(res, 500, (err as Error).message);
  }
});

router.get('/workspaces/:subscriptionId/billing', async (req, res) => {
  const ctx = await workspaceOrFail(req, res);
  if (!ctx) return;
  if (!ctx.ws.canViewBilling && ctx.ws.role !== 'owner') {
    fail(res, 403, 'You cannot view billing for this workspace');
    return;
  }
  try {
    const [{ history, payment_status }, plans, methods] = await Promise.all([
      getWorkspaceBilling(ctx.subscriptionId, ctx.ws.endDate),
      listPricing(),
      listPaymentMethods(ctx.auth.user.id).catch(() => []),
    ]);
    res.json({
      success: true,
      data: {
        workspace: ctx.ws,
        canManageBilling: ctx.ws.role === 'owner',
        payment_status,
        history,
        plans,
        methods,
        accept: billingPublicConfig(),
      },
    });
  } catch (err) {
    fail(res, 500, (err as Error).message);
  }
});

router.post('/workspaces/:subscriptionId/billing/cancel', async (req, res) => {
  const ctx = await workspaceOrFail(req, res);
  if (!ctx) return;
  if (ctx.ws.role !== 'owner') {
    fail(res, 403, 'Only the workspace owner can cancel billing');
    return;
  }
  try {
    await cancelSubscription(ctx.auth.profileId, ctx.subscriptionId);
    res.json({ success: true });
  } catch (err) {
    fail(res, 400, (err as Error).message);
  }
});

router.get('/workspaces/:subscriptionId/team', async (req, res) => {
  const ctx = await workspaceOrFail(req, res);
  if (!ctx) return;
  try {
    const seats = await listSeats(ctx.subscriptionId);
    res.json({
      success: true,
      data: {
        canManageTeam: ctx.ws.canManageTeam,
        seats: seats.map((s) => ({
          id: s.id,
          email: s.user_profile?.email || s.email,
          name: [s.user_profile?.name_first, s.user_profile?.name_last].filter(Boolean).join(' ') || null,
          role: s.role,
          is_active: s.is_active,
          invitation_status: s.invitation_status,
          invitation_token: ctx.ws.canManageTeam ? s.invitation_token : null,
          can_manage_team: s.can_manage_team,
        })),
      },
    });
  } catch (err) {
    fail(res, 500, (err as Error).message);
  }
});

router.post('/workspaces/:subscriptionId/team', async (req, res) => {
  const ctx = await workspaceOrFail(req, res);
  if (!ctx) return;
  if (!ctx.ws.canManageTeam) {
    fail(res, 403, 'You do not have permission to manage team members');
    return;
  }
  try {
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    if (!email.includes('@')) {
      fail(res, 400, 'Please enter a valid email address');
      return;
    }
    const service = createServiceClient();
    const { data: existing } = await service
      .from('data_sass_seats')
      .select('id, fk_seat_user_id')
      .eq('fk_subscription_id', ctx.subscriptionId)
      .eq('email', email)
      .is('date_removed', null)
      .maybeSingle();
    if (existing) {
      fail(res, 400, existing.fk_seat_user_id ? 'A team member with this email already exists' : 'An invitation for this email is already pending');
      return;
    }
    const { data: subscription } = await service
      .from('data_sass_subscriptions')
      .select('fk_user_profile_id')
      .eq('id', ctx.subscriptionId)
      .single();
    if (!subscription) {
      fail(res, 404, 'Subscription not found');
      return;
    }
    let invitationToken = `${ctx.subscriptionId}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    for (let i = 0; i < 8; i++) {
      const { data: taken } = await service.from('data_sass_seats').select('id').eq('invitation_token', invitationToken).maybeSingle();
      if (!taken) break;
      invitationToken = `${ctx.subscriptionId}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    }
    const { error } = await service.from('data_sass_seats').insert({
      fk_subscription_id: ctx.subscriptionId,
      fk_base_subscription_id: ctx.subscriptionId,
      fk_owner_user_id: subscription.fk_user_profile_id,
      email,
      invitation_token: invitationToken,
      invitation_status: 'pending',
      fk_seat_user_id: null,
    });
    if (error) {
      fail(res, 500, error.message);
      return;
    }
    res.json({ success: true, invitationToken, joinUrl: `${originOf(req)}/join?code=${encodeURIComponent(invitationToken)}` });
  } catch (err) {
    fail(res, 500, (err as Error).message);
  }
});

router.delete('/workspaces/:subscriptionId/team/:seatId', async (req, res) => {
  const ctx = await workspaceOrFail(req, res);
  if (!ctx) return;
  if (!ctx.ws.canManageTeam) {
    fail(res, 403, 'Only owners and team admins can remove members');
    return;
  }
  try {
    const seatId = Number(req.params.seatId);
    const service = createServiceClient();
    const { data: seat } = await service
      .from('data_sass_seats')
      .select('id, fk_subscription_id')
      .eq('id', seatId)
      .is('date_removed', null)
      .maybeSingle();
    if (!seat || seat.fk_subscription_id !== ctx.subscriptionId) {
      fail(res, 404, 'Seat not found');
      return;
    }
    const { error } = await service
      .from('data_sass_seats')
      .update({ date_removed: new Date().toISOString(), date_modified: new Date().toISOString() })
      .eq('id', seatId);
    if (error) {
      fail(res, 500, error.message);
      return;
    }
    res.json({ success: true });
  } catch (err) {
    fail(res, 500, (err as Error).message);
  }
});

export const portalRouter = router;
