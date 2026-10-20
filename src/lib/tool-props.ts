import 'server-only';
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { CampaignCtx } from '@/lib/campaign';
import { campaignCan, campaignCanMake } from '@/lib/entitlements';
import { getMembers } from '@/lib/entries';
import { FEATURES, type Feature } from '@/config/plans';
import type { ToolProps } from '@/lib/entry-types';

// What every tool is told about the viewer. A DM previewing as a player is treated as
// that player and cannot change anything; the Head DM looking in reads but cannot write.
export async function toolProps(ctx: CampaignCtx, tool: string): Promise<ToolProps> {
  // A co-DM is offered what the owner chose for them: changing things needs "edit" or
  // "reveal"; the fight needs "combat" (or "edit"). The database refuses the rest whatever is offered.
  const may = !ctx.coDm || (tool === 'initiative' ? ctx.perms.combat || ctx.perms.edit : ctx.perms.edit || ctx.perms.reveal);
  const runsFight = tool === 'initiative' && ctx.coDm && ctx.perms.combat && !ctx.asPlayer;
  let members = await getMembers(ctx);
  if (!members.length) {
    // players know each other by the names on the party list
    const { data } = await ctx.supabase.rpc('party_cards', { c: ctx.campaign.id });
    const seen = new Map<string, string>();
    ((data ?? []) as any[]).forEach((c) => { if (c.owner && c.player) seen.set(c.owner, c.player); });
    members = [...seen].map(([user_id, display_name]) => ({ user_id, display_name }));
  }
  return {
    campaignId: ctx.campaign.id, slug: ctx.campaign.slug,
    userId: ctx.asPlayer ? ctx.viewAs.player ?? '00000000-0000-0000-0000-000000000000' : ctx.user.id,
    dm: ctx.isDm || runsFight, canWrite: ctx.access.writable && !ctx.asPlayer && !ctx.headView && may,
    stages: ctx.campaign.phases, members,
    can: Object.fromEntries((Object.keys(FEATURES) as Feature[]).map((f) => [f, campaignCan(ctx.access, f)])),
    make: Object.fromEntries((Object.keys(FEATURES) as Feature[]).map((f) => [f, campaignCanMake(ctx.access, f)])),
    session: Number(ctx.campaign.settings?.session) || 0,
  };
}
