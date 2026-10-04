'use server';
import { redirect } from 'next/navigation';
import { requireViewer } from '@/lib/auth';
import { PRICES, PLAN_COPY } from '@/config/plans';
import { billingIsOn, createCheckout, createPortal } from '@/lib/stripe';

export type BillingState = { error?: string } | null;

// Sends the DM to Stripe Checkout (test mode) for a plan.
export async function startCheckout(kind: 'pro_monthly' | 'pro_yearly' | 'founder', _: BillingState, __: FormData): Promise<BillingState> {
  const { supabase, user, profile } = await requireViewer();
  if (!billingIsOn()) return { error: 'Payments are not switched on yet. Nothing was charged.' };
  if (kind === 'founder') {
    const { data: left } = await supabase.rpc('founder_seats_left');
    if (!left) return { error: 'The founder seats are all taken.' };
  }
  const { data: sub } = await supabase.from('subscriptions').select('stripe_customer, plan').eq('user_id', user.id).maybeSingle();
  if (sub?.plan === 'founder') return { error: 'You already have founder lifetime access.' };
  let url: string;
  try {
    url = await createCheckout({
      userId: user.id, email: profile.email, customer: sub?.stripe_customer, kind,
      name: 'Dungeons by Bryce: ' + (kind === 'founder' ? PLAN_COPY.founder.name : PLAN_COPY.pro.name + (kind === 'pro_yearly' ? ' (yearly)' : ' (monthly)')),
      cents: PRICES[kind].cents, interval: PRICES[kind].interval,
      success: '/upgrade?done=1', cancel: '/upgrade',
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Checkout could not be started.' };
  }
  redirect(url);
}

// Stripe's own page for changing a card, switching plan, or cancelling.
export async function openPortal(_: BillingState, __: FormData): Promise<BillingState> {
  const { supabase, user } = await requireViewer();
  if (!billingIsOn()) return { error: 'Payments are not switched on yet.' };
  const { data: sub } = await supabase.from('subscriptions').select('stripe_customer').eq('user_id', user.id).maybeSingle();
  if (!sub?.stripe_customer) return { error: 'There is no subscription on this account.' };
  let url: string;
  try { url = await createPortal(sub.stripe_customer); } catch (e) { return { error: e instanceof Error ? e.message : 'The billing page could not be opened.' }; }
  redirect(url);
}
