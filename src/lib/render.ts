import 'server-only';
import type { ContentRow } from './types';
import { videoSlot } from './video';

// Turns content rows into the same markup the source sites produced, on the server.
// The templates below are the source sites' own render functions, fed from the database.
//
// opts.label is only passed for the DM. It turns a phase into the small note that marks
// what players cannot see yet ("Hidden from players until after session negative") or
// only see for now ("Shown to players only before session negative").

/* eslint-disable @typescript-eslint/no-explicit-any */
export type RenderOpts = { base: string; race?: string; label?: (phase: string | null | undefined) => string };

export const esc = (s: unknown) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
const li = (a: string[]) => (a || []).map((x) => `<li>${x}</li>`).join('');
const glyph = (r: any) => `<svg class="glyph" viewBox="0 0 100 100" style="color:${esc(r.color)}" aria-hidden="true">${r.glyph || ''}</svg>`;

const note = (opts: RenderOpts, phase: string | null | undefined) => {
  const l = opts.label && phase ? opts.label(phase) : '';
  return l ? `<span class="phase-note">${esc(l)}</span>` : '';
};
const noteLine = (opts: RenderOpts, phase: string | null | undefined) => {
  const n = note(opts, phase);
  return n ? `<p class="phase-p">${n}</p>` : '';
};

// --- a race field that differs by phase. Players get one version. The DM gets them all, labelled.
const phased = (r: any, field: string) => Array.isArray(r._phased) && r._phased.includes(field);
const alts = (r: any, field: string): any[] => (r._alts ?? []).filter((a: any) => a[field] !== undefined);

function phasedText(r: any, field: string, opts: RenderOpts, wrap: (html: string) => string) {
  if (!r[field]) return alts(r, field).map((a) => wrap(`${a[field]} ${note(opts, a.phase)}`)).join('');
  if (!opts.label || !phased(r, field)) return wrap(r[field]);
  return wrap(`${r[field]} ${note(opts, r._mainPhase)}`) + alts(r, field).map((a) => wrap(`${a[field]} ${note(opts, a.phase)}`)).join('');
}

function phasedList(r: any, field: string, opts: RenderOpts): string[] {
  const main: string[] = r[field] ?? [];
  if (!opts.label || !phased(r, field)) return main;
  const others = alts(r, field).filter((a) => Array.isArray(a[field]));
  const out = main.map((x) => (others.every((a) => a[field].includes(x)) ? x : `${x} ${note(opts, r._mainPhase)}`));
  others.forEach((a) => a[field].filter((x: string) => !main.includes(x)).forEach((x: string) => out.push(`${x} ${note(opts, a.phase)}`)));
  return out;
}

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

function raceCards(R: any[], grid: string, opts: RenderOpts) {
  return `<div class="grid ${grid}">` + R.map((r) => `<a class="plate link" href="${opts.base}/${esc(r._section)}?race=${esc(r.id)}">
  <div class="rhead">${glyph(r)}<div><h3>${r.name}</h3><small>${r.kind}${r.src ? ', ' + r.src : ''}. ${r.size}.</small></div></div>
  ${phasedText(r, 'line', opts, (h) => `<p>${h}</p>`)}<ul>${li(phasedList(r, 'keys', opts))}</ul></a>`).join('') + '</div>';
}

