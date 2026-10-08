'use server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireViewer } from '@/lib/auth';
import { VIEW_AS_PLAYER } from '@/lib/campaign';
import { blank } from '@/islands/character';
import { blankV2 } from '@/lib/rules/engine';
import { cleanTheme, presetOf } from '@/lib/theme';
import { parseCampaignText, MAX_IMPORT_CHARS } from '@/lib/import';
import { insertImported, removeCampaignFiles } from '@/lib/campaign-admin';

export type ActionState = { error?: string; note?: string } | null;

const campaignId = async (supabase: Awaited<ReturnType<typeof requireViewer>>['supabase'], slug: string) => {
  const { data } = await supabase.from('campaigns').select('id').eq('slug', slug).maybeSingle();
  return data?.id as string | undefined;
};
const fresh = (slug: string) => revalidatePath('/c/' + slug, 'layout');

// ---------------------------------------------------------------- everyone

export async function setViewAsPlayer(slug: string, on: boolean, pick?: { player?: string; stage?: string } | FormData) {
  await requireViewer();
  const store = await cookies();
  const who = pick && !(pick instanceof FormData) ? pick : null;
  const value = who && (who.player || who.stage) ? JSON.stringify({ p: who.player || '', s: who.stage || '' }) : '1';
  if (on) store.set(VIEW_AS_PLAYER, value, { path: '/', sameSite: 'lax', httpOnly: true });
  else store.delete(VIEW_AS_PLAYER);
  fresh(slug);
  redirect('/c/' + slug);
}

export async function createBlankCharacter(slug: string) {
  const { supabase, user, profile } = await requireViewer();
  const id = await campaignId(supabase, slug);
  if (!id) redirect('/campaigns');
  const data = { ...blank(), player: profile.display_name, t: Date.now() };
  const { data: row } = await supabase.from('characters').insert({ owner: user.id, campaign_id: id, data }).select('id').single();
  redirect(`/c/${slug}/sheet${row ? '?c=' + row.id : ''}`);
}

// A new character on the standard fifth edition sheet.
export async function createCharacterV2(slug: string) {
  const { supabase, user, profile } = await requireViewer();
  const id = await campaignId(supabase, slug);
  if (!id) redirect('/campaigns');
  const { data: row } = await supabase.from('characters').insert({ owner: user.id, campaign_id: id, data: { ...blankV2(), player: profile.display_name, t: Date.now() } }).select('id').single();
  redirect(`/c/${slug}/sheet${row ? '?c=' + row.id : ''}`);
}

export async function deleteCharacter(slug: string, characterId: string) {
  const { supabase } = await requireViewer();
  await supabase.from('characters').delete().eq('id', characterId); // RLS: only the owner or the DM
  fresh(slug);
  redirect(`/c/${slug}/sheet`);
}

// ---------------------------------------------------------------- DM: campaign

// Switching phase can change the campaign's title and address (see campaign_faces), so
// afterwards the DM is sent to the Manage page at whatever the address is now.
export async function setPhase(slug: string, phase: string) {
  const { supabase } = await requireViewer();
  const { data: c } = await supabase.from('campaigns').select('id, phases').eq('slug', slug).maybeSingle();
  if (!c || !(c.phases as { id: string }[]).some((p) => p.id === phase)) return;
  await supabase.from('campaigns').update({ phase }).eq('id', c.id);
  const { data: now } = await supabase.from('campaigns').select('slug').eq('id', c.id).single();
  revalidatePath('/', 'layout');
  redirect(`/c/${now?.slug ?? slug}/manage`);
}

// "View as" from the Manage page: any player, at any stage.
export async function previewAs(slug: string, form: FormData) {
  await setViewAsPlayer(slug, true, { player: String(form.get('player') || ''), stage: String(form.get('stage') || '') });
}

