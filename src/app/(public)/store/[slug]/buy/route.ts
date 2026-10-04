import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { billingIsOn, createCheckout } from '@/lib/stripe';
import { deliverProduct, upgradeCopy } from '@/lib/store';
import { sameSite } from '@/lib/same-site';
import { priceFor } from '@/lib/store-price';

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const to = (p: string) => NextResponse.redirect(new URL(p, request.url), { status: 303 });
  if (!sameSite(request)) return new NextResponse('Forbidden', { status: 403 });
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub ? String(auth.claims.sub) : null;
  if (!userId) return to('/sign-up?next=' + encodeURIComponent('/store/' + slug));
  // read with the buyer's own login: a listing they may not see (a spoiler for a campaign they play in) does not exist for them
  const { data: product } = await supabase.from('products').select('id, title, kind, pack_id, edition, price_cents, status').eq('slug', slug).eq('status', 'live').maybeSingle();
  if (!product) return to('/store');

  const price = await priceFor(supabase, userId, product);
  const admin = createAdminClient();
  const done = (made: string | null) => to(!made ? `/store/${slug}?problem=1` : made.startsWith('pack:') ? `/homebrew/packs/${made.slice(5)}?added=1` : `/c/${made}/manage`);

  if (price.cents === 0) {
    // free (or an upgrade that costs nothing): record it and hand it over
    const { data: bought } = await admin.from('purchases').insert({ user_id: userId, kind: 'product', product_id: product.id, amount_cents: 0, campaign_id: price.upgradeInto ?? null }).select('id').single();
    if (!bought) return to(`/store/${slug}?problem=1`);
    return done(price.upgradeInto ? await upgradeCopy(price.upgradeInto, product.id, userId) : await deliverProduct(product.id, userId));
  }
  if (!billingIsOn()) return to(`/store/${slug}?pay=off`);
  const { data: profile } = await supabase.from('profiles').select('email').eq('id', userId).maybeSingle();
  const { data: sub } = await supabase.from('subscriptions').select('stripe_customer').eq('user_id', userId).maybeSingle();
  try {
    const url = await createCheckout({
      userId, email: profile?.email ?? '', customer: sub?.stripe_customer, kind: 'product', productId: product.id, cents: price.cents, interval: null,
      name: 'Dungeons by Bryce: ' + product.title + (price.upgradeInto ? ' (upgrade from the framework edition)' : ''),
      meta: price.upgradeInto ? { upgrade_campaign: price.upgradeInto } : {},
      success: product.kind === 'pack' ? '/homebrew?bought=1' : '/campaigns?bought=1', cancel: '/store/' + slug,
    });
    return to(url);
  } catch { return to(`/store/${slug}?problem=1`); }
}
