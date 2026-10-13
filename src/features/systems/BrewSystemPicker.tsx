'use client';
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { setBrewSystem } from './actions';
import './systems.css';

// The System dropdown at the top of the Homebrew page. Changing it changes the page: the kinds of
// homebrew, their names, and the entries listed.
export function BrewSystemPicker({ value, mine }: { value: string; mine: { id: string; name: string }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const custom = mine.some((s) => s.id === value);
  return (
    <div className="brew-system">
      <label>System
        <select value={value} disabled={pending} onChange={(e) => start(async () => { await setBrewSystem(e.target.value); router.refresh(); })}>
          <optgroup label="Ready-made">
            <option value="2024">Fifth Edition (2024)</option>
            <option value="2014">Fifth Edition (2014)</option>
          </optgroup>
          {mine.length ? <optgroup label="Your systems">{mine.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</optgroup> : null}
        </select>
      </label>
      <span className="brew-system-links">
        {custom ? <Link href={'/homebrew/systems/' + value}>Edit this system</Link> : <Link href={'/homebrew/systems/new?from=' + value}>Customize this system</Link>}
        {' · '}<Link href="/homebrew/systems">All systems</Link>
      </span>
    </div>
  );
}
