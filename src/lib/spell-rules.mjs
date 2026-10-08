// A spell's rules as fields the site can track, not text: data.rules on a spell entry.
// Plain JavaScript with no imports, so both the site and scripts/import-srd.mjs can use it.
//
//   time:     { n, unit: 'action' | 'bonus' | 'reaction' | 'minute' | 'hour', when }   when: a reaction's trigger
//   range:    { kind: 'self' | 'touch' | 'feet' | 'miles' | 'sight' | 'unlimited' | 'special', n }
//   area:     { shape: '' | 'sphere' | 'cone' | 'cube' | 'cylinder' | 'line' | 'emanation', size, width, height }
//   targets:  { n, what }                        n: how many ('' for not set), what: "creature", "object" ...
//   comp:     { v, s, m, material, cost, consumed }  cost in GP ('' for none)
//   duration: { kind: 'instant' | 'round' | 'minute' | 'hour' | 'day' | 'dispelled' | 'special', n, conc }
//   attack:   '' | 'melee' | 'ranged'
//   save:     { ab: '' | 'str' ... 'cha', success: 'half' | 'none' | 'other' }
//   damage:   [{ dice, type }]                   type lower case ("fire")
//   heal:     { dice, mod } | null               mod: plus the spellcasting ability modifier
//   temp:     { dice } | null                    Temporary Hit Points ("2d4 + 4" or "5")
//   conditions: ['Frightened', ...]              conditions the spell can give its targets
//   upcast:   { what: 'damage' | 'healing' | 'temp' | 'targets' | 'area' | 'duration' | 'other', add, per } | null
//             add: dice ("1d6") or a number; per: each slot level above the spell's level
//   cantrip:  { what: 'damage' | 'die' | 'beams' | 'range' | 'other', steps: [[level, value], ...] } | null
//             what a cantrip gets at character levels 5, 11 and 17

export const UNITS = [['action', 'Action'], ['bonus', 'Bonus Action'], ['reaction', 'Reaction'], ['minute', 'Minute'], ['hour', 'Hour']];
export const RANGES = [['self', 'Self'], ['touch', 'Touch'], ['feet', 'Feet'], ['miles', 'Miles'], ['sight', 'Sight'], ['unlimited', 'Unlimited'], ['special', 'Special']];
export const SHAPES = [['', 'No area'], ['sphere', 'Sphere (radius)'], ['cone', 'Cone (length)'], ['cube', 'Cube (side)'], ['cylinder', 'Cylinder (radius)'], ['line', 'Line (length)'], ['emanation', 'Emanation (distance)']];
export const DURATIONS = [['instant', 'Instantaneous'], ['round', 'Rounds'], ['minute', 'Minutes'], ['hour', 'Hours'], ['day', 'Days'], ['dispelled', 'Until dispelled'], ['special', 'Special']];
export const UPCASTS = [['damage', 'Damage'], ['healing', 'Healing'], ['temp', 'Temporary Hit Points'], ['targets', 'Targets'], ['area', 'Area size (feet)'], ['duration', 'Duration'], ['other', 'Something else (see description)']];
export const CONDITIONS = ['Blinded', 'Charmed', 'Deafened', 'Exhaustion', 'Frightened', 'Grappled', 'Incapacitated', 'Invisible', 'Paralyzed', 'Petrified', 'Poisoned', 'Prone', 'Restrained', 'Stunned', 'Unconscious'];
const ABS = { strength: 'str', dexterity: 'dex', constitution: 'con', intelligence: 'int', wisdom: 'wis', charisma: 'cha' };
const AB_NAME = { str: 'Strength', dex: 'Dexterity', con: 'Constitution', int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma' };
const WORD = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, ten: 10, twelve: 12 };
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

export const blankRules = () => ({
  time: { n: 1, unit: 'action', when: '' }, range: { kind: 'feet', n: 60 }, area: { shape: '' }, targets: { n: '', what: '' },
  comp: { v: true, s: true, m: false, material: '', cost: '', consumed: false }, duration: { kind: 'instant', n: '', conc: false },
  attack: '', save: { ab: '', success: 'half' }, damage: [], heal: null, temp: null, conditions: [], upcast: null, cantrip: null,
});

// ---------------------------------------------------------------- reading a spell's text

