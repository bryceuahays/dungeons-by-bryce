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
8. **Every rule that existed before is `private`,** all 435 rows of Bryce's first campaign. None is confirmed SRD wording, and seven of its classes come from other editions.
9. **Private rules can only be copied between two campaigns run by the same person.** Before, a player in Bryce's first campaign could copy its character rules into their own campaign. That is now refused.
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
23. **A new, general fifth edition sheet was built for every campaign except Bryce's first campaign.** The old builder and sheet are tied to that campaign's own rules, so they stay with it, untouched. Campaigns without that rule set get the standard sheet: pick race, class, subclass, background and feats, and everything else is worked out.
24. **Structured effects apply to the standard sheet only.** Bryce's first campaign sheets are not changed by homebrew entries.
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
36. **Reveal stages are the old "phases", renamed and opened to every campaign.** Bryce's first campaign keeps its two stages and every tag it had. A block or tab can be "only in this stage" (what existed before) or "from this stage onward" (new).
37. **A stage keeps everything tagged with it when you rename or reorder it.** If you remove a stage, blocks still tagged for it are hidden from players until you retag them. Nothing is deleted.
38. **"View as" previews any player at any stage, without editing.** A player's own private notes are the one thing it cannot show, because the DM cannot read them at all.
39. **The "newly revealed" feed is off until the DM turns it on.** The DM's reveal log always records. A stage change is announced to players as "The story has moved on", never by the stage's name, because stage names can be spoilers.
40. **Table tools sit behind one "Table tools" link in the campaign's top strip.** No tabs were added to existing campaigns, so Bryce's first campaign keeps exactly the tabs it had.
41. **The timeline banner appears only once a campaign has a beat the viewer may see.** A campaign that does not use the timeline looks as it did.
42. **"It happened" is one click.** The beat becomes visible to whoever it was planned for (the table, or one player), with the date and the session number you are on. A "who sees it" control appears on the beat straight away to change that.
43. **Players can add beats that have happened, and notes on beats they can see: for the table, or private to themselves and the DM.** They cannot plan beats, address a beat to another player, or change anyone else's.
44. **An NPC has a public part and a DM part.** Name, portrait, location, faction, status and "what the players know" are public to whoever may see that NPC. Wants, relationships, secrets and the attached stat block are stored apart and never sent to players.
45. **One fight at a time per campaign.** Players always see player characters' hit points; enemy hit points only if the DM ticks "show". When a hidden creature is acting, players are told only that "something you cannot see is acting".
46. **The DM can open either kind of sheet** (the standard one, or Bryce's first campaign's own) read-only, with a switch to edit.
47. **Hidden map regions are painted over on the server.** The player's browser never receives the covered part of the picture. Each painted copy is kept so it is made once. Pictures are shrunk to 4,096 pixels on the long side when uploaded.
48. **A pin for a story beat is a pin set to "once a story beat happens".** Place it when you plan the beat; it appears for players when you mark the beat as hit.
49. **Clues and secrets in the clue tracker are always DM-only.** What players learn is revealed through NPCs, blocks, beats and pins.
50. **Anonymous means stored without identity.** A session zero line is saved with no account id and no time. A separate counter caps each member at 20 lines per campaign without linking them to what they wrote. The form asks players not to include health or medical details.
51. **Videos play through YouTube's no-cookie player or Vimeo's player.** Nothing else can be embedded. The featured video sits above the first tab.
52. **Free campaigns get:** two stages, DM-only blocks, "view as", NPCs, initiative, session zero, video, the compendium, one map with the DM's own pins, and private player notes. **Pro adds:** more stages, anything for named players, the timeline, hidden map regions, more maps, beat-linked and player pins, and world state.
53. **The Head DM's read-only view of an unhidden campaign extends to its table tools.**

## Phases 11 to 13: themes, custom sites, the store, the public face

54. **The first theme is named "Midnight and gold", not Bryce's first campaign.** It is that campaign's look, token for token (a test checks they match). But theme names are sent to every browser, and that campaign's real title is a secret from its own players until its reveal, so the preset is named for how it looks. The campaign keeps its own stored theme and looks exactly as before.
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

# Follow-up build: full SRD, packs, editions, commissions

## Part 0: the full SRD

