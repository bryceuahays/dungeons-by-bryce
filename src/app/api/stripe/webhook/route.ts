import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { stripe, stripeKey, verifyWebhook, webhookSecret } from '@/lib/stripe';
import { deliverProduct, upgradeCopy } from '@/lib/store';

// Stripe calls this when someone subscribes, renews, cancels, or a payment fails.
// Every call is checked against the webhook secret, test-mode events only, and each
// event is handled once.
/* eslint-disable @typescript-eslint/no-explicit-any */
export async function POST(request: Request) {
  const secret = webhookSecret();
  if (!secret) return new NextResponse('Billing is not set up.', { status: 503 });
  const body = await request.text();
  if (!verifyWebhook(body, request.headers.get('stripe-signature'), secret)) return new NextResponse('Bad signature.', { status: 400 });
  let event: any;
  try { event = JSON.parse(body); } catch { return new NextResponse('Bad body.', { status: 400 }); }
  if (event.livemode) return new NextResponse('This site only accepts test-mode events.', { status: 400 });

  const admin = createAdminClient();
  const seen = await admin.from('billing_events').insert({ id: String(event.id), type: String(event.type) });
  if (seen.error) return NextResponse.json({ ok: true, repeated: true }); // already handled

  const o = event.data?.object ?? {};
  const iso = (seconds: unknown) => (typeof seconds === 'number' && seconds > 0 ? new Date(seconds * 1000).toISOString() : null);
  const periodEnd = (sub: any) => iso(sub?.current_period_end ?? sub?.items?.data?.[0]?.current_period_end);

  switch (event.type) {
    case 'checkout.session.completed': {
      const userId = String(o.metadata?.user_id || o.client_reference_id || '');
      const kind = String(o.metadata?.kind || '');
      if (kind === 'commission' && /^[0-9a-f-]{36}$/.test(String(o.metadata?.commission_id || ''))) {
        // a client paid for their custom campaign site
        await admin.from('commissions').update({ status: 'paid', paid_at: new Date().toISOString() }).eq('id', o.metadata.commission_id).in('status', ['requested', 'accepted']);
        await admin.from('purchases').insert({ user_id: /^[0-9a-f-]{36}$/.test(userId) ? userId : null, kind: 'commission', stripe_session: o.id, amount_cents: o.amount_total ?? 0 });
        break;
      }
      if (!/^[0-9a-f-]{36}$/.test(userId)) break;
      if (kind === 'pro_monthly' || kind === 'pro_yearly') {
        let until: string | null = null;
        if (o.subscription && stripeKey()) { try { until = periodEnd(await stripe('GET', '/subscriptions/' + o.subscription)); } catch {} }
        const { data: had } = await admin.from('subscriptions').select('plan').eq('user_id', userId).maybeSingle();
        if (had?.plan !== 'founder') {
          await admin.from('subscriptions').upsert({ user_id: userId, stripe_customer: o.customer ?? null, stripe_subscription: o.subscription ?? null, plan: kind, status: 'active', current_period_end: until, updated_at: new Date().toISOString() });
        }
        await admin.from('purchases').insert({ user_id: userId, kind: 'subscription', stripe_session: o.id, amount_cents: o.amount_total ?? 0 });
      } else if (kind === 'founder') {
        const { data: had } = await admin.from('subscriptions').select('stripe_subscription, plan').eq('user_id', userId).maybeSingle();
        await admin.from('subscriptions').upsert({ user_id: userId, stripe_customer: o.customer ?? null, stripe_subscription: null, plan: 'founder', status: 'active', current_period_end: null, updated_at: new Date().toISOString() });
        await admin.from('purchases').insert({ user_id: userId, kind: 'founder', stripe_session: o.id, amount_cents: o.amount_total ?? 0 });
        // a founder no longer needs their monthly or yearly subscription
        if (had?.stripe_subscription && had.plan !== 'founder' && stripeKey()) { try { await stripe('DELETE', '/subscriptions/' + had.stripe_subscription); } catch {} }
      } else if (kind === 'product' && o.metadata?.product_id) {
        const bought = await admin.from('purchases').insert({ user_id: userId, kind: 'product', product_id: o.metadata.product_id, stripe_session: o.id, amount_cents: o.amount_total ?? 0 });
        // an upgrade fills in the buyer's existing framework copy; anything else is delivered as a new copy (or a pack)
        const into = String(o.metadata.upgrade_campaign || '');
        if (!bought.error) {
          if (/^[0-9a-f-]{36}$/.test(into)) { await upgradeCopy(into, String(o.metadata.product_id), userId); await admin.from('purchases').update({ campaign_id: into }).eq('stripe_session', o.id); }
          else await deliverProduct(String(o.metadata.product_id), userId);
        }
      }
      break;
    }
    case 'customer.subscription.updated':
    case 'customer.subscription.created': {
      // renewals, plan changes, and cancellations that take effect at the end of the period
      await admin.from('subscriptions').update({ status: String(o.status), current_period_end: periodEnd(o), updated_at: new Date().toISOString() }).eq('stripe_subscription', o.id).neq('plan', 'founder');
      break;
    }
    case 'customer.subscription.deleted': {
      // Nothing is deleted on a downgrade. Extra campaigns become read-only (the database decides that from the plan).
      await admin.from('subscriptions').update({ status: 'canceled', updated_at: new Date().toISOString() }).eq('stripe_subscription', o.id).neq('plan', 'founder');
      break;
    }
    case 'invoice.paid':
    case 'invoice.payment_succeeded': {
      const sub = o.subscription ?? o.parent?.subscription_details?.subscription;
      const until = iso(o.lines?.data?.[0]?.period?.end);
      if (sub) await admin.from('subscriptions').update({ status: 'active', ...(until ? { current_period_end: until } : {}), updated_at: new Date().toISOString() }).eq('stripe_subscription', sub).neq('plan', 'founder');
      break;
    }
    case 'invoice.payment_failed': {
      const sub = o.subscription ?? o.parent?.subscription_details?.subscription;
      if (sub) await admin.from('subscriptions').update({ status: 'past_due', updated_at: new Date().toISOString() }).eq('stripe_subscription', sub).neq('plan', 'founder');
      break;
    }
  }
  return NextResponse.json({ ok: true });
}
