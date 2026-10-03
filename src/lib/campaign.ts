import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { requireViewer } from './auth';
import type { Campaign, ContentRow, RuleRow, Section } from './types';

export const VIEW_AS_PLAYER = 'dbb-view-as-player';

// Everything a campaign page needs to know about who is looking.
// isDm is the *effective* role: a DM using "View as player" is treated as a player
// by every query below, so the preview is built from exactly what a player receives.
export const getCampaign = cache(async (slug: string) => {
  const viewer = await requireViewer();
  const { supabase, profile } = viewer;
  const { data: campaign } = await supabase.from('campaigns').select('*').eq('slug', slug).maybeSingle();
  if (!campaign) notFound(); // RLS: not a member means the row does not exist for you
  const realDm = profile.role === 'dm';
  const asPlayer = realDm && (await cookies()).get(VIEW_AS_PLAYER)?.value === '1';
  const isDm = realDm && !asPlayer;
  let q = supabase.from('sections').select('*').eq('campaign_id', campaign.id).order('sort');
  if (!isDm) q = q.in('audience', ['all', 'player']);
  else q = q.in('audience', ['all', 'dm']);
  const { data: sections } = await q;
  return { ...viewer, campaign: campaign as Campaign, sections: (sections ?? []) as Section[], isDm, realDm, asPlayer };
});

export type CampaignCtx = Awaited<ReturnType<typeof getCampaign>>;

// Content rows for the viewer. Players (and the DM previewing as a player) get player
// rows for the current phase. The DM gets the DM wording wherever both exist.
export async function getContent(ctx: CampaignCtx, opts: { section?: string; kinds?: string[] } = {}): Promise<ContentRow[]> {
  const { supabase, campaign, isDm } = ctx;
  let q = supabase.from('content').select('*').eq('campaign_id', campaign.id).eq('hidden', false);
  if (opts.section) q = q.eq('section', opts.section);
  if (opts.kinds) q = q.in('kind', opts.kinds);
  if (!isDm) q = q.eq('visibility', 'player');
  q = campaign.phase ? q.or(`phase.is.null,phase.eq.${campaign.phase}`) : q.is('phase', null);
  const { data } = await q.order('sort').order('visibility');
  const rows = (data ?? []) as ContentRow[];
  if (!isDm) return rows;
  const dmKeys = new Set(rows.filter((r) => r.visibility === 'dm').map((r) => r.section + '|' + r.key));
  return rows.filter((r) => r.visibility === 'dm' || !dmKeys.has(r.section + '|' + r.key));
}

// Races and factions with the DM-only fields merged in for the DM.
export async function getLore(ctx: CampaignCtx) {
  const rows = await getContent(ctx, { kinds: ['race', 'race-dm', 'faction', 'faction-dm'] });
  const pick = (kind: string) => rows.filter((r) => r.kind === kind).map((r) => {
    const dm = rows.find((d) => d.kind === kind + '-dm' && d.key === r.key);
    return { ...r.body, ...(dm ? dm.body : {}), _section: r.section };
  });
  return { races: pick('race'), factions: pick('faction') };
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
  Object.entries(theme?.colors ?? {}).forEach(([k, v]) => { if (/^[a-z0-9-]+$/.test(k)) s['--' + k] = String(v); });
  if (theme?.fonts?.display) s['--display'] = theme.fonts.display;
  if (theme?.fonts?.body) s['--body'] = theme.fonts.body;
  if (theme?.goldHi) s['--gold-hi'] = theme.goldHi;
  if (theme?.goldLo) s['--gold-lo'] = theme.goldLo;
  return s;
}
