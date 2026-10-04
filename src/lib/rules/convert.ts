// The edition converter: takes a stat block, spell or item typed in by the DM from an
// older edition they own, and turns its numbers into fifth edition math using the
// tables in src/config/editions.ts. Every change is listed so the DM can see and adjust it.
// Pure functions: the page and the tests use the same code.

/* eslint-disable @typescript-eslint/no-explicit-any */
import { CR_STEPS, EDITIONS, HIT_DIE, OLD_DURATIONS, THIRD_AC, crLabel, guessAttackMod, profByCr, type EditionId } from '../../config/editions.ts';

const num = (v: unknown) => { const n = parseFloat(String(v ?? '').replace(/[^0-9.+-]/g, '')); return Number.isFinite(n) ? n : NaN; };
const mod = (score: number) => Math.floor((score - 10) / 2);
const sgn = (n: number) => (n >= 0 ? '+' : '') + n;
const nearestCr = (n: number) => CR_STEPS.reduce((best, c) => (Math.abs(c - n) < Math.abs(best - n) ? c : best), 0);

export type Converted = { type: 'monster' | 'spell' | 'item'; name: string; data: Record<string, any>; changes: string[] };

export type MonsterInput = {
  name: string; edition: EditionId; size?: string; mtype?: string;
  power?: string;        // hit dice, challenge rating, or level, depending on the edition
  role?: string;         // 4th edition: minion, standard, elite, solo
  ac?: string; hp?: string; attack?: string; speed?: string;
  str?: string; dex?: string; con?: string; int?: string; wis?: string; cha?: string;
  fort?: string; ref?: string; will?: string;
  attacks?: string;      // one per line: "Bite | 1d8+2 piercing"
  special?: string;      // free text, kept as traits
  saveAbility?: string;  // which ability its special attacks force a save against
};

