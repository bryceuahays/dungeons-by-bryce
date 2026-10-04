// Reads the four source sites in source/ and writes seed/to-be-a-god.json.
// Nothing here retypes campaign text: every string is lifted from the source files.
//
// Visibility rule (BRIEF section 5.3): what appears in player-guide/ is player-visible.
// What appears only in dm-hub/ or the run sheet is DM-only. Where the two files word
// the same item differently, both versions are stored under the same key.

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import * as cheerio from 'cheerio';
import { applyPhases } from './phases.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'source');
const read = (p) => fs.readFileSync(path.join(SRC, p), 'utf8');

const guideHtml = read('player-guide/index.html');
const hubHtml = read('dm-hub/index.html');
const builderHtml = read('character-builder/index.html');
const runHtml = read('session-negative-run-sheet/index.html');

const SLUG = 'to-be-a-god';
const slug = (s) => String(s).toLowerCase().replace(/&[a-z]+;/g, ' ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'x';
const squash = (s) => String(s).replace(/\s+/g, ' ').trim();

function load(html) {
  const $ = cheerio.load(html);
  // DM markers are HTML comments; the visibility comes from comparing the two files, so drop them.
  $('*').contents().filter((_, n) => n.type === 'comment').remove();
  return $;
}
const scriptOf = (html) => html.slice(html.lastIndexOf('<script>') + 8, html.lastIndexOf('</script>'));

// ------------------------------------------------------------------ static sections -> blocks

function blocksOf($, sectionId) {
  const out = [];
  let grid = 0;
  const sec = $('#' + sectionId);
  if (!sec.length) return out;
  sec.children().each((_, el) => {
    const $el = $(el);
    const tag = el.tagName;
    const cls = ($el.attr('class') || '').split(/\s+/);
    const id = $el.attr('id') || '';
    const push = (kind, title, body) => out.push({ kind, title: squash(title).slice(0, 80), body });

    if (tag === 'header' && cls.includes('hero')) return push('hero', $el.find('h1').text(), { html: $el.html().trim() });
    if (/^h[1-6]$/.test(tag)) return push('heading', $el.text(), { text: squash($el.text()), level: Number(tag[1]) });
    if (cls.includes('grid')) {
      const g = cls.includes('g3') ? 'g3' : 'g2';
      const style = $el.attr('style') || '';
      if (id === 'raceCards') return push('race-cards', 'Race cards', { grid: g });
      if (id === 'facCards') return push('faction-cards', 'Faction cards', { grid: g });
      grid++;
      $el.children().each((__, c) => {
        const $c = $(c);
        const h = $c.find('h3').first().clone();
        h.find('small').remove();
        push('plate', h.text(), { html: $c.html().trim(), grid: g, group: sectionId + '-' + grid, ...(style ? { gridStyle: style } : {}) });
      });
      return;
    }
    if (cls.includes('scroll')) {
      const tid = $el.find('table').attr('id') || '';
      if (tid === 'facTable') return push('faction-table', 'Faction table', {});
      if (tid === 'upTable') return push('upgrade-table', 'Level 7 upgrades table', {});
      return push('table', $el.find('th').map((__, t) => $(t).text()).get().join(', '), { html: $el.html().trim() });
    }
    if (id === 'raceChips') return push('race-browser', 'Race browser', {});
    if (id === 'raceDetail') return;
    if (cls.includes('secret')) {
      const tagText = squash($el.children('.tag').text());
      return push('secret', tagText, { tag: tagText, html: $el.children('.sb').html().trim() });
    }
    if (id === 'todo') return push('checklist', 'Still to decide', { items: [] });
    return push('html', $el.text(), { html: $.html(el).trim() });
  });
  // keys: stable and unique inside the section
  const seen = {};
  out.forEach((b) => {
    let k = b.kind + '-' + slug(b.title);
    seen[k] = (seen[k] || 0) + 1;
    if (seen[k] > 1) k += '-' + seen[k];
    b.key = k;
  });
  return out;
}

const canon = (b) => b.kind + '|' + squash(JSON.stringify(b.body)).replace(/>\s+</g, '><');
const words = (b) => new Set(squash(cheerio.load(b.body.html || b.body.text || b.title || '').text()).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
function jaccard(a, b) {
  const A = words(a), B = words(b);
  let n = 0;
  A.forEach((w) => { if (B.has(w)) n++; });
  return n / (A.size + B.size - n || 1);
}
// Same item, different wording, where the wording alone is too different to tell.
const FORCED_PAIRS = { overview: [['heading-the-dead-god', 'heading-the-two-gods']] };

// Merge the player guide's blocks (P) with the DM hub's blocks (D) for one section.
function merge(section, P, D, report) {
  const n = P.length, m = D.length;
  const cp = P.map(canon), cd = D.map(canon);
  const L = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = cp[i] === cd[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const rows = [];
  let sort = 0;
  const emit = (b, visibility, key) => rows.push({ section, kind: b.kind, key: key || b.key, title: b.title, body: b.body, visibility, sort });
  const flushGap = (ps, ds) => {
    const used = new Set();
    const forced = FORCED_PAIRS[section] || [];
    ds.forEach((d) => {
      const pi = ps.findIndex((p, idx) => !used.has(idx) && p.kind === d.kind &&
        (p.key === d.key || forced.some(([a, b]) => a === p.key && b === d.key) || d.kind === 'hero' || (d.kind !== 'heading' && jaccard(p, d) >= 0.3)));
      sort += 10;
      if (pi >= 0) {
        used.add(pi);
        const p = ps[pi];
        report.push(`  [${section}] two wordings: "${p.title}" (player) / "${d.title}" (dm)`);
        emit(p, 'player', p.key);
        emit(d, 'dm', p.key);
      } else {
        report.push(`  [${section}] dm only: ${d.kind} "${d.title}"`);
        emit(d, 'dm');
      }
    });
    ps.forEach((p, idx) => { if (!used.has(idx)) { sort += 10; report.push(`  [${section}] player only: ${p.kind} "${p.title}"`); emit(p, 'player'); } });
  };
  let i = 0, j = 0, gp = [], gd = [];
  while (i < n || j < m) {
    if (i < n && j < m && cp[i] === cd[j]) {
      flushGap(gp, gd); gp = []; gd = [];
      sort += 10; emit(P[i], 'player'); i++; j++;
    } else if (j < m && (i === n || L[i][j + 1] >= L[i + 1][j])) gd.push(D[j++]);
    else gp.push(P[i++]);
  }
  flushGap(gp, gd);
  // a dm-only key must not collide with a different player key
  const pk = new Set(rows.filter((r) => r.visibility === 'player').map((r) => r.key));
  const pairKeys = new Set(rows.filter((r) => r.visibility === 'dm' && pk.has(r.key)).map((r) => r.key));
  const count = {};
  rows.forEach((r) => {
    if (r.visibility === 'dm' && !pairKeys.has(r.key)) return;
    count[r.visibility + r.key] = (count[r.visibility + r.key] || 0) + 1;
    if (count[r.visibility + r.key] > 1) throw new Error('duplicate key ' + r.key + ' in ' + section);
  });
  return rows;
}

// ------------------------------------------------------------------ JS constants

function constSource(script, name) {
  const start = script.search(new RegExp('const\\s+' + name + '\\s*='));
  if (start < 0) return null;
  const open = script.indexOf('=', start) + 1;
  // walk to the terminating ';' at depth 0, respecting strings
  let depth = 0, q = '', k = open;
  for (; k < script.length; k++) {
    const c = script[k];
    if (q) { if (c === '\\') k++; else if (c === q) q = ''; continue; }
    if (c === "'" || c === '"' || c === '`') { q = c; continue; }
    if (c === '/' && script[k + 1] === '*') { k = script.indexOf('*/', k) + 1; continue; }
    if ('[{('.includes(c)) depth++;
    else if (']})'.includes(c)) depth--;
    else if (c === ';' && depth === 0) break;
  }
  return script.slice(open, k);
}
const evalConst = (script, name) => { const s = constSource(script, name); return s == null ? null : vm.runInNewContext('(' + s + ')'); };

const guideJs = scriptOf(guideHtml), hubJs = scriptOf(hubHtml), builderJs = scriptOf(builderHtml), runJs = scriptOf(runHtml);
const G = evalConst(guideJs, 'G');
const racesP = evalConst(guideJs, 'RACES'), racesD = evalConst(hubJs, 'RACES');
const facP = evalConst(guideJs, 'FACTIONS'), facD = evalConst(hubJs, 'FACTIONS');
const TODO = evalConst(hubJs, 'TODO');

// fields the DM hub has that the player guide lacks or words differently
function dmOnly(p, d) {
  const out = {};
  Object.keys(d).forEach((k) => { if (JSON.stringify(p[k]) !== JSON.stringify(d[k])) out[k] = d[k]; });
  return out;
}

// ------------------------------------------------------------------ build content

const report = [];
const $g = load(guideHtml), $h = load(hubHtml);
const content = [];

const tabs = ($) => $('nav.tabs .tab').map((_, t) => ({ slug: $(t).attr('data-tab'), title: squash($(t).text()) })).get();
const pTabs = tabs($g), dTabs = tabs($h);
const builtin = { sheet: 'sheet', combat: 'combat', sessions: 'sessions', players: 'players' };
const sectionOrder = ['overview', 'sheet', 'combat', 'races', 'divinity', 'factions', 'secrets', 'sessions', 'players', 'campaign'];
const sections = sectionOrder.map((s, i) => {
  const p = pTabs.find((t) => t.slug === s), d = dTabs.find((t) => t.slug === s);
  if (!p && !d) throw new Error('tab not found in source: ' + s);
  return { slug: s, title: (p || d).title, sort: (i + 1) * 10, audience: p && d ? 'all' : p ? 'player' : 'dm', kind: builtin[s] || 'content' };
});

sections.filter((s) => s.kind === 'content').forEach((s) => {
  const P = blocksOf($g, s.slug), D = blocksOf($h, s.slug);
  merge(s.slug, P, D, report).forEach((r) => content.push(r));
});

// Removed at Bryce's request (3 October 2026): the ticks now save to the database, so this line was untrue.
const REMOVED = ['Ticks are saved in this browser only.'];
for (let i = content.length - 1; i >= 0; i--) {
  if (content[i].kind === 'html' && REMOVED.includes(squash(cheerio.load(content[i].body.html).text()))) content.splice(i, 1);
}

// the to-do list items come from the TODO constant
content.filter((r) => r.kind === 'checklist').forEach((r) => { r.body = { items: TODO.map((text) => ({ text, done: false })) }; });

// races: lore for the Races tab
racesP.forEach((r, i) => {
  const d = racesD.find((x) => x.id === r.id);
  content.push({ section: 'races', kind: 'race', key: r.id, title: r.name, body: { ...r, glyph: G[r.id] }, visibility: 'player', sort: 1000 + i });
  const extra = d ? dmOnly(r, d) : {};
  if (Object.keys(extra).length) content.push({ section: 'races', kind: 'race-dm', key: r.id, title: r.name + ' (DM)', body: extra, visibility: 'dm', sort: 1000 + i });
});
racesD.forEach((d) => { if (!racesP.find((r) => r.id === d.id)) throw new Error('race only in dm hub: ' + d.id); });

// factions
facP.forEach((f, i) => {
  const d = facD.find((x) => x.n === f.n);
  content.push({ section: 'factions', kind: 'faction', key: slug(f.n), title: f.n, body: f, visibility: 'player', sort: 1000 + i });
  const extra = d ? dmOnly(f, d) : {};
  if (Object.keys(extra).length) content.push({ section: 'factions', kind: 'faction-dm', key: slug(f.n), title: f.n + ' (DM)', body: extra, visibility: 'dm', sort: 1000 + i });
});

// My character: the sheet form, as written, minus the parts the database replaces
// (the heading and "saved in this browser" line, and the paste-a-code plate).
{
  const sec = $g('#sheet').clone();
  sec.children('h2').first().remove();
  sec.children('p.lede').first().remove();
  sec.children('.plate').first().remove();
  content.push({ section: 'sheet', kind: 'sheet-template', key: 'sheet-template', title: 'My character form', body: { html: sec.html().trim() }, visibility: 'player', sort: 10 });
}

// ------------------------------------------------------------------ builder rules

const fnSafe = (v) => {
  if (typeof v === 'function') return { $fn: v.toString() };
  if (Array.isArray(v)) return v.map(fnSafe);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fnSafe(x)]));
  return v;
};
const constPart = builderJs.slice(0, builderJs.indexOf('/* ---------- state ---------- */'));
const B = vm.runInNewContext(constPart + ';({RACES,CLASSES,FULL,PACT,ORD,BGS,ARMOR,WEAPONS,SPELLS,ANCESTRY,TIME,COST,ARRAY})', { document: { querySelector: () => null } });

