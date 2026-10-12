/* eslint-disable @typescript-eslint/no-explicit-any */
import { requireViewer } from '@/lib/auth';
import { brewView } from '@/features/systems/brew';
import { BrewSystemNote } from '@/features/systems/BrewSystemNote';
import { PickerList, type PickRow } from '@/components/PickerList';

export const metadata = { title: 'Feats' };

// The feat picker: your own feats and the SRD's (2024 rules), searchable, filtered by category, with a Create new button.
export default async function FeatPicker() {
  const { supabase, user } = await requireViewer();
  // the game system chosen on the Homebrew page: its official entries, and your entries for it
  const b = await brewView(supabase, user.id);
  const cols = 'id, name, category:data->>category, prereq:data->>prereq';
  const [{ data: srd }, { data: mine }] = await Promise.all([
    supabase.from('entities').select(cols).eq('source', 'srd').eq('srd_version', b.version).eq('type', 'feat').order('name'),
    supabase.from('entities').select(cols + ', system:data->>system').eq('owner_id', user.id).eq('type', 'feat').order('name'),
  ]);
  const note = (f: any) => [f.category ? f.category + ' feat' : 'Feat', f.prereq ? 'needs ' + f.prereq : ''].filter(Boolean).join(', ');
  const rows = (list: any[] | null, own: boolean): PickRow[] => (list ?? []).map((r) => ({ id: r.id, name: r.name, note: note(r), group: String(r.category ?? '').toLowerCase(), mine: own }));
  return (
    <>
      <h1>{b.plural('feat')}</h1>
      <BrewSystemNote name={b.sys.name} />
      <PickerList rows={[...rows(((mine ?? []) as any[]).filter(b.mine), true) /* eslint-disable-line @typescript-eslint/no-explicit-any */, ...rows(srd, false)]} type="feat" noun="feat" plural="feats" placeholder="Search by name, for example: alert, grappler"
        filters={[['', 'All'], ['origin', 'Origin'], ['general', 'General'], ['fighting style', 'Fighting style'], ['epic boon', 'Epic boon']]} />
    </>
  );
}
