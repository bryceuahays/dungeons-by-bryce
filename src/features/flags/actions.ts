'use server';
import { revalidatePath } from 'next/cache';
import { requireHead } from '@/lib/auth';
import { FLAG_NAMES, type Flag } from '@/config/flags';

export type FlagState = { error?: string } | null;

// Turn a flag on for everyone, or hide it again. Only the Head DM reaches this, and the
// database refuses the write from anyone else whatever this action does.
export async function setFlag(name: string, on: boolean): Promise<FlagState> {
  const { supabase } = await requireHead();
  if (!FLAG_NAMES.includes(name as Flag)) return { error: 'There is no switch by that name.' };
  const { data, error } = await supabase.from('feature_flags').upsert({ name, is_on: on === true, changed_at: new Date().toISOString() }).select('name');
  if (error || !data?.length) return { error: 'That did not save. Try again in a moment.' };
  revalidatePath('/', 'layout');
  return null;
}
