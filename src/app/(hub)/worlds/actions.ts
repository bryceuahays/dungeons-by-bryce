'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireViewer } from '@/lib/auth';
import type { FormState } from '../actions';
import { attachWorldEntries } from '@/lib/worlds';

// Worlds: a setting above campaigns. Its campaigns get its homebrew attached (as campaign entries,
// so players see them on their sheets the usual way).

const isId = (s: string) => /^[0-9a-f-]{36}$/.test(s);

export async function createWorld(_: FormState, form: FormData): Promise<FormState> {
  const { supabase } = await requireViewer();
  const name = String(form.get('name') || '').trim().slice(0, 80);
  const tagline = String(form.get('tagline') || '').trim().slice(0, 300);
  if (!name) return { error: 'Give the world a name.' };
  const { data, error } = await supabase.from('worlds').insert({ name, tagline }).select('id').single();
  if (error || !data) return { error: 'The world could not be created. Try again in a moment.' };
  revalidatePath('/worlds');
  redirect('/worlds/' + data.id);
}

// Your own copy of a ready-made world: the same game and rules, ready for your homebrew.
export async function copyWorld(fromId: string) {
  const { supabase } = await requireViewer();
  const { data: from } = await supabase.from('worlds').select('name, tagline, system, rules').eq('id', fromId).eq('official', true).maybeSingle();
  if (!from) redirect('/worlds');
  const { data } = await supabase.from('worlds').insert({ name: (from.name + ' (my copy)').slice(0, 80), tagline: from.tagline, system: from.system, rules: from.rules }).select('id').single();
  revalidatePath('/worlds');
  redirect(data ? '/worlds/' + data.id : '/worlds');
}

export async function saveWorld(id: string, w: { name: string; tagline: string; rules: string; data: any }): Promise<FormState> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const { supabase } = await requireViewer();
  const name = String(w.name || '').trim().slice(0, 80);
  if (!name) return { error: 'Give the world a name.' };
  const { error } = await supabase.from('worlds').update({ name, tagline: String(w.tagline || '').slice(0, 300), rules: ['2014', '2024', 'both'].includes(w.rules) ? w.rules : '2024', data: w.data ?? {}, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) return { error: 'That did not save. Try again in a moment.' };
  // its campaigns follow its rules
  const { data: camps } = await supabase.from('campaigns').select('id, settings').eq('world_id', id);
  for (const c of camps ?? []) if ((c.settings as any)?.rules !== w.rules) await supabase.from('campaigns').update({ settings: { ...((c.settings as any) ?? {}), rules: w.rules } }).eq('id', c.id); // eslint-disable-line @typescript-eslint/no-explicit-any
  revalidatePath('/worlds');
  return { note: 'Saved.' };
}

export async function deleteWorld(id: string): Promise<FormState> {
  const { supabase } = await requireViewer();
  const { error, count } = await supabase.from('worlds').delete({ count: 'exact' }).eq('id', id);
  if (error || !count) return { error: 'The world could not be deleted. Try again in a moment.' };
  revalidatePath('/worlds');
  redirect('/worlds');
}

// Put a campaign in this world (or take it out, with worldId null). Taking it out keeps its homebrew.
export async function setCampaignWorld(campaignId: string, worldId: string | null): Promise<FormState> {
  const { supabase } = await requireViewer();
  if (!isId(campaignId) || (worldId && !isId(worldId))) return { error: 'Not found.' };
  const { error } = await supabase.from('campaigns').update({ world_id: worldId }).eq('id', campaignId);
  if (error) return { error: 'That did not work. Only the campaign’s DM can move it.' };
  // the campaign plays by its world's rules
  if (worldId) {
    const { data: w } = await supabase.from('worlds').select('rules').eq('id', worldId).maybeSingle();
    const { data: c } = await supabase.from('campaigns').select('settings').eq('id', campaignId).maybeSingle();
    if (w && c) await supabase.from('campaigns').update({ settings: { ...(c.settings ?? {}), rules: w.rules } }).eq('id', campaignId);
  }
  if (worldId) await attachWorldEntries(supabase, worldId, [campaignId]);
  revalidatePath('/worlds');
  revalidatePath('/campaigns');
  return null;
}

async function campaignsIn(supabase: Awaited<ReturnType<typeof requireViewer>>['supabase'], worldId: string) {
  return ((await supabase.from('campaigns').select('id').eq('world_id', worldId)).data ?? []).map((c) => c.id as string);
}

// Homebrew in the world: added to every campaign in it too, and taken off them when removed.
export async function addWorldEntity(worldId: string, entityId: string): Promise<FormState> {
  const { supabase } = await requireViewer();
  if (!isId(worldId) || !isId(entityId)) return { error: 'Not found.' };
  const { error } = await supabase.from('world_entities').upsert({ world_id: worldId, entity_id: entityId }, { onConflict: 'world_id,entity_id', ignoreDuplicates: true });
  if (error) return { error: 'That could not be added.' };
  await attachWorldEntries(supabase, worldId, await campaignsIn(supabase, worldId), [entityId]);
  revalidatePath('/worlds/' + worldId);
  return null;
}

export async function removeWorldEntity(worldId: string, entityId: string): Promise<FormState> {
  const { supabase } = await requireViewer();
  if (!isId(worldId) || !isId(entityId)) return { error: 'Not found.' };
  await supabase.from('world_entities').delete().eq('world_id', worldId).eq('entity_id', entityId);
  const camps = await campaignsIn(supabase, worldId);
  if (camps.length) await supabase.from('campaign_entities').delete().eq('entity_id', entityId).in('campaign_id', camps);
  revalidatePath('/worlds/' + worldId);
  return null;
}
