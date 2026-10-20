'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
import { ARMOR, TOOL_CHOICES, TOOL_GROUPS, WEAPONS, WEAPON_CATS } from '@/config/proficiencies';

// The editor for a class's armor, weapon and tool training (src/lib/class-profs.ts holds the
// choices' shape and the readable text written from them).

export { readProfs, writeProfs, type Profs } from '@/lib/class-profs';
import { readProfs, writeProfs, type Profs } from '@/lib/class-profs';

const toggle = (arr: string[], v: string, on: boolean) => (on ? [...arr, v] : arr.filter((x) => x !== v));

function Chips({ items, onRemove }: { items: string[]; onRemove: (v: string) => void }) {
  if (!items.length) return null;
  return <p className="chips">{items.map((v) => <span key={v} className="chip">{v}<button type="button" aria-label={'Remove ' + v} onClick={() => onRemove(v)}>✕</button></span>)}</p>;
}

export function ArmorBox({ data, onChange }: { data: any; onChange: (d: any) => void }) {
  const p = readProfs(data);
  return (
    <fieldset className="multi col"><legend>Armor training</legend>
      {ARMOR.map(([k, l]) => <label key={k} className="ckrow"><input type="checkbox" checked={p.armorTraining.includes(k)} onChange={(e) => onChange(writeProfs(data, { ...p, armorTraining: toggle(p.armorTraining, k, e.target.checked) }))} /> {l}</label>)}
    </fieldset>
  );
}

export function WeaponsBox({ data, onChange }: { data: any; onChange: (d: any) => void }) {
  const p = readProfs(data);
  const put = (q: Partial<Profs>) => onChange(writeProfs(data, { ...p, ...q }));
  return (
    <fieldset className="multi col"><legend>Weapon proficiencies</legend>
      {WEAPON_CATS.map(([k, l]) => <label key={k} className="ckrow"><input type="checkbox" checked={p.weaponCats.includes(k)} onChange={(e) => put({ weaponCats: toggle(p.weaponCats, k, e.target.checked) })} /> {l}</label>)}
      <select aria-label="Add a weapon" value="" onChange={(e) => e.target.value && put({ weaponItems: [...p.weaponItems, e.target.value] })}>
        <option value="">Add a specific weapon…</option>
        {(['simple', 'martial'] as const).map((g) => (
          <optgroup key={g} label={g === 'simple' ? 'Simple' : 'Martial'}>
            {WEAPONS[g].filter((w) => !p.weaponItems.includes(w)).map((w) => <option key={w} value={w}>{w}</option>)}
          </optgroup>
        ))}
      </select>
      <Chips items={p.weaponItems} onRemove={(v) => put({ weaponItems: p.weaponItems.filter((x) => x !== v) })} />
    </fieldset>
  );
}

export function ToolsBox({ data, onChange }: { data: any; onChange: (d: any) => void }) {
  const p = readProfs(data);
  const put = (q: Partial<Profs>) => onChange(writeProfs(data, { ...p, ...q }));
  return (
    <fieldset className="multi col"><legend>Tool proficiencies</legend>
      <select aria-label="Add a tool" value="" onChange={(e) => e.target.value && put({ toolItems: [...p.toolItems, e.target.value] })}>
        <option value="">Add a tool…</option>
        {Object.entries(TOOL_GROUPS).map(([g, tools]) => (
          <optgroup key={g} label={g}>{tools.filter((t) => !p.toolItems.includes(t)).map((t) => <option key={t} value={t}>{t}</option>)}</optgroup>
        ))}
      </select>
      <Chips items={p.toolItems} onRemove={(v) => put({ toolItems: p.toolItems.filter((x) => x !== v) })} />
      <label className="ckrow">Player also chooses
        <input type="number" min={0} max={9} style={{ width: 60 }} value={p.toolChoice.n} onChange={(e) => put({ toolChoice: { ...p.toolChoice, n: Math.max(0, Number(e.target.value) || 0) } })} />
      </label>
      {p.toolChoice.n > 0 ? (
        <label>from<select value={p.toolChoice.from} onChange={(e) => put({ toolChoice: { ...p.toolChoice, from: e.target.value } })}>{TOOL_CHOICES.map((c) => <option key={c} value={c}>{c}</option>)}</select></label>
      ) : null}
    </fieldset>
  );
}

// The character sheet takes saving throw proficiency from the class's effects, so the Main tab's
// saving throw boxes are copied into them on save (replacing whatever save effects were there).
export function syncSaves(data: any) {
  const others = (data.effects ?? []).filter((x: any) => !(x.t === 'prof' && x.kind === 'save'));
  return { ...data, effects: [...(data.saves ?? []).map((v: string) => ({ t: 'prof', kind: 'save', v })), ...others] };
}
