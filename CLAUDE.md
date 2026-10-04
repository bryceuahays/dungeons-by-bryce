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
