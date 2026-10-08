'use client';
import { useState } from 'react';
import { ALL_LANGUAGES, LANGUAGE_GROUPS } from '@/config/proficiencies';

// Languages as checkboxes (the SRD's, by group) plus your own, and how many more the player picks.
//   value: { known: string[], choose: number }
export function LanguagePicker({ value, onChange }: { value: { known?: string[]; choose?: number }; onChange: (v: { known: string[]; choose: number }) => void }) {
  const known = (value.known ?? []).filter(Boolean);
  const choose = Number(value.choose) || 0;
  const own = known.filter((l) => !ALL_LANGUAGES.includes(l));
  const [adding, setAdding] = useState('');
  const put = (k: string[]) => onChange({ known: k, choose });
  const add = () => { const l = adding.trim(); if (l && !known.some((x) => x.toLowerCase() === l.toLowerCase())) put([...known, l]); setAdding(''); };
  return (
    <div className="lang-pick">
      {Object.entries(LANGUAGE_GROUPS).map(([group, list]) => (
        <div key={group} className="lang-group">
          <span className="sr-label">{group}</span>
          <div className="lang-list">
            {list.map((l) => <label key={l} className="ckrow"><input type="checkbox" checked={known.includes(l)} onChange={(e) => put(e.target.checked ? [...known, l] : known.filter((x) => x !== l))} /> {l}</label>)}
          </div>
        </div>
      ))}
      <div className="lang-group">
        <span className="sr-label">Your own</span>
        <div className="lang-list">
          {own.map((l) => <label key={l} className="ckrow"><input type="checkbox" checked onChange={() => put(known.filter((x) => x !== l))} /> {l}</label>)}
          <span className="lang-add">
            <input value={adding} maxLength={40} placeholder="For example: Old Imperial" aria-label="Add a language" onChange={(e) => setAdding(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} />
            <button type="button" className="quiet small-btn" disabled={!adding.trim()} onClick={add}>Add</button>
          </span>
        </div>
      </div>
      <label className="lang-choose">Plus this many more of the player&apos;s choice<input type="number" min={0} max={9} value={choose} onChange={(e) => onChange({ known, choose: Math.max(0, Number(e.target.value) || 0) })} /></label>
    </div>
  );
}
