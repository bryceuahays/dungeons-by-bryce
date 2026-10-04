# Handoff: the commercial build

Everything in the brief (phases 0 to 13) is built, on the `commercial` branch. The live site at https://dungeons-by-bryce.vercel.app still shows the old version. Nothing goes live until you say so.

- **Preview of the new version:** https://dungeons-by-bryce-6g9p601q5-bryceuahays.vercel.app (Vercel asks you to be signed in to Vercel to open a preview; you are the only one who can.)
- **Tests:** 66 automated tests pass, including the 27 that existed before, against a local copy of the site and the real database. A browser run-through of the new screens (desktop and phone size) also passes.
- **Your data:** your account, "To be a god" (currently showing as "To Kill God"), "For the testing", your character and your run-sheet state are intact. One campaign was added to your account: the demo, "The Lantern Beneath".
- **Plan, decisions, later list:** `docs/commercial-plan.md`, `docs/decisions.md` (75 items), `TODO-LATER.md`.

## Two things to know before anything else

1. **The database has already changed.** There is one database, shared by the live site and the branch, so the new tables and rules are in it now. Every change was additive and the live site keeps working on them. One visible effect on the live site today: a new account is limited to one campaign and five players (the free plan), because the database enforces that. The old pages do not explain it well until the branch is live.
2. **The preview and the live site share that database.** Anything you do in the preview is real.

## What was built

| Phase | What you can do now |
|---|---|
| 0. Engine and content | Every rule has a source: `srd`, `homebrew` or `private`. All 435 existing rules are `private` and can no longer be copied by anyone else. An SRD core set ships with every account. `/legal` has the CC-BY-4.0 attribution and placeholders for Terms and Privacy. Public copy says "fifth edition compatible". |
| 1. Multi-tenant | Already per campaign. Added invite links (`/join/CODE`) that take a new player through sign-up straight into the campaign. |
| 2. Plans and billing | Free, Pro ($7 a month or $50 a year) and Founder ($150 once, 100 seats, counter shown). One entitlements module, one config file. Stripe Checkout, customer portal and webhooks, test mode only. On a downgrade nothing is deleted; extra campaigns become read-only. Upgrade page and prompts at each limit. |
| 3. Homebrew builder | Homebrew in the hub bar. Nine kinds of entry; Quick, Guided and Advanced; clone from the SRD; effect building blocks that the sheet applies by itself; automatic class table; live preview; balance hint; versions with change notes; draft, playtest, live; packs with export and import; edition converter. A new standard fifth edition sheet for every campaign except "To be a god". |
| 4. Secrets and reveals | Reveal stages for any campaign, forward and back with one click. Blocks and tabs for everyone, DM only, named players, one stage, or from a stage onward. Per-player secrets and private notes. "View as" any player at any stage. Reveal log and optional "newly revealed" feed. |
| 5. Table tools | NPC tracker, DM access to any sheet (read-only with an edit switch), live initiative tracker with hidden enemies. |
| 6. Story timeline | Banner on every campaign page; planned, hit and dropped beats; key beats with a checklist and overdue flag; personal beats; player-added beats and notes. |
| 7. Maps | Upload any image; hidden regions painted out on the server; reveal by hand, at a stage, or when a beat happens; pins, including pins that appear with a beat and pins that lead to another map; pan and zoom by touch. |
| 8. World state | Consequence log with "since last session" on the campaign home; clue tracker with the three-clue warning; faction clocks. |
| 9. Session zero | Tone, lines, veils, table rules, house rules. Anonymous player input, stored with no account and no time. |
| 10. Video | Video blocks (YouTube or Vimeo link) with the same visibility as any block; a featured video on the campaign home. |
| 11. Themes and custom sites | Seven themes (four free, three premium) and a theme editor for Pro. `/custom` with three tiers and an intake form that saves the request and emails you. An admin list with status, and "hand a campaign to a client". |
| 12. Storefront | Publish one of your campaigns as a frozen product (refused if it holds private content). `/store` and a page per product with free preview pages. Test-mode purchase. The buyer gets an editable copy as its DM. |
| 13. Public face | New landing page in the doorway style; a public demo at `/demo`; `/pricing` built from the plan config; search and share metadata. |

## What you need to do

### 1. Look at the preview, then tell me to put it live

Open the preview link above. Try these, signed in as yourself:

- **Homebrew** in the hub bar: make a race in Quick mode, then switch to Guided.
- Open "The Lantern Beneath" from My campaigns, then **Table tools** in the top strip.
- **Manage** on any campaign: Reveal stages, Preview ("View as"), Theme.
- **Head DM**, then **Store and custom site requests**.
- Sign out and look at the landing page, `/demo` and `/pricing`.
- Open "To be a god" and check it looks and behaves as it did.

When you are happy, say **"put it live"** and I will merge the branch and deploy it.

