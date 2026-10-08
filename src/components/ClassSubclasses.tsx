'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react';
import { deleteSubclass, saveEntity } from '@/app/(hub)/homebrew/actions';
import { ChoiceEditor, GivesEditor, type FeatOption } from './ClassGives';
import { GrowsEditor, guessUses, isMarker, type Resource } from './ClassFeatures';

// The class editor's Subclasses tab. A subclass stays its own entry (so a DM can add a new oath
// to the SRD Paladin without copying the class, and attach or share it on its own), but here it
// is listed and edited next to the class. The class decides WHEN subclass features arrive (its
// "subclass feature" markers on the Features tab); each subclass decides WHAT arrives.

export type SubclassOption = { id: string; name: string; mine: boolean; data: any; cloned_from?: string | null };
type SubFeature = { level: number; name: string; text: string; effects?: any[]; choice?: any; uses?: { res: string; cost: number | '' } | null };

const same = (a?: string, b?: string) => (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase();

// the subclasses that belong to this class: your own (linked by id, or by the class's name), and
// the SRD's own subclass for the class it started from
export function subclassesFor(all: SubclassOption[], cls: { id: string | null; name: string; baseClass?: string }) {
  const mine = all.filter((s) => s.mine && ((cls.id && s.data?.parentClassId === cls.id) || same(s.data?.parent, cls.name)));
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
              <span>{s.name}<span className="chip feat-uses-tag">{s.mine ? (s.id.startsWith('new:') ? 'not saved yet' : 'yours') : 'SRD'}</span></span>
              <span className="dim">{(s.data?.features ?? []).length} features · {open === s.id ? 'Close' : 'Open'}</span>
            </button>
            {open === s.id ? (
              <SubclassEditor key={s.id} sub={s} srd={!s.mine} startOpen={startF} markers={markers} resources={resources} feats={feats} spellNames={spellNames} pro={pro} className={className} classId={classId}
                onSaved={(n, was) => { put(n, was); setOpen(n.id); }} onDeleted={() => { setSubclasses(subclasses.filter((x) => x.id !== s.id)); setOpen(null); }}
                onChange={(n, openF) => {
                  if (s.mine) { put(n); return; }
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
  const features: SubFeature[] = (sub.data?.features ?? []).map((f: SubFeature) => ({ ...f, uses: guessUses(f as any, resources) }));
  const setData = (d: any) => { onChange({ ...sub, data: { ...sub.data, features, ...d } }, openF); setMsg(null); };
  const sorted = (l: SubFeature[]) => l.map((f, i) => [f, i] as const).sort((a, b) => Number(a[0].level) - Number(b[0].level) || a[1] - b[1]).map(([f]) => f);
  const edit = (i: number, f: Partial<SubFeature>) => setData({ features: sorted(features.map((x, j) => (j === i ? { ...x, ...f } : x))) });
  const add = () => { const level = markers[0] ?? 3; setData({ features: sorted([...features, { level, name: 'New feature', text: '' }]) }); setOpenF(features.filter((f) => Number(f.level) <= level).length); };

  const save = async () => {
    setBusy(true); setMsg(null);
    const r = await saveEntity(fresh ? null : sub.id, { type: 'subclass', name: sub.name, status: 'draft', depth: pro ? 'advanced' : 'quick', source: 'homebrew', data: { ...sub.data, parent: className, parentClassId: classId }, cloned_from: sub.cloned_from ?? null });
    setBusy(false);
    if (!r?.id) { setMsg({ ok: false, text: r?.error || 'That did not save.' }); return; }
    onSaved({ ...sub, id: r.id }, sub.id);
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
      {features.map((f, i) => (
        <div key={i} className={'feat-card' + (openF === i ? ' open' : '')}>
          <button type="button" className="feat-head" aria-expanded={openF === i} onClick={() => setOpenF(openF === i ? null : i)}>
            <span>Level {f.level}: {f.name || 'Untitled feature'}{f.uses?.res ? <span className="chip feat-uses-tag">uses {resources.find((r) => r.id === f.uses?.res)?.name ?? 'a resource'}</span> : null}</span>
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
              <label>What it does<textarea rows={6} value={f.text ?? ''} onChange={(e) => edit(i, { text: e.target.value })} /></label>
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
              <ChoiceEditor f={f} feats={feats} onChange={(choice) => edit(i, { choice })} />
              <GivesEditor effects={f.effects ?? []} spellNames={spellNames} onChange={(effects) => edit(i, { effects })} />
              <GrowsEditor f={f as any} onChange={(effects) => edit(i, { effects })} />
              <p className="inline"><button type="button" className="quiet small-btn danger" onClick={() => { setData({ features: features.filter((_, j) => j !== i) }); setOpenF(null); }}>Remove this feature</button></p>
            </div>
          ) : null}
        </div>
      ))}
      <p><button type="button" className="quiet small-btn" onClick={add}>+ Add a feature</button></p>
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
