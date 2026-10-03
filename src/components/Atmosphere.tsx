'use client';
import { useEffect, useRef } from 'react';

// The landing page's moving air: a lantern glow that follows the cursor (or drifts by
// itself on touch screens) and slow dust with a few amber sparks. Nothing here runs
// when the visitor has asked for reduced motion.
export function Atmosphere() {
  const lantern = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const glow = lantern.current, c = canvas.current;
    const hero = glow?.parentElement;
    const ctx = c?.getContext('2d');
    if (!glow || !c || !hero || !ctx) return;

    // ---- lantern
    const touch = window.matchMedia('(hover: none), (pointer: coarse)').matches;
    let tx = 0, ty = 0, x = 0, y = 0, seen = false;
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      const r = hero.getBoundingClientRect();
      tx = e.clientX - r.left; ty = e.clientY - r.top;
      if (!seen) { seen = true; x = tx; y = ty; glow.classList.add('on'); }
    };
    const onLeave = () => { seen = false; glow.classList.remove('on'); };
    if (touch) glow.classList.add('drift');
    else { hero.addEventListener('pointermove', onMove); hero.addEventListener('pointerleave', onLeave); }

    // ---- dust
    type Mote = { x: number; y: number; r: number; vx: number; vy: number; a: number; p: number; s: number; amber: boolean; life: number };
    let w = 0, h = 0, d = 1, motes: Mote[] = [], raf = 0, last = 0;
    const mote = (amber: boolean, anywhere: boolean): Mote => ({
      x: Math.random() * w, y: anywhere ? Math.random() * h : h * (0.55 + Math.random() * 0.4),
      r: (amber ? 0.7 + Math.random() * 0.8 : 0.5 + Math.random() * 1.4) * d,
      vx: (Math.random() - 0.5) * 5 * d, vy: -(amber ? 9 + Math.random() * 10 : 1.5 + Math.random() * 5) * d,
      a: amber ? 0.5 + Math.random() * 0.3 : 0.07 + Math.random() * 0.26, p: Math.random() * 6.28, s: 0.3 + Math.random() * 0.8, amber, life: 1,
    });
    const size = () => {
      d = Math.min(window.devicePixelRatio || 1, 2);
      w = c.width = hero.clientWidth * d; h = c.height = hero.clientHeight * d;
      const n = Math.max(26, Math.min(90, Math.round((hero.clientWidth * hero.clientHeight) / 16000)));
      motes = Array.from({ length: n }, () => mote(false, true)).concat(Array.from({ length: 5 }, () => mote(true, true)));
    };
    const frame = (t: number) => {
      const dt = Math.min(0.05, (t - last) / 1000 || 0); last = t;
      if (!touch && seen) { x += (tx - x) * 0.085; y += (ty - y) * 0.085; glow.style.transform = `translate3d(${x}px,${y}px,0)`; }
      ctx.clearRect(0, 0, w, h);
      for (let i = 0; i < motes.length; i++) {
        const m = motes[i];
        m.x += (m.vx + Math.sin(t * 0.0003 * m.s + m.p) * 4 * d) * dt; m.y += m.vy * dt;
        if (m.amber) m.life -= dt * 0.16;
        if (m.y < -10 || m.x < -10 || m.x > w + 10 || m.life <= 0) { motes[i] = mote(m.amber, false); if (!m.amber) motes[i].y = h + 5; continue; }
        const tw = 0.6 + 0.4 * Math.sin(t * 0.0011 * m.s + m.p);
        ctx.fillStyle = m.amber ? `rgba(255,178,96,${m.a * tw * Math.min(1, m.life * 2)})` : `rgba(196,232,238,${m.a * tw})`;
        ctx.beginPath(); ctx.arc(m.x, m.y, m.r, 0, 6.28); ctx.fill();
      }
      raf = requestAnimationFrame(frame);
    };
    size();
    window.addEventListener('resize', size);
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', size);
      hero.removeEventListener('pointermove', onMove);
      hero.removeEventListener('pointerleave', onLeave);
    };
  }, []);

  return (
    <>
      <div className="lantern" ref={lantern} aria-hidden="true" />
      <canvas className="dust" ref={canvas} aria-hidden="true" />
    </>
  );
}
