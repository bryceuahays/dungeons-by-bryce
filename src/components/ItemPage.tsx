'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
import { DAMAGE_TYPES } from '@/config/homebrew';
import type { FeatOption } from './ClassGives';
import { GiveSpell, GivesEditor } from './ClassGives';
import { TraitCards, type Trait } from './TraitCards';

// An item's own page, built like the class page: what kind of thing it is, then its rules as fields.
//   kind: 'Weapon' | 'Armor' | 'Gear' | 'Magic item'; costN + costUnit; lb; desc
//   weapon: { cat: simple | martial, type: melee | ranged, dice, dtype, versatile, range: { normal, long }, props: [], mastery, ammo }
//   armor:  { type: light | medium | heavy | shield, base, dex: full | max2 | none, strMin, stealth, don, doff }
//   gear:   { cat, uses, qty, contents: [{ name, count }] }
//   magic:  { type, base, rarity, attune, attuneBy, bonus: { n, to }, charges: { n, regain, when }, spells: [{ name, cost }], effects, props: [traits] }
// Written on save: the text the rest of the site shows (cost, weight, damage, ac, props, rarity, attune)
// and effects (what the item gives while worn or held: its Gives, its bonus, and its properties' Gives).

const PROPS = ['Ammunition', 'Finesse', 'Heavy', 'Light', 'Loading', 'Reach', 'Thrown', 'Two-Handed', 'Versatile'];
const MASTERY = ['Cleave', 'Graze', 'Nick', 'Push', 'Sap', 'Slow', 'Topple', 'Vex'];
const GEAR_CATS = ['Adventuring gear', 'Ammunition', 'Arcane focus', 'Druidic focus', 'Holy symbol', 'Equipment pack', "Artisan's tools", 'Musical instrument', 'Gaming set', 'Other tool'];
const MAGIC_TYPES = ['Armor', 'Weapon', 'Wondrous Item', 'Ring', 'Rod', 'Staff', 'Wand', 'Potion', 'Scroll'];
const RARITIES = ['Common', 'Uncommon', 'Rare', 'Very Rare', 'Legendary', 'Artifact', 'Varies'];
const UNITS = ['cp', 'sp', 'ep', 'gp', 'pp'];
const DEX_FOR: Record<string, string> = { light: 'full', medium: 'max2', heavy: 'none', shield: 'none' };

// a magic weapon or armor has its own stats only when it is a specific one (a Longsword, not "Any Melee Weapon")
const isWeapon = (d: any) => d.kind === 'Weapon' || (d.kind === 'Magic item' && d.magic?.type === 'Weapon' && !!d.weapon);
const isArmor = (d: any) => d.kind === 'Armor' || (d.kind === 'Magic item' && d.magic?.type === 'Armor' && !!d.armor);
const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

