'use client';
import { useState } from 'react';
import { strToU8, zip, type Zippable } from 'fflate';
import { exportCampaign } from './actions';

// "Download everything": asks the server for the campaign (owner only), fetches each picture from
// its signed link, builds the .zip here in the browser, and saves it. `onDone` runs once it has
// been saved.
export function ExportButton({ slug, className = 'act', label = 'Download everything (.zip)', onDone }: { slug: string; className?: string; label?: string; onDone?: () => void }) {
  const [busy, setBusy] = useState(false);
  const [say, setSay] = useState<{ ok?: string; err?: string; now?: string }>({});

  const run = async () => {
    setBusy(true);
    setSay({ now: 'Gathering the campaign…' });
    try {
      const b = await exportCampaign(slug);
      if ('error' in b) { setSay({ err: b.error }); return; }
      const files: Zippable = {};
      for (const [path, body] of Object.entries(b.text)) files[path] = strToU8(body);
      let done = 0, missed = 0;
      // a few pictures at a time
      const queue = [...b.files];
      const worker = async () => {
        for (let f = queue.shift(); f; f = queue.shift()) {
          try {
            const res = await fetch(f.url);
            if (!res.ok) throw new Error(String(res.status));
            files[f.zip] = [new Uint8Array(await res.arrayBuffer()), { level: 0 }];   // pictures are compressed already
          } catch { missed++; }
          done++;
          setSay({ now: `Adding pictures: ${done} of ${b.files.length}` });
        }
      };
      await Promise.all(Array.from({ length: Math.min(4, b.files.length) }, worker));
      if (missed) files['MISSING-PICTURES.txt'] = strToU8(`${missed} picture${missed === 1 ? '' : 's'} could not be downloaded. Try again to include ${missed === 1 ? 'it' : 'them'}.\n`);
      setSay({ now: 'Making the .zip file…' });
      const data = await new Promise<Uint8Array>((ok, fail) => zip(files, { level: 6 }, (e, out) => (e ? fail(e) : ok(out))));
      const url = URL.createObjectURL(new Blob([data as BlobPart], { type: 'application/zip' }));
      const a = document.createElement('a');
      a.href = url; a.download = b.name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setSay({ ok: `Downloaded ${b.name}${missed ? ` (${missed} picture${missed === 1 ? '' : 's'} could not be included)` : ''}.` });
      onDone?.();
    } catch {
      setSay({ err: 'The download did not work. Check your connection and try again.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="ex-btn">
      <button type="button" className={className} disabled={busy} onClick={() => void run()}>{busy ? 'Downloading…' : label}</button>
      {say.now && busy ? <span className="muted" role="status">{say.now}</span> : null}
      {say.ok ? <span className="okmsg" role="status">{say.ok}</span> : null}
      {say.err ? <span className="err" role="alert">{say.err}</span> : null}
    </span>
  );
}
