/* eslint-disable @typescript-eslint/no-explicit-any */
import { requireViewer } from '@/lib/auth';
import { brewView } from '@/features/systems/brew';
import { BrewSystemNote } from '@/features/systems/BrewSystemNote';
import { PickerList, type PickRow } from '@/components/PickerList';

export const metadata = { title: 'Spells' };

// The spell picker: your own spells and the SRD's (2024 rules), searchable, filtered by level, with a Create new button.
export default async function SpellPicker() {
  const { supabase, user } = await requireViewer();
  // the game system chosen on the Homebrew page: its official entries, and your entries for it
  const b = await brewView(supabase, user.id);
  const cols = 'id, name, level:data->>level, school:data->>school, ritual:data->>ritual';
  const [{ data: srd }, { data: mine }] = await Promise.all([
    supabase.from('entities').select(cols).eq('source', 'srd').eq('srd_version', b.version).eq('type', 'spell').order('name').limit(1000),
    supabase.from('entities').select(cols + ', system:data->>system').eq('owner_id', user.id).eq('type', 'spell').order('name'),
  ]);
  const note = (s: any) => `${Number(s.level) ? 'Level ' + s.level : 'Cantrip'}${s.school ? ' ' + s.school : ''}${s.ritual === 'true' ? ', ritual' : ''}`;
  const rows = (list: any[] | null, own: boolean): PickRow[] => (list ?? []).map((r) => ({ id: r.id, name: r.name, note: note(r), group: String(Number(r.level) || 0), mine: own }));
  return (
    <>
      <h1>{b.plural('spell')}</h1>
      <BrewSystemNote name={b.sys.name} />
      <PickerList rows={[...rows(((mine ?? []) as any[]).filter(b.mine), true) /* eslint-disable-line @typescript-eslint/no-explicit-any */, ...rows(srd, false)]} type="spell" noun="spell" plural="spells" placeholder="Search by name, for example: fireball, cure wounds"
        filters={[['', 'All'], ['0', 'Cantrips'], ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((l): [string, string] => [String(l), 'Level ' + l])]} />
    </>
  );
}
