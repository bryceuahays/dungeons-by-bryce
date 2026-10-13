/* eslint-disable @typescript-eslint/no-explicit-any */
import { requireViewer } from '@/lib/auth';
import { brewView } from '@/features/systems/brew';
import { BrewSystemNote } from '@/features/systems/BrewSystemNote';
import { PickerList, type PickRow } from '@/components/PickerList';
import { crNumber } from '@/lib/monster-rules';

export const metadata = { title: 'Monsters' };

// The monster picker: your own monsters and the SRD's (2024 rules), searchable, filtered by challenge rating, with a Create new button.
const band = (cr: string) => { const n = crNumber(cr); return n <= 1 ? '0-1' : n <= 4 ? '2-4' : n <= 10 ? '5-10' : n <= 16 ? '11-16' : '17+'; };
export default async function MonsterPicker() {
  const { supabase, user } = await requireViewer();
  // the game system chosen on the Homebrew page: its official entries, and your entries for it
  const b = await brewView(supabase, user.id);
  const cols = 'id, name, cr:data->>cr, size:data->>size, mtype:data->>mtype';
  const [{ data: srd }, { data: mine }] = await Promise.all([
    supabase.from('entities').select(cols).eq('source', 'srd').eq('srd_version', b.version).eq('type', 'monster').order('name').limit(1000),
    supabase.from('entities').select(cols + ', system:data->>system').eq('owner_id', user.id).eq('type', 'monster').order('name'),
  ]);
  const rows = (list: any[] | null, own: boolean): PickRow[] => (list ?? []).map((r) => ({ id: r.id, name: r.name, note: `CR ${r.cr ?? '?'} · ${r.size ?? ''} ${String(r.mtype ?? '').toLowerCase()}`, group: band(r.cr ?? '0'), mine: own }));
  return (
    <>
      <h1>{b.plural('monster')}</h1>
      <BrewSystemNote name={b.sys.name} />
      <PickerList rows={[...rows(((mine ?? []) as any[]).filter(b.mine), true) /* eslint-disable-line @typescript-eslint/no-explicit-any */, ...rows(srd, false)]} type="monster" noun="monster" plural="monsters" placeholder="Search by name, for example: goblin, red dragon"
        filters={[['', 'All'], ['0-1', 'CR 0–1'], ['2-4', 'CR 2–4'], ['5-10', 'CR 5–10'], ['11-16', 'CR 11–16'], ['17+', 'CR 17+']]} />
    </>
  );
}