// Reveal stages: the ordered list, and one-click forward and back.
export async function saveStages(slug: string, _: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await requireViewer();
  const { data: c } = await supabase.from('campaigns').select('id, phase, phases').eq('slug', slug).maybeSingle();
  if (!c) return { error: 'Campaign not found.' };
  const old = c.phases as { id: string; label: string }[];
  const labels = String(form.get('stages') || '').split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 20);
  const used = new Set<string>();
  const stages = labels.map((label) => {
    // a stage keeps its id when only its position or wording changes, so nothing tagged with it is lost
    let id = old.find((o) => o.label === label && !used.has(o.id))?.id ?? (label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'stage');
    while (used.has(id)) id += '-2';
    used.add(id);
    return { id, label: label.slice(0, 60) };
  });
  const phase = stages.some((s) => s.id === c.phase) ? c.phase : stages[0]?.id ?? '';
  const { error } = await supabase.from('campaigns').update({ phases: stages, phase }).eq('id', c.id);
  if (error) return /upgrade:/.test(error.message) ? { error: 'More than two stages is part of Pro. Your two stages are unchanged.' } : { error: 'That did not save.' };
  revalidatePath('/', 'layout');
  const { data: now } = await supabase.from('campaigns').select('slug').eq('id', c.id).single();
  if (now && now.slug !== slug) redirect(`/c/${now.slug}/manage`);
  return { note: stages.length ? 'Stages saved.' : 'Stages removed. Everything tagged for a stage is now treated as always shown.' };
}

export async function stepStage(slug: string, dir: 1 | -1) {
  const { supabase } = await requireViewer();
  const { data: c } = await supabase.from('campaigns').select('id, phase, phases').eq('slug', slug).maybeSingle();
  if (!c) return;
  const order = (c.phases as { id: string }[]).map((p) => p.id);
  const next = order[order.indexOf(c.phase) + dir];
  if (next) await setPhase(slug, next);
}

// What players can choose when they make a character: the entries the DM unticked on the Players tab.
export async function saveAvailable(slug: string, hidden: string[]): Promise<ActionState> {
  const { supabase } = await requireViewer();
  const { data: c } = await supabase.from('campaigns').select('id, settings').eq('slug', slug).maybeSingle();
  if (!c) return { error: 'Campaign not found.' };
  const ids = [...new Set((Array.isArray(hidden) ? hidden : []).map(String).filter((x) => /^[0-9a-f-]{36}$/.test(x)))].slice(0, 5000);
  const { error } = await supabase.from('campaigns').update({ settings: { ...(c.settings ?? {}), hidden: ids } }).eq('id', c.id);
  if (error) return { error: 'That did not save. Only the campaign’s DM can change it.' };
  fresh(slug);
  return { note: 'Saved.' };
}

// Settings every member may read: the "newly revealed" feed, the current session number, the featured video.
export async function saveSetting(slug: string, key: 'feed' | 'session' | 'video' | 'timeline' | 'rules', value: unknown): Promise<ActionState> {
  const { supabase } = await requireViewer();
  const { data: c } = await supabase.from('campaigns').select('id, settings').eq('slug', slug).maybeSingle();
  if (!c) return { error: 'Campaign not found.' };
  const v = key === 'rules' ? (value === '2024' || value === 'both' ? value : '2014') : key === 'feed' || key === 'timeline' ? !!value : key === 'session' ? Math.max(0, Math.min(999, Number(value) || 0)) : String(value || '').slice(0, 300);
  const { error } = await supabase.from('campaigns').update({ settings: { ...(c.settings ?? {}), [key]: v } }).eq('id', c.id);
  if (error) return { error: 'That did not save.' };
  fresh(slug);
  return { note: 'Saved.' };
}

// The campaign's look. Free campaigns use a default theme as it is; the rest is Pro
// (the database refuses anything else on a free campaign, whatever is sent here).
export async function saveTheme(slug: string, theme: unknown): Promise<ActionState> {
  const { supabase } = await requireViewer();
  const id = await campaignId(supabase, slug);
  if (!id) return { error: 'Campaign not found.' };
  const { error } = await supabase.from('campaigns').update({ theme: presetOf(theme)?.theme ?? cleanTheme(theme) }).eq('id', id);
  if (error) return /upgrade:/.test(error.message) ? { error: 'Premium themes and the theme editor are part of Pro. Your theme is unchanged.' } : { error: 'That did not save.' };
  revalidatePath('/', 'layout');
  return { note: 'Theme saved.' };
}

