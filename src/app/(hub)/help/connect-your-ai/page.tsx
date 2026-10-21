import Link from 'next/link';
import { CopyLink } from '@/components/CopyBox';

export const metadata = { title: 'Connect your AI' };

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? 'https://' + process.env.VERCEL_PROJECT_PRODUCTION_URL : 'http://localhost:3000')).replace(/\/$/, '');

// Connect your AI: how a DM adds Dungeons by Bryce to the AI app they already use (src/features/connector).
export default function ConnectYourAI() {
  const address = SITE + '/api/mcp';
  return (
    <>
      <h1>Connect your AI <span className="beta-tag">Beta</span></h1>
      <div className="panel">
        <p>Use the AI you already have (Claude, ChatGPT, or another app that supports connectors) to build homebrew straight into your account. Talk it through in your own chat, as much as you like, then ask it to save it: it lands in your Homebrew as a <b>draft</b> for you to check.</p>
        <p>For example: <i>&ldquo;Make a species of ape folk for my Kaverns Lantern system, with a chest-beating ability and a climbing speed.&rdquo;</i></p>
      </div>

      <h2>How to connect</h2>
      <div className="panel">
        <ol className="steps">
          <li>In your AI app, find where you add a connector (it is usually in Settings, under Connectors or Apps, and may need a paid plan).</li>
          <li>Add a new one with this address: <code>{address}</code> <CopyLink path="/api/mcp" label="Copy the address" /></li>
          <li>Your AI app sends you here to sign in. Check what it is asking for and press <b>Allow</b>.</li>
          <li>Start a chat and ask it to make something. Each thing it makes appears under <Link href="/homebrew">Homebrew</Link> as a draft.</li>
        </ol>
      </div>

      <h2>What it can and cannot do</h2>
      <div className="panel">
        <p><b>It can:</b> look at your game systems (so it uses your own abilities, skills and names), the official fifth edition rules, and your homebrew; and create drafts of species, classes, subclasses, backgrounds, feats, spells, items, monsters and custom resources, including versions of official ones (&ldquo;a cold-themed Warlock&rdquo;); and change any of your drafts in place, so asking it for a fix does not make a copy. It can also rewrite just the words of a draft (flavour, appearance, history) without touching its rules, check an entry against the official ones with the same balance hint you see in the editor, and look over all your homebrew for what is missing, like classes with no subclasses or rules still written only as words.</p>
        <p><b>Things to ask it:</b> &ldquo;Is my Afflicted class balanced?&rdquo; &middot; &ldquo;What is missing from my homebrew?&rdquo; &middot; &ldquo;Write some history and appearance for my Gyrillen species.&rdquo;</p>
        <p><b>It cannot:</b> change anything that is not a draft (once you set an entry live, only you can change it), delete anything, touch your campaigns or characters, or show anything to your players. It can make at most 30 drafts an hour, and drafts count toward the free plan&apos;s homebrew limit like any other entry.</p>
        <p><b>Drafts wait for you.</b> Open one, check it over (AI makes mistakes), and press Save to finish it. Players only ever see homebrew you have set live and added to a campaign.</p>
        <p>Disconnect it any time on your <Link href="/account">Account</Link> page. Prefer copying and pasting? <Link href="/homebrew/import">Import homebrew</Link> works with any AI.</p>
      </div>
    </>
  );
}