const rules = [];
B.RACES.forEach((r, i) => {
  const base = { ...r, traits: r.traits.map((t) => { if (!t[2] || !('after' in t[2])) return t; const { after, ...rest } = t[2]; return Object.keys(rest).length ? [t[0], t[1], rest] : [t[0], t[1]]; }) };
  const after = {};
  r.traits.forEach((t) => { if (t[2] && t[2].after) after[t[0]] = t[2].after; });
  const before = {}, aft = {};
  if (Array.isArray(r.line)) { delete base.line; before.line = r.line[0]; aft.line = r.line[1]; }
  if (Object.keys(after).length) aft.after = after;
  rules.push({ kind: 'race', key: r.id, sort: i, data: fnSafe(base), phase: null });
  if (Object.keys(before).length) rules.push({ kind: 'race-phase', key: r.id, sort: i, data: before, phase: 'before' });
  if (Object.keys(aft).length) rules.push({ kind: 'race-phase', key: r.id, sort: i, data: aft, phase: 'after' });
});
B.CLASSES.forEach((c, i) => rules.push({ kind: 'class', key: c.id, sort: i, data: fnSafe(c), phase: null }));
B.SPELLS.forEach((s, i) => rules.push({ kind: 'spell', key: slug(s.n), sort: i, data: s, phase: null }));
B.BGS.forEach((b, i) => rules.push({ kind: 'background', key: slug(b[0]), sort: i, data: { v: b }, phase: null }));
B.ARMOR.forEach((a, i) => rules.push({ kind: 'armor', key: slug(a[0]), sort: i, data: { v: a }, phase: null }));
B.WEAPONS.forEach((w, i) => rules.push({ kind: 'weapon', key: slug(w[0]), sort: i, data: { v: w }, phase: null }));
['ANCESTRY', 'FULL', 'PACT', 'ORD', 'TIME', 'COST', 'ARRAY'].forEach((k, i) => rules.push({ kind: 'misc', key: k, sort: i, data: { v: B[k] }, phase: null }));
{
  const keys = new Set();
  rules.forEach((r) => { const k = r.kind + '/' + r.key + '/' + (r.phase || ''); if (keys.has(k)) throw new Error('duplicate rule ' + k); keys.add(k); });
}

