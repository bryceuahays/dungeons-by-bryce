// Turns pasted text into campaign tabs and blocks. The format is described for users on
// the "How to format a pasted campaign" page (/help/campaign-format). It is a small subset
// of Markdown plus three bracket tags:
//
//   # Title                 the campaign title (first line; only used when creating a campaign)
//   > Tagline               one line under the title
//   ## Tab name             starts a tab. Add "(DM only)" to keep the whole tab from players
//   ### Heading             a heading inside the tab
//   plain lines             a paragraph (a blank line ends it)
//   - item / 1. item        lists
//   | a | b |               a table (first row is the header)
//   [card: Title] … [/card]       a card; cards next to each other sit side by side
//   [secret: Label] … [/secret]   a DM-only secret box
//   [dm] … [/dm]                  everything inside is DM only
//   **bold**  *italic*  [words](https://link)
//
// Any HTML in the text is shown as text, not run. This file has no imports so it can be tested on its own.

export type ImportedBlock = { kind: 'heading' | 'html' | 'plate' | 'secret' | 'table'; title: string; visibility: 'player' | 'dm'; body: Record<string, unknown> };
export type ImportedTab = { title: string; slug: string; audience: 'all' | 'dm'; blocks: ImportedBlock[] };
export type Imported = { title: string; tagline: string; tabs: ImportedTab[]; notes: string[] };

const RESERVED = new Set(['builder', 'manage', 'edit', 'media', 'session', 'bg', 'sheet', 'combat', 'sessions', 'players']);
export const MAX_IMPORT_CHARS = 200000;
const MAX_TABS = 30, MAX_BLOCKS = 800;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

// **bold**, *italic*, [text](https://…). Everything else is escaped.
function inline(text: string): string {
  let s = esc(text);
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, t, u) => `<a href="${u}" target="_blank" rel="noopener noreferrer">${t}</a>`);
  s = s.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<i>$2</i>');
  return s;
}

const isBullet = (l: string) => /^\s*[-*•]\s+/.test(l);
const isNumber = (l: string) => /^\s*\d+[.)]\s+/.test(l);
const isRow = (l: string) => /^\s*\|.*\|\s*$/.test(l);
const isRule = (l: string) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l);
const cells = (l: string) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());

// plain lines -> a run of small HTML pieces (paragraphs, lists, tables, h4 for #### lines)
function flow(lines: string[]): { html: string; first: string } {
  const out: string[] = [];
  let first = '';
  for (let i = 0; i < lines.length;) {
    const l = lines[i];
    if (!l.trim()) { i++; continue; }
    if (isBullet(l) || isNumber(l)) {
      const ordered = isNumber(l), items: string[] = [];
      while (i < lines.length && (ordered ? isNumber(lines[i]) : isBullet(lines[i]))) items.push(lines[i++].replace(/^\s*(?:[-*•]|\d+[.)])\s+/, ''));
      out.push(`<${ordered ? 'ol' : 'ul'}>${items.map((x) => `<li>${inline(x)}</li>`).join('')}</${ordered ? 'ol' : 'ul'}>`);
      first ||= items[0];
    } else if (/^####\s+/.test(l)) {
      out.push(`<h4>${inline(l.replace(/^####\s+/, ''))}</h4>`); i++;
    } else {
      const para: string[] = [];
      while (i < lines.length && lines[i].trim() && !isBullet(lines[i]) && !isNumber(lines[i]) && !isRow(lines[i]) && !/^#{3,4}\s/.test(lines[i])) para.push(lines[i++].trim());
      if (!para.length) { i++; continue; }
      out.push(`<p>${inline(para.join(' '))}</p>`);
      first ||= para[0];
    }
  }
  return { html: out.join('\n'), first };
}

