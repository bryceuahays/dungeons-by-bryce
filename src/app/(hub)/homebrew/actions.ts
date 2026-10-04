'use server';
/* eslint-disable @typescript-eslint/no-explicit-any */
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireViewer } from '@/lib/auth';
import { upgradeNeeded } from '@/lib/entitlements';
import { ENTITY_TYPES } from '@/lib/rules/engine';

export type BrewState = { error?: string; note?: string; upgrade?: string; id?: string } | null;
export type EntityInput = { type: string; name: string; status: string; depth: string; source: string; data: Record<string, any>; cloned_from?: string | null };

const slugOf = (s: string) => s.toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 70) || 'entry';
const fail = (message: string | undefined, fallback: string): BrewState => {
  const up = upgradeNeeded(message);
  return up ? { upgrade: up, error: 'That is part of Pro. Nothing you have made is affected.' } : { error: fallback };
};

function clean(input: EntityInput): EntityInput | string {
  if (!(ENTITY_TYPES as readonly string[]).includes(input.type)) return 'Unknown kind of entry.';
  const name = String(input.name || '').trim().slice(0, 120);
  if (!name) return 'Give it a name.';
  const data = input.data && typeof input.data === 'object' && !Array.isArray(input.data) ? input.data : {};
  if (JSON.stringify(data).length > 200_000) return 'That entry is too large.';
  return {
    type: input.type, name, data,
    status: ['draft', 'playtest', 'live'].includes(input.status) ? input.status : 'draft',
    depth: ['quick', 'guided', 'advanced'].includes(input.depth) ? input.depth : 'quick',
    source: input.source === 'private' ? 'private' : 'homebrew',
    cloned_from: input.cloned_from ?? null,
  };
}

// Create or update an entry. With a change note it becomes a new version: the previous
// one is kept in the history, and players using the entry are told what changed.
export async function saveEntity(id: string | null, input: EntityInput, note?: string): Promise<BrewState> {
  const { supabase, user } = await requireViewer();
  const row = clean(input);
  if (typeof row === 'string') return { error: row };
  if (!id) {
    for (let n = 1; n < 30; n++) {
      const slug = slugOf(row.name) + (n > 1 ? '-' + n : '');
      const { data, error } = await supabase.from('entities').insert({ ...row, slug, owner_id: user.id }).select('id').single();
      if (!error && data) { revalidatePath('/homebrew'); return { id: data.id, note: 'Saved.' }; }
      if (!/duplicate|unique/i.test(error?.message || '')) return fail(error?.message, 'That did not save.');
    }
    return { error: 'That did not save.' };
  }
  const { data: cur } = await supabase.from('entities').select('version, change_note, name, data, owner_id').eq('id', id).maybeSingle();
  if (!cur || cur.owner_id !== user.id) return { error: 'Entry not found.' };
  const patch: Record<string, unknown> = { name: row.name, data: row.data, status: row.status, depth: row.depth, source: row.source };
  const versionNote = String(note || '').trim().slice(0, 500);
  if (versionNote) {
    const kept = await supabase.from('entity_versions').insert({ entity_id: id, version: cur.version, note: cur.change_note, name: cur.name, data: cur.data });
    if (kept.error && !/duplicate/i.test(kept.error.message)) return { error: 'The earlier version could not be kept, so nothing was saved.' };
    patch.version = cur.version + 1;
    patch.change_note = versionNote;
  }
  const { error } = await supabase.from('entities').update(patch).eq('id', id);
  if (error) return fail(error.message, 'That did not save.');
  revalidatePath('/homebrew');
  revalidatePath('/homebrew/' + id);
  return { id, note: versionNote ? `Saved as version ${cur.version + 1}.` : 'Saved.' };
}

export async function deleteEntity(id: string) {
  const { supabase } = await requireViewer();
  await supabase.from('entities').delete().eq('id', id); // row-level security: only its owner
  revalidatePath('/homebrew');
  redirect('/homebrew');
}

// Clone and tweak: a copy of an SRD entry or of one of your own. Someone else's entry
// can be cloned only if it is ordinary homebrew that has been shared with you.
export async function cloneEntity(id: string, _: BrewState, __: FormData): Promise<BrewState> {
  const { supabase, user } = await requireViewer();
  const { data: src } = await supabase.from('entities').select('*').eq('id', id).maybeSingle();
  if (!src || (src.source === 'private' && src.owner_id !== user.id)) return { error: 'That entry cannot be copied.' };
  let made: string | null = null;
  for (let n = 1; n < 30 && !made; n++) {
    const { data, error } = await supabase.from('entities').insert({
      owner_id: user.id, type: src.type, name: src.name + (src.owner_id === user.id ? ' (copy)' : ''), slug: slugOf(src.name) + (n > 1 ? '-' + n : ''),
      source: src.source === 'private' ? 'private' : 'homebrew', status: 'draft', depth: 'quick', data: src.data, cloned_from: src.id,
    }).select('id').single();
    if (data) made = data.id;
    else if (!/duplicate|unique/i.test(error?.message || '')) return fail(error?.message, 'The copy could not be made.');
  }
  if (!made) return { error: 'The copy could not be made.' };
  revalidatePath('/homebrew');
  redirect('/homebrew/' + made);
}

