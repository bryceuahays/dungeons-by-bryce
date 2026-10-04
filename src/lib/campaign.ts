import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { requireViewer } from './auth';
import { safeCssValue } from './sanitize';
import type { Campaign, ContentRow, RuleRow, Section } from './types';
import type { CampaignAccess } from './entitlements';

export const VIEW_AS_PLAYER = 'dbb-view-as-player';

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
  const asPlayer = realDm && (await store).get(VIEW_AS_PLAYER)?.value === '1';
  // The Head DM, in a campaign someone else runs that they have unhidden: reads what its
  // DM reads, changes nothing (the database refuses the writes).
  const headView = !realDm && viewer.isHead && (Array.isArray(reveal) ? reveal.length > 0 : !!reveal);
  const isDm = (realDm && !asPlayer) || headView;
  const sections = (allSections ?? [])
    .filter((s) => (isDm ? s.audience !== 'player' : s.audience !== 'dm' && (!s.phase || s.phase === campaign.phase)))
    .sort((a, b) => a.sort - b.sort);
  let faces: Face[] = [];
  if (isDm) {
    const { data } = await supabase.from('campaign_faces').select('phase, slug, title, tagline').eq('campaign_id', campaign.id);
    faces = (data ?? []) as Face[];
  }
  const real = faces.find((f) => f.phase === '');
  // the plan of the DM who owns this campaign, and whether it can still be changed
  const access: CampaignAccess = { pro: !!plan?.pro, writable: plan?.writable !== false };
  return {
    access, canEdit: realDm && access.writable,
    ...viewer, campaign, sections, isDm, realDm, asPlayer, headView, faces,
    // what the DM calls the campaign; players only ever get campaign.title
    dmTitle: isDm && real ? real.title : campaign.title,
  };
});

export type CampaignCtx = Awaited<ReturnType<typeof getCampaign>>;

// "Hidden from players until after session negative" / "Shown to players only before session negative"
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
  const rows = (data ?? []) as ContentRow[];
  if (!isDm) return rows;
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

// Builder rules for the current phase, grouped by kind.
export async function getRules(ctx: CampaignCtx, kinds?: string[]) {
  const { supabase, campaign } = ctx;
  const out: RuleRow[] = [];
  for (let from = 0; ; from += 1000) {
    let q = supabase.from('rules').select('kind, key, sort, data, phase').eq('campaign_id', campaign.id);
    if (kinds) q = q.in('kind', kinds);
    q = campaign.phase ? q.or(`phase.is.null,phase.eq.${campaign.phase}`) : q.is('phase', null);
    const { data } = await q.order('kind').order('sort').range(from, from + 999);
    out.push(...((data ?? []) as RuleRow[]));
    if (!data || data.length < 1000) break;
  }
  const by: Record<string, RuleRow[]> = {};
  out.forEach((r) => { (by[r.kind] ||= []).push(r); });
  return by;
}

export function themeStyle(theme: Campaign['theme']): Record<string, string> {
  const s: Record<string, string> = {};
  // theme values are written by the campaign's DM and end up in a style attribute, so each one is checked
  const put = (name: string, v: unknown) => { const ok = safeCssValue(v); if (ok) s[name] = ok; };
  Object.entries(theme?.colors ?? {}).forEach(([k, v]) => { if (/^[a-z0-9-]+$/.test(k)) put('--' + k, v); });
  put('--display', theme?.fonts?.display);
  put('--body', theme?.fonts?.body);
  put('--gold-hi', theme?.goldHi);
  put('--gold-lo', theme?.goldLo);
  return s;
}
