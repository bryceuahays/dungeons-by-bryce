'use server';
import { revalidatePath } from 'next/cache';
import { getCampaign } from '@/lib/campaign';
import { flag, NOT_AVAILABLE } from '@/lib/flags';
import { MAX_RECAP, REVEAL_LINES, cleanNext, welcomeOf, withRecap } from './model';

export type WelcomeState = { error?: string; note?: string } | null;

// Each of these writes as the signed-in person: the database decides who may (the owner, and
// co-DMs with the permission the change needs).
async function ready(slug: string) {
  if (!(await flag('hub_v2_welcome'))) return null;
  const ctx = await getCampaign(slug);
  return ctx.realDm && !ctx.asPlayer ? ctx : null;
}
const saveWelcome = async (ctx: NonNullable<Awaited<ReturnType<typeof ready>>>, change: (w: ReturnType<typeof welcomeOf>) => ReturnType<typeof welcomeOf>): Promise<WelcomeState> => {
  const { data: c } = await ctx.supabase.from('campaigns').select('id, settings').eq('id', ctx.campaign.id).maybeSingle();
  if (!c) return { error: 'Campaign not found.' };
  const settings = (c.settings ?? {}) as Record<string, unknown>;
  const { data, error } = await ctx.supabase.from('campaigns').update({ settings: { ...settings, welcome: change(welcomeOf(settings)) } }).eq('id', c.id).select('id');
  if (error || !data?.length) return { error: 'That did not save. Changing it needs the "Change campaign settings" permission.' };
  revalidatePath('/c/' + ctx.campaign.slug, 'layout');
  return { note: 'Saved.' };
};

// The next session: when, and where the party left off. Players read it.
export async function saveNext(slug: string, input: unknown): Promise<WelcomeState> {
  const ctx = await ready(slug);
  if (!ctx) return { error: NOT_AVAILABLE };
  return saveWelcome(ctx, (w) => ({ ...w, next: cleanNext(input) }));
}

// A recap's draft is kept on the DM's own record of that session (the Sessions tab), which
// players cannot read. Nothing reaches players until it is published.
export async function saveRecapDraft(slug: string, session: unknown, body: unknown): Promise<WelcomeState> {
  const ctx = await ready(slug);
  if (!ctx) return { error: NOT_AVAILABLE };
  const n = Math.max(1, Math.min(999, Math.trunc(Number(session)) || 1));
  const summary = typeof body === 'string' ? body.slice(0, MAX_RECAP) : '';
  const { data: row } = await ctx.supabase.from('sessions').select('id').eq('campaign_id', ctx.campaign.id).eq('number', n).maybeSingle();
  const res = row
    ? await ctx.supabase.from('sessions').update({ summary }).eq('id', row.id).select('id')
    : await ctx.supabase.from('sessions').insert({ campaign_id: ctx.campaign.id, number: n, title: `Session ${n}`, summary }).select('id');
  if (res.error || !res.data?.length) return { error: 'The draft did not save. Saving it needs the "Edit pages and content" permission.' };
  revalidatePath('/c/' + ctx.campaign.slug, 'layout');
  return { note: 'Draft saved. Players do not see it yet.' };
}

// Publish: the recap goes on the Welcome page for everyone in the campaign.
export async function publishRecap(slug: string, session: unknown, body: unknown): Promise<WelcomeState> {
  const ctx = await ready(slug);
  if (!ctx) return { error: NOT_AVAILABLE };
  if (typeof body !== 'string' || !body.trim()) return { error: 'Write the recap first.' };
  const done = await saveWelcome(ctx, (w) => withRecap(w, session, body));
  return done?.error ? done : { note: 'Published. Players see it now.' };
}

// "Reveal now": something waiting for the next stage is shown at once, to whoever it was for.
export async function revealNow(slug: string, entryId: string): Promise<WelcomeState> {
  const ctx = await ready(slug);
  if (!ctx) return { error: NOT_AVAILABLE };
  if (typeof entryId !== 'string' || !/^[0-9a-f-]{36}$/.test(entryId)) return { error: 'That is not something to reveal.' };
  const { data: e } = await ctx.supabase.from('entries').select('id, kind, title, vis, vis_players').eq('id', entryId).eq('campaign_id', ctx.campaign.id).maybeSingle();
  if (!e || (e.vis !== 'stage' && e.vis !== 'players_stage')) return { error: 'That is not waiting for a stage.' };
  const { data, error } = await ctx.supabase.from('entries').update({ vis: e.vis === 'stage' ? 'all' : 'players' }).eq('id', e.id).select('id');
  if (error || !data?.length) return { error: 'That did not reveal. Revealing needs the "Reveal and schedule reveals" permission.' };
  // The database writes a line in the reveal log when something hidden from everyone is shown;
  // something that was waiting for a stage needs its line written here, for the same people.
  const vis = e.vis === 'stage' ? 'all' : 'players';
  await ctx.supabase.from('entries').insert({ campaign_id: ctx.campaign.id, kind: 'log', owner: null, title: (REVEAL_LINES[e.kind] ?? 'Newly revealed: ') + (e.kind === 'region' ? '' : e.title), live: !!ctx.campaign.settings?.feed, vis, vis_players: vis === 'players' ? e.vis_players : [], data: { entry: e.id, kind: e.kind } });
  revalidatePath('/c/' + ctx.campaign.slug, 'layout');
  return { note: 'Revealed.' };
}
