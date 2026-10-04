'use client';
import { useRef, useState } from 'react';

// A small "Copy link" button for an address on this site.
export function CopyLink({ path, label = 'Copy invite link' }: { path: string; label?: string }) {
  const [msg, setMsg] = useState('');
  const copy = async () => {
    const url = window.location.origin + path;
    try { await navigator.clipboard.writeText(url); setMsg('Copied'); } catch { window.prompt('Copy this link', url); }
    setTimeout(() => setMsg(''), 2500);
  };
  return <button type="button" className="act sm" onClick={copy}>{msg || label}</button>;
}

// A block of text with a "Copy" button.
export function CopyBox({ text }: { text: string }) {
  const box = useRef<HTMLTextAreaElement>(null);
  const [msg, setMsg] = useState('');
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setMsg('Copied.'); }
    catch { box.current?.focus(); box.current?.select(); setMsg('Press Ctrl+C to copy.'); }
  };
  return (
    <div>
      <textarea ref={box} readOnly rows={Math.min(30, text.split('\n').length + 1)} value={text} spellCheck={false} className="mono" aria-label="Example campaign text" />
      <p className="inline" style={{ marginTop: 10 }}><button type="button" onClick={copy}>Copy the example</button> <span className="good" role="status">{msg}</span></p>
    </div>
  );
}
