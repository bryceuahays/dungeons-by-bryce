import Link from 'next/link';
import { requireViewer } from '@/lib/auth';
import { CLASS_BLURBS } from '@/config/class-blurbs';

export const metadata = { title: 'Make a class' };

// The class picker: every SRD class (newest rules only) as a card. A card opens the
// editor already filled in with that class; nothing is saved until the editor's Save.
export default async function ClassPicker() {
  const { supabase } = await requireViewer();
  const { data: classes } = await supabase.from('entities').select('id, name, data').eq('source', 'srd').eq('type', 'class').eq('srd_version', '5.2').order('name');
  return (
    <>
      <h1>Make a class</h1>
      <div className="panel">
        <p>Pick a class to start from. It opens with everything already filled in for that class, and you change what you like. Nothing is saved until you press Save.</p>
        <p className="inline"><Link className="button" href="/homebrew/classes/import">Import class</Link><Link className="button quiet" href="/homebrew/new?type=class">Start from a blank class</Link></p>
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
