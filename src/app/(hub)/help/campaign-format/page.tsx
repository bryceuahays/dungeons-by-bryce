import Link from 'next/link';
import { requireViewer } from '@/lib/auth';
import { IMPORT_EXAMPLE } from '@/lib/import';
import { CopyBox } from '@/components/CopyBox';

export const metadata = { title: 'How to format a pasted campaign' };

const ROWS: [string, string][] = [
  ['# The Sunken Crown', 'The campaign title. Put it on the very first line. (Only used when you create a campaign.)'],
  ['> A drowned kingdom wakes.', 'The one-line tagline, right under the title.'],
  ['## Overview', 'Starts a new tab. Everything under it goes on that tab until the next ## line.'],
  ['## DM notes (DM only)', 'A tab only you can see. Add (DM only) after the name.'],
  ['### What everyone knows', 'A heading inside a tab.'],
  ['Plain text', 'A paragraph. Leave an empty line between paragraphs.'],
  ['- an item', 'A bullet list. Use 1. 2. 3. for a numbered list.'],
  ['| Name | Wants |', 'A table. Each row is a line that starts and ends with |. The first row is the header.'],
  ['[card: Marrow] … [/card]', 'A card with a title. Cards written one after another sit side by side.'],
  ['[secret: Label] … [/secret]', 'A DM-only secret box. Players never receive it.'],
  ['[dm] … [/dm]', 'Everything between these two lines is DM only, on a tab players can otherwise see.'],
  ['**bold**  *italic*', 'Bold and italic.'],
  ['[the wiki](https://example.com)', 'A link.'],
];

export default async function CampaignFormat() {
  await requireViewer();
  return (
    <>
      <h1>How to format a pasted campaign</h1>
      <div className="panel">
        <p>You can paste a whole campaign in one go, when you <Link href="/new-campaign">create a campaign</Link> or later on its Manage page. The site reads a few simple marks to work out what is a tab, a heading, a card, or a secret. Everything else is treated as ordinary text.</p>
        <p className="dim">If your notes are in a document already, the quickest way is to copy the example below, replace its words with yours, and paste the result. You can also give the example and your notes to an AI assistant and ask it to &quot;rewrite my notes in exactly this format&quot;.</p>
      </div>

      <h2>The marks</h2>
      <div className="panel">
        <table className="fmt">
          <thead><tr><th>You write</th><th>What it becomes</th></tr></thead>
          <tbody>{ROWS.map(([a, b]) => <tr key={a}><td><code>{a}</code></td><td>{b}</td></tr>)}</tbody>
        </table>
      </div>

      <h2>Good to know</h2>
      <div className="panel">
        <ul className="plain">
          <li>Anything in a <code>[secret]</code> box, a <code>[dm]</code> block, or a <code>(DM only)</code> tab is kept from your players by the database itself, not just hidden on the page.</li>
          <li>Text before the first <code>##</code> line goes on a tab called Overview.</li>
          <li>Every campaign also gets My character, Combat, Sessions, and Players tabs. You do not write those.</li>
          <li>Character builder rules (classes, spells, races) cannot be pasted. Choose a campaign to copy them from when you create yours.</li>
          <li>Web code such as HTML is shown as plain text. It is never run.</li>
          <li>Up to 30 tabs and about 200,000 characters at a time. You can paste more later.</li>
          <li>Nothing is final: after pasting, open any tab and choose Edit this page to change, move, hide, or delete any block.</li>
        </ul>
      </div>

      <h2>An example you can copy</h2>
      <div className="panel">
        <CopyBox text={IMPORT_EXAMPLE} />
      </div>
    </>
  );
}
