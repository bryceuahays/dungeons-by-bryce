# To do later

## The board

Everything in this file is also on the roadmap board: https://github.com/users/bryceuahays/projects/1. Each line below links to its issue. New deferred work goes on the board first, then here. More deferred work that was found when the board was set up and is only on the board: full campaign export ([#39](https://github.com/bryceuahays/dungeons-by-bryce/issues/39)), feature flags ([#1](https://github.com/bryceuahays/dungeons-by-bryce/issues/1)), the homebrew shared core ([#2](https://github.com/bryceuahays/dungeons-by-bryce/issues/2)), the folder splits ([#3](https://github.com/bryceuahays/dungeons-by-bryce/issues/3), [#4](https://github.com/bryceuahays/dungeons-by-bryce/issues/4), [#5](https://github.com/bryceuahays/dungeons-by-bryce/issues/5), [#6](https://github.com/bryceuahays/dungeons-by-bryce/issues/6)), homebrew lore ([#51](https://github.com/bryceuahays/dungeons-by-bryce/issues/51)), race building ([#52](https://github.com/bryceuahays/dungeons-by-bryce/issues/52)), and the 2024 SRD rules chapters ([#67](https://github.com/bryceuahays/dungeons-by-bryce/issues/67)).

Not built in the commercial build, on purpose. Tick things off as they are done.

## Features for later

- [ ] **Creator marketplace.** Other creators sell campaigns, races, creatures, and worlds for a percentage cut. Needs seller payouts and a takedown process for copied content. (The `products` table already has a seller and a "site cut" column.) ([#42](https://github.com/bryceuahays/dungeons-by-bryce/issues/42))
- [ ] **Community campaign finder** so players can find games to join. Free, as a way to bring people in. ([#43](https://github.com/bryceuahays/dungeons-by-bryce/issues/43))
- [ ] **Facilitator edition** for therapists running therapeutic game groups, built on the session zero tools. Needs a privacy review first. ([#44](https://github.com/bryceuahays/dungeons-by-bryce/issues/44))
- [ ] **Paste to import:** paste homebrew text from a document and have it parsed into the builder. ([#41](https://github.com/bryceuahays/dungeons-by-bryce/issues/41))
- [ ] **AI session prep tools,** priced by usage. (Founder lifetime does not include usage-priced add-ons.) ([#45](https://github.com/bryceuahays/dungeons-by-bryce/issues/45))
- [ ] **Discord bot** that posts recaps and reveal notices. ([#40](https://github.com/bryceuahays/dungeons-by-bryce/issues/40))
- [ ] **Importers** from World Anvil, Kanka, and Obsidian. ([#46](https://github.com/bryceuahays/dungeons-by-bryce/issues/46))
- [ ] **Session scheduling** and availability polls. ([#49](https://github.com/bryceuahays/dungeons-by-bryce/issues/49))
- [ ] **Support for other game systems.** ([#47](https://github.com/bryceuahays/dungeons-by-bryce/issues/47))
- [ ] **Partnership or integration with a map tool** such as Inkarnate. ([#48](https://github.com/bryceuahays/dungeons-by-bryce/issues/48))
- [ ] **Affiliate links** for dice and books. ([#50](https://github.com/bryceuahays/dungeons-by-bryce/issues/50))

## Things only you can do

- [ ] Add live Stripe keys and switch off test mode. (A business task on the board.)
- [ ] Write real Terms and Privacy text. (A business task on the board.)
- [ ] Have a lawyer confirm the SRD licensing approach. (A business task on the board.)
- [x] Set prices for the two higher custom-site tiers. (Done: $125 and $200, in `src/config/commissions.ts`.)
- [ ] Decide whether to open a Patreon or Ko-fi and run paid games. (A business task on the board.)

## Deferred during the build

- [x] **Load the full SRD.** The site ships a hand-written core set (9 races, 12 classes, 12 subclasses, 1 background, 1 feat, 75 items, 89 spells, 34 monsters). `scripts/import-srd.mjs` loads every SRD spell, monster and magic item from a data folder. It needs your say-so to download the data, and it has not been run against real data yet. ([#9](https://github.com/bryceuahays/dungeons-by-bryce/issues/9). Done in the follow-up build: both SRD versions are loaded.)
- [ ] **Search in the SRD browser and the sheet's spell picker.** Fine with the core set; needed once the full SRD is loaded. ([#66](https://github.com/bryceuahays/dungeons-by-bryce/issues/66). The SRD browser has search now; the sheet's spell picker does not.)
- [ ] **A second staging database.** Tests currently run against the live database with throwaway accounts. A separate Supabase project for testing would be safer once real customers arrive. ([#55](https://github.com/bryceuahays/dungeons-by-bryce/issues/55))
- [ ] **Stripe has only been exercised with signed test events,** not with a real Stripe test account. Run one test checkout end to end after adding the test keys (steps in `docs/handoff.md`). ([#8](https://github.com/bryceuahays/dungeons-by-bryce/issues/8))
- [ ] **Email for commission requests and feedback goes through Resend's shared sender.** A sending domain of your own would let the site email people other than you (receipts, invite emails). ([#56](https://github.com/bryceuahays/dungeons-by-bryce/issues/56))
- [ ] **Invite by email.** Invites are links and codes you send yourself. ([#57](https://github.com/bryceuahays/dungeons-by-bryce/issues/57))
- [ ] **Named-player visibility for attached homebrew and map regions** is in the database rules; the screens offer it for blocks, NPCs, beats and pins only. ([#58](https://github.com/bryceuahays/dungeons-by-bryce/issues/58))
- [ ] **Homebrew effects on "To be a god" sheets.** Structured effects apply to the standard sheet. That campaign keeps its own sheet. ([#59](https://github.com/bryceuahays/dungeons-by-bryce/issues/59))
- [ ] **Items on the standard sheet.** Gear is a text box. Picking SRD or homebrew items into an inventory, with their effects applied, is not built. ([#54](https://github.com/bryceuahays/dungeons-by-bryce/issues/54))
- [ ] **Multiclassing and choosing subclass features by option** on the standard sheet. ([#53](https://github.com/bryceuahays/dungeons-by-bryce/issues/53))
- [ ] **Drawing tools for map regions beyond tap-to-outline** (freehand, rectangles, editing an outline after it is drawn). ([#60](https://github.com/bryceuahays/dungeons-by-bryce/issues/60))
- [ ] **More than one fight at a time** in the initiative tracker, and saving a fight to reuse. ([#61](https://github.com/bryceuahays/dungeons-by-bryce/issues/61))
- [ ] **A co-DM screen.** The database supports a second DM on a campaign; there is no screen to add one. ([#62](https://github.com/bryceuahays/dungeons-by-bryce/issues/62))
- [ ] **Product covers** are uploaded to a public bucket by path; there is no upload button on the publish form yet. ([#63](https://github.com/bryceuahays/dungeons-by-bryce/issues/63))
- [ ] **Refunds and failed deliveries** for store purchases are handled by hand in the Stripe dashboard. ([#64](https://github.com/bryceuahays/dungeons-by-bryce/issues/64))
- [ ] **A cookie and privacy notice** if you add analytics. The site sets only the sign-in cookie today. ([#65](https://github.com/bryceuahays/dungeons-by-bryce/issues/65))
