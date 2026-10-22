'use server';
import { revalidatePath } from 'next/cache';
import { requireViewer } from '@/lib/auth';
import { getCampaign } from '@/lib/campaign';
import { flag, NOT_AVAILABLE } from '@/lib/flags';
import { hasFeature, type HubFeatureId } from '@/config/hub-features';
import { saveContentRow } from '@/app/c/[slug]/actions';
import { revealedVis, type Ref } from './schedule';
import { parseTrigger } from './triggers';

type Result = { error?: string; note?: string };
const NOT_ALLOWED = 'You are not allowed to change that.';
const fail = (message: string | undefined): Result => ({ error: /row-level security|permission|not allowed/i.test(message || '') ? NOT_ALLOWED : /upgrade:/.test(message || '') ? 'That is part of Pro.' : 'That did not save. Try again.' });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// Start a session, or mark it played (issue 117). Whatever was waiting for it is revealed by the
// database as the status changes (sessions_reveal_log, and the rule reveal_met()), not here.
// Who may change a session is the database's rule too.
export async function stepSession(slug: string, sessionId: string, to: 'running' | 'played'): Promise<Result> {
  if (!(await flag('hub_v2_visibility')) && !(await flag('hub_v2_reveals'))) return { error: NOT_AVAILABLE };
  if (to !== 'running' && to !== 'played') return { error: 'That did not save.' };
  const { supabase } = await requireViewer();
  const { data, error } = await supabase.from('sessions').update({ status: to }).eq('id', sessionId).select('id').maybeSingle();
  if (error || !data) return { error: 'That did not save.' };
  revalidatePath('/c/' + slug, 'layout');
  return { note: to === 'running' ? 'Session started.' : 'Marked played.' };
}

// ---------------------------------------------------------------- the Reveals page (item 14)
//
// Every change below is made with the DM's own login, so the database's rules decide: a co-DM
// needs "Reveal and schedule reveals" to change who sees an entry, and "Edit pages and content"
// for page blocks and attached homebrew.

// How the reveal log words a line, by kind (the same words as the database's entries_log()).
const LINE: Record<string, string> = { region: 'A new part of a map is open', map: 'A new map: ', pin: 'A new pin on a map: ', npc: 'Someone new to know: ', clock: 'A faction\'s progress is now known: ', quest: 'A new quest: ' };
const lineFor = (kind: string, title: string) => (kind === 'region' ? LINE.region : (LINE[kind] ?? 'Newly revealed: ') + title).slice(0, 200);

// The page's flag, the campaign's switch for this part of it, and a DM of it who is not previewing.
async function dmCtx(slug: string, feature: HubFeatureId) {
  if (!(await flag('hub_v2_reveals'))) return null;
  const ctx = await getCampaign(slug);
  return ctx.realDm && !ctx.asPlayer && ctx.access.writable && hasFeature(ctx.campaign.settings, feature) ? ctx : null;
}

// "Reveal now": everyone, or the players it names, from now on, with its line in the reveal log.
export async function revealNow(slug: string, ref: Ref): Promise<Result> {
  const ctx = await dmCtx(slug, 'reveals.schedule');
  if (!ctx) return { error: NOT_AVAILABLE };
  const { supabase, campaign } = ctx;
  if (!ref || !UUID.test(String(ref.id))) return { error: 'That did not save.' };
  const feed = !!campaign.settings?.feed;

  if (ref.type === 'block') {
    const r = await saveContentRow(slug, ref.id, { hidden: false, reveal_when: null, from_stage: null });
    return r?.error ? r : { note: 'Revealed.' };
  }

  if (ref.type === 'entry') {
    const { data: e } = await supabase.from('entries').select('id, kind, title, vis, vis_players, live').eq('id', ref.id).eq('campaign_id', campaign.id).maybeSingle();
    if (!e || e.kind === 'log') return { error: 'That is not in this campaign.' };
    const next = revealedVis(e);
    const { error } = await supabase.from('entries').update({ ...next, live: true }).eq('id', e.id);
    if (error) return fail(error.message);
    // the database writes the line when something stops being DM only or joins the feed; here
    // it was waiting for something else, so the line is written here
    // (an objective gets no line: people who cannot see its quest yet would read it)
    if (e.vis !== 'dm' && e.live && e.kind !== 'objective') {
      await supabase.from('entries').insert({ campaign_id: campaign.id, kind: 'log', owner: null, title: lineFor(e.kind, e.title), live: feed, vis: next.vis, vis_players: next.vis_players, data: { entry: e.id, kind: e.kind } });
    }
  } else if (ref.type === 'brew') {
    const { data: a } = await supabase.from('campaign_entities').select('entity_id, vis, vis_players, entities(name)').eq('campaign_id', campaign.id).eq('entity_id', ref.id).maybeSingle();
    if (!a) return { error: 'That is not in this campaign.' };
    const next = revealedVis(a);
    const { error } = await supabase.from('campaign_entities').update(next).eq('campaign_id', campaign.id).eq('entity_id', ref.id);
    if (error) return fail(error.message);
    const name = String((a as { entities?: { name?: string } | null }).entities?.name ?? 'homebrew');
    await supabase.from('entries').insert({ campaign_id: campaign.id, kind: 'log', owner: null, title: ('Newly revealed: ' + name).slice(0, 200), live: feed, vis: next.vis, vis_players: next.vis_players, data: { kind: 'brew' } });
  } else return { error: 'That did not save.' };

  revalidatePath('/c/' + slug, 'layout');
  return { note: 'Revealed.' };
}

