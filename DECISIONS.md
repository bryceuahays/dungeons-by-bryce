# Decisions

Choices made where the brief was silent. Each one says what was chosen, why, and how to reverse it.

## Setup

1. **The handoff folder is the repository.** The app lives next to `BRIEF.md` and `source/` so the extraction scripts can read the source files directly. The repository is private, as required, because `source/` and `seed/` contain DM secrets.
2. **New Supabase project "Dungeons by Bryce"** in the existing organization (Dirty Blue Co), region us-west-2, the same region as your other project. The Dirty Blue Decks project was not touched.
3. **Email confirmation is off.** Supabase's free plan can only send confirmation emails to members of your own Supabase organization, so your friends would never get theirs. Signing up signs the player straight in. The invite code is what gates access, not the email. To reverse: Supabase dashboard, Authentication, Sign In / Providers, Email, turn on "Confirm email" (you would also need to set up your own email sender).
4. **The DM role is given by email match at sign-up.** A database trigger gives the `dm` role to the account whose email matches the one stored in the private `app_config` table (yours). Nobody can change a role from the app or the API. Because email confirmation is off, sign up with your email before sharing the site address with anyone, so nobody else can register that address first. To change the DM email: update the `dm_email` row in `app_config` (Supabase dashboard, Table Editor).
5. **Minimum password length is 8.**

## Data model

6. **One `rules` table instead of six.** The brief lists `classes`, `spells`, `backgrounds`, `armor`, `weapons`, and race mechanics. They are stored in one table, `rules`, with a `kind` column (`race`, `class`, `spell`, `background`, `armor`, `weapon`, `divine`, `misc`, `phase-config`, `race-phase`), scoped to a campaign. It is one set of security rules to get right instead of six.
7. **Class and race formulas are stored as text.** Many class features change with level (for example "Rage: +2, +3, or +4 damage"). In the source these are small JavaScript functions. They are stored in `rules` exactly as written and run in the player's browser by the builder. Only the DM account can write to `rules`. This keeps the builder behaving exactly as it did, and it means you should not paste code from strangers into a rules row.
8. **Two wordings of the same block share a key.** Where the player guide and the DM hub word the same item differently (for example "The dead god" and "The two gods"), both are stored with the same `key`. Players get the player row. The DM gets the DM row. The editor shows both, labelled.
9. **Races and factions are split into a player row and a DM row.** The player row holds what the player guide shows. The DM row holds only the DM-only fields (race `dm` notes; faction idle, small moves, big development, and the extra resource line). They are merged for the DM on the server.
10. **A `sections` table holds the tabs.** Each campaign has its own tabs, with an audience (everyone, DM only, or players only). This is what lets a new campaign have different tabs.
11. **Phase-specific builder text is stored per phase.** The four races with before and after one-line descriptions, the two Sough trait notes that only apply after the one-shot, the "level 15 one-shot" note, the default level, and the Divine vitality hit point bonus are stored in rows marked `before` or `after`. Database security only gives a player the rows for the current phase.
12. **Characters keep their builder state.** `characters.data` is the sheet (the shape of `blank()`). `characters.builder` is the builder's working state so a build can be resumed or changed. A character whose sheet has never been saved from the builder shows as "Still being built" on your Players tab.
13. **A player can have more than one character in a campaign.** Death is permanent in this campaign and players return as heirs, so the old sheet is kept and a new one can be built. My character and Combat show the most recently changed one, with a picker when there are several.
14. **`sessions` has a `meta` column** for the short line under a session title ("One-shot. Level 15. 3 to 4 hours.").

## Content

15. **The player guide's My character form is stored as content** (one row, kind `sheet-template`), so its fields are data, not code. The paste-a-code plate was removed from it and replaced by a small "Paste a character code" box, as the brief asks.
16. **Three lines of old-host wording were changed**, because they would now be false:
    - "Only you can see what you enter here. Saved in this browser." became "Only you and your DM can see what you enter here."
    - The builder's "Your progress saves in this browser as you go." became "Your progress saves to your account as you go."
    - The builder's last step ("Send this sheet to the player guide and your DM", with the character code) became "Save this character".
    Everything else in `source/` was moved as written.
17. **"Ticks are saved in this browser only."** (above the Still to decide list) was moved as written, but the ticks now save to the database. You may want to edit that sentence: Campaign tab, Edit this page.
18. **Not seeded:** the DM hub's Players tab plates ("Character builder" link and "Add a character" code box) and the Sessions tab's "They open in a new browser tab" line. They describe the old host. The Players and Sessions tabs are now built-in tools.
19. **The DM's "Hide DM secrets" button is kept.** It blurs secret blocks on your screen for when players can see it. It remembers its setting in your browser only.

## Media

20. **Media is served through `/c/<campaign>/media/<name>`.** The server checks you are signed in, a member, and which phase the campaign is in, then redirects to a signed URL that lasts 2 minutes. The names players see are phase-neutral (`v/aarakocra.mp4`); the server picks the `_before` or `_after` file. Players have no storage access of their own.

## Look