76. **The brief's instruction to import the SRD from an open dataset was taken as the go-ahead to download it.** The handoff had asked for exactly that say-so.
77. **Source: the `5e-bits/5e-srd-api` project, pinned to one commit.** It is the maintained home of the best-known structured SRD dataset, it holds only SRD content, and it has both the 2014 and the 2024 rules. Details and the licence check are in `docs/srd-import.md`. The data files are downloaded by a script and not stored in the repository.
78. **The dataset supplies the official wording; the import works out what each entry does to a sheet.** For the 2014 races and classes, the hand-written core set is used as the guide for those mechanics, so sheets behave as before with the official text.
79. **Subraces are folded into their race** (hill dwarf into Dwarf, and so on), and the 2024 lineages, legacies and ancestries are listed as traits to choose from. The sheet has no separate subrace choice.
80. **New campaigns start on the 2024 rules; every existing campaign is set to the 2014 rules**, which is what it showed before. The DM can switch to 2014, 2024 or both on the Manage page at any time. Characters keep what they chose.
81. **Conditions and rules text are two new kinds of SRD entry.** They can be read and searched but not cloned, because the homebrew builder has nine kinds and these are reference text.
82. **The 2024 data has no rules chapters yet.** The 2014 chapters are imported; for 2024 the reference text is the short entries (skills, damage types, weapon properties and mastery, languages, alignments, schools, ability scores) and conditions.
83. **The sheet no longer receives the long text of every spell.** With 300-odd spells per version that was too much for a phone. A spell's text is fetched when it is opened.
84. **The hand-written core set was replaced by the official entries:** 213 replaced in place (same ids, so nothing that used them broke), 20 removed because the official data names them differently (for example "Path of the Berserker" is "Berserker" in SRD 5.1, and "Chain mail armor" is "Chain Mail"). The lists are in `docs/srd-import-report.md`.
85. **The SRD browser is now a searchable list by version and category** that opens one entry at a time, instead of printing every entry in full.

## Parts 1 and 2: packs

86. **What counts as "my own creation" was decided by the campaign's own labels.** A race the campaign marks "Original" is in the pack. Inside it, a single trait is left out when its own note says it was adapted from a published book (for example "3e damage reduction, rescaled"). Every class is left out: twelve are from the published fifth edition rules, one is from a fifth edition book outside the SRD, six are conversions from other editions. The full list, with reasons, is in `docs/originals-report.md`.
87. **The pack uses only what a player of that campaign can already read.** Nothing held back for a later stage is in it.
88. **Each race in the pack gives +2 and +1 to abilities of the player's choice,** as the campaign does.
89. **Official packs are attached by reference, not copied.** The entries stay yours; a DM who adds the pack sees your updates. That is why they never count toward the DM's limit. A clone is the DM's own entry and does count.
90. **"Never counts" is enforced by the database:** each entry records whether the account made it or it arrived with a purchase, and an account cannot set that label itself.
91. **A paid pack is readable only by accounts that own it** (and by players of a campaign it is attached to). The listing shows the names of everything inside and one whole entry as the preview.
92. **A pack with a private entry, or with a draft entry, cannot be published.**
93. **A free pack needs no "purchase".** Every account can use it straight away; the store button simply adds it to a campaign.

## Parts 3 and 4: editions, and what a bought campaign unlocks

94. **Parts 1 to 4 share one commit,** because packs, editions and purchase rules all live in the same store code and database rules.
95. **A framework is generated as a real campaign in your account,** for you to read and edit before publishing. The generator never publishes. Each run of same-kind blocks becomes one labelled slot; table headers are kept and the rows emptied; tabs, stage tags and DM-only flags are kept; faction entries become one blank faction; race entries and the old character sheet are dropped.
96. **Tab names and per-stage titles are yours to check.** The generator keeps tab names (they are the layout) and drops per-stage titles from a framework. If a tab name gives the story away, rename it in the copy.
97. **"Make a publishable copy" was added beside the generator.** A campaign that holds private content cannot go live. The copy is the whole campaign minus the old rule set, the old character sheet, and race entries that come from published material. This is what makes a full edition of Bryce's first campaign possible at all.
98. **The campaign's own extra rules become homebrew of your own** when a copy is generated from Bryce's first campaign: a resource and one entry per tier, attached to the copy as DM only. The resource's size is a placeholder for you to set.
99. **A draft listing can exist for a campaign that cannot be published yet.** That is how the Bryce's first campaign drafts were made: the listing rows exist (framework at $7, full at $20, linked), nothing is frozen, and nothing is for sale.
100. **An upgrade goes into the copy the buyer already has.** A slot they left as it came is filled. Anything they changed is kept, and the full edition's version is added beside it, marked DM only, for them to merge. Unused placeholder NPCs, beats and clocks are removed; the real ones arrive.
101. **The upgrade price is the full edition's price minus the framework's,** worked out on the server at checkout. The subscriber discount applies on top.
102. **The subscriber discount applies to Pro, founder and full-access accounts.**
103. **Spoiler protection has two halves.** A signed-in player of the source campaign never sees the listing, the preview or the buy button (the database hides the product from them). A signed-out visitor could be one of those players, so while the source campaign has any players its listings are hidden from signed-out visitors too. Listings made from a framework or a publishable copy are protected by the campaign they were copied from.
104. **A bought campaign now follows the rule in the brief exactly:** everything delivered works on any plan and can be edited; making new things of a Pro-only kind needs Pro. Before this, a bought campaign had been treated as fully Pro.
105. **Players in a bought campaign can still add notes and pins to what is there,** since that uses what was delivered. New story beats need the DM to be on Pro.
106. **A bought campaign keeps its theme; changing to a premium or custom theme needs Pro.**

## Parts 5 and 6: the custom campaign service