export async function updateCampaign(slug: string, _: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await requireViewer();
  const id = await campaignId(supabase, slug);
  if (!id) return { error: 'Campaign not found.' };
  const title = String(form.get('title') || '').trim().slice(0, 80);
  const tagline = String(form.get('tagline') || '').trim().slice(0, 300);
  if (!title) return { error: 'The title cannot be empty.' };
  // the stages themselves are edited under "Reveal stages"; this form only sets a title for each
  const { data: cur } = await supabase.from('campaigns').select('phases').eq('id', id).single();
  const phases = (cur?.phases ?? []) as { id: string; label: string }[];

  // The real title and tagline, and an optional different title, address and tagline per
  // phase. The database copies the right one onto the campaign for the current phase.
  const real = await supabase.from('campaign_faces').update({ title, tagline }).eq('campaign_id', id).eq('phase', '');
  if (real.error) return { error: 'The title did not save.' };
  for (const p of phases) {
    const ft = String(form.get('face-title-' + p.id) || '').trim().slice(0, 80);
    const fs = String(form.get('face-slug-' + p.id) || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
    const fg = String(form.get('face-tagline-' + p.id) || '').trim().slice(0, 300);
    if (ft && fs.length >= 2) {
      const r = await supabase.from('campaign_faces').upsert({ campaign_id: id, phase: p.id, slug: fs, title: ft, tagline: fg }, { onConflict: 'campaign_id,phase' });
      if (r.error) return { error: `The address "${fs}" is already in use. Choose another.` };
    } else if (!ft) {
      await supabase.from('campaign_faces').delete().eq('campaign_id', id).eq('phase', p.id);
    } else return { error: 'A phase title also needs a web address of at least two characters.' };
  }
  const keep = ['', ...phases.map((p) => p.id)];
  const { data: all } = await supabase.from('campaign_faces').select('phase').eq('campaign_id', id);
  for (const f of all ?? []) if (!keep.includes(f.phase)) await supabase.from('campaign_faces').delete().eq('campaign_id', id).eq('phase', f.phase);

  revalidatePath('/', 'layout');
  const { data: now } = await supabase.from('campaigns').select('slug').eq('id', id).single();
  if (now && now.slug !== slug) redirect(`/c/${now.slug}/manage`);
  return { note: 'Saved.' };
}

// ---------------------------------------------------------------- DM: invites and members

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no look-alikes
function newCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
}

export async function createInvite(slug: string, _: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await requireViewer();
  const id = await campaignId(supabase, slug);
  if (!id) return { error: 'Campaign not found.' };
  const uses = parseInt(String(form.get('uses') || ''), 10);
  const days = parseInt(String(form.get('days') || ''), 10);
  const row = {
    campaign_id: id,
    code: newCode(),
    uses_left: uses > 0 ? uses : null,
    expires_at: days > 0 ? new Date(Date.now() + days * 86400000).toISOString() : null,
  };
  const { error } = await supabase.from('invites').insert(row);
  if (error) return { error: 'The code could not be created. Try again.' };
  fresh(slug);
  return { note: 'New code: ' + row.code };
}

export async function revokeInvite(slug: string, inviteId: string) {
  const { supabase } = await requireViewer();
  await supabase.from('invites').update({ revoked: true }).eq('id', inviteId);
  fresh(slug);
}

export async function removeMember(slug: string, userId: string) {
  const { supabase } = await requireViewer();
  const id = await campaignId(supabase, slug);
  if (id) await supabase.from('memberships').delete().eq('campaign_id', id).eq('user_id', userId);
  fresh(slug);
}

// ---------------------------------------------------------------- DM: tabs

export async function addSection(slug: string, _: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await requireViewer();
  const id = await campaignId(supabase, slug);
  if (!id) return { error: 'Campaign not found.' };
  const title = String(form.get('title') || '').trim().slice(0, 40);
  const audience = form.get('audience') === 'dm' ? 'dm' : 'all';
  const s = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  if (!s) return { error: 'Give the tab a name.' };
  if (['builder', 'manage', 'edit', 'media', 'session'].includes(s)) return { error: 'That name is used by the app. Choose another.' };
  const { data: last } = await supabase.from('sections').select('sort').eq('campaign_id', id).order('sort', { ascending: false }).limit(1);
  const { error } = await supabase.from('sections').insert({ campaign_id: id, slug: s, title, audience, kind: 'content', sort: (last?.[0]?.sort ?? 0) + 10 });
  if (error) return { error: 'A tab with that name already exists.' };
  fresh(slug);
  return { note: 'Tab added.' };
}