export function convertMonster(i: MonsterInput): Converted {
  const ed = EDITIONS[i.edition];
  const changes: string[] = [];
  const size = i.size || 'Medium';
  const power = num(i.power);

  // 1. challenge rating
  let crRaw = Number.isFinite(power) ? power * ed.crPerPower : 1;
  if (i.edition === 'fourth') crRaw *= i.role === 'minion' ? 0.25 : i.role === 'elite' ? 1.5 : i.role === 'solo' ? 2.2 : 1;
  const cr = nearestCr(crRaw);
  const prof = profByCr(cr);
  changes.push(Number.isFinite(power)
    ? `${ed.powerLabel} ${i.power}${i.edition === 'fourth' && i.role && i.role !== 'standard' ? ` (${i.role})` : ''} becomes challenge rating ${crLabel(cr)}, which sets a proficiency bonus of +${prof}.`
    : `No ${ed.powerLabel.toLowerCase()} was given, so challenge rating ${crLabel(cr)} is a guess. Set it by hand.`);

  // 2. ability scores
  const given = ['str', 'dex', 'con', 'int', 'wis', 'cha'].filter((k) => Number.isFinite(num((i as any)[k])));
  const ab: Record<string, number> = { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 };
  if (given.length) {
    given.forEach((k) => { ab[k] = Math.max(1, Math.min(30, Math.round(num((i as any)[k])))); });
    if (given.some((k) => num((i as any)[k]) > 30)) changes.push('Ability scores above 30 are capped at 30.');
  } else {
    const m = guessAttackMod(cr);
    ab.str = 10 + m * 2; ab.con = 10 + Math.max(1, m - 1) * 2;
    changes.push(`The original gives no ability scores. Strength ${ab.str} and Constitution ${ab.con} are estimated from the challenge rating; the rest are left at 10.`);
  }
  const atkMod = Math.max(mod(ab.str), mod(ab.dex));

  // 3. armor class
  let acv = num(i.ac);
  if (Number.isFinite(acv)) {
    const old = acv;
    if (ed.ac === 'descending') { acv = ed.acBase - old; changes.push(`Descending armor class ${old} becomes ${acv} (${ed.acBase} minus ${old}).`); }
    else if (i.edition === 'third' && old > THIRD_AC.keepUpTo) { acv = Math.round(THIRD_AC.keepUpTo + (old - THIRD_AC.keepUpTo) * THIRD_AC.carry); changes.push(`Armor class ${old} is brought down to ${acv}: fifth edition armor class rises far more slowly.`); }
    else if (i.edition === 'fourth') { acv = 12 + Math.round(cr / 3) + (old - (Number.isFinite(power) ? power + 14 : old)); changes.push(`Armor class ${old} (which rises with level) becomes ${acv}.`); }
    const clamped = Math.max(5, Math.min(i.edition === 'third' ? THIRD_AC.cap : 25, Math.round(acv)));
    if (clamped !== acv) changes.push(`Armor class is kept within fifth edition's range: ${clamped}.`);
    acv = clamped;
  } else { acv = 10 + mod(ab.dex); changes.push(`No armor class was given, so it is 10 plus the Dexterity modifier: ${acv}.`); }

  // 4. hit points
  const die = HIT_DIE[size] ?? 8;
  const oldHp = num(i.hp);
  let hpv: number, hdv = '';
  if ((i.edition === 'basic' || i.edition === 'advanced') && Number.isFinite(power) && power >= 1) {
    const n = Math.round(power), con = mod(ab.con);
    hpv = Math.max(1, Math.floor(n * (die + 1) / 2) + n * con);
    hdv = `${n}d${die}${con ? (con > 0 ? '+' : '') + n * con : ''}`;
    changes.push(`${n} hit dice become ${hdv} (a d${die} for a ${size.toLowerCase()} creature, plus Constitution): ${hpv} hit points${Number.isFinite(oldHp) ? `, up from ${oldHp}` : ''}.`);
  } else if (Number.isFinite(oldHp)) {
    hpv = Math.max(1, Math.round(oldHp * ed.hpFactor));
    const con = mod(ab.con), n = Math.max(1, Math.round(hpv / ((die + 1) / 2 + con)));
    hdv = `${n}d${die}${con ? (con > 0 ? '+' : '') + n * con : ''}`;
    changes.push(ed.hpFactor === 1 ? `Hit points stay at ${hpv}, written as ${hdv}.` : `Hit points ${oldHp} become ${hpv} (x${ed.hpFactor}), written as ${hdv}.`);
  } else { hpv = Math.max(1, Math.round((cr || 0.25) * 15 + 5)); changes.push(`No hit points were given, so ${hpv} is an estimate for the challenge rating.`); }

  // 5. attack bonus
  const toHit = prof + atkMod;
  const oldAtk = num(i.attack);
  if (Number.isFinite(oldAtk)) changes.push(ed.attack === 'thac0'
    ? `THAC0 ${oldAtk} (which is ${sgn(20 - oldAtk)} to hit) becomes ${sgn(toHit)} to hit: proficiency +${prof} and the ability modifier ${sgn(atkMod)}.`
    : `Attack bonus ${sgn(oldAtk)} becomes ${sgn(toHit)} to hit: proficiency +${prof} and the ability modifier ${sgn(atkMod)}.`);
  else changes.push(`Attacks are ${sgn(toHit)} to hit: proficiency +${prof} and the ability modifier ${sgn(atkMod)}.`);

  // 6. saves
  let msaves = '';
  const saveAb = (i.saveAbility || 'con').toLowerCase();
  const dc = 8 + prof + Math.max(mod(ab[saveAb] ?? 10), atkMod);
  if (ed.saves === 'fort-ref-will') {
    const good = (v: string | undefined) => Number.isFinite(num(v)) && Number.isFinite(power) && num(v) >= power / 2 + 2;
    const list = [['con', i.fort, 'Fortitude'], ['dex', i.ref, 'Reflex'], ['wis', i.will, 'Will']].filter(([, v]) => good(v as string));
    msaves = list.map(([k]) => `${String(k)[0].toUpperCase() + String(k).slice(1)} ${sgn(mod(ab[k as string]) + prof)}`).join(', ');
    if (list.length) changes.push(`Its strong saves (${list.map((l) => l[2]).join(', ')}) become proficiency in ${list.map((l) => ({ con: 'Constitution', dex: 'Dexterity', wis: 'Wisdom' }[l[0] as string])).join(', ')} saving throws.`);
  } else if (ed.saves === 'categories') changes.push('The old saving throw categories are dropped. It saves with its ability modifiers, like any fifth edition creature.');
  else changes.push('Fortitude, Reflex and Will defenses are dropped. It saves with its ability modifiers.');
  changes.push(`Anything it does that calls for a saving throw uses DC ${dc} (8 + proficiency + ability modifier).`);

  // 7. speed
  let mspeed = '30 ft.';
  const sp = num(i.speed);
  if (Number.isFinite(sp)) { const feet = Math.max(5, ed.speed.toFeet(sp)); mspeed = feet + ' ft.'; if (feet !== sp) changes.push(`Speed ${i.speed} (${ed.speed.unit}) becomes ${feet} feet.`); }

  // 8. attacks: keep the dice, replace the flat bonus with the ability modifier
  const actions = String(i.attacks || '').split('\n').map((l) => l.trim()).filter(Boolean).map((line) => {
    const [n, rest = ''] = line.split('|').map((s) => s.trim());
    const m = /(\d+)d(\d+)(?:\s*([+-])\s*(\d+))?\s*(.*)/.exec(rest);
    if (!m) return { name: n, text: `Melee weapon attack: ${sgn(toHit)} to hit. Hit: ${rest || 'see description'}.` };
    const avg = Math.floor(Number(m[1]) * (Number(m[2]) + 1) / 2) + atkMod;
    return { name: n, text: `Melee weapon attack: ${sgn(toHit)} to hit. Hit: ${avg} (${m[1]}d${m[2]}${atkMod ? (atkMod > 0 ? '+' : '') + atkMod : ''}) ${m[5] || 'damage'}${/damage/.test(m[5] || '') ? '' : m[5] ? ' damage' : ''}.` };
  });
  if (actions.length) changes.push('Each attack keeps its damage dice. Flat damage bonuses are replaced by the ability modifier.');
  const traits = String(i.special || '').split('\n').map((l) => l.trim()).filter(Boolean).map((l) => { const k = l.indexOf(':'); return k > 0 ? { name: l.slice(0, k).trim(), text: l.slice(k + 1).trim() } : { name: 'Special', text: l }; });
  if (traits.length) changes.push(`Special abilities are carried over as written. Where one forces a save, use DC ${dc}.`);

  return { type: 'monster', name: i.name, changes, data: { size, mtype: i.mtype || 'Monstrosity', acv, hpv, hdv, mspeed, ab, cr: crLabel(cr), msaves, traits, actions, desc: '' } };
}