function parseTime(t) {
  const s = String(t ?? '').trim();
  const [head, ...rest] = s.split(/,\s*which you take\s*/i);
  const when = rest.join(', ').trim();
  const m = head.match(/^(\d+)?\s*(action|bonus action|reaction|minutes?|hours?)\b/i);
  if (!m) return { n: 1, unit: 'action', when: s && !/^action$/i.test(s) ? s : '' };
  const word = m[2].toLowerCase();
  const unit = word.startsWith('bonus') ? 'bonus' : word.startsWith('reaction') ? 'reaction' : word.startsWith('minute') ? 'minute' : word.startsWith('hour') ? 'hour' : 'action';
  return { n: Number(m[1]) || 1, unit, when };
}

function parseRange(r) {
  const s = String(r ?? '').replace(/\s*Component:.*$/i, '').trim().toLowerCase();
  const m = s.match(/^(\d+)\s*(feet|foot|ft|miles?)/);
  if (m) return { kind: m[2].startsWith('mile') ? 'miles' : 'feet', n: Number(m[1]) };
  for (const k of ['self', 'touch', 'sight', 'unlimited']) if (s.startsWith(k)) return { kind: k, n: '' };
  return { kind: 'special', n: '' };
}

function parseDuration(d, conc) {
  const s = String(d ?? '').trim().toLowerCase().replace(/^concentration,?\s*/, '');
  const m = s.match(/(\d+)\s*(round|minute|hour|day)s?/);
  if (m) return { kind: m[2], n: Number(m[1]), conc: !!conc };
  if (/instant/.test(s)) return { kind: 'instant', n: '', conc: !!conc };
  if (/until dispelled/.test(s)) return { kind: 'dispelled', n: '', conc: !!conc };
  return { kind: 'special', n: '', conc: !!conc };
}

