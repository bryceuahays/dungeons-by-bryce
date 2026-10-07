'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from 'next/link';
import { useActionState, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { attachPack, attachUsablePack, cloneEntity, createPack, deleteEntity, deletePack, importPack, saveEntity, setInPack, type BrewState } from '@/app/(hub)/homebrew/actions';
import { EDITIONS, type EditionId } from '@/config/editions';
import { convertItem, convertMonster, convertSpell, type Converted } from '@/lib/rules/convert';
import { EntityCard } from './EntityCard';

const Msg = ({ s }: { s: BrewState }) => (s?.error ? <p className="bad" role="alert">{s.error} {s.upgrade ? <Link href="/upgrade">See plans</Link> : null}</p> : s?.note ? <p className="good" role="status">{s.note}</p> : null);

export function CloneButton({ id, label = 'Clone and tweak' }: { id: string; label?: string }) {
  const [state, action, pending] = useActionState<BrewState, FormData>(cloneEntity.bind(null, id), null);
  return <form action={action} className="inline"><button type="submit" className="quiet small-btn" disabled={pending}>{pending ? 'Copying' : label}</button><Msg s={state} /></form>;
}

// Delete from the "Your entries" list, without opening the entry first.
export function DeleteEntryButton({ id, name }: { id: string; name: string }) {
  const [pending, start] = useTransition();
  return <button type="button" className="quiet small-btn danger" disabled={pending} onClick={() => { if (confirm(`Delete "${name}" for good?`)) start(() => deleteEntity(id)); }}>{pending ? 'Deleting' : 'Delete'}</button>;
}

// One click: add a whole pack to one of your campaigns.
export function AttachPackForm({ packId, campaigns }: { packId: string; campaigns: { id: string; title: string }[] }) {
  const [state, action, pending] = useActionState<BrewState, FormData>(attachUsablePack.bind(null, packId), null);
  return (
    <form action={action}>
      <div className="inline">
        <label>Add it to<select name="campaign" defaultValue={campaigns.length === 1 ? campaigns[0].id : ''}>{campaigns.length === 1 ? null : <option value="">Choose a campaign</option>}{campaigns.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}</select></label>
        <button type="submit" disabled={pending}>{pending ? 'Adding' : 'Add to this campaign'}</button>
      </div>
      <Msg s={state} />
    </form>
  );
}

export function NewPackForm() {
  const [state, action, pending] = useActionState<BrewState, FormData>(createPack, null);
  return (
    <form action={action}>
      <div className="inline"><label>New pack<input name="name" maxLength={120} placeholder="For example: The Sunken Coast" required /></label><button type="submit" className="quiet" disabled={pending}>Create pack</button></div>
      <Msg s={state} />
    </form>
  );
}

export function ImportPackForm() {
  const [state, action, pending] = useActionState<BrewState, FormData>(importPack, null);
  return (
    <form action={action}>
      <label>Import a pack: paste the contents of a pack file exported from this site<textarea name="json" rows={4} className="mono" spellCheck={false} required /></label>
      <button type="submit" className="quiet" disabled={pending}>{pending ? 'Importing' : 'Import pack'}</button>
      <Msg s={state} />
    </form>
  );
}

export function PackTools({ pack, entries, mine, campaigns }: { pack: { id: string; name: string; description: string }; entries: any[]; mine: { id: string; name: string; type: string }[]; campaigns: { id: string; title: string }[] }) {
  const [state, action, pending] = useActionState<BrewState, FormData>(attachPack.bind(null, pack.id), null);
  const [busy, start] = useTransition();
  const inPack = new Set(entries.map((e) => e.id));
  const download = () => {
    const file = { format: 'dungeons-by-bryce-pack', version: 1, name: pack.name, description: pack.description, entries: entries.map((e) => ({ type: e.type, name: e.name, depth: e.depth, source: e.source, data: e.data })) };
    const url = URL.createObjectURL(new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url; a.download = pack.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.pack.json'; a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <>
      <div className="panel">
        <h2>What is in it</h2>
        {mine.length ? <ul className="list">{mine.map((e) => (
          <li key={e.id}><label className="ckrow"><input type="checkbox" checked={inPack.has(e.id)} disabled={busy} onChange={(ev) => start(() => setInPack(pack.id, e.id, ev.target.checked))} /> {e.name} <span className="dim">{e.type}</span></label></li>
        ))}</ul> : <p className="dim">You have no homebrew entries yet.</p>}
      </div>
      <div className="panel">
        <h2>Use it</h2>
        <form action={action} className="inline">
          <label>Attach every entry to<select name="campaign" defaultValue="">{[<option key="" value="">Choose a campaign</option>, ...campaigns.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)]}</select></label>
          <button type="submit" className="quiet" disabled={pending}>Attach pack</button>
        </form>
        <Msg s={state} />
        <p className="inline" style={{ marginTop: 12 }}>
          <button type="button" className="quiet" onClick={download} disabled={!entries.length}>Export as a file (JSON)</button>
          <button type="button" className="quiet danger" disabled={busy} onClick={() => { if (confirm('Delete this pack? The entries in it are kept.')) start(() => deletePack(pack.id)); }}>Delete pack</button>
        </p>
      </div>
    </>
  );
}

// ---------------------------------------------------------------- edition converter

const blankIn: Record<string, string> = { name: '', power: '', role: 'standard', size: 'Medium', mtype: 'Monstrosity', ac: '', hp: '', attack: '', speed: '', str: '', dex: '', con: '', int: '', wis: '', cha: '', fort: '', ref: '', will: '', attacks: '', special: '', saveAbility: 'con', level: '', range: '', duration: '', damage: '', save: '', text: '', school: 'Evocation', kind: 'Weapon', bonus: '', charges: '' };

export function Converter() {
  const router = useRouter();
  const [what, setWhat] = useState<'monster' | 'spell' | 'item'>('monster');
  const [edition, setEdition] = useState<EditionId>('advanced');
  const [f, setF] = useState(blankIn);
  const [tweak, setTweak] = useState<Record<string, any>>({});
  const [state, setState] = useState<BrewState>(null);
  const [pending, start] = useTransition();
  const ed = EDITIONS[edition];
  const put = (k: string) => (e: { target: { value: string } }) => { setF({ ...f, [k]: e.target.value }); setTweak({}); };
  const out: Converted = useMemo(() => {
    const i: any = { ...f, edition };
    return what === 'monster' ? convertMonster(i) : what === 'spell' ? convertSpell(i) : convertItem(i);
  }, [f, edition, what]);
  const data = { ...out.data, ...tweak };
  const T = (k: string, label: string, opts: { area?: boolean; hint?: string } = {}) => (
    <label>{label}{opts.area ? <textarea rows={3} value={f[k]} onChange={put(k)} /> : <input value={f[k]} onChange={put(k)} />}{opts.hint ? <span className="dim hint">{opts.hint}</span> : null}</label>
  );
  const adjust = (k: string, label: string, numeric = false) => (
    <label key={k}>{label}<input value={data[k] ?? ''} onChange={(e) => setTweak({ ...tweak, [k]: numeric && e.target.value !== '' ? Number(e.target.value) : e.target.value })} /></label>
  );
  const save = () => start(async () => {
    const r = await saveEntity(null, { type: out.type, name: f.name, status: 'draft', depth: 'advanced', source: 'private', data });
    setState(r);
    if (r?.id) router.push('/homebrew/' + r.id);
  });
  return (
    <div className="brew">
      <div className="brew-form">
        <div className="panel">
          <div className="inline">
            <label>What are you converting<select value={what} onChange={(e) => { setWhat(e.target.value as any); setTweak({}); }}><option value="monster">A creature stat block</option><option value="spell">A spell or power</option><option value="item">An item</option></select></label>
            <label>From<select value={edition} onChange={(e) => { setEdition(e.target.value as EditionId); setTweak({}); }}>{Object.entries(EDITIONS).map(([id, e]) => <option key={id} value={id}>{e.label}</option>)}</select></label>
          </div>
          <p className="dim">Type in the numbers from a book you own. Nothing from any other edition comes with this site: you supply it, and the converter does the math.</p>
        </div>
        <div className="panel">
          <h2>The original</h2>
          {T('name', 'Name')}
          {what === 'monster' ? (
            <div className="fgrid">
              {T('power', ed.powerLabel)}
              {edition === 'fourth' ? <label>Role<select value={f.role} onChange={put('role')}>{['minion', 'standard', 'elite', 'solo'].map((r) => <option key={r}>{r}</option>)}</select></label> : null}
              <label>Size<select value={f.size} onChange={put('size')}>{['Tiny', 'Small', 'Medium', 'Large', 'Huge', 'Gargantuan'].map((s) => <option key={s}>{s}</option>)}</select></label>
              {T('mtype', 'Kind of creature')}
              {T('ac', 'Armor class' + (ed.ac === 'descending' ? ' (lower is better)' : ''))}
              {T('hp', 'Hit points')}
              {T('attack', ed.attack === 'thac0' ? 'THAC0' : 'Attack bonus')}
              {T('speed', 'Speed', { hint: 'In ' + ed.speed.unit })}
              {(['str', 'dex', 'con', 'int', 'wis', 'cha'] as const).map((k) => <label key={k}>{k.toUpperCase()}<input value={f[k]} onChange={put(k)} placeholder="if given" /></label>)}
              {ed.saves === 'fort-ref-will' ? <>{T('fort', 'Fortitude save')}{T('ref', 'Reflex save')}{T('will', 'Will save')}</> : null}
              <label>Its special attacks call for a save against<select value={f.saveAbility} onChange={put('saveAbility')}>{['str', 'dex', 'con', 'int', 'wis', 'cha'].map((k) => <option key={k} value={k}>{k.toUpperCase()}</option>)}</select></label>
            </div>
          ) : null}
          {what === 'monster' ? <>{T('attacks', 'Attacks, one per line, as: name | damage', { area: true, hint: 'For example: Bite | 2d6+3 piercing' })}{T('special', 'Special abilities, one per line, as: name: what it does', { area: true })}</> : null}
          {what === 'spell' ? <div className="fgrid">{T('level', edition === 'fourth' ? 'Power level' : 'Spell level')}{T('range', 'Range', { hint: 'In ' + ed.rangeUnit })}{T('duration', 'Duration')}{T('damage', 'Damage', { hint: 'For example: 1d6 per level, max 10d6' })}{T('save', 'Saving throw')}{T('school', 'School')}</div> : null}
          {what === 'spell' ? T('text', 'What it does, in your own words', { area: true }) : null}
          {what === 'item' ? <div className="fgrid"><label>Kind<select value={f.kind} onChange={put('kind')}>{['Weapon', 'Armor', 'Magic item'].map((k) => <option key={k}>{k}</option>)}</select></label>{T('bonus', 'Magic bonus (the number after the plus)')}{T('ac', 'Armor class it gives' + (ed.ac === 'descending' ? ' (lower is better)' : ''))}{T('charges', 'Charges')}</div> : null}
          {what === 'item' ? T('text', 'What it does, in your own words', { area: true }) : null}
        </div>
      </div>
      <aside className="brew-side">
        <div className="panel">
          <h2>Converted to fifth edition</h2>
          <EntityCard type={out.type} name={f.name || 'Unnamed'} data={data} />
        </div>
        <div className="panel">
          <h3>Every change that was made</h3>
          <ul className="plain">{out.changes.map((c, i) => <li key={i}>{c}</li>)}</ul>
        </div>
        <div className="panel">
          <h3>Adjust any value</h3>
          <div className="fgrid">
            {what === 'monster' ? [adjust('cr', 'Challenge rating'), adjust('acv', 'Armor class', true), adjust('hpv', 'Hit points', true), adjust('hdv', 'Hit dice'), adjust('mspeed', 'Speed'), adjust('msaves', 'Saving throws')] : null}
            {what === 'spell' ? [adjust('level', 'Spell level', true), adjust('range', 'Range'), adjust('duration', 'Duration'), adjust('damage', 'Damage'), adjust('time', 'Casting time'), adjust('comp', 'Components')] : null}
            {what === 'item' ? [adjust('rarity', 'Rarity'), adjust('ac', 'Armor class'), adjust('desc', 'Description')] : null}
          </div>
          <p className="dim">It is saved as a normal homebrew entry, as a draft, where every field can be edited. It starts marked Private, because it comes from a published book: private entries are never included in anything you publish or sell. You can untick that on the entry.</p>
          <button type="button" disabled={pending || !f.name.trim()} onClick={save}>{pending ? 'Saving' : 'Save as a homebrew entry'}</button>
          <Msg s={state} />
        </div>
      </aside>
    </div>
  );
}
