import 'server-only';
/* eslint-disable @typescript-eslint/no-explicit-any */
import crypto from 'node:crypto';
import { getCampaign, getSheetEntities, type CampaignCtx } from '@/lib/campaign';
import { getMembers } from '@/lib/entries';
import { createAdminClient } from '@/lib/supabase/admin';
import { flag, NOT_AVAILABLE } from '@/lib/flags';
import { hasFeature } from '@/config/hub-features';
import { blankV2, derive, type CharacterV2 } from '@/lib/rules/engine';
import { campaignSheetSystem } from '@/features/systems/data';
import { checkNotation, formatTerms, parseNotation, rollTerms } from './notation';
import { decidePrivacy, diceRules, rollOpen } from './model';

// Dice on the server (hub version 2, item 5).
//
// The browser says what to roll. This file decides whether that roll may be made and who
// will see it, rolls it with a secure random number generator, and stores it with the
// service role. Signed-in people can read rolls (under the database's rules) and can write
// none: there is no other way for a roll to come into being.

export type Out = { status: number; body: Record<string, unknown> };
const no = (status: number, error: string): Out => ({ status, body: { error } });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// ---------------------------------------------------------------- a character's checks

// "Tap to roll": a check's modifier comes from the rules engine, worked out here on the
// server when the page is built. It is handed to the browser sealed, so the browser can ask
// for that check to be rolled but cannot change the number in it.
export type Check = { type: 'ability' | 'save' | 'skill' | 'initiative'; label: string; bonus: number; token: string };
type Sealed = { u: string; k: string; c: string; n: string; l: string; b: number; x: number };

const key = () => crypto.createHmac('sha256', process.env.SUPABASE_SERVICE_ROLE_KEY!).update('dice-checks-v1').digest();
const seal = (p: Sealed) => { const body = Buffer.from(JSON.stringify(p)).toString('base64url'); return body + '.' + crypto.createHmac('sha256', key()).update(body).digest('base64url'); };
function unseal(token: string, userId: string, campaignId: string): Sealed | null {
  const [body, mac] = token.split('.');
  if (!body || !mac) return null;
  const want = crypto.createHmac('sha256', key()).update(body).digest();
  const got = Buffer.from(mac, 'base64url');
  if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString()) as Sealed;
    return p.u === userId && p.k === campaignId && p.x > Date.now() && Number.isInteger(p.b) ? p : null;
  } catch { return null; }
}

// One check sealed for the viewer to roll (the character sidebar seals its own list with this).
export const sealCheck = (ctx: CampaignCtx, characterId: string, name: string, label: string, bonus: number) =>
  seal({ u: ctx.user.id, k: ctx.campaign.id, c: characterId, n: String(name || 'Unnamed').slice(0, 80), l: label, b: Math.trunc(Number(bonus) || 0), x: Date.now() + 12 * 3600 * 1000 });

// The checks of the viewer's own characters in this campaign, each sealed.
export async function myChecks(ctx: CampaignCtx): Promise<{ id: string; name: string; checks: Check[] }[]> {
  const { data: chars } = await ctx.supabase.from('characters').select('id, data').eq('campaign_id', ctx.campaign.id).eq('owner', ctx.user.id).order('created_at');
  if (!chars?.length) return [];
  const [entities, system] = await Promise.all([getSheetEntities(ctx, undefined, { liteSpells: true }), campaignSheetSystem(ctx)]);
  const until = Date.now() + 12 * 3600 * 1000;
  return chars.map((ch) => {
    const c = { ...blankV2(), ...((ch.data ?? {}) as object), v: 2 } as CharacterV2;
    const d = derive(c, entities as any, system?.rules);
    const name = String(c.name || 'Unnamed').slice(0, 80);
    const abilities = system?.rules.abilities ?? [{ key: 'str', label: 'Strength' }, { key: 'dex', label: 'Dexterity' }, { key: 'con', label: 'Constitution' }, { key: 'int', label: 'Intelligence' }, { key: 'wis', label: 'Wisdom' }, { key: 'cha', label: 'Charisma' }];
    const list: Omit<Check, 'token'>[] = [
      ...abilities.map((a: any) => ({ type: 'ability' as const, label: `${a.label} check`, bonus: Number((d.mods as any)[a.key]) || 0 })),
      ...d.saves.map((s) => ({ type: 'save' as const, label: `${s.label} save`, bonus: s.bonus })),
      ...d.skills.map((s) => ({ type: 'skill' as const, label: s.name, bonus: s.bonus })),
      { type: 'initiative' as const, label: 'Initiative', bonus: d.initiative },
    ];
    return { id: ch.id as string, name, checks: list.map((k) => ({ ...k, bonus: Math.trunc(k.bonus), token: seal({ u: ctx.user.id, k: ctx.campaign.id, c: ch.id, n: name, l: k.label, b: Math.trunc(k.bonus), x: until }) })) };
  });
}

