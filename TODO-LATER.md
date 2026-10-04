# To do later

Not built in the commercial build, on purpose. Tick things off as they are done.

## Features for later

- [ ] **Creator marketplace.** Other creators sell campaigns, races, creatures, and worlds for a percentage cut. Needs seller payouts and a takedown process for copied content. (The `products` table already has a seller and a "site cut" column.)
- [ ] **Community campaign finder** so players can find games to join. Free, as a way to bring people in.
- [ ] **Facilitator edition** for therapists running therapeutic game groups, built on the session zero tools. Needs a privacy review first.
- [ ] **Paste to import:** paste homebrew text from a document and have it parsed into the builder.
- [ ] **AI session prep tools,** priced by usage. (Founder lifetime does not include usage-priced add-ons.)
- [ ] **Discord bot** that posts recaps and reveal notices.
- [ ] **Importers** from World Anvil, Kanka, and Obsidian.
- [ ] **Session scheduling** and availability polls.
- [ ] **Support for other game systems.**
- [ ] **Partnership or integration with a map tool** such as Inkarnate.
- [ ] **Affiliate links** for dice and books.

## Things only you can do

- [ ] Add live Stripe keys and switch off test mode.
- [ ] Write real Terms and Privacy text.
- [ ] Have a lawyer confirm the SRD licensing approach.
- [ ] Set prices for the two higher custom-site tiers.
- [ ] Decide whether to open a Patreon or Ko-fi and run paid games.

## Deferred during the build

- [ ] **Load the full SRD.** The site ships a hand-written core set (9 races, 12 classes, 12 subclasses, 1 background, 1 feat, 75 items, 89 spells, 34 monsters). `scripts/import-srd.mjs` loads every SRD spell, monster and magic item from a data folder. It needs your say-so to download the data, and it has not been run against real data yet.
- [ ] **Search in the SRD browser and the sheet's spell picker.** Fine with the core set; needed once the full SRD is loaded.
- [ ] **A second staging database.** Tests currently run against the live database with throwaway accounts. A separate Supabase project for testing would be safer once real customers arrive.
- [ ] **Stripe has only been exercised with signed test events,** not with a real Stripe test account. Run one test checkout end to end after adding the test keys (steps in `docs/handoff.md`).
- [ ] **Email for commission requests and feedback goes through Resend's shared sender.** A sending domain of your own would let the site email people other than you (receipts, invite emails).
- [ ] **Invite by email.** Invites are links and codes you send yourself.
- [ ] **Named-player visibility for attached homebrew and map regions** is in the database rules; the screens offer it for blocks, NPCs, beats and pins only.
- [ ] **Homebrew effects on "To be a god" sheets.** Structured effects apply to the standard sheet. That campaign keeps its own sheet.
- [ ] **Items on the standard sheet.** Gear is a text box. Picking SRD or homebrew items into an inventory, with their effects applied, is not built.
- [ ] **Multiclassing and choosing subclass features by option** on the standard sheet.
- [ ] **Drawing tools for map regions beyond tap-to-outline** (freehand, rectangles, editing an outline after it is drawn).
- [ ] **More than one fight at a time** in the initiative tracker, and saving a fight to reuse.
- [ ] **A co-DM screen.** The database supports a second DM on a campaign; there is no screen to add one.
- [ ] **Product covers** are uploaded to a public bucket by path; there is no upload button on the publish form yet.
- [ ] **Refunds and failed deliveries** for store purchases are handled by hand in the Stripe dashboard.
- [ ] **A cookie and privacy notice** if you add analytics. The site sets only the sign-in cookie today.