export function parseCampaignText(input: string): Imported {
  const notes: string[] = [];
  const text = String(input || '').replace(/\r\n?/g, '\n').slice(0, MAX_IMPORT_CHARS);
  const lines = text.split('\n');
  const result: Imported = { title: '', tagline: '', tabs: [], notes };
  let tab: ImportedTab | null = null;
  let dmDepth = false;           // inside [dm] … [/dm]
  let cardGroup = 0, lastWasCard = false, total = 0;
  const used = new Set<string>();

  const openTab = (rawTitle: string) => {
    const dm = /\(\s*dm only\s*\)\s*$/i.test(rawTitle);
    const title = rawTitle.replace(/\(\s*dm only\s*\)\s*$/i, '').trim().slice(0, 40) || 'Page';
    let slug = slugify(title) || 'page';
    if (RESERVED.has(slug)) slug += '-page';
    for (let n = 2; used.has(slug); n++) slug = (slugify(title) || 'page') + '-' + n;
    used.add(slug);
    tab = { title, slug, audience: dm ? 'dm' : 'all', blocks: [] };
    result.tabs.push(tab);
    lastWasCard = false;
  };
  const add = (b: ImportedBlock) => {
    if (!tab) openTab('Overview');
    if (++total > MAX_BLOCKS) return;
    tab!.blocks.push(b);
    lastWasCard = b.kind === 'plate';
  };
  const vis = (): 'player' | 'dm' => (dmDepth || tab?.audience === 'dm' ? 'dm' : 'player');
  // text gathered since the last block-level line
  let pending: string[] = [];
  const flush = () => {
    if (!pending.some((l) => l.trim())) { pending = []; return; }
    const { html, first } = flow(pending);
    pending = [];
    if (html) add({ kind: 'html', title: first.replace(/[*_[\]()]/g, '').slice(0, 80), visibility: vis(), body: { html } });
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const t = line.trim();

    if (/^#\s+/.test(t) && !/^##/.test(t)) {
      if (!result.title && !result.tabs.length) result.title = t.replace(/^#\s+/, '').trim().slice(0, 80);
      else notes.push(`Line ${i + 1}: only the first "# Title" line is used; this one was treated as a heading.`), (flush(), add({ kind: 'heading', title: t.replace(/^#\s+/, '').slice(0, 80), visibility: vis(), body: { text: t.replace(/^#\s+/, '').slice(0, 120), level: 2 } }));
      continue;
    }
    if (/^>\s?/.test(t) && !result.tabs.length && !result.tagline) { result.tagline = t.replace(/^>\s?/, '').trim().slice(0, 300); continue; }
    if (/^##\s+/.test(t) && !/^###/.test(t)) {
      flush();
      if (result.tabs.length >= MAX_TABS) { notes.push(`Only the first ${MAX_TABS} tabs were used.`); break; }
      dmDepth = false;
      openTab(t.replace(/^##\s+/, ''));
      continue;
    }
    if (/^###\s+/.test(t) && !/^####/.test(t)) {
      flush();
      const h = t.replace(/^###\s+/, '').trim();
      add({ kind: 'heading', title: h.slice(0, 80), visibility: vis(), body: { text: h.slice(0, 120), level: 2 } });
      continue;
    }
    if (/^\[dm\]$/i.test(t)) { flush(); dmDepth = true; continue; }
    if (/^\[\/dm\]$/i.test(t)) { flush(); dmDepth = false; continue; }

    const open = t.match(/^\[(card|secret)\s*:?\s*([^\]]*)\]$/i);
    if (open) {
      flush();
      const kind = open[1].toLowerCase();
      const label = open[2].trim();
      const inner: string[] = [];
      let closed = false;
      for (i++; i < lines.length; i++) {
        if (new RegExp(`^\\[/${kind}\\]$`, 'i').test(lines[i].trim())) { closed = true; break; }
        inner.push(lines[i]);
      }
      if (!closed) notes.push(`A [${kind}] block was not closed with [/${kind}]; it runs to the end of the text.`);
      const { html } = flow(inner);
      if (kind === 'card') {
        if (!lastWasCard) cardGroup++;
        add({ kind: 'plate', title: label.slice(0, 80) || 'Card', visibility: vis(), body: { html: (label ? `<h3>${inline(label)}</h3>\n` : '') + html, grid: 'g2', group: 'import-' + ((tab as ImportedTab | null)?.slug ?? 'x') + '-' + cardGroup } });
      } else {
        add({ kind: 'secret', title: label.slice(0, 80) || 'DM only', visibility: 'dm', body: { tag: label || 'DM only', html } });
      }
      continue;
    }

    if (isRow(t)) {
      flush();
      const rows: string[][] = [];
      for (; i < lines.length && isRow(lines[i]); i++) if (!isRule(lines[i])) rows.push(cells(lines[i]));
      i--;
      if (rows.length) {
        const [head, ...body] = rows;
        add({ kind: 'table', title: head.join(', ').slice(0, 80), visibility: vis(), body: { html: `<table><tr>${head.map((c) => `<th>${inline(c)}</th>`).join('')}</tr>${body.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</table>` } });
      }
      continue;
    }
    if (!t) { flush(); continue; }
    pending.push(line);
  }
  flush();
  if (total > MAX_BLOCKS) notes.push(`Only the first ${MAX_BLOCKS} blocks were used.`);
  result.tabs = result.tabs.filter((x) => x.blocks.length || x.title);
  return result;
}

// The example shown on the help page and offered as a starting point.
export const IMPORT_EXAMPLE = `# The Sunken Crown
> A drowned kingdom wakes, and everyone wants what is at the bottom of it.

## Overview
The city of Marrow sank in a single night three hundred years ago. Last month its bells began to ring again.

### What everyone knows
- The bells ring at low tide.
- Divers who go down come back **changed**, or do not come back.
- The harbour guild is paying well for anyone willing to look.

[card: Marrow]
The drowned capital. Its towers still break the surface at low tide.
[/card]

[card: The Harbour Guild]
Merchants who own every boat on the coast. They want the crown found before anyone else finds it.
[/card]

[secret: What is really ringing the bells]
The old king is still down there, and he is not dead.
[/secret]

## Factions
| Faction | Wants |
| --- | --- |
| Harbour Guild | The crown, to sell |
| The Tidewardens | The city left alone |

## DM notes (DM only)
### Session one
1. Open on the docks at dawn.
2. The first bell rings while they are still talking.

[dm]
This paragraph is on a page players cannot see anyway, but [dm] also works inside a tab that players can see.
[/dm]
`;
