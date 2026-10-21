'use server';
import { redirect } from 'next/navigation';
import { requireViewer } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { removeCampaignFiles } from '@/lib/campaign-admin';
import { billingIsOn, stripe } from '@/lib/stripe';

// Deleting your own account (Bryce, 20 October 2026). The Account page offers a download of
// everything first (src/features/campaign-export). Then, in this order:
//   * the Head DM's account cannot be deleted here, and nor can a store seller's while they have
//     products (deleting the account would take the products, and buyers' records, with it)
//   * an active Pro subscription is cancelled at Stripe, so nobody is charged for a deleted account
//   * every file the account and its campaigns keep is removed from storage
//   * the account is deleted; the database removes everything that belongs to it with it (its
//     campaigns, characters, homebrew, notes, rolls), and clears its name from what others keep
export async function deleteMyAccount(confirm: string): Promise<{ error?: string }> {
  const { supabase, user, isHead } = await requireViewer();
  if (String(confirm ?? '').trim() !== 'DELETE') return { error: 'Type DELETE in capital letters to confirm.' };
  if (isHead) return { error: 'The Head DM account cannot be deleted from here. It looks after the whole site.' };
  const admin = createAdminClient();

  const { count: products } = await admin.from('products').select('id', { count: 'exact', head: true }).eq('seller_id', user.id);
  if (products) return { error: 'You sell campaigns in the store. Remove your products from the store first, or ask Bryce for help, then delete your account.' };

  const { data: sub } = await admin.from('subscriptions').select('stripe_subscription, status, plan').eq('user_id', user.id).maybeSingle();
  if (sub?.stripe_subscription && ['active', 'trialing', 'past_due', 'incomplete', 'unpaid'].includes(String(sub.status))) {
    if (!billingIsOn()) return { error: 'Your Pro subscription could not be cancelled right now, so your account was not deleted. Try again later, or ask Bryce for help.' };
    try { await stripe('DELETE', `/subscriptions/${encodeURIComponent(sub.stripe_subscription)}`); }
    catch { return { error: 'Your Pro subscription could not be cancelled right now, so your account was not deleted. Try again later, or ask Bryce for help.' }; }
  }

  const { data: owned } = await admin.from('campaigns').select('id').eq('owner_id', user.id);
  for (const c of owned ?? []) await removeCampaignFiles(c.id);
  const mine = [`user/${user.id}/wide`, `user/${user.id}/tall`];
  const { data: banners } = await admin.storage.from('backgrounds').list(`user/${user.id}/banners`, { limit: 1000 });
  for (const b of banners ?? []) if (b.id) mine.push(`user/${user.id}/banners/${b.name}`);
  await admin.storage.from('backgrounds').remove(mine);

  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) return { error: 'Your account could not be deleted. Try again in a moment, or ask Bryce for help.' };
  await supabase.auth.signOut().catch(() => {});
  redirect('/?deleted=1');
}
