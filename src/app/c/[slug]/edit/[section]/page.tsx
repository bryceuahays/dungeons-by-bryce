import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getCampaign } from '@/lib/campaign';
import { ContentEditor } from '@/components/Editor';
import { AddBlockForm } from '@/components/DmForms';
import type { ContentRow } from '@/lib/types';
import { getEntries, getMembers } from '@/lib/entries';
import { campaignCanMake } from '@/lib/entitlements';
import { flag } from '@/lib/flags';
import { revealFacts } from '@/features/hub/reveals/server';
import { visDefaults } from '@/features/hub/settings/defaults';

export const metadata = { title: 'Edit page' };

// The content editor: every row on one tab, including hidden rows and both wordings.
export default async function EditSection({ params }: { params: Promise<{ slug: string; section: string }> }) {
  const { slug, section } = await params;
  const ctx = await getCampaign(slug);
  if (!ctx.realDm || !ctx.perms.edit) redirect('/c/' + slug);   // "Edit pages and content"
  const { data: sec } = await ctx.supabase.from('sections').select('slug, title, kind').eq('campaign_id', ctx.campaign.id).eq('slug', section).maybeSingle();
  if (!sec) notFound();
  const { data } = await ctx.supabase.from('content').select('*').eq('campaign_id', ctx.campaign.id).eq('section', section).order('sort').order('visibility', { ascending: false });
  const rows = (data ?? []) as ContentRow[];
  const members = await getMembers(ctx);
  // hub version 2 reveals (issue 117): a switch on each block, and "reveal it automatically"
  const reveal = (await flag('hub_v2_visibility')) ? await (async () => {
    const [facts, beats] = await Promise.all([revealFacts(ctx.supabase, ctx.campaign, ctx.campaign.phase), getEntries(ctx, ['beat'])]);
    return { met: [...facts.met], stage: ctx.campaign.phase, nextSession: facts.nextSession, beats: beats.map((b) => ({ id: b.id, title: b.title })),
      people: members, named: visDefaults(ctx.campaign.settings).named, canName: campaignCanMake(ctx.access, 'player_secrets') };
  })() : undefined;
  return (
    <div className="cs-guide">
      <div className="wrap">
        <h2>Edit: {sec.title}</h2>
        <p className="lede">Open a block to change it. Blocks with an ember edge are DM only.{reveal ? ' Each block has a switch for whether players can see it, and can reveal itself when a session starts or is played, when a story beat happens, or when a chapter starts.' : ''}</p>
        <p className="row">
          <Link className="act" href={`/c/${slug}/${section}`}>Done editing</Link>
          <span className="muted">Changes are live for players as soon as you save.</span>
        </p>
        <ContentEditor slug={slug} rows={rows} phases={ctx.campaign.phases} members={members} canName={campaignCanMake(ctx.access, 'player_secrets')} reveal={reveal} />
        <h2>Add a block</h2>
        <div className="plate"><AddBlockForm slug={slug} section={section} /></div>
      </div>
    </div>
  );
}