const VALUES = new Set(['all', 'dm', 'players', 'stage', 'entry', 'players_stage', 'players_entry', 'when', 'players_when']);
type VisValue = { vis: string; vis_players: string[]; vis_stage: string | null; vis_entry?: string | null };

// "Change when" for an entry or attached homebrew: the answer from "Who sees this?".
export async function setWhen(slug: string, ref: Ref, v: VisValue): Promise<Result> {
  const ctx = await dmCtx(slug, 'reveals.schedule');
  if (!ctx) return { error: NOT_AVAILABLE };
  const { supabase, campaign } = ctx;
  if (!ref || !UUID.test(String(ref.id)) || !v || !VALUES.has(v.vis)) return { error: 'That did not save.' };
  const players = (Array.isArray(v.vis_players) ? v.vis_players : []).filter((x) => UUID.test(String(x))).slice(0, 50);
  let stage: string | null = null;
  if (v.vis === 'stage' || v.vis === 'players_stage') stage = campaign.phases.some((p) => p.id === v.vis_stage) ? String(v.vis_stage) : null;
  else if (v.vis === 'when' || v.vis === 'players_when') stage = parseTrigger(v.vis_stage) ? String(v.vis_stage) : null;
  else stage = typeof v.vis_stage === 'string' ? v.vis_stage.slice(0, 80) : null;   // kept, as the picker keeps it
  const entry = v.vis_entry && UUID.test(String(v.vis_entry)) ? String(v.vis_entry) : null;
  if ((v.vis === 'stage' || v.vis === 'players_stage' || v.vis === 'when' || v.vis === 'players_when') && !stage) return { error: 'Choose when.' };
  if ((v.vis === 'entry' || v.vis === 'players_entry') && !entry) return { error: 'Choose a story beat.' };
  const row = { vis: v.vis, vis_players: players, vis_stage: stage, vis_entry: entry };
  const q = ref.type === 'entry'
    ? supabase.from('entries').update(row).eq('id', ref.id).eq('campaign_id', campaign.id).neq('kind', 'log')
    : ref.type === 'brew' ? supabase.from('campaign_entities').update(row).eq('campaign_id', campaign.id).eq('entity_id', ref.id) : null;
  if (!q) return { error: 'That did not save.' };
  const { data, error } = await q.select().maybeSingle();
  if (error || !data) return fail(error?.message ?? 'not allowed');
  revalidatePath('/c/' + slug, 'layout');
  return { note: 'Saved.' };
}

// "Add plot secret": a secret of the World state tool, DM only, its detail kept with the secrets.
export async function addPlotSecret(slug: string, _: Result | null, form: FormData): Promise<Result> {
  const ctx = await dmCtx(slug, 'reveals.plot');
  if (!ctx) return { error: NOT_AVAILABLE };
  const title = String(form.get('title') || '').replace(/\s+/g, ' ').trim().slice(0, 200);
  const detail = String(form.get('detail') || '').replace(/\r\n?/g, '\n').trim().slice(0, 5000);
  if (!title) return { error: 'Write the secret first.' };
  const { supabase, campaign } = ctx;
  const { data, error } = await supabase.from('entries').insert({ campaign_id: campaign.id, kind: 'secret', title, vis: 'dm', vis_players: [], live: true, data: {} }).select('id').single();
  if (error || !data) return fail(error?.message);
  if (detail) await supabase.from('entry_secrets').upsert({ entry_id: data.id, campaign_id: campaign.id, data: { detail } });
  revalidatePath('/c/' + slug, 'layout');
  return { note: 'Added. It is under Unscheduled until you choose when it comes out.' };
}
