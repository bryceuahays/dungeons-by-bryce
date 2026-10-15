'use server';
import { revalidatePath } from 'next/cache';
import { requireViewer } from '@/lib/auth';
import { flag, NOT_AVAILABLE } from '@/lib/flags';

// Start a session, or mark it played (issue 117). Whatever was waiting for it is revealed by the
// database as the status changes (sessions_reveal_log, and the rule reveal_met()), not here.
// Who may change a session is the database's rule too.
export async function stepSession(slug: string, sessionId: string, to: 'running' | 'played'): Promise<{ error?: string; note?: string }> {
  if (!(await flag('hub_v2_visibility'))) return { error: NOT_AVAILABLE };
  if (to !== 'running' && to !== 'played') return { error: 'That did not save.' };
  const { supabase } = await requireViewer();
  const { data, error } = await supabase.from('sessions').update({ status: to }).eq('id', sessionId).select('id').maybeSingle();
  if (error || !data) return { error: 'That did not save.' };
  revalidatePath('/c/' + slug, 'layout');
  return { note: to === 'running' ? 'Session started.' : 'Marked played.' };
}
