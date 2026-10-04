import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { billingIsOn, createCheckout } from '@/lib/stripe';
import { deliverProduct } from '@/lib/store';
import { sameSite } from '@/lib/same-site';

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const to = (p: string) => NextResponse.redirect(new URL(p, request.url), { status: 303 });
  if (!sameSite(request)) return new NextResponse('Forbidden', { status: 403 });
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub ? String(auth.claims.sub) : null;
  if (!userId) return to('/sign-up?next=' + encodeURIComponent('/store/' + slug));
  const { data: product } = await supabase.from('products').select('id, title, price_cents, status').eq('slug', slug).eq('status', 'live').maybeSingle();
  if (!product) return to('/store');

  if (product.price_cents === 0) {
    // a free product: record it and hand over the copy
    const admin = createAdminClient();
    await admin.from('purchases').insert({ user_id: userId, kind: 'product', product_id: product.id, amount_cents: 0 });
    const made = await deliverProduct(product.id, userId);
    return to(made ? `/c/${made}/manage` : `/store/${slug}?problem=1`);
  }
  if (!billingIsOn()) return to(`/store/${slug}?pay=off`);
  const { data: profile } = await supabase.from('profiles').select('email').eq('id', userId).maybeSingle();
  const { data: sub } = await supabase.from('subscriptions').select('stripe_customer').eq('user_id', userId).maybeSingle();
  try {
    const url = await createCheckout({ userId, email: profile?.email ?? '', customer: sub?.stripe_customer, kind: 'product', productId: product.id, name: 'Dungeons by Bryce campaign: ' + product.title, cents: product.price_cents, interval: null, success: '/campaigns?bought=1', cancel: '/store/' + slug });
    return to(url);
  } catch { return to(`/store/${slug}?problem=1`); }
}
