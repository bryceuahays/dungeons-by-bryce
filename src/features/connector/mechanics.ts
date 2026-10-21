/* eslint-disable @typescript-eslint/no-explicit-any */
// After an AI saves a draft: rules its words describe that the site has a structured way to track,
// but that it left as words only. The AI is told about them so it can add them with update_draft
// (the format's MECHANICS_FIRST rule, src/lib/class-import.ts, asks for this up front).

// [what the words say, the kinds of structured part that cover it, the "gives" type (or key) to use]
const CHECKS: [RegExp, string[], string][] = [
  [/\badvantage on\b/i, ['adv'], 'advantage'],
  [/\bdisadvantage on\b/i, ['dis'], 'disadvantage'],
  [/\b(resistance|immunity|immune) to (\w+ )?(acid|bludgeoning|cold|fire|force|lightning|necrotic|piercing|poison|psychic|radiant|slashing|thunder)\b/i, ['resist'], 'resistance'],
  [/\bcan't be (blinded|charmed|deafened|frightened|grappled|paralyzed|petrified|poisoned|restrained|stunned)\b|\bimmun(e|ity) to the \w+ condition\b/i, ['condition'], 'conditionImmunity'],
  [/\b(walking |climb(ing)? |swim(ming)? |fly(ing)? |burrow(ing)? )speed\b|\bspeed (increases|of \d+)/i, ['speed'], 'speed'],
  [/\b(darkvision|blindsight|tremorsense|truesight)\b/i, ['sense'], 'sense'],
  [/\battack (twice|three times|four times)\b|\bextra attack\b/i, ['attacks'], 'extraAttacks'],
  [/\b(extra|additional) \d*d\d+\b/i, ['damage', 'weapon'], 'extraDamage'],
  [/\+\d+ (bonus )?to (attack|saving|ability|damage|initiative)/i, ['bonus'], 'bonus'],
  [/\+\d+ (bonus )?to (your )?armor class\b|\barmor class increases\b/i, ['ac'], 'armorClass'],
  [/\b(gain|have) proficiency (in|with)\b|\byou are proficient (in|with)\b/i, ['prof'], 'proficiency'],
  [/\byou (can|know the|learn the) cast\b|\byou can cast\b/i, ['spell'], 'spell'],
  [/\b(when|whenever|if) you hit\b[^.]*\bsaving throw\b|\b(when|whenever|if) you hit\b[^.]*\b(has|have|is|be|becomes?) (the )?(blinded|charmed|deafened|frightened|grappled|incapacitated|paralyzed|poisoned|prone|restrained|stunned)\b/i, ['onhit'], 'onHit'],
  [/\beach creature (in|within)\b[^.]*\b(cone|radius|sphere|emanation|line|cube)\b|\b\d+-foot (cone|radius|sphere|emanation|line|cube)\b[^.]*\bsaving throw\b/i, ['area'], 'areaEffect'],
  [/\bregains? [^.]*hit points at the start of (each of )?(your|its) turns?\b/i, ['regen'], 'healingEachTurn'],
  [/\breduce (the|that|this) damage\b|\bdamage (you|it) takes? is reduced\b|\bwhenever you take damage, reduce it\b/i, ['reduce'], 'damageReduction'],
  [/\b(you|it) (become|becomes|grow|grows) (one size )?(larger|smaller|tiny|small|medium|large|huge|gargantuan)\b|\byou are (large|huge)\b|\b(your|its) size (increases|becomes)\b|\b(grows|becomes) one size (larger|smaller)\b/i, ['size'], 'size'],
  [/\bonce per (short|long) rest\b|\buntil you finish a (short|long) rest\b|\bnumber of times equal to\b|\btimes per (short|long) rest\b/i, ['uses'], 'a limited use (a resource the feature uses, or "limit")'],
];

const TEXT_KEYS = ['text', 'description', 'desc'];

// every feature, trait or benefit in an entry's data: anything with a name and words
function partsOf(data: any): any[] {
  const out: any[] = [];
  const walk = (v: any, depth: number) => {
    if (!v || typeof v !== 'object' || depth > 6) return;
    if (Array.isArray(v)) { v.forEach((x) => walk(x, depth + 1)); return; }
    // (the entry itself is not a part: its description is about the whole thing)
    if (depth > 0 && typeof v.name === 'string' && TEXT_KEYS.some((k) => typeof v[k] === 'string')) out.push(v);
    for (const [k, x] of Object.entries(v)) if (k !== 'effects') walk(x, depth + 1);
  };
  walk(data, 0);
  return out;
}

export function missedMechanics(data: any): { part: string; says: string; use: string }[] {
  const misses: { part: string; says: string; use: string }[] = [];
  for (const p of partsOf(data)) {
    const words = TEXT_KEYS.map((k) => p[k]).find((x) => typeof x === 'string') as string;
    const kinds = new Set<string>((p.effects ?? []).map((x: any) => x?.t));
    if (p.uses?.res || p.limit || p.uses?.n) kinds.add('uses');
    for (const [re, covered, use] of CHECKS) {
      if (covered.some((k) => kinds.has(k))) continue;
      const m = words.match(re);
      if (m) misses.push({ part: p.name, says: m[0], use });
    }
  }
  return misses.slice(0, 25);
}
