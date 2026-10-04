/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getCampaign, getSheetEntities, usesLegacySheet, type CampaignCtx } from '@/lib/campaign';
import { campaignCan } from '@/lib/entitlements';
import { getEntries, getMembers } from '@/lib/entries';
import { FEATURES, type Feature } from '@/config/plans';
import { TOOLS } from '@/config/tools';
import type { ToolProps } from '@/lib/entry-types';
import { UpgradeHint } from '@/components/UpgradeHint';
import { EntityCard } from '@/components/EntityCard';
import { NpcTool } from '@/components/tools/Npcs';
import { InitiativeTool } from '@/components/tools/Initiative';
import { TimelineTool } from '@/components/tools/Timeline';
import { MapsTool } from '@/components/tools/Maps';
import { LogTool, NotesTool, WorldTool, ZeroTool } from '@/components/tools/Simple';

export async function generateMetadata({ params }: { params: Promise<{ tool: string }> }) {
  const { tool } = await params;
  return { title: TOOLS.find((t) => t.id === tool)?.name ?? 'Table tools' };
}

// What every tool is told about the viewer. A DM previewing as a player is treated as
// that player and cannot change anything; the Head DM looking in reads but cannot write.
async function toolProps(ctx: CampaignCtx): Promise<ToolProps> {
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
    dm: ctx.isDm, canWrite: ctx.access.writable && !ctx.asPlayer && !ctx.headView,
    stages: ctx.campaign.phases, members,
    can: Object.fromEntries((Object.keys(FEATURES) as Feature[]).map((f) => [f, campaignCan(ctx.access, f)])),
    session: Number(ctx.campaign.settings?.session) || 0,
  };
}

export default async function ToolPage({ params }: { params: Promise<{ slug: string; tool: string }> }) {
  const { slug, tool } = await params;
  const def = TOOLS.find((t) => t.id === tool);
  if (!def) notFound();
  const ctx = await getCampaign(slug);
  const back = <p className="row" style={{ marginTop: 16 }}><Link className="act sm" href={`/c/${ctx.campaign.slug}/tools`}>All table tools</Link></p>;
  if (def.feature && !campaignCan(ctx.access, def.feature)) {
    return <div className="cs-guide"><div className="wrap"><h2>{def.name}</h2><p className="lede">{def.what}</p><UpgradeHint feature={def.feature} dm={ctx.realDm} />{back}</div></div>;
  }
  const p = await toolProps(ctx);
  const dm = ctx.isDm;
  let body: React.ReactNode = null;

  if (tool === 'npcs') {
    const [rows, monsters, cons] = await Promise.all([getEntries(ctx, ['npc'], { secrets: true }), dm ? getSheetEntities(ctx, ['monster']) : [], campaignCan(ctx.access, 'world') ? getEntries(ctx, ['consequence']) : []]);
    body = <NpcTool {...p} initial={rows} monsters={(monsters as any[]).map((m) => ({ id: m.id, name: m.name, source: m.source, data: m.data }))} consequences={cons} />;
  } else if (tool === 'initiative') {
    const [rows, chars, monsters, entities] = await Promise.all([
      getEntries(ctx, ['encounter'], { secrets: true }),
      dm ? ctx.supabase.from('characters').select('id, owner, data').eq('campaign_id', ctx.campaign.id) : { data: [] },
      dm ? getSheetEntities(ctx, ['monster']) : [],
      dm && !(await usesLegacySheet(ctx.campaign.id)) ? getSheetEntities(ctx) : [],
    ]);
    const names = Object.fromEntries(p.members.map((m) => [m.user_id, m.display_name]));
    body = <InitiativeTool {...p} initial={rows[0] ?? null} characters={(chars.data ?? []) as any[]} monsters={monsters as any[]} entities={entities as any[]} names={names} />;
  } else if (tool === 'timeline') {
    const [rows, npcs] = await Promise.all([getEntries(ctx, ['beat', 'note']), dm ? getEntries(ctx, ['npc']) : []]);
    body = <TimelineTool {...p} initial={rows} npcs={npcs.map((n) => ({ id: n.id, title: n.title }))} />;
  } else if (tool === 'maps') {
    const [rows, beats] = await Promise.all([getEntries(ctx, ['map', 'region', 'pin']), campaignCan(ctx.access, 'timeline') ? getEntries(ctx, ['beat']) : []]);
    // hidden regions are never part of what a player's page is given
    body = <MapsTool {...p} initial={dm ? rows : rows.filter((r) => r.kind !== 'region')} beats={beats.map((b) => ({ id: b.id, title: b.title, status: b.status }))} />;
  } else if (tool === 'world') {
    const [rows, npcs] = await Promise.all([getEntries(ctx, dm ? ['consequence', 'secret', 'clue', 'clock'] : ['consequence', 'clock'], { secrets: true }), dm ? getEntries(ctx, ['npc']) : []]);
    body = <WorldTool {...p} initial={rows} npcs={npcs.map((n) => ({ id: n.id, title: n.title }))} />;
  } else if (tool === 'zero') {
    const [rows, inputs] = await Promise.all([getEntries(ctx, ['zero']), dm ? ctx.supabase.from('safety_inputs').select('id, kind, body').eq('campaign_id', ctx.campaign.id) : { data: [] }]);
    body = <ZeroTool {...p} initial={rows[0] ?? null} inputs={(inputs.data ?? []) as any[]} />;
  } else if (tool === 'secrets') {
    const { data } = await ctx.supabase.from('player_notes').select('id, user_id, kind, title, body, updated_at').eq('campaign_id', ctx.campaign.id).order('updated_at', { ascending: false });
    // a DM previewing as a player sees that player's secrets (a player's own notes are never readable by the DM)
    const rows = ((data ?? []) as any[]).filter((n) => (ctx.asPlayer ? n.kind === 'secret' && n.user_id === ctx.viewAs.player : true));
    body = <NotesTool {...p} initial={rows} />;
  } else if (tool === 'log') {
    const rows = await getEntries(ctx, ['log'], { secrets: true });
    body = <LogTool {...p} initial={dm ? rows : rows.filter((r) => r.live)} feed={!!ctx.campaign.settings?.feed} />;
  } else if (tool === 'compendium') {
    const all = await getSheetEntities(ctx, ['race', 'class', 'subclass', 'background', 'feat', 'spell', 'item', 'monster', 'resource']);
    const brew = (all as any[]).filter((e) => e.source !== 'srd' && (dm || e.type !== 'monster'));
    body = (
      <div className="wrap">
        <h2>Compendium</h2>
        <p className="lede">The homebrew this campaign uses. The standard fifth edition rules are in <Link href="/homebrew/srd">the SRD</Link>.</p>
        {brew.length ? <div className="grid g2">{brew.map((e) => <div key={e.id} className="plate"><EntityCard type={e.type} name={e.name} source={e.source} status={e.status} data={e.data} /></div>)}</div>
          : <p className="who">{dm ? 'No homebrew is attached to this campaign yet. Open an entry under Homebrew in the hub and tick this campaign.' : 'This campaign uses the standard rules only.'}</p>}
      </div>
    );
  }
  return <div className="cs-guide">{body}<div className="wrap">{back}</div></div>;
}