export function itemOut(d: any) {
  const w = d.weapon, a = d.armor, m = d.magic, g = d.gear;
  const out: any = { ...d };
  if (d.costN !== undefined && d.costN !== '') out.cost = `${d.costN} ${d.costUnit || 'gp'}`;
  if (d.lb !== undefined && d.lb !== '') out.weight = `${d.lb} lb.`;
  if (isWeapon(d) && w) {
    out.damage = [w.dice, w.dtype].filter(Boolean).join(' ');
    out.props = [`${cap(w.cat || 'simple')} ${w.type || 'melee'} weapon`, ...(w.props ?? []).map((p: string) => (p === 'Versatile' && w.versatile ? `Versatile (${w.versatile})` : p === 'Ammunition' && w.ammo ? `Ammunition (${w.ammo})` : p)),
      w.range?.normal ? `Range ${w.range.normal}${w.range.long ? '/' + w.range.long : ''}` : '', w.mastery ? `Mastery: ${w.mastery}` : ''].filter(Boolean).join('. ');
  }
  if (isArmor(d) && a) {
    out.ac = a.type === 'shield' ? `+${a.base || 2}` : `${a.base}${a.dex === 'full' ? ' + Dex' : a.dex === 'max2' ? ' + Dex (max 2)' : ''}`;
    out.props = [`${cap(a.type || 'light')}${a.type === 'shield' ? '' : ' armor'}`, Number(a.strMin) ? `Strength ${a.strMin}` : '', a.stealth ? 'Disadvantage on Stealth' : '', a.don ? `Don ${a.don}, doff ${a.doff || '?'}` : ''].filter(Boolean).join('. ');
  }
  if (d.kind === 'Gear' && g) out.props = [g.cat, Number(g.uses) ? `${g.uses} uses` : '', Number(g.qty) > 1 ? `Bundle of ${g.qty}` : '', (g.contents ?? []).length ? 'Contains: ' + g.contents.map((c: any) => (Number(c.count) > 1 ? `${c.count} ${c.name}` : c.name)).join(', ') : ''].filter(Boolean).join('. ');
  if (d.kind === 'Magic item' && m) {
    out.rarity = m.rarity || 'Uncommon';
    out.attune = !!m.attune;
    out.effects = [
      ...(m.effects ?? []),
      ...(Number(m.bonus?.n) && (m.bonus.to === 'ac' || m.bonus.to === 'acsave') ? [{ t: 'ac', n: Number(m.bonus.n) }] : []),
      ...(Number(m.bonus?.n) && m.bonus.to === 'acsave' ? [{ t: 'bonus', roll: 'save', amount: Number(m.bonus.n) }] : []),
      ...(m.props ?? []).flatMap((p: Trait) => p.effects ?? []),
    ];
  } else {
    out.rarity = 'Standard';
  }
  return out;
}

