import Link from 'next/link';
import { requireViewer } from '@/lib/auth';

export const metadata = { title: 'My characters' };

export default async function Characters() {
  const { supabase, user } = await requireViewer();
  const [{ data: chars }, { data: campaigns }, { data: faces }] = await Promise.all([
    supabase.from('characters').select('id, campaign_id, data, updated_at').eq('owner', user.id).order('updated_at', { ascending: false }),
    supabase.from('campaigns').select('id, slug, title'),
    supabase.from('campaign_faces').select('campaign_id, title').eq('phase', ''), // empty for players
  ]);
  const real = new Map((faces ?? []).map((f) => [f.campaign_id, f.title]));
  const camp = new Map((campaigns ?? []).map((c) => [c.id, c]));
  return (
    <>
      <h1>My characters</h1>
      {chars?.length ? (
        <div className="panel">
          <ul className="list">
            {chars.map((ch) => {
              const c = camp.get(ch.campaign_id);
              const d = ch.data || {};
              const line = ['Level ' + (d.level || 1), d.cls].filter(Boolean).join(' ');
              return (
                <li key={ch.id}>
                  <span>
                    <b>{d.name || 'Unnamed character'}</b> <span className="dim">{line}</span>
                  </span>
                  <span className="dim">
                    {c ? <><Link href={`/c/${c.slug}/sheet?c=${ch.id}`}>{real.get(c.id) ?? c.title}</Link> · <Link href={`/c/${c.slug}/combat?c=${ch.id}`}>Combat</Link></> : 'Campaign no longer available'}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <div className="panel narrow"><p className="dim">You have not made a character yet. Open one of <Link href="/campaigns">your campaigns</Link> and choose My character.</p></div>
      )}
    </>
  );
}