21. **Campaign CSS is generated from the source files** by `scripts/build-css.mjs`, scoped so it cannot leak into the hub shell. Fixed colours in the source CSS (for example `rgba(200,164,90,.1)`) were rewritten as the campaign's tokens (`var(--gold)` at 10%), so a different theme restyles everything. With the "To be a god" tokens the result is the same as the source.
22. **Inside a campaign there is a thin strip above the tabs** with the way back to the hub and, for you, Edit this page, Manage, and View as player.
23. **The builder and the run sheet keep their own top bars** under the campaign tabs, as in the source.

## Process

24. **Phases were built together and deployed once verified.** The brief asks for a commit and a deploy per phase. The code for phases 1 to 5 was written in one pass while waiting on the Supabase login, then verified locally. The commits are still split by phase, but the first deployment was made after all five were working, rather than five deployments of unfinished work.
25. **The interactive pages keep the source scripts.** The builder and run sheet scripts are lifted from `source/` by `scripts/build-islands.mjs`, which applies a short list of named changes (database instead of browser storage, media route, "Save my character", rules and tracker numbers from the database). The My character, Combat, and party sheet code is the player guide's and DM hub's own, adapted the same way.
26. **Tests use throwaway accounts** ending in `@test.dungeons.invalid`, created and deleted by the test run. They never use your account.

## Landing page redesign (3 October 2026)

27. **The originals live in `art/`, the WebP copies in `public/landing/`.** The request was to move the images into the public folder and also keep the originals out of the deployed bundle. Only files in `public/` are served, so the PNG originals went to `art/` (also listed in `.vercelignore`, so they are not uploaded with a deploy) and only the WebP versions are public. `npm run images` (scripts/build-images.mjs) rebuilds them.
28. **WebP at quality 94: 176 KB (wide) and 245 KB (tall).** Both are under the 400 KB limit, so quality was kept high rather than squeezing further. The source images are 1672x941 and 941x1672; they were not enlarged.
29. **Page background is `#010508`.** That is the average colour of the outer 2% frame of both images, which is the darkest stone and the colour the edge fades have to meet. Mid stone sampled as `#152525` and is used for buttons and cards.
30. **Fonts: Cinzel for titles, Inter for body text.** Both are loaded through Next's font system, which serves them from the site itself (no request to Google from visitors' browsers). Campaign pages keep the fonts in their own theme.
31. **Which image loads is decided by screen shape, not width.** Portrait screens (phones, tablets held upright) get the tall image; landscape screens get the wide one. A `<picture>` element means only one downloads, and only that one is preloaded.
32. **A soft dark pool sits behind the title and the buttons at every width.** On short, wide windows and on upright tablets the image is cropped at the top, so the title comes close to the arch. The pool keeps the text readable there. On upright tablets the title is also set smaller so it stays above the keystone.
33. **The lantern uses the colour-dodge blend mode,** which brightens lit stone and leaves pure black alone, so it reads as light on the stonework and not as a haze over the page. On touch screens it drifts on a 38-second loop.
34. **Reduced motion turns off the lantern, the dust, and the rune pulse** (the rune glow stays, still). Button hover transitions are also off.
35. **Hub restyle.** Sign-in, sign-up, My campaigns (which holds the join-with-code box), My characters, Account, and New campaign now share the stone background, Cinzel headings, teal accent, and the stone button. Campaign cards still preview each campaign's own theme. Nothing inside a campaign changed.
36. **Card sentences are generic on purpose.** The page is public, so it names no campaign, shows no campaign content, and names no player. It does not mention D&D or use any official artwork.
37. **"Ticks are saved in this browser only." was removed** at Bryce's request, from the live database and from the extraction script (`REMOVED` list in `scripts/extract.mjs`), so a reseed does not bring it back. This is the one deliberate departure from "move the source as written".

## Hall background for the signed-in hub (3 October 2026)

38. **Which pages get it.** The hall image is in the shared signed-in layout, so it is behind My campaigns (which contains the join-with-code box), My characters, Account, and New campaign (DM only). Those are all the signed-in hub tabs that exist. The landing page, sign-in, and sign-up were not touched, and nothing inside a campaign changed.
39. **"Join" lives on My campaigns.** The brief lists "join pages" among the pages to leave alone, but there is no separate join page: the invite-code box is part of My campaigns, which the brief also says must get the new background. It gets the hall, on a stone panel.
40. **Sign-in and sign-up have a plain stone background, not the doorway image.** That is how they were built in the landing redesign (its item 18 asked for plain stone there). The brief's "they keep the doorway image" was read as "leave them as they are".
41. **Images:** originals stay in `art/` (not deployed); WebP copies are `public/hub/hall-wide.webp` (339 KB) and `hall-tall.webp` (276 KB), quality 94. Portrait screens get the tall one, landscape the wide one, through one `<picture>`; only that one is preloaded and downloaded.
42. **The overlay ended at 44% at the top, 55% in the middle, 80% toward the bottom, then solid page colour.** Started at 55% as asked; lightened at the top by eye so the arch and runes still read, since titles have their own dark pool and everything else is on panels.
43. **The image always covers the screen (never letterboxed),** with all four edges faded into `#010508`. On screens much larger than the 1672-pixel artwork it is stretched and will look soft.
44. **No body text sits on the image.** Empty-state messages ("You are not in a campaign yet…", "Signed in as…", the New campaign intro) were moved onto stone panels (95% opaque, thin border). Only page titles and section headings are on the image, each with a soft dark pool behind it.
45. **The background is fixed with `position: fixed`,** sized to the tallest phone viewport (`100lvh`) so it does not jump when a phone's address bar hides.
46. **Hover:** panels get a faint teal border and glow; buttons keep theirs. No lantern, no dust. Campaign cards keep their own theme colours and only gain a drop shadow.
47. **Screenshots come from a local copy, not the live site.** Signing in to the live site needs a real password typed into it, which I do not do. `scripts/screenshots.mjs` runs the production build on this computer against the same database, signed in as throwaway accounts, and saves the images in `art/screenshots/`. The live site was checked by the automated tests instead.

