import { notFound } from 'next/navigation';
import { getCampaign } from '@/lib/campaign';
import { getEntries } from '@/lib/entries';
import { toolProps } from '@/lib/tool-props';
import { hasFeature, hasPage, hasTool } from '@/config/tools';
import { loreSettingsOf } from '@/config/lore-categories';
import { VisMode } from '@/features/hub/visibility/VisMode';
import { visDefaults } from '@/features/hub/settings/defaults';
import { revealFacts } from '@/features/hub/reveals/server';
import { LorePage } from './LorePage';
import '@/features/hub/ui/hidden.css';
import '@/features/hub/visibility/visibility.css';
import './lore.css';

// The Lore page (hub version 2, item 11). Everyone in the campaign gets it: a player gets the lore
// entries the database lets them read, and never the DM's notes or unlearned facts (those are in
// entry_secrets, which only DMs can read). A DM gets everything, and edits it.
export async function Lore({ slug }: { slug: string }) {
  const ctx = await getCampaign(slug);
  const settings = ctx.campaign.settings;
  if (!hasPage(settings, 'lore')) notFound();
  const p = await toolProps(ctx, 'lore');
  const dm = p.dm;
  const [rows, npcs, beats, facts] = await Promise.all([
    getEntries(ctx, ['lore'], { secrets: true }),
    getEntries(ctx, ['npc']),
    dm ? getEntries(ctx, ['beat']) : [],
    dm ? revealFacts(ctx.supabase, ctx.campaign, ctx.campaign.phase) : null,
  ]);
  const maps = hasTool(settings, 'maps') ? `/c/${ctx.campaign.slug}/tools/maps` : null;
  return (
    <div className="cs-guide">
      <VisMode on={dm} beats={beats.map((b) => ({ id: b.id, title: b.title }))} defaults={visDefaults(settings)} nextSession={facts?.nextSession}>
        <LorePage {...p} initial={rows} npcs={npcs.map((n) => ({ id: n.id, title: n.title }))} lore={loreSettingsOf(settings)} mapsHref={maps}
          features={{ templates: hasFeature(settings, 'lore.templates'), bestiary: hasFeature(settings, 'lore.bestiary'), history: hasFeature(settings, 'lore.history') }} />
      </VisMode>
    </div>
  );
}
