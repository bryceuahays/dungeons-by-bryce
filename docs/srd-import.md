# Where the SRD content comes from

Every account gets the complete open rules content for free: the System Reference Document 5.1 (the 2014 rules) and the System Reference Document 5.2 (the 2024 rules). Both are published by Wizards of the Coast under the Creative Commons Attribution 4.0 International License (CC-BY-4.0).

## Source

| | |
|---|---|
| Dataset | `5e-bits/5e-srd-api`, folder `packages/5e-database/src/2014/en` and `.../2024/en` |
| Address | https://github.com/5e-bits/5e-srd-api |
| Version used | commit `05c109ea1f6b5445960b645ded48ad9c6a8df7b0` (3 October 2026) |
| Fetched | 4 October 2026: 49 JSON files, 7.2 MB |
| What it is | The database behind dnd5eapi.co: the SRD turned into structured JSON. It is the maintained home of the older `5e-bits/5e-database`, which is now archived and points here. |

## Licence check

- **The dataset's own licence is MIT** (`LICENSE.md` in the repository). That covers the project's code and the work of structuring the data, and allows copying and commercial use with the copyright notice kept.
- **The material inside it is the SRD.** The dataset's README says the underlying material is released under the Open Gaming License 1.0a. Wizards of the Coast has since also released the SRD 5.1 under CC-BY-4.0, and the SRD 5.2 under CC-BY-4.0 only. This site relies on the CC-BY-4.0 release and carries the attribution for both documents on `/legal`.
- **It contains only SRD content.** The project exists to serve the SRD and nothing else. Spot checks agree: the 2014 data has the SRD's 9 races, 12 classes with one subclass each, 1 background (Acolyte), 1 feat (Grappler), 319 spells and 334 monsters; the 2024 data has 9 species, 12 classes, 4 backgrounds, 17 feats, 339 spells and 341 monsters. Those are the SRD's counts, not a rulebook's.
- No wiki, fan site or mixed source was used.

**For your lawyer:** the one point to confirm is relying on Wizards' CC-BY-4.0 release for content taken from a dataset whose README still names the OGL. The text is the same SRD text either way.

## How it is loaded

```
node scripts/fetch-srd.mjs      download the files into seed/srd/full/ (not kept in the repository)
node scripts/import-srd.mjs     load them; writes docs/srd-import-report.md
```

- Run both again whenever the SRD or the dataset is updated. To take the newest data instead of the pinned version: `node scripts/fetch-srd.mjs main`.
- Entries are matched by SRD version, type and name, and updated in place. Running the import again makes no duplicates and keeps each entry's id, so character sheets that use an entry keep working.
- Every imported entry is marked `source: srd` with `srd_version` 5.1 or 5.2.
- The import only ever touches entries marked `srd`. Homebrew and private entries are never changed or removed. If an SRD entry has the same name as one of them, both are kept and the report lists it.
- An entry marked `srd` that is not in the official data is removed, and the report lists it.

## How the data is shaped for the site

The dataset gives the official wording. The site also needs to know what an entry does to a character sheet. That is worked out in `scripts/import-srd.mjs`:

- **Races (5.1):** ability bonuses, senses, resistances, proficiencies and resources follow the SRD's own trait text. The four SRD subraces (hill dwarf, high elf, lightfoot halfling, rock gnome) are folded into their race.
- **Species (5.2):** darkvision, damage resistance and extra hit points are read from the trait text. Lineages, legacies and ancestries are listed as traits to choose from.
- **Classes:** hit die, saving throws, proficiencies, skill choices and spellcasting come from the data's fields. Per-level numbers (rages, sneak attack dice, focus points, and so on) become resources and scaling values, which is what fills the automatic class table.
- **Backgrounds, feats, spells, equipment, magic items, monsters, conditions:** field for field.
- **Rules reference text:** the 2014 data's rules chapters, plus short reference entries (skills, damage types, weapon properties, weapon mastery, languages, alignments, schools of magic, ability scores) for both versions. The 2024 data has no rules chapters yet.

Counts, and anything that failed, are in `docs/srd-import-report.md`.