## Before and after session negative (4 October 2026)

48. **How the phase is enforced.** Every content row, rules row, media row, and now every tab has a phase: empty means always, otherwise players get it only while the campaign is in that phase. The database's row-level security applies this, so a player's own token cannot fetch a row for another phase. The pages are then built on the server from what the viewer may read.
49. **The title, web address, and tagline are "faces".** A new DM-only table, `campaign_faces`, holds the real ones and one set per phase. The database copies the set for the current phase onto the campaign, and that copy is all a player can read. So while the phase is "before", "To be a god" and "to-be-a-god" are simply not in anything a player can query.
50. **Addresses.** While "before", players use `/c/to-kill-god` and `/c/to-be-a-god` answers not-found for them. After the flip, `/c/to-be-a-god` works and `/c/to-kill-god` redirects to it. An old address redirects to the campaign's first page, not to the same sub-page. You (the DM) can use either address at any time; the other one redirects.
51. **Storage paths no longer name the campaign.** Media now lives under the campaign's id, so signed URLs do not contain "to-be-a-god". The 44 files were uploaded again under the new paths and the old copies deleted.
52. **Rows that mixed both kinds of text were split, not rewritten.** Each race is now one always-shown row plus an "after" row and a "before" row (history, summary line, key lines, culture lines, and the last sentence of two Sough traits). The My character form has three removable parts (Domain field, Divinity block, "Add my divine traits" button) stored as their own "after" rows. Nothing from `source/` was reworded or deleted.
53. **New text is exactly what you supplied** (items 5, 7, 8), kept in one marked block at the top of `scripts/phases.mjs`. The one exception: four races needed a "before" one-line summary, and those came from your character builder source, which already had before wordings ("Bird-folk who are god's eyes." and so on).
54. **The "before" Voth card has no heading above it.** You gave text for the card but not for a replacement for the "The dead god" heading, so there is none.
55. **The constellation is hidden until after.** It sits in the original page header with the title "To be a god", its description calls it "fading", and some of its stars are drawn as gone. Hidden rather than guessed at. See the report.
56. **Tier, Spark, Faith, and domain are stored apart from the sheet.** A new table, `character_private`, holds them. A database trigger lifts them out of every sheet as it is saved. The owner can read them only once the phase allows; you can always read them. A save made while they are hidden cannot wipe what is stored. The character JSON a player's browser holds therefore no longer has those four keys.
57. **DM labels.** Blocks, cards, headings, whole tabs, and individual lines inside a race carry the note "Hidden from players until after session negative" or "Shown to players only before session negative". After you flip the phase, the first becomes "Shown to players only after session negative", because "hidden until" would then be untrue.
58. **You see the real title everywhere,** with "players see: To Kill God" beside it in the campaign header, on the campaign card, and on the Manage page.
59. **Editor controls.** The content editor already had a "When" control on every block. Tabs now have one too, on the Manage page. Manage also has fields for a different title, address, and tagline per phase.
60. **Nothing a browser downloads names what is hidden.** The script files sent to every browser were checked for the same word list. My own "Save" text in the builder mentioned Spark and Faith; it was removed. The labels on your Players tab (Tier, Spark, Faith, Domain) now come from the database (lifted from the DM hub source) instead of being written in the code.
61. **A bug this turned up, now fixed.** Since the first build, your DM view was dropping every race that has DM notes (8 of the 12) from the Races tab and the race cards, because a DM row and a player row with the same name were treated as two wordings of one block even when they were different kinds of block. Players were not affected. The match now also requires the same kind.

## Speed (4 October 2026)

62. **The server now runs in Portland, next to the database** (Vercel region pdx1; the database is Supabase us-west-2 in Oregon). It was running in Washington DC, so every database call crossed the country and back.
63. **One sign-in check per page instead of three network trips.** The session token is now verified on the server itself (the project's tokens are signed with a public-key algorithm, so this is safe and needs no call to Supabase). Row-level security still checks the token on every query.
64. **The campaign and its tabs load in one query,** in parallel with the profile.
65. **A thin progress bar** runs across the top from the moment you click a link until the new page shows. Placeholder "skeleton" pages were tried first and removed: they make not-found pages and redirects answer as if they were found, and the phase rules rely on those answers.
