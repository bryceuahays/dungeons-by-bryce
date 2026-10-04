import { requireViewer } from '@/lib/auth';
import { getPlan } from '@/lib/entitlements';
import { billingIsOn } from '@/lib/stripe';
import { PlanCards } from '@/components/PlanCards';
import { PortalButton } from '@/components/BillingButtons';
import { FREE_LIMITS } from '@/config/plans';
import Link from 'next/link';

export const metadata = { title: 'Plans' };

export default async function Upgrade({ searchParams }: { searchParams: Promise<{ done?: string }> }) {
  const { done } = await searchParams;
  const { supabase } = await requireViewer();
  const [plan, { data: seats }] = await Promise.all([getPlan(), supabase.rpc('founder_seats_left')]);
  const current = plan.plan === 'founder' ? 'founder' : plan.pro ? 'pro' : 'free';
  const day = plan.until ? new Date(plan.until).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '';
  return (
    <>
      <h1>Plans</h1>
      {done ? <div className="panel"><p className="good" role="status">Thank you. Your plan is updated as soon as the payment is confirmed, usually within a few seconds. Refresh this page if it still says Free.</p></div> : null}
      <div className="panel">
        <p>Players are always free. A plan is for the DM, and it covers every campaign that DM runs.</p>
        <p className="dim">
          {plan.comp ? 'Your account has full access. Nothing to pay.'
            : plan.gift_until && !plan.plan ? `You have Pro until ${new Date(plan.gift_until).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}, included with your custom campaign.`
            : plan.plan === 'founder' ? 'You have founder lifetime access.'
            : plan.pro ? `You are on Pro${plan.status === 'past_due' ? '. Your last payment did not go through; Stripe will try again' : ''}${day ? `. Your plan runs to ${day}` : ''}.`
            : `You are on the free plan: ${plan.campaigns} of ${FREE_LIMITS.campaigns} campaign and ${plan.homebrew} of ${FREE_LIMITS.homebrew} homebrew entries used.${plan.status === 'canceled' ? ' Your Pro plan has ended. Nothing was deleted: campaigns beyond the first can still be opened and read, and they unlock again on Pro.' : ''}`}
        </p>
        {plan.plan && plan.plan !== 'founder' && !plan.comp ? <PortalButton /> : null}
        {billingIsOn() ? null : <p className="dim">Payments are not switched on yet, so the buttons below will not charge anything.</p>}
      </div>
      <div className="panel"><p>Rather not build it yourself? <Link href="/custom">Have Bryce build it</Link>: your campaign set up for you and handed over to your account.</p></div>
      <PlanCards signedIn seatsLeft={Number(seats ?? 0)} current={plan.comp ? undefined : current} />
    </>
  );
}
