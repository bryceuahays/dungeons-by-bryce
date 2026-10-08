'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { FeatOption } from './ClassGives';
import { GivesEditor } from './ClassGives';
import { TraitCards, type Trait } from './TraitCards';
import { LanguagePicker } from './LanguagePicker';
import { ALL_LANGUAGES } from '@/config/proficiencies';

// A race's (species') own page, built like a class: what it is (creature type, size, speed, languages),
// then its traits as cards with the same parts as a class feature. A lineage, legacy or ancestry is
// a trait the player chooses an option of (each option with its own Gives).
//   type, size (sizes: the ones a player picks from), speed, langs: { known: [], choose }
//   features: traits [{ level, name, text, limit, use, choice, effects }]
//   languages: the same as text (written on save)

export const CREATURE_TYPES = ['Aberration', 'Beast', 'Celestial', 'Construct', 'Dragon', 'Elemental', 'Fey', 'Fiend', 'Giant', 'Humanoid', 'Monstrosity', 'Ooze', 'Plant', 'Undead'];
const SIZES = ['Tiny', 'Small', 'Medium', 'Large'];

// "Common and 2 more of your choice"
export function langText(l: any) {
  if (!l) return '';
  // the SRD's in their usual order (Common first), then your own
  const rank = (x: string) => (ALL_LANGUAGES.includes(x) ? ALL_LANGUAGES.indexOf(x) : 99);
  const known: string[] = (l.known ?? []).filter(Boolean).sort((a: string, b: string) => rank(a) - rank(b));
  const n = Number(l.choose) || 0;
  const more = n ? `${n} ${known.length ? 'more' : 'language' + (n > 1 ? 's' : '')} of your choice` : '';
  return [known.join(', '), more].filter(Boolean).join(' and ');
}

// What is saved: the languages and sizes as text too.
export function raceOut(d: any) {
  const sizes: string[] = d.sizes?.length ? d.sizes : d.size ? [d.size] : ['Medium'];
  return { ...d, sizes, size: sizes.join(' or '), ...(d.langs ? { languages: langText(d.langs) } : {}) };
}

export function RacePage({ data, setData, feats, spellNames }: { data: any; setData: (d: any) => void; feats: FeatOption[]; spellNames: string[] }) {
  const sizes: string[] = data.sizes?.length ? data.sizes : data.size ? String(data.size).split(/\s+or\s+/) : ['Medium'];
  const traits: Trait[] = (data.features ?? []).map((f: any) => ({ ...f, level: Number(f.level) || 1 }));
  const langs = data.langs ?? { known: [], choose: 0 };
  // things a race saved before traits had their own parts gave as a whole
  const loose: any[] = data.effects ?? [];
  return (
    <div className="cls-main">
      <div className="cls-row two">
        <label>Description<textarea rows={6} value={data.desc ?? ''} onChange={(e) => setData({ ...data, desc: e.target.value })} /></label>
        <div className="cls-stack">
          <label>Creature type<select value={data.type ?? 'Humanoid'} onChange={(e) => setData({ ...data, type: e.target.value })}>{CREATURE_TYPES.map((t) => <option key={t}>{t}</option>)}</select></label>
          <fieldset className="multi"><legend>Size</legend>
            {SIZES.map((s) => <label key={s} className="ckrow"><input type="checkbox" checked={sizes.includes(s)} onChange={(e) => { const next = e.target.checked ? SIZES.filter((x) => x === s || sizes.includes(x)) : sizes.filter((x) => x !== s); if (next.length) setData({ ...data, sizes: next, size: next.join(' or ') }); }} /> {s}</label>)}
          </fieldset>
          <p className="dim">{sizes.length > 1 ? `The player picks ${sizes.join(' or ')}.` : 'Tick more than one if the player picks.'}</p>
          <label>Walking speed (feet)<input type="number" min={0} max={120} step={5} value={data.speed ?? 30} onChange={(e) => setData({ ...data, speed: e.target.value === '' ? '' : Number(e.target.value) })} /></label>
        </div>
      </div>
      <fieldset className="multi col lang-box"><legend>Languages (optional)</legend>
        <LanguagePicker value={langs} onChange={(l) => setData({ ...data, langs: l })} />
        <p className="dim">In the 2024 rules a character&apos;s languages come from character creation, so species leave this empty. {langText(langs) ? `Players see: ${langText(langs)}.` : ''}</p>
      </fieldset>
      <h3>Traits</h3>
      <p className="dim">What the race gives a character, and from which character level. Click a trait to read or change it. A lineage or ancestry is a trait the player chooses an option of.</p>
      <TraitCards list={traits} onChange={(l) => setData({ ...data, features: l })} levels noun="trait" feats={feats} spellNames={spellNames} />
      {loose.length ? (
        <>
          <h3>Also given by the race</h3>
          <p className="dim">Things this race gives that are not tied to one trait (from an older version of it). They work the same as a trait&apos;s Gives.</p>
          <GivesEditor effects={loose} spellNames={spellNames} onChange={(fx) => setData({ ...data, effects: fx })} />
        </>
      ) : null}
    </div>
  );
}
