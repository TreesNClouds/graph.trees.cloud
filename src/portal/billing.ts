import crypto from 'node:crypto';
import { createServiceClient } from './supabase';
import {
  acceptJsPublicConfig,
  authorizeNetConfigured,
  cancelArbSubscription,
  chargeProfile,
  createArbSubscription,
  createCustomerProfile,
  createPaymentProfile,
  deletePaymentProfile,
  getPaymentProfileDetails,
} from './authorize-net';

export type PricingTier = 'basic' | 'pro' | 'enterprise';

export type PaymentMethodRow = {
  id: number;
  description: string;
  type: string;
  provider: string;
  isActive: boolean;
  providerPaymentId: string;
};

type ProfileRow = {
  id: number;
  email: string | null;
  adn_customer_id: string | null;
};

async function profileFor(uid: string): Promise<ProfileRow> {
  const service = createServiceClient();
  const { data, error } = await service
    .from('user_profiles')
    .select('id, email, adn_customer_id')
    .eq('uid', uid)
    .eq('site_type', 'data')
    .maybeSingle();
  if (error || !data) throw new Error('User profile not found');
  return data as ProfileRow;
}

export function billingPublicConfig() {
  return {
    configured: authorizeNetConfigured(),
    ...acceptJsPublicConfig(),
  };
}

export async function listPricing() {
  const service = createServiceClient();
  const now = new Date().toISOString();
  const tiers: PricingTier[] = ['basic', 'pro', 'enterprise'];
  const out: Array<{ id: number; tier: PricingTier; amount: number; currency: string; itemType: string }> = [];
  for (const tier of tiers) {
    const { data } = await service
      .from('data_sass_pricing')
      .select('id, tier, amount, currency, item_type')
      .eq('tier', tier)
      .eq('item_type', 'base')
      .eq('is_active', true)
      .is('deprecated_at', null)
      .lte('effective_date', now)
      .order('effective_date', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) {
      out.push({
        id: data.id,
        tier: data.tier as PricingTier,
        amount: Number(data.amount),
        currency: data.currency || 'usd',
        itemType: data.item_type,
      });
    }
  }
  return out;
}

export async function ensureAdnCustomer(uid: string, email: string | null): Promise<string> {
  const service = createServiceClient();
  const profile = await profileFor(uid);
  if (profile.adn_customer_id) return profile.adn_customer_id;
  if (!authorizeNetConfigured()) throw new Error('Authorize.net is not configured');
  const merchantCustomerId = crypto.createHash('sha256').update(uid).digest('hex').slice(0, 20);
  const customerId = await createCustomerProfile({
    merchantCustomerId,
    email: email || profile.email || '',
    description: `Trees Cloud ${uid.slice(0, 10)}`,
  });
  const { error } = await service
    .from('user_profiles')
    .update({ adn_customer_id: customerId })
    .eq('id', profile.id)
    .eq('site_type', 'data');
  if (error) throw new Error('Failed to store Authorize.net customer id');
  return customerId;
}

export async function listPaymentMethods(uid: string): Promise<PaymentMethodRow[]> {
  const profile = await profileFor(uid);
  const service = createServiceClient();
  const { data, error } = await service.rpc('data_sass_get_user_payment_methods', { p_user_id: profile.id });
  if (error) {
    const { data: cards, error: cardErr } = await service
      .schema('data_sass_internal_billing')
      .from('data_sass_adn_billing_profiles')
      .select('id, description, payment_type, adn_customer_payment_profile_id')
      .eq('fk_user_id', profile.id)
      .is('date_removed', null);
    if (cardErr) throw new Error(error.message);
    return (cards ?? []).map((c) => ({
      id: c.id,
      description: c.description || 'Card',
      type: c.payment_type || 'credit',
      provider: 'authorize_net',
      isActive: false,
      providerPaymentId: c.adn_customer_payment_profile_id,
    }));
  }
  return (data ?? []).map((m: {
    p_id: number;
    p_is_active: boolean;
    p_payment_description: string;
    p_payment_method_id: number;
    p_payment_provider: string;
    p_payment_type: string;
    p_provider_payment_identifier: string;
  }) => ({
    id: m.p_payment_method_id || m.p_id,
    description: m.p_payment_description,
    type: m.p_payment_type,
    provider: m.p_payment_provider,
    isActive: Boolean(m.p_is_active),
    providerPaymentId: m.p_provider_payment_identifier,
  }));
}

