/* eslint-disable @typescript-eslint/no-explicit-any */
import { notFound } from 'next/navigation';
import { getCampaign, getSheetEntities } from '@/lib/campaign';
import { getEntries } from '@/lib/entries';
import { toolProps } from '@/lib/tool-props';
import { hasFeature, hasPage } from '@/config/hub-features';
import { VisMode } from '@/features/hub/visibility/VisMode';
import { visDefaults } from '@/features/hub/settings/defaults';
import { revealFacts } from '@/features/hub/reveals/server';
import { NpcsPage } from './NpcsPage';
import '@/features/hub/ui/hidden.css';
import '@/features/hub/visibility/visibility.css';
import './npcs.css';

// The NPCs page (hub version 2, item 10). Everyone in the campaign gets it: a player gets the NPCs
// the database lets them read, and only the part of each that has been revealed to them. A DM gets
// all of them, with their notes, and chooses how much players see.
export async function Npcs({ slug }: { slug: string }) {
  const ctx = await getCampaign(slug);
  const settings = ctx.campaign.settings;
  if (!hasPage(settings, 'npcs')) notFound();
  const p = await toolProps(ctx, 'npcs');
  const dm = p.dm;
  const [rows, monsters, beats, facts] = await Promise.all([
    getEntries(ctx, ['npc'], { secrets: true }),
    dm ? getSheetEntities(ctx, ['monster']) : [],
    dm ? getEntries(ctx, ['beat']) : [],
    dm ? revealFacts(ctx.supabase, ctx.campaign, ctx.campaign.phase) : null,
  ]);
  const features = {
    portraits: hasFeature(settings, 'npcs.portraits'), attitude: hasFeature(settings, 'npcs.attitude'),
    partial: hasFeature(settings, 'npcs.partial'), filters: hasFeature(settings, 'npcs.filters'),
  };
  const beatList = beats.map((b) => ({ id: b.id, title: b.title }));
  return (
    <div className="cs-guide">
      <VisMode on={dm} beats={beatList} defaults={visDefaults(settings)} nextSession={facts?.nextSession}>
        <NpcsPage {...p} initial={rows} features={features}
          monsters={(monsters as any[]).map((m) => ({ id: m.id, name: m.name, source: m.source, data: m.data }))}
          chapters={ctx.campaign.phases.map((c) => ({ id: c.id, label: c.label }))} beats={beatList.map((b) => ({ id: b.id, label: b.title }))} />
      </VisMode>
    </div>
  );
}
