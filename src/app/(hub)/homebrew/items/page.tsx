import { requireViewer } from '@/lib/auth';
import { ItemList, type ItemRow } from '@/components/ItemList';

export const metadata = { title: 'Items' };

// The item picker: your own items and the SRD's (2024 rules), searchable, with a Create new button.
// An SRD item opens as a copy to change; one of yours opens as itself.
export default async function ItemPicker() {
  const { supabase, user } = await requireViewer();
  const cols = 'id, name, kind:data->>kind, rarity:data->>rarity, damage:data->>damage, ac:data->>ac, mtype:data->magic->>type';
  const [{ data: srd }, { data: mine }] = await Promise.all([
    supabase.from('entities').select(cols).eq('source', 'srd').eq('srd_version', '5.2').eq('type', 'item').order('name').limit(1000),
    supabase.from('entities').select(cols).eq('owner_id', user.id).eq('type', 'item').order('name'),
  ]);
  const rows = (list: any[] | null, own: boolean): ItemRow[] => (list ?? []).map((r) => ({ id: r.id, name: r.name, kind: r.kind ?? 'Gear', rarity: r.rarity ?? '', damage: r.damage ?? '', ac: r.ac ?? '', mtype: r.mtype ?? '', mine: own })); // eslint-disable-line @typescript-eslint/no-explicit-any
  return (
    <>
      <h1>Items</h1>
      <ItemList items={[...rows(mine, true), ...rows(srd, false)]} />
    </>
  );
}
