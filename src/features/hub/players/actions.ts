'use server';
import { revalidatePath } from 'next/cache';
import { getCampaign } from '@/lib/campaign';
import { flag, NOT_AVAILABLE } from '@/lib/flags';
import { hasFeature } from '@/config/hub-features';
import { MAX_MESSAGE, MAX_NOTES, cleanShared, type Shared } from './model';

// The Players page's changes (hub version 2, item 13) and the Reveals inbox's (issue 120). Every
// write is made with the person's own login, so the database's rules decide who may: a player
// shares only their own character and writes only their own messages and notes; only the campaign's
// owner and co-DMs who may "Read player messages" read and answer messages.

type Result = { error?: string; note?: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const words = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\r\n?/g, '\n').trim().slice(0, max) : '');

async function memberCtx(slug: string) {
  if (!(await flag('hub_v2_players'))) return null;
  const ctx = await getCampaign(slug);
  return ctx.asPlayer || !ctx.access.writable ? null : ctx;
}

// What a player shares about their character with the rest of the party.
export async function saveShared(slug: string, characterId: string, input: Shared): Promise<Result> {
  const ctx = await memberCtx(slug);
  if (!ctx || !hasFeature(ctx.campaign.settings, 'players.share')) return { error: NOT_AVAILABLE };
  if (!UUID.test(String(characterId))) return { error: 'That did not save.' };
  const { data, error } = await ctx.supabase.from('characters').update({ shared: cleanShared(input) }).eq('id', characterId).eq('campaign_id', ctx.campaign.id).eq('owner', ctx.user.id).select('id').maybeSingle();
  if (error || !data) return { error: 'That did not save.' };
  revalidatePath('/c/' + slug + '/hub/players');
  return { note: 'Saved. The party sees this.' };
}

// A private message to the campaign's DMs.
export async function sendToDm(slug: string, body: string): Promise<Result> {
  const ctx = await memberCtx(slug);
  if (!ctx || !hasFeature(ctx.campaign.settings, 'players.dmnote')) return { error: NOT_AVAILABLE };
  const text = words(body, MAX_MESSAGE);
  if (!text) return { error: 'Write your message first.' };
  const { error } = await ctx.supabase.from('player_notes').insert({ campaign_id: ctx.campaign.id, user_id: ctx.user.id, kind: 'to_dm', title: '', body: text });
  if (error) return { error: /rate:/.test(error.message) ? 'That is 20 messages in an hour. Try again a little later.' : 'That did not send.' };
  revalidatePath('/c/' + slug + '/hub/players');
  return { note: 'Sent. Only the DM sees it.' };
}

// The player's own notes on this campaign (one note, kept as they type).
export async function saveMyNotes(slug: string, body: string): Promise<Result> {
  const ctx = await memberCtx(slug);
  if (!ctx || !hasFeature(ctx.campaign.settings, 'players.notes')) return { error: NOT_AVAILABLE };
  const text = words(body, MAX_NOTES);
  const { data: mine } = await ctx.supabase.from('player_notes').select('id').eq('campaign_id', ctx.campaign.id).eq('user_id', ctx.user.id).eq('kind', 'note').eq('title', 'My notes').limit(1).maybeSingle();
  const q = mine
    ? ctx.supabase.from('player_notes').update({ body: text }).eq('id', mine.id)
    : ctx.supabase.from('player_notes').insert({ campaign_id: ctx.campaign.id, user_id: ctx.user.id, kind: 'note', title: 'My notes', body: text });
  const { error } = await q;
  return error ? { error: 'That did not save.' } : { note: 'Saved.' };
}

// ---------------------------------------------------------------- the DM's inbox (Reveals page)

async function inboxCtx(slug: string) {
  if (!(await flag('hub_v2_reveals'))) return null;
  const ctx = await getCampaign(slug);
  const may = ctx.isOwner || (ctx.coDm && ctx.perms.messages);
  return may && !ctx.asPlayer && ctx.access.writable && hasFeature(ctx.campaign.settings, 'reveals.inbox') ? ctx : null;
}

// Answer a player, privately.
export async function replyToPlayer(slug: string, playerId: string, body: string): Promise<Result> {
  const ctx = await inboxCtx(slug);
  if (!ctx) return { error: NOT_AVAILABLE };
  const text = words(body, MAX_MESSAGE);
  if (!text) return { error: 'Write your reply first.' };
  if (!UUID.test(String(playerId))) return { error: 'That did not send.' };
  const { error } = await ctx.supabase.from('player_notes').insert({ campaign_id: ctx.campaign.id, user_id: playerId, kind: 'from_dm', title: '', body: text });
  if (error) return { error: 'That did not send.' };
  revalidatePath('/c/' + slug, 'layout');
  return { note: 'Sent. Only they see it.' };
}

// Keep a player's message as a plot secret (DM only), to weave in later.
export async function saveMessageAsSecret(slug: string, messageId: string): Promise<Result> {
  const ctx = await inboxCtx(slug);
  if (!ctx || !ctx.perms.edit) return { error: NOT_AVAILABLE };
  if (!UUID.test(String(messageId))) return { error: 'That did not save.' };
  const { data: m } = await ctx.supabase.from('player_notes').select('user_id, body').eq('id', messageId).eq('campaign_id', ctx.campaign.id).eq('kind', 'to_dm').maybeSingle();
  if (!m) return { error: 'That message is not here any more.' };
  const { data: who } = await ctx.supabase.rpc('party_shared', { c: ctx.campaign.id });
  const from = ((who ?? []) as { owner: string; name: string; player: string }[]).find((x) => x.owner === m.user_id);
  const title = (`From ${from?.name || from?.player || 'a player'}: ` + m.body.replace(/\s+/g, ' ')).slice(0, 120);
  const { data, error } = await ctx.supabase.from('entries').insert({ campaign_id: ctx.campaign.id, kind: 'secret', title, status: '', vis: 'dm', vis_players: [], live: true, data: {} }).select('id').single();
  if (error || !data) return { error: /upgrade:/.test(error?.message ?? '') ? 'Plot secrets are part of Pro.' : 'That did not save.' };
  await ctx.supabase.from('entry_secrets').upsert({ entry_id: data.id, campaign_id: ctx.campaign.id, data: { detail: m.body } });
  revalidatePath('/c/' + slug, 'layout');
  return { note: 'Saved as a plot secret, under Unscheduled.' };
}
