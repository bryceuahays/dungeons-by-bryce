# Dungeons by Bryce: build brief

You are building a website called **Dungeons by Bryce**: a hub for all of Bryce's D&D campaigns, with accounts so his friends can see the campaigns they are in and the characters they have made. Bryce is the DM. The first campaign, **"To be a god"**, already exists as four standalone HTML sites in `source/`. Your job is to build the hub and move that campaign into it.

Build the whole thing in one run. Section 2 is the only point where you stop to ask Bryce for anything.

## 1. How to work

- After the preflight in section 2, do not stop to ask questions. Where this brief is silent, choose the simplest option that fits it, write the choice in `DECISIONS.md`, and keep going.
- If a step is blocked by something only Bryce can do (a login, a dashboard setting), skip it, finish everything else, and list it in the final report with the exact steps.
- Commit after each phase in section 10 with a clear message. Deploy at the end of each phase so there is always a working version.
- Never print, commit, or log secrets. Keys live in `.env.local` (gitignored) and in Vercel environment variables.
- Treat everything in `source/` as canon. Do not rewrite, summarize, or "improve" the campaign text, rules, or numbers. Move it as written.
- Never type Bryce's passwords or payment details anywhere. If a login is needed, he does it.

## 2. Preflight (ask once, all together, then go)

Check these yourself first, and only ask about what is missing:

1. `gh auth status`, `vercel whoami`, `supabase projects list`. If a CLI is missing, install it. If one is not logged in, ask Bryce to run its login command.
2. Ask Bryce for the **email address of his DM account**.
3. Ask whether to create a new Supabase project or use one he names. Do not reuse the project that belongs to his other app (Dirty Blue Decks). If a new project needs a database password, generate one and store it only in `.env.local`.
4. Create the GitHub repository as **private**. This is required, not a preference: the seed data contains DM secrets.

Send all open questions in one message. Once answered, run to the end.

## 3. Stack

- Next.js (App Router, TypeScript) on Vercel.
- Supabase for Postgres, Auth, Storage, and Realtime. Free tiers throughout.
- Plain CSS with custom properties for theming. No UI kit.
- Desktop-first, but every page must work on a phone: players will use the combat page at the table.

## 4. What is in `source/`

| Folder | What it is | Who sees it |
| --- | --- | --- |
| `dm-hub/index.html` | The DM's campaign hub. Tabs: Overview, Races, Divinity, Factions, Secrets, Sessions, Players, Campaign. | DM only |
| `player-guide/index.html` | The player-safe version. Tabs: Overview, My character, Combat, Races, Divinity, Factions, Campaign. | Players |
| `character-builder/index.html` plus `t/` and `v/` | Nine-step builder: People, Class, Abilities, Skills, Gear, Spells, Details, Sheet, Combat. `t/` holds 12 race portraits, `v/` holds the race videos and posters. | Players |
| `session-negative-run-sheet/index.html` | Run sheet for the one-shot "To Kill God": seven beats, Host counter, dragon and Voth trackers, prep, secrets. | DM only |

Notes on these files:

- The builder and run sheet files are page fragments with no `<html>` wrapper. That is expected.
- They were written for a different host. Ignore every `window.claude.*` call and the `localStorage` saving; the database replaces both.
- Content lives in two places in each file: static HTML sections, and JS constants (`RACES`, `FACTIONS`, `TODO`, `CLASSES`, `SPELLS`, `BGS`, `ARMOR`, `WEAPONS`, `ANCESTRY`). Extract both.
- In the DM hub, DM-only material is marked three ways: `class="secret"` blocks, `/*dm-start*/ ... /*dm-end*/` regions, and fields following a `/*dm*/` comment inside `FACTIONS`.
- The builder holds 19 classes: the 13 fifth-edition classes plus six converted from older editions (warlord, swordmage, psion, shaman, avenger, warden), each with `src` and `conv` notes. Keep those notes visible on the class.
- A character is one JSON object. Its shape is `blank()` in `player-guide/index.html`, and `toHub()` in the builder produces it. Keep that shape.
- Four races (aarakocra, dragonborn, great ape, kenku) have two videos, `_before` and `_after`. See "phase" in section 5.

