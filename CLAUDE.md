# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is **Dungeons by Bryce** - a hub website for fifth edition tabletop campaigns, live at https://dungeons-by-bryce.vercel.app. A DM builds a campaign site for their table: pages and tabs, secrets that are revealed in stages, character sheets, homebrew rules, and table tools (NPCs, initiative, timeline, maps, world state). Players join by invite link and never pay.

It is a paid product in the making: a Free plan, Pro ($7 a month or $50 a year), a Founder lifetime plan ($150, 100 seats), a store for campaigns and homebrew packs, and a "Have Bryce build it" custom-site service. Stripe is in test mode only.

The owner is Bryce (GitHub `bryceuahays`), who is also the site's one Head DM account. Friends are joining as partners who code and test, each with their own Claude Code session.

## Working With Bryce

- Bryce is not a programmer. Explain in plain language, lead with what happened and what he needs to do, and give click-by-click steps.
- On his Windows machine, commands he runs in PowerShell use `npx.cmd` and `npm.cmd` (scripts are blocked by execution policy).
- Never type his passwords or payment details anywhere. If a login is needed, he does it.
- He often sends work as a long written brief. Run every part in order without stopping to ask; where something is ambiguous, pick the sensible option and record it in `docs/decisions.md`. Stop only for something that would destroy data, needs a secret he has not provided, or changes the live site or live database without his say-so.
- When a brief is finished, append what was built, where it lives in the UI, and what he must do by hand to `docs/handoff.md`.
- This project is separate from his other app (Dirty Blue Decks): its own folder, repository, Supabase project and Vercel project. Never mix them.

## Repository Structure

```
dungeons-by-bryce/
├── CLAUDE.md                     # This file
├── TODO-LATER.md                 # Deferred work, each line linked to its issue
├── docs/                         # Plans, decisions, handoff, board setup, SRD import notes
├── .github/                      # Issue forms and the pull request template
├── seed/                         # SRD seed data (the SRD download itself is gitignored)
├── scripts/                      # Seed, import, build and test helpers (run with node)
├── supabase/migrations/          # Database schema and row-level security, in file-name order
├── tests/                        # node --test suites that run against a built local site
│   └── fixtures/                 # The dummy campaign the tests run against
├── public/                       # Static images
├── art/                          # Screenshots and working art (not deployed)
└── src/
    ├── proxy.ts                  # Request proxy (session refresh, sign-in redirects)
    ├── config/                   # Plans, themes, homebrew kinds, tools, rules versions, store, commissions
    ├── lib/                      # Server helpers: campaign reading, entitlements, store, stripe, mail, rules engine
    ├── components/               # React components (tools/ holds the table tools)
    ├── islands/                  # The DM's party overview renderer
    ├── styles/                   # Plain CSS
    └── app/
        ├── page.tsx              # Public landing page
        ├── (public)/             # pricing, store, custom, legal
        ├── (auth)/               # sign-in, sign-up
        ├── (hub)/                # Signed-in hub: campaigns, homebrew, upgrade, account, admin
        ├── c/[slug]/             # Everything inside one campaign
        ├── demo/                 # The public demo campaign
        ├── join/[code]/          # Invite links
        ├── admin/store/          # Admin-only publish and generate routes
        └── api/stripe/webhook/   # Stripe webhook
```

New feature code goes in `src/features/<area>/<feature>/` (components, actions, settings and styles together). Files under `src/app` stay thin: check who is asking, load data through `src/lib`, hand over to the feature folder.

## Hard Rules

These hold for every change, whatever else it does.

### Visibility
- **Hidden content must never reach a player's browser.** Enforce visibility on the server. Row-level security decides in the database; pages are built on the server from rows the viewer may read. Never hide something with CSS or client-side code, and never hard-code campaign content in components.
- Rows, tabs, blocks and campaign titles that belong to a reveal stage are withheld by the database, not by the page.
- Login is required for everything except the public pages (landing, pricing, store, custom, legal), the sign-in pages and the demo.
- Content written by a DM is untrusted. It goes through `src/lib/sanitize.ts` on the server before it is sent.

### Roles
- There is one Head DM account (the site owner). Everyone else is the DM of campaigns they own and a player in campaigns they join.
- Database policies are per campaign (`is_campaign_dm(campaign_id)`). Never add a site-wide "is DM" check.
- The Head DM does not see other DMs' content. They can read another DM's campaign only after unhiding it (`head_reveals`, `head_sees(campaign)`), and that access is read-only. In the app this is `ctx.headView`; editing tools are shown on `ctx.realDm`.

