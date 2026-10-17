import { notFound } from 'next/navigation';
import { requireViewer } from '@/lib/auth';
import { loadSystem, systemPreview, systemUsage } from '@/features/systems/data';
import { SystemEditor } from '@/features/systems/SystemEditor';

export const metadata = { title: 'Edit a system' };

// Editing your own system. Others can read a system their campaign plays, but only its owner edits it.
export default async function EditSystem({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await requireViewer();
  const sys = await loadSystem(supabase, id);
  if (!sys || sys.ownerId !== user.id) notFound();
  const { id: _id, ownerId: _o, ...start } = sys; // eslint-disable-line @typescript-eslint/no-unused-vars
  const [usage, preview] = await Promise.all([systemUsage(supabase, user.id, start.base, id), systemPreview(supabase, user.id, start.base, id)]);
  return <SystemEditor key={id} start={start} id={id} mine usage={usage} preview={preview} />;
}
