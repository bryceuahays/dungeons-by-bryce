'use client';
import { useEffect, useRef } from 'react';

// The starfield canvas from the source sites, unchanged apart from cleanup on unmount.
export function Starfield() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    const x = c?.getContext('2d');
    if (!c || !x) return;
    type Star = { x: number; y: number; r: number; p: number; s: number; c: string };
    let S: Star[] = [], w = 0, h = 0, raf = 0;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    function draw(t: number) {
      x!.clearRect(0, 0, w, h);
      for (const s of S) { const a = still ? 0.7 : 0.45 + 0.4 * Math.sin(s.p + t * 0.0006 * s.s); x!.fillStyle = `rgba(${s.c},${a})`; x!.beginPath(); x!.arc(s.x, s.y, s.r, 0, 6.28); x!.fill(); }
    }
    function size() {
      const d = Math.min(window.devicePixelRatio || 1, 2); w = c!.width = innerWidth * d; h = c!.height = innerHeight * d;
      S = Array.from({ length: Math.round(innerWidth * innerHeight / 5200) }, () => ({ x: Math.random() * w, y: Math.random() * h, r: (Math.random() * 1.2 + 0.3) * d, p: Math.random() * 6.28, s: Math.random() * 0.9 + 0.2, c: Math.random() < 0.12 ? '255,190,140' : Math.random() < 0.3 ? '170,195,255' : '235,230,215' }));
      draw(0);
    }
    function loop(t: number) { draw(t); raf = requestAnimationFrame(loop); }
    addEventListener('resize', size); size(); if (!still) raf = requestAnimationFrame(loop);
    return () => { removeEventListener('resize', size); cancelAnimationFrame(raf); };
  }, []);
  return <canvas id="stars" ref={ref} aria-hidden="true" />;
}
