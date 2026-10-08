/* eslint-disable @typescript-eslint/no-explicit-any */
import { requireViewer } from '@/lib/auth';
import { PickerList, type PickRow } from '@/components/PickerList';

export const metadata = { title: 'Subclasses' };

const CLASSES = ['Barbarian', 'Bard', 'Cleric', 'Druid', 'Fighter', 'Monk', 'Paladin', 'Ranger', 'Rogue', 'Sorcerer', 'Warlock', 'Wizard'];

// The subclass picker: your own subclasses and the SRD's (2024 rules), searchable, filtered by class, with a Create new button.
export default async function SubclassPicker() {
  const { supabase, user } = await requireViewer();
  const cols = 'id, name, parent:data->>parent';
  const [{ data: srd }, { data: mine }] = await Promise.all([
    supabase.from('entities').select(cols).eq('source', 'srd').eq('srd_version', '5.2').eq('type', 'subclass').order('name'),
    supabase.from('entities').select(cols).eq('owner_id', user.id).eq('type', 'subclass').order('name'),
  ]);
  const rows = (list: any[] | null, own: boolean): PickRow[] => (list ?? []).map((r) => ({ id: r.id, name: r.name, note: r.parent ? r.parent + ' subclass' : 'Subclass', group: String(r.parent ?? '').toLowerCase(), mine: own }));
  return (
    <>
      <h1>Subclasses</h1>
      <PickerList rows={[...rows(mine, true), ...rows(srd, false)]} type="subclass" noun="subclass" plural="subclasses" placeholder="Search by name, for example: champion, path of the berserker"
        filters={[['', 'All'], ...CLASSES.map((c): [string, string] => [c.toLowerCase(), c])]} />
    </>
  );
}