## 5. Roles and secrets (hard requirements)

Two roles: **DM** (Bryce's account, set from the email in preflight) and **Player** (everyone else). The whole campaign depends on players not learning certain things, so these rules are tested in section 11 and the build is not done until they pass.

1. **Enforce in the database.** Use Postgres row-level security on every table. Hiding things in the page is not enough. A player's session must be unable to fetch DM rows by any route, including direct calls to the Supabase API with their own token.
2. **Nothing DM-only reaches a player's browser.** No DM text in client bundles, page props, API responses, or image and video URLs. Campaign content is never hard-coded in components; it is read from the database on the server.
3. **The player guide is the allowlist.** If a piece of content appears in `player-guide/`, it is player-visible. If it appears only in `dm-hub/` or the run sheet, it is DM-only. Where the two files word the same item differently, store both versions and serve by role.
4. **Players see only their own character in full.** For other characters in the same campaign they see name, race, class, level, and player name. They never see another character's tier, Spark, Faith, domain, notes, or abilities. In this campaign, who is a god and who is a demigod is secret between players.
5. **The DM sees everything**, including every character sheet in full.
6. **Phase.** Each campaign has a `phase` setting the DM controls. For "To be a god" it is `before` or `after` (the one-shot). While it is `before`, players get the `_before` race videos and text, and the `_after` files must be unreachable by them. Put media in a private Storage bucket and hand out short-lived signed URLs from the server after checking role and phase.
7. **Login required for everything** except the landing page and the sign-in pages. No campaign content is public.
8. **Joining.** Sign-up is email and password. A new account sees no campaigns until it enters an invite code the DM generated for a specific campaign.

DM-only material to check by name (not a full list; rule 3 governs): Ado and everything about him; the truth about Voth; Voth's island details in the Secrets tab; both clue lists; the Lorn's two origins; the cycle; Ado's clock; faction idle, small and big moves; "Ideas in reserve"; "Still to decide"; "How to build a creature"; the entire session run sheet.

## 6. Data model

Adapt as needed, but keep these ideas:

- `profiles`: user id, display name, role (`dm` or `player`).
- `campaigns`: slug, title, tagline, status, `phase`, `theme` (JSON of design tokens, section 9).
- `memberships`: user, campaign, joined date.
- `invites`: campaign, code, uses left, expiry.
- `content`: campaign, section (tab), kind, key, order, title, body (structured JSON), `visibility` (`player` or `dm`), optional `phase`. One row per card, list, or block, so the DM can edit one thing at a time.
- Rules data for the builder (`classes`, `spells`, `backgrounds`, `armor`, `weapons`, race mechanics), scoped to a campaign so the next campaign can have different options.
- `characters`: owner, campaign, `data` (the character JSON), updated time. Plus a safe way to list the public card fields for party members (a view or function that exposes only the fields in rule 4).
- `sessions`: campaign, number, title, summary, status, run-sheet content, `state` (JSON for live trackers). DM-only.
- `media`: campaign, key, storage path, `phase`.

## 7. Pages and features

**Hub (neutral shell)**

- Landing page, sign in, sign up, join with invite code.
- "My campaigns": the campaigns this account belongs to.
- "My characters": every character this account owns, across campaigns.
- Account page: display name, sign out.

**Inside a campaign (campaign theme applied)**

- The tabs from the source sites. Players get the player guide's tabs and content. The DM gets the hub's tabs and content. Same routes, content filtered by role on the server.
- Character builder, all nine steps, behaving as it does now, including the looping race video on the People step. Finishing it saves the character straight to the database. Remove the "copy a character code" step.
- My character and Combat pages from the player guide, saving to the database as the player edits (debounced). Keep the combat page layout: combat card, actions, attacks per action, AC and hit points on the left; one list of abilities, spells, attacks and rolls on the right, filterable by type.
- Import: keep a small "paste a character code" option that accepts the old `TBG1:` codes (decoder is `readCode()` in the DM hub), so any sheet already made is not lost.

**DM tools**

- Players tab: every character in the campaign, full sheet, updating live through Supabase Realtime.
- Sessions tab: list of sessions. "To Kill God" is ported as the first one, with its beat stepper and its Host, dragon, and Voth trackers saved to `sessions.state`.
- Phase switch.
- Invite codes: create, list, revoke. Member list with remove.
- Content editor: edit, add, reorder, and hide any content row, and set its visibility. This is what lets Bryce update the campaign without a developer, so it is in scope, not optional.
- "View as player" preview that renders exactly what a player would receive.
- Create a new campaign (title, slug, theme) so the hub is ready for the next one.

## 8. Moving "To be a god" in

1. Write an extraction script that reads the four source files and produces seed data. Do not retype content by hand.
2. Seed every static section and every JS constant, tagged with visibility per section 5.
3. Upload `t/` and `v/` to the private bucket and record them in `media`, with `phase` set for the `_before` and `_after` files.
4. After seeding, compare: every heading, card, list item, race, faction, class, and spell in the source must exist in the database. Report counts in the final report (for example: 12 races, 7 factions, 19 classes, spell count).

## 9. Look

- **Inside "To be a god", match the source sites.** Same tokens, fonts, plates, tab bar, and starfield canvas. Lift the CSS from the source files rather than recreating it by eye.
  - Colors: `--void:#070914; --deep:#0c1020; --plate:#10152a; --plate2:#141a33; --line:#2a3152; --field:#0a0d1c; --vellum:#e9e2d0; --dim:#a8a4b4; --gold:#c8a45a; --ember:#e0672f; --star:#8fa7d6; --verd:#6fb3a0; --on-gold:#1a1405`
  - Fonts: IM Fell English for headings, Spectral for body (Google Fonts).
  - Dark in every viewer theme.
- **Themes are per campaign.** Store the tokens in `campaigns.theme` and apply them as CSS variables on the campaign layout, so the next campaign can look completely different.
- **The hub shell is its own thing.** Dark, quiet, and plain, with the name "Dungeons by Bryce". It should not borrow the campaign's gold-and-ember look. Each campaign appears as a card that previews its own theme.

## 10. Build order

1. Project setup, Supabase schema, row-level security, auth, DM role, invite flow, hub shell. Deploy.
2. Seed "To be a god". Campaign pages for both roles, themed. Media through signed URLs. Phase switch. Deploy.
3. Character builder, My character, Combat, saved to the database. Old-code import. DM Players tab with live updates. Deploy.
4. Sessions tab and the "To Kill God" run sheet with saved trackers. Deploy.
5. DM content editor, "view as player", invite and member management, new-campaign flow. Deploy.
6. Run section 11, fix what fails, write the final report.

## 11. Done means

Write these as automated tests where possible and run them:

- Signed in as a player, direct Supabase queries for DM content, sessions, invites, and other players' character data return nothing.
- The HTML and JSON a player receives for every campaign route contains none of these: `Ado` (as a whole word), `Zandrioch`, `Ideas in reserve`, `Still to decide`. None of them appears anywhere in the player guide or the builder today. Do not test for "warden" (it is a playable class) or "Elder fields" (it is in the players' Sough lore).
- With phase `before`, a player cannot obtain a working URL for any `_after` media file.
- A player can sign up, join by code, build a character, and edit it, and the DM's Players tab shows the change without a reload.
- A player with no membership sees no campaigns.
- The DM can edit a content row and a player sees the change.
- Seed counts match the source (section 8).
- `npm run build` passes with no type errors. The production deployment loads.

## 12. Final report

When finished, write `REPORT.md` and show it to Bryce:

- Live URL, repository URL, and how to sign in as DM.
- What was built, by phase.
- Test results from section 11.
- Seed counts.
- Anything skipped, with the exact steps Bryce needs to take.
- Every decision recorded in `DECISIONS.md` that he might want to reverse.
