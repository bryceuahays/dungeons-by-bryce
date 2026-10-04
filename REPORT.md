# Dungeons by Bryce: final report

Built on 3 October 2026 from `BRIEF.md`.

## Where it is

| | |
| --- | --- |
| Live site | https://dungeons-by-bryce.vercel.app |
| Code (private) | https://github.com/bryceuahays/dungeons-by-bryce |
| Database | Supabase project "Dungeons by Bryce": https://supabase.com/dashboard/project/teobjmcqddkyhlkmspfd |
| Hosting | Vercel project `dungeons-by-bryce` |

## Do this first: sign in as DM

There are no accounts yet. The DM account is whichever account signs up with **bryceuahays@gmail.com**, so do this before you share the address with anyone.

1. Open https://dungeons-by-bryce.vercel.app
2. Click **Create an account**.
3. Enter your name, the email **bryceuahays@gmail.com**, and a password of your choosing (8 characters or more).
4. Click **Create account**. You land on My campaigns and see "To be a god" with "You run this campaign" on the card.

To bring a player in:

1. Open the campaign, click **Manage** (top right).
2. Under **Invite codes**, click **Create invite code**. A code like `K7M2QXRD` appears.
3. Send the site address and the code to your player. They create an account, then type the code under **Join a campaign**.

## What was built

**Phase 1. Setup, security, accounts, hub shell**
- Next.js app on Vercel, Supabase for the database, sign-in, file storage, and live updates.
- Eleven database tables, every one with row-level security. A player's own login cannot fetch DM rows by any route, including direct calls to Supabase.
- Sign up, sign in, sign out, join with an invite code.
- The hub: My campaigns (each campaign is a card in its own colours and fonts), My characters, Account (change your name or password). Plain dark shell with no gold or ember.

**Phase 2. "To be a god" moved in**
- `scripts/extract.mjs` reads the four source sites and produces the seed data. Nothing was retyped.
- Players get the player guide's tabs and wording. You get the DM hub's tabs and wording, with the secrets. Same addresses, filtered on the server.
- The look is lifted from the source CSS: same tokens, fonts, plates, tab bar, and starfield.
- The 12 portraits and 32 video files are in a private storage bucket. The site hands out 2-minute links after checking who is asking and which phase the campaign is in.
- Phase switch on the Manage page (Before session negative / After session negative).

**Phase 3. Characters**
- The character builder, all nine steps, with the looping race video, running the original script. It saves progress to the player's account as they go, and "Save my character" puts the sheet in the database. The "copy a character code" step is gone.
- My character and Combat, saving as the player edits. The combat layout is unchanged.
- "Paste a character code" still accepts the old `TBG1:` codes.
- Your Players tab shows every character in full and updates live.
- Players see only name, race, class, level, and player name for the rest of the party.

**Phase 4. Sessions**
- Sessions tab with "Session negative: To Kill God" and "Session 0".
- The run sheet with its beat stepper, the Host counter, the dragon tracker, and the Voth tracker. They save to the database, so they survive a reload or a change of device.

