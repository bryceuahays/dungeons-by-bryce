'use client';
// The System editor: sections on the left, the editor in the middle, a live preview and the pages
// each section changes on the right, saving at the bottom. Renaming something offers to change the
// word in written text too (findText); saving over a system that campaigns play asks first.
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AFFECTS, JOBS, SECTIONS, applyText, sheetSystem, type SectionKey, type Sys, type TextRename } from './model';
import { Sheet5e } from '@/components/Sheet5e';
import { createSystem, findText, updateSystem } from './actions';
import type { SystemPreview, SystemUsage } from './data';
import * as S from './sections';
import './systems.css';

const SCORES: Record<string, number> = { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 };
const MONSTER: Record<string, number> = { str: 12, dex: 14, con: 12, int: 10, wis: 10, cha: 8 };
const KIND_LABEL: Record<string, string> = { spell: 'spells', class: 'classes', subclass: 'subclasses', feat: 'feats', race: 'species', background: 'backgrounds', item: 'items', monster: 'monsters', resource: 'custom resources' };

type Impact = { key: string; text: string; fix?: { label: string; options: [string, string][]; apply?: (v: string) => void } };
type Rename = { from: string; to: string; search: string };
type Hits = Record<string, { type: string; n: number; names: string[] }[]>;

// what was renamed since the last save: abilities, skills, conditions and the names of things
function renamesOf(a: Sys, b: Sys): Rename[] {
  const out: { from: string; to: string }[] = [];
  const pair = (from: string, to: string) => { if (from.trim() && to.trim() && from !== to) out.push({ from: from.trim(), to: to.trim() }); };
  for (const x of b.abilities.list) { const y = a.abilities.list.find((z) => z.id === x.id); if (y) pair(y.name, x.name); }
  for (const x of b.skills.list) { const y = a.skills.list.find((z) => z.id === x.id); if (y) pair(y.name, x.name); }
  if (a.combat.conditions.length === b.combat.conditions.length) b.combat.conditions.forEach((x, i) => pair(a.combat.conditions[i].name, x.name));
  for (const k of ['species', 'class', 'subclass', 'background', 'feat', 'spell'] as const) pair(a.names[k], b.names[k]);
  // a word renamed again (Intelligence, then Insanity, then Madness) is still "Intelligence" in the text
  return out.map((r) => ({ ...r, search: b.text.replace.find((x) => x.to === r.from)?.from ?? r.from }));
}
// the system with the ticked text renames added to it
function withRenames(sys: Sys, picked: TextRename[]): Sys {
  let list = [...sys.text.replace];
  for (const r of picked.filter((x) => x.types.length)) {
    const chain = list.find((x) => x.to === r.from);
    list = chain ? list.map((x) => (x === chain ? { ...x, to: r.to, types: [...new Set([...x.types, ...r.types])] } : x)) : [...list.filter((x) => x.from !== r.from), r];
  }
  return { ...sys, text: { replace: list.filter((x) => x.from !== x.to) } };
}

