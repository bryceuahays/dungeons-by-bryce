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
