import { notFound } from 'next/navigation';
import { getCampaign } from '@/lib/campaign';
import { getEntries, type Entry } from '@/lib/entries';
import { toolProps } from '@/lib/tool-props';
import { hasFeature, hasPage } from '@/config/tools';
import { VisMode } from '@/features/hub/visibility/VisMode';
import { visDefaults } from '@/features/hub/settings/defaults';
import { revealFacts } from '@/features/hub/reveals/server';
import { readQuests } from './server';
import { QuestsPage } from './QuestsPage';
import '@/features/hub/ui/hidden.css';
import '@/features/hub/visibility/visibility.css';
import './quests.css';

// The Quest log (hub version 2, item 17). Everyone in the campaign gets it: a player gets the
// quests and objectives the database lets them read, and never the DM's notes or a reward held
// back (those are in entry_secrets, which only DMs can read). A DM gets everything, and edits it.
export async function Quests({ slug }: { slug: string }) {
  const ctx = await getCampaign(slug);
  const settings = ctx.campaign.settings;
  if (!hasPage(settings, 'quests')) notFound();
  const p = await toolProps(ctx, 'quests');
  const [q, beats, facts] = await Promise.all([
    readQuests(ctx),
    p.dm ? getEntries(ctx, ['beat']) : ([] as Entry[]),
    p.dm ? revealFacts(ctx.supabase, ctx.campaign, ctx.campaign.phase) : null,
  ]);
  const features = { hidden: hasFeature(settings, 'quests.hidden'), rewards: hasFeature(settings, 'quests.rewards'), track: hasFeature(settings, 'quests.track') };
  return (
    <div className="cs-guide">
      <VisMode on={p.dm} beats={beats.map((b) => ({ id: b.id, title: b.title }))} defaults={visDefaults(settings)} nextSession={facts?.nextSession}>
        <QuestsPage {...p} initial={[...q.quests, ...q.objectives]} hidden={q.hidden} tracked={q.tracked} npcs={q.npcs} places={q.places} features={features}
          canTrack={!ctx.asPlayer && !ctx.headView} />
      </VisMode>
    </div>
  );
}