export async function updateSection(slug: string, sectionId: string, patch: { title?: string; audience?: 'all' | 'dm' | 'player'; phase?: string; from_stage?: string; move?: -1 | 1; remove?: boolean }) {
  const { supabase } = await requireViewer();
  const id = await campaignId(supabase, slug);
  if (!id) return;
  const { data: all } = await supabase.from('sections').select('id, slug, sort, kind').eq('campaign_id', id).order('sort');
  const list = all ?? [];
  const i = list.findIndex((s) => s.id === sectionId);
  if (i < 0) return;
  if (patch.remove) {
    await supabase.from('content').delete().eq('campaign_id', id).eq('section', list[i].slug);
    await supabase.from('sections').delete().eq('id', sectionId);
  } else if (patch.move) {
    const j = i + patch.move;
    if (j >= 0 && j < list.length) {
      [list[i], list[j]] = [list[j], list[i]];
      await Promise.all(list.map((s, k) => supabase.from('sections').update({ sort: (k + 1) * 10 }).eq('id', s.id)));
    }
  } else {
    const p: Record<string, string | null> = {};
    if (patch.title) p.title = patch.title.trim().slice(0, 40);
    if (patch.audience) p.audience = patch.audience;
    if (patch.phase !== undefined) p.phase = patch.phase || null;
    if (patch.from_stage !== undefined) p.from_stage = patch.from_stage || null;
    if (Object.keys(p).length) await supabase.from('sections').update(p).eq('id', sectionId);
  }
  fresh(slug);
}

// ---------------------------------------------------------------- DM: content editor

export async function saveContentRow(slug: string, rowId: string, patch: { title?: string; body?: unknown; visibility?: 'player' | 'dm'; hidden?: boolean; phase?: string | null; from_stage?: string | null; only_players?: string[] | null }): Promise<ActionState> {
  const { supabase } = await requireViewer();
  const p: Record<string, unknown> = {};
  if (typeof patch.title === 'string') p.title = patch.title.slice(0, 120);
  if (patch.body !== undefined) p.body = patch.body;
  if (patch.visibility === 'player' || patch.visibility === 'dm') p.visibility = patch.visibility;
  if (typeof patch.hidden === 'boolean') p.hidden = patch.hidden;
  if (patch.phase !== undefined) p.phase = patch.phase || null;
  if (patch.from_stage !== undefined) p.from_stage = patch.from_stage || null;
  if (patch.only_players !== undefined) p.only_players = patch.only_players && patch.only_players.length ? patch.only_players.filter((x) => /^[0-9a-f-]{36}$/.test(x)) : null;
  const { data: saved, error } = await supabase.from('content').update(p).eq('id', rowId).select('campaign_id, section, visibility, hidden, only_players').maybeSingle();
  if (error) return /upgrade:/.test(error.message) ? { error: 'Blocks for named players are part of Pro.' } : { error: 'That did not save.' };
  // the reveal log: a block has just been shown to players
  if (saved && (patch.visibility === 'player' || patch.hidden === false) && saved.visibility === 'player' && !saved.hidden) {
    const { data: c } = await supabase.from('campaigns').select('settings').eq('id', saved.campaign_id).maybeSingle();
    const { data: tab } = await supabase.from('sections').select('title').eq('campaign_id', saved.campaign_id).eq('slug', saved.section).maybeSingle();
    await supabase.from('entries').insert({ campaign_id: saved.campaign_id, kind: 'log', owner: null, title: `New on the ${tab?.title ?? saved.section} page`, live: !!c?.settings?.feed, vis: saved.only_players ? 'players' : 'all', vis_players: saved.only_players ?? [], data: { kind: 'block', section: saved.section } });
  }
  fresh(slug);
  return { note: 'Saved.' };
}

export async function moveContentRow(slug: string, section: string, rowId: string, dir: -1 | 1) {
  const { supabase } = await requireViewer();
  const id = await campaignId(supabase, slug);
  if (!id) return;
  const { data } = await supabase.from('content').select('id, key, sort, visibility').eq('campaign_id', id).eq('section', section).order('sort').order('visibility', { ascending: false });
  const rows = data ?? [];
  // a player row and its DM wording move together
  const groups: { ids: string[]; has: boolean }[] = [];
  rows.forEach((r) => {
    const prev = rows.find((x) => x !== r && x.key === r.key && x.sort === r.sort && groups.some((g) => g.ids.includes(x.id)));
    const g = prev ? groups.find((x) => x.ids.includes(prev.id))! : (groups.push({ ids: [], has: false }), groups[groups.length - 1]);
    g.ids.push(r.id);
    if (r.id === rowId) g.has = true;
  });
  const i = groups.findIndex((g) => g.has), j = i + dir;
  if (i < 0 || j < 0 || j >= groups.length) return;
  [groups[i], groups[j]] = [groups[j], groups[i]];
  await Promise.all(groups.flatMap((g, k) => g.ids.map((rid) => supabase.from('content').update({ sort: (k + 1) * 10 }).eq('id', rid))));
  fresh(slug);
}

