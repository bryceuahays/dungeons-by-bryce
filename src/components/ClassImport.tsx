'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react';
import { IMPORT_PROMPT, parseClassImport } from '@/lib/class-import';
import type { SpellOption } from '@/lib/class-spells';
import { EntityEditor } from './EntityEditor';
import type { FeatOption } from './ClassGives';

// The "Import class" page: a guide, the prompt to give your own AI, and a box for its answer.
// The answer opens in the class editor right here; nothing is saved until Create.

export function ClassImport({ pro, srd, spells, feats }: { pro: boolean; srd: { type: string; name: string; data: any }[]; spells: SpellOption[]; feats: FeatOption[] }) {
  const [answer, setAnswer] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState<'yes' | 'blocked' | ''>('');
  const [made, setMade] = useState<{ name: string; data: any; notes: string[] } | null>(null);

  const copy = async () => {
    try { await navigator.clipboard.writeText(IMPORT_PROMPT); setCopied('yes'); } catch { setCopied('blocked'); }
  };
  const open = () => {
    const r = parseClassImport(answer, spells);
    if (!r.ok) { setError(r.error); return; }
    setError('');
    setMade({ name: r.name, data: r.data, notes: r.notes });
    window.scrollTo(0, 0);
  };

  if (made) {
    return (
      <>
        <div className="panel">
          <p><b>Imported.</b> Everything your notes covered is filled in; anything they did not is blank. Check each tab, then press Create to save the class.</p>
          {made.notes.length ? <><p>A few things could not be filled in:</p><ul>{made.notes.map((n, i) => <li key={i}>{n}</li>)}</ul></> : null}
          <p className="inline"><button type="button" className="quiet small-btn" onClick={() => setMade(null)}>Back to the import</button></p>
        </div>
        <EntityEditor id={null} pro={pro} srd={srd} versions={[]} campaigns={[]} version={1} changeNote="" spells={spells} feats={feats}
          initial={{ type: 'class', name: made.name, status: 'draft', depth: 'advanced', source: 'homebrew', data: made.data }} />
      </>
    );
  }

  return (
    <>
      <div className="panel import-guide">
        <h2>How it works</h2>
        <ol>
          <li><b>Copy the prompt</b> below with the button.</li>
          <li>Open the AI you use (ChatGPT, Claude, Gemini or another) and <b>paste the prompt</b>.</li>
          <li>Right after it, in the same message, <b>paste your notes</b> for the class, then send it.</li>
          <li><b>Copy the AI&apos;s whole answer</b> and paste it into the box at the bottom of this page.</li>
          <li>Press <b>Open in the editor</b>. Your class opens with everything from your notes filled in, and anything missing left blank for you.</li>
        </ol>
        <p className="dim">Your notes go only to the AI you choose. This site reads just the answer you paste here, and nothing is saved until you press Create.</p>
      </div>

      <div className="panel">
        <h2>1. The prompt</h2>
        <p className="inline" style={{ alignItems: 'center' }}>
          <button type="button" onClick={copy}>Copy the prompt</button>
          {copied === 'yes' ? <span className="good">Copied. Paste it into your AI, then your notes.</span> : null}
          {copied === 'blocked' ? <span className="dim">Your browser blocked copying: click in the box and press Ctrl+A, then Ctrl+C.</span> : null}
        </p>
        <textarea className="mono import-prompt" readOnly rows={12} value={IMPORT_PROMPT} onFocus={(e) => e.target.select()} aria-label="The prompt to give your AI" />
      </div>

      <div className="panel">
        <h2>2. Paste your AI&apos;s answer</h2>
        <textarea className="mono" rows={14} value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Paste the whole answer here. It starts with { and ends with }." aria-label="Your AI's answer" />
        {error ? <p className="bad" role="alert">{error}</p> : null}
        <p className="inline"><button type="button" disabled={!answer.trim()} onClick={open}>Open in the editor</button></p>
      </div>
    </>
  );
}
