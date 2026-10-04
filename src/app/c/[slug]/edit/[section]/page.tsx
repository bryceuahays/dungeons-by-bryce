import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getCampaign } from '@/lib/campaign';
import { ContentEditor } from '@/components/Editor';
import { AddBlockForm } from '@/components/DmForms';
import type { ContentRow } from '@/lib/types';
import { getMembers } from '@/lib/entries';
import { campaignCan } from '@/lib/entitlements';

export const metadata = { title: 'Edit page' };

// The content editor: every row on one tab, including hidden rows and both wordings.
export default async function EditSection({ params }: { params: Promise<{ slug: string; section: string }> }) {
  const { slug, section } = await params;
  const ctx = await getCampaign(slug);
  if (!ctx.realDm) redirect('/c/' + slug);
  const { data: sec } = await ctx.supabase.from('sections').select('slug, title, kind').eq('campaign_id', ctx.campaign.id).eq('slug', section).maybeSingle();
  if (!sec) notFound();
  const { data } = await ctx.supabase.from('content').select('*').eq('campaign_id', ctx.campaign.id).eq('section', section).order('sort').order('visibility', { ascending: false });
  const rows = (data ?? []) as ContentRow[];
  const members = await getMembers(ctx);
  return (
    <div className="cs-guide">
      <div className="wrap">
        <h2>Edit: {sec.title}</h2>
        <p className="lede">Open a block to change it. Blocks with an ember edge are DM only.</p>
        <p className="row">
          <Link className="act" href={`/c/${slug}/${section}`}>Done editing</Link>
          <span className="muted">Changes are live for players as soon as you save.</span>
        </p>
        <ContentEditor slug={slug} rows={rows} phases={ctx.campaign.phases} members={members} canName={campaignCan(ctx.access, 'player_secrets')} />
        <h2>Add a block</h2>
        <div className="plate"><AddBlockForm slug={slug} section={section} /></div>
      </div>
    </div>
  );
}
