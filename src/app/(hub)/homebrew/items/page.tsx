/* eslint-disable @typescript-eslint/no-explicit-any */
import { requireViewer } from '@/lib/auth';
import { brewView } from '@/features/systems/brew';
import { BrewSystemNote } from '@/features/systems/BrewSystemNote';
import { PickerList, type PickRow } from '@/components/PickerList';

export const metadata = { title: 'Items' };

// The item picker: your own items and the SRD's (2024 rules), searchable, with a Create new button.
export default async function ItemPicker() {
  const { supabase, user } = await requireViewer();
  // the game system chosen on the Homebrew page: its official entries, and your entries for it
  const b = await brewView(supabase, user.id);
  const cols = 'id, name, kind:data->>kind, rarity:data->>rarity, damage:data->>damage, ac:data->>ac, mtype:data->magic->>type';
  const [{ data: srd }, { data: mine }] = await Promise.all([
    supabase.from('entities').select(cols).eq('source', 'srd').eq('srd_version', b.version).eq('type', 'item').order('name').limit(1000),
    supabase.from('entities').select(cols + ', system:data->>system').eq('owner_id', user.id).eq('type', 'item').order('name'),
  ]);
  const note = (i: any) => (i.kind === 'Magic item' ? [i.mtype || 'Magic item', i.rarity && i.rarity !== 'Standard' ? String(i.rarity).toLowerCase() : ''].filter(Boolean).join(', ') : i.kind === 'Weapon' ? `Weapon${i.damage ? ', ' + i.damage : ''}` : i.kind === 'Armor' ? `Armor${i.ac ? ', AC ' + i.ac : ''}` : i.kind ?? 'Gear');
  const rows = (list: any[] | null, own: boolean): PickRow[] => (list ?? []).map((r) => ({ id: r.id, name: r.name, note: note(r), group: r.kind ?? 'Gear', mine: own }));
  return (
    <>
      <h1>{b.plural('item')}</h1>
      <BrewSystemNote name={b.sys.name} />
      <PickerList rows={[...rows(((mine ?? []) as any[]).filter(b.mine), true) /* eslint-disable-line @typescript-eslint/no-explicit-any */, ...rows(srd, false)]} type="item" noun="item" plural="items" placeholder="Search by name, for example: longsword, bag of holding"
        filters={[['', 'All'], ['Weapon', 'Weapons'], ['Armor', 'Armor'], ['Gear', 'Gear'], ['Magic item', 'Magic items']]} />
    </>
  );
}
