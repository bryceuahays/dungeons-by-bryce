import { notFound } from 'next/navigation';
import { getDemo, DEMO_TOOLS } from '@/lib/demo';
import { getEntries } from '@/lib/entries';
import { FEATURES, type Feature } from '@/config/plans';
import type { ToolProps } from '@/lib/entry-types';
import { NpcTool } from '@/components/tools/Npcs';
import { TimelineTool } from '@/components/tools/Timeline';
import { MapsTool } from '@/components/tools/Maps';
import { WorldTool, ZeroTool } from '@/components/tools/Simple';

export const revalidate = 120;

// The demo's table tools, read-only, as a player sees them.
export default async function DemoTool({ params }: { params: Promise<{ tool: string }> }) {
  const { tool } = await params;
  const ctx = await getDemo();
  if (!ctx || !DEMO_TOOLS.some(([id]) => id === tool)) notFound();
  const p: ToolProps = {
    campaignId: ctx.campaign.id, slug: ctx.campaign.slug, base: '/demo', userId: ctx.user.id, dm: false, canWrite: false,
    stages: ctx.campaign.phases, members: [], can: Object.fromEntries((Object.keys(FEATURES) as Feature[]).map((f) => [f, false])), session: Number(ctx.campaign.settings?.session) || 0,
  };
  if (tool === 'npcs') return <div className="cs-guide"><NpcTool {...p} initial={await getEntries(ctx, ['npc'])} monsters={[]} consequences={await getEntries(ctx, ['consequence'])} /></div>;
  if (tool === 'timeline') return <div className="cs-guide"><TimelineTool {...p} initial={await getEntries(ctx, ['beat', 'note'])} npcs={[]} /></div>;
  if (tool === 'world') return <div className="cs-guide"><WorldTool {...p} initial={await getEntries(ctx, ['consequence', 'clock'])} npcs={[]} /></div>;
  if (tool === 'zero') return <div className="cs-guide"><ZeroTool {...p} initial={(await getEntries(ctx, ['zero']))[0] ?? null} inputs={[]} /></div>;
  const [rows, beats] = await Promise.all([getEntries(ctx, ['map', 'pin']), getEntries(ctx, ['beat'])]);
  return <div className="cs-guide"><MapsTool {...p} initial={rows} beats={beats.map((b) => ({ id: b.id, title: b.title, status: b.status }))} /></div>;
}
