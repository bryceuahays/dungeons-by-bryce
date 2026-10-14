'use server';
import { revalidatePath } from 'next/cache';
import { getCampaign } from '@/lib/campaign';
import { flag, NOT_AVAILABLE } from '@/lib/flags';
import { cleanDiceRules } from './model';
import { checkNames } from './server';

export type DiceState = { error?: string; note?: string } | null;

// Save a campaign's dice rules (settings.dice). The database lets only the campaign's DMs
// change its settings, whatever is sent here.
export async function saveDiceRules(slug: string, input: unknown): Promise<DiceState> {
  if (!(await flag('hub_v2_dice'))) return { error: NOT_AVAILABLE };
  const ctx = await getCampaign(slug);
  if (!ctx.realDm || ctx.asPlayer) return { error: 'Only the DM sets the dice rules.' };
  const skills = (await checkNames(ctx)).filter((n) => !/ (save|check)$/.test(n) && n !== 'Initiative');
  const { data: c } = await ctx.supabase.from('campaigns').select('id, settings').eq('id', ctx.campaign.id).maybeSingle();
  if (!c) return { error: 'Campaign not found.' };
  const settings = { ...((c.settings ?? {}) as Record<string, unknown>), dice: cleanDiceRules(input, skills) };
  const { data, error } = await ctx.supabase.from('campaigns').update({ settings }).eq('id', c.id).select('id');
  if (error || !data?.length) return { error: 'That did not save.' };
  revalidatePath('/c/' + slug, 'layout');
  return { note: 'Saved.' };
}