// The names a DM can ask a player to roll: the campaign's skills, saves and ability checks.
export async function checkNames(ctx: CampaignCtx): Promise<string[]> {
  const system = await campaignSheetSystem(ctx);
  const sample = derive(blankV2(), [], system?.rules);
  const abilities = system?.rules.abilities ?? [{ label: 'Strength' }, { label: 'Dexterity' }, { label: 'Constitution' }, { label: 'Intelligence' }, { label: 'Wisdom' }, { label: 'Charisma' }];
  return [...sample.skills.map((s) => s.name), ...sample.saves.map((s) => `${s.label} save`), ...abilities.map((a: any) => `${a.label} check`), 'Initiative'];
}

// ---------------------------------------------------------------- who is asking

async function roller(slug: string): Promise<{ ctx: CampaignCtx } | { out: Out }> {
  if (!(await flag('hub_v2_dice'))) return { out: no(404, NOT_AVAILABLE) };
  const ctx = await getCampaign(slug);
  if (ctx.asPlayer) return { out: no(403, 'You are previewing as a player. Leave the preview to roll.') };
  // the Head DM looking into someone else's campaign reads; they do not roll in it
  if (ctx.headView && !ctx.realDm) return { out: no(403, 'You are not part of this campaign.') };
  if (!ctx.access.writable) return { out: no(403, 'This campaign is read-only.') };
  return { ctx };
}

// ---------------------------------------------------------------- rolling

export async function rollInCampaign(slug: string, input: Record<string, unknown>): Promise<Out> {
  const who = await roller(slug);
  if ('out' in who) return who.out;
  const { ctx } = who;
  const settings = ctx.campaign.settings, rules = diceRules(settings), admin = createAdminClient();
  const dm = ctx.realDm;

  // a roll the DM asked this player for
  let request: any = null;
  if (input.request !== undefined) {
    if (typeof input.request !== 'string' || !UUID.test(input.request)) return no(400, 'That request is not valid.');
    const { data } = await admin.from('roll_requests').select('*').eq('id', input.request).eq('campaign_id', ctx.campaign.id).eq('to_user', ctx.user.id).eq('status', 'open').maybeSingle();
    if (!data) return no(404, 'That request is no longer open.');
    request = data;
  }

  // what to roll
  const mode = input.mode === 'adv' ? 'adv' : input.mode === 'dis' ? 'dis' : 'normal';
  let check: Sealed | null = null;
  if (input.check !== undefined) {
    check = typeof input.check === 'string' ? unseal(input.check, ctx.user.id, ctx.campaign.id) : null;
    if (!check) return no(400, 'That check is out of date. Reload the page and roll again.');
  }
  let notation: string, label: string, characterId: string | null = null, name = dm ? 'DM' : String(ctx.profile.display_name || 'A player').slice(0, 80);
  if (request) {
    label = String(request.label);
    if (typeof request.what?.notation === 'string') notation = request.what.notation;
    else {
      // a named check: the player's own sealed check for it if they sent one, otherwise a plain d20
      const mine = check && check.l.toLowerCase() === String(request.what?.check ?? '').toLowerCase() ? check : null;
      notation = checkNotation(mine ? mine.b : 0, mode);
      if (mine) { characterId = mine.c; name = mine.n; }
    }
  } else if (check) {
    if (!hasFeature(settings, 'sidebar.tap')) return no(403, 'Tap to roll is switched off in this campaign.');
    notation = checkNotation(check.b, mode); label = check.l; characterId = check.c; name = check.n;
  } else {
    notation = typeof input.notation === 'string' ? input.notation : '';
    label = (typeof input.label === 'string' ? input.label : '').trim().slice(0, 80);
  }
  const parsed = parseNotation(notation);
  if (!parsed.ok) return no(400, parsed.error);

  // who will see it
  let memberIds: string[] = [];
  if (dm && input.privacy === 'players') memberIds = (await getMembers(ctx)).map((m) => m.user_id);
  const seen = decidePrivacy({ dm, wanted: input.privacy, players: input.players, label, rules, privateOn: hasFeature(settings, 'sidebar.private'), memberIds, request: request ? { privacy: request.privacy, blind: request.blind } : null });
  if (!seen.ok) return no(400, seen.error);

  // roll, on the server, with a secure generator
  const result = rollTerms(parsed.terms, (sides) => crypto.randomInt(1, sides + 1));
  const text = formatTerms(parsed.terms);
  const made = await admin.from('rolls').insert({
    campaign_id: ctx.campaign.id, user_id: ctx.user.id, character_id: characterId, who: name, by_dm: dm, label: label || text, total: result.total,
    privacy: seen.privacy, shown_to: seen.shown_to, blind: seen.blind, asked_by: request?.asked_by ?? null, request_id: request?.id ?? null,
  }).select('*').single();
  if (made.error || !made.data) return /rate:/.test(made.error?.message ?? '') ? no(429, 'That is 30 rolls in a minute. Wait a moment and roll again.') : no(500, 'That roll could not be saved. Try again.');
  const detail = { roll_id: made.data.id, campaign_id: ctx.campaign.id, user_id: ctx.user.id, notation: text, dice: result.dice, modifier: result.modifier };
  const kept = await admin.from('roll_details').insert(detail);
  if (kept.error) { await admin.from('rolls').delete().eq('id', made.data.id); return no(500, 'That roll could not be saved. Try again.'); }
  if (request) await admin.from('roll_requests').update({ status: 'done', roll_id: made.data.id }).eq('id', request.id);

  // a blind roll: the roller is told it happened, and nothing about how it fell
  if (seen.blind) return { status: 200, body: { ok: true, blind: true, label: made.data.label } };
  return { status: 200, body: { ok: true, roll: { ...made.data, notation: text, dice: result.dice, modifier: result.modifier } } };
}

