'use client';
import { useRef, useState } from 'react';

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
