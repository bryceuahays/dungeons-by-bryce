import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { discounted } from '@/config/store';

// What this account pays for a product, worked out on the server every time:
//   * someone who owns the framework edition pays the difference for the full edition,
//     and the story is added to the copy they already have
//   * Pro subscribers, founders and accounts with full access get the subscriber discount
export async function priceFor(supabase: SupabaseClient, userId: string, product: { id: string; edition?: string | null; price_cents: number }) {
  const { data: plan } = await supabase.rpc('my_plan');
  const pro = !!plan?.pro;
  let base = product.price_cents, upgradeInto: string | null = null, credit = 0;
  if (product.edition === 'full') {
    const { data: fw } = await supabase.from('products').select('id, price_cents').eq('full_product', product.id).eq('edition', 'framework').limit(1).maybeSingle();
    if (fw) {
      const { data: owned } = await supabase.from('purchases').select('campaign_id').eq('user_id', userId).eq('product_id', fw.id).not('campaign_id', 'is', null).order('created_at', { ascending: false });
      for (const o of owned ?? []) {
        const { data: mine } = await supabase.from('campaigns').select('id').eq('id', o.campaign_id).eq('owner_id', userId).maybeSingle();
        if (mine) { upgradeInto = mine.id; credit = fw.price_cents; base = Math.max(0, product.price_cents - fw.price_cents); break; }
      }
    }
  }
  return { cents: discounted(base, pro), list: product.price_cents, pro, upgradeInto, credit };
}