### Content sources
- Every rules entry is `srd`, `homebrew` or `private`.
- Only `srd` and `homebrew` content can ever ship in a product or pack. `private` content never leaves its owner's own campaigns: not visible, searchable, cloneable or sold elsewhere. Publishing is refused if anything private is included.
- If an entry cannot be confirmed as SRD, it is `private`. Ship no content from other editions; the edition converter's output is always `private`.
- SRD data comes only from the official documents or an open dataset whose licence is checked and which holds only SRD content. Never scrape wikis or fan sites. Sources are recorded in `docs/srd-import.md`.
- Never overwrite, edit or delete existing `homebrew` or `private` entries from a script.
- Public and on-site copy says "fifth edition" or "fifth edition compatible". Never use the game's trademarked name.

### Data
- Migrate existing data, never wipe it. Accounts, characters and campaigns must survive every change.
- A DM's campaign text is theirs. Do not rewrite, summarize or "improve" it.
- Store no health or clinical information anywhere.

### Plans and money
- Every paid feature goes through the central entitlement checks. Never check a plan anywhere else.
- All prices and limits live in config files, never in pages.
- Stripe stays in test mode. The code refuses non-test keys on purpose.

### Secrets
- Never print, commit or log secrets. They live in `.env.local` (gitignored) and in Vercel environment variables.
- The repository is private because the seed data contains DM secrets.

### Campaign content stays out of the code
Nothing a DM wrote may be compiled into code that ships to the browser. A test reads the built bundles for words from the dummy campaign that only its DM, or only a later stage, may see.

### Phones
Every screen must work well on a phone.

## Architecture

**Stack:** Next.js 16 (App Router, TypeScript, server actions, route handlers), React 19, plain CSS, Supabase (Postgres, Auth, Storage, Realtime), Vercel.

### Reading a campaign
`src/lib/campaign.ts` is the only place campaign content is read. `getCampaign()` returns the viewer's role, the reveal stage, "view as" state and plan access; `getContent()` and `getSheetEntities()` apply them. `src/app/c/[slug]/actions.ts` holds the DM's server actions.

### Reveal stages
Each campaign has ordered, named stages (`campaigns.phases`, `campaigns.phase`). Content, sections and titles can belong to a stage or start at one (`from_stage`), and blocks can be limited to named players (`only_players`). "View as" lets the DM preview as any player at any stage.

### Rules content and sheets
- `entities` holds SRD and homebrew rules: `source`, `srd_version` (5.1 or 5.2), `type`, `status` (draft, playtest, live), `depth`, `version`, `origin` (`own` or `product`). SRD rows have no owner.
- A campaign's `settings.rules` is `2014`, `2024` or `both` (`src/config/rules.ts`).
- `src/lib/rules/engine.ts` is the single place entries are applied to a character (`derive`), plus the class table and the balance hint. It is pure code with no database access.
- Every campaign uses the standard sheet (`src/components/Sheet5e.tsx`). The old `rules` and `character_private` tables are still in the database, empty; nothing in the app reads them, and any row in `rules` is treated as `private` by the store.

### Table tools
Tools are rows of one `entries` table (kinds: npc, beat, note, map, region, pin, consequence, secret, clue, clock, encounter, zero, log) plus `entry_secrets` for the DM-only part. There is one visibility rule, written twice and kept in step: `entry_open()` in SQL, and `entryOpen()` in `src/lib/entry-types.ts` for the "view as" preview.

Map pictures are served only through `src/lib/map-image.ts`, which paints hidden regions on the server before a player receives the image.

### Plans and entitlements
- `src/config/plans.ts` is the source of truth. `npm run sync-config` copies it into `app_config.plans`, where the database enforces it. A test fails if the two differ.
- In SQL: `is_pro`, `free_limit`, `campaign_feature` (may use), `campaign_can_create` (may make new), `campaign_writable`, `can_edit`, and the `*_gate` triggers, which raise `upgrade:<feature>`.
- In pages: `src/lib/entitlements.ts` (`getPlan`, `can`, `campaignCan`, `campaignCanMake`, `remaining`, `upgradeNeeded`). In tools: `p.can` and `p.make`.
- A bought campaign works fully for what was delivered on any plan; making new Pro-only things follows the owner's plan.
- **Limits are switched off for now:** `ENFORCE_PLANS` in `src/config/plans.ts` is `false`, so the database answers yes to every check (`is_pro`) and nothing is refused. `has_pro` and `my_plan().paid` say what plan an account really has; use those for wording and prices. Test accounts have `profiles.always_enforce`, so the limits stay tested. Do not remove a check because limits are off.

