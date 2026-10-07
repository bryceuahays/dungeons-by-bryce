# Dungeons by Bryce

A hub for Bryce's D&D campaigns. `BRIEF.md` is the original build brief, `DECISIONS.md` records choices made during the build, `REPORT.md` is the handover.

## Stack
Next.js (App Router, TypeScript) on Vercel. Supabase for Postgres, Auth, Storage, Realtime. Plain CSS.

## Hard rules
- Roles: one Head DM account (the site owner). Everyone else is the DM of campaigns they own and a player in campaigns they join. Database policies are per campaign (`is_campaign_dm(campaign_id)`); never add a site-wide "is DM" check. The Head DM does not get into other DMs' content.
- The Head DM reads another DM's campaign only after unhiding it (`head_reveals`, `head_sees(campaign)`, `reads_all(campaign)`); that access is read-only. In the app this is `ctx.headView`; editing tools are shown on `ctx.realDm`.
- Content written by a DM is untrusted: it goes through `src/lib/sanitize.ts` on the server before it is sent. Character-builder rules contain runnable formulas and are writable only by the Head DM; other DMs copy them with `copy_campaign_rules`.
- Phases: rows, tabs, and campaign titles can belong to a phase and are withheld by RLS, not by the page.
- DM-only content must never reach a player's browser. Row-level security enforces it in the database; pages are built on the server from rows the viewer may read. Never hard-code campaign content in components.
- `source/` is canon. Do not rewrite campaign text, rules, or numbers.
- Secrets live in `.env.local` and Vercel environment variables. Never print or commit them.
- The user is not a programmer. Explain in plain language and give click-by-click steps.

## Layout
- `supabase/migrations/` schema and RLS. Apply with `npx supabase db push`.
- `scripts/extract.mjs` reads `source/` and writes `seed/to-be-a-god.json`. `scripts/seed.mjs` loads it (`--reset` replaces content with the source again).
- `scripts/build-css.mjs` and `scripts/build-islands.mjs` generate `src/styles/{guide,builder,runsheet}.css` and `src/islands/*.gen.js` from `source/`. Do not edit generated files by hand.
- `src/lib/campaign.ts` is the only place content is read; it applies the viewer's role, phase, and "view as player".
- `src/app/c/[slug]/` is everything inside a campaign. `actions.ts` holds the DM's server actions.
- `tests/done.test.mjs` is BRIEF section 11. Run `npm test` with the app running (`TEST_SITE_URL` picks the site; default localhost:3000). `npm run verify-seed` checks the database against `source/`.

## Shell note
On this Windows machine use `npx.cmd` / `npm.cmd` in PowerShell (scripts are blocked by execution policy).

## Commercial build (branch `commercial`)

- Read `docs/commercial-plan.md`, `docs/decisions.md` and `docs/handoff.md` first.
- Plans and limits: `src/config/plans.ts` is the source; `npm run sync-config` copies it into `app_config.plans`, where the database enforces it (`is_pro`, `campaign_feature`, `campaign_writable`, `can_edit`, and the `*_gate` triggers). Pages ask `src/lib/entitlements.ts`. Never check a plan anywhere else.
- Rules content: `entities` (SRD has no owner; homebrew belongs to an account; `source` is `srd`, `homebrew` or `private`). The legacy `rules` table is "To be a god" only and is all `private`. `usesLegacySheet()` decides which sheet a campaign gets.
- Table tools are rows of `entries` (+ `entry_secrets` for the DM-only part). One visibility rule: `entry_open()` in SQL, mirrored by `entryOpen()` in `src/lib/entry-types.ts` for the "view as" preview.
- Map pictures are served only through `src/lib/map-image.ts`, which paints hidden regions on the server.
- Nothing that names "To be a god" may appear in code that ships to the browser (its title is hidden from its players before the reveal). A test checks the bundles.
- Tests: `npm run build && npm run test:local`. They use throwaway accounts on the real database and fail if any are left behind.
- Stripe is test-mode only by design (`src/lib/stripe.ts`).

## Follow-up build (branch `commercial-followup`, on top of `commercial`)

- SRD: both versions live in `entities` with `srd_version` 5.1 or 5.2. `node scripts/fetch-srd.mjs` then `node scripts/import-srd.mjs` (repeatable; data is not in the repo). A campaign's `settings.rules` is `2014`, `2024` or `both` (`src/config/rules.ts`).
- Packs: `packs.official` / `packs.free`, `pack_owners`, `attach_pack()`. Entities carry `origin` (`own` or `product`); only `own` counts toward the free limit.
- Store: `src/lib/store.ts` (publish campaign or pack, generate framework or publishable copy, deliver, upgrade). Prices and discount in `src/config/store.ts`. Listings are hidden from players of `products.spoiler_campaign`, and from signed-out visitors while that campaign has players.
- A bought campaign: `campaign_feature` (use what came with it) is true; `campaign_can_create` (make new Pro-only things) follows the owner's plan. In pages: `campaignCan` vs `campaignCanMake`; in tools: `p.can` vs `p.make`.
- Commissions: `src/config/commissions.ts`; statuses requested, accepted, declined, paid, in_progress, in_review, delivered; `deliver_commission()` transfers the campaign and sets `profiles.pro_until`.

## Working in parallel

Several people, each with their own Claude Code session, build features in this repo at the same time. Every session follows these rules. The board is https://github.com/users/bryceuahays/projects/1 and `docs/board-setup.md` explains it.

- **Before editing anything, confirm the issue number and the branch.** Ask the person which issue this session is for. The branch is `feature/<issue-number>-short-name`, made from an up-to-date `main`. If the current branch is `main`, stop and make the branch first.
- **Never commit to `main`, never push to `main`, never merge into `main`.** Only Bryce merges. Open a pull request and stop.
- **Stay inside the folders listed in the issue's "Touches" section.** Read the issue (`gh issue view <number>`) before starting.
- **Stop and ask before editing a shared file.** The shared files are listed in `docs/board-setup.md`. If the issue's "Touches" section does not name the file, do not change it; say which file and why, and let the person ask its owner. A change to a shared file goes in its own small pull request.
- **Stop and ask before adding a database migration.** There is one live database and no test copy. Only one migration may be open at a time, and it is announced on the issue first. Never run `supabase db push` without the person saying so in this session.
- **Do not deploy.** No `vercel --prod`. Preview deployments are fine when the person asks for one.
- **Unfinished work is hidden behind a feature flag** (see the "Feature flags" issue). Until flags exist, only merge finished pieces.
- **Pull `main` into the branch at the start of each working day,** and keep pull requests small enough to review in 15 minutes.
- **Tests use the live database** with throwaway accounts. Run them only when the person asks, and never while someone else's migration is open.
- New code for a feature goes in `src/features/<area>/<feature>/`. Files in `src/app` stay thin.
- The first campaign's real title is hidden from its players. In issues, pull requests and commit messages call it "Bryce's first campaign".
