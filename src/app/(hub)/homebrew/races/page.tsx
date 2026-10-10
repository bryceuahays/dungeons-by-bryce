import Link from 'next/link';
import { requireViewer } from '@/lib/auth';

export const metadata = { title: 'Make a race' };

// The race picker, like the class picker: every SRD species (newest rules only) as a card. A card
// opens the editor already filled in with that species; nothing is saved until the editor's Create.
export default async function RacePicker() {
  const { supabase } = await requireViewer();
  const { data: races } = await supabase.from('entities').select('id, name, data').eq('source', 'srd').eq('type', 'race').eq('srd_version', '5.2').order('name');
  return (
    <>
      <h1>Make a race or species</h1>
      <div className="panel">
        <p>Pick a species to start from. It opens with its traits already filled in, and you change what you like. Nothing is saved until you press Create.</p>
        <p className="inline"><Link className="button quiet" href="/homebrew/new?type=race">Start from a blank race</Link></p>
      </div>
      <div className="cards">
        {(races ?? []).map((r) => (
          <Link key={r.id} className="ccard" href={'/homebrew/new?type=race&from=' + r.id}>
            <b>{r.name}</b>
            <span>{(r.data?.features ?? []).map((t: { name: string }) => t.name).join(', ')}</span>
            <i>{[r.data?.type, r.data?.size, r.data?.speed ? r.data.speed + ' ft' : ''].filter(Boolean).join(' · ')}</i>
          </Link>
        ))}
      </div>
      {!(races ?? []).length ? <p className="dim">The SRD species are not loaded yet.</p> : null}
    </>
  );
}