// what the builder says and does differently before and after the one-shot
{
  const note = builderJs.match(/PHASE==='before'\?'([^']+)':'([^']+)'\}\s*Proficiency/);
  const lvl = builderJs.match(/PHASE==='before'\?(\d+):(\d+)\)\)\);/);
  const vit = /PHASE==='after'\?Math\.floor\(D\.ab\.con\/2\):0/.test(builderJs);
  if (!note || !lvl || !vit) throw new Error('builder phase rules not found');
  rules.push({ kind: 'phase-config', key: 'builder', sort: 0, phase: 'before', data: { levelNote: note[1], defaultLevel: Number(lvl[1]), vitality: false } });
  rules.push({ kind: 'phase-config', key: 'builder', sort: 0, phase: 'after', data: { levelNote: note[2], defaultLevel: Number(lvl[2]), vitality: true } });
}

// the divine traits behind "Add my divine traits" on My character
{
  const m = guideJs.match(/\$\('#addDivine'\)\.addEventListener\('click',\(\)=>\{([\s\S]*?)addOpts\(list\); \}\);/);
  if (!m) throw new Error('divine traits not found');
  const run = (tier) => vm.runInNewContext(m[1] + ';list', { C: { tier } });
  const all = run(''), demi = run('Demigod'), god = run('God');
  rules.push({ kind: 'divine', key: 'all', sort: 0, data: { v: all }, phase: null });
  rules.push({ kind: 'divine', key: 'Demigod', sort: 1, data: { v: demi.slice(all.length) }, phase: null });
  rules.push({ kind: 'divine', key: 'God', sort: 2, data: { v: god.slice(all.length) }, phase: null });
}