export async function deleteContentRow(slug: string, rowId: string) {
  const { supabase } = await requireViewer();
  await supabase.from('content').delete().eq('id', rowId);
  fresh(slug);
}

const NEW_BODY: Record<string, (title: string) => unknown> = {
  heading: (t) => ({ text: t || 'New heading', level: 2 }),
  html: () => ({ html: '<p>New text.</p>' }),
  plate: (t) => ({ html: `<h3>${t || 'New card'}</h3><p>Text.</p>`, grid: 'g2', group: 'new-' + Date.now().toString(36) }),
  secret: () => ({ tag: 'DM only', html: '<p>Secret text.</p>' }),
  table: () => ({ html: '<table><tr><th>Column</th><th>Column</th></tr><tr><td>Cell</td><td>Cell</td></tr></table>' }),
  checklist: () => ({ items: [{ text: 'First item', done: false }] }),
  video: () => ({ url: '', caption: '' }),
};

export async function addContentRow(slug: string, section: string, _: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await requireViewer();
  const id = await campaignId(supabase, slug);
  if (!id) return { error: 'Campaign not found.' };
  const kind = String(form.get('kind') || 'html');
  if (!NEW_BODY[kind]) return { error: 'Unknown kind of block.' };
  const title = String(form.get('title') || '').trim().slice(0, 120);
  const visibility = form.get('visibility') === 'player' ? 'player' : 'dm';
  const group = String(form.get('group') || '');
  const { data: last } = await supabase.from('content').select('sort').eq('campaign_id', id).eq('section', section).lt('sort', 1000).order('sort', { ascending: false }).limit(1);
  const body = NEW_BODY[kind](title) as Record<string, unknown>;
  if (kind === 'plate' && group) body.group = group;
  const { error } = await supabase.from('content').insert({
    campaign_id: id, section, kind, title: title || kind, visibility, body,
    key: kind + '-' + Date.now().toString(36), sort: (last?.[0]?.sort ?? 0) + 10,
  });
  if (error) return { error: 'The block could not be added.' };
  fresh(slug);
  return { note: 'Added at the bottom of the page. New blocks start as ' + (visibility === 'dm' ? 'DM only.' : 'visible to players.') };
}

export async function toggleChecklist(slug: string, rowId: string, index: number, done: boolean) {
  const { supabase } = await requireViewer();
  const { data: row } = await supabase.from('content').select('body').eq('id', rowId).maybeSingle();
  const items = row?.body?.items;
  if (!Array.isArray(items) || !items[index]) return;
  items[index] = { ...items[index], done };
  await supabase.from('content').update({ body: { ...row!.body, items } }).eq('id', rowId);
}

// ---------------------------------------------------------------- DM: sessions

export async function addSession(slug: string, _: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await requireViewer();
  const id = await campaignId(supabase, slug);
  if (!id) return { error: 'Campaign not found.' };
  const title = String(form.get('title') || '').trim().slice(0, 120);
  const number = parseInt(String(form.get('number') || ''), 10);
  if (!title || Number.isNaN(number)) return { error: 'Give the session a number and a title.' };
  const { error } = await supabase.from('sessions').insert({ campaign_id: id, number, title, summary: String(form.get('summary') || '').trim(), status: 'planned' });
  if (error) return { error: 'There is already a session with that number.' };
  fresh(slug);
  return { note: 'Session added.' };
}

export async function updateSession(slug: string, sessionId: string, _: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await requireViewer();
  const patch = {
    title: String(form.get('title') || '').trim().slice(0, 120),
    meta: String(form.get('meta') || '').trim().slice(0, 200),
    summary: String(form.get('summary') || '').trim(),
    status: String(form.get('status') || 'planned'),
  };
  if (!patch.title) return { error: 'The title cannot be empty.' };
  const { error } = await supabase.from('sessions').update(patch).eq('id', sessionId);
  if (error) return { error: 'That did not save.' };
  fresh(slug);
  return { note: 'Saved.' };
}

export async function saveSessionNotes(slug: string, sessionId: string, notes: string) {
  const { supabase } = await requireViewer();
  const { data } = await supabase.from('sessions').select('content').eq('id', sessionId).maybeSingle();
  await supabase.from('sessions').update({ content: { ...(data?.content ?? {}), notes } }).eq('id', sessionId);
  fresh(slug);
}

