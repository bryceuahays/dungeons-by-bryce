import { requireViewer } from '@/lib/auth';
import { presetOf } from '@/features/systems/model';
import { systemPreview, systemUsage } from '@/features/systems/data';
import { SystemEditor } from '@/features/systems/SystemEditor';

export const metadata = { title: 'Customize a system' };

// Customizing a ready-made system. Nothing is saved until "Save as a new system".
export default async function NewSystem({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const { from } = await searchParams;
  const { supabase, user } = await requireViewer();
  const start = presetOf(from === '2014' ? '2014' : '2024');
  const [usage, preview] = await Promise.all([systemUsage(supabase, user.id, start.base, null), systemPreview(supabase, user.id, start.base, null)]);
  return <SystemEditor start={start} id={null} mine={false} usage={usage} preview={preview} />;
}
