'use server';
import { revalidatePath } from 'next/cache';
import { getCampaign } from '@/lib/campaign';
import { flag, NOT_AVAILABLE } from '@/lib/flags';
import { cleanPerms } from '@/config/co-dm';

export type PeopleState = { error?: string; note?: string } | null;

// Make a member a co-DM with these permissions, change a co-DM's permissions, or make them a
// player again. Only the campaign's owner: the database function refuses anyone else,
// whatever this action does.
export async function setCoDm(slug: string, userId: string, make: boolean, perms: unknown): Promise<PeopleState> {
  if (!(await flag('hub_v2_people'))) return { error: NOT_AVAILABLE };
  const ctx = await getCampaign(slug);
  if (!ctx.isOwner) return { error: 'Only the owner of the campaign chooses co-DMs.' };
  if (typeof userId !== 'string' || !/^[0-9a-f-]{36}$/.test(userId)) return { error: 'That person is not in this campaign.' };
  const { error } = await ctx.supabase.rpc('set_co_dm', { c: ctx.campaign.id, u: userId, make: make === true, p_perms: make ? cleanPerms(perms) : null });
  if (error) return { error: /not in this campaign/.test(error.message) ? 'That person is not in this campaign.' : 'That did not save.' };
  revalidatePath('/c/' + slug, 'layout');
  return { note: make ? 'Saved.' : 'They are a player again.' };
}