// ------------------------------------------------------------------ sessions (DM only)

const $r = load(runHtml);
const sessions = [];
{
  const steps = $r('.steps .step').map((_, b) => {
    const $b = $r(b);
    const num = squash($b.find('b').text());
    const label = squash($b.clone().find('b').remove().end().text());
    const cls = ($b.attr('class') || '').split(/\s+/).filter((c) => c !== 'step').join(' ');
    return { id: $b.attr('data-p'), num, label, cls };
  }).get();
  const beats = $r('.wrap > section').map((_, s) => ({ id: $r(s).attr('id'), html: $r(s).html().trim() })).get();
  const dragons = evalConst(runJs, 'D0');
  const per = runJs.match(/const per = (\{[^}]+\})\[V\.party\]/);
  const gaze = runJs.match(/num\(hostEl\.value\) - (\d+)\)/);
  const voth = runJs.match(/store\.get\('voth', (\{[^}]+\})\)/);
  const order = evalConst(runJs, 'ORDER');
  if (!dragons || !per || !gaze || !voth || !order) throw new Error('run sheet trackers not found');
  const card = $h('#sessions a.sess');
  sessions.push({
    number: -1,
    title: squash(card.find('h3').text()),
    meta: squash(card.find('p.who').text()),
    summary: squash(card.find('p').not('.who').not('.kv').first().text()),
    status: 'ready',
    content: {
      name: squash($r('.bar .name').clone().find('small').remove().end().text()),
      sub: squash($r('.bar .name small').text()),
      hostLabel: squash($r('.host .lab').text()),
      steps, order, beats,
      templates: { host: $r('#tHost').html().trim(), drop: $r('#tDrop').html().trim() },
      trackers: {
        host: Number($r('#host').attr('value')),
        dragons,
        voth: vm.runInNewContext('(' + voth[1] + ')'),
        perPhase: vm.runInNewContext('(' + per[1] + ')'),
        gaze: Number(gaze[1]),
      },
    },
  });
  const zero = $h('#sessions .grid > div.plate');
  sessions.push({
    number: 0,
    title: squash(zero.find('h3').text()),
    meta: squash(zero.find('p.who').text()),
    summary: squash(zero.find('p').not('.who').first().text()),
    status: 'unplanned',
    content: {},
  });
}

