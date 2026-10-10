'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
import { ABILITIES } from '@/lib/rules/engine';
import { ARMOR, WEAPON_CATS } from '@/config/proficiencies';
import { readProfs } from './ClassProfs';
import { LETTER, type Pkg } from '@/lib/class-equip';

// The class's Main tab, under its proficiencies: starting equipment and multiclassing.
//   startEquip: [{ items: [{ name, count }], gp }]  packages; the player picks one (2024 rules)
//   multiclass: { req: [{ ab, min }], join: 'and' | 'or', armor, weaponCats, toolItems, skills, tools }

export function StartEquipBox({ data, onChange, items }: { data: any; onChange: (d: any) => void; items: string[] }) {
  const pkgs: Pkg[] = Array.isArray(data.startEquip) ? data.startEquip : [];
  const put = (next: Pkg[]) => onChange({ ...data, startEquip: next });
  const setPkg = (i: number, p: Partial<Pkg>) => put(pkgs.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const setItem = (i: number, k: number, it: Partial<Pkg['items'][number]>) => setPkg(i, { items: pkgs[i].items.map((x, j) => (j === k ? { ...x, ...it } : x)) });
  return (
    <fieldset className="multi col equip-box"><legend>Starting equipment</legend>
      <p className="dim">{pkgs.length > 1 ? 'The player picks one of these packages.' : pkgs.length ? 'Add a second package (often just gold) to give the player a choice.' : 'What a character of this class starts with. Add packages; the player picks one.'}</p>
      <datalist id="equip-items">{items.map((n) => <option key={n} value={n} />)}</datalist>
      {pkgs.map((p, i) => (
        <div key={i} className="equip-pkg">
          <div className="equip-pkg-head"><b>Package {LETTER[i]}</b><button type="button" className="quiet small-btn danger" onClick={() => put(pkgs.filter((_, j) => j !== i))}>Remove package</button></div>
          {p.items.map((it, k) => (
            <div key={k} className="equip-item">
              <input type="number" min={1} max={999} aria-label="How many" value={it.count} onChange={(e) => setItem(i, k, { count: e.target.value === '' ? '' : Number(e.target.value) })} />
              <input list="equip-items" aria-label="Item" value={it.name} placeholder="Start typing an item" onChange={(e) => setItem(i, k, { name: e.target.value })} />
              <button type="button" className="quiet small-btn" aria-label={'Remove ' + (it.name || 'item')} onClick={() => setPkg(i, { items: p.items.filter((_, j) => j !== k) })}>✕</button>
            </div>
          ))}
          <div className="equip-foot">
            <button type="button" className="quiet small-btn" onClick={() => setPkg(i, { items: [...p.items, { name: '', count: 1 }] })}>+ Add an item</button>
            <label className="equip-gp">Gold<input type="number" min={0} max={99999} value={p.gp} onChange={(e) => setPkg(i, { gp: e.target.value === '' ? '' : Number(e.target.value) })} /> GP</label>
          </div>
        </div>
      ))}
      <p><button type="button" className="quiet small-btn" onClick={() => put([...pkgs, { items: [], gp: 0 }])}>+ Add a package</button></p>
    </fieldset>
  );
}

export function MulticlassBox({ data, onChange }: { data: any; onChange: (d: any) => void }) {
  const m = data.multiclass ?? { req: [], join: 'and', armor: [], weaponCats: [], toolItems: [], skills: 0, tools: 0 };
  const put = (p: any) => onChange({ ...data, multiclass: { ...m, ...p } });
  const req: { ab: string; min: number | '' }[] = m.req ?? [];
  const own = readProfs(data);
  // what joining can give: what the class itself trains in, plus anything already ticked
  const armor = ARMOR.filter(([k]) => own.armorTraining.includes(k) || (m.armor ?? []).includes(k));
  const cats = WEAPON_CATS.filter(([k]) => own.weaponCats.includes(k) || (m.weaponCats ?? []).includes(k));
  const tools = [...new Set([...own.toolItems, ...(m.toolItems ?? [])])];
  const tick = (key: 'armor' | 'weaponCats' | 'toolItems', v: string, on: boolean) => put({ [key]: on ? [...(m[key] ?? []), v] : (m[key] ?? []).filter((x: string) => x !== v) });
  return (
    <fieldset className="multi col mc-box"><legend>Multiclassing</legend>
      <p className="dim">To take this class as a second class, a character needs:</p>
      {req.map((r, i) => (
        <div key={i} className="mc-req">
          <select aria-label="Ability" value={r.ab} onChange={(e) => put({ req: req.map((x, j) => (j === i ? { ...x, ab: e.target.value } : x)) })}>
            {ABILITIES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <span>of at least</span>
          <input type="number" min={1} max={30} aria-label="Minimum score" value={r.min} onChange={(e) => put({ req: req.map((x, j) => (j === i ? { ...x, min: e.target.value === '' ? '' : Number(e.target.value) } : x)) })} />
          <button type="button" className="quiet small-btn" aria-label="Remove this requirement" onClick={() => put({ req: req.filter((_, j) => j !== i) })}>✕</button>
        </div>
      ))}
      {!req.length ? <p className="dim">No ability requirement.</p> : null}
      <p className="inline">
        <button type="button" className="quiet small-btn" onClick={() => put({ req: [...req, { ab: data.primaryAbs?.[0] ?? 'str', min: 13 }] })}>+ Add a score</button>
        {req.length > 1 ? <label className="mc-join">Needs<select value={m.join === 'or' ? 'or' : 'and'} onChange={(e) => put({ join: e.target.value })}><option value="and">all of these</option><option value="or">any one of these</option></select></label> : null}
      </p>
      <p className="dim">Joining it as a second class gives only:</p>
      {[...armor, ...cats].length || tools.length ? (
        <div className="mc-gives">
          {armor.map(([k, l]) => <label key={k} className="ckrow"><input type="checkbox" checked={(m.armor ?? []).includes(k)} onChange={(e) => tick('armor', k, e.target.checked)} /> {l}</label>)}
          {cats.map(([k, l]) => <label key={k} className="ckrow"><input type="checkbox" checked={(m.weaponCats ?? []).includes(k)} onChange={(e) => tick('weaponCats', k, e.target.checked)} /> {l}</label>)}
          {tools.map((t) => <label key={t} className="ckrow"><input type="checkbox" checked={(m.toolItems ?? []).includes(t)} onChange={(e) => tick('toolItems', t, e.target.checked)} /> {t}</label>)}
        </div>
      ) : <p className="dim">This class has no armor, weapon or tool training to give (set them above).</p>}
      <div className="mc-counts">
        <label>Skills from the class&apos;s list<input type="number" min={0} max={9} value={m.skills ?? 0} onChange={(e) => put({ skills: e.target.value === '' ? '' : Number(e.target.value) })} /></label>
        <label>Tools of the class&apos;s choice<input type="number" min={0} max={9} value={m.tools ?? 0} onChange={(e) => put({ tools: e.target.value === '' ? '' : Number(e.target.value) })} /></label>
      </div>
    </fieldset>
  );
}
