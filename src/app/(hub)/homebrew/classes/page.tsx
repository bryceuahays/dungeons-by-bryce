import Link from 'next/link';
import { requireViewer } from '@/lib/auth';
import { brewView } from '@/features/systems/brew';
import { BrewSystemNote } from '@/features/systems/BrewSystemNote';
import { CLASS_BLURBS } from '@/config/class-blurbs';

export const metadata = { title: 'Make a class' };

// The class picker: every SRD class (newest rules only) as a card. A card opens the
// editor already filled in with that class; nothing is saved until the editor's Save.
export default async function ClassPicker() {
  const { supabase, user } = await requireViewer();
  // the game system chosen on the Homebrew page: its official entries, and your entries for it
  const b = await brewView(supabase, user.id);
  const { data: classes } = await supabase.from('entities').select('id, name, data').eq('source', 'srd').eq('type', 'class').eq('srd_version', b.version).order('name');
  return (
    <>
      <h1>Make a {b.label('class').toLowerCase()}</h1>
      <BrewSystemNote name={b.sys.name} />
      <div className="panel">
        <p>Pick a class to start from. It opens with everything already filled in for that class, and you change what you like. Nothing is saved until you press Save.</p>
        <p className="inline"><Link className="button quiet" href="/homebrew/new?type=class">Start from a blank class</Link></p>
      </div>
      <div className="cards">
        {(classes ?? []).map((c) => (
          <Link key={c.id} className="ccard" href={'/homebrew/new?type=class&from=' + c.id}>
            <b>{c.name}</b>
            <span>{CLASS_BLURBS[c.name] ?? c.data?.desc ?? ''}</span>
            <i>d{c.data?.hd} hit die · {c.data?.primary}</i>
          </Link>
        ))}
      </div>
      {!(classes ?? []).length ? <p className="dim">The SRD classes are not loaded yet.</p> : null}
    </>
  );
}
