# Board setup

The roadmap board: **https://github.com/users/bryceuahays/projects/1**

This file has two halves. "How we work" is for everyone on the team and fits on one page. The rest is the survey the board was built from: what is already built, which files people will collide in, and how the code should be split so that they do not.

## How we work

**Where things are.** Every planned feature, every bug and every business task is on the board above. Features and bugs are issues in this repository; business tasks are notes on the board.

**Status** (the columns on the board):

| Status | Meaning |
|---|---|
| Backlog | Not ready to start: low priority, or waiting on something listed under "Blocked by". |
| Ready | Can be picked up now. |
| In progress | Someone is building it, or part of it already exists and the rest is listed. |
| In testing | Built. Being tested on phones, as a DM and as a player. |
| Done | Merged, tested and live. |

**Priority:** *Must* means launch does not happen without it. *Should* is important, but launch can happen without it. *Could* is nice to have. *Won't* means not this release; it is on the board so it is not forgotten.

**Area** says which part of the site it belongs to: Homebrew, Secrets and reveals, Table tools, Timeline and maps, Plans and payments, Storefront, Public pages, Themes, or Other. **Work type** is Feature, Bug or Business.

**Filing a bug.** On GitHub open **Issues**, click **New issue**, choose **Bug report**, and fill in every box. One bug per report. Answer the question "This bug showed a player something that should have been hidden" honestly: a "Yes" is a launch blocker and is looked at before anything else. If it only happens on a phone, add the `phone` label.

**The rules**