export async function addPaymentMethod(uid: string, email: string | null, body: {
  opaqueData: { dataDescriptor: string; dataValue: string };
  billingAddress: {
    firstName: string;
    lastName: string;
    company?: string;
    address: string;
    city: string;
    state: string;
    zip: string;
    country: string;
    phoneNumber?: string;
  };
}): Promise<{ paymentId: string }> {
  const profile = await profileFor(uid);
  const customerId = await ensureAdnCustomer(uid, email);
  const paymentProfileId = await createPaymentProfile({
    customerProfileId: customerId,
    dataDescriptor: body.opaqueData.dataDescriptor,
    dataValue: body.opaqueData.dataValue,
    billing: body.billingAddress,
  });
  const details = await getPaymentProfileDetails(customerId, paymentProfileId);
  const service = createServiceClient();
  const { data: created, error } = await service.rpc('data_sass_create_adn_payment_profile', {
    p_adn_customer_payment_profile_id: paymentProfileId,
    p_payment_type: details.paymentType,
    p_description: details.description,
    p_adn_customer_id: customerId,
  });
  if (error) throw new Error(error.message);
  const methods = await listPaymentMethods(uid);
  const createdId = (created as { id?: number } | null)?.id;
  if (!methods.some((m) => m.isActive) && createdId) {
    await service.rpc('data_sass_set_active_payment_method', {
      p_payment_method_id: createdId,
      p_payment_type: details.paymentType,
      p_provider: 'authorize_net',
      p_user_id: profile.id,
    });
  }
  return { paymentId: paymentProfileId };
}

export async function setDefaultPaymentMethod(uid: string, paymentMethodId: number) {
  const profile = await profileFor(uid);
  const methods = await listPaymentMethods(uid);
  const method = methods.find((m) => m.id === paymentMethodId);
  if (!method) throw new Error('Payment method not found');
  const service = createServiceClient();
  const { error } = await service.rpc('data_sass_set_active_payment_method', {
    p_payment_method_id: paymentMethodId,
    p_payment_type: method.type,
    p_provider: method.provider || 'authorize_net',
    p_user_id: profile.id,
  });
  if (error) throw new Error(error.message);
}

export async function removePaymentMethod(uid: string, paymentMethodId: number) {
  const profile = await profileFor(uid);
  const methods = await listPaymentMethods(uid);
  const method = methods.find((m) => m.id === paymentMethodId);
  if (!method) throw new Error('Payment method not found');
  if (profile.adn_customer_id && method.providerPaymentId) {
    await deletePaymentProfile(profile.adn_customer_id, method.providerPaymentId);
  }
  const service = createServiceClient();
  const { error } = await service.rpc('data_sass_remove_adn_payment_profile', {
    p_adn_customer_payment_profile_id: method.providerPaymentId,
  });
  if (error) throw new Error(error.message);
}

export async function createBasicPlan(uid: string): Promise<{ subscriptionId: number }> {
  const profile = await profileFor(uid);
  const service = createServiceClient();
  const { data: existing } = await service
    .from('data_sass_subscriptions')
    .select('id')
    .eq('fk_user_profile_id', profile.id)
    .eq('subscription_tier', 'basic')
    .in('status', ['active', 'pending'])
    .eq('is_active', true)
    .is('date_removed', null)
    .maybeSingle();
  if (existing) throw new Error('You already have an active Basic subscription');

  const pricing = (await listPricing()).find((p) => p.tier === 'basic');
  const start = new Date();
  const end = new Date();
  end.setMonth(end.getMonth() + 1);
  const { data, error } = await service
    .from('data_sass_subscriptions')
    .insert({
      fk_user_profile_id: profile.id,
      start_date: start.toISOString(),
      end_date: end.toISOString(),
      status: 'active',
      fk_pricing_id: pricing?.id ?? null,
      subscription_tier: 'basic',
      auto_renew: true,
      is_active: true,
      renewal_anchor_date: end.toISOString(),
      tnc_api_tier: 'free',
    })
    .select('id')
    .single();
  if (error || !data) throw new Error(error?.message || 'Failed to create subscription');
  return { subscriptionId: data.id };
}

