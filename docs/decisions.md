# Decisions: commercial build

Choices made without asking, in the order they came up. The earlier log is `DECISIONS.md` in the repo root (items 1 to 89).

## Before Phase 0

1. **Database changes go to the live database as each phase is built.** There is one Supabase project. Every change is additive (new tables and columns), so the live site keeps working on today's code. Nothing is dropped or wiped.
2. **The code stays on the `commercial` branch and is not put live.** The live site changes only when you say to merge.
3. **Tests run against a local copy of the site** talking to the real database, with throwaway accounts that are deleted afterwards. They never use your account.
4. **The SRD content is a hand-written core set, not a download.** Downloading a file needs your explicit say-so, and the brief said not to stop and ask. `scripts/import-srd.mjs` loads the full SRD from a data folder once you approve fetching it.
5. **SRD 5.1 is the edition used.** It is the one the core set was written against. Both 5.1 and 5.2 are CC-BY-4.0.
6. **"Site admin flag" is the existing Head DM role.** No second flag was added.

## Phases 0 to 2

7. **Phases 0, 1 and 2 are one commit.** They share one database change (sources, limits and plans all touch the same rules), so they were built and tested together.
8. **Every rule that existed before is `private`,** all 435 rows of "To be a god". None is confirmed SRD wording, and seven of its classes come from other editions.
9. **Private rules can only be copied between two campaigns run by the same person.** Before, a player in "To be a god" could copy its character rules into their own campaign. That is now refused.
10. **New campaigns start with the standard fifth edition sheet** (SRD plus the DM's homebrew) instead of "no character builder".
11. **"Grandfathered" means: every account that existed when this was built gets full access, and you can give full access to any account from the Head DM page.** Your friends had not made accounts yet, so there was nobody to mark. When they sign up, open Head DM, find them under Accounts, and choose "Give full access".
12. **Players in a campaign get whatever that campaign's DM has.** A feature is on or off per campaign, by the plan of the DM who owns it.
13. **On a downgrade, the DM's oldest campaign stays editable and the rest become read-only.** Everyone can still open and read them, and nothing is deleted. They unlock again on Pro.
14. **A failed payment does not cut access straight away.** The account stays on Pro while Stripe retries the card, and drops to free when Stripe gives up and cancels.
15. **Free limits are enforced by the database,** not only by the pages, so they cannot be skipped.
16. **Stripe needs no products set up in its dashboard.** Prices come from `src/config/plans.ts` and are sent with each checkout. Changing a price is a one-line change.
17. **The code refuses a live Stripe key and ignores live-mode events.** Going live is a deliberate code change, described in the handoff.
18. **Founder seats are checked when checkout starts.** If the last seats are bought at the same moment, a buyer who has already paid is still given founder access, so the count can end a seat or two over the cap rather than refusing someone who paid.
19. **Buying founder while on a Pro subscription cancels the subscription.**
20. **Invite links are `/join/CODE`.** A signed-out visitor is sent to sign up and then lands in the campaign. The old code box still works.
21. **The limit of ten campaigns per account is gone.** Free accounts get one, Pro has no limit.

## Phase 3: homebrew builder

22. **The builder is at Homebrew in the hub bar,** not inside one campaign. An entry belongs to the DM who made it and can be attached to any campaign they run.
23. **A new, general fifth edition sheet was built for every campaign except "To be a god".** The old builder and sheet are tied to that campaign's own rules, so they stay with it, untouched. Campaigns without that rule set get the standard sheet: pick race, class, subclass, background and feats, and everything else is worked out.
24. **Structured effects apply to the standard sheet only.** "To be a god" sheets are not changed by homebrew entries.
25. **Quick, Guided and Advanced edit the same data,** so switching never loses anything. Quick shows the name and description. Guided walks through steps with defaults filled in. Advanced shows every field and the raw data.
26. **The balance hint compares with the SRD entries that ship with the site.** Races, feats, backgrounds and subclasses by a points total of their effects; classes by hit die, saves, spellcasting and number of features; spells by damage against SRD spells of the same level; monsters by hit points, armor class and attack bonus against SRD creatures near the same challenge; items by bonus against rarity. It always says why, and it never blocks anything.
27. **A new version is made only when you write a change note.** A plain Save updates the current version. Players whose character uses an entry see "X was updated" with your note until they tap Got it.
28. **Attaching a pack attaches the entries that are in it at that moment.** Entries added to the pack later need attaching again.
29. **A custom resource attached to a campaign appears on every character's sheet in it** as a pool with a tracker. Classes and items can also grant a resource of their own through an effect.
30. **The converter's result starts marked Private.** The brief says to save it as a normal homebrew entry, and it is one: same table, same editor, every field editable. But it is derived from a published book, so it starts with the Private box ticked, which keeps it out of anything published to the store. Untick the box to change that.
31. **Edition names in the converter avoid the trademark:** "Original and Basic rules", "Advanced rules, 1st and 2nd edition", "3rd edition and 3.5", "4th edition".
32. **Named-player visibility on attached homebrew needs Pro,** like other per-player secrets. Everyone, DM only and from-a-stage are on every plan.
33. **Pack export is a file download made in the browser** (JSON). Import is paste-the-file. Imported entries arrive as drafts.
34. **The SRD browser shows the core set.** With the full SRD loaded later, it will need search; that is noted in TODO-LATER.md.

## Phases 4 to 10: reveals, table tools, timeline, maps, world state, session zero, video

35. **Phases 4 to 10 are one commit.** NPCs, beats, maps, regions, pins, clocks, clues, consequences, the initiative tracker and the session zero page all live in one table with one visibility rule, so they were built and tested as one piece.
36. **Reveal stages are the old "phases", renamed and opened to every campaign.** "To be a god" keeps its two stages and every tag it had. A block or tab can be "only in this stage" (what existed before) or "from this stage onward" (new).
37. **A stage keeps everything tagged with it when you rename or reorder it.** If you remove a stage, blocks still tagged for it are hidden from players until you retag them. Nothing is deleted.
38. **"View as" previews any player at any stage, without editing.** A player's own private notes are the one thing it cannot show, because the DM cannot read them at all.
39. **The "newly revealed" feed is off until the DM turns it on.** The DM's reveal log always records. A stage change is announced to players as "The story has moved on", never by the stage's name, because stage names can be spoilers.
40. **Table tools sit behind one "Table tools" link in the campaign's top strip.** No tabs were added to existing campaigns, so "To be a god" keeps exactly the tabs it had.
41. **The timeline banner appears only once a campaign has a beat the viewer may see.** A campaign that does not use the timeline looks as it did.
42. **"It happened" is one click.** The beat becomes visible to whoever it was planned for (the table, or one player), with the date and the session number you are on. A "who sees it" control appears on the beat straight away to change that.
43. **Players can add beats that have happened, and notes on beats they can see: for the table, or private to themselves and the DM.** They cannot plan beats, address a beat to another player, or change anyone else's.
44. **An NPC has a public part and a DM part.** Name, portrait, location, faction, status and "what the players know" are public to whoever may see that NPC. Wants, relationships, secrets and the attached stat block are stored apart and never sent to players.
45. **One fight at a time per campaign.** Players always see player characters' hit points; enemy hit points only if the DM ticks "show". When a hidden creature is acting, players are told only that "something you cannot see is acting".
46. **The DM can open either kind of sheet** (the standard one, or "To be a god"'s own) read-only, with a switch to edit.
47. **Hidden map regions are painted over on the server.** The player's browser never receives the covered part of the picture. Each painted copy is kept so it is made once. Pictures are shrunk to 4,096 pixels on the long side when uploaded.
48. **A pin for a story beat is a pin set to "once a story beat happens".** Place it when you plan the beat; it appears for players when you mark the beat as hit.
49. **Clues and secrets in the clue tracker are always DM-only.** What players learn is revealed through NPCs, blocks, beats and pins.
50. **Anonymous means stored without identity.** A session zero line is saved with no account id and no time. A separate counter caps each member at 20 lines per campaign without linking them to what they wrote. The form asks players not to include health or medical details.
51. **Videos play through YouTube's no-cookie player or Vimeo's player.** Nothing else can be embedded. The featured video sits above the first tab.
52. **Free campaigns get:** two stages, DM-only blocks, "view as", NPCs, initiative, session zero, video, the compendium, one map with the DM's own pins, and private player notes. **Pro adds:** more stages, anything for named players, the timeline, hidden map regions, more maps, beat-linked and player pins, and world state.
53. **The Head DM's read-only view of an unhidden campaign extends to its table tools.**

## Phases 11 to 13: themes, custom sites, the store, the public face

54. **The first theme is named "Midnight and gold", not "To be a god".** It is that campaign's look, token for token (a test checks they match). But theme names are sent to every browser, and that campaign's real title is a secret from its own players until its reveal, so the preset is named for how it looks. The campaign keeps its own stored theme and looks exactly as before.
55. **Four default themes on every plan** (Slate and sea-glass, Ember and ash, Deep grove, Vellum) and three premium ones (Midnight and gold, Abyssal, Frostbound). The theme editor adds your own colours, fonts, corner style, page width, starfield and a hero image.
56. **A free account that creates a campaign with a custom look gets the default theme instead of an error.** Changing an existing campaign to a premium or custom theme on the free plan is refused. A campaign's current theme is never changed or locked by a downgrade.
57. **The raw theme box on the Manage page is gone.** The theme editor replaces it.
58. **Custom-site requests are saved and emailed to you** through the same mail service as feedback. The form has a hidden field that only scripts fill in, and a daily cap (3 per email address, 60 in all).
59. **Handing a campaign to a client makes them its owner and removes your access.** The client needs an account first (free is fine). A handed-over campaign does not count toward their free plan's one campaign and stays editable on any plan, like a bought one.
60. **A product is a frozen copy.** It is taken when you publish. Later changes to your campaign do not reach buyers until you publish again under the same store address.
61. **Publishing resets play state.** Beats marked as hit go back to planned, the session counter goes back to zero, and players' own additions (their beats, notes and pins) are left out. The reveal log, the initiative tracker and the consequence log are not part of a product.
62. **Blocks and entries that were for named players are delivered as DM-only,** because the buyer's players are different people.
63. **A bought campaign does not count toward the free plan's one campaign, is editable on any plan, and has every tool it was built with** (timeline, hidden map regions, and so on), even for a buyer on the free plan. Otherwise a free buyer could not run what they bought.
64. **Buyers get their own copies of the campaign's homebrew,** attached to their copy and fully editable. Private entries can never be in a product, because a campaign with private content cannot be published.
65. **A product priced at $0 is delivered straight away** with no payment step. Paid products go through Stripe Checkout (test mode) and are delivered when Stripe confirms the payment, once.
66. **Only the site admin can publish.** The products table has a seller and a "site cut" column so other creators can sell later. Nothing on the creator side is built.
67. **The demo is a real campaign in your account, flagged as the demo.** Signed-out visitors read it through the database's own rules for a guest: exactly the rows a player gets, of that one campaign, and nothing else. It appears in "Campaigns you run" so you can edit it like any other.
68. **The demo is an original short campaign, "The Lantern Beneath",** written for this site with a map drawn in code. It contains nothing private, so it can also be your first store product.
69. **The demo's tabs include the table tools** (NPCs, Timeline, Maps, World state, Session zero) so a visitor finds them without hunting. They are read-only.
70. **Search engines may index the public pages only:** landing, demo, pricing, store, custom sites, legal. Everything signed-in stays unindexed.
71. **The share image is drawn in code** (a glowing doorway and the tagline), so no artwork is borrowed.
72. **The landing page's second button is "See the demo"** and the third is "Sign in". "Join a campaign" is gone from it, because invite links now carry new players straight in.

## Things found and fixed along the way

73. **Deleting a campaign that had map pins linked to story beats was being blocked** by a check added in this build. Fixed, with a test. The test clean-up now fails loudly if it ever leaves a test account behind.
74. **Two form fields had a pattern that newer browsers reject** (the campaign address box). Fixed.
75. **A new character on the standard sheet started at 0 hit points.** It now starts at full.
