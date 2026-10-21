'use server';
/* eslint-disable @typescript-eslint/no-explicit-any */
import crypto from 'node:crypto';
import { getCampaign, getSheetEntities, type CampaignCtx } from '@/lib/campaign';
import { createAdminClient } from '@/lib/supabase/admin';
import { flag, NOT_AVAILABLE } from '@/lib/flags';
import { hasFeature } from '@/config/hub-features';
import { blankV2, derive, type CharacterV2 } from '@/lib/rules/engine';
import { campaignSheetSystem } from '@/features/systems/data';
import { checkNotation, formatTerms, parseNotation, rollTerms } from '@/features/dice/notation';
import { EMPTY, cleanState, publicView, step, withLine, MOVES, type State } from './model';

// The Combat page's changes (hub version 2, item 12). The full fight is kept with the DM-only
// secrets; the entry players read is always worked out from it here, on the server, by
// publicView(), so a player's browser never receives an enemy's hit points or a hidden creature.
//
// The DM's own login writes the DM's changes (the database decides who may: the owner, a co-DM who
// may run combat or edit). A player's turn (attack, a spell, Dash, ending the turn) is checked here
// (it must be their character's turn) and written with the service role, since players cannot
// write the fight. Rolls are made here with a secure generator and go to the party's roll log.

type Result = { error?: string; state?: State };
const featuresOf = (settings: unknown) => ({ health: hasFeature(settings as any, 'combat.health'), conditions: hasFeature(settings as any, 'combat.conditions'), map: hasFeature(settings as any, 'combat.map') });

async function fightRow(reader: any, campaignId: string): Promise<{ id: string; state: State } | null> {
  const { data } = await reader.from('entries').select('id').eq('campaign_id', campaignId).eq('kind', 'encounter').order('created_at').limit(1).maybeSingle();
  if (!data) return null;
  const { data: sec } = await reader.from('entry_secrets').select('data').eq('entry_id', data.id).maybeSingle();
  return { id: data.id, state: cleanState(sec?.data ?? EMPTY) };
}

// A roll, as the dice system stores one (src/features/dice/server.ts): the roll everyone may be
// shown, and its dice.
async function record(admin: ReturnType<typeof createAdminClient>, ctx: CampaignCtx, r: { who: string; label: string; bonus: number; privacy: 'all' | 'dm'; byDm: boolean; character?: string | null }): Promise<number> {
  // rolled exactly as the dice system rolls, so the roll log shows it like any other roll
  const parsed = parseNotation(checkNotation(r.bonus));
  if (!parsed.ok) return 0;
  const result = rollTerms(parsed.terms, (sides) => crypto.randomInt(1, sides + 1));
  const { data } = await admin.from('rolls').insert({ campaign_id: ctx.campaign.id, user_id: ctx.user.id, character_id: r.character ?? null, who: r.who.slice(0, 80), by_dm: r.byDm, label: r.label.slice(0, 80), total: result.total, privacy: r.privacy }).select('id').single();
  if (data) await admin.from('roll_details').insert({ roll_id: data.id, campaign_id: ctx.campaign.id, user_id: ctx.user.id, notation: formatTerms(parsed.terms), dice: result.dice, modifier: result.modifier });
  return result.total;
}

async function dmCtx(slug: string) {
  if (!(await flag('hub_v2_combat'))) return null;
  const ctx = await getCampaign(slug);
  const may = ctx.isOwner || (ctx.coDm && (ctx.perms.combat || ctx.perms.edit));
  return may && !ctx.asPlayer && ctx.access.writable ? ctx : null;
}

// The DM's whole fight, for the DM's page to pick up a change a player made.
export async function getFight(slug: string): Promise<Result> {
  const ctx = await dmCtx(slug);
  if (!ctx) return { error: NOT_AVAILABLE };
  return { state: (await fightRow(ctx.supabase, ctx.campaign.id))?.state ?? EMPTY };
}

// Save the DM's fight. Creatures marked to roll initiative are rolled here, as rolls only DMs see
// (and, with `party`, the party's too, for everyone to see).
export async function saveFight(slug: string, input: unknown, opts: { party?: boolean } = {}): Promise<Result> {
  const ctx = await dmCtx(slug);
  if (!ctx) return { error: NOT_AVAILABLE };
  let s = cleanState(input);
  const admin = createAdminClient();
  const auto = hasFeature(ctx.campaign.settings, 'combat.autoroll');
  const list = [];
  for (const c of s.list) {
    if (c.roll && (c.kind !== 'pc' || opts.party)) {
      const hidden = c.kind !== 'pc' && (auto || !opts.party);
      const init = await record(admin, ctx, { who: 'DM', label: `Initiative: ${c.name}`, bonus: c.dex, privacy: hidden ? 'dm' : 'all', byDm: true });
      list.push({ ...c, init, roll: false });
    } else list.push({ ...c, roll: false });
  }
  s = { ...s, list };
  const row = { campaign_id: ctx.campaign.id, kind: 'encounter', title: s.name || 'Encounter', vis: 'all', live: true, data: publicView(s, featuresOf(ctx.campaign.settings)) };
  const found = await fightRow(ctx.supabase, ctx.campaign.id);
  let id = found?.id;
  if (id) { const r = await ctx.supabase.from('entries').update(row).eq('id', id); if (r.error) return { error: 'That did not save.' }; }
  else { const r = await ctx.supabase.from('entries').insert(row).select('id').single(); if (r.error || !r.data) return { error: 'That did not save.' }; id = r.data.id; }
  const sec = await ctx.supabase.from('entry_secrets').upsert({ entry_id: id, campaign_id: ctx.campaign.id, data: s });
  return sec.error ? { error: 'That did not save.' } : { state: s };
}