export async function purchasePaidPlan(uid: string, email: string | null, opts: {
  tier: 'pro' | 'enterprise';
  paymentMethodId: number;
}): Promise<{ subscriptionId: number; transactionId: string }> {
  const profile = await profileFor(uid);
  if (!profile.adn_customer_id) throw new Error('Add a payment method first');
  const pricing = (await listPricing()).find((p) => p.tier === opts.tier);
  if (!pricing) throw new Error(`No active ${opts.tier} pricing`);
  const service = createServiceClient();
  const { data: profiles, error: profileErr } = await service.rpc('data_sass_get_adn_billing_profile', {
    p_user_id: profile.id,
    p_billing_profile_id: opts.paymentMethodId,
  });
  const adnPaymentId = profiles?.[0]?.p_adn_customer_payment_profile_id;
  if (profileErr || !adnPaymentId) throw new Error('Payment method not found');

  const amount = Math.max(0.01, pricing.amount);
  const invoiceNumber = `INV-${Math.floor(Date.now() / 1000)}-${Math.floor(Math.random() * 1000)}`;
  const description = `Trees Cloud ${opts.tier} subscription`;
  const transactionId = await chargeProfile({
    customerProfileId: profile.adn_customer_id,
    customerPaymentProfileId: adnPaymentId,
    amount: amount.toFixed(2),
    invoiceNumber,
    description: `${description} — initial payment`,
  });

  const start = new Date();
  const end = new Date();
  end.setMonth(end.getMonth() + 1);
  const { data: sub, error: subErr } = await service
    .from('data_sass_subscriptions')
    .insert({
      fk_user_profile_id: profile.id,
      start_date: start.toISOString(),
      end_date: end.toISOString(),
      status: 'pending',
      fk_pricing_id: pricing.id,
      subscription_tier: opts.tier,
      auto_renew: true,
      is_active: false,
      renewal_anchor_date: end.toISOString(),
      tnc_api_tier: 'free',
    })
    .select('id')
    .single();
  if (subErr || !sub) throw new Error(subErr?.message || 'Failed to create subscription');

  const { data: billingId } = await service.rpc('data_sass_record_billing_history', {
    p_subscription_id: sub.id,
    p_item_type: 'base',
    p_description: description,
    p_billing_date: new Date().toISOString(),
    p_amount: amount,
    p_payment_method: 'authorize_net',
    p_payment_status: 'paid',
    p_provider_customer_id: profile.adn_customer_id,
    p_provider_charge_id: transactionId,
    p_fk_pricing_id: pricing.id,
    p_metadata: { purchase_type: 'base', initial_payment: true, user_id: String(profile.id) },
    p_provider: 'authorize_net',
    p_charge_method: 'card',
    p_event_type: 'payment_captured',
    p_currency: pricing.currency || 'usd',
  });
  if (billingId) {
    await service
      .from('data_sass_subscriptions')
      .update({
        fk_billing_history_id: billingId,
        fk_billing_charge_id: transactionId,
        date_modified: new Date().toISOString(),
      })
      .eq('id', sub.id);
  }

  createArbSubscription({
    customerProfileId: profile.adn_customer_id,
    customerPaymentProfileId: adnPaymentId,
    amount: amount.toFixed(2),
    description,
    invoiceNumber,
    startDate: start.toISOString().slice(0, 10),
  })
    .then(async (adnId) => {
      await createServiceClient()
        .from('data_sass_subscriptions')
        .update({ adn_subscription_id: adnId, date_modified: new Date().toISOString() })
        .eq('id', sub.id);
    })
    .catch((err) => {
      console.error('ARB subscription failed', err);
    });

  void email;
  return { subscriptionId: sub.id, transactionId };
}

export async function getWorkspaceBilling(subscriptionId: number, endDate: string | null) {
  const service = createServiceClient();
  let { data: rows, error } = await service
    .schema('data_sass_internal_billing')
    .from('billing_history')
    .select('id, date_created, subscription_id, item_id, item_type, metadata, description, billing_date, amount, payment_method, payment_status, provider, provider_charge_id, event_type, currency')
    .eq('subscription_id', subscriptionId)
    .is('date_removed', null)
    .order('billing_date', { ascending: false })
    .limit(50);
  if (error) {
    const fallback = await service
      .from('data_sass_billing_history')
      .select('subscription_id, item_id, item_type, description, billing_date, amount, payment_status')
      .eq('subscription_id', subscriptionId)
      .order('billing_date', { ascending: false })
      .limit(50);
    if (fallback.error) throw new Error(error.message);
    rows = (fallback.data ?? []).map((h) => ({
      id: h.item_id,
      date_created: h.billing_date,
      metadata: null,
      payment_method: null,
      provider: null,
      provider_charge_id: null,
      event_type: null,
      currency: 'usd',
      ...h,
    }));
  }
  const history = rows ?? [];
  const failed = history.filter((h) => h.payment_status === 'failed');
  const last = history[0];
  return {
    history,
    payment_status: {
      subscription_id: subscriptionId,
      is_past_due: failed.length > 0,
      past_due_amount: failed.reduce((sum, h) => sum + Number(h.amount || 0), 0),
      last_payment_status: last?.payment_status ?? null,
      last_payment_date: last?.billing_date ?? null,
      last_payment_amount: last?.amount ?? null,
      next_billing_date: endDate,
      payment_method_id: null,
      payment_method_description: last?.payment_method ?? null,
      payment_fail_count: failed.length,
    },
  };
}

export async function cancelSubscription(profileId: number, subscriptionId: number) {
  const service = createServiceClient();
  const { data: sub, error } = await service
    .from('data_sass_subscriptions')
    .select('id, fk_user_profile_id, adn_subscription_id, status')
    .eq('id', subscriptionId)
    .is('date_removed', null)
    .maybeSingle();
  if (error || !sub) throw new Error('Subscription not found');
  if (sub.fk_user_profile_id !== profileId) throw new Error('Only the workspace owner can cancel billing');
  if (sub.adn_subscription_id) {
    await cancelArbSubscription(sub.adn_subscription_id);
  }
  const { error: upd } = await service
    .from('data_sass_subscriptions')
    .update({
      status: 'canceled',
      is_active: false,
      auto_renew: false,
      date_modified: new Date().toISOString(),
    })
    .eq('id', subscriptionId);
  if (upd) throw new Error(upd.message);
}
