'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react';
import { deleteSubclass, saveEntity } from '@/app/(hub)/homebrew/actions';
import { ChoiceEditor, GivesEditor, UseEditor, guessUse, useLine, type FeatOption } from './ClassGives';

import { GrowsEditor, guessUses, isMarker, readResources, retext, type Resource } from './ClassFeatures';

// The class editor's Subclasses tab. A subclass stays its own entry (so a DM can add a new oath
// to the SRD Paladin without copying the class, and attach or share it on its own), but here it
// is listed and edited next to the class. The class decides WHEN subclass features arrive (its
// "subclass feature" markers on the Features tab); each subclass decides WHAT arrives.

// dirty: changed since it was last saved (the class's Save saves these too)
export type SubclassOption = { id: string; name: string; mine: boolean; data: any; cloned_from?: string | null; dirty?: boolean };
type SubFeature = { level: number; name: string; text: string; effects?: any[]; choice?: any; use?: any; uses?: { res: string; cost: number | '' } | null };

const same = (a?: string, b?: string) => (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase();

// the subclasses that belong to this class: your own (linked by id, or by the class's name), and
// the SRD's own subclass for the class it started from
export function subclassesFor(all: SubclassOption[], cls: { id: string | null; name: string; baseClass?: string }) {
  // an unsaved copy only exists in this editor, so it is this class's even if the class was renamed since
  const mine = all.filter((s) => s.mine && (s.id.startsWith('new:') || (cls.id && s.data?.parentClassId === cls.id) || same(s.data?.parent, cls.name)));
  const srd = all.filter((s) => !s.mine && (same(s.data?.parent, cls.baseClass) || same(s.data?.parent, cls.name)));
  return [...mine, ...srd];
}

export function SubclassesTab({ classId, className, baseClass, classFeatures, resources, subclasses, setSubclasses, feats, spellNames, pro, focus }: {
  classId: string | null; className: string; baseClass?: string; classFeatures: any[]; resources: Resource[];
  subclasses: SubclassOption[]; setSubclasses: (s: SubclassOption[]) => void; feats: FeatOption[]; spellNames: string[]; pro: boolean;
  focus?: { subId: string; idx: number } | null;
}) {
  const [open, setOpen] = useState<string | null>(focus?.subId ?? null);
  // the feature to open when a subclass is (re)opened, e.g. after an SRD subclass becomes your copy
  const [startF, setStartF] = useState<number | null>(focus?.idx ?? null);
  const markers = [...new Set(classFeatures.filter(isMarker).map((f) => Number(f.level)))].sort((a, b) => a - b);
  const list = subclassesFor(subclasses, { id: classId, name: className, baseClass });
  const put = (s: SubclassOption, was?: string) => setSubclasses([s, ...subclasses.filter((x) => x.id !== s.id && x.id !== was)]);

  // a new subclass, or your own copy of the SRD one, starts as an unsaved draft
  const draft = (from?: SubclassOption) => {
    const id = 'new:' + Math.random().toString(36).slice(2);
    put({ id, name: from ? from.name + ' (my version)' : 'New subclass', mine: true, cloned_from: from?.id ?? null, data: { desc: from?.data?.desc ?? '', features: from?.data?.features ?? [], parent: className, parentClassId: classId } });
    setOpen(id);
  };

  return (
    <>
      <p className="dim">A subclass is a path within the class, like a Paladin&apos;s oath. Its features can arrive at any level{markers.length ? <>; this class usually gives subclass features at <b>{markers.join(', ')}</b></> : null}.</p>
      <div className="sub-list">
        {list.map((s) => (
          <div key={s.id} className={'feat-card' + (open === s.id ? ' open' : '')}>
            <button type="button" className="feat-head" aria-expanded={open === s.id} onClick={() => { setStartF(null); setOpen(open === s.id ? null : s.id); }}>
              <span>{s.name}<span className="chip feat-uses-tag">{s.mine ? (s.id.startsWith('new:') ? 'not saved yet' : s.dirty ? 'unsaved changes' : 'yours') : 'SRD'}</span></span>
              <span className="dim">{(s.data?.features ?? []).length} features · {open === s.id ? 'Close' : 'Open'}</span>
            </button>
            {open === s.id ? (
              <SubclassEditor key={s.id} sub={s} srd={!s.mine} startOpen={startF} markers={markers} resources={resources} feats={feats} spellNames={spellNames} pro={pro} className={className} classId={classId}
                onSaved={(n, was) => { put(n, was); setOpen(n.id); }} onDeleted={() => { setSubclasses(subclasses.filter((x) => x.id !== s.id)); setOpen(null); }}
                onChange={(n, openF) => {
                  if (s.mine) { put({ ...n, dirty: true }); return; }
                  // changing the SRD subclass: it stays as it is, and your changes go into a new copy
                  const id = 'new:' + Math.random().toString(36).slice(2);
                  setSubclasses([{ ...n, id, mine: true, cloned_from: s.id, data: { ...n.data, parent: className, parentClassId: classId } }, ...subclasses]);
                  setStartF(openF); setOpen(id);
                }} />
            ) : null}
          </div>
        ))}
        {!list.length ? <p className="dim">No subclasses for this class yet.</p> : null}
      </div>
      <p><button type="button" className="quiet small-btn" onClick={() => draft()}>+ Make a new subclass</button></p>
      <p className="dim">Subclasses are saved on their own, with the Save subclass button inside each one, separately from the class.</p>
    </>
  );
}

function SubclassEditor({ sub, srd, startOpen, markers, resources, feats, spellNames, pro, className, classId, onChange, onSaved, onDeleted }: {
  sub: SubclassOption; srd: boolean; startOpen: number | null; markers: number[]; resources: Resource[]; feats: FeatOption[]; spellNames: string[]; pro: boolean; className: string; classId: string | null;
  onChange: (s: SubclassOption, openF: number | null) => void; onSaved: (s: SubclassOption, was: string) => void; onDeleted: () => void;
}) {
  const [openF, setOpenF] = useState<number | null>(startOpen);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [sure, setSure] = useState(false);
  const fresh = sub.id.startsWith('new:');
  // features saved before links existed get the same guesses as class features ("expend one use of your Channel Divinity")
  const features = subclassFeatures(sub.data, resources);
  const setData = (d: any) => { onChange({ ...sub, data: { ...sub.data, features, ...d } }, openF); setMsg(null); };

  const save = async () => {
    setBusy(true); setMsg(null);
    const r = await saveEntity(fresh ? null : sub.id, { type: 'subclass', name: sub.name, status: 'draft', depth: pro ? 'advanced' : 'quick', source: 'homebrew', data: { ...sub.data, features, parent: className, parentClassId: classId }, cloned_from: sub.cloned_from ?? null });
    setBusy(false);
    if (!r?.id) { setMsg({ ok: false, text: r?.error || 'That did not save.' }); return; }
    onSaved({ ...sub, id: r.id, dirty: false }, sub.id);
    setMsg({ ok: true, text: 'Subclass saved.' });
  };
  const remove = async () => {
    if (fresh) { onDeleted(); return; }
    setBusy(true);
    const r = await deleteSubclass(sub.id);
    setBusy(false);
    if (r?.error) { setMsg({ ok: false, text: r.error }); setSure(false); return; }
    onDeleted();
  };

  return (
    <div className="feat-body">
      {srd ? <p className="sub-srd-note">This is the SRD subclass. Change anything and your changes go into your own copy for this class (shown as &quot;not saved yet&quot; until you save it); the SRD original stays as it is.</p> : null}
      <div className="feat-meta">
        <label>Subclass name<input value={sub.name} maxLength={120} onChange={(e) => { onChange({ ...sub, name: e.target.value, data: { ...sub.data, features } }, openF); setMsg(null); }} /></label>
      </div>
      <label>Description<textarea rows={3} value={sub.data?.desc ?? ''} onChange={(e) => setData({ desc: e.target.value })} /></label>
      <h4>Features</h4>
      <SubclassFeatureList features={features} setFeatures={(l) => setData({ features: l })} markers={markers} resources={resources} feats={feats} spellNames={spellNames} openF={openF} setOpenF={setOpenF} />
      {!srd ? <div className="sub-save">
        <button type="button" disabled={busy || !sub.name.trim()} onClick={save}>{busy ? 'Saving' : fresh ? 'Save subclass' : 'Save changes'}</button>
        {!sure ? <button type="button" className="quiet small-btn danger" disabled={busy} onClick={() => setSure(true)}>{fresh ? 'Discard' : 'Delete subclass'}</button> : (
          <span className="inline"><span>{fresh ? 'Discard this unsaved subclass?' : `Delete ${sub.name} for good?`}</span><button type="button" className="danger small-btn" disabled={busy} onClick={remove}>Yes</button><button type="button" className="quiet small-btn" onClick={() => setSure(false)}>Keep it</button></span>
        )}
        {msg ? <span className={msg.ok ? 'good' : 'bad'} role="status">{msg.text}</span> : null}
      </div> : null}
    </div>
  );
}

// A subclass's feature cards: the same on the class's Subclasses tab and on the subclass's own page.
export function SubclassFeatureList({ features, setFeatures, markers, resources, feats, spellNames, openF, setOpenF }: {
  features: SubFeature[]; setFeatures: (l: SubFeature[]) => void; markers: number[]; resources: Resource[]; feats: FeatOption[]; spellNames: string[];
  openF: number | null; setOpenF: (i: number | null) => void;
}) {
  const sorted = (l: SubFeature[]) => l.map((f, i) => [f, i] as const).sort((a, b) => Number(a[0].level) - Number(b[0].level) || a[1] - b[1]).map(([f]) => f);
  const edit = (i: number, f: Partial<SubFeature>) => setFeatures(sorted(features.map((x, j) => (j === i ? { ...x, ...f } : x))));
  const add = () => { const level = markers[0] ?? 3; setFeatures(sorted([...features, { level, name: 'New feature', text: '' }])); setOpenF(features.filter((f) => Number(f.level) <= level).length); };
  const setData = (d: { features: SubFeature[] }) => setFeatures(d.features);
  return (
    <>
    {features.map((f, i) => (
      <div key={i} className={'feat-card' + (openF === i ? ' open' : '')}>
        <button type="button" className="feat-head" aria-expanded={openF === i} onClick={() => setOpenF(openF === i ? null : i)}>
          <span>Level {f.level}: {f.name || 'Untitled feature'}{useLine(guessUse(f)) ? <span className="feat-use-line">{useLine(guessUse(f))}</span> : null}{f.uses?.res ? <span className="chip feat-uses-tag">uses {resources.find((r) => r.id === f.uses?.res)?.name ?? 'a resource'}</span> : null}</span>
          <span className="dim">{openF === i ? 'Close' : 'Open'}</span>
        </button>
        {openF === i ? (
          <div className="feat-body">
            <div className="feat-meta">
              <label>Name<input value={f.name} maxLength={120} onChange={(e) => edit(i, { name: e.target.value })} /></label>
              <label>Level<select value={Number(f.level)} onChange={(e) => { edit(i, { level: Number(e.target.value) }); setOpenF(null); }}>
                {Array.from({ length: 20 }, (_, l) => l + 1).map((l) => <option key={l} value={l}>{l}</option>)}
              </select></label>
            </div>
            <label>What it does<textarea rows={6} value={f.text ?? ''} onChange={(e) => edit(i, retext(f as any, e.target.value, resources) as Partial<SubFeature>)} /></label>
            <fieldset className="feat-uses">
              <legend>Uses a resource</legend>
              <div className="feat-uses-pick">
                <label>Class resource<select value={f.uses?.res ?? ''} onChange={(e) => edit(i, { uses: e.target.value ? { res: e.target.value, cost: f.uses?.cost ?? 1 } : null })}>
                  <option value="">None</option>
                  {resources.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select></label>
                {f.uses?.res ? <label>Each use spends<input type="number" min={0} placeholder="varies" value={f.uses.cost ?? ''} onChange={(e) => edit(i, { uses: { res: f.uses!.res, cost: e.target.value === '' ? '' : Number(e.target.value) } })} /></label> : null}
              </div>
              <p className="dim">Subclass features spend the class&apos;s resources (set on the Features tab), like an oath&apos;s use of Channel Divinity.</p>
            </fieldset>
            <UseEditor f={f} onChange={(use) => edit(i, { use })} />
            <ChoiceEditor f={f} feats={feats} onChange={(choice) => edit(i, { choice })} />
            <GivesEditor effects={f.effects ?? []} spellNames={spellNames} onChange={(effects) => edit(i, { effects })} />
            <GrowsEditor f={f as any} onChange={(effects) => edit(i, { effects })} />
            <p className="inline"><button type="button" className="quiet small-btn danger" onClick={() => { setData({ features: features.filter((_, j) => j !== i) }); setOpenF(null); }}>Remove this feature</button></p>
          </div>
        ) : null}
      </div>
    ))}
    <p><button type="button" className="quiet small-btn" onClick={add}>+ Add a feature</button></p>
    </>
  );
}

// The subclass's features with the same guesses as on the class page (which resource each spends, how it's used).
export function subclassFeatures(data: any, resources: Resource[]): SubFeature[] {
  return (data?.features ?? []).map((f: SubFeature) => ({ ...f, uses: guessUses(f as any, resources), use: guessUse(f) }));
}

// The classes a subclass can belong to: your own, and the SRD's (2024).
export type ClassOption = { id: string; name: string; mine: boolean; data: any };

// The class a subclass belongs to: your own class by id, else by name (yours first, then the SRD's).
export function parentOf(data: any, classes: ClassOption[]) {
  return classes.find((c) => c.mine && data?.parentClassId && c.id === data.parentClassId) ?? classes.find((c) => c.mine && same(c.name, data?.parent)) ?? classes.find((c) => same(c.name, data?.parent));
}

// The parent class's features with this subclass's in place of the "subclass feature" markers, for the side table.
export function withSubclass(classData: any, features: SubFeature[]) {
  const levels = new Set(features.map((f) => Number(f.level)));
  const own = (classData?.features ?? []).filter((f: any) => !(isMarker(f) && levels.has(Number(f.level))));
  return { ...classData, features: [...own, ...features.map((f) => ({ level: Number(f.level), name: f.name }))] };
}

// The subclass's own page (Homebrew, a subclass entry): the same editor as the class's Subclasses
// tab, plus which class it belongs to. Saved with the page's Save button.
export function SubclassPage({ data, setData, classes, feats, spellNames }: {
  data: any; setData: (d: any) => void; classes: ClassOption[]; feats: FeatOption[]; spellNames: string[];
}) {
  const [openF, setOpenF] = useState<number | null>(null);
  const parent = parentOf(data, classes);
  const resources = parent ? readResources(parent.data) : [];
  const markers = parent ? ([...new Set((parent.data?.features ?? []).filter(isMarker).map((f: any) => Number(f.level)))] as number[]).sort((x, y) => x - y) : [];
  const features = subclassFeatures(data, resources);
  const pick = (v: string) => {
    const c = classes.find((x) => x.id === v);
    setData({ ...data, features, parent: c ? c.name : '', parentClassId: c?.mine ? c.id : null });
  };
  const mine = classes.filter((c) => c.mine), srd = classes.filter((c) => !c.mine);
  return (
    <div className="cls-main">
      <div className="cls-row two">
        <label>Description<textarea rows={5} value={data.desc ?? ''} onChange={(e) => setData({ ...data, features, desc: e.target.value })} /></label>
        <div className="cls-stack">
          <label>Belongs to class<select value={parent?.id ?? ''} onChange={(e) => pick(e.target.value)}>
            <option value="">{data.parent && !parent ? data.parent + ' (not found)' : 'Choose a class'}</option>
            {mine.length ? <optgroup label="Your classes">{mine.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</optgroup> : null}
            <optgroup label="SRD classes">{srd.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</optgroup>
          </select></label>
          <p className="dim">{parent
            ? <>Its features can arrive at any level{markers.length ? <>; the {parent.name} usually gives subclass features at <b>{markers.join(', ')}</b></> : null}. It also shows on the {parent.name}&apos;s Subclasses tab.</>
            : <>Pick the class this subclass is a path of. Its features can then spend that class&apos;s resources.</>}</p>
        </div>
      </div>
      <h3>Features</h3>
      <SubclassFeatureList features={features} setFeatures={(l) => setData({ ...data, features: l })} markers={markers} resources={resources} feats={feats} spellNames={spellNames} openF={openF} setOpenF={setOpenF} />
    </div>
  );
}

// ---------------------------------------------------------------- always-prepared spells

// The spells a class's or subclass's features give as "always prepared" (Gives), with the level each
// starts at: the feature's level, or the row's own "from level". For the Spells tab's summary.
export function featureSpells(data: any): { level: number; name: string }[] {
  return (data?.features ?? []).flatMap((f: any) => (f.effects ?? []).filter((x: any) => x.t === 'spell' && x.name).map((x: any) => ({ level: Number(x.at) || Number(f.level) || 1, name: x.name })))
    .sort((a: any, b: any) => a.level - b.level);
}

// Save a subclass from outside its own editor (the class's Save, after a feature was moved into it).
export async function saveSubclass(s: SubclassOption, cls: { name: string; id: string | null }, pro: boolean) {
  return saveEntity(s.id.startsWith('new:') ? null : s.id, { type: 'subclass', name: s.name, status: 'draft', depth: pro ? 'advanced' : 'quick', source: 'homebrew', data: { ...s.data, parent: cls.name, parentClassId: cls.id }, cloned_from: s.cloned_from ?? null });
}
