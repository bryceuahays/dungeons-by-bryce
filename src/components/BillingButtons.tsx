'use client';
import { useActionState } from 'react';
import { openPortal, startCheckout, type BillingState } from '@/app/(hub)/billing-actions';

export function CheckoutButton({ kind, label }: { kind: 'pro_monthly' | 'pro_yearly' | 'founder'; label: string }) {
  const [state, action, pending] = useActionState<BillingState, FormData>(startCheckout.bind(null, kind), null);
  return (
    <form action={action}>
      <button type="submit" disabled={pending}>{pending ? 'One moment' : label}</button>
      {state?.error ? <p className="bad" role="alert">{state.error}</p> : null}
    </form>
  );
}

export function PortalButton() {
  const [state, action, pending] = useActionState<BillingState, FormData>(openPortal, null);
  return (
    <form action={action}>
      <button type="submit" className="quiet" disabled={pending}>{pending ? 'One moment' : 'Manage billing'}</button>
      {state?.error ? <p className="bad" role="alert">{state.error}</p> : null}
    </form>
  );
}
