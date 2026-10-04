// Before and after session negative.
//
// Called by scripts/extract.mjs once the source has been read. It tags what players may
// only see after the one-shot (phase "after"), and adds the short list of things they
// see only before it (phase "before"). Nothing from source/ is rewritten or deleted:
// rows are tagged, and where one row mixed both kinds of text it is split so each part
// can carry its own tag.
//
// The ONLY text here that is not lifted from source/ is the block marked NEW TEXT,
// which Bryce supplied on 3 October 2026.

import * as cheerio from 'cheerio';

// ---------------------------------------------------------------- NEW TEXT (from Bryce)

const BEFORE = {
  title: 'To Kill God',
  slug: 'to-kill-god',
  tagline: 'Voth, the dragon god, has ruled every world for as long as anyone remembers. Two hundred mortals have decided that is long enough. You are among them.',
  facts: '4 to 6 players. Level 15. One session of 3 to 4 hours. Tragic and epic.',
  vothCard: ['Voth', 'Gold dragon. God of the universe.'],
  campaignBlock: 'Session negative: To Kill God',
  underVoth: {
    corrin: 'They are her archivists.',
    sough: 'Voth burns back the Elder fields, and the Sough hate her for it.',
    ondri: 'Because their sincerity is visible, Voth has made them her envoys and arbiters between peoples. They never asked for the job.',
    lorn: 'They are the one people she has never given a task. Nobody knows why.',
    dural: 'She confines them to their world and forbids their conquests.',
    dragonborn: 'Her kin and stewards, with privileges others resent.',
    human: 'The most numerous people and the most managed. She settles their disputes and steadies their harvests, so they have never learned to govern themselves.',
    tortle: 'Wanderers and ferrymen who spend their lives travelling. At the end, Voth guides each one back to the beach where it hatched to lay its eggs and die.',
    aarakocra: 'Her watchers. From high cloisters they keep a vow to see everything and act on nothing, and report what they see to her in daily prayer. Other peoples resent them as spies.',
    kenku: 'Her mouthpieces. She speaks to mortals through them, borrowing their voices.',
    hadozee: 'The sailors of the space between worlds. She sets the lanes and they are allowed no others.',
    ape: 'Her builders. They raise every temple and monument, and are given no choice about it.',
  },
  keySwap: { dragonborn: { "Once honored as Voth's stewards": "Honored as Voth's stewards" } },
};

// ---------------------------------------------------------------- what to hide until "after"

// Summary key lines on each race. `listed` are the ones Bryce named; `audit` are further
// lines found by the audit that name a faction or describe the aftermath.
const AFTER_KEYS = {
  corrin: { listed: ['Split between the Concord and the Faithful'] },
  sough: { listed: ['Praised for avenging the Elder fields', 'Split among all factions, many Refusers'] },
  ondri: { listed: ['Every faction wants one to vouch for it'] },
  dural: { listed: ['Many of the Reavers'] },
  dragonborn: { listed: ["Once honored as Voth's stewards", 'Now blamed as collaborators', "Most of Voth's Faithful"] },
  human: { audit: ['Led the march against Voth', 'Most of the Unbowed and the Foundry'] },
  tortle: { audit: ['Dying lost since Voth fell'] },
  aarakocra: { audit: ['Now sell their eyes to any god'] },
  kenku: { audit: ['Voth spoke through them', 'Some can still imitate her voice'] },
  hadozee: { audit: ['Carry cargo for every faction'] },
};
// Culture lines that describe the aftermath (found by the audit).
const AFTER_CULTURE = {
  dragonborn: ['Their standing is still shifting. Some worlds hunt them, some have stripped their status, and a few still revere them.'],
  human: ['Proud of having led the march against Voth.'],
};

