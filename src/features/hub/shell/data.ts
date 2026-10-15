import 'server-only';
/* eslint-disable @typescript-eslint/no-explicit-any */
import { getSheetEntities, type CampaignCtx } from '@/lib/campaign';
import { getMembers } from '@/lib/entries';
import { hasFeature } from '@/config/hub-features';
import { blankV2, derive, type CharacterV2 } from '@/lib/rules/engine';
import { campaignSheetSystem } from '@/features/systems/data';
import { DM_CHOICES, diceRules, playerChoices } from '@/features/dice/model';
import { loadDice, sealCheck } from '@/features/dice/server';

// What the character sidebar shows (Sidebar.png), worked out on the server and fetched by the
// sidebar after the page has loaded (src/app/c/[slug]/sidebar/route.ts).
//
// Only what the viewer may read: their own characters (a DM: any character in the campaign),
// read with their own login, and the rolls the database lets them see. A DM previewing as a
// player gets that player's sidebar, without the means to roll. The campaign's feature switches
// (Character sidebar in Pages and features) leave out what is switched off: it is not sent.

export type SidebarData = Awaited<ReturnType<typeof sidebarData>>;

export async function sidebarData(ctx: CampaignCtx, wanted: string | null) {
  const settings = ctx.campaign.settings;
  const on = (f: 'attributes' | 'skills' | 'tap' | 'log' | 'private') => hasFeature(settings, `sidebar.${f}`);
  const dm = ctx.realDm && !ctx.asPlayer;
  const me = ctx.asPlayer ? ctx.viewAs.player : ctx.user.id;
  const canRoll = ctx.access.writable && !ctx.asPlayer && !(ctx.headView && !ctx.realDm);

  // whose sheets: a DM sees everyone's; a player, and a preview, only their own
  let q = ctx.supabase.from('characters').select('id, owner, data').eq('campaign_id', ctx.campaign.id).order('created_at');
  if (!dm) q = q.eq('owner', me ?? '00000000-0000-0000-0000-000000000000');
  const { data: rows } = await q;
  const chars = ((rows ?? []) as { id: string; owner: string; data: any }[]);
  const names = dm ? Object.fromEntries((await getMembers(ctx)).map((m) => [m.user_id, m.display_name])) : {};
  const list = chars.map((c) => ({ id: c.id, name: String(c.data?.name || 'Unnamed'), player: names[c.owner] ?? '' }));
  const pick = chars.find((c) => c.id === wanted) ?? chars.find((c) => c.owner === me) ?? chars[0] ?? null;

  let sheet: null | {
    id: string; name: string; line: string; hp: number; hpMax: number; ac: number; speed: string; init: number; initToken: string | null; prof: number;
    abilities: { key: string; abbr: string; label: string; score: number; mod: number; token: string | null }[] | null;
    saves: { label: string; bonus: number; proficient: boolean; token: string | null }[] | null;
    skills: { name: string; bonus: number; proficient: boolean; expert: boolean; token: string | null }[] | null;
  } = null;
  if (pick) {
    const [entities, system] = await Promise.all([getSheetEntities(ctx, undefined, { liteSpells: true }), campaignSheetSystem(ctx)]);
    const c = { ...blankV2(), ...((pick.data ?? {}) as object), v: 2 } as CharacterV2;
    const d = derive(c, entities as any, system?.rules);
    const name = String(c.name || 'Unnamed');
    // a sealed check, so the browser can ask for that roll and cannot change its number
    const tap = on('tap') && canRoll;
    const seal = (label: string, bonus: number) => (tap ? sealCheck(ctx, pick.id, name, label, bonus) : null);
    const abilities = (system?.rules.abilities ?? [{ key: 'str', label: 'Strength', abbr: 'STR' }, { key: 'dex', label: 'Dexterity', abbr: 'DEX' }, { key: 'con', label: 'Constitution', abbr: 'CON' }, { key: 'int', label: 'Intelligence', abbr: 'INT' }, { key: 'wis', label: 'Wisdom', abbr: 'WIS' }, { key: 'cha', label: 'Charisma', abbr: 'CHA' }]) as { key: string; label: string; abbr: string }[];
    sheet = {
      id: pick.id, name,
      line: [c.race, c.cls, `Level ${d.level}`].filter(Boolean).join(' · '),
      hp: c.hp == null ? d.hpMax : Number(c.hp), hpMax: d.hpMax, ac: Number(d.ac) || 10, speed: d.speed.walk ? d.speed.walk + ' ft' : '', init: d.initiative, initToken: seal('Initiative', d.initiative), prof: d.prof,
      abilities: on('attributes') ? abilities.map((a) => ({ key: a.key, abbr: a.abbr || a.key.toUpperCase(), label: a.label, score: Number((d.scores as any)[a.key]) || 0, mod: Number((d.mods as any)[a.key]) || 0, token: seal(`${a.label} check`, Number((d.mods as any)[a.key]) || 0) })) : null,
      saves: on('attributes') ? d.saves.map((s) => ({ label: s.label, bonus: s.bonus, proficient: s.proficient, token: seal(`${s.label} save`, s.bonus) })) : null,
      skills: on('skills') ? d.skills.map((s) => ({ name: s.name, bonus: s.bonus, proficient: s.proficient, expert: s.expert, token: seal(s.name, s.bonus) })) : null,
    };
  }

  const rules = diceRules(settings);
  const log = on('log') ? (await loadDice(ctx)).rolls.slice(0, 8) : null;
  return {
    dm, me, canRoll, characters: list, sheet, log,
    choices: dm ? DM_CHOICES.filter((c) => c !== 'players') : playerChoices(rules, on('private')),
    startPrivacy: dm && rules.dmHidden ? 'dm' : 'all',
  };
}
