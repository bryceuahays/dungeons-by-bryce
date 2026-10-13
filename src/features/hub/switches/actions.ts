'use server';
import { revalidatePath } from 'next/cache';
import { requireViewer } from '@/lib/auth';
import { flag, NOT_AVAILABLE } from '@/lib/flags';
import { cleanFeatures } from '@/config/hub-features';

export type SwitchState = { error?: string; note?: string } | null;

// Save which pages and features a campaign has switched off (settings.features). Only the
// list changes: nothing a page holds is deleted, so switching it back on brings it all back.
// The database lets only the campaign's DMs change its settings, whatever is sent here.
export async function saveFeatures(slug: string, off: unknown): Promise<SwitchState> {
  const { supabase } = await requireViewer();
  if (!(await flag('hub_v2_switches'))) return { error: NOT_AVAILABLE };
  const { data: c } = await supabase.from('campaigns').select('id, settings').eq('slug', slug).maybeSingle();
  if (!c) return { error: 'Campaign not found.' };
  const settings = { ...((c.settings ?? {}) as Record<string, unknown>), features: cleanFeatures(Array.isArray(off) ? off : []) };
  const { data, error } = await supabase.from('campaigns').update({ settings }).eq('id', c.id).select('id');
  if (error || !data?.length) return { error: 'That did not save.' };
  revalidatePath('/c/' + slug, 'layout');
  return { note: 'Saved.' };
}
