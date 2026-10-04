'use client';
/* eslint-disable @typescript-eslint/no-explicit-any, @next/next/no-img-element */
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import type { Entry, ToolProps } from '@/lib/entry-types';
import { UpgradeHint } from '../UpgradeHint';
import { VisPicker, visLabel } from '../VisPicker';
import { Problem, uploadPicture, useEntries, visOf } from './kit';

type Pt = [number, number];

// Pan and zoom by mouse (drag, wheel) and by touch (drag, pinch). A press that does not
// move counts as a tap and is passed to onTap with its position on the map (0 to 1).
function MapView({ src, ratio, children, onTap, version }: { src: string; ratio: number; children: React.ReactNode; onTap?: (x: number, y: number) => void; version: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [t, setT] = useState({ x: 0, y: 0, k: 1 });
  const ptrs = useRef(new Map<number, { x: number; y: number }>());
  const moved = useRef(false);
  const last = useRef<{ d: number; cx: number; cy: number } | null>(null);
  const clamp = (n: { x: number; y: number; k: number }) => {
    const r = box.current!.getBoundingClientRect();
    const k = Math.max(1, Math.min(8, n.k));
    return { k, x: Math.min(0, Math.max(r.width - r.width * k, n.x)), y: Math.min(0, Math.max(r.height - r.height * k, n.y)) };
  };
  const zoomAt = (cx: number, cy: number, factor: number) => setT((p) => { const k = Math.max(1, Math.min(8, p.k * factor)); const f = k / p.k; return clamp({ k, x: cx - (cx - p.x) * f, y: cy - (cy - p.y) * f }); });
  useEffect(() => {
    const el = box.current!;
    const wheel = (e: WheelEvent) => { e.preventDefault(); const r = el.getBoundingClientRect(); zoomAt(e.clientX - r.left, e.clientY - r.top, e.deltaY < 0 ? 1.2 : 1 / 1.2); };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, []);
  const down = (e: React.PointerEvent) => { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY }); moved.current = false; last.current = null; };
  const move = (e: React.PointerEvent) => {
    const prev = ptrs.current.get(e.pointerId);
    if (!prev) return;
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...ptrs.current.values()];
    const r = box.current!.getBoundingClientRect();
    if (pts.length === 1) {
      const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) moved.current = true;
      setT((p) => clamp({ ...p, x: p.x + dx, y: p.y + dy }));
    } else if (pts.length === 2) {
      moved.current = true;
      const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y), cx = (pts[0].x + pts[1].x) / 2 - r.left, cy = (pts[0].y + pts[1].y) / 2 - r.top;
      if (last.current) zoomAt(cx, cy, d / last.current.d);
      last.current = { d, cx, cy };
    }
  };
  const up = (e: React.PointerEvent) => {
    const had = ptrs.current.size;
    ptrs.current.delete(e.pointerId);
    last.current = null;
    if (had === 1 && !moved.current && onTap) {
      const r = box.current!.getBoundingClientRect();
      onTap(Math.max(0, Math.min(1, (e.clientX - r.left - t.x) / (r.width * t.k))), Math.max(0, Math.min(1, (e.clientY - r.top - t.y) / (r.height * t.k))));
    }
  };
  return (
    <div className="mapwrap">
      <div ref={box} className="mapbox" style={{ aspectRatio: String(ratio) }} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        <div className="mapin" style={{ transform: `translate(${t.x}px, ${t.y}px) scale(${t.k})` }}>
          <img key={version} src={src} alt="" draggable={false} />
          {children}
        </div>
      </div>
      <p className="row mapzoom">
        <button type="button" className="act sm" onClick={() => { const r = box.current!.getBoundingClientRect(); zoomAt(r.width / 2, r.height / 2, 1.5); }} aria-label="Zoom in">Zoom in</button>
        <button type="button" className="act sm" onClick={() => { const r = box.current!.getBoundingClientRect(); zoomAt(r.width / 2, r.height / 2, 1 / 1.5); }} aria-label="Zoom out">Zoom out</button>
        <button type="button" className="act sm" onClick={() => setT({ x: 0, y: 0, k: 1 })}>Fit</button>
        <span className="muted">Drag to move. Pinch or scroll to zoom.</span>
      </p>
    </div>
  );
}

