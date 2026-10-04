import { notFound } from 'next/navigation';
import { requireViewer } from '@/lib/auth';
import { getPlan, remaining } from '@/lib/entitlements';
import { TYPES } from '@/config/homebrew';
import { EntityEditor } from '@/components/EntityEditor';
import { UpgradeHint } from '@/components/UpgradeHint';

export const metadata = { title: 'New homebrew entry' };

export default async function NewEntity({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const { type = 'race' } = await searchParams;
  const def = TYPES[type];
  if (!def) notFound();
  const { supabase } = await requireViewer();
  const [plan, { data: srd }] = await Promise.all([getPlan(), supabase.from('entities').select('type, name, data').eq('source', 'srd').eq('type', type).order('srd_version').limit(700)]);
  if (remaining(plan, 'homebrew') <= 0) return (<><h1>New {def.label.toLowerCase()}</h1><UpgradeHint feature="homebrew" /></>);
  return (
    <>
      <h1>New {def.label.toLowerCase()}</h1>
      <EntityEditor id={null} pro={plan.pro} srd={srd ?? []} versions={[]} campaigns={[]} version={1} changeNote=""
        initial={{ type, name: '', status: 'draft', depth: 'quick', source: 'homebrew', data: {} }} />
    </>
  );
}