### 2. Stripe test keys (so the buy buttons work)

Until this is done the buttons say "Payments are not switched on yet" and charge nothing.

1. Go to https://dashboard.stripe.com and sign up or sign in.
2. Make sure the **Test mode** switch (top right) is on.
3. Click **Developers**, then **API keys**. Copy the **Secret key**. It starts with `sk_test_`.
4. Click **Developers**, then **Webhooks**, then **Add endpoint**.
   - Endpoint URL: `https://dungeons-by-bryce.vercel.app/api/stripe/webhook`
   - Events to send: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed`
   - Save it, then copy its **Signing secret**. It starts with `whsec_`.
5. Go to https://vercel.com, open **dungeons-by-bryce**, then **Settings**, then **Environment Variables**. Add these three (capitals do not matter):

   | Key | Value |
   |---|---|
   | `STRIPE_SECRET_KEY` | the `sk_test_` key |
   | `STRIPE_WEBHOOK_SECRET` | the `whsec_` secret |
   | `NEXT_PUBLIC_SITE_URL` | `https://dungeons-by-bryce.vercel.app` |

6. Click **Deployments**, the three dots on the newest one, then **Redeploy**.
7. In Stripe, open **Settings**, then **Billing**, then **Customer portal**, and click **Save** once so the portal is switched on.
8. Test it: on the Plans page click **Go Pro monthly**, pay with the test card `4242 4242 4242 4242`, any future date, any three digits. The Plans page should say you are on Pro within a few seconds. (Your own account already has full access, so try this with a second account.)

Do not paste the keys into a chat.

### 3. Going live with real payments (later)

This is deliberately not a setting. The code refuses any key that does not start with `sk_test_` and ignores live events. When you are ready, tell me, and I will change two lines in `src/lib/stripe.ts` and `src/app/api/stripe/webhook/route.ts`, after which you swap in the live keys the same way as above.

### 4. Legal text

`/legal` has placeholders for Terms of service and Privacy. Send me the text when you have it, or edit `src/app/(public)/legal/page.tsx`. Have a lawyer confirm the SRD approach: the attribution on that page, "fifth edition compatible" in place of the trademark, and SRD-only content.

### 5. Prices for the two higher custom-site tiers

They say "Price to be set". Tell me the prices, or edit `src/config/commissions.ts`.

### 6. The full SRD

The site ships a hand-written core set: 9 races, 12 classes, 12 subclasses, 1 background, 1 feat, 75 items, 89 spells and 34 monsters. The full SRD has about 320 spells and 320 monsters. Loading it means downloading a data file, which needs your say-so. Say **"download the SRD data"** and I will fetch it, run `scripts/import-srd.mjs`, and check the result. That script has not been run against real data yet.

### 7. Give your friends full access

Your friends had not made accounts when this was built, so there was nobody to grandfather. When each one signs up: **Head DM**, then **Accounts**, then **Give full access** next to their name.

### 8. Optional: put the demo in the store

**Head DM**, then **Store and custom site requests**, then **Publish a campaign as a product**. Choose "The Lantern Beneath", give it a title and a price (0 makes it free), tick the preview pages, set Status to Live, and click **Freeze and publish**. "To be a god" cannot be published: it contains private rules, and the form will say so.

### 9. Feedback and request emails

Custom-site requests are emailed to you through the same Resend key as feedback. Nothing more to set up.

## Where the settings are

| To change | Edit |
|---|---|
| Prices, free limits, founder seats and on/off, what each plan lists | `src/config/plans.ts`, then run `npm run sync-config` |
| Themes | `src/config/themes.ts`, then `npm run sync-config` |
| Custom-site tiers | `src/config/commissions.ts` |
| Homebrew builder fields and effect blocks | `src/config/homebrew.ts` |
| Edition converter rule tables | `src/config/editions.ts` |
| The list of table tools | `src/config/tools.ts` |
| SRD core set | `seed/srd/core.mjs`, then `npm run seed-srd` |
| The demo campaign | edit it in the site like any campaign, or `npm run seed-demo -- --reset` to rebuild it from `scripts/seed-demo.mjs` |

