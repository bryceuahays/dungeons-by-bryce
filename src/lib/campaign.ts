import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { requireViewer } from './auth';
import { safeCssValue } from './sanitize';
import type { Campaign, ContentRow, Section } from './types';
import type { CampaignAccess } from './entitlements';
import { RULES, rulesOf } from '@/config/rules';

export const VIEW_AS_PLAYER = 'dbb-view-as-player';
// The preview cookie is "1" (any player, at the current stage) or JSON {p: player id, s: stage id}.
export type ViewAs = { player: string | null; stage: string | null };
export function readViewAs(value: string | undefined): ViewAs | null {
  if (!value) return null;
  if (value === '1') return { player: null, stage: null };
  try { const v = JSON.parse(value); return { player: typeof v.p === 'string' && /^[0-9a-f-]{36}$/.test(v.p) ? v.p : null, stage: typeof v.s === 'string' ? v.s : null }; } catch { return null; }
}

export type Face = { phase: string; slug: string; title: string; tagline: string };

// Everything a campaign page needs to know about who is looking.
// isDm is the *effective* role: a DM using "View as player" is treated as a player
// by every query below, so the preview is built from exactly what a player receives.
//
// The campaigns row only ever holds the title, address and tagline for the current
// phase. The real ones (and every other phase's) are in campaign_faces, which only the
// DM can read.
export const getCampaign = cache(async (slug: string) => {
  const store = cookies();
  const viewerP = requireViewer();
  const { supabase } = await viewerP;
  // one round trip: the campaign and its tabs (row-level security filters both)
  const [viewer, { data: plan }, { data: row }] = await Promise.all([
    viewerP,
    supabase.rpc('campaign_access', { p_slug: slug }),
    supabase.from('campaigns').select('*, sections(*), memberships(user_id, role), head_reveals(campaign_id)').eq('slug', slug).maybeSingle(),
  ]);
  if (!row) {
    // an address from another phase sends you to the current one; anything else does not exist
    const { data: now } = await supabase.rpc('campaign_alias', { p_slug: slug });
    if (now) redirect('/c/' + now);
    notFound();
  }
  const { sections: allSections, memberships, head_reveals: reveal, ...campaign } = row as Campaign & { sections: Section[]; memberships: { user_id: string; role: string }[]; head_reveals: unknown };
  // The DM of this campaign is whoever owns it (or has been made a co-DM of it).
  const realDm = campaign.owner_id === viewer.user.id || (memberships ?? []).some((m) => m.user_id === viewer.user.id && m.role === 'dm');
  const preview = realDm ? readViewAs((await store).get(VIEW_AS_PLAYER)?.value) : null;
  const asPlayer = !!preview;
  // The Head DM, in a campaign someone else runs that they have unhidden: reads what its
  // DM reads, changes nothing (the database refuses the writes).
  const headView = !realDm && viewer.isHead && (Array.isArray(reveal) ? reveal.length > 0 : !!reveal);
  const isDm = (realDm && !asPlayer) || headView;
  // Previewing at another stage: the page is built as if the campaign were at that stage.
  const order = campaign.phases.map((p) => p.id);
  const realPhase = campaign.phase;
  let viewFace: Face | null = null;
  if (preview?.stage && order.includes(preview.stage) && preview.stage !== campaign.phase) {
    campaign.phase = preview.stage;
    const { data: f } = await supabase.from('campaign_faces').select('phase, slug, title, tagline').eq('campaign_id', campaign.id).in('phase', [preview.stage, '']);
    viewFace = ((f ?? []) as Face[]).find((x) => x.phase === preview.stage) ?? ((f ?? []) as Face[]).find((x) => x.phase === '') ?? null;
    if (viewFace) { campaign.title = viewFace.title; campaign.tagline = viewFace.tagline; }
  }
  const reached = (stage: string | null | undefined) => !stage || (order.indexOf(stage) >= 0 && order.indexOf(campaign.phase) >= order.indexOf(stage));
  const sections = (allSections ?? [])
    .filter((s) => (isDm ? s.audience !== 'player' : s.audience !== 'dm' && (!s.phase || s.phase === campaign.phase) && reached(s.from_stage)))
    .sort((a, b) => a.sort - b.sort);
  let faces: Face[] = [];
  if (isDm) {
    const { data } = await supabase.from('campaign_faces').select('phase, slug, title, tagline').eq('campaign_id', campaign.id);
    faces = (data ?? []) as Face[];
  }
  const real = faces.find((f) => f.phase === '');
  // the plan of the DM who owns this campaign, and whether it can still be changed
  const access: CampaignAccess = { pro: !!plan?.pro, creator: !!plan?.creator, writable: plan?.writable !== false };
  return {
    access, canEdit: realDm && access.writable && !asPlayer,
    viewAs: preview ?? { player: null, stage: null }, realPhase,
    ...viewer, campaign, sections, isDm, realDm, asPlayer, headView, faces,
    // what the DM calls the campaign; players only ever get campaign.title
    dmTitle: isDm && real ? real.title : campaign.title,
  };
});

