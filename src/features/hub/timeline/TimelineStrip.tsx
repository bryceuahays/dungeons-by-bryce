/* eslint-disable @typescript-eslint/no-explicit-any */
import type { CampaignCtx } from '@/lib/campaign';
import { getEntries } from '@/lib/entries';
import { campaignCan, campaignCanMake } from '@/lib/entitlements';
import { hasFeature, hasPage } from '@/config/hub-features';
import { flag } from '@/lib/flags';
import { parseTrigger } from '@/features/hub/reveals/triggers';
import { buildTimeline, type Reveal } from './model';
import { StripView } from './StripView';
import './timeline.css';

// The timeline strip (hub version 2, item 15; Timeline.png), at the foot of every hub page and at the
// top of the Timeline tool. A player gets the beats that have happened and that they may see (read
// with their own login, so the database leaves out the rest); the DM also gets planned sessions, key
// beats aimed at them, and the reveals waiting for them. Quests are read with their login too.
export async function TimelineStrip({ ctx, full = false }: { ctx: CampaignCtx; full?: boolean }) {
  if (!campaignCan(ctx.access, 'timeline')) return null;
  const settings = ctx.campaign.settings;
  const dm = ctx.isDm;
  const session = Number(settings?.session) || 0;
  const beats = await getEntries(ctx, ['beat']);
  // quests (item 17), in the session they started: only those this person may see
  const quests = hasPage(settings, 'quests') && (await flag('hub_v2_quests')) ? (await getEntries(ctx, ['quest'])).map((q) => ({ id: q.id, title: q.title, since: Number(q.data?.since) || 0 })) : [];
  let planned: { number: number; title: string; status: string }[] = [];
  const reveals: Reveal[] = [];
  if (dm && hasFeature(settings, 'timeline.planned')) {
    const [{ data: sessions }, { data: waiting }, { data: blocks }] = await Promise.all([
      ctx.supabase.from('sessions').select('number, title, status').eq('campaign_id', ctx.campaign.id).gt('number', session),
      ctx.supabase.from('entries').select('title, vis_stage').eq('campaign_id', ctx.campaign.id).in('vis', ['when', 'players_when']).like('vis_stage', 'session:%'),
      ctx.supabase.from('content').select('title, reveal_when').eq('campaign_id', ctx.campaign.id).eq('hidden', true).like('reveal_when', 'session:%'),
    ]);
    planned = ((sessions ?? []) as any[]).map((s) => ({ number: Number(s.number), title: String(s.title ?? ''), status: String(s.status) }));
    for (const r of [...((waiting ?? []) as any[]).map((w) => [w.title, w.vis_stage]), ...((blocks ?? []) as any[]).map((b) => [b.title || 'a page block', b.reveal_when])]) {
      const t = parseTrigger(r[1]);
      if (t?.kind === 'session') reveals.push({ title: String(r[0]), session: t.n });
    }
  }
  const custom = hasFeature(settings, 'timeline.custom');
  const columns = buildTimeline({ session, beats, dm, planned, reveals, quests, custom, showPlanned: hasFeature(settings, 'timeline.planned') });
  if (!columns.some((c) => c.events.length) && !dm) return null;   // nothing to show a player yet
  const canAdd = dm && custom && ctx.access.writable && !ctx.asPlayer && campaignCanMake(ctx.access, 'timeline') && (ctx.isOwner || ctx.perms.edit || ctx.perms.reveal);
  return <StripView slug={ctx.campaign.slug} campaignId={ctx.campaign.id} dm={dm} columns={columns} canAdd={canAdd} session={session} full={full} />;
}
