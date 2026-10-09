# Going live with Alec's branch (`alec/dev`)

Alec built this on his own copy of the site with a separate test database. Nothing here has touched
the live site or the live database yet. Three steps, in this order. Every database change is
additive: nothing existing is removed, and "To be a god" is not touched.

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
  **Players → What's available**. The sheet is now read-only apart from play tracking.
- **View as player / View as DM** switch, and on-page confirmations instead of browser pop-ups.

## Step 1: the live database (on your computer, with the live keys)

Your `.env.local` must point at the **live** project for these. Run them from the project folder
after checking out the branch (`git fetch` then `git checkout alec/dev`).

1. Add the two new tables for worlds:

   ```
   npx supabase db push --include-all --db-url "<your live SUPABASE_DB_URL>"
   ```

   It should list exactly two migrations: `20261012000001_worlds.sql` and
   `20261012000002_worlds_official.sql`.

2. Download the SRD data (it is not stored in GitHub), then import it. The import updates the
   official entries in place (same ids, so existing sheets keep working) and never touches
   homebrew or private entries:

   ```
   node scripts/fetch-srd.mjs
   node scripts/import-srd.mjs
   ```

   It rewrites `docs/srd-import-report.md`; commit that or discard it, as you like.

3. Create the ready-made Classic Fantasy world:

   ```
   node scripts/seed-worlds.mjs
   ```

   It should print `Classic Fantasy: ready`.

## Step 2: check the preview

Vercel builds a preview for the `alec/dev` branch (Vercel → dungeons-by-bryce → Deployments).
The preview shares the live database, so after step 1 it shows the real data. Worth a look:

- Homebrew: open a class, a monster and a spell; try Import homebrew.
- My worlds: Classic Fantasy is listed.
- "To be a god" opens and behaves as before (it keeps its own character builder).
- In a test campaign: View as player → My character → Create new character.

## Step 3: put it live

On GitHub, open a pull request from `alec/dev` into `main` and merge it. Vercel deploys `main` to
the live site.

## Known things

- `scripts/seed-srd.mjs` leaves out `srd_version` and fails on a fresh database
  (`entities_srd_has_version`). It is not needed for the steps above.
- Images and banners people upload are their responsibility to license; the SRD text is CC-BY 4.0.