export function MapsTool(p: ToolProps & { initial: Entry[]; beats: { id: string; title: string; status: string }[] }) {
  const { rows, save, remove, msg, setMsg } = useEntries(p.initial);
  const maps = rows.filter((r) => r.kind === 'map').sort((a, b) => a.sort - b.sort || a.created_at.localeCompare(b.created_at));
  const [current, setCurrent] = useState<string | null>(maps[0]?.id ?? null);
  const [mode, setMode] = useState<'look' | 'pin' | 'region'>('look');
  const [draft, setDraft] = useState<Pt[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState('');
  const map = maps.find((m) => m.id === current) ?? maps[0] ?? null;
  const regions = rows.filter((r) => r.kind === 'region' && r.parent === map?.id);
  const pins = rows.filter((r) => r.kind === 'pin' && r.parent === map?.id);
  const selected = rows.find((r) => r.id === sel) ?? null;
  // the painted copy a player gets depends on which regions are hidden, so the address changes when they do
  const version = regions.map((r) => r.id + r.vis + (r.vis_stage ?? '') + (r.vis_entry ?? '')).join('.') + p.beats.filter((b) => b.status === 'hit').length;
  const canPin = p.dm || p.can.maps_plus;
  const who = (id: string | null) => (id === p.userId ? 'you' : p.members.find((m) => m.user_id === id)?.display_name ?? 'a player');

  const addMap = async (file: File) => {
    setBusy(true);
    const up = await uploadPicture(p.campaignId, 'maps', file, 4096);
    if (up.error) { setMsg({ error: up.error }); setBusy(false); return; }
    const r = await save({ campaign_id: p.campaignId, kind: 'map', title: title.trim() || 'Map', vis: 'all', sort: (maps.at(-1)?.sort ?? 0) + 10, data: { file: up.path, w: up.w, h: up.h } });
    setBusy(false);
    if (r.row) { setCurrent(r.row.id); setTitle(''); }
  };
  const tap = async (x: number, y: number) => {
    if (!map || !p.canWrite) return;
    if (mode === 'region') return setDraft([...draft, [Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000]]);
    if (mode === 'pin') {
      const r = await save(p.dm
        ? { campaign_id: p.campaignId, kind: 'pin', parent: map.id, title: 'New pin', vis: 'dm', data: { x, y, note: '' } }
        : { campaign_id: p.campaignId, kind: 'pin', parent: map.id, title: 'My pin', owner: p.userId, live: true, vis: 'all', vis_players: [], data: { x, y, note: '' } });
      setMode('look');
      if (r.row) setSel(r.row.id);
    }
  };
  const finishRegion = async () => {
    if (!map || draft.length < 3) return;
    const r = await save({ campaign_id: p.campaignId, kind: 'region', parent: map.id, title: 'Hidden area ' + (regions.length + 1), vis: 'dm', data: { pts: draft } });
    setDraft([]); setMode('look');
    if (r.row) setSel(r.row.id);
  };

  return (
    <div className="wrap">
      <h2>Maps</h2>
      <p className="lede">{p.dm ? 'Upload a picture exported from any map tool. Cover what the party has not found yet, and drop pins as the story moves.' : 'Where you have been, and where you might go.'}</p>
      <Problem r={msg} />
      {maps.length > 1 ? <p className="chips">{maps.map((m) => <button type="button" key={m.id} className="fchip" aria-pressed={m.id === map?.id} onClick={() => { setCurrent(m.id); setSel(null); setDraft([]); setMode('look'); }}>{m.title}</button>)}</p> : null}

      {map ? (
        <>
          <h3>{map.title} {p.dm ? <span className={'pillb ' + (map.vis === 'dm' ? 'dm' : 'pl')}>{visLabel(visOf(map), p.stages, p.members)}</span> : null}</h3>
          {p.canWrite && (p.dm || canPin) ? (
            <p className="row">
              <button type="button" className="fchip" aria-pressed={mode === 'look'} onClick={() => { setMode('look'); setDraft([]); }}>Look around</button>
              <button type="button" className="fchip" aria-pressed={mode === 'pin'} onClick={() => { setMode('pin'); setDraft([]); }}>Add a pin</button>
              {p.dm && p.can.maps_plus ? <button type="button" className="fchip" aria-pressed={mode === 'region'} onClick={() => setMode('region')}>Draw a hidden area</button> : null}
              {mode === 'pin' ? <span className="muted">Tap the map where the pin goes.</span> : null}
              {mode === 'region' ? <><span className="muted">Tap around the edge of the area ({draft.length} point{draft.length === 1 ? '' : 's'}).</span><button type="button" className="act sm" disabled={draft.length < 3} onClick={finishRegion}>Finish area</button><button type="button" className="act sm" disabled={!draft.length} onClick={() => setDraft(draft.slice(0, -1))}>Undo point</button></> : null}
            </p>
          ) : null}
          <MapView src={`${p.base ?? '/c/' + p.slug}/map/${map.id}?v=${encodeURIComponent(version.slice(-40) + (map.data.file ?? '').slice(-8))}`} ratio={(Number(map.data.w) || 4) / (Number(map.data.h) || 3)} onTap={mode === 'look' ? undefined : tap} version={version}>
            <svg className="mapsvg" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true">
              {p.dm ? regions.map((r) => <polygon key={r.id} className={'reg ' + (r.vis === 'all' ? 'open' : 'shut') + (sel === r.id ? ' sel' : '')} points={(r.data.pts as Pt[]).map(([x, y]) => `${x * 1000},${y * 1000}`).join(' ')} onPointerUp={(e) => { if (mode === 'look') { e.stopPropagation(); setSel(r.id); } }} />) : null}
              {draft.length ? <polyline className="reg draft" points={draft.map(([x, y]) => `${x * 1000},${y * 1000}`).join(' ')} /> : null}
            </svg>
            {pins.map((pin) => (
              <button key={pin.id} type="button" className={'pin' + (pin.vis === 'dm' || (p.dm && pin.vis === 'entry' && !p.beats.find((b) => b.id === pin.vis_entry && b.status === 'hit')) ? ' dm' : '') + (pin.owner && pin.owner !== p.userId && !p.dm ? ' theirs' : '') + (sel === pin.id ? ' sel' : '')}
                style={{ left: `${Number(pin.data.x) * 100}%`, top: `${Number(pin.data.y) * 100}%` }} aria-label={'Pin: ' + pin.title}
                onPointerDown={(e) => e.stopPropagation()} onPointerUp={(e) => e.stopPropagation()} onClick={() => setSel(pin.id)}><span>{pin.title}</span></button>
            ))}
          </MapView>

          {selected && selected.kind === 'pin' ? <PinPanel key={selected.id} pin={selected} p={p} maps={maps} save={save} remove={async (id) => { await remove(id); setSel(null); }} go={(id) => { setCurrent(id); setSel(null); }} who={who} /> : null}
          {selected && selected.kind === 'region' && p.dm ? (
            <div className="plate">
              <h3>{selected.title}</h3>
              <p className="muted">While an area is hidden, the picture your players receive has it painted over. Choose when it opens.</p>
              <VisPicker value={visOf(selected)} stages={p.stages} members={p.members} beats={p.beats} allow={['dm', 'all', 'stage', 'entry']} disabled={!p.canWrite}
                onChange={(v) => save({ id: selected.id, campaign_id: p.campaignId, kind: 'region', ...v })} />
              <p className="row" style={{ marginTop: 10 }}>
                {selected.vis !== 'all' ? <button type="button" className="act" disabled={!p.canWrite} onClick={() => save({ id: selected.id, campaign_id: p.campaignId, kind: 'region', vis: 'all' })}>Reveal it now</button> : <button type="button" className="act sm" disabled={!p.canWrite} onClick={() => save({ id: selected.id, campaign_id: p.campaignId, kind: 'region', vis: 'dm' })}>Hide it again</button>}
                <button type="button" className="act sm danger" disabled={!p.canWrite} onClick={async () => { await remove(selected.id); setSel(null); }}>Delete this area</button>
              </p>
            </div>
          ) : null}

          {p.dm ? (
            <details className="plate">
              <summary>This map: who sees it, and removing it</summary>
              <p style={{ marginTop: 10 }}><VisPicker value={visOf(map)} stages={p.stages} members={p.members} allow={['all', 'dm', 'stage']} disabled={!p.canWrite} onChange={(v) => save({ id: map.id, campaign_id: p.campaignId, kind: 'map', ...v })} /></p>
              <p className="muted">{regions.length} hidden area{regions.length === 1 ? '' : 's'} drawn, {regions.filter((r) => r.vis === 'all').length} revealed. {pins.length} pin{pins.length === 1 ? '' : 's'}.</p>
              <p className="row"><button type="button" className="act sm danger" disabled={!p.canWrite} onClick={async () => { if (confirm(`Delete the map "${map.title}" with its areas and pins?`)) { await remove(map.id); setCurrent(null); setSel(null); } }}>Delete this map</button></p>
            </details>
          ) : null}
          {p.dm && !p.can.maps_plus ? <UpgradeHint feature="maps_plus" /> : null}
          {!p.dm && !p.can.maps_plus ? <p className="muted">Your DM can add pins to this map.</p> : null}
        </>
      ) : <p className="who">{p.dm ? 'No maps yet.' : 'Your DM has not shared a map yet.'}</p>}

      {p.dm && p.canWrite ? (
        maps.length && !p.can.maps_plus ? null : (
          <div className="plate">
            <h3>Add a map</h3>
            <div className="fields">
              <label className="f">Name (world, region, city…)<input value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} /></label>
              <label className="f">The picture (JPG, PNG or WebP)<input type="file" accept="image/*" disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) void addMap(f); e.target.value = ''; }} /></label>
            </div>
            <p className="muted">{busy ? 'Uploading…' : 'Very large pictures are shrunk to 4,096 pixels on the long side. Only upload maps you have the right to use.'}</p>
          </div>
        )
      ) : null}
    </div>
  );
}

