'use server';
// Saving, copying and deleting game systems, and finding a renamed word in written text.
import { revalidatePath } from 'next/cache';
import { requireViewer } from '@/lib/auth';
import { changesOf, type Sys } from './model';

const isId = (s: string) => /^[0-9a-f-]{36}$/.test(s);
type Result = { error?: string; id?: string };

// what gets stored: only the sections that differ from the base
function clean(sys: Sys) {
  const changes = changesOf(sys);
  return JSON.stringify(changes).length > 200_000 ? null : changes;
}

export async function createSystem(sys: Sys, name: string): Promise<Result> {
  const { supabase } = await requireViewer();
  const n = String(name || '').trim().slice(0, 80);
  if (!n) return { error: 'Give the system a name.' };
  if (sys.base !== '2014' && sys.base !== '2024') return { error: 'That system has no base rules.' };
  const changes = clean(sys);
  if (!changes) return { error: 'That system is too big to save.' };
  const { data, error } = await supabase.from('game_systems').insert({ name: n, base: sys.base, changes }).select('id').single();
  if (error || !data) return { error: 'The system could not be saved. Try again in a moment.' };
  revalidatePath('/homebrew/systems');
  return { id: data.id };
}

export async function updateSystem(id: string, sys: Sys, name: string): Promise<Result> {
  if (!isId(id)) return { error: 'Not found.' };
  const { supabase } = await requireViewer();
  const n = String(name || '').trim().slice(0, 80);
  if (!n) return { error: 'Give the system a name.' };
  const changes = clean(sys);
  if (!changes) return { error: 'That system is too big to save.' };
  const { data, error } = await supabase.from('game_systems').update({ name: n, changes, updated_at: new Date().toISOString() }).eq('id', id).select('id');
  if (error || !data?.length) return { error: 'That did not save. Try again in a moment.' };
  revalidatePath('/homebrew/systems');
  return { id };
}

// Deleting a system: campaigns that used it go back to its ready-made rules.
export async function deleteSystem(id: string): Promise<Result> {
  if (!isId(id)) return { error: 'Not found.' };
  const { supabase, user } = await requireViewer();
  const { data: camps } = await supabase.from('campaigns').select('id, settings').eq('owner_id', user.id).eq('settings->>system', id);
  for (const c of camps ?? []) {
    const { system: _, ...rest } = (c.settings ?? {}) as Record<string, unknown>; // eslint-disable-line @typescript-eslint/no-unused-vars
    await supabase.from('campaigns').update({ settings: rest }).eq('id', c.id);
  }
  const { error } = await supabase.from('game_systems').delete().eq('id', id);
  if (error) return { error: 'It could not be deleted. Try again in a moment.' };
  revalidatePath('/homebrew/systems');
  return {};
}

// Where each word appears in written text, by kind of entry: the official entries of the base
// rules and your own homebrew.
export async function findText(words: string[], base: string) {
  const { supabase } = await requireViewer();
  const list = [...new Set(words.map((w) => String(w).trim()).filter((w) => w.length > 1))].slice(0, 20);
  if (!list.length) return [];
  const { data } = await supabase.rpc('entity_text_hits', { words: list, versions: [base === '2014' ? '5.1' : '5.2'] });
  return (data ?? []) as { word: string; type: string; n: number; names: string[] }[];
}

// Which of your systems a campaign plays ('' for the ready-made rules it already has). The
// campaign's rules become the system's base, so its characters and their moves follow.
export async function setCampaignSystem(slug: string, systemId: string): Promise<{ error?: string; note?: string }> {
  const { supabase, user } = await requireViewer();
  const { data: c } = await supabase.from('campaigns').select('id, settings, owner_id').eq('slug', slug).maybeSingle();
  if (!c || c.owner_id !== user.id) return { error: 'Only the campaign’s DM can change its system.' };
  const { system: _old, ...rest } = (c.settings ?? {}) as Record<string, unknown>; // eslint-disable-line @typescript-eslint/no-unused-vars
  let settings: Record<string, unknown> = rest;
  if (systemId) {
    if (!isId(systemId)) return { error: 'Not found.' };
    const { data: s } = await supabase.from('game_systems').select('id, base').eq('id', systemId).eq('owner_id', user.id).maybeSingle();
    if (!s) return { error: 'That system is not one of yours.' };
    settings = { ...rest, system: s.id, rules: s.base };
  }
  const { error } = await supabase.from('campaigns').update({ settings }).eq('id', c.id);
  if (error) return { error: 'That did not save.' };
  revalidatePath('/c/' + slug, 'layout');
  return { note: 'Saved.' };
}
