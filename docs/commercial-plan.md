# Commercial build: findings and plan

Written before any code changed, on the `commercial` branch. Choices made along the way are logged in `docs/decisions.md` (the earlier log, `DECISIONS.md` items 1 to 89, stays as it is).

## What is already here

**Stack.** Next.js 16 (App Router, TypeScript, plain CSS) on Vercel. Supabase for the database, sign-in, file storage and live updates. No UI library. Tests are `node --test` scripts that create throwaway accounts and hit the real database and a running copy of the site.

**Sign-in.** Email and password through Supabase. Every page except the landing page and the sign-in pages needs a login (`src/proxy.ts`).

**Roles (already per campaign).** Any account can create a campaign and is its DM. The same account is a player wherever it joins with an invite code. One account, yours, is the Head DM (the site admin). You can read another DM's campaign only after unhiding it, and then only read.

**Data model.** One Supabase database. Row-level security is on for every table, so the database itself decides what each signed-in person can read.

| Table | What it holds |
|---|---|
| `profiles` | one row per account: name, email, role (`head` or `player`), own hub background |
| `campaigns` | title, address, theme, the list of phases and the current one, owner |
| `campaign_faces` | a different title, address and tagline per phase |
| `memberships`, `invites` | who has joined; invite codes |
| `sections` | the tabs of a campaign |
| `content` | every block on every page: `player` or `dm`, optional phase, hidden flag |
| `rules` | the character builder's data for "To be a god" (races, classes, spells, gear) |
| `characters`, `character_private` | sheets; the fields a campaign holds back until a later phase |
| `sessions` | run sheets (DM only) |
| `media` | race videos and images, per phase |
| `feedback`, `head_reveals` | feedback notes; which campaigns you have unhidden |

**The before/after toggle.** A campaign has an ordered list of phases and a current phase. Tabs, blocks, builder rules, media, sheet fields and even the campaign's title and address can be tagged with a phase. The database holds back anything tagged for another phase. This is the seed of the reveal system in Phase 4.

**Character sheets.** "To be a god" has its own builder and sheet, lifted from your original sites and driven by the `rules` table. They are specific to that campaign's rules (nineteen classes, twelve races, the divinity system).

**Theme.** A campaign's colours and fonts are stored as tokens on the campaign and applied as CSS variables. "To be a god" is one set of tokens plus a starfield.

**What exists already from the brief:** per-campaign roles, invite codes, strict isolation between campaigns (tested), a site admin, deleting campaigns and characters, pasting a campaign in, uploaded backgrounds, feedback by email, a two-state reveal toggle, a "view as player" preview, DM view of every player's sheet.

## What is missing

Everything commercial: plans, billing, limits. Any rules content that is safe to ship (all current rules are yours and several classes come from older editions). A homebrew builder. Reveal stages beyond the one campaign that has them. All the table tools (NPCs, initiative, timeline, maps, world state, session zero). Video blocks. Theme presets. The commission page, the store, and a public face.

## Decisions that shape everything

1. **One database.** There is only the live Supabase project (the free plan allows two projects and the other is Dirty Blue Decks). So database changes are applied to the live database as each phase is built, and every change is additive: new tables, new columns, nothing dropped or rewritten. The live site keeps running the current code against it. No data is wiped.
2. **The branch is not put live.** All code stays on `commercial`. The live site keeps showing today's version until you say to merge.
3. **The 5e SRD content is written into the repo by hand, as a core set.** Downloading a ready-made SRD data file needs your say-so, so this build ships a core set (all nine races, all twelve classes and their subclass, the background, the feat, armour and weapons, and a working set of spells and monsters) and a script that loads the full set once you approve a download.
4. **Everything in the database today is marked `private`.** None of it is confirmed SRD text, and several classes are conversions from other editions.
5. **Two rule systems side by side.** "To be a god" keeps its own builder and sheet untouched. Every other campaign uses a new, general fifth edition sheet driven by SRD and homebrew entries.
6. **One general table for table tools.** NPCs, story beats, maps, regions, pins, clocks, clues, consequences and the initiative tracker all live in one `entries` table with one visibility rule (everyone, DM only, named players, from a stage, or when a linked beat happens), enforced by the database. DM-only parts of an entry live in a second table players cannot read.
7. **Plan limits are enforced in the database too**, not only on the page, from one config file (`src/config/plans.ts`) that is copied into the database.
8. **Stripe in test mode only.** The code refuses a live key.

## Plan by phase

**Phase 0. Engine and content.** `source` on every rules row (`srd`, `homebrew`, `private`). New `entities` table for SRD and homebrew entries. Existing rules marked private and no longer copyable by other DMs. SRD core set seeded. `/legal` page. Public copy says "fifth edition compatible".

**Phase 1. Multi-tenant.** Already per campaign. Adds an invite link (`/join/CODE`) that carries a new player through sign-up and straight into the campaign, and more isolation tests for the new tables.

**Phase 2. Plans and billing.** `src/config/plans.ts` and `src/lib/entitlements.ts`. Free, Pro and Founder. Database functions `is_pro` and `campaign_feature`. Stripe Checkout, customer portal and webhooks (test mode). Extra campaigns go read-only on downgrade. Upgrade page and prompts. Accounts that exist today get full access, and you can grant full access to a friend from the Head DM page.

**Phase 3. Homebrew builder.** `/homebrew`: nine entry types, Quick, Guided and Advanced depths over the same data, clone from SRD, effect building blocks that the new sheet applies, automatic class table, live preview, balance hint, versions with change notes, draft/playtest/live, packs with JSON export and import, attach to campaigns, edition converter.

**Phase 4. Secrets and reveals.** Phases become named reveal stages any campaign can have. Blocks and tabs can be for everyone, DM only, named players, one stage, or from a stage onward. Per-player secrets and private notes. "View as" any player at any stage. Reveal log and an optional "newly revealed" feed. "To be a god" keeps its two stages and behaves as today.

**Phase 5. Table tools.** NPC tracker, DM access to any sheet (read-only with an edit switch), live initiative tracker with hidden enemies.

**Phase 6. Story timeline.** A collapsible banner on every campaign page. Planned, hit and dropped beats, key beats with a checklist and overdue flag, personal beats, player-added beats and notes.

**Phase 7. Maps.** Upload any image. Hidden regions are painted out on the server before a player ever receives the picture. Pins, links between maps, pan and zoom by touch.

**Phase 8. World state.** Consequence log with a "since last session" summary, clue tracker with the three-clue warning, faction clocks.

**Phase 9. Session zero.** Tone, lines and veils, table rules, house rules. Anonymous player input stored with no link to who wrote it.

**Phase 10. Video.** A video block (YouTube or Vimeo link) and a featured video on the campaign home.

**Phase 11. Themes and custom sites.** Theme presets, a theme editor for Pro, a public "Custom campaign site" page with an intake form, an admin list of requests, and transfer of a campaign to a client.

**Phase 12. Storefront.** Publish a campaign as a frozen product (blocked if it contains private content), public store pages, test-mode purchase, a copy cloned into the buyer's account.

**Phase 13. Public face.** New landing page in the doorway style, a public demo campaign, a pricing page built from the plan config, SEO metadata and share images.

## How it is checked

Each phase ends with a type check, a production build, and the test suite (existing 27 tests plus new ones for permissions, visibility and entitlements) run against a local copy of the site and the real database with throwaway accounts. Then a commit.

## What will need you

Stripe test keys, real Terms and Privacy text, approval to download the full SRD data, prices for the two higher custom-site tiers, and the word to put the branch live. `docs/handoff.md` lists each with steps.