107. **Why the page could not be found:** it was at `/custom`, linked from the navigation of the public pages and from one button at the very bottom of the landing page. Signed in, the landing page sends you straight to My campaigns, whose navigation had no link, so a signed-in person had no way to reach it. And none of it is on the live site yet.
108. **The service is called "Have Bryce build it" everywhere,** and the label is one config value.
109. **Reference images are collected as links,** not uploads. An open upload box on a public page invites abuse; a pasted link to a picture or a board does the same job.
110. **The example pictures are Bryce's first campaign as its players see it today** (a throwaway player account, the current stage), captioned "From one of my own campaigns" without naming it. One picture is cropped to stop above trait notes that cite published books.
111. **The price, revision rounds and Pro months are fixed on the request when it is made,** so changing the config later does not change a request already in.
112. **The payment link is for you to send.** The site can only email your own address until it has a sending domain, so "Make a payment link" shows the link with a copy button. When the client pays, the request is marked paid by itself. You can also mark it paid by hand.
113. **Delivery is one step:** it moves the campaign to the client's account and starts their Pro months that day (added to any they already have). The client needs an account first.
114. **Pro months from a commission are a date on the account,** separate from a subscription. The Plans page says when they end.
115. **"Not taking requests" hides the form and the Request buttons** and says so at the top. The tiers stay visible.

## Project board setup

116. **The commercial build went live before the board was made.** You asked for that. `main` now holds everything, so "Done" on the board means built, tested and live, and partners branch from the real site.
117. **Status was judged from the code and the tests,** not from the docs. A feature is "Done" only if every part of its line in your list is built. Where one part is missing it is "Partly done", even when the missing part is small or is yours to decide (the invite link lands on the campaign rather than the character page; faction clocks do not advance by themselves; no class is in the free originals pack).
118. **The field is called "Work type", not "Type".** GitHub reserves the name "Type" on project boards and refused it.
119. **The "showed a player something hidden" question on the bug form is a required Yes / No / Not sure choice,** not a required tick-box. A required tick-box on a GitHub form must be ticked before the form can be sent, which would mark every bug as a leak.
120. **Issues call it "Bryce's first campaign", not by its title.** The real title is hidden from that campaign's players, and partners who play in it will read the board. The repository itself still names it throughout (and holds its DM secrets), which is a separate thing for you to decide before giving a player access.
121. **Groundwork is six issues.** Feature flags, the homebrew shared core, and four folder splits (table tools, server actions, store, character sheet), one per area where features share files today. Nothing was refactored.
122. **The homebrew builder is split into four next pieces:** lore organization, race building, class building, and items on the sheet. They are not on your list, so I gave them priority Should for you to re-sort. All four wait for the shared core.
123. **"Lore organization" is my reading of what you meant:** world lore (places, factions, gods, history, people) as a new kind of homebrew entry that can be linked, attached to a campaign and revealed in stages. Correct the issue before anyone starts it.
124. **A feature that waits on groundwork is in Backlog even when part of it exists,** following your rule that blocked work stays in Backlog until the groundwork merges.
125. **Thirteen issues come from `TODO-LATER.md`,** each with priority Could. Items in that file that are already done are ticked, not removed.
126. **Business tasks that are Must start in "Ready",** the Should one in "Backlog".
127. **Full campaign export is listed as not started, and the site currently advertises it.** The plan config marks export as a Pro feature and the pricing page lists "Export" under Pro, but there is no export yet, and your list says it should be on every plan. No code was changed in this run, so the pricing page still says it.
128. **The scripts that created the board are not in the repository.** Only the templates, `CLAUDE.md` and the docs were allowed to change.
129. **New code is proposed to live in `src/features/<area>/<feature>/`.** That folder does not exist yet; the groundwork issues create it.

## Removing Bryce's first campaign

130. **The campaign is gone from the site and the code, on your instruction.** Everything in it was first copied into a private archive on your computer, outside the repository, and checked against the database.
131. **Your five original races were not touched.** They were already homebrew entries of your own, in the free originals pack, separate from the campaign.
132. **The sheet, character builder and session run sheet that only that campaign used were removed.** Every campaign now uses the standard sheet. A session is its details and your planning notes.
133. **The old database tables stay, empty** (`rules`, `character_private`). Dropping a table is not something to do in passing; nothing in the app reads them.
134. **The tests run against a made-up dummy campaign** ("The Harvest Fair", which becomes "The Hollow Crown" at its second stage). It is in your account, it is not secret, and it is in the repository in full (`tests/fixtures/dummy-campaign.mjs`). You will see it in your campaign list.
135. **Race entries on a lore page use general headings now:** "History", "Now" and "Their part in the story", and an "Upgrade" line only when one is written.
136. **The example pictures on the custom-site page come from the public demo campaign.**
137. **The original build notes (`BRIEF.md`, `DECISIONS.md`, `REPORT.md`, `PHASE-REPORT.md`) were moved to your private archive,** because they are mostly about that campaign. The remaining documents call it "Bryce's first campaign".
138. **The option to copy another campaign's character rules when creating a campaign was removed,** since there are no such rules left to copy.
139. **The script that built the free originals pack from the campaign is gone.** The pack stays as it is and is edited by hand under Homebrew.
140. **Old versions on GitHub still contain the campaign.** You chose not to rewrite the history. Anyone who already has a copy of the repository still has it.