// ---------------------------------------------------------------- asking for a roll

export async function askForRoll(slug: string, input: Record<string, unknown>): Promise<Out> {
  const who = await roller(slug);
  if ('out' in who) return who.out;
  const { ctx } = who;
  if (!ctx.realDm) return no(403, 'Only the DM asks for rolls.');
  const admin = createAdminClient();
  if (input.cancel !== undefined) {
    if (typeof input.cancel !== 'string' || !UUID.test(input.cancel)) return no(400, 'That request is not valid.');
    await admin.from('roll_requests').update({ status: 'gone' }).eq('id', input.cancel).eq('campaign_id', ctx.campaign.id).eq('status', 'open');
    return { status: 200, body: { ok: true } };
  }
  const members = (await getMembers(ctx)).map((m) => m.user_id);
  const to = [...new Set((Array.isArray(input.to) ? input.to : []).map(String))].filter((id) => members.includes(id) && id !== ctx.user.id).slice(0, 20);
  if (!to.length) return no(400, 'Choose who should roll.');
  let what: Record<string, string>, label: string;
  if (typeof input.check === 'string' && input.check) {
    const names = await checkNames(ctx);
    const found = names.find((n) => n.toLowerCase() === String(input.check).toLowerCase());
    if (!found) return no(400, 'That is not a check in this campaign.');
    what = { check: found }; label = found;
  } else {
    const parsed = parseNotation(input.notation);
    if (!parsed.ok) return no(400, parsed.error);
    what = { notation: parsed.text };
    label = (typeof input.label === 'string' ? input.label : '').trim().slice(0, 80) || parsed.text;
  }
  const blind = input.blind === true;
  const privacy = blind || input.privacy === 'dm' ? 'dm' : 'all';
  const { data, error } = await admin.from('roll_requests').insert(to.map((id) => ({ campaign_id: ctx.campaign.id, asked_by: ctx.user.id, to_user: id, label, what, privacy, blind }))).select('*');
  if (error) return no(500, 'That could not be sent. Try again.');
  return { status: 200, body: { ok: true, requests: data } };
}

// ---------------------------------------------------------------- reading, for the page

// The latest rolls the viewer may see, each with its dice where they may see those too, and
// the open requests. Read with the viewer's own login, so the database leaves out what is
// not theirs. A DM previewing as a player reads everything with that login, so for a preview
// the same rule is applied here before anything is sent.
export async function loadDice(ctx: CampaignCtx) {
  const dmSide = ctx.isDm;   // false while previewing as a player
  const me = ctx.asPlayer ? ctx.viewAs.player : ctx.user.id;
  const [{ data: rollRows }, { data: reqRows }] = await Promise.all([
    ctx.supabase.from('rolls').select('*').eq('campaign_id', ctx.campaign.id).order('created_at', { ascending: false }).limit(ctx.asPlayer ? 200 : 40),
    ctx.supabase.from('roll_requests').select('*').eq('campaign_id', ctx.campaign.id).eq('status', 'open').order('created_at'),
  ]);
  let rolls = (rollRows ?? []) as any[];
  let requests = (reqRows ?? []) as any[];
  const shown = diceRules(ctx.campaign.settings).showDice;
  if (ctx.asPlayer) {
    rolls = rolls.filter((r) => rollOpen(r, { id: me, dmSide: false })).slice(0, 40);
    requests = requests.filter((q) => !!me && q.to_user === me);
  } else if (!ctx.realDm) requests = requests.filter((q) => q.to_user === ctx.user.id);
  const { data: details } = rolls.length ? await ctx.supabase.from('roll_details').select('*').in('roll_id', rolls.map((r) => r.id)) : { data: [] as any[] };
  const by = new Map(((details ?? []) as any[]).filter((d) => !ctx.asPlayer || shown || d.user_id === me).map((d) => [d.roll_id, d]));
  return {
    rolls: rolls.map((r) => { const d = by.get(r.id); return d ? { ...r, notation: d.notation, dice: d.dice, modifier: d.modifier } : r; }),
    requests, me, dmSide,
  };
}
