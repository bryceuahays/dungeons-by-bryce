'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useRef, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { ABILITIES, blankV2, derive, sgn, type Ability, type CharacterV2, type Entity } from '@/lib/rules/engine';
import { EntityCard } from './EntityCard';
import { yearOf } from '@/config/rules';

// A spell on the sheet. The long text of SRD spells is not sent with the page (there are
// hundreds); it is fetched the first time a spell is opened.
function SpellDetail({ entity }: { entity: Entity }) {
  const [data, setData] = useState<any>(entity.data._lite ? null : entity.data);
  useEffect(() => {
    if (data) return;
    let gone = false;
    supabaseBrowser().from('entities').select('data').eq('id', entity.id).maybeSingle().then(({ data: row }: { data: { data: unknown } | null }) => { if (!gone && row) setData(row.data); });
    return () => { gone = true; };
  }, [entity.id, data]);
  return data ? <EntityCard type="spell" name={entity.name} source={entity.source} data={data} compact /> : <p className="who">Loading…</p>;
}


// The standard fifth edition character sheet. Choices (race, class, level, scores) are
// typed in; everything else is worked out from the SRD and homebrew entries the
// campaign uses, so a structured effect on an entry shows up here by itself.
export function Sheet5e({ character, entities, readOnly = false, play = false }: { character: { id: string; data: any }; entities: Entity[]; readOnly?: boolean; play?: boolean }) {
  const [c, setC] = useState<CharacterV2>(() => ({ ...blankV2(), ...(character.data ?? {}), v: 2 }));
  const [state, setState] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(c);
  const d = useMemo(() => derive(c, entities), [c, entities]);
  const of = (t: string) => entities.filter((e) => e.type === t).sort((a, b) => a.name.localeCompare(b.name));

  const flush = async () => {
    timer.current = null;
    const data = latest.current;
    const { error } = await supabaseBrowser().from('characters').update({ data: { ...data, t: Date.now() } }).eq('id', character.id);
    setState(error ? 'Not saved. Check your connection.' : 'Saved.');
  };
  const up = (patch: Partial<CharacterV2>) => {
    if (readOnly) return;
    const next = { ...latest.current, ...patch };
    // the party list reads the names
    const byId = new Map(entities.map((e) => [e.id, e]));
    next.race = next.raceId ? byId.get(next.raceId)?.name ?? '' : '';
    next.cls = next.clsId ? byId.get(next.clsId)?.name ?? '' : '';
    latest.current = next;
    setC(next);
    setState('Saving…');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, 700);
  };
  useEffect(() => () => { if (timer.current) { clearTimeout(timer.current); void flush(); } }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const used = c.used ?? {}, slotsUsed = c.slotsUsed ?? {};
  const anyCount = d.chosen.flatMap((e) => (e.data.effects ?? [])).filter((x: any) => x.t === 'ability' && x.ab === 'any').length;
  const rest = (kind: 'short' | 'long') => {
    const nu = { ...used };
    d.resources.forEach((r) => {
      if (kind === 'long' ? r.recharge !== 'none' : r.recharge === 'short') delete nu[r.name];
      else if (kind === 'short' && r.recharge === 'short1' && nu[r.name]) nu[r.name] = Math.max(0, Number(nu[r.name]) - 1);
    });
    up({ used: nu, ...(kind === 'long' || d.casting?.shortRest ? { slotsUsed: {} } : {}), ...(kind === 'long' ? { hp: d.hpMax, temp: 0 } : {}) });
  };
  const subs = of('subclass').filter((s) => !d.cls || !s.data.parent || String(s.data.parent).toLowerCase() === d.cls.name.toLowerCase());
  const maxSpell = d.casting ? d.casting.slots.length : 0;
  const list: string[] | undefined = Array.isArray(d.cls?.data.spellList) && d.cls.data.spellList.length ? d.cls.data.spellList : undefined;
  const classSpells = of('spell').filter((s) => Number(s.data.level) <= Math.max(maxSpell, 0) && (list ? list.includes(s.id) : !d.cls || !(s.data.classes ?? []).length || (s.data.classes ?? []).map((x: string) => x.toLowerCase().trim()).includes(d.cls.name.toLowerCase())));
  const known = (c.spells ?? []).map((id) => entities.find((e) => e.id === id)).filter(Boolean) as Entity[];
  const grantedSpells = d.granted.map((g) => ({ ...g, entity: entities.find((e) => e.type === 'spell' && e.name.toLowerCase() === g.name.toLowerCase()) }));
  const hp = c.hp ?? d.hpMax;
  const [opened, setOpened] = useState<string[]>([]);
  const both = new Set(entities.filter((e) => e.source === 'srd').map((e) => e.srd_version)).size > 1;
  const tag = (e: Entity) => (e.source === 'srd' ? (both ? ` (${yearOf(e.srd_version)})` : '') : e.status === 'playtest' ? ' (homebrew, playtest)' : ' (homebrew)');


  const vitals = (
    <section className="s5-block">
      <div className="s5-stats">
        <label className="s5-stat">Hit points<span className="s5-hp"><button type="button" onClick={() => up({ hp: Math.max(0, hp - 1) })} aria-label="Lose 1 hit point">−</button><input type="number" value={hp} onChange={(e) => up({ hp: Number(e.target.value) })} aria-label="Current hit points" /><button type="button" onClick={() => up({ hp: Math.min(d.hpMax, hp + 1) })} aria-label="Gain 1 hit point">+</button></span><small>of {d.hpMax}</small></label>
        <label className="s5-stat">Temporary<input type="number" value={c.temp ?? 0} onChange={(e) => up({ temp: Number(e.target.value) })} /></label>
        <div className="s5-stat">Armor class<b>{d.ac}</b></div>
        <div className="s5-stat">Initiative<b>{sgn(d.initiative)}</b></div>
        <div className="s5-stat">Speed<b>{d.speed.walk} ft</b><small>{Object.entries(d.speed).filter(([k]) => k !== 'walk').map(([k, v]) => `${k} ${v}`).join(', ')}</small></div>
        <div className="s5-stat">Proficiency<b>+{d.prof}</b></div>
        <div className="s5-stat">Passive Perception<b>{d.passive}</b></div>
        <div className="s5-stat">Hit dice<b>{d.level}d{d.hd}</b></div>
      </div>
      <p className="row"><button type="button" className="act sm" onClick={() => rest('short')}>Short rest</button><button type="button" className="act sm" onClick={() => rest('long')}>Long rest</button><span className="who" role="status">{readOnly ? 'Read-only' : state}</span></p>
    </section>
  );

  const resources = d.resources.length || d.scales.length ? (
    <section className="s5-block">
      <h3>Resources</h3>
      {d.resources.map((r) => {
        const u = Math.min(r.max, used[r.name] ?? 0), big = r.max > 12;
        return (
          <div key={r.name + r.from} className="s5-res">
            <span><b>{r.name}</b> <small>{r.from} · {r.recharge === 'none' ? 'does not recharge' : r.recharge === 'short1' ? 'one back on a short rest, all on a long rest' : r.recharge + ' rest'}</small></span>
            {r.unlimited ? <span>Unlimited</span> : big
              ? <span className="s5-hp"><button type="button" onClick={() => up({ used: { ...used, [r.name]: Math.min(r.max, u + 1) } })} aria-label={'Spend one ' + r.name}>−</button><b>{r.max - u} / {r.max}</b><button type="button" onClick={() => up({ used: { ...used, [r.name]: Math.max(0, u - 1) } })} aria-label={'Regain one ' + r.name}>+</button></span>
              : <span className="s5-pips">{Array.from({ length: r.max }, (_, i) => <button type="button" key={i} aria-pressed={i < u} aria-label={`${r.name} use ${i + 1}${i < u ? ', spent' : ''}`} onClick={() => up({ used: { ...used, [r.name]: i < u ? i : i + 1 } })} />)}</span>}
          </div>
        );
      })}
      {d.scales.map((s) => <div key={s.name + s.from} className="s5-res"><span><b>{s.name}</b> <small>{s.from}</small></span><b>{s.value}</b></div>)}
    </section>
  ) : null;

  const magic = d.casting || grantedSpells.length ? (
    <section className="s5-block">
      <h3>Spells</h3>
      {d.casting ? <p className="kv"><b>Save DC</b> {d.casting.dc} · <b>Attack</b> {sgn(d.casting.attack)} · <b>Ability</b> {Object.fromEntries(ABILITIES)[d.casting.ability]}</p> : null}
      {d.casting ? d.casting.slots.map((n, i) => (n ? (
        <div key={i} className="s5-res"><span><b>Level {i + 1} slots</b></span>
          <span className="s5-pips">{Array.from({ length: n }, (_, k) => { const u = Math.min(n, slotsUsed[i + 1] ?? 0); return <button type="button" key={k} aria-pressed={k < u} aria-label={`Level ${i + 1} slot ${k + 1}${k < u ? ', spent' : ''}`} onClick={() => up({ slotsUsed: { ...slotsUsed, [i + 1]: k < u ? k : k + 1 } })} />; })}</span>
        </div>) : null)) : null}
      {[...grantedSpells.map((g) => ({ key: 'g' + g.name, name: g.name, from: g.from, entity: g.entity, id: null as string | null })), ...known.map((s) => ({ key: s.id, name: s.name, from: '', entity: s, id: s.id }))].map((s) => (
        <details key={s.key} className="s5-item" onToggle={(e) => { if ((e.target as HTMLDetailsElement).open) setOpened((o) => (o.includes(s.key) ? o : [...o, s.key])); }}>
          <summary><b>{s.name}</b> <small>{s.entity ? (Number(s.entity.data.level) ? 'level ' + s.entity.data.level : 'cantrip') : ''}{s.from ? ' · from ' + s.from : ''}</small></summary>
          {s.entity ? (opened.includes(s.key) ? <SpellDetail entity={s.entity} /> : null) : <p className="who">Ask your DM for the details of this spell.</p>}
          {s.id && !readOnly ? <button type="button" className="act sm" onClick={() => up({ spells: (c.spells ?? []).filter((x) => x !== s.id) })}>Remove</button> : null}
        </details>
      ))}
      {d.casting && !readOnly ? (
        <label className="f">Add a spell
          <select value="" onChange={(e) => { if (e.target.value) up({ spells: [...(c.spells ?? []), e.target.value] }); }}>
            <option value="">Choose…</option>
            {classSpells.filter((s) => !(c.spells ?? []).includes(s.id)).sort((a, b) => Number(a.data.level) - Number(b.data.level) || a.name.localeCompare(b.name)).map((s) => <option key={s.id} value={s.id}>{Number(s.data.level) ? `Level ${s.data.level}` : 'Cantrip'}: {s.name}{tag(s)}</option>)}
          </select>
        </label>
      ) : null}
    </section>
  ) : null;

  const pick = (label: string, type: string, key: 'raceId' | 'clsId' | 'subId' | 'bgId', list = of(type)) => (
    <label className="f">{label}
      <select value={c[key] ?? ''} onChange={(e) => up({ [key]: e.target.value || null, ...(key === 'clsId' ? { subId: null } : {}) } as any)}>
        <option value="">None yet</option>
        {list.map((e) => <option key={e.id} value={e.id}>{e.name}{tag(e)}</option>)}
        {c[key] && !list.some((e) => e.id === c[key]) ? <option value={c[key]!}>(no longer available)</option> : null}
      </select>
    </label>
  );

  const identity = (
    <section className="s5-block">
      <div className="fields">
        <label className="f">Character name<input value={c.name} maxLength={80} onChange={(e) => up({ name: e.target.value })} /></label>
        <label className="f">Level<input type="number" min={1} max={20} value={c.level} onChange={(e) => up({ level: Math.max(1, Math.min(20, Number(e.target.value) || 1)) })} /></label>
        {pick('Race', 'race', 'raceId')}
        {pick('Class', 'class', 'clsId')}
        {subs.length ? pick('Subclass', 'subclass', 'subId', subs) : null}
        {pick('Background', 'background', 'bgId')}
      </div>
      {of('feat').length ? (
        <label className="f" style={{ marginTop: 10 }}>Feats
          <select value="" onChange={(e) => { if (e.target.value) up({ feats: [...(c.feats ?? []), e.target.value] }); }}>
            <option value="">Add a feat…</option>
            {of('feat').filter((x) => !(c.feats ?? []).includes(x.id)).map((x) => <option key={x.id} value={x.id}>{x.name}{tag(x)}</option>)}
          </select>
        </label>
      ) : null}
      {(c.feats ?? []).length ? <p className="row">{(c.feats ?? []).map((id) => <button key={id} type="button" className="fchip" aria-pressed="true" onClick={() => up({ feats: (c.feats ?? []).filter((x) => x !== id) })} title="Remove">{entities.find((e) => e.id === id)?.name ?? 'Feat'} ×</button>)}</p> : null}
    </section>
  );

  const abilities = (
    <section className="s5-block">
      <h3>Abilities</h3>
      <div className="s5-abs">
        {ABILITIES.map(([k, label]) => (
          <label key={k} className="s5-ab">{label}
            <input type="number" min={1} max={30} value={c.ab[k]} onChange={(e) => up({ ab: { ...c.ab, [k]: Number(e.target.value) } })} aria-label={label + ' base score'} />
            <b>{sgn(d.mods[k])}</b><small>{d.scores[k] !== c.ab[k] ? `${d.scores[k]} with bonuses` : 'score ' + d.scores[k]}</small>
          </label>
        ))}
      </div>
      {Array.from({ length: anyCount }, (_, i) => (
        <label key={i} className="f" style={{ marginTop: 8 }}>A +1 of your choice goes to
          <select value={(c.anyAb ?? [])[i] ?? ''} onChange={(e) => { const a = [...(c.anyAb ?? [])]; a[i] = e.target.value as Ability; up({ anyAb: a }); }}><option value="">Choose…</option>{ABILITIES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        </label>
      ))}
      <h3>Saving throws</h3>
      <p className="s5-chips">{d.saves.map((s) => <span key={s.key} className={s.proficient ? 'on' : ''}>{s.label.slice(0, 3)} {sgn(s.bonus)}</span>)}</p>
      <h3>Skills {d.cls?.data.skillCount ? <small>(your class lets you pick {d.cls.data.skillCount}{(d.cls.data.skillList ?? []).length ? ' from its list' : ''})</small> : null}</h3>
      <div className="s5-skills">
        {d.skills.map((s) => {
          const fixed = s.proficient && !(c.skills ?? []).includes(s.name);
          return <label key={s.name} className={s.proficient ? 'on' : ''}><input type="checkbox" checked={s.proficient} disabled={fixed} onChange={(e) => up({ skills: e.target.checked ? [...(c.skills ?? []), s.name] : (c.skills ?? []).filter((x) => x !== s.name) })} /> {s.name} <b>{sgn(s.bonus)}</b></label>;
        })}
      </div>
    </section>
  );

  const defence = (
    <section className="s5-block">
      <h3>Armor and hit points</h3>
      <div className="fields">
        <label className="f">Armor class before bonuses (blank: 10 + Dexterity)<input type="number" value={c.acBase ?? ''} placeholder={String(10 + d.mods.dex)} onChange={(e) => up({ acBase: e.target.value === '' ? null : Number(e.target.value) })} /></label>
        <label className="f">Hit point maximum (blank: worked out, {d.hpAuto})<input type="number" value={c.hpMax ?? ''} placeholder={String(d.hpAuto)} onChange={(e) => up({ hpMax: e.target.value === '' ? null : Number(e.target.value) })} /></label>
      </div>
      <label className="ck" style={{ marginTop: 8 }}><input type="checkbox" checked={!!c.shield} onChange={(e) => up({ shield: e.target.checked })} /> Carrying a shield (+2)</label>
      {[['Senses', Object.entries(d.senses).map(([k, v]) => `${k} ${v} ft`)], ['Resistances', d.resist], ['Immunities', d.immune], ['Armor', [...d.profs.armor, d.cls?.data.armor].filter(Boolean)], ['Weapons', [...d.profs.weapon, d.cls?.data.weapons].filter(Boolean)], ['Tools', [...d.profs.tool, d.cls?.data.tools].filter((x) => x && x !== 'None')], ['Languages', [...d.profs.language, d.race?.data.languages].filter(Boolean)]]
        .map(([k, v]) => ((v as string[]).length ? <p key={k as string} className="kv"><b>{k}:</b> {(v as string[]).join(', ')}</p> : null))}
    </section>
  );

  const features = d.features.length || d.riders.length ? (
    <section className="s5-block">
      <h3>Features and traits</h3>
      {d.features.map((f, i) => <details key={i} className="s5-item"><summary><b>{f.name}</b> <small>{f.from}{Number(f.level) > 1 ? ', level ' + f.level : ''}</small></summary><p>{f.text}</p></details>)}
      {d.riders.map((r, i) => <p key={'r' + i} className="kv"><b>{r.from}:</b> {r.text}</p>)}
    </section>
  ) : null;

  const notes = (
    <section className="s5-block">
      <div className="fields">
        <label className="f">Gear<textarea rows={5} value={c.gear ?? ''} onChange={(e) => up({ gear: e.target.value })} /></label>
        <label className="f">Notes<textarea rows={5} value={c.notes ?? ''} onChange={(e) => up({ notes: e.target.value })} /></label>
      </div>
    </section>
  );

  return (
    <fieldset className="s5" disabled={readOnly}>
      {d.changed.map((ch) => (
        <p key={ch.id} className="s5-changed" role="status"><b>{ch.name} was updated</b> (version {ch.version}){ch.note ? ': ' + ch.note : '.'} {readOnly ? null : <button type="button" className="act sm" onClick={() => up({ seen: { ...(c.seen ?? {}), [ch.id]: ch.version } })}>Got it</button>}</p>
      ))}
      <h2 className="s5-name">{c.name || 'Unnamed character'} <small>Level {d.level} {c.race} {c.cls}</small></h2>
      {play ? <>{vitals}{resources}{magic}{features}{abilities}</> : <>{identity}{vitals}{abilities}{defence}{resources}{magic}{features}{notes}</>}
    </fieldset>
  );
}
