'use server';
import { revalidatePath } from 'next/cache';
import { getCampaign } from '@/lib/campaign';
import { flag, NOT_AVAILABLE } from '@/lib/flags';
import { cleanShell } from './model';

export type ShellState = { error?: string; note?: string } | null;

// Save the two pages on the phone's bottom bar (settings.shell). The database lets only the
// owner and co-DMs with "Change campaign settings" change a campaign's settings.
export async function saveShell(slug: string, bar: unknown): Promise<ShellState> {
  if (!(await flag('hub_v2_shell'))) return { error: NOT_AVAILABLE };
  const ctx = await getCampaign(slug);
  const { data: c } = await ctx.supabase.from('campaigns').select('id, settings').eq('id', ctx.campaign.id).maybeSingle();
  if (!c) return { error: 'Campaign not found.' };
  const { data: rows } = await ctx.supabase.from('sections').select('slug, sort').eq('campaign_id', c.id).order('sort');
  const tabs = [...new Set((rows ?? []).map((r) => String(r.slug)))];
  const settings = { ...((c.settings ?? {}) as Record<string, unknown>), shell: cleanShell({ bar: Array.isArray(bar) ? bar : [] }, tabs) };
  const { data, error } = await ctx.supabase.from('campaigns').update({ settings }).eq('id', c.id).select('id');
  if (error || !data?.length) return { error: 'That did not save.' };
  revalidatePath('/c/' + slug, 'layout');
  return { note: 'Saved.' };
}