Environment variables the site reads: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY` (set); `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_SITE_URL` (for you to add). Optional: `FEEDBACK_TO`, `FEEDBACK_FROM`.

## How it was checked, and what was not

- 66 automated tests: `npm run build` then `npm run test:local`. They cover permissions (who can read and write what), visibility (stages, named players, hidden regions, DM-only parts, "view as", the demo), and entitlements (every free limit, downgrade, grandfathering, the store).
- A browser run-through: `node scripts/smoke-commercial.mjs` with the local site running. Screenshots are in `art/screenshots/commercial-*.jpg`.
- **Not checked against the real thing:** Stripe. Checkout, the portal and the webhooks were tested with signed test events, not with a Stripe account, because there are no keys yet. Step 2 above is the real test.
- **Not checked at all:** `scripts/import-srd.mjs` (no data to run it on), and email delivery of a custom-site request (it uses the same code path as feedback email, which works).
- The preview deployment was built and is ready, but I could not open its pages myself: Vercel puts previews behind your Vercel login.

## What I would do next

1. Run one real Stripe test checkout (step 2), then decide the go-live date.
2. Load the full SRD, and add search to the SRD browser and the spell picker.
3. Get two or three DMs who are not you to build a campaign from nothing, and watch where they get stuck. The builder and the tools are broad; the rough edges will be in the order people meet things.
4. A separate test database, before real customers arrive.
5. A sending domain for email, so the site can email people other than you (receipts, invites).
6. An inventory on the standard sheet that uses SRD and homebrew items.


---

# Follow-up: full SRD, store tiers, the free originals pack, and the commission page

Built on the `commercial-followup` branch, which sits on top of `commercial`. The live site is still the old version. 73 automated tests pass (the 66 from before, plus 7 new ones for the SRD, packs, editions, purchases and the service), and the browser run-through passes.

As before, the database changes are already in the one shared database. They are additive. One thing changed in place: the 233 hand-written SRD entries were replaced by the official ones (same ids for 213 of them; 20 were removed because the official SRD names them differently).

## Part 0: the full SRD

**Source:** the `5e-bits/5e-srd-api` project (MIT licence; SRD content only), pinned to one commit. The licence check and the caveat for your lawyer are in `docs/srd-import.md`.

| Category | SRD 5.1 (2014 rules) | SRD 5.2 (2024 rules) |
|---|---|---|
| Races / species | 9 | 9 |
| Classes | 12 | 12 |
| Subclasses | 12 | 12 |
| Backgrounds | 1 | 4 |
| Feats | 1 | 17 |
| Spells | 319 | 339 |
| Equipment, magic items and poisons | 599 | 458 |
| Monsters | 334 | 341 |
| Conditions | 15 | 15 |
| Rules reference text | 215 | 73 |
| **Total** | **1,517** | **1,280** |

- **Failed to import:** nothing.
- **Not in the source data:** the 2024 rules chapters. The 2014 chapters are in. For 2024 the reference text is conditions plus short entries for skills, damage types, weapon properties and mastery, languages, alignments, schools of magic and ability scores.
- **Name collisions with your homebrew or private entries:** none. (The import never touches homebrew or private entries; if a name ever matches, both are kept and `docs/srd-import-report.md` lists it.)
- **Entries marked `srd` that did not match the official SRD:** all 233 hand-written ones. 213 were replaced with the official wording in place. 20 were removed because the official data has them under another name: the nine subclasses I had named in full ("Path of the Berserker" is "Berserker" in SRD 5.1, and so on), nine items ("Chain mail armor" is "Chain Mail", "Light crossbow" is "Crossbow, light", and so on), "Shield, +1" and "Holy symbol". The exact lists are in `docs/srd-import-report.md`.
- **To run it again** when the SRD is updated: `node scripts/fetch-srd.mjs` then `node scripts/import-srd.mjs`. A second run changes nothing.

**Where it lives:**
- **Homebrew**, then **Browse the SRD**: both versions, every category, with search. Open an entry to read it or clone it.
- **Manage** on a campaign, then **Rules**: 2014, 2024, or both. Your existing campaigns are set to 2014, which is what they showed before. New campaigns start on 2024.
- **New campaign**: the same choice, under Character rules.
- `/legal`: the attribution for both documents.

## Part 1: Bryce's Originals (free)

**In the pack:** five races, Corrin, Sough, Ondri, Lorn and Dural.

**Left out, for you to review** (33 in all; every one is listed with its reason in `docs/originals-report.md`):
- **Seven single traits** inside those races, because the trait's own note in your campaign says it was adapted from a published book: Corrin's "Stone body" and "Reef memory"; Ondri's "Third arm"; Lorn's "Own gravity"; Dural's "Large", "Hardness" and "Under pressure". The races are in the pack without them. If you are satisfied they are yours, add them back in the homebrew builder in your own words.
- **Seven races:** Dragonborn, Human, Tortle, Aarakocra, Kenku and Hadozee (your campaign marks them as imported from published editions) and Great ape (built on Hadozee).
- **All nineteen classes.** Twelve are the published fifth edition classes (their SRD versions are already free to everyone), Artificer is from a fifth edition book outside the SRD, and Avenger, Psion, Shaman, Swordmage, Warden and Warlord are conversions from other editions.

Dural in particular is thin without its three left-out traits. That one is worth your eye first.

**Where it lives:** the **Store** (free); **Homebrew**, under "Packs you can use", with an "Add to this campaign" button; and a ticked checkbox on **New campaign**. Pack entries never count toward the free plan's three.

## Part 2: paid homebrew packs

Make a pack under **Homebrew**, then **Head DM**, **Store and custom site requests**, **Publish a homebrew pack**: title, price, pitch, and which one entry is the free preview. Buyers get it in their account and attach it to any campaign they run. A pack with a private or draft entry is refused.

## Parts 3 and 4: two editions, and what a bought campaign unlocks

**Where it lives:** **Head DM**, then **Store and custom site requests**.
- **Make a product-ready copy of a campaign:** "Generate a framework" and "Make a publishable copy". Each makes a new campaign in your account to read and edit. Neither publishes anything.
- **Publish a campaign as a product:** now has an Edition choice, and for a framework a box for its full edition's store address.

**"To be a god" has two draft listings,** framework ($7) and full ($20), linked. Nothing is frozen and nothing is for sale. To publish when the campaign is finished:
1. Click **Generate a framework** for it. Open the copy, read every tab, rename any tab whose name gives the story away, and check the "Divinity" entries it made under Homebrew (the size of the pool is a placeholder).
2. Click **Make a publishable copy** for it. This is needed because the campaign itself holds private rules and cannot go live. The copy leaves out the old character builder and the seven races from published material; buyers get the standard sheet. Read it through.
3. Publish the publishable copy as the **Full edition** at the store address of the full draft, then publish the framework copy as the **Framework edition**, giving the full edition's address.
4. Choose the preview tabs carefully: they are readable by anyone who can see the listing.

**Spoiler protection:** your players in "To be a god" will never see its listing, preview or buy button while signed in. Signed-out visitors will not see it either while the campaign has players, since a signed-out visitor could be one of them. Everyone else who is signed in will.

**What a buyer on the free plan gets** (also stated on every listing): everything delivered works and can be edited, and the campaign does not use up their one free campaign. Making new Pro-only things in it (new beats, new maps or hidden regions, more stages, blocks for named players, homebrew past their own three) shows the usual upgrade prompt.

**Prices and discount:** `src/config/store.ts` (framework $7, full $20, subscriber discount 20 percent). Each product's actual price is what you type when publishing.

## Part 5: finding the custom campaign service

**Where the page was, and why you could not reach it:** it was at `/custom`. It was linked from the navigation of the public pages (pricing, store, legal) and from one button at the very bottom of the landing page. When you are signed in, the landing page sends you straight to My campaigns, and the signed-in navigation had no link to it. So signed in, there was no route. It also is not on the live site at all yet, only on the preview.

**It is now linked, as "Have Bryce build it", from:** the navigation signed in and signed out; every footer; its own section on the landing page; the pricing page beside the plans; a card on My campaigns; and the top of New campaign ("Build it myself" or "Have Bryce build it").

## Part 6: the three tiers

`/custom` shows Starter ($50), Full Build ($125) and Premium ($200) side by side (stacked on a phone), three example pictures, and the intake form. "Request this" opens the form with that tier selected.

**Your side:** **Head DM**, **Store and custom site requests**, **Custom campaign requests**. For each request: Accept or Decline; "Make a payment link" (copy it and send it to the client; it is marked paid by itself when they pay, or use "Mark as paid"); a status menu (requested, accepted, paid, in progress, in review, delivered); a counter for revision rounds used; notes; and "Deliver", which hands the campaign to the client and starts their Pro months.

**Config** (`src/config/commissions.ts`): the three tiers with their prices, inclusions, revision rounds and Pro months; `open` (set to `false` for "not taking requests right now"); `waitTime` (for example "Current wait: about three weeks"; empty shows nothing).

## What you need to do by hand

1. **Look at the preview** (link at the top of this file is the old one; the new one is in my last message), then say "put it live".
2. **Review `docs/originals-report.md`** and decide about the seven left-out traits.
3. **Stripe test keys** are still needed for anything paid: packs, campaigns, upgrades and commission payment links. Steps are in section 2 above. Until then, free things work and paid buttons say payments are off.
4. **A client needs an account** before you can deliver to them. The confirmation they see after requesting says so.
5. **Payment links are yours to send.** The site can only email your own address until it has a sending domain.
6. **For your lawyer:** the note in `docs/srd-import.md` about the dataset's README naming the OGL while the site relies on the CC-BY-4.0 release.
7. **The example pictures on `/custom`** show "To Kill God" as your players see it today. If you would rather show something else, replace the three files in `public/custom/` or run `node scripts/screenshots-custom.mjs` after changing what it photographs.

## Not checked against the real thing

- Stripe, as before: purchases, upgrades and commission payments were tested with signed test events, not a Stripe account.
- The request form's email to you (same code path as feedback email, which works).
- Generating a framework from "To be a god" itself. The generator is tested on a campaign built for the test; running it on the real one creates a campaign in your account, which is yours to do.
