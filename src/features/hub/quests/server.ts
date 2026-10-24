import 'server-only';
import type { CampaignCtx } from '@/lib/campaign';
import { getEntries } from '@/lib/entries';

// What the Quest log and the Welcome page read: the quests and objectives this person may see
// (row-level security; for a DM previewing as a player, the same rule in code), the names of the
// NPCs and places they may see, how many objectives on each quest they cannot see yet, and the
// quests they track. Objectives are only ever kept under a quest the reader has.
export async function readQuests(ctx: CampaignCtx) {
  const [quests, rawObjectives, npcs, lore] = await Promise.all([
    getEntries(ctx, ['quest'], { secrets: true }),
    getEntries(ctx, ['objective']),
    getEntries(ctx, ['npc']),
    getEntries(ctx, ['lore']),
  ]);
  const ids = new Set(quests.map((q) => q.id));
  const objectives = rawObjectives.filter((o) => o.parent && ids.has(o.parent));
  const hidden: Record<string, number> = {};
  if (ctx.asPlayer) {
    // the DM's login reads every objective; count the ones the previewed player would not get
    const { data } = await ctx.supabase.from('entries').select('id, parent').eq('campaign_id', ctx.campaign.id).eq('kind', 'objective');
    const shown = new Set(objectives.map((o) => o.id));
    for (const o of (data ?? []) as { id: string; parent: string }[]) if (ids.has(o.parent) && !shown.has(o.id)) hidden[o.parent] = (hidden[o.parent] ?? 0) + 1;
  } else if (!ctx.isDm) {
    const { data } = await ctx.supabase.rpc('quest_hidden', { c: ctx.campaign.id });
    for (const r of (data ?? []) as { quest: string; hidden: number }[]) hidden[r.quest] = Number(r.hidden) || 0;
  }
  const { data: tracks } = ctx.asPlayer || ctx.headView ? { data: [] } : await ctx.supabase.from('quest_tracks').select('quest_id').eq('campaign_id', ctx.campaign.id).eq('user_id', ctx.user.id);
  return {
    quests, objectives, hidden,
    tracked: ((tracks ?? []) as { quest_id: string }[]).map((t) => t.quest_id),
    npcs: npcs.map((n) => ({ id: n.id, title: n.title })),
    places: lore.filter((e) => e.data.cat === 'places').map((e) => ({ id: e.id, title: e.title })),
  };
}