export type SpellInput = { name: string; edition: EditionId; level?: string; range?: string; duration?: string; damage?: string; save?: string; text?: string; school?: string };

export function convertSpell(i: SpellInput): Converted {
  const ed = EDITIONS[i.edition];
  const changes: string[] = [];
  const old = num(i.level);
  const level = Number.isFinite(old) ? ed.spellLevel(old) : 1;
  if (Number.isFinite(old) && level !== old) changes.push(i.edition === 'fourth' ? `A level ${old} power becomes a spell of level ${level} (one spell level per three power levels, up to 9).` : `Level ${old} is capped at ${level}.`);
  let range = i.range || '';
  const r = num(i.range);
  if (Number.isFinite(r) && ed.rangeUnit !== 'feet') { const feet = ed.rangeToFeet(r); range = feet + ' feet'; changes.push(`Range ${i.range} (${ed.rangeUnit}) becomes ${feet} feet.`); }
  else if (Number.isFinite(r) && !/[a-z]/i.test(String(i.range))) range = r + ' feet';
  let duration = i.duration || 'Instantaneous';
  for (const [re, to] of OLD_DURATIONS) if (re.test(duration)) { const now = duration.replace(re, to).replace(/(\d+) x 10 minutes/, (_, n) => Number(n) * 10 + ' minutes'); changes.push(`Duration "${duration}" becomes "${now}".`); duration = now; break; }
  let damage = i.damage || '';
  const per = /(\d+)d(\d+)\s*(?:per|\/)\s*(?:caster\s*)?level(?:.*?max(?:imum)?\s*(\d+)d)?/i.exec(damage);
  if (per) {
    const diceAt = Math.max(1, Math.min(Number(per[3]) || 10, level === 0 ? 1 : level + 2)) * Number(per[1]);
    const fixed = `${diceAt}d${per[2]}`;
    changes.push(`Damage that grew with caster level (${damage}) becomes a fixed ${fixed} at spell level ${level}, plus ${per[1]}d${per[2]} for each slot level above that.`);
    damage = fixed;
  }
  const save = String(i.save || '').trim();
  let saveLine = '';
  if (save) {
    const map: [RegExp, string][] = [[/fort|poison|death|paraly/i, 'Constitution'], [/ref|breath|dodge|wand/i, 'Dexterity'], [/will|spell|mind|charm/i, 'Wisdom'], [/str/i, 'Strength'], [/dex/i, 'Dexterity'], [/con/i, 'Constitution'], [/int/i, 'Intelligence'], [/wis/i, 'Wisdom'], [/cha/i, 'Charisma']];
    const to = (map.find(([re]) => re.test(save)) ?? [null, 'Dexterity'])[1];
    saveLine = `The target makes a ${to} saving throw against your spell save DC.`;
    changes.push(`"${save}" becomes a ${to} saving throw against the caster's spell save DC (8 + proficiency bonus + spellcasting modifier).`);
  }
  const conc = /^Concentration/.test(duration);
  if (conc) changes.push('A spell that lasts needs concentration in fifth edition.');
  if (!changes.length) changes.push('Nothing needed changing: the numbers already fit fifth edition.');
  return { type: 'spell', name: i.name, changes, data: { level, school: i.school || 'Evocation', time: '1 action', range: range || 'Self', comp: 'V, S', duration, conc, damage, desc: [i.text, saveLine].filter(Boolean).join('\n\n'), higher: per ? `The damage increases by ${per[1]}d${per[2]} for each slot level above ${level}.` : '' } };
}