export function ItemPage({ data, setData, feats, spellNames, items }: { data: any; setData: (d: any) => void; feats: FeatOption[]; spellNames: string[]; items: string[] }) {
  const kind = data.kind ?? 'Gear';
  const w = { cat: 'simple', type: 'melee', dice: '1d6', dtype: 'slashing', props: [], ...(data.weapon ?? {}) };
  const a = { type: 'light', base: 11, dex: 'full', ...(data.armor ?? {}) };
  const g = { cat: 'Adventuring gear', contents: [], ...(data.gear ?? {}) };
  const m = { type: 'Wondrous Item', rarity: 'Uncommon', ...(data.magic ?? {}) };
  const put = (k: string, v: any) => setData({ ...data, [k]: v });
  const num = (v: string) => (v === '' ? '' : Math.max(0, Number(v) || 0));
  // legacy text values ("15 gp", "3 lb.") until the fields are set
  const costN = data.costN ?? (String(data.cost ?? '').match(/[\d,.]+/)?.[0]?.replace(/,/g, '') ?? '');
  const costUnit = data.costUnit ?? (String(data.cost ?? '').match(/\b(cp|sp|ep|gp|pp)\b/i)?.[1]?.toLowerCase() ?? 'gp');
  const lb = data.lb ?? (String(data.weight ?? '').match(/[\d.]+/)?.[0] ?? '');

  return (
    <div className="cls-main">
      <div className="cls-row two">
        <label>Description<textarea rows={7} value={data.desc ?? ''} onChange={(e) => setData({ ...data, desc: e.target.value })} /></label>
        <div className="cls-stack">
          <label>Kind<select value={kind} onChange={(e) => setData({ ...data, kind: e.target.value })}>{['Weapon', 'Armor', 'Gear', 'Magic item'].map((k) => <option key={k}>{k}</option>)}</select></label>
          <div className="sr-grid">
            <label>Cost<input type="number" min={0} value={costN} onChange={(e) => setData({ ...data, costN: num(e.target.value), costUnit })} /></label>
            <label>In<select value={costUnit} onChange={(e) => setData({ ...data, costN, costUnit: e.target.value })}>{UNITS.map((u) => <option key={u} value={u}>{u.toUpperCase()}</option>)}</select></label>
            <label>Weight (lb)<input type="number" min={0} step={0.25} value={lb} onChange={(e) => setData({ ...data, lb: e.target.value === '' ? '' : Number(e.target.value) })} /></label>
          </div>
          {kind === 'Magic item' ? (
            <div className="sr-grid">
              <label>Type<select value={m.type} onChange={(e) => put('magic', { ...m, type: e.target.value })}>{MAGIC_TYPES.map((t) => <option key={t}>{t}</option>)}</select></label>
              <label>Rarity<select value={m.rarity} onChange={(e) => put('magic', { ...m, rarity: e.target.value })}>{RARITIES.map((r) => <option key={r}>{r}</option>)}</select></label>
              {m.type === 'Weapon' || m.type === 'Armor' ? <label className="sr-wide">Based on<input value={m.base ?? ''} maxLength={80} placeholder={m.type === 'Weapon' ? 'For example: Any Melee Weapon, or Longsword' : 'For example: Any Light, Medium, or Heavy'} onChange={(e) => put('magic', { ...m, base: e.target.value })} /></label> : null}
              <label className="ckrow"><input type="checkbox" checked={!!m.attune} onChange={(e) => put('magic', { ...m, attune: e.target.checked })} /> Requires attunement</label>
              {m.attune ? <label>By<input value={m.attuneBy ?? ''} maxLength={60} placeholder="anyone (blank), or for example: a Wizard" onChange={(e) => put('magic', { ...m, attuneBy: e.target.value || undefined })} /></label> : null}
            </div>
          ) : null}
        </div>
      </div>

      {kind === 'Magic item' && (m.type === 'Weapon' || m.type === 'Armor') && !(m.type === 'Weapon' ? data.weapon : data.armor) ? (
        <p className="inline"><span className="dim">It works with {m.base ? m.base.toLowerCase() : `any ${m.type.toLowerCase()}`}, so it has no stats of its own.</span>
          <button type="button" className="quiet small-btn" onClick={() => setData({ ...data, [m.type === 'Weapon' ? 'weapon' : 'armor']: m.type === 'Weapon' ? { cat: 'simple', type: 'melee', dice: '1d6', dtype: 'slashing', props: [] } : { type: 'light', base: 11, dex: 'full' } })}>+ Give it {m.type === 'Weapon' ? 'weapon' : 'armor'} stats (a specific one)</button></p>
      ) : null}
      {isWeapon(data) ? (
        <fieldset className="feat-uses"><legend>Weapon</legend>
          <div className="sr-grid">
            <label>Category<select value={w.cat} onChange={(e) => put('weapon', { ...w, cat: e.target.value })}><option value="simple">Simple</option><option value="martial">Martial</option></select></label>
            <label>Melee or ranged<select value={w.type} onChange={(e) => put('weapon', { ...w, type: e.target.value })}><option value="melee">Melee</option><option value="ranged">Ranged</option></select></label>
            <label>Damage dice<input value={w.dice ?? ''} maxLength={12} placeholder="1d8" onChange={(e) => put('weapon', { ...w, dice: e.target.value })} /></label>
            <label>Damage type<select value={w.dtype ?? ''} onChange={(e) => put('weapon', { ...w, dtype: e.target.value })}><option value="">None</option>{DAMAGE_TYPES.map((t) => <option key={t}>{t}</option>)}</select></label>
            <label>Mastery<select value={w.mastery ?? ''} onChange={(e) => put('weapon', { ...w, mastery: e.target.value || undefined })}><option value="">None</option>{MASTERY.map((x) => <option key={x}>{x}</option>)}</select></label>
          </div>
          <span className="sr-label">Properties</span>
          <div className="sr-conds">{PROPS.map((p) => <label key={p} className="ckrow"><input type="checkbox" checked={(w.props ?? []).includes(p)} onChange={(e) => put('weapon', { ...w, props: e.target.checked ? PROPS.filter((x) => x === p || (w.props ?? []).includes(x)) : (w.props ?? []).filter((x: string) => x !== p) })} /> {p}</label>)}</div>
          <div className="sr-grid">
            {(w.props ?? []).includes('Versatile') ? <label>Two-handed dice<input value={w.versatile ?? ''} maxLength={12} placeholder="1d10" onChange={(e) => put('weapon', { ...w, versatile: e.target.value })} /></label> : null}
            {w.type === 'ranged' || (w.props ?? []).includes('Thrown') ? <>
              <label>Range (feet)<input type="number" min={0} step={5} value={w.range?.normal ?? ''} onChange={(e) => put('weapon', { ...w, range: { ...w.range, normal: num(e.target.value) } })} /></label>
              <label>Long range (feet)<input type="number" min={0} step={5} value={w.range?.long ?? ''} onChange={(e) => put('weapon', { ...w, range: { ...w.range, long: num(e.target.value) } })} /></label>
            </> : null}
            {(w.props ?? []).includes('Ammunition') ? <label>Ammunition<input value={w.ammo ?? ''} maxLength={40} placeholder="Arrows" onChange={(e) => put('weapon', { ...w, ammo: e.target.value })} /></label> : null}
          </div>
        </fieldset>
      ) : null}

      {isArmor(data) ? (
        <fieldset className="feat-uses"><legend>Armor</legend>
          <div className="sr-grid">
            <label>Type<select value={a.type} onChange={(e) => put('armor', { ...a, type: e.target.value, dex: DEX_FOR[e.target.value], ...(e.target.value === 'shield' ? { base: 2 } : {}) })}><option value="light">Light</option><option value="medium">Medium</option><option value="heavy">Heavy</option><option value="shield">Shield</option></select></label>
            <label>{a.type === 'shield' ? 'Armor class bonus' : 'Armor class'}<input type="number" min={0} max={30} value={a.base ?? ''} onChange={(e) => put('armor', { ...a, base: num(e.target.value) })} /></label>
            {a.type !== 'shield' ? <label>Adds Dexterity<select value={a.dex} onChange={(e) => put('armor', { ...a, dex: e.target.value })}><option value="full">Full modifier</option><option value="max2">Up to +2</option><option value="none">No</option></select></label> : null}
            <label>Strength needed<input type="number" min={0} max={30} placeholder="none" value={a.strMin || ''} onChange={(e) => put('armor', { ...a, strMin: num(e.target.value) })} /></label>
            <label className="ckrow"><input type="checkbox" checked={!!a.stealth} onChange={(e) => put('armor', { ...a, stealth: e.target.checked })} /> Disadvantage on Stealth</label>
          </div>
          <div className="sr-grid">
            <label>Time to put on<input value={a.don ?? ''} maxLength={20} placeholder="1 minute" onChange={(e) => put('armor', { ...a, don: e.target.value })} /></label>
            <label>Time to take off<input value={a.doff ?? ''} maxLength={20} placeholder="1 minute" onChange={(e) => put('armor', { ...a, doff: e.target.value })} /></label>
          </div>
        </fieldset>
      ) : null}

      {kind === 'Gear' ? (
        <fieldset className="feat-uses"><legend>Gear</legend>
          <div className="sr-grid">
            <label>Category<select value={g.cat} onChange={(e) => put('gear', { ...g, cat: e.target.value })}>{GEAR_CATS.map((c) => <option key={c}>{c}</option>)}</select></label>
            <label>Uses<input type="number" min={0} placeholder="none" value={g.uses || ''} onChange={(e) => put('gear', { ...g, uses: num(e.target.value) })} /></label>
            <label>Comes in a bundle of<input type="number" min={0} placeholder="1" value={g.qty || ''} onChange={(e) => put('gear', { ...g, qty: num(e.target.value) })} /></label>
          </div>
          {g.cat === 'Equipment pack' || (g.contents ?? []).length ? (
            <>
              <span className="sr-label">Contents</span>
              <datalist id="item-names">{items.map((n) => <option key={n} value={n} />)}</datalist>
              {(g.contents ?? []).map((c: any, i: number) => (
                <div key={i} className="equip-item">
                  <input type="number" min={1} aria-label="How many" value={c.count} onChange={(e) => put('gear', { ...g, contents: g.contents.map((x: any, j: number) => (j === i ? { ...x, count: num(e.target.value) } : x)) })} />
                  <input list="item-names" aria-label="Item" value={c.name} onChange={(e) => put('gear', { ...g, contents: g.contents.map((x: any, j: number) => (j === i ? { ...x, name: e.target.value } : x)) })} />
                  <button type="button" className="quiet small-btn" aria-label={'Remove ' + c.name} onClick={() => put('gear', { ...g, contents: g.contents.filter((_: any, j: number) => j !== i) })}>✕</button>
                </div>
              ))}
              <p><button type="button" className="quiet small-btn" onClick={() => put('gear', { ...g, contents: [...(g.contents ?? []), { name: '', count: 1 }] })}>+ Add an item</button></p>
            </>
          ) : null}
        </fieldset>
      ) : null}

      {kind === 'Magic item' ? (
        <>
          <fieldset className="feat-uses"><legend>Magic</legend>
            <div className="sr-grid">
              <label>Bonus<select value={m.bonus?.n ?? ''} onChange={(e) => put('magic', { ...m, bonus: e.target.value ? { n: Number(e.target.value), to: m.bonus?.to ?? (m.type === 'Armor' ? 'ac' : 'weapon') } : undefined })}><option value="">None</option><option value="1">+1</option><option value="2">+2</option><option value="3">+3</option></select></label>
              {m.bonus ? <label>To<select value={m.bonus.to} onChange={(e) => put('magic', { ...m, bonus: { ...m.bonus, to: e.target.value } })}><option value="weapon">Attack and damage rolls with it</option><option value="ac">Armor class</option><option value="acsave">Armor class and saving throws</option><option value="spell">Spell attacks and save DC</option></select></label> : null}
            </div>
            <div className="sr-grid">
              <label>Charges<input type="number" min={0} max={99} placeholder="none" value={m.charges?.n ?? ''} onChange={(e) => put('magic', { ...m, charges: e.target.value ? { ...m.charges, n: num(e.target.value), when: m.charges?.when ?? 'dawn' } : undefined })} /></label>
              {m.charges ? <>
                <label>Regains<input value={m.charges.regain ?? ''} maxLength={20} placeholder="1d6 + 1, or all" onChange={(e) => put('magic', { ...m, charges: { ...m.charges, regain: e.target.value } })} /></label>
                <label>When<select value={m.charges.when ?? 'dawn'} onChange={(e) => put('magic', { ...m, charges: { ...m.charges, when: e.target.value } })}><option value="dawn">Daily at dawn</option><option value="long">On a long rest</option><option value="short">On a short or long rest</option><option value="never">Never (used up)</option></select></label>
              </> : null}
            </div>
            {m.charges || (m.spells ?? []).length ? (
              <>
                <span className="sr-label">Spells cast from it</span>
                {(m.spells ?? []).map((s: any, i: number) => (
                  <div key={i} className="give-row item-spell">
                    <GiveSpell name={s.name ?? ''} onChange={(name) => put('magic', { ...m, spells: m.spells.map((x: any, j: number) => (j === i ? { ...x, name } : x)) })} spellNames={spellNames} />
                    <label>Charges per cast<input value={s.cost ?? ''} maxLength={20} placeholder="1" onChange={(e) => put('magic', { ...m, spells: m.spells.map((x: any, j: number) => (j === i ? { ...x, cost: e.target.value } : x)) })} /></label>
                    <button type="button" className="quiet small-btn danger" onClick={() => put('magic', { ...m, spells: m.spells.filter((_: any, j: number) => j !== i) })}>Remove</button>
                  </div>
                ))}
                <p><button type="button" className="quiet small-btn" onClick={() => put('magic', { ...m, spells: [...(m.spells ?? []), { name: '', cost: '1' }] })}>+ Add a spell</button></p>
              </>
            ) : null}
          </fieldset>
          <GivesEditor effects={m.effects ?? []} spellNames={spellNames} onChange={(effects) => put('magic', { ...m, effects })} />
          <h3>Properties</h3>
          <p className="dim">What it can do, as cards like a feat&apos;s benefits: how it&apos;s used, limited uses, what it gives.</p>
          <TraitCards list={(m.props ?? []) as Trait[]} onChange={(l) => put('magic', { ...m, props: l })} levels={false} noun="property" feats={feats} spellNames={spellNames} />
        </>
      ) : null}
    </div>
  );
}
