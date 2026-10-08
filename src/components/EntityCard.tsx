/* eslint-disable @typescript-eslint/no-explicit-any */
import { ABILITIES, classTable, mod, sgn, type Effect, type Feature } from '@/lib/rules/engine';
import { TYPES } from '@/config/homebrew';

// One sentence for one effect, in plain words.
export function describeEffect(x: Effect): string {
  const at = x.at && x.at > 1 ? ` (from level ${x.at})` : '';
  const AB: Record<string, string> = Object.fromEntries(ABILITIES);
  switch (x.t) {
    case 'ability': return `${x.ab === 'any' ? 'One ability score of your choice' : AB[x.ab] ?? x.ab} ${sgn(Number(x.n))}${at}`;
    case 'prof': return `Proficiency: ${x.kind === 'save' ? (AB[x.v] ?? x.v) + ' saving throws' : x.v}${x.kind === 'skill' || x.kind === 'save' ? '' : ' (' + x.kind + ')'}${at}`;
    case 'resist': return `${x.immune ? 'Immunity' : 'Resistance'} to ${x.v} damage${at}`;
    case 'condition': return `Immunity to the ${x.v} condition${at}`;
    case 'speed': return x.mode === 'walk' ? `Walking speed ${sgn(Number(x.n))} feet${at}` : `${x.mode[0].toUpperCase() + x.mode.slice(1)} speed ${x.n} feet${at}`;
    case 'sense': return `${x.v} ${x.n} feet${at}`;
    case 'resource': return `${x.name}: ${/^\d+$/.test(String(x.max)) ? x.max : describeMax(String(x.max))} per ${x.recharge === 'none' ? 'day (does not recharge by itself)' : x.recharge + ' rest'}${at}`;
    case 'spell': return `You can cast ${x.name}${at}`;
    case 'scale': return `${x.name}: ${(x.steps ?? []).map(([l, v]) => `${v} at level ${l}`).join(', ')}`;
    case 'hp': return `Hit point maximum +${x.n} per level${at}`;
    case 'ac': return `Armor class ${sgn(Number(x.n))}${at}`;
    case 'text': return x.text + at;
  }
}
export function describeMax(max: string): string {
  const s = max.toLowerCase();
  if (s.startsWith('step:')) return s.slice(5).split(',').map((p) => { const [l, n] = p.split('='); return `${Number(n) >= 99 ? 'unlimited' : n} from level ${l}`; }).join(', ');
  const AB: Record<string, string> = Object.fromEntries(ABILITIES);
  return s.replace(/\blevel\b/, 'your level').replace(/\bprof\b/, 'your proficiency bonus').replace(/\bhalf\b/, 'half your level').replace(/\b(str|dex|con|int|wis|cha)\b/, (m) => `your ${AB[m]} modifier`).replace('*', ' x ').replace('+', ' + ');
}

const Fact = ({ k, v }: { k: string; v: any }) => (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length) ? null : <p className="kv"><b>{k}:</b> {Array.isArray(v) ? v.join(', ') : String(v)}</p>);
const AB3: Record<string, string> = { str: 'STR', dex: 'DEX', con: 'CON', int: 'INT', wis: 'WIS', cha: 'CHA' };
const ord = (n: number) => (n === 0 ? 'Cantrip' : `${n}${['th', 'st', 'nd', 'rd'][n > 3 ? 0 : n]}-level`);