**Phase 5. DM tools**
- Content editor: on any tab click **Edit this page**. Edit, add, reorder, hide, delete, or duplicate any block, and set who sees it. Text is edited in place like a document.
- **View as player**: shows every page exactly as a player receives it.
- Invite codes (create, list, revoke) and the member list (remove).
- Tabs: add, rename, reorder, hide from players, delete.
- **New campaign** (in the hub's top bar): title, web address, colours, fonts, and the option to copy the character rules from an existing campaign.
- You can also edit the text of each run sheet beat ("Edit this run sheet" at the bottom of a run sheet).

**Phase 6. Tests and this report**

## Test results (BRIEF section 11)

18 automated tests, run against the live site. **18 passed, 0 failed.** Run them again with `npm test`.

| Requirement | Result |
| --- | --- |
| As a player, direct Supabase queries for DM content, sessions, invites, and other players' character data return nothing | Pass |
| A player cannot change their own role or write to any DM table | Pass |
| No campaign page a player receives (HTML or page data) contains `Ado`, `Zandrioch`, `Ideas in reserve`, or `Still to decide`. Checked on all 7 player tabs, the builder, and the hub pages | Pass |
| No JavaScript or CSS file sent to browsers contains those words | Pass |
| With phase `before`, a player cannot obtain a working URL for any `_after` file. Tried for all 8 files: signing, downloading, listing, public and authenticated links, and asking the site for the "after" version | Pass |
| After you switch the phase, players get the `_after` files and text | Pass |
| A player can sign up, join by code, build a character, and edit it, and the DM receives the change live without a reload | Pass |
| A player listening for live updates does not receive other players' sheets | Pass |
| A player with no membership sees no campaigns | Pass |
| Used-up and revoked invite codes fail. A removed member loses access | Pass |
| The DM can edit a content row and a player sees the change. Hiding it removes it for the player | Pass |
| "View as player" gives the DM exactly the player version | Pass |
| Signed out, every page except the landing and sign-in pages redirects to sign-in | Pass |
| Seed counts match the source | Pass (below) |
| `npm run build` passes with no type errors | Pass |
| The production deployment loads | Pass |

Also checked by hand in a browser on a local copy: the builder end to end with the race video playing, My character, the Combat page on a phone-sized screen (no sideways scrolling), an old `TBG1:` code import, the Players tab changing live, the run sheet trackers surviving a reload, the content editor saving, and creating a second campaign with a different theme.

## Seed counts

Recounted from the source files by `npm run verify-seed` and compared with the database. Every item matched.

| What | In the database | In the source |
| --- | --- | --- |
| Races (lore) | 12 | 12 |
| Races with DM notes | 8 | 8 |
| Factions | 7 | 7 |
| Factions with DM moves | 7 | 7 |
| Races (builder mechanics) | 12 | 12 |
| Race traits | 59 | 59 |
| Classes | 19 | 19 |
| Classes converted from older editions, with `src` and `conv` notes | 6 | 6 |
| Class features | 153 | 153 |
| Spells | 319 | 319 |
| Backgrounds | 14 | 14 |
| Armor | 13 | 13 |
| Weapons | 35 | 35 |
| Player guide: headings / cards / list items / paragraphs / table rows | 26 / 9 / 40 / 20 / 9 | same |
| DM hub: headings / cards / list items / paragraphs / table rows / secret blocks | 36 / 12 / 98 / 32 / 9 / 12 | same |
| Run sheet: headings / panels / list items / paragraphs / table rows / secret blocks | 32 / 19 / 98 / 104 / 11 / 6 | same |
| "Still to decide" items | 9 | 9 |
| Sessions | 2 | 2 |
| Run sheet beats | 9 | 9 |
| Media files (12 portraits, 16 posters, 16 videos) | 44 | 44 |
| Media marked `before` / `after` | 8 / 8 | 8 / 8 |

Content rows: 117 (68 player-visible, 49 DM only). Rules rows: 433.

## Skipped or left for you

Nothing in the brief was skipped. Three things are yours to do or decide:

1. **Sign up as DM now** (steps at the top). Until you do, the first person to sign up with your email address would become the DM.

2. **Optional: deploy automatically when the code changes.** Vercel could not be linked to the new private GitHub repository from the command line, because Vercel's GitHub app has not been given access to it. The site is deployed and works. Without this link, a code change goes live only when someone runs a deploy (ask Claude to "deploy to production"). To link it:
   1. Go to https://vercel.com and open the **dungeons-by-bryce** project.
   2. Click **Settings**, then **Git**.
   3. Click **Connect Git Repository**, then **GitHub**.
   4. If `dungeons-by-bryce` is not in the list, click **Adjust GitHub App Permissions**, tick `dungeons-by-bryce`, and click **Save**.
   5. Pick `bryceuahays/dungeons-by-bryce` and click **Connect**.

3. **One sentence to edit.** On the Campaign tab, above the "Still to decide" list, the text says "Ticks are saved in this browser only." The ticks now save to the database. To change it: Campaign tab, **Edit this page**, open that text block, edit, **Save**.

Good to know:
- **Supabase's free plan pauses a project after about a week with no visits.** If the site shows errors after a quiet spell, open the Supabase dashboard link above and click **Restore**. It takes a minute or two.
- **The phase is set to "Before session negative".** Switch it on the Manage page after the one-shot. Players then get the "after" race videos and builder text, the campaign starts at level 1, and Divine vitality is added to hit points.
- **There is no "forgot password" link.** The free plan cannot send email to your players, so a reset-by-email flow was not built. Anyone signed in can change their password on the Account page. If you or a player gets locked out, ask Claude to set a temporary password for that account from the project folder, then change it on the Account page.
- **Secrets** (database password, service key) are in `.env.local` in the project folder and in Vercel's environment variables. They are not in the repository.

## Decisions you might want to reverse

All 26 are in `DECISIONS.md`. The ones most worth a look:

- **Email confirmation is off** (decision 3), because the free plan cannot email your friends. The invite code is the gate.
- **The DM role comes from your email at sign-up** (4).
- **Builder rules live in one `rules` table**, not six (6), and level-based formulas are stored as the original small functions (7).
- **A player can have more than one character per campaign** (13), for heirs after a death.
- **Three lines of old-host wording were changed** because they would now be false (16). Everything else was moved as written.
- **The first deployment came after all five phases were working**, not one deployment per phase (24).
- **Old-host items not carried over** (18): the "open the builder" and "add a character by code" plates on the DM's Players tab, and "They open in a new browser tab".

## Added later (4 October 2026)

See `DECISIONS.md` items 27 onward for the landing page, hub background, before/after session negative, speed, and the roles work. `PHASE-REPORT.md` lists everything tagged for the two phases.

### Turning on feedback email

Feedback notes are already collected on your **Head DM** page. To also get each one by email:

1. Go to https://resend.com and click **Sign up**. **Use bryceuahays@gmail.com.** (On the free plan, Resend only delivers to the address the account was made with. That is the address the notes should go to, so this is what makes it work without owning a web domain.)
2. Confirm your email when Resend asks.
3. In Resend, click **API Keys** in the left menu, then **Create API Key**. Name it `dungeons-by-bryce`, leave the permission as **Sending access**, and click **Add**.
4. Resend shows the key once. Click the copy button. (It starts with `re_`.)
5. Go to https://vercel.com, open the **dungeons-by-bryce** project, click **Settings**, then **Environment Variables**.
6. In **Key** type `RESEND_API_KEY` (capitals do not matter). In **Value** paste the key. Leave all environments ticked. Click **Save**.
7. Click **Deployments** (top), click the three dots on the newest one, and click **Redeploy**. Wait for it to finish.
8. Send yourself a note from the **Feedback** tab. It should arrive within a minute, and the note on your Head DM page will say "emailed".

If a note does not arrive, open your **Head DM** page: the note shows the reason under it, and a button there sends any notes that are still waiting.

Do not paste the key into a chat. If it ever leaks, delete it in Resend and make a new one.

### Tests

`npm test` now runs 27 tests. `node scripts/smoke-local.mjs` drives the newer screens in a real browser on a local copy (create a campaign by pasting, upload backgrounds, send feedback, delete a character and a campaign).