export function SystemEditor({ start, id, mine, usage, preview }: { start: Sys; id: string | null; mine: boolean; usage: SystemUsage; preview: SystemPreview }) {
  const router = useRouter();
  const [sys, setSys] = useState<Sys>(start);
  const [saved, setSavedSys] = useState<Sys>(start); // as last saved, to compare with
  const [name, setName] = useState(mine ? start.name : start.name + ' (my version)');
  const [copyName, setCopyName] = useState('');
  const [section, setSection] = useState<SectionKey>('abilities');
  const [tab, setTab] = useState<'preview' | 'affects'>('preview');
  // the preview: a real character (yours, or a ready-made sample) on the real sheet, worked out with the system as edited
  const [who, setWho] = useState(preview.characters[0]?.id ?? '');
  const shown = preview.characters.find((c) => c.id === who) ?? preview.characters[0];
  const sheetSys = useMemo(() => sheetSystem(sys), [sys]);
  const previewEntities = useMemo(() => applyText(preview.entities, sys), [preview.entities, sys]);
  const [fixes, setFixes] = useState<Record<string, string>>({});
  const [showImpacts, setShowImpacts] = useState(false);
  const [dialog, setDialog] = useState<null | { how: 'over' | 'copy'; stage: 'renames' | 'campaigns'; pending: Sys }>(null);
  const [renames, setRenames] = useState<Rename[]>([]);
  const [hits, setHits] = useState<Hits>({});
  const [ticks, setTicks] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const set = <K extends SectionKey>(k: K) => (patch: Partial<Sys[K]>) => { setMsg(''); setSys((s) => ({ ...s, [k]: { ...s[k], ...patch } })); };
  const changed = (k: SectionKey) => JSON.stringify(sys[k]) !== JSON.stringify(saved[k]);
  const changedSections = SECTIONS.filter((s) => changed(s.key));
  const dirty = changedSections.length > 0 || (mine && name !== saved.name);
  const impacts = useMemo(() => impactsOf(saved, sys, usage, setSys), [saved, sys, usage]);

  // 1. renamed something? offer to change the written text  2. used by campaigns? ask  3. save
  const begin = async (how: 'over' | 'copy') => {
    const list = renamesOf(saved, sys);
    if (!list.length) return next(how, sys);
    setBusy(true);
    const found = await findText(list.map((r) => r.search), sys.base);
    setBusy(false);
    const byWord: Hits = {};
    for (const h of found) (byWord[h.word] ??= []).push({ type: h.type, n: Number(h.n), names: h.names });
    setRenames(list); setHits(byWord);
    setTicks(Object.fromEntries(list.map((r) => [r.from, (byWord[r.search] ?? []).map((h) => h.type)])));
    setDialog({ how, stage: 'renames', pending: sys });
  };
  const next = (how: 'over' | 'copy', s: Sys) => {
    if (how === 'over' && usage.campaigns.length) return setDialog({ how, stage: 'campaigns', pending: s });
    return commit(how, s);
  };
  const commit = async (how: 'over' | 'copy', s: Sys) => {
    setDialog(null); setBusy(true); setMsg('');
    const res = how === 'over' && id ? await updateSystem(id, s, name) : await createSystem(s, (mine ? copyName || name + ' (copy)' : name));
    setBusy(false);
    if (res.error) return setMsg(res.error);
    if (how === 'over' && id) { setSys(s); setSavedSys({ ...s, name }); setFixes({}); setMsg('Saved.'); router.refresh(); return; }
    router.push('/homebrew/systems/' + res.id);
  };
  const confirmRenames = (apply: boolean) => {
    if (!dialog) return;
    const s = apply ? withRenames(dialog.pending, renames.map((r) => ({ from: r.search, to: r.to, types: ticks[r.from] ?? [] }))) : dialog.pending;
    setSys(s);
    next(dialog.how, s);
  };

  const Section = { abilities: S.Abilities, skills: S.Skills, proficiency: S.Proficiency, creation: S.Creation, leveling: S.Leveling, health: S.Health, rests: S.Rests, combat: S.Combat, magic: S.Magic, equipment: S.Equipment, details: S.Details, trackers: S.Trackers, names: S.Names, monsters: S.Monsters }[section] as (p: { v: unknown; set: (p: unknown) => void; sys: Sys }) => React.ReactNode;

  return (
    <div className="sm">
      <p><Link href="/homebrew/systems">← All systems</Link></p>
      <div className="sm-head">
        <label className="sm-name">System name<input value={name} maxLength={80} onChange={(e) => { setName(e.target.value); setMsg(''); }} /></label>
        <p className="dim">Built on Fifth Edition ({sys.base}).{usage.campaigns.length ? ` Used by ${usage.campaigns.map((c) => c.title).join(', ')}.` : ''}</p>
      </div>
      <p className="dim">{mine ? 'Anything not changed here, homebrew included, comes from the ready-made rules it is built on.' : 'A ready-made system. Change anything, then save it as your own new system; what you do not change stays as published.'}</p>

      <div className="sm-layout">
        <nav className="sm-nav" aria-label="Sections">
          {SECTIONS.map((s, i) => (
            <button key={s.key} type="button" className={'sm-navbtn' + (section === s.key ? ' on' : '')} onClick={() => setSection(s.key)}>
              <span className="sm-num">{i + 1}</span>{s.label}{changed(s.key) ? <span className="sm-dot" title="Changed, not saved yet" /> : null}
            </button>
          ))}
          {sys.text.replace.length ? (
            <div className="sm-renames"><b>Words changed in written text</b>
              <ul>{sys.text.replace.map((r) => <li key={r.from}>{r.from} → {r.to} <small className="dim">({r.types.map((t) => KIND_LABEL[t] ?? t).join(', ')})</small> <button type="button" className="quiet small-btn" onClick={() => setSys((s) => ({ ...s, text: { replace: s.text.replace.filter((x) => x !== r) } }))} aria-label={'Stop replacing ' + r.from}>✕</button></li>)}</ul>
            </div>
          ) : null}
        </nav>

        <main className="sm-mid">
          <h2>{SECTIONS.find((s) => s.key === section)!.label}</h2>
          <Section v={sys[section]} set={set(section) as (p: unknown) => void} sys={sys} />
        </main>

        <aside className="sm-side">
          <div className="sm-tabs">
            <button type="button" className={tab === 'preview' ? 'on' : ''} onClick={() => setTab('preview')}>Preview</button>
            <button type="button" className={tab === 'affects' ? 'on' : ''} onClick={() => setTab('affects')}>Affects</button>
          </div>
          {tab === 'preview' ? (
            <>
              {shown ? (
                <div className="sm-real">
                  <label className="sm-who">Preview<select value={shown.id} onChange={(e) => setWho(e.target.value)}>{preview.characters.map((c) => <option key={c.id} value={c.id}>{c.name}: {c.line}</option>)}</select></label>
                  <p className="dim sm-note">The real character sheet, worked out by the rules as you edit them. Nothing on it is saved.</p>
                  <Sheet5e key={shown.id} character={{ id: shown.id, data: shown.data }} entities={previewEntities} readOnly system={sheetSys} />
                </div>
              ) : <SheetPreview sys={sys} />}
              <MonsterPreview sys={sys} />
            </>
          ) : (
            <div className="sm-affects">
              <p className="dim">Pages that <b>{SECTIONS.find((s) => s.key === section)!.label}</b> changes:</p>
              {AFFECTS[section].map(([page, what]) => <div key={page} className="sm-aff"><b>{page}</b><span>{what}</span></div>)}
            </div>
          )}
        </aside>
      </div>

      <div className="sm-savebar">
        <div className="sm-saveinfo">
          {msg ? <b className={msg === 'Saved.' ? 'sm-ok' : 'sm-err'}>{msg}</b> : changedSections.length ? <span><b>{changedSections.length}</b> {changedSections.length === 1 ? 'section' : 'sections'} changed: {changedSections.map((s) => s.label).join(', ')}</span> : <span className="dim">{dirty ? 'Name changed' : 'No unsaved changes'}</span>}
          {impacts.length ? <button type="button" className="sm-impbtn" onClick={() => setShowImpacts(!showImpacts)}>What this affects ({impacts.length}) {showImpacts ? '▾' : '▸'}</button> : null}
        </div>
        <div className="sm-savebtns">
          {mine ? (
            <>
              <button type="button" disabled={!dirty || busy} onClick={() => begin('over')}>Save over {saved.name}</button>
              <input aria-label="Name for the copy" value={copyName} placeholder={name + ' (copy)'} onChange={(e) => setCopyName(e.target.value)} />
              <button type="button" className="quiet" disabled={busy} onClick={() => begin('copy')}>Save as a new copy</button>
            </>
          ) : <button type="button" disabled={busy || !name.trim()} onClick={() => begin('copy')}>Save as a new system</button>}
        </div>
        {showImpacts && impacts.length ? (
          <div className="sm-impacts">
            <ul>{impacts.map((m) => (
              <li key={m.key}>{m.text}
                {m.fix ? (
                  <select className="sm-fix" value={fixes[m.key] ?? ''} onChange={(e) => { setFixes({ ...fixes, [m.key]: e.target.value }); m.fix!.apply?.(e.target.value); }}>
                    <option value="">{m.fix.label}</option>
                    {m.fix.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                ) : null}
                {fixes[m.key] ? <span className="sm-ok"> ✓</span> : null}
              </li>
            ))}</ul>
            <p className="dim">Fixes are optional. Save anyway and sort things out later; nothing is blocked.</p>
          </div>
        ) : null}
      </div>

      {dialog?.stage === 'renames' ? (
        <div className="gsm-overlay" role="dialog" aria-modal="true" aria-label="Change the written text too?">
          <div className="gsm-dialog sm-wide">
            <h3>Change the written text too?</h3>
            <p className="dim">Everything linked (sheets, pickers, stat blocks) uses the new names already. Descriptions are written out in words, so tick where the old word should be replaced. Official entries stay as published; your system shows them with the new word.</p>
            {renames.map((r) => {
              const found = hits[r.search] ?? [];
              const on = ticks[r.from] ?? [];
              return (
                <div key={r.from} className="sm-rename">
                  <p><b>{r.search}</b> → <b>{r.to}</b></p>
                  {found.length ? found.map((h) => (
                    <label key={h.type} className="sm-tog">
                      <input type="checkbox" checked={on.includes(h.type)} onChange={(e) => setTicks({ ...ticks, [r.from]: e.target.checked ? [...on, h.type] : on.filter((t) => t !== h.type) })} />
                      <span>{h.n} {KIND_LABEL[h.type] ?? h.type} <small className="dim">({h.names.join(', ')}{h.n > h.names.length ? ', …' : ''})</small></span>
                    </label>
                  )) : <p className="dim">Not found in any written text.</p>}
                </div>
              );
            })}
            <p className="inline">
              <button type="button" onClick={() => confirmRenames(true)}>Change the ticked text</button>{' '}
              <button type="button" className="quiet" onClick={() => confirmRenames(false)}>Leave the text alone</button>{' '}
              <button type="button" className="quiet" onClick={() => setDialog(null)}>Cancel</button>
            </p>
          </div>
        </div>
      ) : null}

      {dialog?.stage === 'campaigns' ? (
        <div className="gsm-overlay" role="dialog" aria-modal="true" aria-label="This system is used by campaigns">
          <div className="gsm-dialog">
            <h3>{saved.name} is used by {usage.campaigns.length} {usage.campaigns.length === 1 ? 'campaign' : 'campaigns'}</h3>
            <ul>{usage.campaigns.map((c) => <li key={c.id}>{c.title}</li>)}</ul>
            <p className="dim">Change it everywhere, or leave those campaigns as they are and save your changes as a copy.</p>
            <p className="inline">
              <button type="button" onClick={() => commit('over', dialog.pending)}>Change it for all</button>{' '}
              <button type="button" className="quiet" onClick={() => commit('copy', dialog.pending)}>Save as a copy instead</button>{' '}
              <button type="button" className="quiet" onClick={() => setDialog(null)}>Cancel</button>
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------- what a change affects

function impactsOf(from: Sys, to: Sys, use: SystemUsage, setSys: (f: (s: Sys) => Sys) => void): Impact[] {
  const CLASSES = use.classes;
  const CHARACTERS = use.characters;
  const inUse = CHARACTERS.length > 0;
  const casters = CLASSES.filter((c) => c.cast).map((c) => c.name);
  const out: Impact[] = [];
  const has = (id: string) => to.abilities.list.some((a) => a.id === id);
  const abOptions: [string, string][] = to.abilities.list.map((a) => [a.id, 'Use ' + a.name]);
  for (const a of from.abilities.list.filter((x) => !has(x.id))) {
    for (const j of JOBS.filter((j) => to.abilities.jobs[j.key] === a.id)) {
      out.push({ key: 'job-' + j.key, text: `${j.label} (${j.does.toLowerCase()}) used ${a.name}.`, fix: { label: 'Use which ability now?', options: abOptions, apply: (v) => setSys((s) => ({ ...s, abilities: { ...s.abilities, jobs: { ...s.abilities.jobs, [j.key]: v } } })) } });
    }
    const sk = to.skills.list.filter((s) => s.ab === a.id);
    if (sk.length) out.push({ key: 'sk-' + a.id, text: `${sk.map((s) => s.name).join(', ')} ${sk.length === 1 ? 'uses' : 'use'} ${a.name}.`, fix: { label: 'Move them to…', options: [...abOptions, ['remove', 'Remove these skills']], apply: (v) => setSys((s) => ({ ...s, skills: { ...s.skills, list: v === 'remove' ? s.skills.list.filter((x) => x.ab !== a.id) : s.skills.list.map((x) => (x.ab === a.id ? { ...x, ab: v } : x)) } })) } });
    const cast = CLASSES.filter((c) => c.cast === a.id);
    if (cast.length && to.magic.on) out.push({ key: 'cast-' + a.id, text: `${cast.map((c) => c.name).join(', ')} cast spells with ${a.name}.`, fix: { label: 'Give them…', options: abOptions } });
    const saves = CLASSES.filter((c) => c.saves.includes(a.id));
    if (saves.length) out.push({ key: 'save-' + a.id, text: `${saves.length} classes give a ${a.name} saving throw (${saves.map((c) => c.name).join(', ')}). They will give one save fewer.`, fix: { label: 'Swap it for…', options: abOptions } });
    out.push({ key: 'mon-' + a.id, text: `Monster stat blocks lose their ${a.name} score; spells that call for a ${a.name} save need another one.`, fix: { label: 'Spells use…', options: abOptions } });
    if (inUse) out.push({ key: 'ch-' + a.id, text: `${CHARACTERS.length} ${CHARACTERS.length === 1 ? 'character has' : 'characters have'} a ${a.name} score (${CHARACTERS.slice(0, 5).join(', ')}${CHARACTERS.length > 5 ? ', …' : ''}); it stays saved but no longer shows on their sheets.` });
  }
  // a job with no ability, even without a removal
  for (const j of JOBS) if (!to.abilities.jobs[j.key] || !has(to.abilities.jobs[j.key])) {
    if (!out.some((m) => m.key === 'job-' + j.key)) out.push({ key: 'job-' + j.key, text: `No ability does ${j.label} (${j.does.toLowerCase()}).`, fix: { label: 'Use which ability?', options: abOptions, apply: (v) => setSys((s) => ({ ...s, abilities: { ...s.abilities, jobs: { ...s.abilities.jobs, [j.key]: v } } })) } });
  }
  for (const s of from.skills.list.filter((x) => !to.skills.list.some((y) => y.id === x.id))) out.push({ key: 'skill-' + s.id, text: `${s.name} removed: classes and backgrounds that offer it will offer one skill fewer${inUse ? ', and characters lose it' : ''}.`, fix: { label: 'Replace it with…', options: to.skills.list.map((x) => [x.id, x.name]) } });
  if (from.abilities.list.length !== to.abilities.list.length && to.creation.array && to.creation.arrayValues.length !== to.abilities.list.length) out.push({ key: 'array', text: `The standard array has ${to.creation.arrayValues.length} numbers for ${to.abilities.list.length} abilities.`, fix: { label: 'Fix it', options: [['fit', `Make it ${to.abilities.list.length} numbers`]], apply: () => setSys((s) => ({ ...s, creation: { ...s.creation, arrayValues: Array.from({ length: s.abilities.list.length }, (_, i) => s.creation.arrayValues[i] ?? 10) } })) } });
  if (from.magic.on && !to.magic.on) out.push({ key: 'magic', text: `Magic is off: ${casters.length} classes lose spellcasting (${casters.slice(0, 6).join(', ')}${casters.length > 6 ? ', …' : ''}); spell homebrew is hidden, not deleted${inUse ? '; characters lose their spells and slots' : ''}.` });
  else if (from.magic.on && to.magic.on && from.magic.kind !== to.magic.kind) out.push({ key: 'mana', text: `Casters switch to ${to.magic.kind === 'mana' ? 'mana points' : 'spell slots'}.`, fix: { label: 'Convert how?', options: [['auto', 'Work it out from each class’s slots'], ['manual', 'I will set each class']] } });
  if (from.magic.levels > to.magic.levels && to.magic.on) out.push({ key: 'splv', text: `Spells above level ${to.magic.levels} can no longer be cast.`, fix: { label: 'Those spells…', options: [['cap', `Become level ${to.magic.levels}`], ['hide', 'Are hidden']] } });
  if (to.leveling.kind !== 'none' && to.leveling.maxLevel < from.leveling.maxLevel) out.push({ key: 'maxlv', text: `Class features above level ${to.leveling.maxLevel} can no longer be reached.` });
  if (from.leveling.kind !== to.leveling.kind && inUse) out.push({ key: 'lvkind', text: to.leveling.kind === 'none' ? 'Characters keep their features but stop gaining levels.' : `Characters ${to.leveling.kind === 'xp' ? 'start counting experience from their current level' : 'level up when you say so'}.` });
  if (from.health.kind !== to.health.kind) out.push({ key: 'hp', text: `${to.health.kind === 'wounds' ? 'Hit points become wound boxes' : 'Wound boxes become hit points'} for every character and monster${inUse ? '; current damage is reset' : ''}. Class hit dice are ${to.health.kind === 'wounds' ? 'hidden' : 'used again'}.` });
  if (from.proficiency.on && !to.proficiency.on) out.push({ key: 'prof', text: 'No proficiency bonus: saves, skills, attacks and spell save DCs all drop by it.' });
  for (const c of from.combat.conditions.filter((x) => !to.combat.conditions.some((y) => y.name === x.name))) out.push({ key: 'cond-' + c.name, text: `${c.name} removed: spells, monsters and features that cause it, or give immunity to it, will show it as plain text.` });
  for (const d of from.combat.damage.filter((x) => !to.combat.damage.includes(x))) out.push({ key: 'dmg-' + d, text: `${d} damage removed: spells, weapons and monsters that deal it need another type.`, fix: { label: 'Turn it into…', options: to.combat.damage.map((x) => [x, x]) } });
  for (const c of from.equipment.currencies.filter((x) => !to.equipment.currencies.some((y) => y.abbr === x.abbr))) out.push({ key: 'cur-' + c.abbr, text: `${c.name} removed: prices in ${c.abbr} are converted to the nearest coin left.` });
  for (const k of Object.keys(from.names.kinds).filter((k) => from.names.kinds[k] && !to.names.kinds[k])) out.push({ key: 'kind-' + k, text: `${k[0].toUpperCase() + k.slice(1)} homebrew is switched off: it is hidden in this system, not deleted.` });
  if (from.details.alignment && !to.details.alignment) out.push({ key: 'align', text: 'Alignment is hidden on sheets and monsters.' });
  return out;
}

// ---------------------------------------------------------------- previews

const modOf = (sys: Sys, score: number) => sys.abilities.mod === 'half' ? Math.floor((score - 10) / 2) : sys.abilities.mod === 'score' ? score : 0;
const sg = (n: number) => (n >= 0 ? '+' : '') + n;
const show = (sys: Sys, score: number) => (sys.abilities.mod === 'none' ? String(score) : sg(modOf(sys, score)));

function SheetPreview({ sys }: { sys: Sys }) {
  const level = sys.leveling.kind === 'none' ? 1 : Math.min(3, sys.leveling.maxLevel);
  const prof = sys.proficiency.on ? sys.proficiency.table[level - 1] ?? 0 : 0;
  const score = (id: string) => SCORES[id] ?? 10;
  const jobMod = (k: keyof Sys['abilities']['jobs']) => { const a = sys.abilities.list.find((x) => x.id === sys.abilities.jobs[k]); return a ? modOf(sys, score(a.id)) : 0; };
  const proficient = new Set(['athletics', 'perception']);
  const skillBonus = (s: Sys['skills']['list'][number]) => (sys.abilities.list.some((a) => a.id === s.ab) ? modOf(sys, score(s.ab)) : 0) + (proficient.has(s.id) ? prof : 0);
  const hp = 10 + jobMod('toughness') + (level - 1) * (6 + jobMod('toughness'));
  // the sample purse: the most common coin (worth 100 of the smallest, like gold) and the one below it
  const coins = sys.equipment.currencies.slice().sort((a, b) => b.rate - a.rate);
  const main = Math.max(0, coins.findIndex((c) => c.rate <= 100));
  const money = coins.slice(main, main + 2);
  const spellLevel = Math.min(sys.magic.levels, 2);
  return (
    <div className="sm-sheet">
      <p className="sm-label">Sample character sheet</p>
      <h3>Sample Hero</h3>
      <p className="dim">{sys.names.species} · {sys.names.class} {sys.leveling.kind === 'none' ? '' : `level ${level} of ${sys.leveling.maxLevel}`}{sys.leveling.kind === 'xp' ? ` · ${sys.leveling.xp[level - 1] ?? 0} XP` : sys.leveling.kind === 'milestone' ? ' · milestones' : ''}{sys.details.alignment ? ' · ' + (sys.details.alignments[1] ?? '') : ''}</p>
      <div className="sm-scores">{sys.abilities.list.map((a) => <span key={a.id} title={a.desc}><small>{a.abbr || '?'}</small><b>{show(sys, score(a.id))}</b><small>{score(a.id)}</small></span>)}</div>
      <p className="sm-line">
        <b>AC</b> {sys.combat.acBase + jobMod('agility')} · <b>Initiative</b> {sg(jobMod('agility'))}
        {sys.proficiency.on ? <> · <b>Proficiency</b> +{prof}</> : null}
      </p>
      {sys.health.kind === 'hp' ? <p className="sm-line"><b>Hit points</b> {Math.max(1, hp)} / {Math.max(1, hp)}{sys.health.temp ? ' · temp 0' : ''}</p> : <p className="sm-line"><b>Wounds</b> {'☐'.repeat(Math.min(12, sys.health.wounds))}</p>}
      {sys.health.deathSaves ? <p className="sm-line"><b>Death saves</b> {'○'.repeat(sys.health.deathCount)} / {'○'.repeat(sys.health.deathCount)}</p> : null}
      {sys.trackers.list.map((t) => <p key={t.id} className="sm-line"><b>{t.name}</b> {t.look === 'bar' ? `${t.max} / ${t.max}` : '☐'.repeat(Math.min(12, t.max))}</p>)}
      {sys.details.inspiration !== 'off' ? <p className="sm-line"><b>{sys.details.inspiration === 'heroic' ? 'Heroic Inspiration' : 'Inspiration'}</b> ☐</p> : null}
      <p className="sm-line"><b>Saves</b> {sys.abilities.list.filter((a) => a.save).map((a) => `${a.abbr} ${sg(modOf(sys, score(a.id)))}`).join(' · ') || 'none'}</p>
      {sys.skills.list.length ? (
        <div className="sm-line"><b>Skills</b>
          <ul className="sm-skills">{sys.skills.list.slice(0, 8).map((s) => {
            const a = sys.abilities.list.find((x) => x.id === s.ab);
            return <li key={s.id} className={proficient.has(s.id) ? 'on' : ''}>{sg(skillBonus(s))} {s.name} <small>({a ? a.abbr : '—'})</small></li>;
          })}{sys.skills.list.length > 8 ? <li className="dim">…and {sys.skills.list.length - 8} more</li> : null}</ul>
          {sys.skills.list.filter((s) => s.passive).map((s) => <p key={s.id} className="sm-line"><b>Passive {s.name}</b> {10 + skillBonus(s)}</p>)}
        </div>
      ) : null}
      {sys.magic.on ? (sys.magic.kind === 'slots'
        ? <p className="sm-line"><b>Spell slots</b> {(sys.magic.slots[level - 1] ?? []).slice(0, sys.magic.levels).map((n, i) => (n ? `${i + 1}: ${'●'.repeat(n)}` : '')).filter(Boolean).join('  ') || 'none yet'}</p>
        : <p className="sm-line"><b>Mana</b> {sys.magic.mana[spellLevel - 1] ? sys.magic.mana[spellLevel - 1] * 3 : 0} (a level {spellLevel} spell costs {sys.magic.mana[spellLevel - 1] ?? '?'})</p>) : null}
      <p className="sm-line"><b>Money</b> {money.length ? money.map((c, i) => `${[15, 4][i]} ${c.abbr}`).join(' · ') : 'none'}</p>
      {sys.equipment.carry === 'strength' ? <p className="sm-line"><b>Can carry</b> {(() => { const a = sys.abilities.list.find((x) => x.id === sys.abilities.jobs.might); return a ? score(a.id) * sys.equipment.carryMult + ' lb.' : '(no Might ability set)'; })()}</p> : sys.equipment.carry === 'slots' ? <p className="sm-line"><b>Item slots</b> 10</p> : null}
      <p className="sm-line dim">Rests: {[sys.rests.short ? `short (${sys.rests.shortLength})` : '', sys.rests.long ? `long (${sys.rests.longLength})` : ''].filter(Boolean).join(', ') || 'none'}</p>
    </div>
  );
}

function MonsterPreview({ sys }: { sys: Sys }) {
  const xp = sys.monsters.crXp.find(([cr]) => cr === '1/4')?.[1];
  const agility = sys.abilities.list.find((a) => a.id === sys.abilities.jobs.agility);
  return (
    <div className="sm-sheet sm-monster">
      <p className="sm-label">Sample monster</p>
      <h3>Raider</h3>
      <p className="dim"><i>{sys.details.sizes.includes('Small') ? 'Small' : sys.details.sizes[0] ?? ''} {sys.details.creatureTypes.includes('Humanoid') ? 'Humanoid' : sys.details.creatureTypes[0] ?? ''}{sys.details.alignment ? ', ' + (sys.details.alignments[4] ?? '') : ''}</i></p>
      <p className="sm-line"><b>AC</b> {13 + (agility ? modOf(sys, MONSTER[agility.id] ?? 10) : 0)} · {sys.health.kind === 'hp' ? <><b>HP</b> 10</> : <><b>Wounds</b> ☐☐</>}</p>
      <div className="sm-scores">{sys.abilities.list.map((a) => <span key={a.id}><small>{a.abbr}</small><b>{show(sys, MONSTER[a.id] ?? 10)}</b></span>)}</div>
      {sys.monsters.cr ? <p className="sm-line"><b>Challenge</b> 1/4 ({xp ?? '?'} XP)</p> : null}
      <p className="sm-line"><b>Scimitar.</b> Hit: 5 ({sys.combat.damage.includes('slashing') ? 'slashing' : sys.combat.damage[0] ?? 'plain'}) damage{sys.combat.critOn < 20 ? `; crits on ${sys.combat.critOn}–20` : ''}.</p>
      {sys.monsters.legendary ? <p className="sm-line dim">Bigger monsters can have legendary actions{sys.monsters.lair ? ' and lair actions' : ''}.</p> : null}
    </div>
  );
}