function raceDetail(r: any, shown: boolean, opts: RenderOpts) {
  const sec = (t: string, html: string, phase?: string | null) => (html ? `<h4>${t} ${note(opts, phase)}</h4>${html}` : '');
  const own = (field: string) => (opts.label && phased(r, field) && !alts(r, field).length ? r._mainPhase : null);
  const p = (h: string) => `<p>${h}</p>`;
  const culture = phasedList(r, 'culture', opts);
  return `<div class="plate" data-race-detail="${esc(r.id)}"${shown ? '' : ' hidden'}>
    <div class="rhead">${glyph(r)}<div><h3 style="font-size:1.9rem">${r.name}${r.pron ? ` <small style="display:inline">(${r.pron})</small>` : ''}</h3>
    <small>${r.kind}${r.src ? ', from ' + r.src : ''}. ${r.size}, speed ${r.speed}.</small></div></div>
    ${r.sug ? '<p><span class="sug">Suggested lore, may change</span></p>' : ''}
    ${phasedText(r, 'line', opts, (h) => `<p class="lede">${h}</p>`)}
    ${sec('Look', r.look ? p(r.look) : '')}
    ${sec('Life cycle', r.life ? `<ul>${li(r.life)}</ul>` : '')}
    ${sec('Culture', culture.length ? `<ul>${li(culture)}</ul>` : '')}
    ${sec('Under Voth', phasedText(r, 'voth', opts, p))}
    ${sec('Now', r.now ? p(r.now) : '', own('now'))}
    ${sec('As god-slayers', r.slayer ? p(r.slayer) : '', own('slayer'))}
    ${r.dm ? `<div class="secret"><span class="tag">DM only</span><div class="sb"><ul>${li(r.dm)}</ul></div></div>` : ''}
    <h4>Traits</h4>
    <ul class="traits"><li><b>Ability scores.</b> +2 to one and +1 to another.</li>
    ${(r.traits || []).map((t: string[]) => `<li><b>${t[0]}.</b> ${t[1]}${t[3] ? ' ' + note(opts, r._mainPhase) : ''}${t[2] ? ` <span class="src">${t[2]}.</span>` : ''}</li>`).join('')}
    <li><b>Level 7.</b> ${r.up}</li></ul></div>`;
}

function raceBrowser(R: any[], opts: RenderOpts) {
  if (!R.length) return '';
  const sel = R.find((r) => r.id === opts.race) ? opts.race : R[0].id;
  return `<div class="chips" id="raceChips">` +
    R.map((r) => `<a class="chip" href="?race=${esc(r.id)}" data-race="${esc(r.id)}" role="button" aria-pressed="${r.id === sel}" style="color:${esc(r.color)}">${r.name}</a>`).join('') +
    `</div><div id="raceDetail">${R.map((r) => raceDetail(r, r.id === sel, opts)).join('')}</div>`;
}

const upTable = (R: any[]) => '<div class="scroll"><table><tr><th>Race</th><th>Level 7 upgrade</th></tr>' + R.map((r) => `<tr><td>${r.name}</td><td>${r.up}</td></tr>`).join('') + '</table></div>';

const DATA_KINDS = new Set(['race', 'race-phase', 'race-dm', 'faction', 'faction-dm', 'sheet-template', 'sheet-slot']);

export function renderBlock(r: ContentRow, lore: { races: any[]; factions: any[] }, opts: RenderOpts): string {
  const b = r.body || {};
  const ph = r._phase;
  const before = noteLine(opts, ph);
  switch (r.kind) {
    case 'hero': return `<header class="hero">${before}${b.html || ''}</header>`;
    case 'heading': { const n = Math.min(6, Math.max(1, Number(b.level) || 2)); return `<h${n}>${esc(b.text)} ${note(opts, ph)}</h${n}>`; }
    case 'html': return before + (b.html || '');
    case 'video': { const slot = videoSlot(b.url); return slot ? `${before}<div class="video-block">${slot}${b.caption ? `<p class="who">${esc(b.caption)}</p>` : ''}</div>` : ''; }
    case 'table': return `${before}<div class="scroll">${b.html || ''}</div>`;
    case 'secret': return `${before}<div class="secret"><span class="tag">${esc(b.tag)}</span><div class="sb">${b.html || ''}</div></div>`;
    case 'plate': return `<div class="plate">${before}${b.html || ''}</div>`;
    case 'faction-table': return lore.factions.length ? before + facTable(lore.factions) : '';
    case 'faction-cards': return lore.factions.length ? before + facCards(lore.factions, b.grid || 'g2') : '';
    case 'race-cards': return before + raceCards(lore.races, b.grid || 'g3', opts);
    case 'race-browser': return before + raceBrowser(lore.races, opts);
    case 'upgrade-table': return before + upTable(lore.races);
    case 'checklist':
      return `${before}<ul class="check" data-row="${esc(r.id)}">` + (b.items || []).map((it: any, i: number) =>
        `<li><label><input type="checkbox" data-i="${i}"${it.done ? ' checked' : ''}><span>${it.text}</span></label></li>`).join('') + '</ul>';
    default: return '';
  }
}

export function renderSection(rows: ContentRow[], lore: { races: any[]; factions: any[] }, opts: RenderOpts): string {
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
