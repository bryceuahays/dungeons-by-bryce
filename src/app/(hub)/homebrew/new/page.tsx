import { notFound } from 'next/navigation';
import { requireViewer } from '@/lib/auth';
import { getPlan, remaining } from '@/lib/entitlements';
import { TYPES } from '@/config/homebrew';
import { EntityEditor } from '@/components/EntityEditor';
import { UpgradeHint } from '@/components/UpgradeHint';

export const metadata = { title: 'New homebrew entry' };

export default async function NewEntity({ searchParams }: { searchParams: Promise<{ type?: string; from?: string }> }) {
  const { type = 'race', from } = await searchParams;
  const def = TYPES[type];
  if (!def) notFound();
  const { supabase } = await requireViewer();
  const [plan, { data: srd }, { data: start }] = await Promise.all([
    getPlan(),
    supabase.from('entities').select('type, name, data').eq('source', 'srd').eq('type', type).order('srd_version').limit(700),
    // from the class picker: open already filled in with that SRD entry (saved only on Save)
    from ? supabase.from('entities').select('id, name, data').eq('id', from).eq('source', 'srd').eq('type', type).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  if (remaining(plan, 'homebrew') <= 0) return (<><h1>New {def.label.toLowerCase()}</h1><UpgradeHint feature="homebrew" /></>);
  return (
    <>
      {type === 'class' ? null : <h1>{start ? `New ${def.label.toLowerCase()}, starting from the ${start.name}` : `New ${def.label.toLowerCase()}`}</h1>}
      <EntityEditor id={null} pro={plan.pro} srd={srd ?? []} versions={[]} campaigns={[]} version={1} changeNote="" clonedFrom={start?.id ?? null}
        initial={{ type, name: start?.name ?? '', status: 'draft', depth: 'quick', source: 'homebrew', data: start?.data ?? {} }} />
    </>
  );
}