// Attach an entry to one of your campaigns (or detach it), with who may see it there.
export async function setAttached(entityId: string, campaignId: string, on: boolean, vis?: { vis: string; vis_players: string[]; vis_stage: string | null }): Promise<BrewState> {
  const { supabase } = await requireViewer();
  if (!on) { await supabase.from('campaign_entities').delete().eq('campaign_id', campaignId).eq('entity_id', entityId); revalidatePath('/homebrew/' + entityId); return { note: 'Removed from that campaign.' }; }
  const v = vis ?? { vis: 'all', vis_players: [], vis_stage: null };
  const { error } = await supabase.from('campaign_entities').upsert({ campaign_id: campaignId, entity_id: entityId, vis: v.vis, vis_players: v.vis_players ?? [], vis_stage: v.vis_stage || null });
  if (error) return fail(error.message, 'That could not be attached. You can attach your own entries to campaigns you run.');
  revalidatePath('/homebrew/' + entityId);
  return { note: 'Saved.' };
}

// ---------------------------------------------------------------- packs

export async function createPack(_: BrewState, form: FormData): Promise<BrewState> {
  const { supabase, user } = await requireViewer();
  const { data: plan } = await supabase.rpc('my_plan');
  if (!plan?.pro) return { upgrade: 'homebrew_full', error: 'Packs are part of Pro.' };
  const name = String(form.get('name') || '').trim().slice(0, 120);
  if (!name) return { error: 'Give the pack a name.' };
  const { data, error } = await supabase.from('packs').insert({ owner_id: user.id, name, description: String(form.get('description') || '').slice(0, 1000) }).select('id').single();
  if (error || !data) return { error: 'The pack could not be created.' };
  redirect('/homebrew/packs/' + data.id);
}

export async function deletePack(id: string) {
  const { supabase } = await requireViewer();
  await supabase.from('packs').delete().eq('id', id);
  revalidatePath('/homebrew');
  redirect('/homebrew');
}

export async function setInPack(packId: string, entityId: string, on: boolean) {
  const { supabase } = await requireViewer();
  if (on) await supabase.from('pack_entities').upsert({ pack_id: packId, entity_id: entityId });
  else await supabase.from('pack_entities').delete().eq('pack_id', packId).eq('entity_id', entityId);
  revalidatePath('/homebrew/packs/' + packId);
}

// Attach every entry of a pack to a campaign in one go.
export async function attachPack(packId: string, _: BrewState, form: FormData): Promise<BrewState> {
  const { supabase } = await requireViewer();
  const campaignId = String(form.get('campaign') || '');
  const { data: items } = await supabase.from('pack_entities').select('entity_id').eq('pack_id', packId);
  if (!campaignId || !items?.length) return { error: 'Choose a campaign. (An empty pack has nothing to attach.)' };
  const { error } = await supabase.from('campaign_entities').upsert(items.map((i) => ({ campaign_id: campaignId, entity_id: i.entity_id, pack_id: packId })), { onConflict: 'campaign_id,entity_id', ignoreDuplicates: true });
  if (error) return fail(error.message, 'The pack could not be attached. You can attach packs to campaigns you run.');
  return { note: `${items.length} entr${items.length === 1 ? 'y' : 'ies'} attached.` };
}

// Add every entry of a pack you may use (your own, an official free one, or one you
// bought) to a campaign you run. The database checks both halves.
export async function attachUsablePack(packId: string, _: BrewState, form: FormData): Promise<BrewState> {
  const { supabase } = await requireViewer();
  const campaignId = String(form.get('campaign') || '');
  if (!campaignId) return { error: 'Choose a campaign.' };
  const { data, error } = await supabase.rpc('attach_pack', { p: packId, c: campaignId });
  if (error) return { error: 'That pack could not be added. You can add packs to campaigns you run.' };
  revalidatePath('/', 'layout');
  return { note: data ? `Added: ${data} entr${data === 1 ? 'y' : 'ies'}. Your players will find them on their sheets.` : 'That campaign already has everything in this pack.' };
}

// Import a pack from the JSON this site exports.
export async function importPack(_: BrewState, form: FormData): Promise<BrewState> {
  const { supabase, user } = await requireViewer();
  const { data: plan } = await supabase.rpc('my_plan');
  if (!plan?.pro) return { upgrade: 'homebrew_full', error: 'Packs are part of Pro.' };
  let parsed: any;
  try { parsed = JSON.parse(String(form.get('json') || '').slice(0, 2_000_000)); } catch { return { error: 'That is not valid JSON. Paste the whole file a pack export gave you.' }; }
  if (parsed?.format !== 'dungeons-by-bryce-pack' || !Array.isArray(parsed.entries)) return { error: 'That does not look like a pack exported from this site.' };
  const { data: pack, error } = await supabase.from('packs').insert({ owner_id: user.id, name: String(parsed.name || 'Imported pack').slice(0, 120), description: String(parsed.description || '').slice(0, 1000) }).select('id').single();
  if (error || !pack) return { error: 'The pack could not be created.' };
  let made = 0;
  for (const e of parsed.entries.slice(0, 500)) {
    const row = clean({ type: e.type, name: e.name, status: 'draft', depth: e.depth, source: e.source, data: e.data });
    if (typeof row === 'string') continue;
    for (let n = 1; n < 20; n++) {
      const r = await supabase.from('entities').insert({ ...row, slug: slugOf(row.name) + (n > 1 ? '-' + n : ''), owner_id: user.id }).select('id').single();
      if (r.data) { await supabase.from('pack_entities').insert({ pack_id: pack.id, entity_id: r.data.id }); made++; break; }
      if (!/duplicate|unique/i.test(r.error?.message || '')) break;
    }
  }
  revalidatePath('/homebrew');
  redirect(`/homebrew/packs/${pack.id}?imported=${made}`);
}