1. **One branch per issue,** named `feature/<issue-number>-short-name`. Nobody pushes to the main branch. Only Bryce merges to it.
2. **Merge small and often.** Pull the main branch into your branch every day you work. Aim for branches that live days, not weeks.
3. **Unfinished work merges behind a feature flag.** We do not keep features on separate branches for weeks and join them at the end. (Flags are issue #1; until it merges, keep pull requests to finished pieces.)
4. **Each feature owns its own folder.** To change a shared file (the table below), ask its owner, or open a small separate pull request for just that change.
5. **One database migration open at a time.** Announce it on the issue before you write it. There is one live database and no test copy.
6. **Comment on your issue when you start,** saying which files you expect to touch. Each issue's "Touches" section lists what it should need.

Players must never be able to see anything hidden from them. Every pull request is checked for that, whatever else it does.

---

## What is already built

Judged from the code and the automated tests on the main branch on 6 October 2026, not only from the docs. "Done" means built, tested and live on the site. Bryce's own first campaign is called "Bryce's first campaign" throughout the board, because its real title is hidden from its players.

**Groundwork**

| Feature | Issue | Status | Evidence |
|---|---|---|---|
| Feature flags | [#1](https://github.com/bryceuahays/dungeons-by-bryce/issues/1) | Not started | Nothing environment-aware in `src/config/` or `src/lib/entitlements.ts` |
| Homebrew builder shared core | [#2](https://github.com/bryceuahays/dungeons-by-bryce/issues/2) | Partly done | `src/components/EntityEditor.tsx`, `src/config/homebrew.ts`, `src/lib/rules/engine.ts`, `src/app/(hub)/homebrew/actions.ts`, `tests/homebrew.test.mjs` |
| Per-feature folder split: table tools | [#3](https://github.com/bryceuahays/dungeons-by-bryce/issues/3) | Not started | `src/components/tools/Simple.tsx` (288 lines, six tools), `src/app/c/[slug]/tools/[tool]/page.tsx` |
| Per-feature folder split: server actions | [#4](https://github.com/bryceuahays/dungeons-by-bryce/issues/4) | Not started | `src/app/c/[slug]/actions.ts` (453 lines), `src/app/(hub)/actions.ts` (252 lines) |
| Per-feature folder split: store | [#5](https://github.com/bryceuahays/dungeons-by-bryce/issues/5) | Not started | `src/lib/store.ts` (440 lines) |
| Per-feature folder split: character sheet | [#6](https://github.com/bryceuahays/dungeons-by-bryce/issues/6) | Not started | `src/components/Sheet5e.tsx` (232 long lines, eight sections) |

**Must**

| Feature | Issue | Status | Evidence |
|---|---|---|---|
| Plans and entitlements | [#7](https://github.com/bryceuahays/dungeons-by-bryce/issues/7) | Done | `src/config/plans.ts`, `src/lib/entitlements.ts`, `supabase/migrations/20261007000001_commercial_core.sql`, `scripts/sync-config.mjs`, `tests/commercial.test.mjs` |
| Stripe checkout in test mode | [#8](https://github.com/bryceuahays/dungeons-by-bryce/issues/8) | Partly done | `src/lib/stripe.ts`, `src/app/api/stripe/webhook/route.ts`, `src/app/(hub)/billing-actions.ts`, `src/components/BillingButtons.tsx`, Vercel has no `STRIPE_*` settings yet |
| SRD import | [#9](https://github.com/bryceuahays/dungeons-by-bryce/issues/9) | Done | `scripts/fetch-srd.mjs`, `scripts/import-srd.mjs`, `src/config/rules.ts`, `src/app/(public)/legal/page.tsx`, `docs/srd-import.md`, `docs/srd-import-report.md`, `tests/followup.test.mjs` |
| Source tagging and private-content guard | [#10](https://github.com/bryceuahays/dungeons-by-bryce/issues/10) | Done | `supabase/migrations/20261007000001_commercial_core.sql`, `supabase/migrations/20261008000001_private_rules_owner_only.sql`, `src/lib/store.ts`, `tests/commercial.test.mjs`, `tests/store.test.mjs` |
| Reveal stages and stage variants | [#11](https://github.com/bryceuahays/dungeons-by-bryce/issues/11) | Done | `supabase/migrations/20261004000001_phase_gating.sql`, `supabase/migrations/20261007000001_commercial_core.sql`, `src/components/DmForms.tsx` (StagesForm), `src/lib/campaign.ts`, `tests/done.test.mjs`, `tests/tools.test.mjs` |
| Block-level visibility and per-player secrets | [#12](https://github.com/bryceuahays/dungeons-by-bryce/issues/12) | Done | `supabase/migrations/20261007000002_entries_visibility.sql`, `src/components/VisPicker.tsx`, `src/lib/entry-types.ts`, `src/components/tools/Simple.tsx` (secrets and notes), `tests/tools.test.mjs` |
| "View as" switcher and reveal log | [#13](https://github.com/bryceuahays/dungeons-by-bryce/issues/13) | Done | `src/lib/campaign.ts` (viewAs), `src/lib/entry-types.ts` (entryOpen), `src/components/CampaignChrome.tsx`, `src/components/tools/Simple.tsx` (reveal log), `tests/tools.test.mjs` |
| Homebrew builder core | [#14](https://github.com/bryceuahays/dungeons-by-bryce/issues/14) | Done | `src/app/(hub)/homebrew/`, `src/components/EntityEditor.tsx`, `src/components/EntityCard.tsx`, `src/config/homebrew.ts`, `src/lib/rules/engine.ts`, `tests/homebrew.test.mjs` |
| Player onboarding by invite link | [#15](https://github.com/bryceuahays/dungeons-by-bryce/issues/15) | Partly done | `src/app/join/[code]/page.tsx` (redirects to `/c/<campaign>`), `src/app/(auth)/`, `tests/commercial.test.mjs`, `tests/done.test.mjs` |
| Landing page | [#16](https://github.com/bryceuahays/dungeons-by-bryce/issues/16) | Done | `src/app/page.tsx`, `src/app/landing.css`, `tests/business.test.mjs` |
| Pricing page | [#17](https://github.com/bryceuahays/dungeons-by-bryce/issues/17) | Done | `src/app/(public)/pricing/page.tsx`, `src/components/PlanCards.tsx`, `src/config/plans.ts`, `tests/business.test.mjs` |
| Public demo campaign | [#18](https://github.com/bryceuahays/dungeons-by-bryce/issues/18) | Done | `src/app/demo/`, `src/lib/demo.ts`, `scripts/seed-demo.mjs`, `supabase/migrations/20261009000001_themes_store_demo.sql`, `tests/business.test.mjs` |

**Should**

| Feature | Issue | Status | Evidence |
|---|---|---|---|
| NPC tracker | [#19](https://github.com/bryceuahays/dungeons-by-bryce/issues/19) | Done | `src/components/tools/Npcs.tsx`, `src/lib/entries.ts`, `tests/tools.test.mjs` |
| DM access to player sheets | [#20](https://github.com/bryceuahays/dungeons-by-bryce/issues/20) | Done | `src/components/SheetAccess.tsx`, `src/components/Sheet5e.tsx`, `tests/tools.test.mjs` |
| Initiative tracker | [#21](https://github.com/bryceuahays/dungeons-by-bryce/issues/21) | Done | `src/components/tools/Initiative.tsx`, `tests/tools.test.mjs` |
| Story timeline with key beats | [#22](https://github.com/bryceuahays/dungeons-by-bryce/issues/22) | Done | `src/components/tools/Timeline.tsx`, `src/components/TimelineBanner.tsx`, `tests/tools.test.mjs` |
| Maps: upload, hidden regions, staged reveals | [#23](https://github.com/bryceuahays/dungeons-by-bryce/issues/23) | Done | `src/components/tools/Maps.tsx`, `src/lib/map-image.ts`, `src/app/c/[slug]/map/[id]/route.ts`, `tests/tools.test.mjs` |
| Maps: pins | [#24](https://github.com/bryceuahays/dungeons-by-bryce/issues/24) | Done | `src/components/tools/Maps.tsx`, `supabase/migrations/20261007000002_entries_visibility.sql`, `tests/tools.test.mjs` |
| Storefront for my original campaigns | [#25](https://github.com/bryceuahays/dungeons-by-bryce/issues/25) | Partly done | `src/lib/store.ts`, `src/lib/store-price.ts`, `src/app/(public)/store/`, `src/app/admin/store/`, `scripts/seed-tbg-listing.mjs`, `tests/store.test.mjs`, `tests/business.test.mjs` |
| Custom campaign site commissions | [#26](https://github.com/bryceuahays/dungeons-by-bryce/issues/26) | Done | `src/app/(public)/custom/`, `src/config/commissions.ts`, `src/components/CommissionForm.tsx`, `src/app/(hub)/admin/business/page.tsx`, `tests/store.test.mjs` |
| Theme system and default themes | [#27](https://github.com/bryceuahays/dungeons-by-bryce/issues/27) | Done | `src/config/themes.ts`, `src/lib/theme.ts`, `src/lib/theme-style.ts`, `tests/business.test.mjs` |
| Homebrew version diffs | [#28](https://github.com/bryceuahays/dungeons-by-bryce/issues/28) | Partly done | `src/components/Sheet5e.tsx` (the "was updated" notice), `src/app/(hub)/homebrew/[id]/page.tsx`, `src/app/(hub)/homebrew/actions.ts`, `tests/homebrew.test.mjs` |
| Homebrew packs and free original content | [#29](https://github.com/bryceuahays/dungeons-by-bryce/issues/29) | Partly done | `src/app/(hub)/homebrew/packs/`, `src/components/BrewForms.tsx`, `scripts/seed-originals.mjs`, `docs/originals-report.md`, `supabase/migrations/20261011000001_srd_packs_editions_commissions.sql`, `tests/store.test.mjs` |
| "Made with" footer | [#30](https://github.com/bryceuahays/dungeons-by-bryce/issues/30) | Done | `src/app/c/[slug]/layout.tsx`, `src/config/plans.ts` |
| SEO metadata and share images | [#31](https://github.com/bryceuahays/dungeons-by-bryce/issues/31) | Done | `src/app/opengraph-image.tsx`, `src/app/(public)/*/opengraph-image.tsx`, `src/app/sitemap.ts`, `src/app/robots.ts`, `tests/business.test.mjs` |

**Could**

| Feature | Issue | Status | Evidence |
|---|---|---|---|
| Consequence tracker | [#32](https://github.com/bryceuahays/dungeons-by-bryce/issues/32) | Done | `src/components/tools/Simple.tsx` (WorldTool), `src/components/HomeExtras.tsx`, `tests/tools.test.mjs` |
| Clue tracker | [#33](https://github.com/bryceuahays/dungeons-by-bryce/issues/33) | Done | `src/components/tools/Simple.tsx` (WorldTool), `tests/tools.test.mjs` |
| Faction clocks | [#34](https://github.com/bryceuahays/dungeons-by-bryce/issues/34) | Partly done | `src/components/tools/Simple.tsx` (clocks: manual Advance and Back only), `tests/tools.test.mjs` |
| Theme editor for Pro DMs | [#35](https://github.com/bryceuahays/dungeons-by-bryce/issues/35) | Done | `src/components/ThemeEditor.tsx`, `src/lib/theme.ts`, `supabase/migrations/20261009000002_theme_gate_on_create.sql`, `tests/business.test.mjs` |
| Edition converter | [#36](https://github.com/bryceuahays/dungeons-by-bryce/issues/36) | Done | `src/lib/rules/convert.ts`, `src/config/editions.ts`, `src/app/(hub)/homebrew/convert/page.tsx`, `tests/homebrew.test.mjs` |
| Custom resource pools | [#37](https://github.com/bryceuahays/dungeons-by-bryce/issues/37) | Done | `src/lib/rules/engine.ts` (evalMax, resources in derive), `src/components/Sheet5e.tsx`, `src/config/homebrew.ts`, `tests/homebrew.test.mjs` |
| Video embeds | [#38](https://github.com/bryceuahays/dungeons-by-bryce/issues/38) | Done | `src/lib/video.ts`, `tests/tools.test.mjs` |
| Full campaign export | [#39](https://github.com/bryceuahays/dungeons-by-bryce/issues/39) | Not started | No export route or action exists, `src/config/plans.ts` lists `export` as Pro and names it on the pricing page |

**Won't (this release)**

| Feature | Issue | Status | Evidence |
|---|---|---|---|
| Discord bot | [#40](https://github.com/bryceuahays/dungeons-by-bryce/issues/40) | Not started (deferred) | Nothing built. |
| Paste to import | [#41](https://github.com/bryceuahays/dungeons-by-bryce/issues/41) | Not started (deferred) | Nothing built. |
| Creator marketplace | [#42](https://github.com/bryceuahays/dungeons-by-bryce/issues/42) | Not started (deferred) | Nothing built. |
| Community campaign finder | [#43](https://github.com/bryceuahays/dungeons-by-bryce/issues/43) | Not started (deferred) | Nothing built. |
| Facilitator edition for therapists | [#44](https://github.com/bryceuahays/dungeons-by-bryce/issues/44) | Not started (deferred) | Nothing built. |
| AI session prep | [#45](https://github.com/bryceuahays/dungeons-by-bryce/issues/45) | Not started (deferred) | Nothing built. |
| Importers (World Anvil, Kanka, Obsidian) | [#46](https://github.com/bryceuahays/dungeons-by-bryce/issues/46) | Not started (deferred) | Nothing built. |
| Other game systems | [#47](https://github.com/bryceuahays/dungeons-by-bryce/issues/47) | Not started (deferred) | Nothing built. |
| Map tool partnership | [#48](https://github.com/bryceuahays/dungeons-by-bryce/issues/48) | Not started (deferred) | Nothing built. |
| Session scheduling | [#49](https://github.com/bryceuahays/dungeons-by-bryce/issues/49) | Not started (deferred) | Nothing built. |
| Affiliate links | [#50](https://github.com/bryceuahays/dungeons-by-bryce/issues/50) | Not started (deferred) | Nothing built. |

**Pieces of the homebrew builder (not on the original list)**

| Feature | Issue | Status | Evidence |
|---|---|---|---|
| Homebrew: lore organization | [#51](https://github.com/bryceuahays/dungeons-by-bryce/issues/51) | Not started | No lore kind in `src/config/homebrew.ts` or in the `entities.type` check |
| Homebrew: race building | [#52](https://github.com/bryceuahays/dungeons-by-bryce/issues/52) | Partly done | `src/config/homebrew.ts` (race), `src/components/EntityEditor.tsx`, `src/lib/rules/engine.ts`, `scripts/seed-originals.mjs` |
| Homebrew: class building | [#53](https://github.com/bryceuahays/dungeons-by-bryce/issues/53) | Partly done | `src/config/homebrew.ts` (class, subclass), `src/lib/rules/engine.ts` (classTable, derive), `src/components/Sheet5e.tsx`, `tests/homebrew.test.mjs` |
| Homebrew: items and gear on the sheet | [#54](https://github.com/bryceuahays/dungeons-by-bryce/issues/54) | Partly done | `src/config/homebrew.ts` (item), `src/components/Sheet5e.tsx` (gear is a text box), `TODO-LATER.md` |

**Found in `TODO-LATER.md` (not on the original list)**

| Feature | Issue | Status | Evidence |
|---|---|---|---|
| Staging database for tests | [#55](https://github.com/bryceuahays/dungeons-by-bryce/issues/55) | Not started | `tests/helpers.mjs`, `TODO-LATER.md` |
| Own sending domain for email | [#56](https://github.com/bryceuahays/dungeons-by-bryce/issues/56) | Not started | `src/lib/mail.ts`, `TODO-LATER.md` |
| Invite players by email | [#57](https://github.com/bryceuahays/dungeons-by-bryce/issues/57) | Not started | `src/app/join/[code]/page.tsx`, `TODO-LATER.md` |
| Named-player visibility for attached homebrew and map regions | [#58](https://github.com/bryceuahays/dungeons-by-bryce/issues/58) | Not started | `supabase/migrations/20261007000002_entries_visibility.sql`, `TODO-LATER.md` |
| Homebrew effects on the legacy sheet | [#59](https://github.com/bryceuahays/dungeons-by-bryce/issues/59) | Not started | `src/lib/campaign.ts` (usesLegacySheet), `src/islands/`, `TODO-LATER.md` |
| Map region drawing tools | [#60](https://github.com/bryceuahays/dungeons-by-bryce/issues/60) | Not started | `src/components/tools/Maps.tsx`, `TODO-LATER.md` |
| Initiative: several fights and saved fights | [#61](https://github.com/bryceuahays/dungeons-by-bryce/issues/61) | Not started | `src/components/tools/Initiative.tsx`, `TODO-LATER.md` |
| Co-DM screen | [#62](https://github.com/bryceuahays/dungeons-by-bryce/issues/62) | Not started | `supabase/migrations/20261005000001_roles_ownership_feedback_backgrounds.sql`, `TODO-LATER.md` |
| Product cover upload | [#63](https://github.com/bryceuahays/dungeons-by-bryce/issues/63) | Not started | `src/app/(hub)/admin/business/page.tsx`, `TODO-LATER.md` |
| Refunds and failed deliveries | [#64](https://github.com/bryceuahays/dungeons-by-bryce/issues/64) | Not started | `src/app/api/stripe/webhook/route.ts`, `TODO-LATER.md` |
| Cookie and privacy notice | [#65](https://github.com/bryceuahays/dungeons-by-bryce/issues/65) | Not started | `TODO-LATER.md` |
| Spell search on the character sheet | [#66](https://github.com/bryceuahays/dungeons-by-bryce/issues/66) | Not started | `src/components/Sheet5e.tsx`, `src/app/(hub)/homebrew/srd/page.tsx` (has search), `TODO-LATER.md` |
| SRD 5.2 rules reference chapters | [#67](https://github.com/bryceuahays/dungeons-by-bryce/issues/67) | Not started | `docs/srd-import-report.md` |

### Built, but not on the feature list

These exist and work, and have no issue because nothing is planned for them: session zero tools (tone, lines and veils, anonymous player input), the campaign Compendium of attached homebrew, the feedback form, the Head DM's read-only "unhide" of other DMs' campaigns, uploaded hub and campaign backgrounds, and pasting a whole campaign's text into tabs and blocks.

## Where features would collide

### Shared files

A shared file is one that two or more unfinished features need to change. Each needs one owner who says yes or no to changes (a business task on the board).

| Shared file | Owner | Unfinished features that change it | Why it is shared |
|---|---|---|---|
| `src/components/EntityEditor.tsx` | _to be assigned_ | [#2](https://github.com/bryceuahays/dungeons-by-bryce/issues/2) Homebrew builder shared core<br>[#28](https://github.com/bryceuahays/dungeons-by-bryce/issues/28) Homebrew version diffs<br>[#52](https://github.com/bryceuahays/dungeons-by-bryce/issues/52) Homebrew: race building<br>[#53](https://github.com/bryceuahays/dungeons-by-bryce/issues/53) Homebrew: class building<br>[#54](https://github.com/bryceuahays/dungeons-by-bryce/issues/54) Homebrew: items and gear on the sheet | The one homebrew entry form. It draws every kind of entry (race, class, spell, item and so on) from one component, so any change to how one kind is edited lands here. |
| `src/config/homebrew.ts` | _to be assigned_ | [#2](https://github.com/bryceuahays/dungeons-by-bryce/issues/2) Homebrew builder shared core<br>[#51](https://github.com/bryceuahays/dungeons-by-bryce/issues/51) Homebrew: lore organization<br>[#52](https://github.com/bryceuahays/dungeons-by-bryce/issues/52) Homebrew: race building<br>[#53](https://github.com/bryceuahays/dungeons-by-bryce/issues/53) Homebrew: class building<br>[#54](https://github.com/bryceuahays/dungeons-by-bryce/issues/54) Homebrew: items and gear on the sheet | The list of entry kinds, each kind's fields, the effect building blocks, and the draft / playtest / live statuses. A new kind or a new field for an existing kind is added here. |
| `src/lib/rules/engine.ts` | _to be assigned_ | [#2](https://github.com/bryceuahays/dungeons-by-bryce/issues/2) Homebrew builder shared core<br>[#52](https://github.com/bryceuahays/dungeons-by-bryce/issues/52) Homebrew: race building<br>[#53](https://github.com/bryceuahays/dungeons-by-bryce/issues/53) Homebrew: class building<br>[#54](https://github.com/bryceuahays/dungeons-by-bryce/issues/54) Homebrew: items and gear on the sheet<br>[#59](https://github.com/bryceuahays/dungeons-by-bryce/issues/59) Homebrew effects on the legacy sheet | The single place where a race, class, feat or item is applied to a character (`derive`), plus the class table and the balance hint. Anything that changes what an entry does to a sheet changes this file. |
| `src/components/Sheet5e.tsx` | _to be assigned_ | [#6](https://github.com/bryceuahays/dungeons-by-bryce/issues/6) Per-feature folder split: character sheet<br>[#28](https://github.com/bryceuahays/dungeons-by-bryce/issues/28) Homebrew version diffs<br>[#53](https://github.com/bryceuahays/dungeons-by-bryce/issues/53) Homebrew: class building<br>[#54](https://github.com/bryceuahays/dungeons-by-bryce/issues/54) Homebrew: items and gear on the sheet<br>[#66](https://github.com/bryceuahays/dungeons-by-bryce/issues/66) Spell search on the character sheet | The standard character sheet, one component. Anything new a player sees or picks on their sheet is added here. |
| `src/app/(hub)/homebrew/actions.ts` | _to be assigned_ | [#2](https://github.com/bryceuahays/dungeons-by-bryce/issues/2) Homebrew builder shared core<br>[#51](https://github.com/bryceuahays/dungeons-by-bryce/issues/51) Homebrew: lore organization<br>[#58](https://github.com/bryceuahays/dungeons-by-bryce/issues/58) Named-player visibility for attached homebrew and map regions | Save, clone, attach, version and pack actions for every kind of homebrew entry. |
| `src/config/plans.ts` and `src/lib/entitlements.ts` (plus the database copy, `npm run sync-config`) | _to be assigned_ | [#39](https://github.com/bryceuahays/dungeons-by-bryce/issues/39) Full campaign export<br>[#51](https://github.com/bryceuahays/dungeons-by-bryce/issues/51) Homebrew: lore organization | The entitlement layer. Any new limit, any new Pro-only feature, and any change to what a plan includes goes through these. |
| `src/lib/campaign.ts` | _to be assigned_ | [#39](https://github.com/bryceuahays/dungeons-by-bryce/issues/39) Full campaign export<br>[#51](https://github.com/bryceuahays/dungeons-by-bryce/issues/51) Homebrew: lore organization<br>[#58](https://github.com/bryceuahays/dungeons-by-bryce/issues/58) Named-player visibility for attached homebrew and map regions | The only place campaign content is read. It applies the viewer's role, reveal stage and "view as". Anything new that players can see in a campaign is read through it. |
| `src/lib/entry-types.ts` and the SQL function `entry_open()` | _to be assigned_ | [#58](https://github.com/bryceuahays/dungeons-by-bryce/issues/58) Named-player visibility for attached homebrew and map regions<br>[#61](https://github.com/bryceuahays/dungeons-by-bryce/issues/61) Initiative: several fights and saved fights | The visibility rule for every table tool, written twice (database and "view as" preview) and kept in step. A new way to show or hide something changes both. |
| `src/app/c/[slug]/actions.ts` | _to be assigned_ | [#4](https://github.com/bryceuahays/dungeons-by-bryce/issues/4) Per-feature folder split: server actions<br>[#62](https://github.com/bryceuahays/dungeons-by-bryce/issues/62) Co-DM screen | Every server action a DM can take inside a campaign, in one 450-line file. |
| `src/app/(hub)/actions.ts` | _to be assigned_ | [#4](https://github.com/bryceuahays/dungeons-by-bryce/issues/4) Per-feature folder split: server actions<br>[#57](https://github.com/bryceuahays/dungeons-by-bryce/issues/57) Invite players by email | Server actions for the hub: campaigns, invites, feedback, admin, commissions and transfers, in one file. |
| `src/components/tools/Simple.tsx` and `src/app/c/[slug]/tools/[tool]/page.tsx` | _to be assigned_ | [#3](https://github.com/bryceuahays/dungeons-by-bryce/issues/3) Per-feature folder split: table tools<br>[#34](https://github.com/bryceuahays/dungeons-by-bryce/issues/34) Faction clocks | World state (consequences, clues and clocks), session zero, secrets and notes, and the reveal log all live in the one component file; the page file is one long switch over every tool. |
| Navigation: `src/app/(hub)/layout.tsx`, `src/app/(public)/layout.tsx`, `src/components/CampaignChrome.tsx`, `src/config/tools.ts` | _to be assigned_ | [#39](https://github.com/bryceuahays/dungeons-by-bryce/issues/39) Full campaign export<br>[#51](https://github.com/bryceuahays/dungeons-by-bryce/issues/51) Homebrew: lore organization<br>[#65](https://github.com/bryceuahays/dungeons-by-bryce/issues/65) Cookie and privacy notice | Any feature that adds a page, a tab or a tool adds a link here. |
| `supabase/migrations/` (the database schema) | _to be assigned_ | [#51](https://github.com/bryceuahays/dungeons-by-bryce/issues/51) Homebrew: lore organization<br>[#55](https://github.com/bryceuahays/dungeons-by-bryce/issues/55) Staging database for tests<br>[#57](https://github.com/bryceuahays/dungeons-by-bryce/issues/57) Invite players by email | There is one live database and no staging copy. Migrations run in file-name order, so two open at once can collide or break the live site. |
| `src/lib/store.ts` | _to be assigned_ | [#5](https://github.com/bryceuahays/dungeons-by-bryce/issues/5) Per-feature folder split: store<br>[#25](https://github.com/bryceuahays/dungeons-by-bryce/issues/25) Storefront for my original campaigns<br>[#63](https://github.com/bryceuahays/dungeons-by-bryce/issues/63) Product cover upload<br>[#64](https://github.com/bryceuahays/dungeons-by-bryce/issues/64) Refunds and failed deliveries | Publish, freeze, deliver, upgrade and "generate a framework" for store products, in one 440-line file. |
| Stylesheets: `src/app/globals.css`, `src/styles/tools.css`, `src/styles/campaign.css` | _to be assigned_ | [#3](https://github.com/bryceuahays/dungeons-by-bryce/issues/3) Per-feature folder split: table tools<br>[#6](https://github.com/bryceuahays/dungeons-by-bryce/issues/6) Per-feature folder split: character sheet<br>[#60](https://github.com/bryceuahays/dungeons-by-bryce/issues/60) Map region drawing tools | Plain CSS shared by every screen. Any feature with new screens adds rules here. |

Two more things every feature shares, which need care rather than an owner: the test helpers (`tests/helpers.mjs`, which create and remove throwaway accounts on the live database), and `CLAUDE.md`.

### What each unfinished feature touches

| Feature | Issue | Folders it owns | Shared files it changes | Migration | Waits for |
|---|---|---|---|---|---|
| Feature flags | [#1](https://github.com/bryceuahays/dungeons-by-bryce/issues/1) | `src/config/flags.ts` (new), `src/lib/flags.ts` (new), `tests/flags.test.mjs` (new) | None | No | Nothing |
| Homebrew builder shared core | [#2](https://github.com/bryceuahays/dungeons-by-bryce/issues/2) | `src/features/homebrew/core/` (new), `docs/homebrew-core.md` (new) | `src/components/EntityEditor.tsx`<br>`src/config/homebrew.ts`<br>`src/lib/rules/engine.ts`<br>`src/app/(hub)/homebrew/actions.ts` | No | Nothing |
| Per-feature folder split: table tools | [#3](https://github.com/bryceuahays/dungeons-by-bryce/issues/3) | `src/features/tools/` (new) | `src/components/tools/Simple.tsx`<br>`src/app/globals.css` | No | Nothing |
| Per-feature folder split: server actions | [#4](https://github.com/bryceuahays/dungeons-by-bryce/issues/4) | `src/app/c/[slug]/actions/` (new), `src/app/(hub)/actions/` (new) | `src/app/c/[slug]/actions.ts`<br>`src/app/(hub)/actions.ts` | No | Nothing |
| Per-feature folder split: store | [#5](https://github.com/bryceuahays/dungeons-by-bryce/issues/5) | `src/features/store/` (new) | `src/lib/store.ts` | No | Nothing |
| Per-feature folder split: character sheet | [#6](https://github.com/bryceuahays/dungeons-by-bryce/issues/6) | `src/features/sheet/` (new) | `src/components/Sheet5e.tsx`<br>`src/app/globals.css` | No | Nothing |
| Stripe checkout in test mode | [#8](https://github.com/bryceuahays/dungeons-by-bryce/issues/8) | `src/lib/stripe.ts`, `src/app/api/stripe/webhook/`, `src/app/(hub)/billing-actions.ts` | None | No | Nothing |
| Player onboarding by invite link | [#15](https://github.com/bryceuahays/dungeons-by-bryce/issues/15) | `src/app/join/`, `src/app/(auth)/` | None | No | Nothing |
| Storefront for my original campaigns | [#25](https://github.com/bryceuahays/dungeons-by-bryce/issues/25) | `src/app/(public)/store/`, `src/app/admin/store/`, `src/config/store.ts` | `src/lib/store.ts` | No | [#8](https://github.com/bryceuahays/dungeons-by-bryce/issues/8) |
| Homebrew version diffs | [#28](https://github.com/bryceuahays/dungeons-by-bryce/issues/28) | `src/features/homebrew/diff/` (new) | `src/components/Sheet5e.tsx`<br>`src/components/EntityEditor.tsx` | No | Nothing |
| Homebrew packs and free original content | [#29](https://github.com/bryceuahays/dungeons-by-bryce/issues/29) | `scripts/seed-originals.mjs`, `docs/originals-report.md` | None | No | Nothing |
| Faction clocks | [#34](https://github.com/bryceuahays/dungeons-by-bryce/issues/34) | `src/features/tools/clocks/` (after #3) | `src/components/tools/Simple.tsx` | No | [#3](https://github.com/bryceuahays/dungeons-by-bryce/issues/3) |
| Full campaign export | [#39](https://github.com/bryceuahays/dungeons-by-bryce/issues/39) | `src/app/c/[slug]/export/` (new), `src/features/export/` (new) | `src/config/plans.ts`<br>`src/lib/campaign.ts`<br>`src/app/(hub)/layout.tsx` | No | Nothing |
| Homebrew: lore organization | [#51](https://github.com/bryceuahays/dungeons-by-bryce/issues/51) | `src/features/homebrew/lore/` (new) | `src/config/homebrew.ts`<br>`src/app/(hub)/homebrew/actions.ts`<br>`src/lib/campaign.ts`<br>`src/config/plans.ts`<br>`src/app/(hub)/layout.tsx`<br>`supabase/migrations/` (the database schema) | Yes | [#2](https://github.com/bryceuahays/dungeons-by-bryce/issues/2), [#1](https://github.com/bryceuahays/dungeons-by-bryce/issues/1) |
| Homebrew: race building | [#52](https://github.com/bryceuahays/dungeons-by-bryce/issues/52) | `src/features/homebrew/race/` (new) | `src/components/EntityEditor.tsx`<br>`src/config/homebrew.ts`<br>`src/lib/rules/engine.ts` | Probably not | [#2](https://github.com/bryceuahays/dungeons-by-bryce/issues/2), [#1](https://github.com/bryceuahays/dungeons-by-bryce/issues/1) |
| Homebrew: class building | [#53](https://github.com/bryceuahays/dungeons-by-bryce/issues/53) | `src/features/homebrew/class/` (new) | `src/components/EntityEditor.tsx`<br>`src/config/homebrew.ts`<br>`src/lib/rules/engine.ts`<br>`src/components/Sheet5e.tsx` | Maybe | [#2](https://github.com/bryceuahays/dungeons-by-bryce/issues/2), [#6](https://github.com/bryceuahays/dungeons-by-bryce/issues/6), [#1](https://github.com/bryceuahays/dungeons-by-bryce/issues/1) |
| Homebrew: items and gear on the sheet | [#54](https://github.com/bryceuahays/dungeons-by-bryce/issues/54) | `src/features/homebrew/item/` (new), `src/features/sheet/inventory/` (new) | `src/components/EntityEditor.tsx`<br>`src/config/homebrew.ts`<br>`src/lib/rules/engine.ts`<br>`src/components/Sheet5e.tsx` | Probably not | [#2](https://github.com/bryceuahays/dungeons-by-bryce/issues/2), [#6](https://github.com/bryceuahays/dungeons-by-bryce/issues/6), [#1](https://github.com/bryceuahays/dungeons-by-bryce/issues/1) |
| Staging database for tests | [#55](https://github.com/bryceuahays/dungeons-by-bryce/issues/55) | `scripts/`, `tests/helpers.mjs` | `supabase/migrations/` (the database schema) | No new migration; it applies the existing ones to a second database | Nothing |
| Own sending domain for email | [#56](https://github.com/bryceuahays/dungeons-by-bryce/issues/56) | `src/lib/mail.ts` | None | No | Nothing |
| Invite players by email | [#57](https://github.com/bryceuahays/dungeons-by-bryce/issues/57) | `src/features/invites/` (new) | `src/app/(hub)/actions.ts`<br>`supabase/migrations/` (the database schema) | Yes | [#56](https://github.com/bryceuahays/dungeons-by-bryce/issues/56) |
| Named-player visibility for attached homebrew and map regions | [#58](https://github.com/bryceuahays/dungeons-by-bryce/issues/58) | `src/components/tools/Maps.tsx`, `src/lib/map-image.ts` | `src/lib/entry-types.ts`<br>`src/app/(hub)/homebrew/actions.ts`<br>`src/lib/campaign.ts` | No | Nothing |
| Homebrew effects on the legacy sheet | [#59](https://github.com/bryceuahays/dungeons-by-bryce/issues/59) | `src/islands/`, `scripts/build-islands.mjs` | `src/lib/rules/engine.ts` | No | [#2](https://github.com/bryceuahays/dungeons-by-bryce/issues/2) |
| Map region drawing tools | [#60](https://github.com/bryceuahays/dungeons-by-bryce/issues/60) | `src/components/tools/Maps.tsx` | `src/app/globals.css` | No | Nothing |
| Initiative: several fights and saved fights | [#61](https://github.com/bryceuahays/dungeons-by-bryce/issues/61) | `src/components/tools/Initiative.tsx` | `src/lib/entry-types.ts` | Maybe | Nothing |
| Co-DM screen | [#62](https://github.com/bryceuahays/dungeons-by-bryce/issues/62) | `src/app/c/[slug]/manage/` | `src/app/c/[slug]/actions.ts` | Probably not | Nothing |
| Product cover upload | [#63](https://github.com/bryceuahays/dungeons-by-bryce/issues/63) | `src/app/admin/store/`, `src/app/(hub)/admin/business/` | `src/lib/store.ts` | No | Nothing |
| Refunds and failed deliveries | [#64](https://github.com/bryceuahays/dungeons-by-bryce/issues/64) | `src/app/(hub)/admin/business/` | `src/lib/store.ts` | Maybe | [#8](https://github.com/bryceuahays/dungeons-by-bryce/issues/8) |
| Cookie and privacy notice | [#65](https://github.com/bryceuahays/dungeons-by-bryce/issues/65) | `src/app/(public)/` | `src/app/(hub)/layout.tsx` | No | Nothing |
| Spell search on the character sheet | [#66](https://github.com/bryceuahays/dungeons-by-bryce/issues/66) | `src/features/sheet/spells/` (after #6) | `src/components/Sheet5e.tsx` | No | [#6](https://github.com/bryceuahays/dungeons-by-bryce/issues/6) |
| SRD 5.2 rules reference chapters | [#67](https://github.com/bryceuahays/dungeons-by-bryce/issues/67) | `scripts/import-srd.mjs`, `docs/srd-import.md` | None | No | Nothing |

### What can be built at the same time

**Groundwork: start these first.** Each one changes a different set of shared files, so all of them can be worked on at once by different people.

- [#1](https://github.com/bryceuahays/dungeons-by-bryce/issues/1) Feature flags
- [#2](https://github.com/bryceuahays/dungeons-by-bryce/issues/2) Homebrew builder shared core
- [#3](https://github.com/bryceuahays/dungeons-by-bryce/issues/3) Per-feature folder split: table tools
- [#4](https://github.com/bryceuahays/dungeons-by-bryce/issues/4) Per-feature folder split: server actions
- [#5](https://github.com/bryceuahays/dungeons-by-bryce/issues/5) Per-feature folder split: store
- [#6](https://github.com/bryceuahays/dungeons-by-bryce/issues/6) Per-feature folder split: character sheet

**Touches no shared file: can run alongside anything today.**

- [#8](https://github.com/bryceuahays/dungeons-by-bryce/issues/8) Stripe checkout in test mode
- [#15](https://github.com/bryceuahays/dungeons-by-bryce/issues/15) Player onboarding by invite link
- [#29](https://github.com/bryceuahays/dungeons-by-bryce/issues/29) Homebrew packs and free original content
- [#56](https://github.com/bryceuahays/dungeons-by-bryce/issues/56) Own sending domain for email
- [#67](https://github.com/bryceuahays/dungeons-by-bryce/issues/67) SRD 5.2 rules reference chapters

**Can start today, but changes a shared file.** Only one of these per shared file at a time, and after the folder split for that file where there is one (see the table above).

- [#28](https://github.com/bryceuahays/dungeons-by-bryce/issues/28) Homebrew version diffs
- [#39](https://github.com/bryceuahays/dungeons-by-bryce/issues/39) Full campaign export
- [#55](https://github.com/bryceuahays/dungeons-by-bryce/issues/55) Staging database for tests
- [#58](https://github.com/bryceuahays/dungeons-by-bryce/issues/58) Named-player visibility for attached homebrew and map regions
- [#60](https://github.com/bryceuahays/dungeons-by-bryce/issues/60) Map region drawing tools
- [#61](https://github.com/bryceuahays/dungeons-by-bryce/issues/61) Initiative: several fights and saved fights
- [#62](https://github.com/bryceuahays/dungeons-by-bryce/issues/62) Co-DM screen
- [#63](https://github.com/bryceuahays/dungeons-by-bryce/issues/63) Product cover upload
- [#65](https://github.com/bryceuahays/dungeons-by-bryce/issues/65) Cookie and privacy notice

The overlaps to watch: "Homebrew version diffs" changes the entry form and the sheet, so it is best built after the shared core and the character sheet split. The co-DM screen changes the campaign actions file, so it goes after the server actions split. Product cover upload changes the store file, so it goes after the store split.

**Must wait for another issue to merge:**

- [#25](https://github.com/bryceuahays/dungeons-by-bryce/issues/25) Storefront for my original campaigns: waits for [#8](https://github.com/bryceuahays/dungeons-by-bryce/issues/8) Stripe checkout in test mode
- [#34](https://github.com/bryceuahays/dungeons-by-bryce/issues/34) Faction clocks: waits for [#3](https://github.com/bryceuahays/dungeons-by-bryce/issues/3) Per-feature folder split: table tools
- [#51](https://github.com/bryceuahays/dungeons-by-bryce/issues/51) Homebrew: lore organization: waits for [#2](https://github.com/bryceuahays/dungeons-by-bryce/issues/2) Homebrew builder shared core, [#1](https://github.com/bryceuahays/dungeons-by-bryce/issues/1) Feature flags
- [#52](https://github.com/bryceuahays/dungeons-by-bryce/issues/52) Homebrew: race building: waits for [#2](https://github.com/bryceuahays/dungeons-by-bryce/issues/2) Homebrew builder shared core, [#1](https://github.com/bryceuahays/dungeons-by-bryce/issues/1) Feature flags
- [#53](https://github.com/bryceuahays/dungeons-by-bryce/issues/53) Homebrew: class building: waits for [#2](https://github.com/bryceuahays/dungeons-by-bryce/issues/2) Homebrew builder shared core, [#6](https://github.com/bryceuahays/dungeons-by-bryce/issues/6) Per-feature folder split: character sheet, [#1](https://github.com/bryceuahays/dungeons-by-bryce/issues/1) Feature flags
- [#54](https://github.com/bryceuahays/dungeons-by-bryce/issues/54) Homebrew: items and gear on the sheet: waits for [#2](https://github.com/bryceuahays/dungeons-by-bryce/issues/2) Homebrew builder shared core, [#6](https://github.com/bryceuahays/dungeons-by-bryce/issues/6) Per-feature folder split: character sheet, [#1](https://github.com/bryceuahays/dungeons-by-bryce/issues/1) Feature flags
- [#57](https://github.com/bryceuahays/dungeons-by-bryce/issues/57) Invite players by email: waits for [#56](https://github.com/bryceuahays/dungeons-by-bryce/issues/56) Own sending domain for email
- [#59](https://github.com/bryceuahays/dungeons-by-bryce/issues/59) Homebrew effects on the legacy sheet: waits for [#2](https://github.com/bryceuahays/dungeons-by-bryce/issues/2) Homebrew builder shared core
- [#64](https://github.com/bryceuahays/dungeons-by-bryce/issues/64) Refunds and failed deliveries: waits for [#8](https://github.com/bryceuahays/dungeons-by-bryce/issues/8) Stripe checkout in test mode
- [#66](https://github.com/bryceuahays/dungeons-by-bryce/issues/66) Spell search on the character sheet: waits for [#6](https://github.com/bryceuahays/dungeons-by-bryce/issues/6) Per-feature folder split: character sheet

**Lore organization, race building and class building cannot start in parallel today.** All three would edit `src/config/homebrew.ts`; races and classes would both edit the one entry form (`src/components/EntityEditor.tsx`) and the one place entries are applied to a sheet (`src/lib/rules/engine.ts`); lore needs a database migration; and class building also changes the sheet. What has to merge first:

1. #2 Homebrew builder shared core. After it, each kind of entry lives in its own folder and plugs in.
2. #1 Feature flags, so half-built work can merge hidden instead of sitting on a branch.
3. For class building (and items) only: #6, the character sheet split.

Once those are in, lore and race building can run side by side straight away, and class building alongside them, with one condition: only one of them may have a database migration open at a time. Lore needs one for certain; class building may need one for multiclassing.

## How the code is laid out

The site is organised by kind of file (pages in `src/app`, components in `src/components`, helpers in `src/lib`, settings in `src/config`), not by feature. That was fine for one person. For several people it means features in the same area share files. Nothing has been refactored in this run. The problems, and the split proposed for each:

| Area | The problem | The split | Issue |
|---|---|---|---|
| Homebrew builder | One form component draws all nine kinds of entry; one config file lists every kind's fields; one function applies every kind to a sheet; one actions file saves them all. | A small documented core, plus one folder per kind under `src/features/homebrew/<kind>/` that plugs into it. | #2 |
| Table tools | Six tools share one component file, three of them inside one component. The tool page is one switch that loads data for every tool. | One folder per tool under `src/features/tools/<tool>/`, found through a small registry. | #3 |
| Server actions | Every DM action in a campaign is in one 450-line file; every hub action in another. Nearly every feature adds an action. | Split each file by feature, with one shared permission helper. | #4 |
| Store | Publish, freeze, deliver, upgrade and generate are one 440-line file. | Split by job under `src/features/store/`. | #5 |
| Character sheet | The standard sheet is one component with eight sections. | One file per section under `src/features/sheet/`. | #6 |

Two habits in the existing code make collisions more likely and are worth changing as files are split: lines are very long (several statements or a whole form row on one line), so two small edits to the same line conflict; and styles for every screen are in three shared stylesheets. New features should keep their styles in their own folder.

The convention proposed for new work: **`src/features/<area>/<feature>/`** holds a feature's components, actions, settings and styles. Files under `src/app` stay thin: they check who is asking, load data through `src/lib/campaign.ts` or `src/lib/entries.ts`, and hand over to the feature folder.

## Feature flags

There is no flag system yet (issue #1). The entitlement layer decides what a plan includes; it does not know whether the site is running live, as a preview, or on someone's machine. Until flags exist, only finished pieces should be merged.

## Notes on how the board was set up

- The field for Feature / Bug / Business is called **Work type**, because GitHub reserves the name "Type" on project boards.
- The bug form asks "This bug showed a player something that should have been hidden" as a required Yes / No / Not sure question. A required tick-box on a GitHub form has to be ticked before the form can be sent, which would have marked every bug as a leak.
- The scripts that created the issues are not in the repository. To change an issue, edit it on GitHub.
