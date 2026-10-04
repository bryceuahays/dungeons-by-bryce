import 'server-only';
import crypto from 'node:crypto';

// A small Stripe client (Checkout, customer portal, webhooks) over plain HTTPS.
// TEST MODE ONLY: a live key is refused. Switching to live is a deliberate step for the
// site owner (see docs/handoff.md), not a config accident.
//
// Environment variables:
//   STRIPE_SECRET_KEY       sk_test_...
//   STRIPE_WEBHOOK_SECRET   whsec_...
//   NEXT_PUBLIC_SITE_URL    https://your-site (used for the return addresses)

const env = (name: string) => Object.entries(process.env).find(([k]) => k.toUpperCase() === name)?.[1]?.trim() || '';

export function stripeKey(): string | null {
  const key = env('STRIPE_SECRET_KEY');
  if (!key) return null;
  if (!/^(sk|rk)_test_/.test(key)) return null; // never a live key
  return key;
}
export const billingIsOn = () => !!stripeKey();
export const webhookSecret = () => env('STRIPE_WEBHOOK_SECRET') || null;
export const siteUrl = () => (env('NEXT_PUBLIC_SITE_URL') || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? 'https://' + process.env.VERCEL_PROJECT_PRODUCTION_URL : '') || 'http://localhost:3000').replace(/\/$/, '');

// Stripe takes form fields; nested values are written as a[b][c]=v.
function form(obj: Record<string, unknown>, prefix = '', out: string[] = []): string[] {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === 'object') form(v as Record<string, unknown>, key, out);
    else out.push(encodeURIComponent(key) + '=' + encodeURIComponent(String(v)));
  }
  return out;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function stripe(method: 'GET' | 'POST' | 'DELETE', path: string, body?: Record<string, unknown>): Promise<any> {
  const key = stripeKey();
  if (!key) throw new Error('Billing is not set up.');
  const res = await fetch('https://api.stripe.com/v1' + path, {
    method,
    headers: { authorization: 'Bearer ' + key, 'content-type': 'application/x-www-form-urlencoded' },
    body: body ? form(body).join('&') : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error?.message || 'Stripe refused the request.');
  return json;
}

export type CheckoutInput = {
  userId: string; email: string; customer?: string | null;
  kind: 'pro_monthly' | 'pro_yearly' | 'founder' | 'product';
  name: string; cents: number; interval: 'month' | 'year' | null;
  productId?: string; success: string; cancel: string;
};

export async function createCheckout(i: CheckoutInput): Promise<string> {
  const metadata = { user_id: i.userId, kind: i.kind, product_id: i.productId };
  const session = await stripe('POST', '/checkout/sessions', {
    mode: i.interval ? 'subscription' : 'payment',
    success_url: siteUrl() + i.success,
    cancel_url: siteUrl() + i.cancel,
    client_reference_id: i.userId,
    ...(i.customer ? { customer: i.customer } : { customer_email: i.email }),
    line_items: { 0: { quantity: 1, price_data: { currency: 'usd', unit_amount: i.cents, product_data: { name: i.name }, ...(i.interval ? { recurring: { interval: i.interval } } : {}) } } },
    metadata,
    ...(i.interval ? { subscription_data: { metadata } } : {}),
  });
  return session.url as string;
}

export async function createPortal(customer: string): Promise<string> {
  const session = await stripe('POST', '/billing_portal/sessions', { customer, return_url: siteUrl() + '/upgrade' });
  return session.url as string;
}

// Checks the Stripe-Signature header (HMAC-SHA256 over "<timestamp>.<body>").
export function verifyWebhook(body: string, header: string | null, secret: string, toleranceSeconds = 300): boolean {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(',').map((p) => { const i = p.indexOf('='); return [p.slice(0, i).trim(), p.slice(i + 1)]; }));
  const t = Number(parts.t);
  if (!t || !parts.v1 || Math.abs(Date.now() / 1000 - t) > toleranceSeconds) return false;
  const want = crypto.createHmac('sha256', secret).update(`${t}.${body}`).digest('hex');
  const a = Buffer.from(want), b = Buffer.from(String(parts.v1));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
