import Link from 'next/link';
import { requireHead } from '@/lib/auth';
import { emailIsOn } from '@/lib/mail';
import { AdminDeleteCampaign, CompButton, EmailWaitingButton, FeedbackRowActions, HeadRevealButton } from '@/components/HubForms';

export const metadata = { title: 'Head DM' };

type AdminCampaign = { id: string; owner_id: string | null; slug: string; title: string; owner_name: string; owner_email: string; members: number; characters: number; created_at: string; shown: boolean; playing: boolean };
type Note = { id: string; name: string; email: string; message: string; emailed: boolean; email_error: string; done: boolean; created_at: string };

// Only the Head DM reaches this page; the database functions behind it refuse anyone else.
export default async function Admin() {
  const { supabase, user } = await requireHead();
  const [{ data: campaigns }, { data: notes }, { count: accounts }, { data: people }, { data: subs }] = await Promise.all([
    supabase.rpc('admin_campaigns'),
    supabase.from('feedback').select('*').order('created_at', { ascending: false }).limit(200),
    supabase.from('profiles').select('id', { count: 'exact', head: true }),
    supabase.from('profiles').select('id, display_name, email, role, comp, created_at').order('created_at').limit(500),
    supabase.from('subscriptions').select('user_id, plan, status'),
  ]);
  const paid = new Map((subs ?? []).map((s) => [s.user_id, s]));
  const list = (campaigns ?? []) as AdminCampaign[];
  const inbox = (notes ?? []) as Note[];
  const emailOn = emailIsOn();
  const waiting = inbox.filter((n) => !n.emailed).length;
  const day = (s: string) => new Date(s).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  const mine = list.filter((c) => c.owner_id === user.id);
  const others = list.filter((c) => c.owner_id !== user.id);
  const counts = (c: AdminCampaign) => `${c.members} player${c.members === 1 ? '' : 's'} · ${c.characters} character${c.characters === 1 ? '' : 's'} · since ${day(c.created_at)}`;
  return (
    <>
      <h1>Head DM</h1>
      <div className="panel"><p className="dim">{accounts ?? 0} account{accounts === 1 ? '' : 's'} and {list.length} campaign{list.length === 1 ? '' : 's'} on the site.</p></div>

      <h2>Feedback</h2>
      <div className="panel">
        <p className="dim">{emailOn ? 'New notes are also emailed to you.' : 'Email is not switched on yet, so notes are collected here only.'}</p>
        {emailOn && waiting ? <EmailWaitingButton count={waiting} /> : null}
        {inbox.length ? (
          <ul className="list">
            {inbox.map((n) => (
              <li key={n.id} style={n.done ? { opacity: 0.55 } : undefined}>
                <span style={{ flex: '1 1 320px' }}>
                  <b>{n.name || 'Unnamed'}</b> <span className="dim">{n.email} · {day(n.created_at)}{n.emailed ? ' · emailed' : ' · not emailed'}{n.done ? ' · done' : ''}</span>
                  <span style={{ display: 'block', whiteSpace: 'pre-wrap', marginTop: 4 }}>{n.message}</span>
                  {!n.emailed && n.email_error ? <span className="bad" style={{ display: 'block', marginTop: 4 }}>Email problem: {n.email_error}</span> : null}
                </span>
                <FeedbackRowActions id={n.id} done={n.done} />
              </li>
            ))}
          </ul>
        ) : <p className="dim">No notes yet.</p>}
      </div>

      <h2>Accounts</h2>
      <div className="panel">
        <p className="dim">Players are always free. &quot;Full access&quot; gives an account everything in Pro without paying, for friends and for anyone you want to look after.</p>
        <ul className="list">
          {(people ?? []).map((p) => {
            const s = paid.get(p.id);
            return (
              <li key={p.id}>
                <span><b>{p.display_name || 'Unnamed'}</b> <span className="dim">{p.email} · since {day(p.created_at)} · {p.role === 'head' ? 'Head DM' : p.comp ? 'full access' : s ? `${s.plan === 'founder' ? 'founder' : 'Pro'} (${s.status})` : 'free'}</span></span>
                {p.role === 'head' ? null : <span className="rowend"><CompButton id={p.id} on={p.comp} /></span>}
              </li>
            );
          })}
        </ul>
      </div>

      <h2>Your campaigns</h2>
      <div className="panel">
        {mine.length ? (
          <ul className="list">
            {mine.map((c) => (
              <li key={c.id}>
                <span><b>{c.title}</b> <span className="dim">{counts(c)}</span></span>
                <span className="rowend">
                  <Link href={'/c/' + c.slug}>Open</Link>
                  <AdminDeleteCampaign id={c.id} title={c.title} />
                </span>
              </li>
            ))}
          </ul>
        ) : <p className="dim">You are not running any campaigns.</p>}
      </div>

      <h2>Other people&apos;s campaigns</h2>
      <div className="panel">
        <p className="dim">These stay hidden from you until you choose Unhide: you see who runs each one and how many people are in it, and nothing else. Unhiding a campaign lets you open it and read everything its DM can, secrets included. You still cannot change it. Hide it again whenever you like.</p>
        {others.length ? (
          <ul className="list">
            {others.map((c) => {
              const who = `${c.owner_name || 'nobody'}${c.owner_email ? ` (${c.owner_email})` : ''}`;
              return (
                <li key={c.id}>
                  <span>
                    <b>{c.shown ? c.title : 'Hidden campaign'}</b> <span className="dim">run by {who} · {counts(c)}{c.playing ? ' · you play in this one' : ''}</span>
                  </span>
                  <span className="rowend">
                    {c.shown ? <Link href={'/c/' + c.slug}>Open</Link> : null}
                    <HeadRevealButton id={c.id} shown={c.shown} playing={c.playing} />
                    <AdminDeleteCampaign id={c.id} title={c.shown ? c.title : `the campaign run by ${c.owner_name || 'nobody'}`} />
                  </span>
                </li>
              );
            })}
          </ul>
        ) : <p className="dim">Nobody else has made a campaign yet.</p>}
      </div>
    </>
  );
}
