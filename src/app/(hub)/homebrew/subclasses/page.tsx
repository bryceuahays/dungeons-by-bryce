/* eslint-disable @typescript-eslint/no-explicit-any */
import { requireViewer } from '@/lib/auth';
import { brewView } from '@/features/systems/brew';
import { BrewSystemNote } from '@/features/systems/BrewSystemNote';
import { PickerList, type PickRow } from '@/components/PickerList';

export const metadata = { title: 'Subclasses' };

const CLASSES = ['Barbarian', 'Bard', 'Cleric', 'Druid', 'Fighter', 'Monk', 'Paladin', 'Ranger', 'Rogue', 'Sorcerer', 'Warlock', 'Wizard'];

// The subclass picker: your own subclasses and the SRD's (2024 rules), searchable, filtered by class, with a Create new button.
export default async function SubclassPicker() {
  const { supabase, user } = await requireViewer();
  // the game system chosen on the Homebrew page: its official entries, and your entries for it
  const b = await brewView(supabase, user.id);
  const cols = 'id, name, parent:data->>parent';
  const [{ data: srd }, { data: mine }] = await Promise.all([
    supabase.from('entities').select(cols).eq('source', 'srd').eq('srd_version', b.version).eq('type', 'subclass').order('name'),
    supabase.from('entities').select(cols + ', system:data->>system').eq('owner_id', user.id).eq('type', 'subclass').order('name'),
  ]);
  const rows = (list: any[] | null, own: boolean): PickRow[] => (list ?? []).map((r) => ({ id: r.id, name: r.name, note: r.parent ? r.parent + ' subclass' : 'Subclass', group: String(r.parent ?? '').toLowerCase(), mine: own }));
  return (
    <>
      <h1>{b.plural('subclass')}</h1>
      <BrewSystemNote name={b.sys.name} />
      <PickerList rows={[...rows(((mine ?? []) as any[]).filter(b.mine), true) /* eslint-disable-line @typescript-eslint/no-explicit-any */, ...rows(srd, false)]} type="subclass" noun="subclass" plural="subclasses" placeholder="Search by name, for example: champion, path of the berserker"
        filters={[['', 'All'], ...CLASSES.map((c): [string, string] => [c.toLowerCase(), c])]} />
    </>
  );
}
