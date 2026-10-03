import 'server-only';
import type { ContentRow } from './types';

// Turns content rows into the same markup the source sites produced, on the server.
// The templates below are the source sites' own render functions, fed from the database.

/* eslint-disable @typescript-eslint/no-explicit-any */
export const esc = (s: unknown) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
const li = (a: string[]) => (a || []).map((x) => `<li>${x}</li>`).join('');
const glyph = (r: any) => `<svg class="glyph" viewBox="0 0 100 100" style="color:${esc(r.color)}" aria-hidden="true">${r.glyph || ''}</svg>`;

function facTable(F: any[]) {
  if (!F.length) return '';
  return `<div class="scroll"><table><tr><th>Faction</th><th>Who they are</th><th>What they want</th>${F[0].idle ? '<th>If the players do nothing</th>' : ''}</tr>` +
    F.map((f) => `<tr><td><b>${f.n}</b></td><td>${f.who}</td><td>${f.want}</td>${f.idle ? `<td>${f.idle}</td>` : ''}</tr>`).join('') + '</table></div>';
}

function facCards(F: any[], grid: string) {
  return `<div class="grid ${grid}">` + F.map((f) => `<div class="plate"><h3>${f.n}</h3>
  <p class="kv"><b>Members:</b> ${f.members}</p><p class="kv"><b>Leader:</b> ${f.leader}</p>
  <p class="kv"><b>Resources:</b> ${f.res}${f.resDm || ''}</p><p class="kv"><b>Wants:</b> ${f.want}.</p>
  ${f.small ? `<h4>Small moves</h4><ul>${li(f.small)}</ul><h4>Big development</h4><p>${f.big}</p>` : ''}</div>`).join('') + '</div>';
}

function raceCards(R: any[], grid: string, base: string) {
  return `<div class="grid ${grid}">` + R.map((r) => `<a class="plate link" href="${base}/${esc(r._section)}?race=${esc(r.id)}">
  <div class="rhead">${glyph(r)}<div><h3>${r.name}</h3><small>${r.kind}${r.src ? ', ' + r.src : ''}. ${r.size}.</small></div></div>
  <p>${r.line}</p><ul>${li(r.keys)}</ul></a>`).join('') + '</div>';
}

function raceDetail(r: any, shown: boolean) {
  const sec = (t: string, html: string) => (html ? `<h4>${t}</h4>${html}` : '');
  return `<div class="plate" data-race-detail="${esc(r.id)}"${shown ? '' : ' hidden'}>
    <div class="rhead">${glyph(r)}<div><h3 style="font-size:1.9rem">${r.name}${r.pron ? ` <small style="display:inline">(${r.pron})</small>` : ''}</h3>
    <small>${r.kind}${r.src ? ', from ' + r.src : ''}. ${r.size}, speed ${r.speed}.</small></div></div>
    ${r.sug ? '<p><span class="sug">Suggested lore, may change</span></p>' : ''}
    <p class="lede">${r.line}</p>
    ${sec('Look', r.look ? `<p>${r.look}</p>` : '')}
    ${sec('Life cycle', r.life ? `<ul>${li(r.life)}</ul>` : '')}
    ${sec('Culture', r.culture ? `<ul>${li(r.culture)}</ul>` : '')}
    ${sec('Under Voth', r.voth ? `<p>${r.voth}</p>` : '')}
    ${sec('Now', r.now ? `<p>${r.now}</p>` : '')}
    ${sec('As god-slayers', r.slayer ? `<p>${r.slayer}</p>` : '')}
    ${r.dm ? `<div class="secret"><span class="tag">DM only</span><div class="sb"><ul>${li(r.dm)}</ul></div></div>` : ''}
    <h4>Traits</h4>
    <ul class="traits"><li><b>Ability scores.</b> +2 to one and +1 to another.</li>
    ${(r.traits || []).map((t: string[]) => `<li><b>${t[0]}.</b> ${t[1]}${t[2] ? ` <span class="src">${t[2]}.</span>` : ''}</li>`).join('')}
    <li><b>Level 7.</b> ${r.up}</li></ul></div>`;
}

function raceBrowser(R: any[], selected: string) {
  if (!R.length) return '';
  const sel = R.find((r) => r.id === selected) ? selected : R[0].id;
  return `<div class="chips" id="raceChips">` +
    R.map((r) => `<a class="chip" href="?race=${esc(r.id)}" data-race="${esc(r.id)}" role="button" aria-pressed="${r.id === sel}" style="color:${esc(r.color)}">${r.name}</a>`).join('') +
    `</div><div id="raceDetail">${R.map((r) => raceDetail(r, r.id === sel)).join('')}</div>`;
}

const upTable = (R: any[]) => '<div class="scroll"><table><tr><th>Race</th><th>Level 7 upgrade</th></tr>' + R.map((r) => `<tr><td>${r.name}</td><td>${r.up}</td></tr>`).join('') + '</table></div>';

const DATA_KINDS = new Set(['race', 'race-dm', 'faction', 'faction-dm', 'sheet-template']);

export function renderBlock(r: ContentRow, lore: { races: any[]; factions: any[] }, opts: { base: string; race?: string }): string {
  const b = r.body || {};
  switch (r.kind) {
    case 'hero': return `<header class="hero">${b.html || ''}</header>`;
    case 'heading': { const n = Math.min(6, Math.max(1, Number(b.level) || 2)); return `<h${n}>${esc(b.text)}</h${n}>`; }
    case 'html': return b.html || '';
    case 'table': return `<div class="scroll">${b.html || ''}</div>`;
    case 'secret': return `<div class="secret"><span class="tag">${esc(b.tag)}</span><div class="sb">${b.html || ''}</div></div>`;
    case 'plate': return `<div class="plate">${b.html || ''}</div>`;
    case 'faction-table': return facTable(lore.factions);
    case 'faction-cards': return facCards(lore.factions, b.grid || 'g2');
    case 'race-cards': return raceCards(lore.races, b.grid || 'g3', opts.base);
    case 'race-browser': return raceBrowser(lore.races, opts.race || '');
    case 'upgrade-table': return upTable(lore.races);
    case 'checklist':
      return `<ul class="check" data-row="${esc(r.id)}">` + (b.items || []).map((it: any, i: number) =>
        `<li><label><input type="checkbox" data-i="${i}"${it.done ? ' checked' : ''}><span>${it.text}</span></label></li>`).join('') + '</ul>';
    default: return '';
  }
}

export function renderSection(rows: ContentRow[], lore: { races: any[]; factions: any[] }, opts: { base: string; race?: string }): string {
  const out: string[] = [];
  const list = rows.filter((r) => !DATA_KINDS.has(r.kind));
  for (let i = 0; i < list.length; i++) {
    const r = list[i];
    if (r.kind === 'plate') {
      // consecutive plates from the same source grid sit in one grid
      const group = r.body?.group;
      const plates = [r];
      while (i + 1 < list.length && list[i + 1].kind === 'plate' && list[i + 1].body?.group === group) plates.push(list[++i]);
      out.push(`<div class="grid ${esc(r.body?.grid || 'g2')}"${r.body?.gridStyle ? ` style="${esc(r.body.gridStyle)}"` : ''}>${plates.map((p) => renderBlock(p, lore, opts)).join('')}</div>`);
    } else out.push(renderBlock(r, lore, opts));
  }
  return out.join('\n');
}