### Store, packs and commissions
- `src/lib/store.ts`: publish a campaign or pack (a frozen snapshot), deliver a purchase as an editable copy, upgrade from framework to full edition, generate a framework or a publishable copy. Prices and the subscriber discount are in `src/config/store.ts`.
- Listings are hidden from players of the source campaign (`products.spoiler_campaign`), and from signed-out visitors while that campaign has players.
- Packs: `packs.official`, `packs.free`, `pack_owners`, `attach_pack()`. Official and bought entries do not count toward the free homebrew limit; clones do.
- Commissions: tiers and switches in `src/config/commissions.ts`; statuses requested, accepted, declined, paid, in_progress, in_review, delivered; `deliver_commission()` transfers the campaign and starts the included Pro months.
- Stripe is called over plain HTTPS in `src/lib/stripe.ts`; the webhook at `/api/stripe/webhook` verifies the signature.

### Worlds, systems and tools
- A world (`worlds`) holds campaigns (`campaigns.world_id`) and homebrew (`world_entities`). A campaign may be in a world or stand alone; a new campaign chooses on the form, and can be put in a world later from that world's page.
- A campaign's system is `settings.rules` (`src/config/systems.ts`); its genres are `settings.genres` (`src/config/genres.ts`); the tools its hub has are `settings.tools` (`hasTool`, `toolsOf` in `src/config/tools.ts`; no list means every tool).
- A character has a `system` and may have no campaign. `characters_system` keeps the system in step and refuses a move to a campaign on another system.

### Other pieces
- Themes: `src/config/themes.ts`, `src/lib/theme.ts`. Free accounts fall back to a default theme rather than failing.
- Public demo: `campaigns.is_demo`, read through the anon client in `src/lib/demo.ts`.
- Email: `src/lib/mail.ts` (Resend). It can only deliver to the owner's address until the site has its own sending domain.

## Database

- There is **one live Supabase database and no staging copy.** Local development, previews, tests and production all use it.
- Schema and row-level security live in `supabase/migrations/`. Every table has RLS. Migrations are additive: they never drop or rewrite existing data.
- Applying migrations changes the live site's database. Only Bryce does it, or a session he has told to in that session.

## Development Commands

```bash
npm run dev            # Local dev server
npm run build          # Production build
npm run typecheck      # tsc --noEmit
npm run test:local     # Start the built site on port 3000, run every test, stop it
npm test               # Run the tests against an already running site (TEST_SITE_URL picks it)
npm run sync-config    # Copy src/config/plans.ts into the database
npm run seed-fixture   # Load or reset the dummy campaign the tests run against
npm run fetch-srd      # Download the pinned SRD dataset (not stored in the repo)
npm run import-srd     # Load both SRD versions (repeatable)
npm run seed-demo      # Rebuild the public demo campaign
```

