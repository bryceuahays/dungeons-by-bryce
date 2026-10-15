'use server';
import { revalidatePath } from 'next/cache';
import { getCampaign } from '@/lib/campaign';
import { flag, NOT_AVAILABLE } from '@/lib/flags';
import { cleanVisDefaults } from './defaults';

export type SettingsState = { error?: string; note?: string } | null;

// Save a campaign's visibility defaults (settings.visibility). The database lets only the
// owner and co-DMs with "Change campaign settings" change a campaign's settings.
export async function saveVisDefaults(slug: string, input: unknown): Promise<SettingsState> {
  if (!(await flag('hub_v2_settings'))) return { error: NOT_AVAILABLE };
  const ctx = await getCampaign(slug);
  const { data: c } = await ctx.supabase.from('campaigns').select('id, settings').eq('id', ctx.campaign.id).maybeSingle();
  if (!c) return { error: 'Campaign not found.' };
  const settings = { ...((c.settings ?? {}) as Record<string, unknown>), visibility: cleanVisDefaults(input) };
  const { data, error } = await ctx.supabase.from('campaigns').update({ settings }).eq('id', c.id).select('id');
  if (error || !data?.length) return { error: 'That did not save.' };
  revalidatePath('/c/' + slug, 'layout');
  return { note: 'Saved.' };
}
