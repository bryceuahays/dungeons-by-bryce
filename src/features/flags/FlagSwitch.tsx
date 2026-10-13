'use client';
import { useState, useTransition } from 'react';
import { ConfirmButton } from '@/components/ConfirmButton';
import { setFlag, type FlagState } from './actions';

// One flag's switch on the Head DM's screen. Turning a flag on shows its feature to everyone,
// so that way round asks first; hiding it again does not.
export function FlagSwitch({ name, on }: { name: string; on: boolean }) {
  const [state, setState] = useState<FlagState>(null);
  const [pending, start] = useTransition();
  const flip = (to: boolean) => start(async () => setState(await setFlag(name, to)));
  return (
    <span className="rowend">
      {state?.error ? <span className="bad" role="alert">{state.error}</span> : null}
      {on
        ? <button type="button" className="quiet small-btn" disabled={pending} onClick={() => flip(false)}>{pending ? 'Saving' : 'Hide it again'}</button>
        : <ConfirmButton className="small-btn" disabled={pending} ask="Everyone will see this. Turn it on?" yes="Yes, turn it on" onConfirm={() => flip(true)}>{pending ? 'Saving' : 'Turn on for everyone'}</ConfirmButton>}
    </span>
  );
}
