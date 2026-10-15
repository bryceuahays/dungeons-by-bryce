import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getCampaign } from '@/lib/campaign';
import { SessionEditForm } from '@/components/DmForms';
import { SessionNotes } from '@/components/Editor';
import type { SessionRow } from '@/lib/types';
import { flag } from '@/lib/flags';
import { SessionStep } from '@/features/hub/reveals/SessionStep';
import { sessionWaiting } from '@/features/hub/reveals/server';

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
  // hub version 2 reveals (issue 117): start the session or mark it played in one step
  const steps = ctx.realDm && (await flag('hub_v2_visibility'));
  const waiting = steps ? (await sessionWaiting(ctx.supabase, ctx.campaign.id, [s.number])).get(s.number)! : null;
  return (
    <div className="cs-guide">
      <div className="wrap">
        <h2>{s.title}</h2>
        <p className="lede">{s.meta}</p>
        <p>{s.summary}</p>
        {waiting ? <SessionStep slug={slug} id={s.id} number={s.number} status={s.status} waiting={waiting} /> : null}
        <h2>Notes</h2>
        {ctx.realDm ? <SessionNotes slug={slug} sessionId={s.id} notes={notes} /> : <p style={{ whiteSpace: 'pre-wrap' }}>{notes || 'No notes.'}</p>}
        {ctx.realDm ? <><h2>Details</h2><div className="plate"><SessionEditForm slug={slug} session={s} running={!!steps} /></div></> : null}
        <p style={{ marginTop: 20 }}><Link href={`/c/${slug}/sessions`}>Back to sessions</Link></p>
      </div>
    </div>
  );
}
