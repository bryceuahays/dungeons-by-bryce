// The DM's party page: one full sheet per character.
// Lifted from renderParty() in source/dm-hub/index.html. The sheets now come from the
// database (and update live) instead of pasted character codes, and the wording of the
// private block (LABELS) comes from the database too, so it is not in the code players download.

import { ABS as P_ABS, SKILLS as P_SK, esc as pesc, num as pnum, sgn as psgn } from './character';

export function renderParty(chars, RACES, askRemove, LABELS) {
  const shown = (v, none) => (v === '' || v == null ? none : v);
  if (!chars.length) return '<div class="plate pc"><p>No characters yet. When a player builds or saves a character in this campaign, the full sheet appears here.</p></div>';
  const sorted = chars.slice().sort((a, b) => String(a.data.name || '').localeCompare(String(b.data.name || '')));
  return sorted.map((row) => {
    const c = row.data || {}, id = row.id, ab = c.ab || {}, sv = c.sv || {}, sk = c.sk || {}, L = Math.max(1, Math.min(20, pnum(c.level) || 1)), pb = 2 + Math.floor((L - 1) / 4);
    const m = (k) => Math.floor((pnum(ab[k]) - 10) / 2), r = RACES.find((x) => x.id === c.race), opts = Array.isArray(c.options) ? c.options : [], card = c.card || {};
    const trained = P_SK.filter(([n]) => pnum(sk[n]) > 0).map(([n, a]) => pesc(n) + ' ' + psgn(m(a) + pb * pnum(sk[n])) + (pnum(sk[n]) > 1 ? ' (expertise)' : '')).join(', ');
    const group = (cat, label) => { const xs = opts.filter((o) => o.cat === cat); return xs.length ? `<details><summary>${label} (${xs.length})</summary>` + xs.map((o) => `<div class="popt"><b>${pesc(o.name)}</b>${o.cost && o.cost !== 'Passive' ? `<span class="pbadge">${pesc(o.cost)}</span>` : ''}${o.max ? `<span class="pbadge">${pnum(o.used)}/${pnum(o.max)} used</span>` : ''}${o.roll ? ` <span class="roll">${pesc(o.roll)}</span>` : ''}${o.desc ? `<p>${pesc(o.desc)}</p>` : ''}</div>`).join('') + '</details>' : ''; };
    const player = row.player || c.player;
    return `<div class="plate pc">
      <h3 style="color:var(--gold);font-size:1.7rem">${pesc(c.name || 'Unnamed character')}</h3>
      <p class="who">Level ${L} ${pesc(r ? r.name : c.race || '')} ${pesc(c.cls || '')}${player ? '. Played by ' + pesc(player) : ''}${c.t ? '. Sheet from ' + new Date(c.t).toLocaleDateString() : '. Still being built'}.</p>
      <div class="pstats"><div class="pstat"><b>${pnum(c.ac)}</b>Armor class</div><div class="pstat"><b>${pnum(c.hp)}<small style="font-size:1rem;color:var(--dim)">/${pnum(c.hpMax)}</small></b>Hit points</div><div class="pstat"><b class="sm">${pesc(c.speed || '')}</b>Speed</div><div class="pstat"><b>${psgn(m('dex'))}</b>Initiative</div><div class="pstat"><b>${10 + m('wis') + pb * pnum(sk.Perception)}</b>Passive Perception</div><div class="pstat"><b>${pnum(c.atk) || 1}</b>Attacks per action</div></div>
      <div class="pstats">${P_ABS.map(([k, n]) => `<div class="pstat"><b>${pnum(ab[k])}</b>${n}<br>${psgn(m(k))}, save ${psgn(m(k) + (sv[k] ? pb : 0))}</div>`).join('')}</div>
      <p class="kv"><b>Trained skills:</b> ${trained || 'none listed'}</p>
      ${LABELS ? `<div class="secret"><span class="tag">${pesc(LABELS.title)}</span><div class="sb">${LABELS.fields.map((f) => `${pesc(f.label)}: ${pesc(shown(c[f.key], f.none))}.`).join(' ')}</div></div>` : ''}
      ${(card.go || card.sig || card.emg) ? `<p class="kv"><b>Go-to attack:</b> ${pesc(card.go)}</p><p class="kv"><b>Signature move:</b> ${pesc(card.sig)}</p><p class="kv"><b>Emergency button:</b> ${pesc(card.emg)}</p>` : ''}
      ${group('Attack', 'Attacks')}${group('Ability', 'Abilities')}${group('Spell', 'Spells')}${group('Item', 'Items')}${group('Other', 'Other')}
      ${c.gear ? `<details><summary>Gear</summary><p class="pre">${pesc(c.gear)}</p></details>` : ''}
      ${c.notes ? `<details><summary>Notes</summary><p class="pre">${pesc(c.notes)}</p></details>` : ''}
      <p style="margin-top:14px">${askRemove === id ? `Delete this character for good? <button class="act sm" data-prm="${pesc(id)}">Delete it</button> <button class="act sm" data-pkeep="1">Keep it</button>` : `<button class="act sm" data-pask="${pesc(id)}">Remove this character</button>`}</p>
    </div>`;
  }).join('');
}