export async function saveSessionBeat(slug: string, sessionId: string, beatId: string, html: string): Promise<ActionState> {
  const { supabase } = await requireViewer();
  const { data } = await supabase.from('sessions').select('content').eq('id', sessionId).maybeSingle();
  const beats = data?.content?.beats;
  if (!Array.isArray(beats)) return { error: 'This session has no run sheet.' };
  const next = beats.map((b: { id: string; html: string }) => (b.id === beatId ? { ...b, html } : b));
  const { error } = await supabase.from('sessions').update({ content: { ...data!.content, beats: next } }).eq('id', sessionId);
  if (error) return { error: 'That did not save.' };
  fresh(slug);
  return { note: 'Saved.' };
}

export async function duplicateContentRow(slug: string, rowId: string): Promise<ActionState> {
  const { supabase } = await requireViewer();
  const { data: row } = await supabase.from('content').select('*').eq('id', rowId).maybeSingle();
  if (!row) return { error: 'That block no longer exists.' };
  const stamp = Date.now().toString(36);
  const body = row.body && typeof row.body === 'object' && 'id' in row.body ? { ...row.body, id: row.body.id + '-' + stamp } : row.body;
  const { error } = await supabase.from('content').insert({
    campaign_id: row.campaign_id, section: row.section, kind: row.kind, key: row.key + '-' + stamp, sort: row.sort,
    title: row.title + ' (copy)', body, visibility: 'dm', phase: row.phase, hidden: false,
  });
  if (error) return { error: 'The copy could not be made.' };
  fresh(slug);
  return { note: 'Copied. The copy is DM only until you change who sees it.' };
}

// ---------------------------------------------------------------- DM: paste pages, background, delete

// Adds tabs and blocks from pasted text (see /help/campaign-format) to this campaign.
export async function importPages(slug: string, _: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await requireViewer();
  const id = await campaignId(supabase, slug);
  if (!id) return { error: 'Campaign not found.' };
  const text = String(form.get('paste') || '').slice(0, MAX_IMPORT_CHARS);
  if (!text.trim()) return { error: 'Paste some text first.' };
  const imported = parseCampaignText(text);
  if (!imported.tabs.length) return { error: 'Nothing to add was found in that text. Check the format guide.' };
  const { data: last } = await supabase.from('sections').select('sort').eq('campaign_id', id).eq('kind', 'content').order('sort', { ascending: false }).limit(1);
  const r = await insertImported(supabase, id, imported, (last?.[0]?.sort ?? 0) + 10);
  if (!r.blocks && !r.tabs) return { error: 'Nothing could be added. Only the DM of a campaign can add pages to it.' };
  fresh(slug);
  return { note: `Added ${r.blocks} block${r.blocks === 1 ? '' : 's'}${r.tabs ? ` in ${r.tabs} new tab${r.tabs === 1 ? '' : 's'}` : ''}.${imported.notes.length ? ' ' + imported.notes.join(' ') : ''}` };
}

// The browser uploads the two images to private storage (only this campaign's DM may
// write in its folder). This records that they exist so the campaign pages use them.
export async function setCampaignBackground(slug: string, on: boolean): Promise<ActionState> {
  const { supabase } = await requireViewer();
  const id = await campaignId(supabase, slug);
  if (!id) return { error: 'Campaign not found.' };
  if (!on) await supabase.storage.from('backgrounds').remove([`campaign/${id}/wide`, `campaign/${id}/tall`]);
  const { data, error } = await supabase.from('campaigns').update({ background: on ? { wide: true, tall: true, v: Date.now() } : {} }).eq('id', id).select('id');
  if (error || !data?.length) return { error: 'That did not save.' };
  fresh(slug);
  return { note: on ? 'The background is in place.' : 'The background was removed.' };
}

// Deletes the campaign and everything in it. The database only allows its owner (or the Head DM).
export async function deleteCampaign(slug: string, _: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await requireViewer();
  const id = await campaignId(supabase, slug);
  if (!id) return { error: 'Campaign not found.' };
  if (String(form.get('confirm') || '').trim() !== 'DELETE') return { error: 'Type DELETE in capital letters to confirm.' };
  const { error } = await supabase.rpc('delete_campaign', { c: id });
  if (error) return { error: 'Only the person who created this campaign can delete it.' };
  await removeCampaignFiles(id);
  revalidatePath('/', 'layout');
  redirect('/campaigns');
}