export function applyPhases({ content, rules, sections, campaign, builderRaces, hubJs }) {
  const log = [];   // every tag and addition, for the report
  const note = (page, item, phase, why = 'listed') => log.push({ page, item, phase, why });
  const one = (pred, what) => { const r = content.filter(pred); if (r.length !== 1) throw new Error(`expected one row for ${what}, found ${r.length}`); return r[0]; };
  const P = (r) => r.visibility === 'player';
  content.forEach((r) => { r.phase = null; });
  rules.forEach((r) => { if (r.phase === undefined) r.phase = null; });
  sections.forEach((s) => { s.phase = null; });

  // ---- the campaign's two faces
  campaign.faces = [
    { phase: '', slug: campaign.slug, title: campaign.title, tagline: campaign.tagline },
    { phase: 'before', slug: BEFORE.slug, title: BEFORE.title, tagline: BEFORE.tagline },
  ];
  note('Campaign', `Title "${campaign.title}", address "${campaign.slug}", and the original tagline`, 'after');
  note('Campaign', `Title "${BEFORE.title}", address "${BEFORE.slug}", and the before tagline (added)`, 'before');

  // ---- whole tabs
  for (const slug of ['divinity', 'factions']) {
    const s = sections.find((x) => x.slug === slug);
    s.phase = 'after';
    const rows = content.filter((r) => r.section === slug && P(r));
    rows.forEach((r) => { r.phase = 'after'; });
    note(s.title + ' tab', `The whole tab: removed from the player tab bar, address returns not-found, all ${rows.length} player rows`, 'after');
  }

  // ---- Overview
  const tagRow = (r, page, item, why) => { r.phase = 'after'; note(page, item, 'after', why); };
  const ov = (kind, titleStart) => one((r) => r.section === 'overview' && P(r) && r.kind === kind && r.title.startsWith(titleStart), `overview ${kind} ${titleStart}`);
  const hero = ov('hero', campaign.title);
  tagRow(hero, 'Overview', 'Page header: title "To be a god", original tagline, constellation, and facts line');
  tagRow(ov('heading', 'The dead god'), 'Overview', 'Heading "The dead god"');
  const vothAfter = ov('plate', 'Voth');
  tagRow(vothAfter, 'Overview', 'Voth card ("Gold dragon. God of the universe. Dead." and "Killed because…")');
  tagRow(ov('heading', 'Who holds power'), 'Overview', 'Heading "Who holds power"');
  tagRow(ov('html', 'Nobody at the table knows'), 'Overview', '"Nobody at the table knows which of you is a god and which is a demigod."');
  tagRow(ov('table', 'Tier'), 'Overview', 'Tier table (Mortal, Demigod, God)');
  tagRow(ov('html', 'Full rules are under'), 'Overview', '"Full rules are under Divinity."');
  tagRow(ov('heading', 'The factions'), 'Overview', 'Heading "The factions"');
  tagRow(ov('faction-table', ''), 'Overview', 'Faction table');
  tagRow(ov('html', 'Leaders, resources'), 'Overview', '"Leaders, resources, and moves are under Factions."');

  content.push({
    section: 'overview', kind: 'hero', key: 'hero-before', title: BEFORE.title, visibility: 'player', phase: 'before', sort: hero.sort,
    body: { html: `<h1>${BEFORE.title}</h1>\n    <p class="premise">${BEFORE.tagline}</p>\n    <div class="facts"><span>${BEFORE.facts}</span></div>` },
  });
  note('Overview', 'Page header: title "To Kill God", before tagline, before facts line (added)', 'before');
  content.push({
    section: 'overview', kind: 'plate', key: 'plate-voth-before', title: BEFORE.vothCard[0], visibility: 'player', phase: 'before', sort: vothAfter.sort,
    body: { html: `<h3 style="color:var(--gold)">${BEFORE.vothCard[0]}</h3>\n      <p class="who">${BEFORE.vothCard[1]}</p>`, grid: 'g2', group: 'overview-before' },
  });
  note('Overview', 'Voth card: "Voth. Gold dragon. God of the universe." (added)', 'before');

  // ---- Campaign tab
  const camp = (kind, titleStart) => one((r) => r.section === 'campaign' && P(r) && r.kind === kind && r.title.startsWith(titleStart), `campaign ${kind} ${titleStart}`);
  const facts = camp('plate', 'The campaign');
  tagRow(facts, 'Campaign', '"The campaign" facts list');
  tagRow(camp('heading', 'The road to session one'), 'Campaign', 'Heading "The road to session one"');
  tagRow(camp('html', 'Session negative.'), 'Campaign', 'The road to session one: the three steps');
  const tableRules = camp('plate', 'Table rules');
  content.push({
    section: 'campaign', kind: 'plate', key: 'plate-session-negative-before', title: BEFORE.campaignBlock, visibility: 'player', phase: 'before', sort: facts.sort,
    body: { html: `<h3>${BEFORE.campaignBlock}</h3>\n      <p>${BEFORE.facts}</p>`, grid: tableRules.body.grid, group: tableRules.body.group },
  });
  note('Campaign', '"Session negative: To Kill God" block with the before facts (added). "Table rules" stays in every phase', 'before');

  // ---- Races: each race row is split into what is always shown, and one row per phase
  const raceRows = content.filter((r) => r.kind === 'race');
  for (const row of raceRows) {
    const r = row.body, id = r.id, name = r.name;
    const b = builderRaces.find((x) => x.id === id);
    const after = {}, before = {};
    const move = (field) => { if (r[field] !== undefined) { after[field] = r[field]; delete r[field]; } };

    // Under Voth: the past-tense paragraph, and Bryce's present-tense one
    if (!BEFORE.underVoth[id]) throw new Error('no before history for ' + id);
    move('voth'); before.voth = BEFORE.underVoth[id];
    note('Races: ' + name, '"Under Voth" (past tense, as written)', 'after');
    note('Races: ' + name, '"Under Voth" (present tense, added)', 'before');
    if (r.now !== undefined) { move('now'); note('Races: ' + name, '"Now" section', 'after'); }
    if (r.slayer !== undefined) { move('slayer'); note('Races: ' + name, '"As god-slayers" section', 'after'); }

    // the one-line summary: four races have a before and an after wording in the builder
    if (Array.isArray(b.line)) {
      if (b.line[1] !== r.line) throw new Error('builder and guide disagree on the line for ' + id);
      after.line = r.line; before.line = b.line[0]; delete r.line;
      note('Races: ' + name, `Summary line "${after.line}"`, 'after', 'audit');
      note('Races: ' + name, `Summary line "${before.line}" (the builder's own before wording, from source)`, 'before', 'audit');
    }

    // key lines
    const hide = AFTER_KEYS[id] || {};
    const hidden = [...(hide.listed || []), ...(hide.audit || [])];
    hidden.forEach((k) => { if (!r.keys.includes(k)) throw new Error(`key line not in source for ${id}: ${k}`); });
    const swap = BEFORE.keySwap[id] || {};
    if (hidden.length) {
      after.keys = r.keys;
      before.keys = r.keys.flatMap((k) => (swap[k] ? [swap[k]] : hidden.includes(k) ? [] : [k]));
      delete r.keys;
      (hide.listed || []).forEach((k) => note('Races: ' + name, `Key line "${k}"`, 'after'));
      (hide.audit || []).forEach((k) => note('Races: ' + name, `Key line "${k}"`, 'after', 'audit'));
      Object.values(swap).forEach((k) => note('Races: ' + name, `Key line "${k}" (added)`, 'before'));
    }

    // culture lines about the aftermath
    const cul = AFTER_CULTURE[id];
    if (cul) {
      cul.forEach((k) => { if (!r.culture.includes(k)) throw new Error(`culture line not in source for ${id}: ${k}`); note('Races: ' + name, `Culture line "${k}"`, 'after', 'audit'); });
      after.culture = r.culture; before.culture = r.culture.filter((k) => !cul.includes(k)); delete r.culture;
    }

    // trait sentences that only apply after (the builder already separates them)
    const traitAfter = {};
    r.traits = r.traits.map((t) => {
      const bt = b.traits.find((x) => x[0] === t[0]);
      if (!bt || !bt[2] || !bt[2].after) return t;
      if (!t[1].startsWith(bt[1])) throw new Error(`trait text differs for ${id} ${t[0]}`);
      traitAfter[t[0]] = t[1].slice(bt[1].length);
      note('Races: ' + name, `${t[0]} trait, last sentence: "${traitAfter[t[0]].trim()}"`, 'after', 'audit');
      return [t[0], bt[1], t[2]];
    });
    if (Object.keys(traitAfter).length) after.traitAfter = traitAfter;

    content.push({ section: 'races', kind: 'race-phase', key: id, title: name + ' (after)', body: after, visibility: 'player', phase: 'after', sort: row.sort });
    content.push({ section: 'races', kind: 'race-phase', key: id, title: name + ' (before)', body: before, visibility: 'player', phase: 'before', sort: row.sort });
  }

  // ---- My character: the divinity parts of the form become slots that are filled in only after
  const tpl = one((r) => r.kind === 'sheet-template', 'sheet template');
  const $ = cheerio.load('<div id="x">' + tpl.body.html + '</div>');
  const privateKeys = [];
  const slot = (key, el, item) => {
    if (el.length !== 1) throw new Error('sheet slot not found: ' + key);
    el.find('[data-k]').add(el.filter('[data-k]')).each((_, f) => { privateKeys.push($(f).attr('data-k')); });
    content.push({ section: 'sheet', kind: 'sheet-slot', key, title: item, body: { html: $.html(el).trim() }, visibility: 'player', phase: 'after', sort: tpl.sort + 1 + content.filter((r) => r.kind === 'sheet-slot').length });
    el.replaceWith(`<!--slot:${key}-->`);
    note('My character', item, 'after');
  };
  slot('domain', $('#x label.f').filter((_, l) => $(l).find('[data-k="domain"]').length > 0), 'Domain field');
  slot('divinity', $('#x .plate').filter((_, p) => $(p).children('h3').first().text().trim() === 'Divinity'), 'Divinity block (tier, Spark, Faith)');
  slot('divine-button', $('#x #addDivine'), '"Add my divine traits" button');
  tpl.body.html = $('#x').html().trim();
  rules.push({ kind: 'sheet-private', key: 'fields', sort: 0, phase: 'after', data: { v: [...new Set(privateKeys)] } });
  note('My character', `Stored values of ${[...new Set(privateKeys)].join(', ')}: kept in the database, not sent to the player`, 'after');

  rules.filter((r) => r.kind === 'divine').forEach((r) => { r.phase = 'after'; });
  note('My character', 'Divine trait texts behind the button (Deathless, Domain gift, Mortal guise, Realm, Faith, Bound, Sensed…)', 'after');

  // ---- the DM's party sheet shows divinity; its labels come from the DM hub source, not from code
  const block = hubJs.match(/<span class="tag">(\w+)<\/span><div class="sb">(Tier:[\s\S]*?)<\/div><\/div>/);
  if (!block) throw new Error('party divinity block not found in the DM hub');
  const fields = [...block[2].matchAll(/(\w+): \$\{pesc\(c\.(\w+)(?:===''\|\|c\.\w+==null\?|\|\|)'([^']+)'/g)].map((m) => ({ label: m[1], key: m[2], none: m[3] }));
  if (fields.length !== 4) throw new Error('party divinity fields not found');
  rules.push({ kind: 'party-labels', key: 'divinity', sort: 0, phase: 'after', data: { title: block[1], fields } });

  return log;
}
