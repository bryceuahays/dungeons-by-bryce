import Link from 'next/link';
import { requireHead } from '@/lib/auth';
import { flagSwitches } from '@/lib/flags';
import { FlagSwitch } from '@/features/flags/FlagSwitch';

export const metadata = { title: 'Feature flags' };

const ISSUES = 'https://github.com/bryceuahays/dungeons-by-bryce/issues/';

// Only the Head DM reaches this page; the database refuses anyone else's read of a switch
// that is off, and anyone else's change.
export default async function Flags() {
  await requireHead();
  const { ready, rows } = await flagSwitches();
  const day = (s: string) => new Date(s).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  const live = rows.filter((r) => r.on).length;
  return (
    <>
      <p><Link href="/admin">Back to Head DM</Link></p>
      <h1>Feature flags</h1>
      <div className="panel">
        <p>Each new piece of the hub is built behind a switch. While its switch is off, the piece is hidden from everyone except you, so you can try it on the live site before your players see it.</p>
        <p className="dim">Turning a switch on shows that piece to everyone straight away. Hiding it again takes it away from everyone but you, and keeps anything people made with it. A switch has nothing to show until its piece has been built and put live; its issue says where that stands.</p>
        <p className="dim">{live} of {rows.length} switched on for everyone.</p>
      </div>

      {ready ? null : <div className="panel"><p className="bad" role="alert">These switches cannot be saved yet. The database change that stores them has not been applied.</p></div>}

      <div className="panel">
        <ul className="list">
          {rows.map((r) => (
            <li key={r.name}>
              <span style={{ flex: '1 1 260px' }}>
                <b>{r.what}</b> <span className="dim"><a href={ISSUES + r.issue} target="_blank" rel="noreferrer">Issue {r.issue}</a></span>
                <span style={{ display: 'block', marginTop: 4 }} className={r.on ? 'good' : 'dim'}>
                  {r.fixed ? 'On for everyone. Fixed on in the code, so there is no switch.' : r.on ? `On for everyone${r.changed ? ' since ' + day(r.changed) : ''}.` : `Hidden. Only you can see it${r.changed ? ' (hidden again ' + day(r.changed) + ')' : ''}.`}
                </span>
              </span>
              {r.fixed || !ready ? null : <FlagSwitch name={r.name} on={r.on} />}
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
