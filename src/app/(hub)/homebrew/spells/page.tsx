/* eslint-disable @typescript-eslint/no-explicit-any */
import { requireViewer } from '@/lib/auth';
import { PickerList, type PickRow } from '@/components/PickerList';

export const metadata = { title: 'Spells' };

// The spell picker: your own spells and the SRD's (2024 rules), searchable, filtered by level, with a Create new button.
export default async function SpellPicker() {
  const { supabase, user } = await requireViewer();
  const cols = 'id, name, level:data->>level, school:data->>school, ritual:data->>ritual';
  const [{ data: srd }, { data: mine }] = await Promise.all([
    supabase.from('entities').select(cols).eq('source', 'srd').eq('srd_version', '5.2').eq('type', 'spell').order('name').limit(1000),
    supabase.from('entities').select(cols).eq('owner_id', user.id).eq('type', 'spell').order('name'),
  ]);
  const note = (s: any) => `${Number(s.level) ? 'Level ' + s.level : 'Cantrip'}${s.school ? ' ' + s.school : ''}${s.ritual === 'true' ? ', ritual' : ''}`;
  const rows = (list: any[] | null, own: boolean): PickRow[] => (list ?? []).map((r) => ({ id: r.id, name: r.name, note: note(r), group: String(Number(r.level) || 0), mine: own }));
  return (
    <>
      <h1>Spells</h1>
      <PickerList rows={[...rows(mine, true), ...rows(srd, false)]} type="spell" noun="spell" plural="spells" placeholder="Search by name, for example: fireball, cure wounds"
        filters={[['', 'All'], ['0', 'Cantrips'], ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((l): [string, string] => [String(l), 'Level ' + l])]} />
    </>
  );
}
