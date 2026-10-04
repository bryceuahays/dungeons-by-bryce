// The character JSON shape and the old "TBG1:" character codes.
// Lifted from source/player-guide/index.html (blank, normalize, readCode). Keep the shape.
// One change: the fields a campaign keeps private until a later phase are not written
// here. The server names them (opts.privateKeys) only when the viewer may see them, and
// the database stores them apart from the sheet (character_private).

export const ABS = [['str', 'Strength'], ['dex', 'Dexterity'], ['con', 'Constitution'], ['int', 'Intelligence'], ['wis', 'Wisdom'], ['cha', 'Charisma']];
export const SKILLS = [['Acrobatics', 'dex'], ['Animal Handling', 'wis'], ['Arcana', 'int'], ['Athletics', 'str'], ['Deception', 'cha'], ['History', 'int'], ['Insight', 'wis'], ['Intimidation', 'cha'], ['Investigation', 'int'], ['Medicine', 'wis'], ['Nature', 'int'], ['Perception', 'wis'], ['Performance', 'cha'], ['Persuasion', 'cha'], ['Religion', 'int'], ['Sleight of Hand', 'dex'], ['Stealth', 'dex'], ['Survival', 'wis']];
export const CATS = [['Attack', 'Attacks'], ['Ability', 'Abilities'], ['Spell', 'Spells'], ['Item', 'Items'], ['Other', 'Other']];

export const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const num = (v) => { const n = parseInt(v, 10); return isNaN(n) ? 0 : n; };
export const sgn = (n) => (n >= 0 ? '+' : '') + n;

export const blank = () => ({ t: 0, name: '', player: '', race: '', cls: '', level: 1, ab: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }, sv: {}, sk: {}, ac: 10, hpMax: 10, hp: 10, temp: 0, speed: '30 ft', hd: '', acts: 1, bonus: 1, react: 1, atk: 1, card: { go: '', sig: '', emg: '' }, options: [], gear: '', notes: '' });

export function normalize(o) {
  o = o || {};
  const c = Object.assign(blank(), o);
  c.ab = Object.assign(blank().ab, o.ab || {});
  c.sv = o.sv || {};
  c.sk = o.sk || {};
  c.card = Object.assign(blank().card, o.card || {});
  c.options = Array.isArray(o.options) ? o.options : [];
  return c;
}

// Decoder for the codes the old builder and player guide produced.
export function readCode(t) {
  t = String(t || '').replace(/\s+/g, '');
  if (t.indexOf('TBG1:') !== 0) throw new Error('bad');
  const o = JSON.parse(decodeURIComponent(escape(atob(t.slice(5)))));
  if (!o || typeof o !== 'object' || !o.ab) throw new Error('bad');
  return o;
}

// Bringing a sheet in from a code or from the builder keeps what the player already
// recorded in the private fields, exactly as the player guide's import did.
export function mergeImport(current, incoming, keys) {
  const c = normalize(incoming);
  (keys || []).forEach((k) => { if (!c[k] && current[k]) c[k] = current[k]; });
  return c;
}