function PinPanel({ pin, p, maps, save, remove, go, who }: { pin: Entry; p: ToolProps & { beats: { id: string; title: string; status: string }[] }; maps: Entry[]; save: (row: any) => Promise<any>; remove: (id: string) => Promise<void>; go: (mapId: string) => void; who: (id: string | null) => string }) {
  const mine = pin.owner === p.userId;
  const editable = p.canWrite && (p.dm || mine);
  const [title, setTitle] = useState(pin.title);
  const [note, setNote] = useState(String(pin.data.note ?? ''));
  const beat = p.beats.find((b) => b.id === (pin.data.beat ?? pin.vis_entry));
  const base = { id: pin.id, campaign_id: p.campaignId, kind: 'pin' };
  return (
    <div className="plate">
      {editable ? (
        <>
          <div className="fields">
            <label className="f">Pin name<input value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} onBlur={() => title.trim() && title !== pin.title && save({ ...base, title: title.trim() })} /></label>
            {p.dm && maps.length > 1 ? <label className="f">Leads to another map<select value={pin.data.toMap ?? ''} onChange={(e) => save({ ...base, data: { ...pin.data, toMap: e.target.value || undefined } })}><option value="">No</option>{maps.filter((m) => m.id !== pin.parent).map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}</select></label> : null}
          </div>
          <label className="f" style={{ marginTop: 10 }}>Note<textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} onBlur={() => note !== (pin.data.note ?? '') && save({ ...base, data: { ...pin.data, note } })} /></label>
          {p.dm ? (
            <p style={{ marginTop: 10 }}>
              <VisPicker value={visOf(pin)} stages={p.stages} members={p.members} beats={p.can.maps_plus ? p.beats : []} allow={['dm', 'all', 'stage', 'players', 'entry']} canName={p.can.player_secrets}
                onChange={(v) => save({ ...base, ...v, data: { ...pin.data, beat: v.vis === 'entry' ? v.vis_entry : undefined } })} />
            </p>
          ) : <label className="ck" style={{ marginTop: 10 }}><input type="checkbox" checked={pin.vis === 'players'} onChange={(e) => save({ ...base, vis: e.target.checked ? 'players' : 'all', vis_players: e.target.checked ? [p.userId] : [] })} /> Only I see this pin</label>}
          {p.dm && pin.vis === 'entry' ? <p className="muted">This pin appears for players by itself when that beat is marked as having happened.</p> : null}
          <p className="row" style={{ marginTop: 10 }}><button type="button" className="act sm danger" onClick={() => remove(pin.id)}>Delete pin</button></p>
        </>
      ) : (
        <>
          <h3>{pin.title}</h3>
          {pin.owner && pin.owner !== p.userId ? <p className="who">Added by {who(pin.owner)}</p> : null}
          {pin.data.note ? <p style={{ whiteSpace: 'pre-wrap' }}>{pin.data.note}</p> : null}
        </>
      )}
      <p className="row">
        {beat && (p.dm || beat.status === 'hit') ? <Link className="act sm" href={`${p.base ?? '/c/' + p.slug}/tools/timeline`}>On the timeline: {beat.title}</Link> : null}
        {pin.data.toMap && maps.some((m) => m.id === pin.data.toMap) ? <button type="button" className="act" onClick={() => go(pin.data.toMap)}>Go to {maps.find((m) => m.id === pin.data.toMap)!.title}</button> : null}
      </p>
    </div>
  );
}
