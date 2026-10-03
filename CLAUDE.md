# Dungeons by Bryce

A hub for Bryce's D&D campaigns. `BRIEF.md` is the original build brief, `DECISIONS.md` records choices made during the build, `REPORT.md` is the handover.

## Stack
Next.js (App Router, TypeScript) on Vercel. Supabase for Postgres, Auth, Storage, Realtime. Plain CSS.

## Hard rules
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
