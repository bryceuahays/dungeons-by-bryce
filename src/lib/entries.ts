import 'server-only';
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { CampaignCtx } from './campaign';

// Table tools (NPCs, story beats, maps, regions, pins, clocks, clues, and so on) are rows
// of one table, `entries`. The database decides which rows a signed-in person may read.
// The one case it cannot decide is the DM previewing as a player: the DM's own login
// reads everything, so the same rule is applied here, in code, before anything is sent.

import { entryOpen, type Entry, type Viewer } from './entry-types';
export type { Entry, Viewer };

// who the page is being built for: the signed-in person, or the player and stage a DM is previewing
export const viewerOf = (ctx: CampaignCtx): Viewer => ({
  player: ctx.asPlayer ? ctx.viewAs.player : ctx.user.id,
  stage: ctx.campaign.phase,
  stages: ctx.campaign.phases.map((p) => p.id),
});

export async function getEntries(ctx: CampaignCtx, kinds: string[], opts: { secrets?: boolean } = {}): Promise<Entry[]> {
  const { data } = await ctx.supabase.from('entries').select('*').eq('campaign_id', ctx.campaign.id).in('kind', kinds).order('sort').order('created_at');
  let rows = (data ?? []) as Entry[];
  if (ctx.asPlayer) {
    const v = viewerOf(ctx);
    // beats that have happened (needed for "once a story beat happens")
    const { data: beats } = kinds.includes('beat') ? { data: rows.filter((r) => r.kind === 'beat') } : await ctx.supabase.from('entries').select('id, status').eq('campaign_id', ctx.campaign.id).eq('kind', 'beat');
    const hit = new Set(((beats ?? []) as any[]).filter((b) => b.status === 'hit').map((b) => b.id as string));
    rows = rows.filter((e) => (v.player && e.owner === v.player) || (e.live && entryOpen(e, v, hit)));
  }
  if (opts.secrets && ctx.isDm && rows.length) {
    const { data: secrets } = await ctx.supabase.from('entry_secrets').select('entry_id, data').eq('campaign_id', ctx.campaign.id);
    const by = new Map((secrets ?? []).map((s) => [s.entry_id, s.data]));
    rows = rows.map((r) => ({ ...r, secret: by.get(r.id) ?? {} }));
  }
  return rows;
}

export type MemberName = { user_id: string; display_name: string };

// The campaign's players by name (the DM only; players get an empty list).
export async function getMembers(ctx: CampaignCtx): Promise<MemberName[]> {
  if (!ctx.realDm && !ctx.headView) return [];
  const { data } = await ctx.supabase.rpc('campaign_members', { c: ctx.campaign.id });
  return ((data ?? []) as any[]).map((m) => ({ user_id: m.user_id, display_name: m.display_name }));
}
