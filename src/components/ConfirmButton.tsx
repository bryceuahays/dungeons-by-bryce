'use client';
import { useState, type ButtonHTMLAttributes, type ReactNode } from 'react';

// A button that asks "are you sure?" on the page before it acts. The browser's own confirm() pop-up
// is blocked or cancelled by some browsers (and embedded views), which made those buttons do nothing.
export function ConfirmButton({ ask, yes = 'Yes', onConfirm, children, ...rest }: { ask: ReactNode; yes?: string; onConfirm: () => void; children: ReactNode } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick' | 'type'>) {
  const [asking, setAsking] = useState(false);
  if (!asking) return <button type="button" {...rest} onClick={() => setAsking(true)}>{children}</button>;
  return (
    <span className="confirm-inline" role="group">
      <span>{ask}</span>
      <button type="button" className="small-btn danger" onClick={() => { setAsking(false); onConfirm(); }}>{yes}</button>
      <button type="button" className="small-btn quiet" onClick={() => setAsking(false)}>Cancel</button>
    </span>
  );
}