export type CampaignCtx = Awaited<ReturnType<typeof getCampaign>>;

// "Hidden from players until after the fair" / "Shown to players only before the fair"
export function phaseLabel(campaign: Campaign, phase: string | null | undefined): string {
  if (!phase) return '';
  const order = campaign.phases.map((p) => p.id);
  const name = campaign.phases.find((p) => p.id === phase)?.label ?? phase;
  const l = name.charAt(0).toLowerCase() + name.slice(1);
  const later = order.indexOf(phase) > order.indexOf(campaign.phase);
  return later ? `Hidden from players until ${l}` : `Shown to players only ${l}`;
}

// Content rows for the viewer.
// Players (and the DM previewing as a player) get player rows for the current phase.
// The DM gets every phase, the DM wording wherever both exist, and `_phase` on each row
// that players only see in one phase, so the page can label it.
export async function getContent(ctx: CampaignCtx, opts: { section?: string; kinds?: string[] } = {}): Promise<ContentRow[]> {
  const { supabase, campaign, isDm } = ctx;
  let q = supabase.from('content').select('*').eq('campaign_id', campaign.id).eq('hidden', false);
  if (opts.section) q = q.eq('section', opts.section);
  if (opts.kinds) q = q.in('kind', opts.kinds);
  if (!isDm) {
    q = q.eq('visibility', 'player');
    q = campaign.phase ? q.or(`phase.is.null,phase.eq.${campaign.phase}`) : q.is('phase', null);
  }
  const { data } = await q.order('sort').order('visibility');
  const all = (data ?? []) as ContentRow[];
  if (!isDm) {
    // The database has already applied these two rules for a real player. They are
    // applied again here for a DM who is previewing as a player (whose login reads everything).
    const order = campaign.phases.map((p) => p.id);
    const me = ctx.asPlayer ? ctx.viewAs.player : ctx.user.id;
    return all.filter((r) => (!r.from_stage || (order.indexOf(r.from_stage) >= 0 && order.indexOf(campaign.phase) >= order.indexOf(r.from_stage)))
      && (!r.only_players || (!!me && r.only_players.includes(me))));
  }
  const rows = all;
  const twin = new Map(rows.filter((r) => r.visibility === 'player').map((r) => [r.section + '|' + r.kind + '|' + r.key + '|' + (r.phase ?? ''), r]));
  const dmKeys = new Set(rows.filter((r) => r.visibility === 'dm').map((r) => r.section + '|' + r.kind + '|' + r.key));
  return rows
    .filter((r) => r.visibility === 'dm' || !dmKeys.has(r.section + '|' + r.kind + '|' + r.key))
    .map((r) => {
      if (r.visibility === 'player') return { ...r, _phase: r.phase };
      // the DM's wording of a row players only see in one phase carries that phase's label
      const p = [...twin.values()].find((t) => t.section === r.section && t.key === r.key && t.kind === r.kind);
      return { ...r, _phase: p?.phase ?? null };
    });
}