// What a player sees for one entry: used for the live preview in the builder, the
// campaign compendium, and stat blocks in the initiative tracker.
// A class's level table: proficiency bonus, features, scaling numbers and spell slots by level.
export function ClassTableView({ table }: { table: ReturnType<typeof classTable> }) {
  return (
    <div className="scroll">
      <table className="ctable">
        <thead><tr><th>Level</th><th>Prof.</th><th>Features</th>{table.headers.map((h) => <th key={h}>{h}</th>)}{Array.from({ length: table.maxSlot }, (_, i) => <th key={i}>{i + 1}</th>)}</tr></thead>
        <tbody>{table.rows.map((r) => <tr key={r.level}><td>{r.level}</td><td>+{r.prof}</td><td>{r.features.join(', ') || '-'}</td>{r.cols.map((c, i) => <td key={i}>{c}</td>)}{r.slots.map((s, i) => <td key={i}>{s || '-'}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

export function EntityCard({ type, name, source, status, data, compact }: { type: string; name: string; source?: string; status?: string; data: Record<string, any>; compact?: boolean }) {
  const d = data || {};
  const effects: Effect[] = d.effects ?? [];
  const features: Feature[] = [...(d.features ?? [])].sort((a, b) => (Number(a.level) || 1) - (Number(b.level) || 1));
  const def = TYPES[type];
  const table = type === 'class' ? classTable({ data: d }) : null;
  return (
    <article className={'ecard e-' + type}>
      <header>
        <h3>{name || 'Unnamed'}</h3>
        <p className="who">
          {type === 'spell' ? `${ord(Number(d.level) || 0)} ${String(d.school ?? '').toLowerCase()}${Number(d.level) === 0 ? ' cantrip' : ''}${d.ritual ? ' (ritual)' : ''}`
            : type === 'monster' ? `${d.size ?? ''} ${String(d.mtype ?? '').toLowerCase()}${d.align ? ', ' + d.align : ''}`
            : type === 'item' ? `${d.kind ?? 'Item'}${d.rarity && d.rarity !== 'Standard' ? ', ' + String(d.rarity).toLowerCase() : ''}${d.attune ? ' (requires attunement)' : ''}`
            : type === 'subclass' ? `${def?.label}${d.parent ? ' of the ' + d.parent : ''}`
            : def?.label ?? (type === 'condition' ? 'Condition' : type === 'rule' ? 'Rules reference' : type)}
          {source === 'srd' ? <span className="etag">SRD</span> : null}
          {status === 'playtest' ? <span className="etag test">Playtest</span> : null}
          {status === 'draft' ? <span className="etag test">Draft</span> : null}
        </p>
      </header>

      {type === 'monster' ? (
        <>
          <Fact k="Armor Class" v={d.acv} />
          <Fact k="Hit Points" v={d.hpv ? `${d.hpv}${d.hdv ? ` (${d.hdv})` : ''}` : ''} />
          <Fact k="Speed" v={d.mspeed} />
          {d.ab ? <div className="abrow">{ABILITIES.map(([k]) => <span key={k}><b>{AB3[k]}</b>{d.ab[k] ?? 10} ({sgn(mod(d.ab[k] ?? 10))})</span>)}</div> : null}
          <Fact k="Saving Throws" v={d.msaves} /><Fact k="Skills" v={d.mskills} />
          <Fact k="Damage Vulnerabilities" v={d.vuln} /><Fact k="Damage Resistances" v={d.resist} /><Fact k="Damage Immunities" v={d.immune} />
          <Fact k="Senses" v={d.senses} /><Fact k="Languages" v={d.langs} /><Fact k="Challenge" v={d.cr} />
          {(d.traits ?? []).map((t: any, i: number) => <p key={'t' + i}><b><i>{t.name}.</i></b> {t.text}</p>)}
          {(d.actions ?? []).length ? <h4>Actions</h4> : null}
          {(d.actions ?? []).map((t: any, i: number) => <p key={'a' + i}><b><i>{t.name}.</i></b> {t.text}</p>)}
          {d.desc ? <p className="who">{d.desc}</p> : null}
        </>
      ) : (
        <>
          {type === 'spell' ? <><Fact k="Casting time" v={d.time} /><Fact k="Range" v={d.range} /><Fact k="Components" v={d.comp} /><Fact k="Duration" v={d.duration} /></> : null}
          {d.desc ? String(d.desc).split(/\n{2,}/).map((p: string, i: number) => <p key={i} style={{ whiteSpace: 'pre-wrap' }}>{p}</p>) : null}
          {type === 'spell' ? <><Fact k="Damage or healing" v={d.damage} /><Fact k="At higher levels" v={d.higher} /><Fact k="Classes" v={d.classes} /></> : null}
          {type === 'race' ? <><Fact k="Size" v={d.size} /><Fact k="Speed" v={d.speed ? d.speed + ' feet' : ''} /><Fact k="Languages" v={d.languages} /></> : null}
          {type === 'class' ? <><Fact k="Hit die" v={d.hd ? 'd' + d.hd : ''} /><Fact k="Primary ability" v={d.primary} /><Fact k="Saving throws" v={(d.saves ?? []).map((s: string) => Object.fromEntries(ABILITIES)[s] ?? s)} /><Fact k="Armor" v={d.armor} /><Fact k="Weapons" v={d.weapons} /><Fact k="Tools" v={d.tools} /><Fact k="Skills" v={d.skillCount ? `Choose ${d.skillCount}${(d.skillList ?? []).length ? ' from ' + d.skillList.join(', ') : ' of any'}` : ''} /><Fact k="Spellcasting" v={d.casting?.kind && d.casting.kind !== 'none' ? `${d.casting.kind}${d.casting.ability ? ', using ' + (Object.fromEntries(ABILITIES)[d.casting.ability] ?? d.casting.ability) : ''}` : ''} /></> : null}
          {type === 'background' ? <><Fact k="Skills" v={d.skills} /><Fact k="Tools" v={d.toolProfs} /><Fact k="Languages" v={d.languages} /><Fact k="Equipment" v={d.equipment} /></> : null}
          {type === 'feat' ? <Fact k="Prerequisite" v={d.prereq} /> : null}
          {type === 'item' ? <><Fact k="Damage" v={d.damage} /><Fact k="Armor class" v={d.ac} /><Fact k="Properties" v={d.props} /><Fact k="Cost" v={d.cost} /><Fact k="Weight" v={d.weight} /></> : null}
          {type === 'rule' && d.section ? <Fact k="Section" v={d.section} /> : null}
          {type === 'feat' && d.category ? <Fact k="Category" v={d.category} /> : null}
          {type === 'resource' ? <><Fact k="Each character has" v={d.max ? describeMax(String(d.max)) + ' ' + (d.unit || 'point') + 's' : ''} /><Fact k="Comes back on" v={d.recharge === 'none' ? 'Does not recharge by itself' : d.recharge ? `a ${d.recharge} rest` : ''} /></> : null}
          {effects.length ? <ul className="traits">{effects.map((x, i) => <li key={i}>{describeEffect(x)}</li>)}</ul> : null}
          {features.length && !compact ? (
            <ul className="traits">
              {features.map((f, i) => (
                <li key={i}>
                  <b>{f.name}{def?.featureLevels && Number(f.level) > 1 ? ` (level ${f.level})` : ''}.</b> {f.text}
                  {(f.effects ?? []).length ? <span className="src"> {f.effects!.map(describeEffect).join('; ')}.</span> : null}
                </li>
              ))}
            </ul>
          ) : null}
          {table && !compact ? <ClassTableView table={table} /> : null}
        </>
      )}
    </article>
  );
}
