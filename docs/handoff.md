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