/* eslint-disable @typescript-eslint/no-explicit-any */
// Races and factions. A race is one always-shown row plus one row per phase (its history,
// some key lines, and so on). Players receive the row for the current phase only. The DM
// gets the last phase's version as the main one and the others alongside, for labelling.
export async function getLore(ctx: CampaignCtx) {
  const rows = await getContent(ctx, { kinds: ['race', 'race-phase', 'race-dm', 'faction', 'faction-dm'] });
  const order = ctx.campaign.phases.map((p) => p.id);
  const races = rows.filter((r) => r.kind === 'race').map((r) => {
    const phased = rows.filter((p) => p.kind === 'race-phase' && p.key === r.key)
      .sort((a, b) => order.indexOf(b.phase ?? '') - order.indexOf(a.phase ?? ''));
    const dm = rows.find((d) => d.kind === 'race-dm' && d.key === r.key);
    const main = phased[0];
    const race: any = { ...r.body, ...(main?.body ?? {}), ...(dm?.body ?? {}), _section: r.section };
    if (race.traitAfter) {
      race.traits = (race.traits ?? []).map((t: string[]) => (race.traitAfter[t[0]] ? [t[0], t[1] + race.traitAfter[t[0]], t[2], race.traitAfter[t[0]]] : t));
    }
    if (ctx.isDm && main) {
      race._mainPhase = main.phase;
      race._phased = Object.keys(main.body ?? {});
      race._alts = phased.slice(1).map((p) => ({ phase: p.phase, ...p.body }));
    }
    return race;
  });
  const factions = rows.filter((r) => r.kind === 'faction').map((r) => {
    const dm = rows.find((d) => d.kind === 'faction-dm' && d.key === r.key);
    return { ...r.body, ...(dm ? dm.body : {}), _section: r.section, _phase: (r as any)._phase ?? null };
  });
  return { races, factions };
}

// What the standard sheet can draw on: the SRD, plus the homebrew attached to this
// campaign that this viewer is allowed to see (row-level security decides).
export async function getSheetEntities(ctx: CampaignCtx, types = ['race', 'class', 'subclass', 'background', 'feat', 'spell', 'resource'], opts: { liteSpells?: boolean } = {}) {
  const cols = 'id, type, name, source, srd_version, status, version, change_note, data';
  const versions = RULES[rulesOf(ctx.campaign.settings)].versions as readonly string[];
  // the SRD is large: it is read in pages, and (for the sheet) spells come without their
  // long text, which the sheet fetches when a spell is opened
  const lite = opts.liteSpells && types.includes('spell');
  const page = async (wanted: string[], select: string) => {
    const out: any[] = [];
    if (!wanted.length) return out;
    for (let from = 0; ; from += 1000) {
      const { data } = await ctx.supabase.from('entities').select(select).eq('source', 'srd').in('srd_version', versions).in('type', wanted).order('name').range(from, from + 999);
      out.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }
    return out;
  };
  const [srd, spells, attached] = await Promise.all([
    page(types.filter((t) => !(lite && t === 'spell')), cols),
    lite ? page(['spell'], 'id, type, name, source, srd_version, status, version, level:data->level, school:data->school, classes:data->classes, ritual:data->ritual') : [],
    ctx.supabase.from('campaign_entities').select(`vis, vis_players, vis_stage, entities(${cols})`).eq('campaign_id', ctx.campaign.id),
  ]);
  const mine = ((attached.data ?? []) as any[])
    .filter((a) => a.entities && types.includes(a.entities.type))
    // the DM previewing as a player gets what players get
    .filter((a) => ctx.realDm && !ctx.asPlayer ? true : a.entities.status !== 'draft' && a.vis !== 'dm')
    .map((a) => a.entities);
  return [...srd, ...spells.map(({ level, school, classes, ritual, ...e }) => ({ ...e, change_note: '', data: { level, school, classes, ritual, _lite: true } })), ...mine];
}

export { themeStyle } from './theme-style';
