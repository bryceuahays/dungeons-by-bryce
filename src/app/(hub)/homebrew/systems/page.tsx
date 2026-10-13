import Link from 'next/link';
import { requireViewer } from '@/lib/auth';
import { mySystems } from '@/features/systems/data';
import { DeleteSystemButton } from '@/features/systems/DeleteSystemButton';

export const metadata = { title: 'Game systems' };

// The ready-made systems and the DM's own. Customizing a ready-made one opens the editor; saving
// makes it your own system, which your campaigns can then play.
export default async function Systems() {
  const { supabase, user } = await requireViewer();
  const [mine, { data: camps }] = await Promise.all([
    mySystems(supabase, user.id),
    supabase.from('campaigns').select('title, settings').eq('owner_id', user.id),
  ]);
  const usedBy = (id: string) => (camps ?? []).filter((c) => c.settings?.system === id).map((c) => c.title as string);
  return (
    <>
      <p><Link href="/homebrew">← Homebrew</Link></p>
      <h1>Game systems</h1>
      <div className="panel">
        <p>A game system is the rules a campaign plays by: its abilities, skills, how characters grow, health, magic, money and more. Start from a ready-made one and change what you like; whatever you leave alone stays as published, homebrew included.</p>
      </div>
      <h2>Ready-made</h2>
      <div className="cards">
        {[['2024', 'Fifth Edition (2024)', 'The revised rules (SRD 5.2).'], ['2014', 'Fifth Edition (2014)', 'The original rules (SRD 5.1).']].map(([base, name, what]) => (
          <Link key={base} className="ccard" href={'/homebrew/systems/new?from=' + base}><b>{name}</b><span>{what}</span><i>Customize</i></Link>
        ))}
      </div>
      <h2>Your systems</h2>
      <div className="panel">
        {mine.length ? (
          <ul className="list">
            {mine.map((s) => {
              const used = usedBy(s.id);
              return (
                <li key={s.id}>
                  <span><Link href={'/homebrew/systems/' + s.id}><b>{s.name}</b></Link> <span className="dim">Built on Fifth Edition ({s.base}){used.length ? ` · used by ${used.join(', ')}` : ''}</span></span>
                  <span className="inline"><Link href={'/homebrew/systems/' + s.id}>Edit</Link><DeleteSystemButton id={s.id} name={s.name} used={used.length} /></span>
                </li>
              );
            })}
          </ul>
        ) : <p className="dim">None yet. Customize a ready-made system above and save it.</p>}
      </div>
    </>
  );
}
