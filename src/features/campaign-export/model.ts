// What goes in a campaign's download, file by file. Pure, so tests load it directly.
//
// The .zip is laid out for a person first and a program second: a README, every page as an HTML
// file anyone can open, and the same things again as JSON, with every picture in files/.

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;
export type ExportInput = {
  campaign: Row; sections: Row[]; content: Row[]; characters: Row[]; entries: Row[]; secrets: { entry_id: string; data: unknown }[];
  sessions: Row[]; attached: Row[]; members: { user_id: string; display_name: string }[]; notes: Row[]; faces: Row[]; links: { zip: string; url: string }[];
};
// `text`: file name to contents; `files`: pictures the browser fetches and adds.
export type ExportBundle = { name: string; text: Record<string, string>; files: { zip: string; url: string }[] };

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);
export const safeName = (s: unknown, fallback = 'untitled') => (String(s ?? '').normalize('NFKD').split('').filter((ch) => ch.charCodeAt(0) < 0x300 || ch.charCodeAt(0) > 0x36f).join('').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || fallback);
const json = (v: unknown) => JSON.stringify(v, null, 2) + '\n';

// one page of the campaign as a plain HTML file (the DM's view: hidden and DM-only blocks marked)
function pageHtml(title: string, blocks: Row[]): string {
  const body = blocks.map((b) => {
    const marks = [b.visibility === 'dm' ? 'DM only' : '', b.hidden ? 'hidden' : '', b.phase ? `only during ${b.phase}` : '', b.from_stage ? `from ${b.from_stage}` : ''].filter(Boolean);
    const head = `<p class="m">${esc(b.kind)}${b.title ? ' · ' + esc(b.title) : ''}${marks.length ? ' · ' + esc(marks.join(', ')) : ''}</p>`;
    const d = b.body ?? {};
    const inner = typeof d.html === 'string' ? d.html : typeof d.text === 'string' ? `<h2>${esc(d.text)}</h2>` : `<pre>${esc(JSON.stringify(d, null, 2))}</pre>`;
    return `<section>${head}${inner}</section>`;
  }).join('\n');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title>
<style>body{font:16px/1.6 Georgia,serif;max-width:760px;margin:2rem auto;padding:0 1rem;color:#222}section{border-top:1px solid #ddd;padding:.5rem 0}.m{font:12px system-ui,sans-serif;color:#777;text-transform:uppercase;letter-spacing:.04em}pre{white-space:pre-wrap;font-size:13px;background:#f6f6f6;padding:.5rem}</style></head>
<body><h1>${esc(title)}</h1>
${body || '<p>This page has no blocks.</p>'}
</body></html>
`;
}

export function exportFiles(x: ExportInput): ExportBundle {
  const c = x.campaign;
  const secretOf = new Map(x.secrets.map((s) => [s.entry_id, s.data]));
  const day = new Date().toISOString().slice(0, 10);
  const text: Record<string, string> = {};

  text['README.txt'] = [
    `${c.title ?? 'Campaign'}: everything in it, downloaded from Dungeons by Bryce on ${day}.`,
    '',
    'pages/       every tab as a web page you can open in a browser (DM-only and hidden blocks are marked)',
    'campaign.json   the campaign itself: title, tagline, chapters, settings and theme',
    'pages.json      the tabs and every block on them',
    'characters/  one file per character',
    'entries/     NPCs, lore, quests, maps, regions, pins, the timeline, world state and the reveal log, by kind,',
    '             each with the DM-only notes kept for it (under "secret")',
    'sessions.json   sessions and their planning notes',
    'homebrew.json   the homebrew attached to this campaign, and who could see it',
    'players.json    who was in the campaign (names only)',
    'secrets.json    the per-player secrets you wrote',
    'files/       every picture: maps, painted maps, NPC portraits, lore pictures, page media and backgrounds',
    '',
    'Players\' own private notes are not included: they belong to the players, and not even the DM can read them.',
    '',
  ].join('\n');

  const { owner_id: _o, ...campaign } = c;
  void _o;
  text['campaign.json'] = json({ ...campaign, faces: x.faces });
  text['pages.json'] = json(x.sections.map((s) => ({ ...s, blocks: x.content.filter((b) => b.section === s.slug) })));
  const used = new Set<string>();
  const unique = (base: string) => { let n = base, i = 2; while (used.has(n)) n = `${base}-${i++}`; used.add(n); return n; };
  for (const s of x.sections) text[`pages/${unique(safeName(s.slug || s.title, 'page'))}.html`] = pageHtml(String(s.title ?? s.slug), x.content.filter((b) => b.section === s.slug));
  for (const ch of x.characters) text[`characters/${unique('c-' + safeName(ch.data?.name, 'character'))}.json`] = json(ch);
  const kinds = [...new Set(x.entries.map((e) => String(e.kind)))].sort();
  for (const k of kinds) text[`entries/${safeName(k)}.json`] = json(x.entries.filter((e) => e.kind === k).map((e) => ({ ...e, ...(secretOf.has(e.id) ? { secret: secretOf.get(e.id) } : {}) })));
  text['sessions.json'] = json(x.sessions);
  text['homebrew.json'] = json(x.attached);
  text['players.json'] = json(x.members.map((m) => ({ name: m.display_name, id: m.user_id })));
  text['secrets.json'] = json(x.notes.map((n) => ({ ...n, for: x.members.find((m) => m.user_id === n.user_id)?.display_name ?? null })));

  return { name: `${safeName(c.title, 'campaign')}-${day}.zip`, text, files: x.links };
}

// Everything an account owns, before it is deleted: each of its campaigns laid out as above in its
// own folder, then its characters, homebrew, game systems, worlds, its own private notes, and its
// pictures.
export type AccountInput = {
  profile: { name: string; email: string }; campaigns: ExportInput[]; characters: Row[]; homebrew: Row[]; systems: Row[]; worlds: Row[]; notes: Row[];
  files: { zip: string; url: string }[];
};
export function exportAccountFiles(x: AccountInput): ExportBundle {
  const day = new Date().toISOString().slice(0, 10);
  const text: Record<string, string> = {};
  const files: { zip: string; url: string }[] = [...x.files];
  text['README.txt'] = [
    `Everything ${x.profile.name || 'your account'} kept on Dungeons by Bryce, downloaded on ${day}.`,
    '',
    'campaigns/   each campaign you created, laid out like a campaign download (open its README.txt)',
    'characters/  every character you made, in any campaign or on their own',
    'homebrew.json   your homebrew entries',
    'game-systems.json   the game systems you built',
    'worlds.json     your worlds',
    'my-notes.json   your own private notes in campaigns you play in',
    'profile.json    your name and email address',
    'files/       your hub background and the banners on your homebrew',
    '',
  ].join('\n');
  text['profile.json'] = json(x.profile);
  const used = new Set<string>();
  const unique = (base: string) => { let n = base, i = 2; while (used.has(n)) n = `${base}-${i++}`; used.add(n); return n; };
  for (const c of x.campaigns) {
    const b = exportFiles(c);
    const dir = `campaigns/${unique(safeName(c.campaign.title, 'campaign'))}`;
    for (const [p, body] of Object.entries(b.text)) text[`${dir}/${p}`] = body;
    for (const f of b.files) files.push({ zip: `${dir}/${f.zip}`, url: f.url });
  }
  for (const ch of x.characters) text[`characters/${unique('c-' + safeName(ch.data?.name, 'character'))}.json`] = json(ch);
  text['homebrew.json'] = json(x.homebrew);
  text['game-systems.json'] = json(x.systems);
  text['worlds.json'] = json(x.worlds);
  text['my-notes.json'] = json(x.notes);
  return { name: `dungeons-by-bryce-${safeName(x.profile.name, 'account')}-${day}.zip`, text, files };
}
