'use client';
/* eslint-disable @typescript-eslint/no-explicit-any, @next/next/no-img-element */
import { useState, useTransition, type ReactNode } from 'react';
import Link from 'next/link';
import type { Entry, ToolProps } from '@/lib/entry-types';
import { Problem, useEntries } from '@/components/tools/kit';
import { HiddenTag } from '@/features/hub/ui/Hidden';
import { useVisMode } from '@/features/hub/visibility/VisMode';
import { shortLabel } from '@/features/hub/visibility/model';
import { LORE_CATEGORIES, RARITY, STANDING, categoryOf, type LoreCategory, type LoreSettings } from '@/config/lore-categories';
import { LoreEditor } from './LoreEditor';
import { byPosition, foundLine, groupPlaces, loreMatches, placeType } from './model';
import { saveLoreCategories } from './actions';

type Named = { id: string; title: string };
export type LoreFeatures = { templates: boolean; bestiary: boolean; history: boolean };

// The Lore page (Lore.png): the world, by category, each category laid out its own way. A player's
// browser only ever has the entries the database let them read, and only their public part; this
// lays them out. The DM also adds and edits entries and chooses the categories.
export function LorePage(p: ToolProps & { initial: Entry[]; npcs: Named[]; lore: LoreSettings; features: LoreFeatures; mapsHref: string | null }) {
  const { rows, save, remove, msg } = useEntries(p.initial);
  const mode = useVisMode();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);   // an entry's id, or 'new:<category>'
  const [lore, setLore] = useState<LoreSettings>(p.lore);
  const [ownName, setOwnName] = useState('');
  const [catMsg, setCatMsg] = useState('');
  const [pending, start] = useTransition();
  const base = p.base ?? '/c/' + p.slug;
  const edit = p.dm && p.canWrite;
  const people = p.members.map((m) => ({ id: m.user_id, label: m.display_name || 'Unnamed' }));

  const all = rows.filter((r) => r.kind === 'lore');
  const inCat = (id: string) => all.filter((e) => e.data.cat === id);
  const shown = (id: string) => inCat(id).filter((e) => loreMatches(e, q));
  // the categories on the page: the campaign's, plus any that still has entries; a player sees only those with something in them
  const cats = [...new Set([...lore.cats, ...all.map((e) => String(e.data.cat))])].map((id) => categoryOf(id, lore)).filter((c): c is LoreCategory => !!c)
    .map((c) => (p.features.templates ? c : { ...c, fields: [{ key: 'summary', label: 'One-line summary (shown on the card)', kind: 'text' as const }, { key: 'description', label: 'Full description', kind: 'long' as const }], layout: c.layout === 'overview' ? c.layout : 'cards' as const }))
    .map((c) => (c.layout === 'bestiary' && !p.features.bestiary ? { ...c, layout: 'cards' as const } : c.layout === 'timeline' && !p.features.history ? { ...c, layout: 'cards' as const } : c))
    .filter((c) => p.dm || inCat(c.id).length);
  const regions = all.filter((e) => e.data.cat === 'places' && e.data.type === 'region').map((e) => ({ id: e.id, title: e.title }));
  const factions = all.filter((e) => e.data.cat === 'factions').map((e) => ({ id: e.id, title: e.title }));
  const titleOf = (list: Named[], ids: unknown) => (Array.isArray(ids) ? ids.map((id) => list.find((x) => x.id === id)?.title).filter(Boolean) : []) as string[];

  const changeCats = (next: LoreSettings) => start(async () => {
    const r = await saveLoreCategories(p.slug, next);
    if (r.lore) setLore(r.lore);
    setCatMsg(r.error ?? '');
  });

  const editor = (e: Partial<Entry>, cat: LoreCategory) => (
    <div className="lr-edit"><LoreEditor entry={e} cat={cat} p={p} regions={regions} npcs={p.npcs} factions={factions} save={save} remove={remove} close={() => setOpen(null)} /></div>
  );
  // the frame every entry gets: the dashed "hidden" look and its label for the DM, and Edit
  const Frame = ({ e, className, children }: { e: Entry; className: string; children: ReactNode }) => {
    const hidden = p.dm && e.vis !== 'all';
    return (
      <article className={className + (hidden ? ' hid' : '')} aria-label={e.title}>
        {hidden ? <HiddenTag>{shortLabel({ vis: e.vis, vis_players: e.vis_players, vis_stage: e.vis_stage, vis_entry: e.vis_entry }, people, p.stages, mode.beats.map((b) => ({ id: b.id, label: b.title })))}</HiddenTag> : null}
        {children}
        {edit ? <button type="button" className="lr-editbtn" onClick={() => setOpen(e.id)}>Edit<span className="lr-sr"> {e.title}</span></button> : null}
      </article>
    );
  };
  const pic = (e: Entry, label: string) => (e.data.file ? <img src={`${base}/file/${e.id}?v=${encodeURIComponent(String(e.data.file).slice(-12))}`} alt={label + ' ' + e.title} loading="lazy" /> : null);
  const more = (e: Entry, keys: string[]) => {
    const parts = keys.map((k) => [k, e.data[k]] as const).filter(([, v]) => typeof v === 'string' && v);
    return parts.length ? <details className="lr-more"><summary>Read more</summary>{parts.map(([k, v]) => <p key={k}>{String(v)}</p>)}</details> : null;
  };

  const section = (c: LoreCategory) => {
    const list = shown(c.id);
    const body = (() => {
      switch (c.layout) {
        case 'overview': return list.map((e) => open === e.id ? <div key={e.id}>{editor(e, c)}</div> : <Frame key={e.id} e={e} className="lr-ov"><h3>{e.title}</h3>{e.data.summary ? <p className="lr-text">{String(e.data.summary)}</p> : null}</Frame>);
        case 'timeline': return <div className="lr-time">{[...list].sort(byPosition).map((e) => open === e.id ? <div key={e.id} className="lr-span">{editor(e, c)}</div> : (
          <Frame key={e.id} e={e} className="lr-era"><span className="lr-when">{[e.data.when, e.data.now ? 'Now' : ''].filter(Boolean).join(' · ')}</span><h3>{e.title}</h3>
            {e.data.summary ? <p className="lr-text">{String(e.data.summary)}</p> : null}{e.data.figures ? <p className="lr-dim">Figures: {String(e.data.figures)}</p> : null}{more(e, ['events'])}</Frame>
        ))}</div>;
        case 'places': return groupPlaces(list).map((g) => (
          <div key={g.region?.id ?? 'loose'} className="lr-region">
            {g.region ? (open === g.region.id ? editor(g.region, c) : (
              <Frame e={g.region} className="lr-rhead"><p><span aria-hidden="true">⌖ </span><b>{g.region.title}</b>{g.region.data.summary ? <span className="lr-dim"> · {String(g.region.data.summary)}</span> : null}</p></Frame>
            )) : groupPlaces(list).length > 1 ? <p className="lr-rhead"><b>Other places</b></p> : null}
            <div className="lr-cards">{g.places.map((e) => open === e.id ? <div key={e.id} className="lr-span">{editor(e, c)}</div> : (
              <Frame key={e.id} e={e} className="lr-card">
                <div className="lr-pic">{pic(e, 'Picture of') ?? <span className="lr-dim">Place</span>}</div>
                <div className="lr-cbody"><span className="lr-type">{placeType(e)}</span><h3>{e.title}</h3>{e.data.summary ? <p className="lr-text">{String(e.data.summary)}</p> : null}
                  {titleOf(p.npcs, e.data.npcs).length || titleOf(factions, e.data.factions).length ? <p className="lr-dim">{[...titleOf(p.npcs, e.data.npcs), ...titleOf(factions, e.data.factions)].join(' · ')}</p> : null}
                  {foundLine(e.data) ? <p className="lr-dim">{foundLine(e.data)}</p> : null}{more(e, ['description'])}</div>
              </Frame>
            ))}</div>
          </div>
        ));
        case 'factions': return list.map((e) => open === e.id ? <div key={e.id}>{editor(e, c)}</div> : (
          <Frame key={e.id} e={e} className="lr-row">
            <div className="lr-sym">{pic(e, 'Symbol of') ?? <span>Symbol</span>}</div>
            <div className="lr-rbody"><div className="lr-name"><h3>{e.title}</h3>{e.data.standing ? <span className={'lr-stand ' + String(e.data.standing)}>{STANDING.find(([s]) => s === e.data.standing)?.[1]}</span> : null}</div>
              {e.data.leader || e.data.base ? <p className="lr-dim">{[e.data.leader ? `Led by ${e.data.leader}` : '', e.data.base ? `Based in ${e.data.base}` : ''].filter(Boolean).join(' · ')}</p> : null}
              {e.data.goals ? <p className="lr-text">Goal: {String(e.data.goals)}</p> : null}
              {e.data.allies || e.data.rivals ? <p className="lr-dim">{[e.data.allies ? `Allies: ${e.data.allies}` : '', e.data.rivals ? `Rivals: ${e.data.rivals}` : ''].filter(Boolean).join(' · ')}</p> : null}{more(e, ['description'])}</div>
          </Frame>
        ));
        case 'religions': return list.map((e) => open === e.id ? <div key={e.id}>{editor(e, c)}</div> : (
          <Frame key={e.id} e={e} className="lr-row lr-deity">
            <div className="lr-rbody"><div className="lr-name"><h3>{e.title}</h3>{e.data.symbol ? <span className="lr-dim">Symbol: {String(e.data.symbol)}</span> : null}</div>
              {Array.isArray(e.data.domains) && e.data.domains.length ? <p className="lr-chips">{e.data.domains.map((d: string) => <span key={d}>{d}</span>)}</p> : null}
              {e.data.followers ? <p className="lr-dim">Worshipped by {String(e.data.followers)}</p> : null}
              {e.data.holy || e.data.temples ? <p className="lr-dim">{[e.data.holy ? `Holy days: ${e.data.holy}` : '', e.data.temples ? `Temples: ${e.data.temples}` : ''].filter(Boolean).join(' · ')}</p> : null}{more(e, ['description'])}</div>
          </Frame>
        ));
        case 'bestiary': return list.map((e) => open === e.id ? <div key={e.id}>{editor(e, c)}</div> : (
          <Frame key={e.id} e={e} className="lr-row lr-beast">
            <div className="lr-rbody"><div className="lr-name"><h3>{e.title}</h3><span className="lr-dim">{[e.data.type, e.data.habitat].filter(Boolean).join(' · ')}</span></div>
              {e.data.behavior ? <p className="lr-text">{String(e.data.behavior)}</p> : null}
              <p className="lr-label">What you&apos;ve learned</p>
              <ul className="lr-facts">
                {(Array.isArray(e.data.learned) ? e.data.learned : []).map((f: any, i: number) => <li key={i}><span>{String(f.text)}</span>{f.session ? <small>Session {f.session}</small> : null}</li>)}
                {p.dm ? (Array.isArray(e.secret?.unlearned) ? e.secret!.unlearned : []).map((f: any, i: number) => <li key={'u' + i} className="lr-unlearned"><span>{String(f.text)}</span><small>Not learned yet</small></li>)
                  : Number(e.data.more) > 0 ? <li className="lr-unknown"><span>??? Not learned yet</span><small>{Number(e.data.more)} more</small></li> : null}
                {!(Array.isArray(e.data.learned) && e.data.learned.length) && !Number(e.data.more) && !(p.dm && Array.isArray(e.secret?.unlearned) && e.secret!.unlearned.length) ? <li className="lr-dim">Nothing yet.</li> : null}
              </ul>
            </div>
          </Frame>
        ));
        case 'items': return list.map((e) => open === e.id ? <div key={e.id}>{editor(e, c)}</div> : (
          <Frame key={e.id} e={e} className="lr-row">
            <div className="lr-sym lr-square">{pic(e, 'Picture of') ?? <span>Item</span>}</div>
            <div className="lr-rbody"><h3>{e.title}</h3>
              {e.data.rarity || e.data.attune ? <p className="lr-rarity">{[RARITY.find(([r]) => r === e.data.rarity)?.[1], e.data.attune ? 'Requires attunement' : ''].filter(Boolean).join(' · ')}</p> : null}
              {e.data.legend ? <p className="lr-text">{String(e.data.legend)}</p> : null}{e.data.holder ? <p className="lr-dim">Last seen with {String(e.data.holder)}</p> : null}</div>
          </Frame>
        ));
        default: return <div className="lr-cards">{list.map((e) => open === e.id ? <div key={e.id} className="lr-span">{editor(e, c)}</div> : (
          <Frame key={e.id} e={e} className="lr-card lr-plain"><div className="lr-cbody"><h3>{e.title}</h3>
            {c.fields.filter((f) => f.kind === 'text' && f.key !== 'summary' && e.data[f.key]).map((f) => <p key={f.key} className="lr-dim">{f.label}: {String(e.data[f.key])}</p>)}
            {e.data.summary ? <p className="lr-text">{String(e.data.summary)}</p> : null}{more(e, c.fields.filter((f) => f.kind === 'long' && f.key !== 'summary').map((f) => f.key))}</div></Frame>
        ))}</div>;
      }
    })();
    const empty = !inCat(c.id).length;
    return (
      <section key={c.id} id={'lore-' + c.id} className="lr-sec" aria-labelledby={'lore-h-' + c.id}>
        <div className="lr-head">
          <h2 id={'lore-h-' + c.id}>{c.name}</h2>
          <span className="lr-headacts">
            {c.id === 'places' && p.mapsHref && list.length ? <Link href={p.mapsHref}>See on the map →</Link> : null}
            {edit ? <button type="button" className="lr-addbtn" onClick={() => setOpen('new:' + c.id)}>+ Add</button> : null}
            {edit && empty ? <button type="button" className="lr-quiet" disabled={pending} onClick={() => changeCats({ cats: lore.cats.filter((x) => x !== c.id), custom: lore.custom.filter((x) => x.id !== c.id) })}>Remove category</button> : null}
          </span>
        </div>
        {open === 'new:' + c.id ? editor({}, c) : null}
        {list.length ? body : <p className="lr-dim">{q ? 'Nothing here matches.' : edit ? `Nothing yet. ${c.what}` : 'Nothing yet.'}</p>}
      </section>
    );
  };

  const addable = LORE_CATEGORIES.filter((c) => !lore.cats.includes(c.id));
  return (
    <div className="wrap lr">
      <header className="lr-top">
        <div>
          <h1>Lore</h1>
          <p className="lr-lede">{p.dm ? 'Your world, by category. Dashed purple entries are hidden from players.' : 'What your party knows about the world. More appears as you discover it.'}</p>
        </div>
        <label className="lr-search"><span className="lr-sr">Search lore</span><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search lore" /></label>
      </header>
      {cats.length ? (
        <nav className="lr-jumps" aria-label="Categories">
          {cats.map((c) => <a key={c.id} href={'#lore-' + c.id}>{c.short}<span>{inCat(c.id).length}</span></a>)}
        </nav>
      ) : null}
      <Problem r={msg} />
      {cats.map(section)}
      {!cats.length ? <p className="lr-dim">{p.dm ? 'Add a category below to start.' : 'Nothing has been discovered yet.'}</p> : null}
      {!p.dm ? <p className="lr-waiting"><span aria-hidden="true">🔒︎ </span>More of this world is waiting to be discovered.</p> : null}

      {edit ? (
        <section className="lr-sec lr-addcats" aria-labelledby="lore-add">
          <h2 id="lore-add">Add a category</h2>
          {addable.length ? <p className="lr-chips lr-pick">{addable.map((c) => <button key={c.id} type="button" disabled={pending} title={c.what} onClick={() => changeCats({ ...lore, cats: [...lore.cats, c.id] })}>+ {c.name}</button>)}</p> : null}
          <form className="lr-own" onSubmit={(e) => { e.preventDefault(); const name = ownName.trim(); if (!name) return; changeCats({ cats: lore.cats, custom: [...lore.custom, { id: 'c-' + Math.random().toString(36).slice(2, 10), name }] }); setOwnName(''); }}>
            <label className="f">Make your own category<input value={ownName} maxLength={40} placeholder="Noble houses" onChange={(e) => setOwnName(e.target.value)} /></label>
            <button className="act" disabled={pending || !ownName.trim()}>Add it</button>
          </form>
          {catMsg ? <p className="err" role="alert">{catMsg}</p> : null}
          <p className="lr-dim">A category with nothing in it can be removed. One with entries stays, so nothing is lost.</p>
        </section>
      ) : null}
    </div>
  );
}