Environment variable names (values are never written down here): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_PASSWORD`, `NEXT_PUBLIC_SITE_URL`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `RESEND_API_KEY`, `DM_EMAIL`.

## Testing

- Run `npm run build && npm run test:local`. All tests must pass before anything is merged.
- The tests run against a made-up dummy campaign (`tests/fixtures/dummy-campaign.mjs`, "The Harvest Fair", which becomes "The Hollow Crown" at its second stage). It lives in the Head DM's account, is not secret, and nobody plays in it. `npm run seed-fixture` puts it back if it is ever changed or deleted.
- Tests create throwaway accounts on the live database and remove them afterwards. The run fails if any are left behind. Run tests only when the person asks, and never while someone else's migration is open.
- Add tests for every new permission, visibility, entitlement and purchase rule. A change to a screen that breaks an existing test means the test is updated in the same pull request, not left failing.
- `tests/helpers.mjs` has the shared helpers (`makeUser`, `campaign`, `invite`, `page`, `cleanup`).
- On Windows, `test:local` can leave the site running on port 3000. Stop it before the next run.

## Deployment

- The live site is **not** connected to GitHub. Pushing or merging deploys nothing. Production is deployed with the Vercel CLI from Bryce's machine.
- Only Bryce deploys, or a session he has told to in that session. Preview deployments sit behind a Vercel login.
- Order for a change that needs the database: apply the additive migration first, deploy the code, then run any import or seed script.

## Hub Design

New hub pages follow `docs/design/design-system.md`.

- **Colours and fonts come from theme variables only.** The hub version 2 tokens (`--line-strong`, `--vellum-soft`, `--gold-tint`, `--ember-tint`, `--ember-text`, and the four `--secret` tokens) are set on `.campaign` in `src/styles/campaign.css`.
- **Anything hidden from players, as a DM sees it, uses `HiddenBox` or `HiddenTag`** from `src/features/hub/ui/Hidden.tsx`: a dashed border, a tinted background and a label in words. It is only a look. A player's page must not contain the hidden thing at all.
- **Shared pieces live in `src/features/hub/ui/`** and are drawn in all seven themes on Head DM > Design samples (`/admin/design`, `Samples.tsx`). Add a new shared piece there too, and check it in the light Vellum theme and at 390px.
- **Never add a colour inside a theme's `colors` in `src/config/themes.ts`.** Campaigns store their own copy of a theme and the database compares it to the default themes exactly. A theme's `secret` colour sits beside `theme` for this reason.

## Visibility: Who Sees What

One rule decides who receives anything in a campaign, and it is written twice: `entry_open()` in the database and `entryOpen()` in `src/lib/entry-types.ts`. **Change both or neither.** A test fails if they stop knowing the same values, and another compares their answers on the live database for every value.

- **Seven stored values** (`vis`, with `vis_players`, `vis_stage`, `vis_entry` beside it): `all`, `dm`, `players`, `stage`, `entry` (once a story beat has happened), and the two that combine who with when, `players_stage` and `players_entry`. Table-tool entries and homebrew attached to a campaign both use them.
- **The control is `VisPicker`.** Never build another. Where the page has turned on hub version 2 visibility (`<VisMode on>`, from the `hub_v2_visibility` flag), a DM's picker is the "Who sees this?" dialog in `src/features/hub/visibility/`, which asks who and when and offers every choice on every kind of content. `model.ts` there turns the two questions into the stored value and back, and writes the sentence that says who will see it.
- **NPC partial reveals.** `data.reveal` on an NPC is how much of them players get: everything (not set), `portrait` (name and portrait) or `name` (name only). Who can see the NPC at all is still `vis`. What is held back is stored with the DM-only secrets (`entry_secrets`, under `held`), never on the NPC's own row; use `npcSplit()` to save and `npcFull()` for the DM's view. The database refuses a partly shown NPC that carries anything but its name (and, at `portrait`, its picture). **A new NPC field is held back by default.**
- **The DM previewing as a player** reads with the DM's own login, which the database lets read everything, so the same rule is applied in code before anything is sent (`getEntries`, `getSheetEntities`, `serveMap`). Anything new a player can be shown needs that step too.
- **A published copy of a campaign** has none of the original's players: anything for named players becomes DM only (`src/lib/store.ts`).
- **Page blocks are separate.** They keep their own controls (DM only, hidden, a stage, named players). New hub pages are built on entries.

## Campaign Settings

With the `hub_v2_settings` flag, a campaign's Manage page is **Campaign settings** (`src/features/hub/settings/`): sections for General, Pages and features, Visibility defaults, Dice, People and permissions, Discord, and Archive or delete. Without the flag it is the Manage page as it was.

- **Every part is written once** in `src/app/c/[slug]/manage/page.tsx` and placed in both layouts. A new campaign setting goes in as a part, into the section it belongs to, and into the old layout too until the flag is retired.
- **Visibility defaults** are `settings.visibility` (`defaults.ts`): how new content starts (hidden or visible), what players see of a newly revealed NPC, and whether reveals to only some players are offered. A campaign with none behaves as campaigns always have. The tool page hands them to the pickers through `<VisMode defaults>`; a new hub page that makes content should start from them too.
- **Discord and archiving are not built.** Their sections say so.

## Co-DMs and Permissions

A campaign has one owner and any number of co-DMs. The owner chooses what each co-DM may do.

- **The list is `src/config/co-dm.ts`:** ten permissions (`see_hidden`, `edit`, `reveal`, `combat`, `handouts`, `private_rolls`, `messages`, `recaps`, `players`, `settings`) and three presets. They are stored on the membership (`memberships.perms`). **Nothing stored means everything**, which is "Full co-DM" and what every co-DM had before permissions existed.
- **The database decides.** `co_dm_can(campaign, permission)` is yes for the owner always, and for a co-DM whose permissions are empty or say yes. `reads_all()` asks for `see_hidden`; `can_edit()` asks for `edit`. Never check a permission only in the page.
- **`edit`, `reveal` and `settings` need `see_hidden`** (`dm_may()` in the database, `cleanPerms()` in the app). A co-DM without `see_hidden` reads the campaign as a player does.
- **In the app,** `ctx.realDm` and `ctx.isDm` mean "reads what a DM reads": the owner, or a co-DM with `see_hidden`. Use `ctx.perms.<name>` to leave out what the database would refuse, `ctx.isOwner` for what only the owner does, and `ctx.coDm` to tell a co-DM from the owner.
- **Only the owner** chooses co-DMs (`set_co_dm()`), deletes the campaign, or hands it to someone else. Who owns a campaign cannot be changed by a co-DM.
- **A new DM feature needs a permission.** Pick the one that fits and check it in the database rule for that feature with `co_dm_can()` (or `dm_may()` if it touches hidden things). `handouts`, `messages` and `recaps` are waiting for their features (items 20, 14 and 9).
- **Keep `is_campaign_dm(campaign)` per campaign.** It still means "the owner or any co-DM of this campaign". Never add a site-wide DM check.

## Dice

Dice are rolled on the server, never in the browser (`src/features/dice/`).

- **One way in.** The browser posts what to roll to `/c/<slug>/tools/dice/roll`. `server.ts` decides whether that roll may be made and who will see it, rolls it with `crypto.randomInt`, and stores it with the service role. Signed-in people can read the dice tables and can write none of them. Never add a second way to store a roll, and never roll in a client component.
- **A roll is two rows:** `rolls` (who, label, total, privacy) and `roll_details` (the dice and modifier). A campaign that shows only totals keeps other people's details from them.
- **Who may read a roll** is the database's rule (`rolls_select`) and the same rule in code, `rollOpen()` in `model.ts`, used for the DM's "view as player". **Change both or neither.** Privacy is `all`, `dm`, `self` (not even the DM) or `players` (a DM roll for named players); `blind` means the roller does not see their own result.
- **Who may make which roll** is `decidePrivacy()` in `model.ts`, applied by the server: the campaign's dice rules (`settings.dice`), the "Private rolls" feature switch, and checks that are always private.
- **Tap to roll:** a check's modifier is worked out by the rules engine on the server when the page is built and handed to the browser sealed (`myChecks()`); the browser can ask for that check but cannot change its number.
- **The limit** of 30 rolls a minute per person is a database trigger.
- **Private rolls** are read by the owner and by a co-DM with the `private_rolls` permission (see "Co-DMs and Permissions").
- `notation.ts` (the parser) and `model.ts` are pure and tested as plain code.

## Hub Pages and Feature Switches

A DM chooses which hub pages a campaign has, and which features each page has (Manage > Pages and features).

- **The list is `src/config/hub-features.ts`:** ten default pages (always there; only their features can be switched off) and six optional pages (can be switched off whole). The names come from the mockup; a test compares them.
- **Check both the flag and the switch.** A hub page: `await requireFlag('hub_v2_map')`, then `if (!hasPage(campaign.settings, 'map')) notFound()`. A feature on a page: render it, and run its server actions, only when `hasFeature(campaign.settings, 'combat.map')` is true. Both helpers are exported from `src/config/tools.ts`, next to `hasTool`.
- **What is switched off is stored, not what is on:** `settings.features = { off: ['map', 'combat.map'] }`. A campaign with no list keeps everything, and a feature added to the list later starts on for every campaign.
- **Switching something off only hides it.** Never delete or change a page's content because its switch is off.
- **`startsOff` in the list** is only for new campaign setup (item 22). It never switches anything off in an existing campaign.
- **Adding a feature to a page** means adding one line to that page's `features` in `src/config/hub-features.ts`. Never reuse or rename an id: campaigns have stored them.

## Feature Flags

Unfinished work is merged to `main` behind a flag, so it can go in small pieces without players seeing it.

- The list is `src/config/flags.ts`. There is one flag per item of the hub version 2 build plan, named `hub_v2_<page>`, all listed from the start. Building an item means checking its flag, not editing that file.
- Which flags are on for everyone is kept in the database (the `feature_flags` table). Bryce switches them himself on **Head DM > Feature flags** (`/admin/flags`, code in `src/features/flags/`). Everyone can read the rows that are on; only the Head DM can read the rest or change any.
- **A flag that is off** is on only for the Head DM (so Bryce can try it on the live site), for the automated tests' accounts, on a developer's own machine (`npm run dev`) and on Vercel preview deployments. Everyone else gets "not found".
- **Turning a flag on for everyone** is Bryce's to do, from that screen. It takes effect at once, with no merge and no deploy. Never switch one for him, in the database or from a script. `on: true` with `released: 'YYYY-MM-DD'` in `src/config/flags.ts` fixes a flag on in the code; it is only the last step before the flag is removed, and only when Bryce says so.
- **Use it on the server**, through `src/lib/flags.ts`:
  - a page or route: `await requireFlag('hub_v2_quests')` (answers "not found")
  - a server action: `if (!(await flag('hub_v2_quests'))) return { error: NOT_AVAILABLE }`
  - a link, tab or panel: render it only when `await flag(...)` is true
  - a client component: give it the plain values from `await myFlags()`
- **Never decide a flag in the browser,** and never render a flagged feature and hide it. When a flag is off, the feature's text and data must not be sent at all. A test fails if a client component imports the flag rule.
- **Tests never touch the real flags' switches.** A test that needs a row in `feature_flags` names it `zz_test_…`, which is not on the list and so switches nothing on the live site.
- **Testing a flagged feature:** test accounts have every flag on. To prove it is hidden from ordinary people, make the account with `makeUser(label, { unblocked: true })` and check the page answers 404 and its data is not in the HTML.
- **When a feature is released,** remove its flag and its checks in a small pull request of their own.

## Working in Parallel

Several people, each with their own Claude Code session, build in this repository at once. Every session follows these rules.

- **Confirm the issue number and the branch before editing anything.** The branch is `feature/<issue-number>-short-name`, made from an up-to-date `main`. If the current branch is `main`, stop and make the branch first.
- **Never commit to `main`, push to `main` or merge into `main`.** Only Bryce merges. Open a pull request and stop.
- **Stay inside the folders listed in the issue's "Touches" section.** Read the issue first (`gh issue view <number>`).
- **Stop and ask before editing a shared file.** The shared files and their owners are listed in `docs/board-setup.md`. A change to one goes in its own small pull request.
- **Stop and ask before adding a database migration.** Only one may be open at a time, and it is announced on the issue first.
- **Do not deploy.**
- **Merge small and often.** One pull request does one thing and can be reviewed in 15 minutes. Pull `main` into the branch at the start of each working day. Branches live days, not weeks.
- **Unfinished work is hidden behind a feature flag** (see "Feature Flags" above). Merge it small and often with its flag off.
- Comment on the issue when starting, saying which files are expected to change.

## Project Board

- Board: https://github.com/users/bryceuahays/projects/1 ("Dungeons by Bryce Roadmap"). Every planned feature, bug and business task is on it.
- Fields: **Status** (Backlog, Ready, In progress, In testing, Done), **Priority** (Must, Should, Could, Won't), **Work type** (Feature, Bug, Business), **Area**.
- Labels: `feature`, `bug`, `business`, `needs-testing`, `phone`, `groundwork`, `touches-shared`.
- Bugs are filed with the Bug report form. A bug that showed a player something hidden is a launch blocker.
- New deferred work goes on the board as an issue first, then in `TODO-LATER.md`.

## Documentation Map

- `docs/handoff.md`: what has been built, where each thing is in the UI, and what Bryce must do by hand.
- `docs/decisions.md`: every choice made while building, numbered. Add to it; do not rewrite it.
- `docs/board-setup.md`: how the team works, what is built, the shared files, and what can be built in parallel.
- `docs/commercial-plan.md`: the plan for the commercial build.
- `docs/srd-import.md` and `docs/srd-import-report.md`: SRD sources, licences and import counts.
- `docs/originals-report.md`: what is in the free originals pack and what was left out. The pack is now maintained by hand under Homebrew.
- `TODO-LATER.md`: deferred work and things only Bryce can do.