function parseComp(comp, material) {
  const list = Array.isArray(comp) ? comp.map(String) : String(comp ?? '').split(/[,\s(]+/).filter((x) => /^[VSM]$/.test(x));
  const mat = String(material ?? (Array.isArray(comp) ? '' : String(comp ?? '').match(/\((.*)\)/)?.[1] ?? '')).trim();
  const gp = mat.match(/([\d,]+)\+?\s*GP/i);
  return { v: list.includes('V'), s: list.includes('S'), m: list.includes('M'), material: mat, cost: gp ? Number(gp[1].replace(/,/g, '')) : '', consumed: /consume/i.test(mat) };
}

function parseArea(desc) {
  const t = String(desc ?? '');
  const line = t.match(/(\d+)-foot-long,?\s*(\d+)-foot-wide Line/i);
  if (line) return { shape: 'line', size: Number(line[1]), width: Number(line[2]) };
  const cyl = t.match(/(\d+)-foot-radius,?\s*(\d+)-foot-(?:high|tall) Cylinder/i);
  if (cyl) return { shape: 'cylinder', size: Number(cyl[1]), height: Number(cyl[2]) };
  const m = t.match(/(\d+)-foot(?:-radius)?\s+(Sphere|Cone|Cube|Cylinder|Emanation|Line)/i);
  if (m) return { shape: m[2].toLowerCase(), size: Number(m[1]) };
  return { shape: '' };
}

function parseSave(desc) {
  const t = String(desc ?? '');
  const m = t.match(/(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) saving throw/);
  if (!m) return { ab: '', success: 'half' };
  const success = /half as much damage|half damage/i.test(t) ? 'half' : /damage/i.test(t) ? 'none' : 'other';
  return { ab: ABS[m[1].toLowerCase()], success };
}

function parseDamage(desc, hint) {
  const out = [];
  const seen = new Set();
  for (const m of String(desc ?? '').matchAll(/(\d+d\d+)(?:\s*\+\s*\d+)?\s+(Acid|Bludgeoning|Cold|Fire|Force|Lightning|Necrotic|Piercing|Poison|Psychic|Radiant|Slashing|Thunder) damage/g)) {
    const k = m[1] + m[2];
    if (seen.has(k) || out.length >= 3) continue;
    seen.add(k);
    out.push({ dice: m[1], type: m[2].toLowerCase() });
  }
  if (!out.length && hint?.dice) out.push({ dice: hint.dice, type: hint.type ?? '' });
  return out;
}

function parseHeal(desc) {
  const m = String(desc ?? '').match(/regains? (?:a number of )?Hit Points equal to (\d+d\d+)(\s*plus your spellcasting ability modifier)?/i);
  return m ? { dice: m[1], mod: !!m[2] } : null;
}

function parseTemp(desc) {
  const m = String(desc ?? '').match(/(?:gain|gains) (\d+d\d+(?:\s*\+\s*\d+)?|\d+) Temporary Hit Points/i);
  return m ? { dice: m[1] } : null;
}

function parseConditions(desc) {
  const t = String(desc ?? '');
  return CONDITIONS.filter((c) => new RegExp(`\\b(?:has|have|gains?|is|are|becomes?|be) (?:the )?${c} condition|\\b${c} condition`, 'i').test(t));
}

function parseUpcast(text) {
  const t = String(text ?? '');
  let m = t.match(/(damage|healing)[^.]*?increases? by (\d*d\d+|\d+) for each (?:spell )?slot level above/i);
  if (m) return { what: m[1].toLowerCase() === 'healing' ? 'healing' : 'damage', add: m[2], per: 1 };
  m = t.match(/(\d+) additional Temporary Hit Points for each (?:spell )?slot level above/i);
  if (m) return { what: 'temp', add: Number(m[1]), per: 1 };
  m = t.match(/(?:target|affect) (one|two|three|\d+) additional [^.]*? for each (?:spell )?slot level above/i);
  if (m) return { what: 'targets', add: WORD[m[1].toLowerCase()] ?? Number(m[1]), per: 1 };
  m = t.match(/(?:radius|Cube|size|Sphere's radius)[^.]*?increases? by (\d+) feet[^.]*?for each (?:spell )?slot level above/i);
  if (m) return { what: 'area', add: Number(m[1]), per: 1 };
  m = t.match(/duration increases by (\d+) (hours?|days?)[^.]*?for each (?:spell )?slot level above/i);
  if (m) return { what: 'duration', add: `${m[1]} ${m[2]}`, per: 1 };
  return /slot level|spell slot of level|level \d\+? spell slot/i.test(t) ? { what: 'other', add: '', per: 1 } : null;
}

export const CANTRIP_GROWS = [['damage', 'Damage'], ['die', 'Damage die'], ['beams', 'Beams or attacks'], ['range', 'Range'], ['other', 'Something else']];
function parseCantrip(text) {
  const t = String(text ?? '');
  const beams = t.match(/(two|three|four) beams at level 5, (two|three|four) beams at level 11, and (two|three|four|five) beams at level 17/i);
  if (beams) return { what: 'beams', steps: [[5, WORD[beams[1].toLowerCase()]], [11, WORD[beams[2].toLowerCase()]], [17, WORD[beams[3].toLowerCase()]]] };
  const m = t.match(/levels? 5 \(([^)]+)\), 11 \(([^)]+)\),? and 17 \(([^)]+)\)/);
  if (!m) return null;
  const what = /range/i.test(t.slice(Math.max(0, m.index - 60), m.index)) ? 'range' : /die changes/i.test(t) ? 'die' : 'damage';
  return { what, steps: [[5, m[1]], [11, m[2]], [17, m[3]]] };
}

// From the SRD's fields (casting_time, range, components, material, duration, concentration, attack_type,
// damage, description, higher_level) or a homebrew spell's text fields (time, range, comp, duration, conc, desc, higher).
export function parseSpell(s) {
  const desc = String(s.description ?? s.desc ?? '');
  const higher = [s.higher_level, s.higher].flat().filter(Boolean).join(' ');
  const all = desc + ' ' + higher;
  const hint = s.damage && typeof s.damage === 'object' ? { dice: Object.values(s.damage.damage_at_slot_level ?? s.damage.damage_at_character_level ?? {})[0], type: String(s.damage.damage_type?.name ?? '').toLowerCase() } : null;
  const level = Number(s.level) || 0;
  const targets = desc.match(/\b(one|two|three|up to (?:three|four|five|six|ten|twelve)) (creatures?|objects?|willing creatures?|Humanoids?|Beasts?|Undead)\b/i);
  return {
    time: parseTime(s.casting_time ?? s.time),
    range: parseRange(s.range),
    area: parseArea(desc),
    targets: targets ? { n: WORD[targets[1].toLowerCase().replace(/^up to /, '')] ?? '', what: targets[2].toLowerCase().replace(/s$/, '') } : { n: '', what: '' },
    comp: parseComp(s.components ?? s.comp, s.material),
    duration: parseDuration(s.duration, s.concentration ?? s.conc ?? /concentration/i.test(String(s.duration ?? ''))),
    attack: s.attack_type ? String(s.attack_type).toLowerCase() : /melee spell attack/i.test(desc) ? 'melee' : /ranged spell attack/i.test(desc) ? 'ranged' : '',
    save: parseSave(desc),
    damage: parseDamage(desc, hint),
    heal: parseHeal(desc),
    temp: parseTemp(desc),
    conditions: parseConditions(desc),
    upcast: level ? parseUpcast(all) : null,
    cantrip: level ? null : parseCantrip(all),
  };
}

