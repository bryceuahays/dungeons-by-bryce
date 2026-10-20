'use server';
import { revalidatePath } from 'next/cache';
import { getCampaign } from '@/lib/campaign';
import { flag, NOT_AVAILABLE } from '@/lib/flags';
import { loreSettingsOf, type LoreSettings } from '@/config/lore-categories';

// The categories a campaign's Lore page has (settings.lore): adding one, making the DM's own, or
// taking an empty one away. Entries are never deleted here: a category with entries stays.
export async function saveLoreCategories(slug: string, next: LoreSettings): Promise<{ error?: string; note?: string; lore?: LoreSettings }> {
  if (!(await flag('hub_v2_lore'))) return { error: NOT_AVAILABLE };
  const ctx = await getCampaign(slug);
  if (!ctx.realDm || ctx.asPlayer || !ctx.access.writable || !ctx.perms.edit) return { error: 'You are not allowed to change that.' };
  const { supabase, campaign } = ctx;
  const clean = loreSettingsOf({ lore: next });
  // a category with entries in it cannot be taken away
  const { data: used } = await supabase.from('entries').select('data->>cat').eq('campaign_id', campaign.id).eq('kind', 'lore');
  const inUse = new Set(((used ?? []) as Record<string, unknown>[]).map((r) => String(Object.values(r)[0] ?? '')));
  const before = loreSettingsOf(campaign.settings);
  for (const id of before.cats) if (inUse.has(id) && !clean.cats.includes(id)) clean.cats.push(id);
  for (const c of before.custom) if (inUse.has(c.id) && !clean.custom.some((x) => x.id === c.id)) clean.custom.push(c);
  const { error } = await supabase.from('campaigns').update({ settings: { ...(campaign.settings ?? {}), lore: clean } }).eq('id', campaign.id);
  if (error) return { error: 'That did not save.' };
  revalidatePath('/c/' + slug, 'layout');
  return { note: 'Saved.', lore: clean };
}
