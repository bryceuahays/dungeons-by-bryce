'use client';
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { setCampaignSystem } from './actions';

// On a campaign's Manage page: play one of your own systems instead of the ready-made rules.
export function CampaignSystemForm({ slug, value, systems }: { slug: string; value: string; systems: { id: string; name: string; base: string }[] }) {
  const [msg, setMsg] = useState<{ error?: string; note?: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <>
      <p className="row">
        <label className="f">Game system<select defaultValue={value} disabled={pending} onChange={(e) => start(async () => setMsg(await setCampaignSystem(slug, e.target.value)))}>
          <option value="">The ready-made rules above</option>
          {systems.map((s) => <option key={s.id} value={s.id}>{s.name} (built on Fifth Edition {s.base})</option>)}
        </select></label>
        {msg?.error ? <span className="bad">{msg.error}</span> : msg?.note ? <span className="ok">{msg.note}</span> : null}
      </p>
      <p className="dim">Choosing one of your systems also sets the rules version to the one it is built on. <Link className="button quiet small-btn" href="/homebrew/systems">Create or edit a system</Link></p>
    </>
  );
}
