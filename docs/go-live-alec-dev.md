# Putting Alec's branch (`alec/dev`) live

Alec built this on his own copy of the site with a separate test database. Nothing here has touched
the live site or the live database. Every database change is additive: nothing existing is removed,
and nothing in any existing campaign is changed.

**Before the team rules.** This was built before `CLAUDE.md`'s team rules and the project board
arrived, so it is one large branch rather than small `feature/<issue>` pull requests, its code is in
`src/components` and `src/lib` rather than `src/features/`, and it changes shared files (below).
It overlaps planned issues: [#52](https://github.com/bryceuahays/dungeons-by-bryce/issues/52) race
building, [#53](https://github.com/bryceuahays/dungeons-by-bryce/issues/53) class building and
[#54](https://github.com/bryceuahays/dungeons-by-bryce/issues/54) items are largely built here, and
it touches what [#2](https://github.com/bryceuahays/dungeons-by-bryce/issues/2) (homebrew shared core)
and [#6](https://github.com/bryceuahays/dungeons-by-bryce/issues/6) (sheet folder split) plan to
reorganize. Worth deciding before anyone starts those.

## What is new

- **Homebrew pages rebuilt as fields, not text,** for every kind: class (spell slot tables, focus,
  starting equipment, multiclassing, leveling milestones, subclasses, features with uses, choices,
  gives and growing numbers), subclass, spell (range, area, saves, damage, upcasting as fields),
  feat, race, background, item, monster (actions, attacks, saves, recharges, spellcasting) and
  custom resource. Searchable pickers for the big lists.
- **Import homebrew** (Homebrew page, Beta): give your own AI a prompt plus your notes, paste its
  answer, and it opens filled in. Understands reskins ("a Warlock variant") and turns patrons,
  oaths and paths into real subclasses.
- **Reskins replace the official one** for players in the campaigns they are added to.
- **My worlds:** a setting above campaigns. A world holds its homebrew; its campaigns get it. A
  ready-made world, **Classic Fantasy** (the 2024 SRD as published), is there for everyone.
- **Character creator:** step by step (class, background, species, abilities and skills,
  equipment, spells, details, review), offering only what the DM leaves ticked under
  **Players → What's available**. The standard sheet is now read-only apart from play tracking.
- **View as player / View as DM** switch, and on-page confirmations instead of browser pop-ups.

**Shared files it changes:** `src/components/EntityEditor.tsx`, `src/config/homebrew.ts`,
`src/lib/rules/engine.ts`, `src/components/Sheet5e.tsx`, `src/app/(hub)/homebrew/actions.ts`,
`src/lib/campaign.ts`, `src/app/(hub)/layout.tsx`, `src/components/CampaignChrome.tsx`,
`src/styles/tools.css`, and two new files in `supabase/migrations/`.

## The steps (Bryce)

In the order `CLAUDE.md` gives: migration, then code, then the import scripts. Commands are for
PowerShell on your machine, from the project folder, with `.env.local` pointing at the live project.

1. **Review and merge.** Open the pull request from `alec/dev` into `main` on GitHub, look it over,
   and merge it. (Merging deploys nothing; the live site is not connected to GitHub.) Then get it:

   ```
   git checkout main
   git pull
   ```

2. **Add the two new tables for worlds** (additive):

   ```
   npx.cmd supabase db push
   ```

   It should list exactly two migrations, `20261012000001_worlds.sql` and
   `20261012000002_worlds_official.sql`. Type `y` to apply them.

3. **Deploy the code** the way you usually do:

   ```
   npx.cmd vercel --prod
   ```

4. **Load the new SRD data and the ready-made world.** The SRD data is not stored in GitHub, so it
   is downloaded first. The import updates the official entries in place (same ids, so existing
   sheets keep working) and never touches homebrew or private entries:

   ```
   npm.cmd run fetch-srd
   node scripts/import-srd.mjs --dry-run
   ```

   That first run is a **preview: it changes nothing.** It prints what a real run would add, replace
   and remove, and writes the details to `docs/srd-import-preview.md`. Alec's branch produces exactly
   the same 2,797 official entries (same names) as the current import, so it should say
   **remove 0 (0 of them in use)** and add 0; only "replace" should be large. If it says anything is
   removed and in use, stop and send Alec the preview file. Otherwise run it for real:

   ```
   npm.cmd run import-srd
   node scripts/seed-worlds.mjs
   ```

   The last one should print `Classic Fantasy: ready`. The import rewrites
   `docs/srd-import-report.md`; commit it or discard it.

5. **Check the live site:** open a class, a monster and a spell under Homebrew, try Import homebrew,
   see Classic Fantasy under My worlds, open your first campaign to check it behaves as before, and
   in a test campaign try View as player → My character → Create new character.

## Known things

- No new automated tests were added for the worlds tables' security rules or the creator yet.
- `scripts/seed-srd.mjs` leaves out `srd_version` and fails on a fresh database
  (`entities_srd_has_version`). It is not needed for the steps above.
