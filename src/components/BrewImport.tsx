'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react';
import { BREW_KINDS, PROMPTS, applyBase, basedOnOf, classSubclasses, parseBrewImport, readAnswer, type NewSub } from '@/lib/brew-import';
import { supabaseBrowser } from '@/lib/supabase/client';
import type { SpellOption } from '@/lib/class-spells';
import { EntityEditor } from './EntityEditor';
import type { FeatOption } from './ClassGives';
import type { ClassOption, SubclassOption } from './ClassSubclasses';

// The "Import homebrew" page: pick what you are importing, then a guide, the prompt for that kind to
// give your own AI, and a box for its answer. The answer opens in that kind's editor right here;
// nothing is saved until Create.

export function BrewImport({ pro, start, srd, spells, feats, subclasses, classes, items }: {
  pro: boolean; start: string; srd: { type: string; name: string; data: any }[]; spells: SpellOption[]; feats: FeatOption[]; subclasses: SubclassOption[]; classes: ClassOption[]; items: string[];
}) {
  const [type, setType] = useState(PROMPTS[start] ? start : 'class');
  const [answer, setAnswer] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState<'yes' | 'blocked' | ''>('');
  const [made, setMade] = useState<{ name: string; data: any; notes: string[]; subs: NewSub[] } | null>(null);
  const label = BREW_KINDS.find(([k]) => k === type)?.[1] ?? 'Homebrew';
  const noun = label.toLowerCase().replace('race or species', 'race');

  const pick = (t: string) => {
    setType(t); setCopied(''); setError('');
    try { history.replaceState(null, '', '?type=' + t); } catch { /* the address just does not follow */ }
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(PROMPTS[type]); setCopied('yes'); } catch { setCopied('blocked'); }
  };
  const [busy, setBusy] = useState(false);
  // a reskin ("basedOn": "Warlock") starts from that official entry (the 2024 one first), or one of your own
  const findBase = async (name: string) => {
    const db = supabaseBrowser();
    const { data: srd } = await db.from('entities').select('name, data, srd_version').eq('source', 'srd').eq('type', type).ilike('name', name).order('srd_version', { ascending: false }).limit(1);
    if (srd?.[0]) return srd[0] as { name: string; data: any };
    const { data: own } = await db.from('entities').select('name, data').neq('source', 'srd').eq('type', type).ilike('name', name).limit(1);
    return (own?.[0] as { name: string; data: any } | undefined) ?? null;
  };
  const open = async () => {
    const r = parseBrewImport(type, answer, spells);
    if (!r.ok) { setError(r.error); return; }
    setError('');
    let result = { name: r.name, data: r.data, notes: r.notes };
    const { name: basedOn, guessed } = basedOnOf(answer);
    if (basedOn) {
      setBusy(true);
      const base = await findBase(basedOn).catch(() => null);
      setBusy(false);
      if (base) {
        result = applyBase(type, base, result, readAnswer(answer), spells);
        if (guessed) result.notes = [`Your notes call it a ${base.name} variant, so it started from the ${base.name}. If that is wrong, go back and add "basedOn" to the answer, or fill it in by hand.`, ...result.notes];
      } else if (!guessed) result.notes = [`Your notes say this is based on "${basedOn}", but there is no ${noun} by that name in the SRD or your homebrew, so only what your notes say was filled in.`, ...result.notes];
    }
    // a class's subclasses (patrons, oaths, paths): real subclasses of it, saved when the class is
    const subs = type === 'class' ? classSubclasses(readAnswer(answer), result.data, result.notes, subclasses, spells) : [];
    setMade({ ...result, subs });
    window.scrollTo(0, 0);
  };

  if (made) {
    return (
      <>
        <div className="panel">
          <p><b>Imported.</b> Everything your notes covered is filled in; anything they did not is blank. Check it over, then press Create to save the {noun}.</p>
          {made.notes.length ? <><p>Notes on the import:</p><ul>{made.notes.map((n, i) => <li key={i}>{n}</li>)}</ul></> : null}
          <p className="inline"><button type="button" className="quiet small-btn" onClick={() => setMade(null)}>Back to the import</button></p>
        </div>
        <EntityEditor id={null} pro={pro} srd={srd.filter((s) => s.type === type)} versions={[]} campaigns={[]} version={1} changeNote="" spells={spells} feats={feats} subclasses={[...made.subs, ...subclasses]} classes={classes} items={items}
          initial={{ type, name: made.name, status: 'draft', depth: 'advanced', source: 'homebrew', data: made.data }} />
      </>
    );
  }

  return (
    <>
      <div className="panel import-guide">
        <h2>How it works</h2>
        <ol>
          <li><b>Pick what you are importing</b> (a class, a race, an item and so on). The prompt changes to match.</li>
          <li><b>Copy the prompt</b> with the button.</li>
          <li>Open the AI you use (ChatGPT, Claude, Gemini or another) and <b>paste the prompt</b>.</li>
          <li>Right after it, in the same message, <b>paste your notes</b>, then send it.</li>
          <li><b>Copy the AI&apos;s whole answer</b> and paste it into the box at the bottom of this page.</li>
          <li>Press <b>Open in the editor</b>. It opens with everything from your notes filled in, and anything missing left blank for you.</li>
        </ol>
        <p className="dim">Your notes go only to the AI you choose. This site reads just the answer you paste here, and nothing is saved until you press Create.</p>
      </div>

      <div className="panel">
        <h2>1. The prompt</h2>
        <label className="import-kind">What are you importing?
          <select value={type} onChange={(e) => pick(e.target.value)}>{BREW_KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        </label>
        <p className="inline" style={{ alignItems: 'center' }}>
          <button type="button" onClick={copy}>Copy the {noun} prompt</button>
          {copied === 'yes' ? <span className="good">Copied. Paste it into your AI, then your notes.</span> : null}
          {copied === 'blocked' ? <span className="dim">Your browser blocked copying: click in the box and press Ctrl+A, then Ctrl+C.</span> : null}
        </p>
        <textarea className="mono import-prompt" readOnly rows={12} value={PROMPTS[type]} onFocus={(e) => e.target.select()} aria-label={`The ${noun} prompt to give your AI`} />
      </div>

      <div className="panel">
        <h2>2. Paste your AI&apos;s answer</h2>
        <textarea className="mono" rows={14} value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Paste the whole answer here. It starts with { and ends with }." aria-label="Your AI's answer" />
        {error ? <p className="bad" role="alert">{error}</p> : null}
        <p className="inline"><button type="button" disabled={!answer.trim() || busy} onClick={() => { void open(); }}>{busy ? 'Opening…' : 'Open in the editor'}</button></p>
      </div>
    </>
  );
}
