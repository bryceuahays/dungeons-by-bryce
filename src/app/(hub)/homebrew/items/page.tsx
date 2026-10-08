/* eslint-disable @typescript-eslint/no-explicit-any */
import { requireViewer } from '@/lib/auth';
import { PickerList, type PickRow } from '@/components/PickerList';

export const metadata = { title: 'Items' };

// The item picker: your own items and the SRD's (2024 rules), searchable, with a Create new button.
export default async function ItemPicker() {
  const { supabase, user } = await requireViewer();
  const cols = 'id, name, kind:data->>kind, rarity:data->>rarity, damage:data->>damage, ac:data->>ac, mtype:data->magic->>type';
  const [{ data: srd }, { data: mine }] = await Promise.all([
    supabase.from('entities').select(cols).eq('source', 'srd').eq('srd_version', '5.2').eq('type', 'item').order('name').limit(1000),
    supabase.from('entities').select(cols).eq('owner_id', user.id).eq('type', 'item').order('name'),
  ]);
  const note = (i: any) => (i.kind === 'Magic item' ? [i.mtype || 'Magic item', i.rarity && i.rarity !== 'Standard' ? String(i.rarity).toLowerCase() : ''].filter(Boolean).join(', ') : i.kind === 'Weapon' ? `Weapon${i.damage ? ', ' + i.damage : ''}` : i.kind === 'Armor' ? `Armor${i.ac ? ', AC ' + i.ac : ''}` : i.kind ?? 'Gear');
  const rows = (list: any[] | null, own: boolean): PickRow[] => (list ?? []).map((r) => ({ id: r.id, name: r.name, note: note(r), group: r.kind ?? 'Gear', mine: own }));
  return (
    <>
      <h1>Items</h1>
      <PickerList rows={[...rows(mine, true), ...rows(srd, false)]} type="item" noun="item" plural="items" placeholder="Search by name, for example: longsword, bag of holding"
        filters={[['', 'All'], ['Weapon', 'Weapons'], ['Armor', 'Armor'], ['Gear', 'Gear'], ['Magic item', 'Magic items']]} />
    </>
  );
}
