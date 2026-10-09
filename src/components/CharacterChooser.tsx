'use client';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { bringCharacter, createCharacterV2 } from '@/app/c/[slug]/actions';

// The top of My character: pick one of your characters here, bring in one you made in another
// campaign in the same world (a copy), or create a new one.
type Opt = { id: string; name: string; line: string };

export function CharacterChooser({ slug, here, world, worldName, current }: { slug: string; here: Opt[]; world: (Opt & { campaign: string })[]; worldName: string; current: string | null }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const pick = (v: string) => {
    if (!v) return;
    if (v.startsWith('w:')) start(() => bringCharacter(slug, v.slice(2)));
    else router.push(`/c/${slug}/sheet?c=${v}`);
  };
  return (
    <div className="cc-chooser">
      {here.length || world.length ? (
        <label className="f">{current ? 'Your character' : 'Choose a character'}
          <select value={current ?? ''} disabled={busy} onChange={(e) => pick(e.target.value)}>
            {!current ? <option value="">Choose…</option> : null}
            {here.length ? <optgroup label="In this campaign">{here.map((c) => <option key={c.id} value={c.id}>{c.name}{c.line ? ` · ${c.line}` : ''}</option>)}</optgroup> : null}
            {world.length ? <optgroup label={`Bring one in from ${worldName || 'this world'} (makes a copy)`}>{world.map((c) => <option key={c.id} value={'w:' + c.id}>{c.name}{c.line ? ` · ${c.line}` : ''} (from {c.campaign})</option>)}</optgroup> : null}
          </select>
        </label>
      ) : null}
      <form action={createCharacterV2.bind(null, slug)}><button type="submit" className="act" disabled={busy}>Create new character</button></form>
      {busy ? <span className="who">Bringing your character in…</span> : null}
    </div>
  );
}
