'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
import { ABILITIES } from '@/lib/rules/engine';
import { SKILL_NAMES } from '@/config/homebrew';
import { ALL_LANGUAGES } from '@/config/proficiencies';
import { equipLine } from '@/lib/class-equip';
import type { FeatOption } from './ClassGives';
import { ToolsBox } from './ClassProfs';
import { StartEquipBox } from './ClassEquip';
import { LanguagePicker } from './LanguagePicker';
import { TraitCards, type Trait } from './TraitCards';

// A background's own page, built like the class page: the 2024 recipe as fields.
//   abilities: the three a player raises (+2 and +1, or +1 to all three; none above 20)
//   feat: { name, note }                 the Origin feat it gives ("Magic Initiate", note "Cleric")
//   skills: [..]                         skill proficiencies
//   toolItems, toolChoice: { n, from }   tool proficiencies (the class editor's tools box)
//   langs: { known, choose }             optional; 2024 backgrounds give none
//   startEquip: [{ items, gp }]          packages the player picks one of (usually items, or 50 GP)
//   features: other benefits, as trait cards (older backgrounds have one)
// Written on save: effects (skills, tools, ability increases) for the sheet, and the text the card shows.

const AB = Object.fromEntries(ABILITIES) as Record<string, string>;

export function backgroundOut(d: any) {
  const abilities: string[] = d.abilities ?? [];
  const skills: string[] = d.skills ?? [];
  const tools: string[] = d.toolItems ?? [];
  const { armor: _a, weapons: _w, armorTraining: _t, weaponCats: _c, weaponItems: _i, ...rest } = d;
  const known: string[] = d.langs?.known ?? [];
  const rank = (x: string) => (ALL_LANGUAGES.includes(x) ? ALL_LANGUAGES.indexOf(x) : 99);
  const langs = [...known].sort((a, b) => rank(a) - rank(b)).join(', ') + (Number(d.langs?.choose) ? `${known.length ? ' and ' : ''}${d.langs.choose} of your choice` : '');
  return {
    ...rest,
    toolProfs: d.tools ?? d.toolProfs ?? '',
    ...(d.langs ? { languages: langs } : {}),
    ...(Array.isArray(d.startEquip) ? { equipment: equipLine(d.startEquip) } : {}),
    // the sheet: each skill and tool, and three increases of the player's choice among the three abilities
    // (picking the same one twice makes the +2)
    effects: [
      ...skills.map((v) => ({ t: 'prof', kind: 'skill', v })),
      ...tools.map((v) => ({ t: 'prof', kind: 'tool', v })),
      ...(abilities.length ? [1, 2, 3].map(() => ({ t: 'ability', ab: 'any', n: 1, among: abilities, max: 20 })) : []),
    ],
  };
}

export function BackgroundPage({ data, setData, feats, spellNames, items }: { data: any; setData: (d: any) => void; feats: FeatOption[]; spellNames: string[]; items: string[] }) {
  const abilities: string[] = data.abilities ?? [];
  const skills: string[] = data.skills ?? [];
  const feat = data.feat ?? { name: '', note: '' };
  const origin = feats.filter((f) => f.category.toLowerCase() === 'origin');
  const others = feats.filter((f) => f.category.toLowerCase() !== 'origin');
  // the tools box reads the tools text of a background saved before it existed
  const toolData = { ...data, tools: data.tools ?? data.toolProfs ?? '' };
  return (
    <div className="cls-main">
      <div className="cls-row two">
        <label>Description<textarea rows={6} value={data.desc ?? ''} onChange={(e) => setData({ ...data, desc: e.target.value })} /></label>
        <div className="cls-stack">
          <fieldset className="multi"><legend>Ability scores</legend>
            {ABILITIES.map(([k, l]) => <label key={k} className="ckrow"><input type="checkbox" checked={abilities.includes(k)} onChange={(e) => setData({ ...data, abilities: e.target.checked ? ABILITIES.map(([x]) => x).filter((x) => x === k || abilities.includes(x)) : abilities.filter((x) => x !== k) })} /> {l}</label>)}
          </fieldset>
          <p className="dim">{abilities.length ? `The player raises ${abilities.map((a) => AB[a]).join(', ')}: one by 2 and another by 1, or all three by 1 (none above 20).` : 'Tick the three abilities a player of this background can raise.'}{abilities.length && abilities.length !== 3 ? ' 2024 backgrounds list three.' : ''}</p>
          <label>Origin feat<select value={feat.name} onChange={(e) => setData({ ...data, feat: { ...feat, name: e.target.value } })}>
            <option value="">None</option>
            <optgroup label="Origin feats">{origin.map((f) => <option key={f.name}>{f.name}</option>)}</optgroup>
            {others.length ? <optgroup label="Other feats">{others.map((f) => <option key={f.name}>{f.name}</option>)}</optgroup> : null}
            {feat.name && !feats.some((f) => f.name === feat.name) ? <option>{feat.name}</option> : null}
          </select></label>
          {feat.name ? <label>Which version<input value={feat.note ?? ''} maxLength={60} placeholder="For example: Cleric (the spell list for Magic Initiate)" onChange={(e) => setData({ ...data, feat: { ...feat, note: e.target.value } })} /></label> : null}
        </div>
      </div>
      <div className="cls-row two">
        <fieldset className="multi"><legend>Skill proficiencies</legend>
          {SKILL_NAMES.map((s) => <label key={s} className="ckrow"><input type="checkbox" checked={skills.includes(s)} onChange={(e) => setData({ ...data, skills: e.target.checked ? SKILL_NAMES.filter((x) => x === s || skills.includes(x)) : skills.filter((x) => x !== s) })} /> {s}</label>)}
          <p className="dim hint" style={{ flexBasis: '100%', margin: '4px 0 0' }}>{skills.length ? `Gives ${skills.join(' and ')}.` : 'Tick the skills it gives (2024 backgrounds give two).'}</p>
        </fieldset>
        <ToolsBox data={toolData} onChange={setData} />
      </div>
      <fieldset className="multi col lang-box"><legend>Languages (optional)</legend>
        <LanguagePicker value={data.langs ?? { known: [], choose: 0 }} onChange={(l) => setData({ ...data, langs: l })} />
        <p className="dim">In the 2024 rules a character&apos;s languages come from character creation, so backgrounds leave this empty.</p>
      </fieldset>
      <div className="cls-row two">
        <StartEquipBox data={data} onChange={setData} items={items} />
        <div />
      </div>
      <h3>Other benefits</h3>
      <p className="dim">Anything else it gives, as cards like a race&apos;s traits. 2024 backgrounds have none; older ones have a feature like Shelter of the Faithful.</p>
      <TraitCards list={(data.features ?? []) as Trait[]} onChange={(l) => setData({ ...data, features: l })} levels={false} noun="benefit" feats={feats} spellNames={spellNames} />
    </div>
  );
}