// ---------------------------------------------------------------- writing it back as text

// The readable lines the rest of the site shows (time, range, comp, duration, damage, higher), from the rules.
export function spellText(r, level) {
  if (!r) return {};
  const t = r.time ?? {};
  const unitName = { action: 'Action', bonus: 'Bonus Action', reaction: 'Reaction', minute: 'minute', hour: 'hour' }[t.unit] ?? 'Action';
  const time = (['minute', 'hour'].includes(t.unit) ? `${t.n || 1} ${unitName}${Number(t.n) > 1 ? 's' : ''}` : unitName) + (t.when ? `, which you take ${t.when}` : '');
  const g = r.range ?? {};
  const area = r.area?.shape ? areaText(r.area) : '';
  const range = (g.kind === 'feet' ? `${g.n} feet` : g.kind === 'miles' ? `${g.n} mile${Number(g.n) === 1 ? '' : 's'}` : cap(g.kind ?? 'special')) + (area && g.kind === 'self' ? ` (${area})` : '');
  const c = r.comp ?? {};
  const comp = [c.v && 'V', c.s && 'S', c.m && 'M'].filter(Boolean).join(', ') + (c.m && c.material ? ` (${c.material})` : '');
  const d = r.duration ?? {};
  const durBase = d.kind === 'instant' ? 'Instantaneous' : d.kind === 'dispelled' ? 'Until dispelled' : d.kind === 'special' ? 'Special' : `${d.n || 1} ${d.kind}${Number(d.n) > 1 ? 's' : ''}`;
  const duration = d.conc ? `Concentration, up to ${durBase}` : durBase;
  const dmg = (r.damage ?? []).filter((x) => x.dice).map((x) => `${x.dice}${x.type ? ' ' + x.type : ''}`).join(' + ');
  const damage = [dmg, r.heal?.dice ? `heals ${r.heal.dice}${r.heal.mod ? ' + spellcasting modifier' : ''}` : '', r.temp?.dice ? `${r.temp.dice} temporary hit points` : ''].filter(Boolean).join('; ');
  return { time, range, comp, duration, conc: !!d.conc, damage, higher: upcastText(r, level) };
}

export function areaText(a) {
  if (!a?.shape) return '';
  const name = cap(a.shape);
  if (a.shape === 'line') return `${a.size}-foot-long, ${a.width || 5}-foot-wide Line`;
  if (a.shape === 'cylinder') return `${a.size}-foot-radius, ${a.height || a.size}-foot-high Cylinder`;
  if (a.shape === 'sphere') return `${a.size}-foot-radius Sphere`;
  return `${a.size}-foot ${name}`;
}

export function upcastText(r, level) {
  if (r?.cantrip?.steps?.length) return `${{ damage: 'Damage', die: 'Damage die', beams: 'Beams', range: 'Range' }[r.cantrip.what] ?? 'It grows'} at character levels ${r.cantrip.steps.map(([l, v]) => `${l} (${v})`).join(', ')}.`;
  const u = r?.upcast;
  if (!u || !u.what || u.what === 'other') return '';
  const what = { damage: 'The damage increases by', healing: 'The healing increases by', temp: 'Temporary Hit Points increase by', targets: 'You can target', area: 'The area grows by', duration: 'The duration increases by' }[u.what];
  const add = u.what === 'targets' ? `${u.add} more creature${Number(u.add) === 1 ? '' : 's'}` : u.what === 'area' ? `${u.add} feet` : u.add;
  return `${what} ${add} for each spell slot level above ${Number(level) || 1}.`;
}

// "Dexterity saving throw, half damage on a success"
export const saveText = (s) => (s?.ab ? `${AB_NAME[s.ab]} saving throw${s.success === 'half' ? ', half damage on a success' : s.success === 'none' ? ', no effect on a success' : ''}` : '');
