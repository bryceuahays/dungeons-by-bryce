import Link from 'next/link';
import { requireViewer } from '@/lib/auth';
import { brewView } from '@/features/systems/brew';
import { BrewSystemNote } from '@/features/systems/BrewSystemNote';
import { ABILITIES } from '@/lib/rules/engine';

export const metadata = { title: 'Make a background' };

const AB = Object.fromEntries(ABILITIES) as Record<string, string>;

// The background picker, like the class and race pickers: every SRD background (newest rules only)
// as a card. A card opens the editor filled in with it; nothing is saved until the editor's Create.
export default async function BackgroundPicker() {
  const { supabase, user } = await requireViewer();
  // the game system chosen on the Homebrew page: its official entries, and your entries for it
  const b = await brewView(supabase, user.id);
  const { data: list } = await supabase.from('entities').select('id, name, data').eq('source', 'srd').eq('type', 'background').eq('srd_version', b.version).order('name');
  return (
    <>
      <h1>Make a {b.label('background').toLowerCase()}</h1>
      <BrewSystemNote name={b.sys.name} />
      <div className="panel">
        <p>Pick a background to start from. It opens with everything filled in, and you change what you like. Nothing is saved until you press Create.</p>
        <p className="inline"><Link className="button quiet" href="/homebrew/new?type=background">Start from a blank background</Link></p>
      </div>
      <div className="cards">
        {(list ?? []).map((b) => (
          <Link key={b.id} className="ccard" href={'/homebrew/new?type=background&from=' + b.id}>
            <b>{b.name}</b>
            <span>{[b.data?.feat?.name ? 'Feat: ' + b.data.feat.name + (b.data.feat.note ? ` (${b.data.feat.note})` : '') : '', (b.data?.skills ?? []).length ? 'Skills: ' + b.data.skills.join(', ') : ''].filter(Boolean).join('. ')}</span>
            <i>{(b.data?.abilities ?? []).map((a: string) => AB[a] ?? a).join(' · ')}</i>
          </Link>
        ))}
      </div>
      {!(list ?? []).length ? <p className="dim">The SRD backgrounds are not loaded yet.</p> : null}
    </>
  );
}
