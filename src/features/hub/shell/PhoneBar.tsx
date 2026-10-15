'use client';
import { useState, useTransition } from 'react';
import { saveShell, type ShellState } from './actions';

// The two pages on the phone's bottom bar, between Home and Character (Mobile.png).
export function PhoneBarForm({ slug, tabs, value }: { slug: string; tabs: { slug: string; title: string }[]; value: string[] }) {
  const [bar, setBar] = useState<string[]>([value[0] ?? '', value[1] ?? '']);
  const [msg, setMsg] = useState<ShellState>(null);
  const [pending, start] = useTransition();
  const choices = tabs.slice(1);   // the first tab is Home already
  const pick = (i: number, v: string) => { setMsg(null); const next = [...bar]; next[i] = v; setBar(next); };
  return (
    <div>
      <p>On a phone the tabs become a bar along the bottom: Home, two pages you choose, Character and More. Everything else is under More.</p>
      <div className="row">
        {[0, 1].map((i) => (
          <label key={i} className="f">{i === 0 ? 'Second button' : 'Third button'}
            <select value={bar[i]} onChange={(e) => pick(i, e.target.value)}>
              <option value="">The next tab in order</option>
              {choices.map((t) => <option key={t.slug} value={t.slug} disabled={bar[1 - i] === t.slug}>{t.title}</option>)}
            </select>
          </label>
        ))}
      </div>
      <p className="row" style={{ marginTop: 10 }}>
        <button type="button" className="act" disabled={pending} onClick={() => start(async () => setMsg(await saveShell(slug, bar.filter(Boolean))))}>{pending ? 'Saving' : 'Save the phone bar'}</button>
        {msg?.error ? <span className="err" role="alert">{msg.error}</span> : null}
        {msg?.note ? <span className="okmsg" role="status">{msg.note}</span> : null}
      </p>
    </div>
  );
}
