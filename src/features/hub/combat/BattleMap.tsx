'use client';
/* eslint-disable @next/next/no-img-element */
import { useRef, useState } from 'react';

export type Token = { id: string; name: string; side: 'party' | 'enemy' | 'ally'; pos: { x: number; y: number } | null | undefined; now?: boolean; hidden?: boolean };

const initials = (name: string) => name.split(/\s+/).filter(Boolean).map((w) => (/^\d+$/.test(w) ? w : w[0])).join('').slice(0, 3).toUpperCase() || '?';

// The battle map (CombatDM.png): a map picture from the Maps tool with a token for each
// combatant. The DM drags tokens, and places one that is not on the map yet by choosing it below;
// players see where everyone is, live. The picture is the Maps tool's, served by
// /c/<slug>/map/<id>, which paints out what a player may not see. Drag the corner to resize.
export function BattleMap({ src, tokens, edit, onMove }: { src: string | null; tokens: Token[]; edit: boolean; onMove?: (id: string, pos: { x: number; y: number } | null) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ id: string; x: number; y: number } | null>(null);
  const at = (e: { clientX: number; clientY: number }) => {
    const r = box.current!.getBoundingClientRect();
    return { x: Math.round(Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100))), y: Math.round(Math.min(100, Math.max(0, ((e.clientY - r.top) / r.height) * 100))) };
  };
  const placed = tokens.filter((t) => t.pos);
  const off = tokens.filter((t) => !t.pos);
  return (
    <div className="bm">
      <div ref={box} className={'bm-map' + (src ? ' pic' : '')} onPointerMove={(e) => { if (drag) setDrag({ id: drag.id, ...at(e) }); }}
        onPointerUp={(e) => { if (drag) { onMove?.(drag.id, at(e)); setDrag(null); } }} onPointerLeave={() => setDrag(null)}>
        {src ? <img src={src} alt="Battle map" draggable={false} /> : <span className="bm-grid" aria-hidden="true" />}
        {placed.map((t) => {
          const p = drag?.id === t.id ? drag : t.pos!;
          return (
            <button key={t.id} type="button" className={`bm-tok ${t.side}${t.now ? ' now' : ''}${t.hidden ? ' hid' : ''}`} style={{ left: p.x + '%', top: p.y + '%' }}
              aria-label={`${t.name}${t.now ? ', acting now' : ''}`} title={t.name} disabled={!edit}
              onPointerDown={(e) => { if (!edit) return; (e.target as HTMLElement).setPointerCapture?.(e.pointerId); setDrag({ id: t.id, ...at(e) }); }}
              onKeyDown={(e) => {
                if (!edit) return;
                const k: Record<string, [number, number]> = { ArrowLeft: [-2, 0], ArrowRight: [2, 0], ArrowUp: [0, -2], ArrowDown: [0, 2] };
                if (k[e.key]) { e.preventDefault(); onMove?.(t.id, { x: Math.min(100, Math.max(0, t.pos!.x + k[e.key][0])), y: Math.min(100, Math.max(0, t.pos!.y + k[e.key][1])) }); }
                if (e.key === 'Delete' || e.key === 'Backspace') onMove?.(t.id, null);
              }}>{initials(t.name)}</button>
          );
        })}
      </div>
      {edit ? (
        <p className="bm-note">
          Drag the corner to resize · Drag tokens to move them, or use the arrow keys{off.length ? ' · Put on the map:' : ''}
          {off.map((t) => <button key={t.id} type="button" className={`bm-chip ${t.side}`} onClick={() => onMove?.(t.id, { x: 50, y: 50 })}>{t.name}</button>)}
        </p>
      ) : null}
    </div>
  );
}
