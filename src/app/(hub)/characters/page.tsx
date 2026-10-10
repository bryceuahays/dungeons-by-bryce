import Link from 'next/link';
import { requireViewer } from '@/lib/auth';
import { DeleteCharacterButton, MoveCharacterForm, NewCharacterForm } from '@/components/HubForms';
import { SYSTEMS, isSystem, systemName, systemOf } from '@/config/systems';

export const metadata = { title: 'My characters' };

// Every character you have made: its system, the campaign it is in (if any), a way to add it
// to a campaign or move it to another one that uses the same system, and a way to make a new
// one outside any campaign.
export default async function Characters({ searchParams }: { searchParams: Promise<{ system?: string }> }) {
  const { system: asked } = await searchParams;
  const { supabase, user } = await requireViewer();
  const [{ data: chars }, { data: campaigns }, { data: faces }] = await Promise.all([
    supabase.from('characters').select('id, campaign_id, system, data, updated_at').eq('owner', user.id).order('updated_at', { ascending: false }),
    supabase.from('campaigns').select('id, slug, title, settings, is_demo'),   // the campaigns you run or have joined
    supabase.from('campaign_faces').select('campaign_id, title').eq('phase', ''), // only for campaigns you run
  ]);
  const camp = new Map((campaigns ?? []).map((c) => [c.id, c]));
  const real = new Map((faces ?? []).map((f) => [f.campaign_id, f.title]));
  const titleOf = (c: { id: string; title: string }) => real.get(c.id) ?? c.title;
  // a character in a campaign has that campaign's system; outside one it keeps the system it was made for
  const all = (chars ?? []).map((ch) => {
    const c = ch.campaign_id ? camp.get(ch.campaign_id) : undefined;
    return { ...ch, camp: c, system: c ? systemOf(c.settings) : isSystem(ch.system) ? ch.system : '2014' };
  });
  const filter = isSystem(asked) ? asked : '';
  const shown = filter ? all.filter((ch) => ch.system === filter) : all;
  const present = SYSTEMS.filter((s) => all.some((ch) => ch.system === s.id));
  return (
    <>
      <h1>My characters</h1>
      {all.length ? (
        <>
          {present.length > 1 || filter ? (
            <p className="inline" aria-label="Filter by system">
              <Link className={'button' + (filter ? ' quiet' : '')} href="/characters" aria-current={filter ? undefined : 'true'}>All systems</Link>
              {present.map((s) => <Link key={s.id} className={'button' + (filter === s.id ? '' : ' quiet')} href={'/characters?system=' + s.id} aria-current={filter === s.id ? 'true' : undefined}>{s.name}</Link>)}
            </p>
          ) : null}
          <div className="panel">
            {shown.length ? (
              <ul className="list">
                {shown.map((ch) => {
                  const c = ch.camp;
                  const d = ch.data || {};
                  const line = ['Level ' + (d.level || 1), d.cls].filter(Boolean).join(' ');
                  // campaigns this character could go to: ones you are in or run, on the same system
                  const options = (campaigns ?? []).filter((x) => !x.is_demo && x.id !== ch.campaign_id && systemOf(x.settings) === ch.system).map((x) => ({ id: x.id, title: titleOf(x) }));
                  return (
                    <li key={ch.id}>
                      <span>
                        <b>{d.name || 'Unnamed character'}</b> <span className="dim">{line}</span><br />
                        <span className="dim">{systemName(ch.system)} · {c ? <><Link href={`/c/${c.slug}/sheet?c=${ch.id}`}>{titleOf(c)}</Link> · <Link href={`/c/${c.slug}/combat?c=${ch.id}`}>Combat</Link></> : ch.campaign_id ? 'Campaign no longer available' : <>Not in a campaign · <Link href={`/characters/${ch.id}`}>Sheet</Link> · <Link href={`/characters/${ch.id}/create`}>Creator</Link></>}</span>
                      </span>
                      <span className="dim rowend">
                        <MoveCharacterForm id={ch.id} inCampaign={!!ch.campaign_id} options={options} />
                        <DeleteCharacterButton id={ch.id} name={d.name || ''} />
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : <p className="dim">None of your characters use that system.</p>}
          </div>
        </>
      ) : (
        <div className="panel narrow"><p className="dim">You have not made a character yet. Create one below, or open one of <Link href="/campaigns">your campaigns</Link> and choose My character.</p></div>
      )}
      <h2>Create a character</h2>
      <NewCharacterForm />
    </>
  );
}
