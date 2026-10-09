import { requireViewer } from '@/lib/auth';
import { getPlan, remaining } from '@/lib/entitlements';
import { loadClassOptions, loadFeatOptions, loadItemNames, loadSpellOptions, loadSubclassOptions } from '@/lib/class-spells';
import { BrewImport } from '@/components/BrewImport';
import { UpgradeHint } from '@/components/UpgradeHint';

export const metadata = { title: 'Import homebrew' };

// Import any kind of homebrew from notes, read by the DM's own AI (see src/lib/brew-import.ts).
export default async function ImportBrew({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const { type = 'class' } = await searchParams;
  const { supabase, user } = await requireViewer();
  const [plan, { data: srd }, spells, feats, subclasses, classes, items] = await Promise.all([
    getPlan(),
    // what the balance hint compares against (the small lists only)
    supabase.from('entities').select('type, name, data').eq('source', 'srd').in('type', ['class', 'subclass', 'race', 'background', 'feat']).order('srd_version').limit(700),
    loadSpellOptions(supabase, user.id),
    loadFeatOptions(supabase),
    loadSubclassOptions(supabase, user.id),
    loadClassOptions(supabase, user.id),
    loadItemNames(supabase),
  ]);
  if (remaining(plan, 'homebrew') <= 0) return (<><h1>Import homebrew</h1><UpgradeHint feature="homebrew" /></>);
  return (
    <>
      <h1>Import homebrew <span className="beta-tag">Beta</span></h1>
      <p className="dim">This is new and still being tested with different AIs. If something comes through wrong, fill it in by hand in the editor, and let us know through Feedback.</p>
      <BrewImport pro={plan.pro} start={type} srd={srd ?? []} spells={spells} feats={feats} subclasses={subclasses} classes={classes} items={items} />
    </>
  );
}