// ------------------------------------------------------------------ media

const media = [];
const TYPES = { '.jpg': 'image/jpeg', '.mp4': 'video/mp4' };
for (const dir of ['t', 'v']) {
  for (const f of fs.readdirSync(path.join(SRC, 'character-builder', dir)).sort()) {
    const ext = path.extname(f);
    const m = f.match(/^(.*)_(before|after)(\.\w+)$/);
    media.push({
      key: dir + '/' + (m ? m[1] + m[3] : f),
      path: dir + '/' + f,   // scripts/seed.mjs puts the campaign's id in front, so no path names the campaign
      phase: m ? m[2] : null,
      content_type: TYPES[ext] || 'application/octet-stream',
      file: 'source/character-builder/' + dir + '/' + f,
    });
  }
}

// ------------------------------------------------------------------ campaign

const rootCss = guideHtml.match(/:root\{([\s\S]*?)\}/)[1] + builderHtml.match(/:root\{([\s\S]*?)\}/)[1] + runHtml.match(/:root\{([\s\S]*?)\}/)[1];
const token = (n) => { const m = rootCss.match(new RegExp('--' + n + ':([^;]+);')); if (!m) throw new Error('token ' + n); return m[1].trim(); };
const colors = Object.fromEntries(['void', 'deep', 'plate', 'plate2', 'line', 'field', 'vellum', 'dim', 'gold', 'ember', 'star', 'verd', 'on-gold'].map((n) => [n, token(n)]));
const campaign = {
  slug: SLUG,
  title: squash($g('.hero h1').text()),
  tagline: squash($g('.hero p.premise').text()),
  status: 'active',
  phase: 'before',
  phases: $r ? cheerio.load(builderHtml)('#dmBox [data-phase]').map((_, b) => ({ id: b.attribs['data-phase'], label: squash(cheerio.load(builderHtml)(b).text()) })).get() : [],
  theme: {
    colors,
    fonts: { display: token('display'), body: token('body'), href: guideHtml.match(/<link href="(https:\/\/fonts\.googleapis\.com\/css2[^"]+)"/)[1].replace(/&amp;/g, '&') },
    goldHi: '#e3c47f', goldLo: '#b58f45',
    starfield: true,
  },
};

// ------------------------------------------------------------------ before and after session negative

const phaseLog = applyPhases({ content, rules, sections, campaign, builderRaces: B.RACES, hubJs });

// ------------------------------------------------------------------ write

const counts = {
  sections: sections.length,
  contentRows: content.length,
  contentPlayer: content.filter((r) => r.visibility === 'player').length,
  contentDm: content.filter((r) => r.visibility === 'dm').length,
  headings: content.filter((r) => r.kind === 'heading').length,
  plates: content.filter((r) => r.kind === 'plate').length,
  secrets: content.filter((r) => r.kind === 'secret').length,
  races: content.filter((r) => r.kind === 'race').length,
  factions: content.filter((r) => r.kind === 'faction').length,
  builderRaces: rules.filter((r) => r.kind === 'race').length,
  classes: rules.filter((r) => r.kind === 'class').length,
  spells: rules.filter((r) => r.kind === 'spell').length,
  backgrounds: rules.filter((r) => r.kind === 'background').length,
  armor: rules.filter((r) => r.kind === 'armor').length,
  weapons: rules.filter((r) => r.kind === 'weapon').length,
  sessions: sessions.length,
  runSheetBeats: sessions[0].content.beats.length,
  media: media.length,
};

fs.mkdirSync(path.join(ROOT, 'seed'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'seed', SLUG + '.json'), JSON.stringify({ campaign, sections, content, rules, sessions, media, counts, phaseLog }, null, 1));
console.log(report.join('\n'));
console.log(counts);
