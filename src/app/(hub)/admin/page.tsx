import Link from 'next/link';
import { requireHead } from '@/lib/auth';
import { AdminDeleteCampaign, FeedbackRowActions } from '@/components/HubForms';

export const metadata = { title: 'Head DM' };

type AdminCampaign = { id: string; owner_id: string | null; slug: string; title: string; owner_name: string; owner_email: string; members: number; characters: number; created_at: string };
type Note = { id: string; name: string; email: string; message: string; emailed: boolean; done: boolean; created_at: string };

// Only the Head DM reaches this page; the database functions behind it refuse anyone else.
export default async function Admin() {
  const { supabase, user } = await requireHead();
  const [{ data: campaigns }, { data: notes }, { count: accounts }] = await Promise.all([
    supabase.rpc('admin_campaigns'),
    supabase.from('feedback').select('*').order('created_at', { ascending: false }).limit(200),
    supabase.from('profiles').select('id', { count: 'exact', head: true }),
  ]);
  const list = (campaigns ?? []) as AdminCampaign[];
  const inbox = (notes ?? []) as Note[];
  const emailOn = !!process.env.RESEND_API_KEY;
  const day = (s: string) => new Date(s).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  return (
    <>
      <h1>Head DM</h1>
      <div className="panel"><p className="dim">{accounts ?? 0} account{accounts === 1 ? '' : 's'} and {list.length} campaign{list.length === 1 ? '' : 's'} on the site. You can see that a campaign exists and delete it, but you cannot read another DM&apos;s pages or secrets unless you join it as a player.</p></div>

      <h2>Feedback</h2>
      <div className="panel">
        <p className="dim">{emailOn ? 'New notes are also emailed to you.' : 'Email is not switched on yet, so notes are collected here only.'}</p>
        {inbox.length ? (
          <ul className="list">
            {inbox.map((n) => (
              <li key={n.id} style={n.done ? { opacity: 0.55 } : undefined}>
                <span style={{ flex: '1 1 320px' }}>
                  <b>{n.name || 'Unnamed'}</b> <span className="dim">{n.email} · {day(n.created_at)}{n.emailed ? ' · emailed' : ''}{n.done ? ' · done' : ''}</span>
                  <span style={{ display: 'block', whiteSpace: 'pre-wrap', marginTop: 4 }}>{n.message}</span>
                </span>
                <FeedbackRowActions id={n.id} done={n.done} />
              </li>
            ))}
          </ul>
        ) : <p className="dim">No notes yet.</p>}
      </div>

      <h2>All campaigns</h2>
      <div className="panel">
        <ul className="list">
          {list.map((c) => (
            <li key={c.id}>
              <span>
                <b>{c.title}</b> <span className="dim">run by {c.owner_id === user.id ? 'you' : `${c.owner_name || 'nobody'}${c.owner_email ? ` (${c.owner_email})` : ''}`} · {c.members} player{c.members === 1 ? '' : 's'} · {c.characters} character{c.characters === 1 ? '' : 's'} · since {day(c.created_at)}</span>
              </span>
              <span className="rowend">
                {c.owner_id === user.id ? <Link href={'/c/' + c.slug}>Open</Link> : null}
                <AdminDeleteCampaign id={c.id} title={c.title} />
              </span>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