export async function endFight(slug: string): Promise<Result> {
  return saveFight(slug, { ...EMPTY });
}

// ---------------------------------------------------------------- a player's turn

export type Act = { act: 'attack' | 'spell' | 'end' | (typeof MOVES)[number][0]; target?: string; weapon?: string };
export type ActResult = { error?: string; roll?: { label: string; total: number; bonus: number } };

export async function playerAct(slug: string, a: Act): Promise<ActResult> {
  if (!(await flag('hub_v2_combat'))) return { error: NOT_AVAILABLE };
  const ctx = await getCampaign(slug);
  if (ctx.asPlayer) return { error: 'You are previewing as a player. Leave the preview to act.' };
  if (!ctx.access.writable) return { error: 'This campaign is read-only.' };
  if (!hasFeature(ctx.campaign.settings, 'combat.actions')) return { error: 'Actions are switched off in this campaign.' };
  const admin = createAdminClient();
  const fight = await fightRow(admin, ctx.campaign.id);
  if (!fight) return { error: 'No fight is running.' };
  let s = fight.state;
  const active = s.list.find((c) => c.id === s.turn);
  if (!active || active.kind !== 'pc' || !active.ref?.startsWith('c:')) return { error: 'It is not your turn.' };
  const { data: ch } = await admin.from('characters').select('id, owner, data').eq('id', active.ref.slice(2)).eq('campaign_id', ctx.campaign.id).maybeSingle();
  if (!ch || ch.owner !== ctx.user.id) return { error: 'It is not your turn.' };
  const name = active.name;
  const target = a.target ? s.list.find((c) => c.id === a.target && !c.hidden && c.id !== active.id) : undefined;
  if ((a.act === 'attack' || a.act === 'spell') && a.target && !target) return { error: 'Choose a target you can see.' };

  let roll: ActResult['roll'];
  if (a.act === 'attack' || a.act === 'spell') {
    const [entities, system] = await Promise.all([getSheetEntities(ctx, undefined, { liteSpells: true }), campaignSheetSystem(ctx)]);
    const d = derive({ ...blankV2(), ...((ch.data ?? {}) as object), v: 2 } as CharacterV2, entities as any, system?.rules);
    let bonus: number, label: string, line: string;
    if (a.act === 'spell') {
      if (!d.casting) { s = withLine(s, name, target ? `casts a spell at ${target.name}` : 'casts a spell'); bonus = NaN; label = ''; line = ''; }
      else { bonus = d.casting.attack; label = `Spell attack${target ? ' vs ' + target.name : ''}`; line = target ? `makes a spell attack against ${target.name}` : 'makes a spell attack'; }
    } else {
      // a natural weapon the rules engine knows, or a weapon attack: the better of Strength and Dexterity, plus proficiency
      const w = d.weapons.find((x) => x.name === a.weapon);
      const mods = d.mods as Record<string, number>;
      bonus = w ? w.toHit : Math.max(Number(mods.str) || 0, Number(mods.dex) || 0) + d.prof;
      label = `Attack${w ? ' (' + w.name + ')' : ''}${target ? ' vs ' + target.name : ''}`;
      line = `attacks${target ? ' ' + target.name : ''}${w ? ' with ' + w.name : ''}`;
    }
    if (label) {
      const total = await record(admin, ctx, { who: name, label, bonus, privacy: 'all', byDm: false, character: ch.id });
      roll = { label, total, bonus };
      s = withLine(s, name, `${line}: ${total}`);
    }
  } else if (a.act === 'end') {
    s = withLine(step(s, 1), name, 'ends their turn');
  } else {
    const move = MOVES.find(([id]) => id === a.act);
    if (!move) return { error: 'That is not something you can do here.' };
    s = withLine(s, name, `takes the ${move[1]} action`);
  }

  const up = await admin.from('entries').update({ data: publicView(s, featuresOf(ctx.campaign.settings)) }).eq('id', fight.id);
  const sec = await admin.from('entry_secrets').update({ data: s }).eq('entry_id', fight.id);
  if (up.error || sec.error) return { error: 'That did not save. Try again.' };
  return { roll };
}
