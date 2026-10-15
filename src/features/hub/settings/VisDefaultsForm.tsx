'use client';
import { useState, useTransition } from 'react';
import { NEW_VIS, NPC_REVEAL, type VisDefaults } from './defaults';
import { saveVisDefaults, type SettingsState } from './actions';

// Visibility defaults (Settings.png): how new content starts, what players see of a newly
// revealed NPC, and whether reveals to only some players are offered.
export function VisDefaultsForm({ slug, value }: { slug: string; value: VisDefaults }) {
  const [v, setV] = useState<VisDefaults>(value);
  const [msg, setMsg] = useState<SettingsState>(null);
  const [pending, start] = useTransition();
  const set = (patch: Partial<VisDefaults>) => { setMsg(null); setV({ ...v, ...patch }); };
  return (
    <div className="set-form">
      <label className="f">New content starts as
        <select value={v.newVis} onChange={(e) => set({ newVis: e.target.value as VisDefaults['newVis'] })}>{NEW_VIS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select>
      </label>
      <label className="f">When an NPC is revealed, players see
        <select value={v.npcReveal} onChange={(e) => set({ npcReveal: e.target.value as VisDefaults['npcReveal'] })}>{NPC_REVEAL.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select>
      </label>
      <p className="muted">These are where new things start. Anything already made keeps what you chose for it, and each NPC can still be changed on its own.</p>
      <label className="set-ck"><input type="checkbox" checked={v.named} onChange={(e) => set({ named: e.target.checked })} /> <span>Allow reveals to only some players</span></label>
      <label className="set-ck off"><input type="checkbox" checked={false} disabled /> <span>Post scheduled reveals to Discord <small>(when Discord is connected; not built yet)</small></span></label>
      <p className="row" style={{ marginTop: 10 }}>
        <button type="button" className="act" disabled={pending} onClick={() => start(async () => setMsg(await saveVisDefaults(slug, v)))}>{pending ? 'Saving' : 'Save visibility defaults'}</button>
        {msg?.error ? <span className="err" role="alert">{msg.error}</span> : null}
        {msg?.note ? <span className="okmsg" role="status">{msg.note}</span> : null}
      </p>
    </div>
  );
}