export type ItemInput = { name: string; edition: EditionId; kind?: string; bonus?: string; ac?: string; charges?: string; text?: string };

export function convertItem(i: ItemInput): Converted {
  const ed = EDITIONS[i.edition];
  const changes: string[] = [];
  let bonus = num(i.bonus);
  const parts: string[] = [];
  if (Number.isFinite(bonus) && bonus) {
    if (bonus > ed.maxItemBonus) { changes.push(`A +${bonus} bonus is capped at +${ed.maxItemBonus}, the most fifth edition gives.`); bonus = ed.maxItemBonus; }
    parts.push(i.kind === 'Armor' ? `You have a +${bonus} bonus to AC while wearing this armor.` : `You have a +${bonus} bonus to attack and damage rolls made with this magic weapon.`);
  }
  const rarity = !Number.isFinite(bonus) || !bonus ? 'Uncommon' : bonus >= 3 ? 'Very rare' : bonus === 2 ? 'Rare' : 'Uncommon';
  if (Number.isFinite(bonus) && bonus) changes.push(`A +${bonus} item is ${rarity.toLowerCase()} in fifth edition.`);
  let ac = '';
  const oldAc = num(i.ac);
  if (Number.isFinite(oldAc)) {
    if (ed.ac === 'descending') { ac = String(ed.acBase - oldAc); changes.push(`Descending armor class ${oldAc} becomes ${ac}.`); }
    else ac = String(oldAc);
  }
  const charges = num(i.charges);
  if (Number.isFinite(charges) && charges > 0) {
    const cap = Math.min(charges, 20), back = cap <= 7 ? '1d6 + 1' : '2d8 + 4';
    parts.push(`It has ${cap} charges and regains ${back} expended charges daily at dawn.`);
    changes.push(charges > 20 ? `${charges} charges become 20, and the item now regains charges at dawn instead of running out for good.` : 'Charges now come back at dawn instead of running out for good.');
  }
  if (!changes.length) changes.push('Nothing needed changing: the numbers already fit fifth edition.');
  return { type: 'item', name: i.name, changes, data: { kind: i.kind || 'Magic item', rarity, attune: Number.isFinite(bonus) && bonus >= 2, ac, desc: [parts.join(' '), i.text].filter(Boolean).join('\n\n') } };
}
