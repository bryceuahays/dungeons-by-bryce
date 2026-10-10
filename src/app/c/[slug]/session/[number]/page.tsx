import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getCampaign } from '@/lib/campaign';
import { SessionEditForm } from '@/components/DmForms';
import { SessionNotes } from '@/components/Editor';
import type { SessionRow } from '@/lib/types';

// One session: its details and the DM's planning notes. DM only: the sessions table has
// no policy for players at all.
export default async function SessionPage({ params }: { params: Promise<{ slug: string; number: string }> }) {
  const { slug, number } = await params;
  const ctx = await getCampaign(slug);
  if (!ctx.isDm) notFound();
  const { data } = await ctx.supabase.from('sessions').select('*').eq('campaign_id', ctx.campaign.id).eq('number', Number(number)).maybeSingle();
  const s = data as SessionRow | null;
  if (!s) notFound();
  const notes = s.content?.notes ?? '';
  return (
    <div className="cs-guide">
      <div className="wrap">
        <h2>{s.title}</h2>
        <p className="lede">{s.meta}</p>
        <p>{s.summary}</p>
        <h2>Notes</h2>
        {ctx.realDm ? <SessionNotes slug={slug} sessionId={s.id} notes={notes} /> : <p style={{ whiteSpace: 'pre-wrap' }}>{notes || 'No notes.'}</p>}
        {ctx.realDm ? <><h2>Details</h2><div className="plate"><SessionEditForm slug={slug} session={s} /></div></> : null}
        <p style={{ marginTop: 20 }}><Link href={`/c/${slug}/sessions`}>Back to sessions</Link></p>
      </div>
    </div>
  );
}
