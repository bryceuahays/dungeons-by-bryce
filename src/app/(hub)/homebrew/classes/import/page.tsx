import { requireViewer } from '@/lib/auth';
import { getPlan, remaining } from '@/lib/entitlements';
import { loadSpellOptions } from '@/lib/class-spells';
import { ClassImport } from '@/components/ClassImport';
import { UpgradeHint } from '@/components/UpgradeHint';

export const metadata = { title: 'Import a class' };

// Import a class from notes, read by the DM's own AI (see src/lib/class-import.ts).
export default async function ImportClass() {
  const { supabase, user } = await requireViewer();
  const [plan, { data: srd }, spells] = await Promise.all([
    getPlan(),
    supabase.from('entities').select('type, name, data').eq('source', 'srd').eq('type', 'class').order('srd_version').limit(700),
    loadSpellOptions(supabase, user.id),
  ]);
  if (remaining(plan, 'homebrew') <= 0) return (<><h1>Import a class</h1><UpgradeHint feature="homebrew" /></>);
  return (
    <>
      <h1>Import a class</h1>
      <ClassImport pro={plan.pro} srd={srd ?? []} spells={spells} />
    </>
  );
}
