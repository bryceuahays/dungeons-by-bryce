import { notFound } from 'next/navigation';
import { requireViewer } from '@/lib/auth';
import { getPlan, remaining } from '@/lib/entitlements';
import { TYPES } from '@/config/homebrew';
import { EntityEditor } from '@/components/EntityEditor';
import { UpgradeHint } from '@/components/UpgradeHint';
import { CLASS_BLURBS } from '@/config/class-blurbs';
import { loadClassOptions, loadFeatOptions, loadSpellOptions, loadSubclassOptions, srdListFor, type SpellOption } from '@/lib/class-spells';

export const metadata = { title: 'New homebrew entry' };

export default async function NewEntity({ searchParams }: { searchParams: Promise<{ type?: string; from?: string }> }) {
  const { type = 'race', from } = await searchParams;
  const def = TYPES[type];
  if (!def) notFound();
  const { supabase, user } = await requireViewer();
  const [plan, { data: srd }, { data: start }, spells, feats, subclasses, classes] = await Promise.all([
    getPlan(),
    supabase.from('entities').select('type, name, data').eq('source', 'srd').eq('type', type).order('srd_version').limit(700),
    // from the class picker: open already filled in with that SRD entry (saved only on Save)
    from ? supabase.from('entities').select('id, name, data').eq('id', from).eq('source', 'srd').eq('type', type).maybeSingle() : Promise.resolve({ data: null }),
    type === 'class' || type === 'subclass' ? loadSpellOptions(supabase, user.id) : Promise.resolve(undefined),
    type === 'class' || type === 'subclass' ? loadFeatOptions(supabase) : Promise.resolve(undefined),
    type === 'class' ? loadSubclassOptions(supabase, user.id) : Promise.resolve(undefined),
    type === 'subclass' ? loadClassOptions(supabase, user.id) : Promise.resolve(undefined),
  ]);
  if (remaining(plan, 'homebrew') <= 0) return (<><h1>New {def.label.toLowerCase()}</h1><UpgradeHint feature="homebrew" /></>);
  return (
    <>
      {type === 'class' || type === 'subclass' ? null : <h1>{start ? `New ${def.label.toLowerCase()}, starting from the ${start.name}` : `New ${def.label.toLowerCase()}`}</h1>}
      <EntityEditor id={null} pro={plan.pro} srd={srd ?? []} versions={[]} campaigns={[]} version={1} changeNote="" clonedFrom={start?.id ?? null} spells={spells} feats={feats} subclasses={subclasses} classes={classes}
        initial={{ type, name: start?.name ?? '', status: 'draft', depth: 'quick', source: 'homebrew', data: startData(type, start, spells) }} />
    </>
  );
}

// The SRD 5.2 classes have no description: start a class from the picker with its card's text.
// Its spell list starts as the SRD's list for that class.
function startData(type: string, start: { name: string; data: any } | null, spells?: SpellOption[]) {
  if (!start) return type === 'class' ? { features: MILESTONES } : {};
  if (type !== 'class') return start.data;
  return { ...start.data, baseClass: start.name, desc: start.data?.desc || CLASS_BLURBS[start.name] || '', spellList: start.data?.spellList ?? srdListFor(spells ?? [], start.name) };
}

// What every class has, so a blank class starts with them already in place.
const MILESTONES = [
  ...[3, 7, 11, 15].map((level) => ({ level, name: 'Subclass feature', text: 'You gain a feature from your subclass.' })),
  ...[4, 8, 12, 16].map((level) => ({ level, name: 'Ability Score Improvement', text: 'Increase one ability score by 2, or two ability scores by 1 each (to a maximum of 20), or take a feat you qualify for.' })),
  { level: 19, name: 'Epic Boon', text: 'You gain an Epic Boon feat or another feat of your choice for which you qualify.' },
].sort((a, b) => a.level - b.level);
